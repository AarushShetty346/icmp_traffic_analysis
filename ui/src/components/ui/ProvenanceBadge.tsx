import { BeakerIcon, SignalIcon } from "@heroicons/react/16/solid";
import { cx } from "./cx";

export type Provenance = "simulated" | "capture" | "mixed";

const TEXT: Record<Provenance, string> = { simulated: "Simulated", capture: "Real capture", mixed: "Simulated + real" };
const HELP: Record<Provenance, string> = {
  simulated: "Computed from icmp_detector/simulate.py. Not a testbed measurement.",
  capture: "Computed from a real tshark capture.",
  mixed: "Contains both simulated and real-capture data; each row carries its own label.",
};

/** The provenance label every number, chart and export carries. Text and icon, never colour alone. */
export function ProvenanceBadge({ source, className, compact }: { source: Provenance; className?: string; compact?: boolean }) {
  const Icon = source === "capture" ? SignalIcon : BeakerIcon;
  return (
    <span
      title={HELP[source]}
      data-provenance={source}
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-wide",
        source === "capture" && "border-real-line bg-real-bg text-real-ink",
        source === "simulated" && "border-sim-line bg-sim-bg text-sim-ink",
        source === "mixed" && "border-line-strong bg-surface-2 text-ink-2",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {compact ? (source === "capture" ? "Real" : source === "simulated" ? "Sim" : "Mixed") : TEXT[source]}
      <span className="sr-only">. {HELP[source]}</span>
    </span>
  );
}

export function provenanceOf(sources: Iterable<"simulated" | "capture">): Provenance {
  const s = new Set(sources);
  return s.size > 1 ? "mixed" : s.has("capture") ? "capture" : "simulated";
}
