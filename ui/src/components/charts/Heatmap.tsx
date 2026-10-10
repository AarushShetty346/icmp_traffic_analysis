import { useState } from "react";
import { AXIS, Tooltip } from "./ChartFrame";

export interface Cell { row: string; col: string; value: number | null; lo?: number | null; hi?: number | null; selected?: boolean }

/** Step index on the 8-step sequential ramp; dark mode reverses the ramp, the ink tokens follow. */
const step = (v: number) => Math.min(7, Math.max(0, Math.floor(v * 8 - 1e-9)));
const inkFor = (s: number, dark: boolean) => (dark ? (s <= 3 ? "var(--seq-ink-lo)" : "var(--seq-ink-hi)") : s <= 4 ? "var(--seq-ink-lo)" : "var(--seq-ink-hi)");

export function Heatmap({ width, rows, cols, cells, metricLabel, onSelect }: {
  width: number; rows: string[]; cols: string[]; cells: Cell[]; metricLabel: string; onSelect: (c: Cell) => void;
}) {
  const dark = typeof document !== "undefined" && (document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && window.matchMedia?.("(prefers-color-scheme: dark)").matches));
  const narrow = width < 640;
  const m = { top: narrow ? 8 : 70, right: narrow ? 8 : 90, bottom: narrow ? 70 : 8, left: narrow ? 124 : 150 };
  const cw = Math.max(narrow ? 26 : 44, (width - m.left - m.right) / (narrow ? rows.length : cols.length));
  const ch = narrow ? 30 : 36;
  // On narrow screens conditions run down the side, so the grid never scrolls sideways.
  const [R, C] = narrow ? [cols, rows] : [rows, cols];
  const height = m.top + R.length * ch + m.bottom;
  const w = m.left + C.length * cw + m.right;
  const find = (r: string, c: string) => cells.find((x) => (narrow ? x.col === r && x.row === c : x.row === r && x.col === c));
  const [hover, setHover] = useState<{ x: number; y: number; cell: Cell } | null>(null);
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`);
  return (
    <div className="relative">
      <svg data-chart width={Math.min(w, width)} height={height} viewBox={`0 0 ${w} ${height}`} role="group" aria-label={`${metricLabel} by gap setting and network condition`}>
        {R.map((r, i) => (
          <text key={r} x={m.left - 6} y={m.top + i * ch + ch / 2} {...AXIS} fontSize={narrow ? 10 : 11} textAnchor="end" dominantBaseline="middle">{r.replace(" s", "")}</text>
        ))}
        {C.map((c, j) => (
          <text key={c} transform={narrow ? `translate(${m.left + j * cw + cw / 2} ${m.top + R.length * ch + 6}) rotate(55)` : `translate(${m.left + j * cw + cw / 2} ${m.top - 6}) rotate(-35)`}
            {...AXIS} fontSize={narrow ? 10 : 11} textAnchor={narrow ? "start" : "start"}>{c.replace(" s", "")}</text>
        ))}
        {R.map((r, i) => C.map((c, j) => {
          const cell = find(r, c);
          if (!cell) return null;
          const v = cell.value;
          const s = v === null ? 0 : step(v);
          const label = `${cell.row}, ${cell.col}: ${metricLabel} ${pct(v)}${cell.lo !== undefined && cell.lo !== null ? `, 95% interval ${pct(cell.lo)} to ${pct(cell.hi)}` : ""}`;
          return (
            <g key={`${r}${c}`} role="button" tabIndex={0} aria-label={label} aria-pressed={cell.selected ? "true" : "false"} className="cursor-pointer outline-none [&:focus-visible>rect:last-child]:stroke-[var(--focus)]"
              onClick={() => onSelect(cell)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(cell); } }}
              onPointerEnter={(e) => { const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ x: e.clientX - b.left, y: e.clientY - b.top, cell }); }}
              onPointerLeave={() => setHover(null)}>
              <rect x={m.left + j * cw + 1} y={m.top + i * ch + 1} width={cw - 2} height={ch - 2} rx={3} fill={v === null ? "var(--surface-2)" : `var(--seq-${s})`} />
              {cw >= 30 ? <text x={m.left + j * cw + cw / 2} y={m.top + i * ch + ch / 2} fontSize={narrow ? 10 : 11} fontWeight={600} textAnchor="middle" dominantBaseline="middle" fill={v === null ? "var(--ink-3)" : inkFor(s, dark)}>{pct(v)}</text> : null}
              <rect x={m.left + j * cw + 1} y={m.top + i * ch + 1} width={cw - 2} height={ch - 2} rx={3} fill="none" stroke={cell.selected ? "var(--ink)" : "transparent"} strokeWidth={2.5} />
            </g>
          );
        }))}
      </svg>
      {hover ? (
        <Tooltip x={hover.x} y={hover.y} width={width}>
          <div className="font-semibold">{hover.cell.row}</div>
          <div>{hover.cell.col}</div>
          <div className="tabular font-mono">{metricLabel} {pct(hover.cell.value)}</div>
          {hover.cell.lo !== undefined && hover.cell.lo !== null ? <div className="tabular font-mono">95% CI {pct(hover.cell.lo)}–{pct(hover.cell.hi)}</div> : null}
        </Tooltip>
      ) : null}
    </div>
  );
}

export function RampLegend({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-2" aria-hidden>
      <span>0%</span>
      <span className="flex">{Array.from({ length: 8 }, (_, i) => <span key={i} className="h-3 w-5" style={{ background: `var(--seq-${i})` }} />)}</span>
      <span>100% {label}</span>
    </div>
  );
}
