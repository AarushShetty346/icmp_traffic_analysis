// Small selectors shared by the views.
import type { Bundle } from "../data/schema";
import type { Run } from "../data/runs";
import { provenanceOf, type Provenance } from "../../components/ui/ProvenanceBadge";

export const pct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(digits)}%`);
export const ms = (s: number, digits = 1) => `${(s * 1000).toFixed(digits)} ms`;

export function runsProvenance(runs: Run[]): Provenance {
  return provenanceOf(runs.map((r) => r.source));
}

export function conditionOptions(bundle: Bundle | null) {
  return (bundle?.settings.conditions ?? []).map((c) => ({ value: c.name, label: c.name }));
}
export function channelOptions(bundle: Bundle | null) {
  return (bundle?.settings.channels ?? []).map((c) => ({ value: c.name, label: `${c.name} (bit 0 = ${c.gap0} s, bit 1 = ${c.gap1} s)` }));
}
export function modelOptions(bundle: Bundle | null) {
  return (bundle?.provenance.delayModels ?? ["netem"]).map((m) => ({ value: m, label: m === "netem" ? "netem-style (normal, truncated)" : "folded |N| (original)" }));
}
export const MODEL_HELP =
  "Which simulated network delay model produced the runs. netem-style draws a normal delay around a base and truncates at zero, like tc netem. folded is the original model (1 ms + |N(0, σ)|), which shifts the mean delay up and is kept so earlier results reproduce.";

export function pick<T extends string>(value: string | null, allowed: readonly T[] | T[], fallback: T): T {
  return value && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export const DETECTOR_OPTIONS = [
  { value: "matched", label: "Baseline (same conditions)" },
  { value: "clean", label: "Baseline (clean LAN)" },
  { value: "fixed", label: "Fixed rule" },
] as const;
export type DetectorKey = (typeof DETECTOR_OPTIONS)[number]["value"];
export const DETECTOR_NAME: Record<DetectorKey, "fixed" | "baseline (clean)" | "baseline (matched)"> = {
  fixed: "fixed", clean: "baseline (clean)", matched: "baseline (matched)",
};
export const DETECTOR_HELP =
  "Fixed rule: flags a window when its gap standard deviation or its mean's distance from 1 s passes a fixed limit. Baseline: learns the normal range of each feature from normal runs and flags windows outside it. 'Same conditions' learns under the tested network condition; 'clean LAN' learns once without added jitter or loss.";

export interface RunSet { baseline: Run[]; normal: Run[]; covert: Run[] }

/** The runs one bundle cell is built from: baseline runs, test normal runs and test covert runs. */
export function bundleSet(runs: Run[], model: string, condition: string, channel: string | null, base: "matched" | "clean"): RunSet {
  const sim = runs.filter((r) => r.origin === "bundle" && (r.delayModel ?? "none") === model);
  return {
    baseline: sim.filter((r) => base === "clean" ? r.role === "baseline-clean" : r.role === "baseline-matched" && r.condition === condition),
    normal: sim.filter((r) => r.role === "test" && r.label === "normal" && r.condition === condition),
    covert: sim.filter((r) => r.role === "test" && r.label === "covert" && r.condition === condition && (channel === null || r.channel === channel)),
  };
}

export function uploadSet(uploads: Run[]): RunSet {
  return {
    baseline: uploads.filter((r) => r.role !== "test"),
    normal: uploads.filter((r) => r.role === "test" && r.label === "normal"),
    covert: uploads.filter((r) => r.role === "test" && r.label === "covert"),
  };
}

/** Gaps of a run for plotting: one point per consecutive pair, lost requests marked by gap index. */
export function runGaps(r: Run) {
  const gaps: { index: number; seq: number | null; dt: number }[] = [];
  const lost: number[] = [];
  for (let i = 1; i < r.times.length; i++) {
    const d = r.seq ? r.seq[i] - r.seq[i - 1] : 1;
    if (d === 1) gaps.push({ index: i - 1, seq: r.seq ? r.seq[i - 1] : null, dt: r.times[i] - r.times[i - 1] });
    else if (d > 1) lost.push(i - 1);
  }
  return { gaps, lost };
}

export const seriesColor = (label: "normal" | "covert") => (label === "covert" ? "var(--series-covert)" : "var(--series-normal)");
