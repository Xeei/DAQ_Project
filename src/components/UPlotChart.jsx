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
