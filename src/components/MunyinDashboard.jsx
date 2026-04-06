import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

// ── CONFIG ──────────────────────────────────────────────────────────────────
const API_BASE = "https://iot.cpe.ku.ac.th/red/b6710545849";
const POLL_INTERVAL = 60000; // 1 minute

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

// ── HELPERS ──────────────────────────────────────────────────────────────────
const iuiColor = (v) => {
  if (v < 0.2) return "#22c55e";
  if (v < 0.4) return "#84cc16";
  if (v < 0.6) return "#eab308";
  if (v < 0.8) return "#f97316";
  return "#ef4444";
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
  const arcPath = (start, end, col) => {
    const s = toXY(start), e = toXY(end);
    const large = end - start > 180 ? 1 : 0;
    return `<path d="M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}" stroke="${col}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  };
  const needle = toXY(angle);

  return (
    <svg viewBox="0 0 180 120" style={{ width: "100%", maxWidth: 220 }}>
      {/* track */}
      <path
        d={`M ${toXY(-135).x} ${toXY(-135).y} A ${r} ${r} 0 1 1 ${toXY(135).x} ${toXY(135).y}`}
        stroke="#1e293b" strokeWidth="10" fill="none" strokeLinecap="round"
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
      <circle cx={cx} cy={cy} r="4" fill="#94a3b8" />
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
      background: "#0f172a", border: "1px solid #1e293b",
      borderRadius: 12, padding: "14px 18px",
      borderLeft: accent ? `3px solid ${accent}` : undefined
    }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || "#f1f5f9", fontFamily: "monospace" }}>
        {value}<span style={{ fontSize: 13, color: "#64748b", marginLeft: 4 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── STATUS DOT ────────────────────────────────────────────────────────────────
function StatusDot({ ok, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: ok ? "#22c55e" : "#ef4444",
        boxShadow: ok ? "0 0 6px #22c55e" : "0 0 6px #ef4444"
      }} />
      {label}
    </div>
  );
}

// ── CUSTOM TOOLTIP ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "#64748b", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, display: "flex", gap: 8, justifyContent: "space-between" }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{fmt(p.value, 2)}</span>
        </div>
      ))}
    </div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
export default function MunyinDashboard() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState({ sensor: false, tmd: false, aqi: false });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [hours, setHours] = useState(24);

  const fetchData = useCallback(async () => {
    if (USE_MOCK) {
      setLatest(MOCK_LATEST);
      setHistory(MOCK_HISTORY.data);
      setStatus({ sensor: true, tmd: true, aqi: true });
      setLastUpdate(new Date());
      setLoading(false);
      return;
    }
    try {
      const [latRes, histRes, statRes] = await Promise.all([
        fetch(`${API_BASE}/latest`),
        fetch(`${API_BASE}/history?hours=${hours}`),
        fetch(`${API_BASE}/status`),
      ]);
      const [lat, hist, stat] = await Promise.all([latRes.json(), histRes.json(), statRes.json()]);
      setLatest(lat);
      setHistory(hist.data);
      setStatus({ sensor: stat.sensor === "ok", tmd: stat.tmd === "ok", aqi: stat.aqi === "ok" });
      setLastUpdate(new Date());
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const t = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#020817", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontFamily: "monospace" }}>
      initializing MUNYIN...
    </div>
  );

  const iui = latest?.computed?.iui ?? 0;
  const color = iuiColor(iui);

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#f1f5f9", fontFamily: "'IBM Plex Mono', monospace", padding: "24px 20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet" />

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, background: "#052e16", color: "#22c55e", padding: "2px 8px", borderRadius: 4, letterSpacing: 2 }}>LIVE</span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: 2 }}>MUNYIN</h1>
          </div>
          <p style={{ fontSize: 11, color: "#475569", margin: "4px 0 0", letterSpacing: 1 }}>
            MICRO-ENVIRONMENT UNIFIED NETWORK FOR YIELD IRRIGATION NAVIGATION
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <StatusDot ok={status.sensor} label="Sensor" />
            <StatusDot ok={status.tmd} label="TMD" />
            <StatusDot ok={status.aqi} label="AQI" />
          </div>
          {lastUpdate && (
            <span style={{ fontSize: 10, color: "#334155" }}>
              updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── IUI HERO ── */}
      <div style={{
        background: "#0a0f1e", border: `1px solid ${color}22`,
        borderRadius: 16, padding: "24px 28px", marginBottom: 20,
        display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, alignItems: "center"
      }}>
        <div style={{ textAlign: "center" }}>
          <IUIGauge value={iui} />
          <div style={{ fontSize: 13, color, fontWeight: 600, marginTop: 4, letterSpacing: 1 }}>
            {iuiLabel(iui).toUpperCase()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#475569", letterSpacing: 2, marginBottom: 12 }}>IUI BREAKDOWN</div>
          {[
            { label: "Soil score", value: latest?.computed?.soil_score, bar: true },
            { label: "VPD score", value: latest?.computed?.vpd_score, bar: true },
            { label: "Rain factor", value: latest?.computed?.rain_factor, bar: true, invert: true },
            { label: "AQI factor", value: latest?.computed?.aqi_factor, bar: true },
          ].map(({ label, value, invert }) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 3 }}>
                <span>{label}</span>
                <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{fmt(value, 3)}</span>
              </div>
              <div style={{ background: "#1e293b", borderRadius: 4, height: 5 }}>
                <div style={{
                  width: `${(value ?? 0) * 100}%`, height: "100%", borderRadius: 4,
                  background: invert ? "#22c55e" : color, transition: "width 0.6s ease"
                }} />
              </div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            <div style={{ fontSize: 11, color: "#475569" }}>VPD
              <span style={{ display: "block", fontSize: 18, color: "#f1f5f9", fontWeight: 700 }}>
                {fmt(latest?.computed?.vpd, 3)} <span style={{ fontSize: 11, fontWeight: 400 }}>kPa</span>
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#475569" }}>Soil moisture
              <span style={{ display: "block", fontSize: 18, color: "#f1f5f9", fontWeight: 700 }}>
                {fmt(latest?.sensor?.soil_moisture, 1)} <span style={{ fontSize: 11, fontWeight: 400 }}>%</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SENSOR METRICS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Temperature" value={fmt(latest?.sensor?.temperature, 1)} unit="°C" accent="#f97316" />
        <MetricCard label="Humidity" value={fmt(latest?.sensor?.humidity, 0)} unit="%" accent="#38bdf8" />
        <MetricCard label="AQI" value={fmt(latest?.aqi?.aqi, 0)} unit="" sub={`PM2.5: ${fmt(latest?.aqi?.pm25, 0)} · PM10: ${fmt(latest?.aqi?.pm10, 0)}`} accent="#a78bfa" />
        <MetricCard label="Outdoor Temp" value={fmt(latest?.weather?.air_temperature, 1)} unit="°C" sub={`Dew: ${fmt(latest?.weather?.dew_point, 1)}°C`} accent="#fb7185" />
        <MetricCard label="Rain 24hr" value={fmt(latest?.weather?.rainfall_24hr, 1)} unit="mm" accent="#22c55e" />
      </div>

      {/* ── CHARTS ── */}
      <div style={{ background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#475569", letterSpacing: 2 }}>IUI TREND</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[6, 24, 48, 168].map(h => (
              <button key={h} onClick={() => setHours(h)} style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                background: hours === h ? "#1e40af" : "transparent",
                border: `1px solid ${hours === h ? "#3b82f6" : "#1e293b"}`,
                color: hours === h ? "#93c5fd" : "#475569"
              }}>
                {h < 48 ? `${h}h` : h === 168 ? "7d" : `${h}h`}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="iuiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#0f172a" vertical={false} />
            <XAxis dataKey="ts" tick={{ fontSize: 10, fill: "#334155" }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#334155" }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0.6} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4} />
            <ReferenceLine y={0.4} stroke="#eab308" strokeDasharray="4 4" strokeOpacity={0.4} />
            <Area type="monotone" dataKey="iui" name="IUI" stroke={color} fill="url(#iuiGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── SENSOR CHARTS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {[
          { key: "soil_moisture", label: "SOIL MOISTURE", unit: "%", color: "#22c55e", domain: [0, 100] },
          { key: "vpd", label: "VPD", unit: "kPa", color: "#f97316", domain: [0, 3] },
        ].map(({ key, label, color: c, domain }) => (
          <div key={key} style={{ background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "#475569", letterSpacing: 2, marginBottom: 12 }}>{label}</div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={history} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid stroke="#0f172a" vertical={false} />
                <XAxis dataKey="ts" tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={domain} tick={{ fontSize: 9, fill: "#334155" }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey={key} name={label} stroke={c} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ textAlign: "center", fontSize: 10, color: "#1e293b", letterSpacing: 2 }}>
        MUNYIN · KIDBRIGHT32 · ESP32-WROOM-32 · {new Date().getFullYear()}
      </div>
    </div>
  );
}
