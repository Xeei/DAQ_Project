# uPlot Migration Design

**Date:** 2026-04-18  
**Scope:** Replace recharts with uPlot in `MunyinDashboard.jsx`

## Problem

recharts `<Tooltip content={<ChartTooltip />} />` passes a React element instead of a component reference, causing recursive cloning → `Maximum call stack size exceeded`. Root fix applied, but recharts is SVG-based and heavier than needed for IoT time-series data.

## Goal

Migrate 3 charts to uPlot (canvas-based, ~40kb). Drop recharts dependency. Tooltips dropped (not required). Keep visual style consistent with existing T theme.

## Files

| Action | File |
|--------|------|
| New | `src/components/UPlotChart.jsx` |
| Modified | `src/components/MunyinDashboard.jsx` |
| Remove dep | `recharts` from `package.json` after migration confirmed working |

## UPlotChart Component

### Props

```ts
{
  data: Array<{ ts: string, [key: string]: number }>,
  valueKey: string,       // field to extract from each data point
  height: number,
  color: string,          // stroke color
  yDomain: [number, number],
  fill?: boolean,         // area fill under line (default false)
  refLines?: Array<{ y: number, color: string }>,  // horizontal reference lines
}
```

### Internal behavior

- Transform `data` prop → uPlot format: `[[0,1,2,...n], [y0,y1,...yn]]` using array index as x-axis
- X-axis labels: map index back to `data[i].ts` string via uPlot axis `values` callback
- Tick count reduced to avoid label crowding (show ~6 ticks max)
- Init uPlot in `useEffect`, store instance in `useRef`, destroy on cleanup
- Recreate chart when `data`, `valueKey`, or `color` changes

### Styling (matches T theme)

| uPlot option | Value |
|---|---|
| Grid color | `#f8f1e8` (T.bgCard2) |
| Axis tick color | `#c8b4a0` (T.textFaint) |
| Axis lines | hidden |
| Background | transparent |
| Font size | 10px |

### Area fill

uPlot series `fill` option set to color at 20% opacity (`hex + "33"`). No gradient — canvas gradient adds complexity for minimal visual difference.

### Reference lines

Drawn in `hooks.draw` callback using canvas 2D API:

```js
hooks: {
  draw: [u => {
    refLines.forEach(({ y, color }) => {
      const yPx = u.valToPos(y, "y", true);
      ctx.save();
      ctx.strokeStyle = color + "59";  // ~35% opacity
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(u.bbox.left, yPx);
      ctx.lineTo(u.bbox.left + u.bbox.width, yPx);
      ctx.stroke();
      ctx.restore();
    });
  }]
}
```

## Chart Instances

| Chart | valueKey | height | fill | refLines | yDomain |
|-------|----------|--------|------|----------|---------|
| IUI Trend | `iui` | 180 | yes | y=0.4 `#c89010`, y=0.6 `#c83030` | [0, 1] |
| Soil Moisture | `soil_moisture` | 120 | no | none | [0, 100] |
| VPD | `vpd` | 120 | no | none | [0, 3] |

## Data Flow

```
historyData?.data → history[]
  → UPlotChart data prop
    → component splits: xs = [0..n], ys = data.map(d => d[valueKey])
    → uPlot([xs, ys])
```

## Width / Responsiveness

uPlot requires explicit pixel width (no `ResponsiveContainer`). `UPlotChart` wraps in a `div` with `width: "100%"` and reads `containerRef.current.offsetWidth` on mount to set uPlot `width`. On `window resize`, destroy and recreate chart with new width.

## Not In Scope

- Tooltips (dropped)
- Gradient fill on IUI (solid fill with opacity instead)
- Temperature / Humidity charts (not in current dashboard)
- Responsive resize handling beyond container width match

## Dependencies

- Install: `uplot`
- Remove: `recharts` (after migration confirmed)
- Existing: `d3` stays (used elsewhere or available for future use)
