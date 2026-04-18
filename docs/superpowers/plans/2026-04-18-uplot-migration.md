# uPlot Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace recharts with uPlot for the 3 time-series charts in MunyinDashboard.

**Architecture:** A single reusable `UPlotChart` React component wraps the uPlot imperative API via `useRef`/`useEffect`. MunyinDashboard swaps its 3 recharts chart blocks for `UPlotChart`. recharts is then removed.

**Tech Stack:** uPlot, React 19, Vite

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/UPlotChart.jsx` | uPlot wrapper — init, resize, cleanup, ref lines |
| Modify | `src/components/MunyinDashboard.jsx` | Remove recharts imports/JSX, add UPlotChart |
| Modify | `package.json` | Remove recharts after migration confirmed |

---

### Task 1: Install uplot

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install uplot
```

Expected output: `added 1 package` (uPlot has zero dependencies)

- [ ] **Step 2: Verify import resolves**

```bash
node -e "import('uplot').then(m => console.log('ok', Object.keys(m.default)))"
```

Expected: `ok [ 'default', ... ]` — no error

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add uplot dependency"
```

---

### Task 2: Create UPlotChart.jsx

**Files:**
- Create: `src/components/UPlotChart.jsx`

- [ ] **Step 1: Start dev server to verify visually as you go**

```bash
npm run dev
```

Keep running in background.

- [ ] **Step 2: Create the file**

Create `src/components/UPlotChart.jsx` with this exact content:

```jsx
import { useRef, useEffect } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

const GRID_COLOR = "#f8f1e8";
const TICK_COLOR = "#c8b4a0";

export default function UPlotChart({
  data,
  valueKey,
  height,
  color,
  yDomain,
  fill = false,
  refLines = [],
}) {
  const containerRef = useRef(null);
  const plotRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !data?.length) return;

    const width = containerRef.current.offsetWidth;
    const xs = data.map((_, i) => i);
    const ys = data.map((d) => (typeof d[valueKey] === "number" ? d[valueKey] : null));

    const tickStep = Math.max(1, Math.floor(data.length / 6));

    const opts = {
      width,
      height,
      padding: [4, 4, 0, 0],
      cursor: { show: false },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: { range: () => yDomain },
      },
      axes: [
        {
          stroke: TICK_COLOR,
          ticks: { show: false },
          border: { show: false },
          grid: { show: false },
          font: "10px IBM Plex Mono, monospace",
          splits: (_u, _axisIdx, scaleMin, scaleMax) => {
            const result = [];
            for (let i = 0; i < data.length; i += tickStep) result.push(i);
            return result;
          },
          values: (_u, vals) => vals.map((v) => data[Math.round(v)]?.ts ?? ""),
        },
        {
          stroke: TICK_COLOR,
          ticks: { show: false },
          border: { show: false },
          grid: { stroke: GRID_COLOR, width: 1 },
          font: "10px IBM Plex Mono, monospace",
          size: 36,
        },
      ],
      series: [
        {},
        {
          stroke: color,
          width: 2,
          fill: fill ? color + "33" : undefined,
        },
      ],
      hooks: {
        draw: [
          (u) => {
            if (!refLines.length) return;
            const ctx = u.ctx;
            refLines.forEach(({ y: yVal, color: lColor }) => {
              const yPx = u.valToPos(yVal, "y", true);
              ctx.save();
              ctx.strokeStyle = lColor + "59";
              ctx.setLineDash([4, 4]);
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(u.bbox.left, yPx);
              ctx.lineTo(u.bbox.left + u.bbox.width, yPx);
              ctx.stroke();
              ctx.restore();
            });
          },
        ],
      },
    };

    plotRef.current = new uPlot(opts, [xs, ys], containerRef.current);

    const handleResize = () => {
      if (plotRef.current && containerRef.current) {
        plotRef.current.setSize({
          width: containerRef.current.offsetWidth,
          height,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [data, valueKey, color, height, fill, refLines, yDomain]);

  return <div ref={containerRef} style={{ width: "100%" }} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/UPlotChart.jsx
git commit -m "feat: add UPlotChart uPlot wrapper component"
```

---

### Task 3: Replace IUI Trend chart

**Files:**
- Modify: `src/components/MunyinDashboard.jsx` (lines ~3–7 imports, lines ~305–339 chart block)

- [ ] **Step 1: Add UPlotChart import, remove recharts chart imports**

Find the top of `MunyinDashboard.jsx`. Replace the recharts import line:

```jsx
// REMOVE this line:
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

// ADD this line:
import UPlotChart from "./UPlotChart";
```

- [ ] **Step 2: Replace IUI Trend chart block**

Find the IUI Trend chart section (currently contains `<ResponsiveContainer width="100%" height={180}>` with `<AreaChart>`). Replace the entire `<ResponsiveContainer>` block:

```jsx
{/* REMOVE — everything from <ResponsiveContainer> to </ResponsiveContainer> inclusive */}
<ResponsiveContainer width="100%" height={180}>
  <AreaChart data={history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
    <defs>
      <linearGradient id="iuiGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={0.2} />
        <stop offset="95%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
    <CartesianGrid stroke={T.bgCard2} vertical={false} />
    <XAxis dataKey="ts" tick={{ fontSize: 10, fill: T.textFaint }} tickLine={false} axisLine={false} />
    <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: T.textFaint }} tickLine={false} axisLine={false} />
    <Tooltip content={ChartTooltip} />
    <ReferenceLine y={0.6} stroke="#c83030" strokeDasharray="4 4" strokeOpacity={0.35} />
    <ReferenceLine y={0.4} stroke="#c89010" strokeDasharray="4 4" strokeOpacity={0.35} />
    <Area type="monotone" dataKey="iui" name="IUI" stroke={color} fill="url(#iuiGrad)" strokeWidth={2} dot={false} />
  </AreaChart>
</ResponsiveContainer>
```

Replace with:

```jsx
<UPlotChart
  data={history}
  valueKey="iui"
  height={180}
  color={color}
  yDomain={[0, 1]}
  fill={true}
  refLines={[
    { y: 0.6, color: "#c83030" },
    { y: 0.4, color: "#c89010" },
  ]}
/>
```

- [ ] **Step 3: Also remove ChartTooltip component** (no longer needed — lines ~136–148)

Delete the entire `ChartTooltip` function from `MunyinDashboard.jsx`:

```jsx
// REMOVE this entire function:
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 16px rgba(180,140,100,0.15)" }}>
      <div style={{ color: T.textMuted, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, display: "flex", gap: 8, justifyContent: "space-between" }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{fmt(p.value, 2)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Open `http://localhost:5173`. The IUI Trend section should render a canvas chart with area fill and two dashed reference lines. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/MunyinDashboard.jsx
git commit -m "feat: replace IUI trend AreaChart with UPlotChart"
```

---

### Task 4: Replace Soil Moisture and VPD charts

**Files:**
- Modify: `src/components/MunyinDashboard.jsx` (lines ~342–360, the two-chart grid)

- [ ] **Step 1: Replace the sensor charts .map() block**

Find the sensor charts section — a `.map()` over an array of `{ key, label, color, domain }` that renders two `<LineChart>` instances. Replace the entire outer `<div>` (the grid container + its children):

```jsx
{/* REMOVE entire block: */}
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
  {[
    { key: "soil_moisture", label: "Soil Moisture", unit: "%", color: "#3a9e60", domain: [0, 100] },
    { key: "vpd", label: "VPD", unit: "kPa", color: "#d46820", domain: [0, 3] },
  ].map(({ key, label, color: c, domain }) => (
    <div key={key} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: "16px 20px", boxShadow: "0 2px 12px rgba(180,140,100,0.09)" }}>
      <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>{label}</div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={history} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <CartesianGrid stroke={T.bgCard2} vertical={false} />
          <XAxis dataKey="ts" tick={{ fontSize: 9, fill: T.textFaint }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis domain={domain} tick={{ fontSize: 9, fill: T.textFaint }} tickLine={false} axisLine={false} />
          <Tooltip content={ChartTooltip} />
          <Line type="monotone" dataKey={key} name={label} stroke={c} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  ))}
</div>
```

Replace with:

```jsx
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
  <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: "16px 20px", boxShadow: "0 2px 12px rgba(180,140,100,0.09)" }}>
    <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Soil Moisture</div>
    <UPlotChart
      data={history}
      valueKey="soil_moisture"
      height={120}
      color="#3a9e60"
      yDomain={[0, 100]}
    />
  </div>
  <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: "16px 20px", boxShadow: "0 2px 12px rgba(180,140,100,0.09)" }}>
    <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>VPD</div>
    <UPlotChart
      data={history}
      valueKey="vpd"
      height={120}
      color="#d46820"
      yDomain={[0, 3]}
    />
  </div>
</div>
```

- [ ] **Step 2: Verify in browser**

Both Soil Moisture and VPD cards should show canvas line charts. Resize the window — charts should reflow to new width. No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/MunyinDashboard.jsx
git commit -m "feat: replace Soil Moisture and VPD LineCharts with UPlotChart"
```

---

### Task 5: Remove recharts

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm no recharts references remain**

```bash
grep -r "recharts" src/
```

Expected: no output (zero matches).

- [ ] **Step 2: Uninstall recharts**

```bash
npm uninstall recharts
```

Expected: `removed N packages`

- [ ] **Step 3: Verify build succeeds**

```bash
npm run build
```

Expected: build completes with no errors. Bundle size should be smaller than before.

- [ ] **Step 4: Verify dev server still works**

```bash
npm run dev
```

Open `http://localhost:5173`. All 3 charts render. No console errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove recharts dependency"
```

---

## Self-Review

**Spec coverage:**
- [x] New `UPlotChart.jsx` — Task 2
- [x] Modify `MunyinDashboard.jsx` — Tasks 3 & 4
- [x] Remove recharts — Task 5
- [x] Props API (data, valueKey, height, color, yDomain, fill, refLines) — Task 2
- [x] Index-based x-axis with ts labels — Task 2 (`splits` + `values`)
- [x] ~6 ticks max — Task 2 (`tickStep`)
- [x] Area fill at 20% opacity — Task 2 (`color + "33"`)
- [x] Reference lines via hooks.draw — Task 2
- [x] Width from `offsetWidth`, resize listener — Task 2
- [x] Destroy on cleanup — Task 2 (`return () => { ... }`)
- [x] ChartTooltip removed — Task 3, Step 3
- [x] IUI chart: fill=true, refLines, yDomain=[0,1] — Task 3
- [x] Soil Moisture: valueKey="soil_moisture", yDomain=[0,100] — Task 4
- [x] VPD: valueKey="vpd", yDomain=[0,3] — Task 4

**Placeholder scan:** None found.

**Type consistency:** `UPlotChart` props used identically in Tasks 3 and 4 as defined in Task 2.
