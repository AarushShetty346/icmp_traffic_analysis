import { scaleLinear } from "d3-scale";
import { line, curveStepAfter } from "d3-shape";
import { useState } from "react";
import { AXIS, Tooltip } from "./ChartFrame";

export interface DistSeries { key: string; label: string; color: string; values: number[] }

const bins = (values: number[], lo: number, hi: number, n: number) => {
  const w = (hi - lo) / n;
  const counts = new Array(n).fill(0);
  for (const v of values) counts[Math.min(n - 1, Math.max(0, Math.floor((v - lo) / w)))]++;
  return counts.map((c, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, share: values.length ? c / values.length : 0 }));
};

/** Histogram (share of gaps per bin) above an ECDF, both in milliseconds. */
export function Distribution({ width, height, series }: { width: number; height: number; series: DistSeries[] }) {
  const m = { top: 10, right: 12, bottom: 34, left: 52 };
  const hHist = Math.round((height - 24) * 0.5);
  const all = series.flatMap((s) => s.values.map((v) => v * 1000));
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = Math.max(hi - lo, 4);
  const x = scaleLinear().domain([lo - span * 0.03, hi + span * 0.03]).range([m.left, width - m.right]);
  const nb = Math.max(10, Math.min(40, Math.floor(width / 18)));
  const hist = series.map((s) => ({ s, b: bins(s.values.map((v) => v * 1000), x.domain()[0], x.domain()[1], nb) }));
  const maxShare = Math.max(0.01, ...hist.flatMap((h) => h.b.map((b) => b.share)));
  const yH = scaleLinear().domain([0, maxShare]).nice().range([hHist, m.top]);
  const top2 = hHist + 24;
  const yE = scaleLinear().domain([0, 1]).range([height - m.bottom, top2]);
  const [hover, setHover] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const barW = Math.max(1, (x(hist[0]?.b[0]?.x1 ?? 0) - x(hist[0]?.b[0]?.x0 ?? 0) - 2) / Math.max(1, series.length));
  return (
    <div className="relative">
      <svg data-chart width={width} height={height} role="img" aria-label="Gap distribution: histogram and empirical cumulative distribution">
        {yH.ticks(3).map((t) => (
          <g key={`h${t}`}>
            <line x1={m.left} x2={width - m.right} y1={yH(t)} y2={yH(t)} stroke="var(--chart-grid)" />
            <text x={m.left - 6} y={yH(t)} {...AXIS} textAnchor="end" dominantBaseline="middle">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {hist.map(({ s, b }, si) => b.map((bin, i) => bin.share > 0 ? (
          <rect key={`${s.key}${i}`} x={x(bin.x0) + 1 + si * barW} width={barW} y={yH(bin.share)} height={Math.max(0, hHist - yH(bin.share))} rx={1.5} fill={s.color}
            onPointerEnter={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top, text: [s.label, `${bin.x0.toFixed(1)}–${bin.x1.toFixed(1)} ms`, `${(bin.share * 100).toFixed(1)}% of gaps`] }); }}
            onPointerLeave={() => setHover(null)} />
        ) : null))}
        <text transform={`translate(12 ${(m.top + hHist) / 2}) rotate(-90)`} {...AXIS} textAnchor="middle">share</text>
        {[0, 0.5, 1].map((t) => (
          <g key={`e${t}`}>
            <line x1={m.left} x2={width - m.right} y1={yE(t)} y2={yE(t)} stroke="var(--chart-grid)" />
            <text x={m.left - 6} y={yE(t)} {...AXIS} textAnchor="end" dominantBaseline="middle">{t}</text>
          </g>
        ))}
        {series.map((s) => {
          const v = [...s.values].map((q) => q * 1000).sort((a, b) => a - b);
          const pts = [{ x: x.domain()[0], y: 0 }, ...v.map((q, i) => ({ x: q, y: (i + 1) / v.length })), { x: x.domain()[1], y: 1 }];
          const p = line<{ x: number; y: number }>().x((d) => x(d.x)).y((d) => yE(d.y)).curve(curveStepAfter);
          return <path key={s.key} d={p(pts) ?? ""} fill="none" stroke={s.color} strokeWidth={2} />;
        })}
        <text transform={`translate(12 ${(top2 + height - m.bottom) / 2}) rotate(-90)`} {...AXIS} textAnchor="middle">ECDF</text>
        {x.ticks(Math.max(2, Math.floor(width / 90))).map((t) => (
          <text key={t} x={x(t)} y={height - m.bottom + 16} {...AXIS} textAnchor="middle">{t}</text>
        ))}
        <text x={m.left + (width - m.left - m.right) / 2} y={height - 3} {...AXIS} textAnchor="middle">Δt (ms)</text>
      </svg>
      {hover ? <Tooltip x={hover.x} y={hover.y} width={width}>{hover.text.map((t, i) => <div key={i} className={i === 0 ? "font-semibold" : "tabular font-mono"}>{t}</div>)}</Tooltip> : null}
    </div>
  );
}
