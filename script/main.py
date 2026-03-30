import dht
import network
import time
import ujson
import gc
from machine import Pin, ADC, reset, WDT
from umqtt.robust import MQTTClient
from config import WIFI_SSID, WIFI_PASS, MQTT_BROKER, MQTT_USER, MQTT_PASS

PRIFIX_MQTT = f'{MQTT_USER}/MUNYIN'
CMD_TOPIC   = f'{PRIFIX_MQTT}/cmd'.encode()

# ── Hardware ───────────────────────────────────────────────────
soil = ADC(Pin(33))
soil.atten(ADC.ATTN_11DB)
soil.width(ADC.WIDTH_12BIT)

sensor = dht.DHT11(Pin(32))

led_green = Pin(12, Pin.OUT)
led_green.value(0)

# ── LED Helpers ────────────────────────────────────────────────
def led_blink(times=3, delay=0.15):
    for _ in range(times):
        led_green.value(1); time.sleep(delay)
        led_green.value(0); time.sleep(delay)

# ── Sensor Readiness ──────────────────────────────────────────
def wait_sensors_ready(max_retries=10):
    """Wait until both DHT11 and soil sensor return valid readings."""
    print("Waiting for sensors to be ready...")

    for attempt in range(1, max_retries + 1):
        dht_ok  = False
        soil_ok = False

        try:
            sensor.measure()
            t = sensor.temperature()
            h = sensor.humidity()
            if 0 <= t <= 60 and 0 <= h <= 100:
                dht_ok = True
        except Exception as e:
            print(f"  DHT11 not ready: {e}")

        try:
            raw = soil.read()
            if 0 < raw < 4095:
                soil_ok = True
        except Exception as e:
            print(f"  Soil not ready: {e}")

        if dht_ok and soil_ok:
            print(f"  Sensors ready on attempt {attempt}")
            led_blink(2, 0.1)
            return True

        print(f"  Attempt {attempt}/{max_retries}  DHT={dht_ok}  Soil={soil_ok}")
        led_blink(1, 0.3)
        time.sleep(2)

    return False

# ── WiFi ───────────────────────────────────────────────────────
def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(False); time.sleep(1)
    wlan.active(True)
    wlan.connect(WIFI_SSID, WIFI_PASS)

    print("Connecting to WiFi", end="")
    timeout = 20
    while not wlan.isconnected() and timeout > 0:
        print(".", end="")
        led_green.value(1); time.sleep(0.5)
        led_green.value(0); time.sleep(0.5)
        timeout -= 1

    if not wlan.isconnected():
        led_blink(10, 0.05)
        raise RuntimeError("WiFi failed")

    print("\nWiFi connected:", wlan.ifconfig())
    return wlan

# ── MQTT ───────────────────────────────────────────────────────
client = None

def on_message(topic, msg):
    print(f"[MSG] {topic} -> {msg}")
    if msg == b"1":
        print("[CMD] Triggered by command")
        publish_all(client)

def connect_mqtt():
    c = MQTTClient(
        client_id="munyin_node_01",
        server=MQTT_BROKER,
        user=MQTT_USER,
        password=MQTT_PASS,
        keepalive=60
    )
    c.set_callback(on_message)
    c.connect()
    c.subscribe(CMD_TOPIC)
    print("MQTT connected, listening on:", CMD_TOPIC)
    return c

# ── Publish ────────────────────────────────────────────────────
def publish_all(c):
    sensor.measure()
    temp  = sensor.temperature()
    humid = sensor.humidity()

    raw          = soil.read()
    moisture_pct = round((1 - raw / 4095) * 100, 1)

    c.publish(f"{PRIFIX_MQTT}/status".encode(), ujson.dumps({
        "temperature":   temp,
        "humidity":      humid,
        "soil_raw":      raw,
        "soil_moisture": moisture_pct
    }))

    print(f"[OK] Temp={temp}C  Humid={humid}%  Soil={raw} ({moisture_pct}%)")
    led_blink(2)

# ── Health Check ───────────────────────────────────────────────
boot_time = time.time()

def publish_health(c, wlan, total_errors):
    """Publish device health to {PRIFIX_MQTT}/health every interval."""
    dht_ok  = False
    soil_ok = False

    try:
        sensor.measure()
        t = sensor.temperature()
        h = sensor.humidity()
        if 0 <= t <= 60 and 0 <= h <= 100:
            dht_ok = True
    except Exception:
        pass

    try:
        raw = soil.read()
        if 0 < raw < 4095:
            soil_ok = True
    except Exception:
        pass

    rssi = 0
    try:
        if wlan.isconnected():
            rssi = wlan.status('rssi')
    except Exception:
        pass

    gc.collect()
    free_mem = gc.mem_free()

    health = {
        "uptime_s":    time.time() - boot_time,
        "free_mem":    free_mem,
        "rssi":        rssi,
        "wifi":        int(wlan.isconnected()),
        "dht11_ok":    int(dht_ok),
        "soil_ok":     int(soil_ok),
        "err_count":   total_errors
    }

    c.publish(f"{PRIFIX_MQTT}/health".encode(), ujson.dumps(health))
    print(f"[HEALTH] up={health['uptime_s']}s  mem={free_mem}  rssi={rssi}  dht={dht_ok}  soil={soil_ok}  err={total_errors}")

# ── Main with auto-restart ─────────────────────────────────────
def main():
    global client

    if not wait_sensors_ready():
        print("[FATAL] Sensors failed after retries — rebooting in 5s")
        time.sleep(5)
        reset()

    wlan   = connect_wifi()
    client = connect_mqtt()
    led_green.value(1)

    wdt = WDT(timeout=60000)

    INTERVAL        = 10 * 60       # 10 min auto-publish
    HEALTH_INTERVAL = 5 * 60        # 5 min health check
    last_publish    = 0
    last_health     = 0
    error_count     = 0
    total_errors    = 0
    MAX_ERRORS      = 5

    while True:
        try:
            wdt.feed()

            if not wlan.isconnected():
                print("WiFi lost, reconnecting...")
                led_green.value(0)
                wlan   = connect_wifi()
                client = connect_mqtt()
                led_green.value(1)

            client.check_msg()

            now = time.time()

            if now - last_publish >= INTERVAL:
                publish_all(client)
                last_publish = now

            if now - last_health >= HEALTH_INTERVAL:
                publish_health(client, wlan, total_errors)
                last_health = now

            error_count = 0

        except OSError as e:
            error_count  += 1
            total_errors += 1
            print(f"Error ({error_count}/{MAX_ERRORS}): {e}")
            led_blink(5, 0.1)
            led_green.value(0)

            if error_count >= MAX_ERRORS:
                print("[FATAL] Too many consecutive errors — rebooting")
                time.sleep(2)
                reset()

            try:
                client = connect_mqtt()
                led_green.value(1)
            except Exception:
                pass

        time.sleep(1)

try:
    main()
except Exception as e:
    print(f"[CRASH] {e} — rebooting in 5s")
    time.sleep(5)
    reset()
