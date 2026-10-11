import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { useState } from "react";
import { AXIS, Tooltip } from "./ChartFrame";

export interface Curve { key: string; label: string; color: string; points: { fpr: number | null; tpr: number | null; precision: number | null; threshold: number | null }[]; dashed?: boolean }

/** ROC (TPR vs FPR) or precision-recall curves, with the detector's operating point marked. */
export function RocChart({ width, height, curves, mode, operating }: {
  width: number; height: number; curves: Curve[]; mode: "roc" | "pr"; operating?: { fpr: number; tpr: number; precision: number | null; label: string } | null;
}) {
  const size = Math.min(width, height + 60);
  const m = { top: 10, right: 14, bottom: 38, left: 48 };
  const x = scaleLinear().domain([0, 1]).range([m.left, size - m.right]);
  const y = scaleLinear().domain([0, 1]).range([height - m.bottom, m.top]);
  const [hover, setHover] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const xy = (p: Curve["points"][number]) => (mode === "roc" ? [p.fpr ?? 0, p.tpr ?? 0] : [p.tpr ?? 0, p.precision ?? NaN]);
  return (
    <div className="relative">
      <svg data-chart width={size} height={height} role="img" aria-label={mode === "roc" ? "ROC curves: detection rate against false-positive rate" : "Precision against recall"}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={m.left} x2={size - m.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
            <line x1={x(t)} x2={x(t)} y1={m.top} y2={height - m.bottom} stroke="var(--chart-grid)" />
            <text x={m.left - 6} y={y(t)} {...AXIS} textAnchor="end" dominantBaseline="middle">{t}</text>
            <text x={x(t)} y={height - m.bottom + 15} {...AXIS} textAnchor="middle">{t}</text>
          </g>
        ))}
        {mode === "roc" ? <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--line-strong)" strokeDasharray="4 4" /> : null}
        <text x={(m.left + size - m.right) / 2} y={height - 4} {...AXIS} textAnchor="middle">{mode === "roc" ? "false-positive rate" : "recall (detection rate)"}</text>
        <text transform={`translate(12 ${(m.top + height - m.bottom) / 2}) rotate(-90)`} {...AXIS} textAnchor="middle">{mode === "roc" ? "detection rate" : "precision"}</text>
        {curves.map((c) => {
          const pts = c.points.map(xy).filter(([, b]) => Number.isFinite(b));
          const p = line<number[]>().x((d) => x(d[0])).y((d) => y(d[1]));
          return (
            <g key={c.key}>
              <path d={p(pts) ?? ""} fill="none" stroke={c.color} strokeWidth={2} strokeDasharray={c.dashed ? "5 4" : undefined} strokeLinejoin="round" />
              {pts.map(([a, b], i) => (
                <circle key={i} cx={x(a)} cy={y(b)} r={7} fill="transparent"
                  onPointerEnter={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top, text: [c.label, mode === "roc" ? `FPR ${a.toFixed(3)} · DR ${b.toFixed(3)}` : `recall ${a.toFixed(3)} · precision ${b.toFixed(3)}`] }); }}
                  onPointerLeave={() => setHover(null)} />
              ))}
            </g>
          );
        })}
        {operating && (mode === "roc" || operating.precision !== null) ? (
          <g>
            <circle cx={x(mode === "roc" ? operating.fpr : operating.tpr)} cy={y(mode === "roc" ? operating.tpr : operating.precision!)} r={6} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />
            <text x={x(mode === "roc" ? operating.fpr : operating.tpr) + 9} y={y(mode === "roc" ? operating.tpr : operating.precision!) + 14} fontSize={11} fill="var(--ink)">{operating.label}</text>
          </g>
        ) : null}
      </svg>
      {hover ? <Tooltip x={hover.x} y={hover.y} width={size}>{hover.text.map((t, i) => <div key={i} className={i ? "tabular font-mono" : "font-semibold"}>{t}</div>)}</Tooltip> : null}
    </div>
  );
}
