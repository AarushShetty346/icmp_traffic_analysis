import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { useMemo, useState } from "react";
import { AXIS, Tooltip } from "./ChartFrame";

export interface Series { key: string; label: string; color: string; gaps: { index: number; seq: number | null; dt: number }[]; lost: number[] }

/** Inter-packet delay timeline: Δt (ms) per gap, window boundaries, lost-packet markers, hover tooltip. */
export function IpdTimeline({ width, height, series, range, boundaries }: {
  width: number; height: number; series: Series[]; range: [number, number]; boundaries: number[];
}) {
  const m = { top: 12, right: 12, bottom: 34, left: 52 };
  const [hover, setHover] = useState<{ x: number; y: number; s: Series; g: Series["gaps"][number] } | null>(null);
  const visible = useMemo(() => series.map((s) => ({ ...s, gaps: s.gaps.filter((g) => g.index >= range[0] && g.index <= range[1]) })), [series, range]);
  const all = visible.flatMap((s) => s.gaps.map((g) => g.dt * 1000));
  const lo = all.length ? Math.min(...all) : 900, hi = all.length ? Math.max(...all) : 1100;
  const pad = Math.max(5, (hi - lo) * 0.08);
  const x = scaleLinear().domain(range).range([m.left, width - m.right]);
  const y = scaleLinear().domain([lo - pad, hi + pad]).nice().range([height - m.bottom, m.top]);
  const path = line<{ index: number; dt: number }>().x((d) => x(d.index)).y((d) => y(d.dt * 1000));
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - box.left, py = e.clientY - box.top;
    const idx = Math.round(x.invert(px));
    let best: { s: Series; g: Series["gaps"][number]; d: number } | null = null;
    for (const s of visible) for (const g of s.gaps) {
      if (Math.abs(g.index - idx) > 1) continue;
      const d = Math.abs(y(g.dt * 1000) - py) + Math.abs(x(g.index) - px);
      if (!best || d < best.d) best = { s, g, d };
    }
    setHover(best ? { x: px, y: py, s: best.s, g: best.g } : null);
  };
  return (
    <div className="relative">
      <svg data-chart width={width} height={height} role="img" aria-label={`Inter-packet delay timeline for ${series.map((s) => s.label).join(" and ")}, gaps ${range[0]} to ${range[1]}`}>
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={m.left - 6} y={y(t)} {...AXIS} textAnchor="end" dominantBaseline="middle">{t}</text>
          </g>
        ))}
        {boundaries.filter((b) => b >= range[0] && b <= range[1]).map((b) => (
          <line key={`b${b}`} x1={x(b)} x2={x(b)} y1={m.top} y2={height - m.bottom} stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="3 3" />
        ))}
        {x.ticks(Math.max(2, Math.floor(width / 90))).map((t) => (
          <text key={t} x={x(t)} y={height - m.bottom + 16} {...AXIS} textAnchor="middle">{t}</text>
        ))}
        <text x={m.left + (width - m.left - m.right) / 2} y={height - 3} {...AXIS} textAnchor="middle">gap index (one per Echo Request)</text>
        <text transform={`translate(12 ${m.top + (height - m.top - m.bottom) / 2}) rotate(-90)`} {...AXIS} textAnchor="middle">Δt (ms)</text>
        {visible.map((s) => (
          <g key={s.key}>
            <path d={path(s.gaps) ?? ""} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.lost.filter((i) => i >= range[0] && i <= range[1]).map((i) => (
              <path key={i} d={`M${x(i)},${height - m.bottom - 2} l-5,-9 l10,0 z`} fill="var(--flag)" stroke="var(--surface)" strokeWidth={1.5}>
                <title>{`${s.label}: request lost before gap ${i}`}</title>
              </path>
            ))}
          </g>
        ))}
        {hover ? <circle cx={x(hover.g.index)} cy={y(hover.g.dt * 1000)} r={5} fill={hover.s.color} stroke="var(--surface)" strokeWidth={2} /> : null}
        <rect x={m.left} y={m.top} width={width - m.left - m.right} height={height - m.top - m.bottom} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover ? (
        <Tooltip x={hover.x} y={hover.y} width={width}>
          <div className="font-semibold">{hover.s.label}</div>
          <div className="tabular font-mono">gap {hover.g.index}{hover.g.seq !== null ? ` · seq ${hover.g.seq}→${hover.g.seq + 1}` : ""}</div>
          <div className="tabular font-mono">Δt {(hover.g.dt * 1000).toFixed(2)} ms</div>
        </Tooltip>
      ) : null}
    </div>
  );
}
