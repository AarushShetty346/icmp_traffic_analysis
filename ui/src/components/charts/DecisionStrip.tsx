import { AXIS } from "./ChartFrame";

export interface StripRow { key: string; label: string; flags: boolean[]; truth: "normal" | "covert" }

/** One row per run and detector, one cell per window: filled = flagged suspicious. */
export function DecisionStrip({ width, rows }: { width: number; rows: StripRow[] }) {
  const m = { left: Math.min(170, width * 0.38), right: 8, top: 4 };
  const maxW = Math.max(1, ...rows.map((r) => r.flags.length));
  const cw = Math.min(26, (width - m.left - m.right) / maxW);
  const rh = 22;
  const height = m.top + rows.length * rh + 4;
  return (
    <svg data-chart width={width} height={height} role="img" aria-label={`Per-window decisions: ${rows.map((r) => `${r.label} ${r.flags.filter(Boolean).length} of ${r.flags.length} windows flagged`).join("; ")}`}>
      {rows.map((r, i) => (
        <g key={r.key}>
          <text x={m.left - 8} y={m.top + i * rh + rh / 2} {...AXIS} fill="var(--ink-2)" textAnchor="end" dominantBaseline="middle">{r.label}</text>
          {r.flags.map((f, j) => (
            <rect key={j} x={m.left + j * cw + 1} y={m.top + i * rh + 3} width={Math.max(2, cw - 2)} height={rh - 6} rx={2}
              fill={f ? "var(--flag)" : "var(--surface-2)"} stroke={f ? "none" : "var(--line-strong)"} strokeWidth={1}>
              <title>{`${r.label}, window ${j + 1}: ${f ? "suspicious" : "normal"} (truth: ${r.truth})`}</title>
            </rect>
          ))}
        </g>
      ))}
    </svg>
  );
}
