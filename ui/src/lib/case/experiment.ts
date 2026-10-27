import { buildBaseline, classifyBaseline, classifyFixed, confusion, type Rates } from "../analysis/detect";
import { windows } from "../analysis/features";
import { decodeBits, decodingAccuracy } from "../analysis/decode";
import type { Run } from "../data/runs";
import { bundleSet } from "../view/select";

export const CASE_CONDITIONS = ["clean", "jitter 20 ms", "jitter 50 ms", "jitter 100 ms"] as const;
export const CASE_CHANNELS = ["0.75/1.25 s", "0.95/1.05 s", "0.98/1.02 s"] as const;
export type CaseCondition = typeof CASE_CONDITIONS[number];
export type CaseChannel = typeof CASE_CHANNELS[number];
export type GuardianMode = "fixed" | "matched" | "clean";

export interface CaseAnalysis {
  reference: Run;
  normal: Run;
  covert: Run;
  baselineWindows: number;
  normalWindows: number;
  covertWindows: number;
  matchedLimit: number;
  cleanLimit: number;
  decisions: Record<GuardianMode, { normal: boolean; covert: boolean; rates: Rates; normalVerdicts: boolean[]; covertVerdicts: boolean[] }>;
  suspectVariation: Record<"normal" | "covert", number>;
}

/** The guided case reuses the same data and detector functions as the full lab. */
export function analyseCase(runs: Run[], condition: CaseCondition, channel: CaseChannel): CaseAnalysis | null {
  const matched = bundleSet(runs, "netem", condition, channel, "matched");
  const clean = bundleSet(runs, "netem", condition, channel, "clean");
  if (!matched.baseline.length || !matched.normal.length || !matched.covert.length || !clean.baseline.length) return null;
  const w = 32;
  const baselineMatched = buildBaseline(matched.baseline.map((r) => ({ times: r.times, seq: r.seq })), w);
  const baselineClean = buildBaseline(clean.baseline.map((r) => ({ times: r.times, seq: r.seq })), w);
  const test = [...matched.normal, ...matched.covert];
  const windowsByRun = test.map((r) => windows(r.times, w, null, r.seq));
  const truth = windowsByRun.flatMap((wins, i) => wins.map(() => test[i].label === "covert"));
  const verdict = (mode: GuardianMode, ipd: number[]) => mode === "fixed"
    ? classifyFixed(ipd).suspicious
    : classifyBaseline(ipd, mode === "matched" ? baselineMatched : baselineClean, ["std"]).suspicious;
  const decisions = (Object.keys({ fixed: 1, matched: 1, clean: 1 }) as GuardianMode[]).reduce((out, mode) => {
    const predicted = windowsByRun.flatMap((ws) => ws.map((ipd) => verdict(mode, ipd)));
    const first = (r: Run) => {
      const w0 = windows(r.times, w, null, r.seq)[0];
      return w0 ? verdict(mode, w0) : false;
    };
    const normalCount = truth.filter((value) => !value).length;
    out[mode] = {
      normal: first(matched.normal[0]), covert: first(matched.covert[0]), rates: confusion(truth, predicted),
      normalVerdicts: predicted.slice(0, normalCount), covertVerdicts: predicted.slice(normalCount),
    };
    return out;
  }, {} as CaseAnalysis["decisions"]);
  const variation = (r: Run) => {
    const win = windows(r.times, w, null, r.seq)[0];
    if (!win) return 0;
    const mean = win.reduce((s, x) => s + x, 0) / win.length;
    return Math.sqrt(win.reduce((s, x) => s + (x - mean) ** 2, 0) / (win.length - 1));
  };
  return {
    reference: matched.normal[1] ?? matched.normal[0],
    normal: matched.normal[0], covert: matched.covert[0],
    baselineWindows: baselineMatched.nWindows,
    normalWindows: truth.filter((x) => !x).length,
    covertWindows: truth.filter(Boolean).length,
    matchedLimit: baselineMatched.upper.std ?? 0,
    cleanLimit: baselineClean.upper.std ?? 0,
    decisions,
    suspectVariation: { normal: variation(matched.normal[0]), covert: variation(matched.covert[0]) },
  };
}

/** A causal teaching model: hold each arrival until a one-second release slot when possible. */
export function paceRun(run: Run, bufferSeconds: number): { times: number[]; averageAddedDelay: number } {
  const times: number[] = [];
  const firstSeq = run.seq?.[0] ?? 0;
  run.times.forEach((arrival, i) => {
    const requestNumber = (run.seq?.[i] ?? i) - firstSeq;
    const slot = run.times[0] + bufferSeconds + requestNumber;
    times.push(Math.max(arrival, slot, i ? times[i - 1] + 0.000001 : -Infinity));
  });
  return { times, averageAddedDelay: times.reduce((sum, release, i) => sum + release - run.times[i], 0) / times.length };
}

export function bitRecovery(run: Run, times: number[]): number | null {
  if (!run.bits) return null;
  return decodingAccuracy([...run.bits].map(Number), decodeBits(times, run.seq, 1));
}
