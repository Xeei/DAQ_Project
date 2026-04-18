import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import UPlotChart from "./UPlotChart";

// ── CONFIG ──────────────────────────────────────────────────────────────────
// const API_BASE = "https://iot.cpe.ku.ac.th/red/b6710545849";
const API_BASE = "http://localhost:3000/api";
const POLL_INTERVAL = 60_000;


// ── MOCK DATA (remove when real API is ready) ────────────────────────────────
const MOCK_LATEST = {
  ts: "2026-04-06 14:40:55",
  sensor: { temperature: 28, humidity: 80, soil_moisture: 54.2, soil_raw: 1877 },
  weather: { air_temperature: 35.2, dew_point: 24.3, humidity: 53, rainfall_24hr: 0 },
  aqi: { aqi: 69, pm25: 69, pm10: 20 },
  computed: { vpd: 0.756, soil_score: 0.458, vpd_score: 0.252, rain_factor: 0.11, aqi_factor: 0.345, iui: 0.027 }
};
const MOCK_HISTORY = {
  data: Array.from({ length: 24 }, (_, i) => ({
    ts: `04-06 ${String(i).padStart(2, "0")}:00`,
    temperature: 26 + Math.random() * 8,
    humidity: 60 + Math.random() * 30,
    soil_moisture: 50 + Math.random() * 10,
    vpd: 0.2 + Math.random() * 1.8,
    iui: Math.random() * 0.6,
  }))
};

// ── THEME ─────────────────────────────────────────────────────────────────────
const T = {
  bg:        "#fdf8f2",
  bgCard:    "#fffcf8",
  bgCard2:   "#f8f1e8",
  border:    "#e8d8c8",
  borderSub: "#f0e4d4",
  textPrimary:   "#2d2018",
  textSecondary: "#7a6455",
  textMuted:     "#a89080",
  textFaint:     "#c8b4a0",
};

// ── HELPERS ──────────────────────────────────────────────────────────────────
const iuiColor = (v) => {
  if (v < 0.2) return "#3a9e60";
  if (v < 0.4) return "#6aaa20";
  if (v < 0.6) return "#c89010";
  if (v < 0.8) return "#d46820";
  return "#c83030";
};
const iuiLabel = (v) => {
  if (v < 0.2) return "No action needed";
  if (v < 0.4) return "Low urgency";
  if (v < 0.6) return "Monitor closely";
  if (v < 0.8) return "Water soon";
  return "Water now!";
};
const fmt = (v, d = 1) => (typeof v === "number" ? v.toFixed(d) : "—");
const USE_MOCK = false; // set false when API is ready

// ── GAUGE COMPONENT ──────────────────────────────────────────────────────────
function IUIGauge({ value }) {
  const angle = -135 + value * 270;
  const color = iuiColor(value);
  const r = 70, cx = 90, cy = 90;
  const toXY = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const needle = toXY(angle);

  return (
    <svg viewBox="0 0 180 120" style={{ width: "100%", maxWidth: 220 }}>
      {/* track */}
      <path
        d={`M ${toXY(-135).x} ${toXY(-135).y} A ${r} ${r} 0 1 1 ${toXY(135).x} ${toXY(135).y}`}
        stroke={T.border} strokeWidth="10" fill="none" strokeLinecap="round"
      />
      {/* colored arc */}
      {value > 0 && (
        <path
          d={`M ${toXY(-135).x} ${toXY(-135).y} A ${r} ${r} 0 ${value > 0.5 ? 1 : 0} 1 ${needle.x} ${needle.y}`}
          stroke={color} strokeWidth="10" fill="none" strokeLinecap="round"
        />
      )}
      {/* needle dot */}
      <circle cx={needle.x} cy={needle.y} r="5" fill={color} />
      <circle cx={cx} cy={cy} r="4" fill={T.textFaint} />
      {/* value text */}
      <text x={cx} y={cy + 22} textAnchor="middle" fill={color}
        style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>
        {fmt(value, 3)}
      </text>
    </svg>
  );
}

// ── METRIC CARD ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, sub, accent }) {
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.borderSub}`,
      borderRadius: 14, padding: "14px 18px",
      borderLeft: accent ? `3px solid ${accent}` : undefined,
      boxShadow: "0 1px 6px rgba(180,140,100,0.07)"
    }}>
      <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || T.textPrimary, fontFamily: "monospace" }}>
        {value}<span style={{ fontSize: 13, color: T.textMuted, marginLeft: 4 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── STATUS DOT ────────────────────────────────────────────────────────────────
function StatusDot({ ok, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textSecondary }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: ok ? "#3a9e60" : "#c83030",
        boxShadow: ok ? "0 0 6px #3a9e6080" : "0 0 6px #c8303080"
      }} />
      {label}
    </div>
  );
}


// ── FETCH FUNCTIONS ───────────────────────────────────────────────────────────
const fetchLatest = async () => {
  if (USE_MOCK) return MOCK_LATEST;
  const res = await fetch(`${API_BASE}/latest`);
  if (!res.ok) throw new Error("Failed to fetch latest");
  return res.json();
};

const fetchHistory = async (hours) => {
  if (USE_MOCK) return MOCK_HISTORY;
  const res = await fetch(`${API_BASE}/history?hours=${hours}`);
  if (!res.ok) throw new Error("Failed to fetch history");
  return res.json();
};

const fetchStatus = async () => {
  if (USE_MOCK) return { sensor: "ok", tmd: "ok", aqi: "ok" };
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
};

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
export default function MunyinDashboard() {
  const [hours, setHours] = useState(24);

  const { data: latest, dataUpdatedAt, isLoading: latestLoading } = useQuery({
    queryKey: ["latest"],
    queryFn: fetchLatest,
    staleTime: 55_000,
    gcTime: 5 * 60_000,
    refetchInterval: POLL_INTERVAL,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["history", hours],
    queryFn: () => fetchHistory(hours),
    staleTime: 55_000,
    gcTime: 10 * 60_000,
    refetchInterval: POLL_INTERVAL,
  });

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["status"],
    queryFn: fetchStatus,
    staleTime: 55_000,
    gcTime: 5 * 60_000,
    refetchInterval: POLL_INTERVAL,
  });

  const isLoading = latestLoading || historyLoading || statusLoading;

  const history = historyData?.data ?? [];
  const status = {
    sensor: statusData?.sensor === "ok",
    tmd: statusData?.tmd === "ok",
    aqi: statusData?.aqi === "ok",
  };
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const iui = latest?.computed?.iui ?? 0;
  const color = iuiColor(iui);

  const iuiYDomain = useMemo(() => [0, 1], []);
  const iuiRefLines = useMemo(() => [
    { y: 0.6, color: "#c83030" },
    { y: 0.4, color: "#c89010" },
  ], []);
  const soilYDomain = useMemo(() => [0, 100], []);
  const vpdYDomain = useMemo(() => [0, 3], []);

  if (isLoading) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMuted, fontFamily: "monospace" }}>
      initializing MUNYIN...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.textPrimary, fontFamily: "'IBM Plex Mono', monospace", padding: "28px 24px" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet" />

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, background: "#e8f5ee", color: "#3a9e60", padding: "2px 10px", borderRadius: 6, letterSpacing: 2, border: "1px solid #c0e4cc" }}>LIVE</span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: 2, color: T.textPrimary }}>MUNYIN</h1>
          </div>
          <p style={{ fontSize: 11, color: T.textMuted, margin: "5px 0 0", letterSpacing: 0.8 }}>
            Micro-Environment Unified Network for Yield Irrigation Navigation
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <StatusDot ok={status.sensor} label="Sensor" />
            <StatusDot ok={status.tmd} label="TMD" />
            <StatusDot ok={status.aqi} label="AQI" />
          </div>
          {lastUpdate && (
            <span style={{ fontSize: 10, color: T.textFaint }}>
              updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── IUI HERO ── */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 18, padding: "24px 28px", marginBottom: 20,
        display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, alignItems: "center",
        boxShadow: "0 2px 12px rgba(180,140,100,0.09)"
      }}>
        <div style={{ textAlign: "center" }}>
          <IUIGauge value={iui} />
          <div style={{ fontSize: 13, color, fontWeight: 600, marginTop: 4, letterSpacing: 0.8 }}>
            {iuiLabel(iui)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.5, marginBottom: 12, textTransform: "uppercase" }}>IUI Breakdown</div>
          {[
            { label: "Soil score", value: latest?.computed?.soil_score, bar: true },
            { label: "VPD score", value: latest?.computed?.vpd_score, bar: true },
            { label: "Rain factor", value: latest?.computed?.rain_factor, bar: true, invert: true },
            { label: "AQI factor", value: latest?.computed?.aqi_factor, bar: true },
          ].map(({ label, value, invert }) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textSecondary, marginBottom: 3 }}>
                <span>{label}</span>
                <span style={{ fontFamily: "monospace", color: T.textMuted }}>{fmt(value, 3)}</span>
              </div>
              <div style={{ background: T.bgCard2, borderRadius: 4, height: 5 }}>
                <div style={{
                  width: `${(value ?? 0) * 100}%`, height: "100%", borderRadius: 4,
                  background: invert ? "#3a9e60" : color, transition: "width 0.6s ease"
                }} />
              </div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            <div style={{ fontSize: 11, color: T.textSecondary }}>VPD
              <span style={{ display: "block", fontSize: 18, color: T.textPrimary, fontWeight: 700 }}>
                {fmt(latest?.computed?.vpd, 3)} <span style={{ fontSize: 11, fontWeight: 400 }}>kPa</span>
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.textSecondary }}>Soil moisture
              <span style={{ display: "block", fontSize: 18, color: T.textPrimary, fontWeight: 700 }}>
                {fmt(latest?.sensor?.soil_moisture, 1)} <span style={{ fontSize: 11, fontWeight: 400 }}>%</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SENSOR METRICS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Temperature" value={fmt(latest?.sensor?.temperature, 1)} unit="°C" accent="#d46820" />
        <MetricCard label="Humidity" value={fmt(latest?.sensor?.humidity, 0)} unit="%" accent="#3a8abf" />
        <MetricCard label="AQI" value={fmt(latest?.aqi?.aqi, 0)} unit="" sub={`PM2.5: ${fmt(latest?.aqi?.pm25, 0)} · PM10: ${fmt(latest?.aqi?.pm10, 0)}`} accent="#7c60c0" />
        <MetricCard label="Outdoor Temp" value={fmt(latest?.weather?.air_temperature, 1)} unit="°C" sub={`Dew: ${fmt(latest?.weather?.dew_point, 1)}°C`} accent="#c0505a" />
        <MetricCard label="Rain 24hr" value={fmt(latest?.weather?.rainfall_24hr, 1)} unit="mm" accent="#3a9e60" />
      </div>

      {/* ── CHARTS ── */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: "20px 24px", marginBottom: 20, boxShadow: "0 2px 12px rgba(180,140,100,0.09)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>IUI Trend</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[6, 24, 48, 168].map(h => (
              <button key={h} onClick={() => setHours(h)} style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 8, cursor: "pointer",
                background: hours === h ? "#e8f0fb" : "transparent",
                border: `1px solid ${hours === h ? "#9ab8e8" : T.border}`,
                color: hours === h ? "#3a5fa0" : T.textSecondary,
                fontFamily: "inherit"
              }}>
                {h < 48 ? `${h}h` : h === 168 ? "7d" : `${h}h`}
              </button>
            ))}
          </div>
        </div>
        <UPlotChart
          data={history}
          valueKey="iui"
          height={180}
          color={color}
          yDomain={iuiYDomain}
          fill={true}
          refLines={iuiRefLines}
        />
      </div>

      {/* ── SENSOR CHARTS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: "16px 20px", boxShadow: "0 2px 12px rgba(180,140,100,0.09)" }}>
          <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Soil Moisture</div>
          <UPlotChart
            data={history}
            valueKey="soil_moisture"
            height={120}
            color="#3a9e60"
            yDomain={soilYDomain}
          />
        </div>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: "16px 20px", boxShadow: "0 2px 12px rgba(180,140,100,0.09)" }}>
          <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>VPD</div>
          <UPlotChart
            data={history}
            valueKey="vpd"
            height={120}
            color="#d46820"
            yDomain={vpdYDomain}
          />
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ textAlign: "center", fontSize: 10, color: T.textFaint, letterSpacing: 1.5, marginTop: 8 }}>
        MUNYIN · KIDBRIGHT32 · ESP32-WROOM-32 · {new Date().getFullYear()}
      </div>
    </div>
  );
}
