// Port of icmp_detector/features.py. Parity with Python is asserted against tests/golden.
import { diff, mean, median, percentile, searchRight, sorted, std } from "./stats";

export const ENTROPY_BIN = 0.02;
export const OFF_NOMINAL = 0.1;
export const FEATURES = ["mean", "var", "std", "cv", "median", "iqr", "min", "max", "entropy", "off_nominal"] as const;
export const ALL_FEATURES = [...FEATURES, "ks"] as const;
export type FeatureName = (typeof ALL_FEATURES)[number];
export type Features = Record<FeatureName, number>;

/** Plain-language explanations, shown in tooltips next to every statistic. */
export const FEATURE_HELP: Record<FeatureName, string> = {
  mean: "Average gap between Echo Requests in the window, in seconds. Normal ping sits near 1 s.",
  var: "Variance of the gaps (s²): how spread out they are, squared.",
  std: "Standard deviation of the gaps (s). A timing channel switching between two gap lengths raises it.",
  cv: "Coefficient of variation: standard deviation divided by the mean, so it has no unit.",
  median: "Middle gap of the window (s). Less affected by single outliers than the mean.",
  iqr: "Interquartile range (s): width of the middle half of the gaps.",
  min: "Shortest gap in the window (s).",
  max: "Longest gap in the window (s).",
  entropy: "Shannon entropy (bits) of the gaps grouped into 20 ms bins. More distinct gap lengths, higher entropy.",
  off_nominal: "Share of gaps more than 100 ms away from the window's median gap.",
  ks: "Kolmogorov-Smirnov distance: the largest gap between this window's gap distribution and normal traffic's (0 to 1).",
};

export const interPacketDelays = (times: ArrayLike<number>): number[] => diff(times);

/** Observation windows of `size` requests; gaps across a missing sequence number are dropped. */
export function windows(times: ArrayLike<number>, size: number, step?: number | null, seq?: ArrayLike<number> | null): number[][] {
  if (size < 3) throw new Error("window size must be at least 3 requests");
  const s = step || size;
  const out: number[][] = [];
  for (let start = 0; start + size <= times.length; start += s) {
    let ipd = diff(Array.from(times).slice(start, start + size));
    if (seq) {
      const sq = Array.from(seq).slice(start, start + size);
      const d = diff(sq);
      ipd = ipd.filter((_, i) => d[i] === 1);
    }
    if (ipd.length >= 2) out.push(ipd);
  }
  return out;
}

/** Start index (in requests) of each window, for drawing window boundaries. */
export function windowStarts(n: number, size: number, step?: number | null): number[] {
  const s = step || size;
  const out: number[] = [];
  for (let start = 0; start + size <= n; start += s) out.push(start);
  return out;
}

function entropy(ipd: number[]): number {
  const counts = new Map<number, number>();
  for (const g of ipd) {
    const b = Math.floor(g / ENTROPY_BIN);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort((a, b) => a - b);
  let h = 0;
  for (const k of keys) {
    const p = counts.get(k)! / ipd.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function windowFeatures(ipd: number[]): Omit<Features, "ks"> {
  const m = mean(ipd);
  const s = ipd.length > 1 ? std(ipd) : 0;
  const med = median(ipd);
  const q1 = percentile(ipd, 25);
  const q3 = percentile(ipd, 75);
  let off = 0;
  for (const g of ipd) if (Math.abs(g - med) > OFF_NOMINAL) off++;
  return {
    mean: m,
    var: s ** 2,
    std: s,
    cv: m > 0 ? s / m : 0,
    median: med,
    iqr: q3 - q1,
    min: Math.min(...ipd),
    max: Math.max(...ipd),
    entropy: entropy(ipd),
    off_nominal: off / ipd.length,
  };
}

/** Empirical CDF of `values` at the points `at`. */
export function ecdf(values: ArrayLike<number>, at: ArrayLike<number>): number[] {
  const v = sorted(values);
  return Array.from(at, (x) => searchRight(v, x) / v.length);
}

/** Two-sample Kolmogorov-Smirnov statistic, same as features.ks_distance. */
export function ksDistance(sample: ArrayLike<number>, reference: ArrayLike<number>): number {
  if (sample.length === 0 || reference.length === 0) return NaN;
  const a = sorted(sample);
  const b = sorted(reference);
  let best = 0;
  for (const x of [...a, ...b]) {
    const d = Math.abs(searchRight(a, x) / a.length - searchRight(b, x) / b.length);
    if (d > best) best = d;
  }
  return best;
}
