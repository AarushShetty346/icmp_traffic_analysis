import { scaleBand, scaleLinear } from "d3-scale";
import { useState } from "react";
import { AXIS, Tooltip } from "./ChartFrame";

export interface BarGroup { key: string; label: string; values: { series: string; value: number | null; color: string }[] }

/** Horizontal grouped bars (one group per row), values 0..1 shown as percentages. */
export function GroupedBars({ width, groups, unit = "%" }: { width: number; groups: BarGroup[]; unit?: "%" | "auc" }) {
  const nSeries = Math.max(1, ...groups.map((g) => g.values.length));
  const barH = 10, gap = 2;
  const groupH = nSeries * (barH + gap) + 12;
  const m = { left: Math.min(150, width * 0.36), right: 44, top: 4, bottom: 24 };
  const height = m.top + groups.length * groupH + m.bottom;
  const x = scaleLinear().domain([0, 1]).range([m.left, width - m.right]);
  const y = scaleBand().domain(groups.map((g) => g.key)).range([m.top, height - m.bottom]);
  const [hover, setHover] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const fmt = (v: number) => (unit === "%" ? `${Math.round(v * 100)}%` : v.toFixed(3));
  return (
    <div className="relative">
      <svg data-chart width={width} height={height} role="img" aria-label={groups.map((g) => `${g.label}: ${g.values.map((v) => `${v.series} ${v.value === null ? "n/a" : fmt(v.value)}`).join(", ")}`).join("; ")}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.top} y2={height - m.bottom} stroke="var(--chart-grid)" />
            <text x={x(t)} y={height - 6} {...AXIS} textAnchor="middle">{unit === "%" ? `${t * 100}%` : t}</text>
          </g>
        ))}
        {groups.map((g) => (
          <g key={g.key}>
            <text x={m.left - 8} y={(y(g.key) ?? 0) + groupH / 2 - 4} {...AXIS} fill="var(--ink-2)" textAnchor="end" dominantBaseline="middle">{g.label}</text>
            {g.values.map((v, i) => {
              const yy = (y(g.key) ?? 0) + i * (barH + gap) + 2;
              const w = v.value === null ? 0 : Math.max(2, x(v.value) - m.left);
              return (
                <g key={v.series}
                  onPointerEnter={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top, text: [g.label, `${v.series}: ${v.value === null ? "n/a" : fmt(v.value)}`] }); }}
                  onPointerLeave={() => setHover(null)}>
                  <rect x={m.left} y={yy - 1} width={width - m.left - m.right} height={barH + 2} fill="transparent" />
                  <path d={`M${m.left},${yy} h${Math.max(0, w - 4)} a4,4 0 0 1 4,4 v${barH - 8} a4,4 0 0 1 -4,4 h${-Math.max(0, w - 4)} z`} fill={v.color} />
                  {v.value !== null ? <text x={m.left + w + 4} y={yy + barH / 2} fontSize={10} fill="var(--ink-2)" dominantBaseline="middle">{fmt(v.value)}</text> : null}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      {hover ? <Tooltip x={hover.x} y={hover.y} width={width}>{hover.text.map((t, i) => <div key={i} className={i ? "tabular font-mono" : "font-semibold"}>{t}</div>)}</Tooltip> : null}
    </div>
  );
}
