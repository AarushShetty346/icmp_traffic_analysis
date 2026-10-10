// Port of icmp_detector/detector.py, experiment.build_baseline and evaluation.py.
import { ALL_FEATURES, FEATURES, ksDistance, windowFeatures, windows, type FeatureName, type Features } from "./features";
import { diff, mean, median, percentile, searchLeft, sorted, std } from "./stats";

export const DIRECTION: Record<FeatureName, "upper" | "both"> = {
  mean: "both", median: "both", min: "both", max: "upper", var: "upper", std: "upper",
  cv: "upper", iqr: "upper", entropy: "upper", off_nominal: "upper", ks: "upper",
};

export interface Flow { times: number[]; seq: number[] | null }

export interface Baseline {
  percentile: number;
  windowSize: number;
  step: number;
  nWindows: number;
  lower: Partial<Record<FeatureName, number>>;
  upper: Partial<Record<FeatureName, number>>;
  reference: number[];
}

/** Gaps between consecutively numbered requests (all gaps without sequence numbers). */
export function consecutiveGaps(times: number[], seq: number[] | null): number[] {
  const ipd = diff(times);
  if (!seq) return ipd;
  const d = diff(seq);
  return ipd.filter((_, i) => d[i] === 1);
}

export function fitBaseline(
  normalWindows: number[][],
  pct = 95,
  windowSize = 0,
  reference: number[] | null = null,
  ksValues: number[] | null = null,
  step = 0,
): Baseline {
  if (normalWindows.length === 0) throw new Error("baseline needs at least one normal window");
  const feats: Partial<Features>[] = normalWindows.map((w) => windowFeatures(w));
  const ref = reference && reference.length ? sorted(reference) : null;
  if (ref) {
    const ks = ksValues ?? normalWindows.map((w) => ksDistance(w, ref));
    feats.forEach((f, i) => (f.ks = ks[i]));
  }
  const names: FeatureName[] = [...FEATURES, ...(ref ? (["ks"] as const) : [])];
  const tail = (100 - pct) / 2;
  const lower: Baseline["lower"] = {};
  const upper: Baseline["upper"] = {};
  for (const name of names) {
    const values = feats.map((f) => f[name]!);
    if (DIRECTION[name] === "upper") upper[name] = percentile(values, pct);
    else {
      lower[name] = percentile(values, tail);
      upper[name] = percentile(values, 100 - tail);
    }
  }
  return { percentile: pct, windowSize, step, nWindows: feats.length, lower, upper, reference: ref ?? [] };
}

/** experiment.build_baseline: KS threshold fitted leave-one-run-out. */
export function buildBaseline(flows: Flow[], windowSize: number, pct = 95, step: number | null = null): Baseline {
  const perRun = flows.map((f) => windows(f.times, windowSize, step, f.seq));
  const wins = perRun.flat();
  const gaps = flows.map((f) => consecutiveGaps(f.times, f.seq));
  const reference = gaps.flat();
  let ksValues: number[] | null = null;
  if (flows.length > 1) {
    ksValues = [];
    perRun.forEach((ws, i) => {
      const others = gaps.filter((_, j) => j !== i).flat();
      for (const w of ws) ksValues!.push(ksDistance(w, others));
    });
  }
  return fitBaseline(wins, pct, windowSize, reference, ksValues, step ?? 0);
}

export function featuresOf(ipd: number[], baseline: Baseline | null): Features {
  const f = windowFeatures(ipd) as Features;
  f.ks = baseline && baseline.reference.length ? ksDistance(ipd, baseline.reference) : NaN;
  return f;
}

export interface Decision { suspicious: boolean; reasons: string[]; features: Features }

export function classifyBaseline(ipd: number[], baseline: Baseline, features: FeatureName[] = ["std"]): Decision {
  const feats = featuresOf(ipd, baseline);
  const reasons: string[] = [];
  for (const name of features) {
    const v = feats[name];
    const hi = baseline.upper[name];
    const lo = baseline.lower[name];
    if (hi !== undefined && v > hi) reasons.push(`${name} ${fmt(v)} above baseline p${baseline.percentile} ${fmt(hi)}`);
    if (lo !== undefined && v < lo) reasons.push(`${name} ${fmt(v)} below baseline lower ${fmt(lo)}`);
  }
  return { suspicious: reasons.length > 0, reasons, features: feats };
}

export interface FixedRule { nominal: number; meanTol: number; stdTol: number }
export const DEFAULT_FIXED: FixedRule = { nominal: 1.0, meanTol: 0.1, stdTol: 0.1 };

export function classifyFixed(ipd: number[], rule: FixedRule = DEFAULT_FIXED): Decision {
  const feats = windowFeatures(ipd) as Features;
  feats.ks = NaN;
  const reasons: string[] = [];
  if (feats.std > rule.stdTol) reasons.push(`std ${fmt(feats.std)} above fixed ${rule.stdTol}`);
  const drift = Math.abs(feats.mean - rule.nominal);
  if (drift > rule.meanTol) reasons.push(`mean drift ${fmt(drift)} above fixed ${rule.meanTol}`);
  return { suspicious: reasons.length > 0, reasons, features: feats };
}

const fmt = (x: number) => x.toFixed(4);

/** Suspicion score for ROC sweeps (Baseline.score). */
export function score(baseline: Baseline, name: FeatureName, value: number): number {
  if (DIRECTION[name] === "upper") return value;
  const centre = (baseline.lower[name]! + baseline.upper[name]!) / 2;
  return Math.abs(value - centre);
}

export function scoreThreshold(baseline: Baseline, name: FeatureName): number {
  if (DIRECTION[name] === "upper") return baseline.upper[name]!;
  return (baseline.upper[name]! - baseline.lower[name]!) / 2;
}

export interface RocPoint { threshold: number | null; fpr: number; tpr: number; precision: number | null }

/** evaluation.roc_curve: one point per distinct score, "suspicious when score >= threshold". */
export function rocCurve(normalScores: number[], channelScores: number[]): RocPoint[] {
  const neg = sorted(normalScores);
  const pos = sorted(channelScores);
  if (!neg.length || !pos.length) throw new Error("ROC needs at least one normal and one channel score");
  const thresholds = [...new Set([...neg, ...pos])].sort((a, b) => b - a);
  const pts: RocPoint[] = [{ threshold: null, fpr: 0, tpr: 0, precision: null }];
  for (const t of thresholds) {
    const tp = pos.length - searchLeft(pos, t);
    const fp = neg.length - searchLeft(neg, t);
    pts.push({ threshold: t, fpr: fp / neg.length, tpr: tp / pos.length, precision: tp + fp ? tp / (tp + fp) : null });
  }
  return pts;
}

export function auc(points: RocPoint[]): number {
  let a = 0;
  for (let i = 1; i < points.length; i++) a += (points[i].fpr - points[i - 1].fpr) * ((points[i].tpr + points[i - 1].tpr) / 2);
  return a;
}

export function featureScores(baseline: Baseline, wins: number[][], feature: FeatureName): number[] {
  return wins.map((w) => score(baseline, feature, featuresOf(w, baseline)[feature]));
}

export interface Rates { tp: number; fn: number; fp: number; tn: number; detectionRate: number; falsePositiveRate: number; precision: number }

export function confusion(truth: boolean[], predicted: boolean[]): Rates {
  let tp = 0, fn = 0, fp = 0, tn = 0;
  truth.forEach((t, i) => {
    const p = predicted[i];
    if (t && p) tp++; else if (t) fn++; else if (p) fp++; else tn++;
  });
  return {
    tp, fn, fp, tn,
    detectionRate: tp + fn ? tp / (tp + fn) : NaN,
    falsePositiveRate: fp + tn ? fp / (fp + tn) : NaN,
    precision: tp + fp ? tp / (tp + fp) : NaN,
  };
}

export { ALL_FEATURES, mean, median, std };
