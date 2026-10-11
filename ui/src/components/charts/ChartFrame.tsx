import { PhotoIcon } from "@heroicons/react/20/solid";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { svgToPng } from "../../lib/exporting";
import type { Provenance } from "../ui/ProvenanceBadge";
import { useWidth } from "./useSize";

export interface LegendItem { label: string; color: string; shape?: "line" | "dot" | "square" | "dash" }

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <svg width="16" height="10" aria-hidden>
            {it.shape === "dot" ? <circle cx="8" cy="5" r="4" fill={it.color} /> :
              it.shape === "square" ? <rect x="3" y="0" width="10" height="10" rx="2" fill={it.color} /> :
              <line x1="0" x2="16" y1="5" y2="5" stroke={it.color} strokeWidth="2" strokeDasharray={it.shape === "dash" ? "4 3" : undefined} />}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** Measures its width, renders the chart via `children(width)`, and offers a PNG download that carries provenance. */
export function ChartFrame({ title, provenance, legend, height, children, fileName, caption }: {
  title: string; provenance: Provenance; legend?: LegendItem[]; height: number; fileName: string; caption?: ReactNode;
  children: (width: number, height: number) => ReactNode;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const holder = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const label = provenance === "capture" ? "REAL CAPTURE" : provenance === "simulated" ? "SIMULATED" : "SIMULATED + REAL CAPTURE";
  const png = async () => {
    const svg = holder.current?.querySelector("svg[data-chart]") as SVGSVGElement | null;
    if (!svg) return;
    setBusy(true);
    try { await svgToPng(svg, `${fileName}.png`, `${title} · ${label} · Cadence`); } finally { setBusy(false); }
  };
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {legend ? <Legend items={legend} /> : null}
        <Button size="sm" variant="ghost" className="no-print ml-auto" loading={busy} onClick={png}
          icon={<PhotoIcon className="size-4" aria-hidden />} aria-label={`PNG: ${title}`}>PNG</Button>
      </div>
      <div ref={ref} className="w-full min-w-0">
        <div ref={holder}>{children(Math.max(240, width), height)}</div>
      </div>
      {caption ? <figcaption className="text-xs text-ink-3">{caption}</figcaption> : null}
    </figure>
  );
}

export function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x + 12), width - 188);
  return (
    <div role="status" className="pointer-events-none absolute z-10 w-44 rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink shadow-lg" style={{ left, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

export const AXIS = { fontSize: 11, fill: "var(--ink-3)" } as const;
