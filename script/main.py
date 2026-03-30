import dht
import network
import time
import ujson
from machine import Pin, ADC
from umqtt.robust import MQTTClient
from config_proj import WIFI_SSID, WIFI_PASS, MQTT_BROKER, MQTT_USER, MQTT_PASS

PRIFIX_MQTT = f'{MQTT_USER}/MUNYIN'
CMD_TOPIC   = f'{PRIFIX_MQTT}/cmd'.encode()   # topic to listen on

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

# ── Publish ────────────────────────────────────────────────────
def publish_all(client):
    sensor.measure()
    temp  = sensor.temperature()
    humid = sensor.humidity()

    raw          = soil.read()
    moisture_pct = round((1 - raw / 4095) * 100, 1)

    client.publish(f"{PRIFIX_MQTT}/temperature".encode(),   ujson.dumps({"value": temp,         "unit": "C"}))
    client.publish(f"{PRIFIX_MQTT}/humidity".encode(),      ujson.dumps({"value": humid,        "unit": "%"}))
    client.publish(f"{PRIFIX_MQTT}/soil/raw".encode(),      ujson.dumps({"value": raw}))
    client.publish(f"{PRIFIX_MQTT}/soil/moisture".encode(), ujson.dumps({"value": moisture_pct, "unit": "%"}))
    client.publish(f"{PRIFIX_MQTT}/status".encode(), ujson.dumps({
        "temperature":   temp,
        "humidity":      humid,
        "soil_raw":      raw,
        "soil_moisture": moisture_pct
    }))

    print(f"[OK] Temp={temp}°C  Humid={humid}%  Soil={raw} ({moisture_pct}%)")
    led_blink(2)

# ── Callback — fires when a message arrives ───────────────────
def on_message(topic, msg):
    print(f"[MSG] {topic} → {msg}")
    if msg == b"1":
        print("[CMD] Triggered by command")
        publish_all(client)   # send all data immediately

# ── MQTT ───────────────────────────────────────────────────────
def connect_mqtt():
    c = MQTTClient(
        client_id="munyin_node_01",
        server=MQTT_BROKER,
        user=MQTT_USER,
        password=MQTT_PASS,
        keepalive=60          # send PING every 60s to keep connection alive
    )
    c.set_callback(on_message)
    c.connect()
    c.subscribe(CMD_TOPIC)    # subscribe after connect
    print(f"MQTT connected, listening on: {CMD_TOPIC}")
    return c

# ── Main ───────────────────────────────────────────────────────
INTERVAL = 10 * 60  # 10 minutes — auto publish regardless of command

wlan   = connect_wifi()
client = connect_mqtt()
led_green.value(1)

last_publish = 0

while True:
    try:
        if not wlan.isconnected():
            print("WiFi lost, reconnecting...")
            led_green.value(0)
            wlan   = connect_wifi()
            client = connect_mqtt()
            led_green.value(1)

        # Check for incoming MQTT messages (non-blocking)
        client.check_msg()

        # Auto-publish every 15 minutes regardless
        if time.time() - last_publish >= INTERVAL:
            publish_all(client)
            last_publish = time.time()

    except OSError as e:
        print("Error:", e)
        led_blink(5, 0.1)
        led_green.value(0)
        try:
            client = connect_mqtt()
            led_green.value(1)
        except Exception:
            pass

    time.sleep(1)   # check messages every 1 second

