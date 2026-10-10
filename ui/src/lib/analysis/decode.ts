// Port of icmp_detector/metrics.py decoding.
import { diff } from "./stats";
import { consecutiveGaps } from "./detect";

/** 1-D 2-means split (metrics.two_means_threshold). */
export function twoMeansThreshold(gaps: number[], maxIter = 100): number {
  if (!gaps.length) throw new Error("need at least one gap");
  const lo = Math.min(...gaps);
  const hi = Math.max(...gaps);
  if (lo === hi) return lo;
  let threshold = (lo + hi) / 2;
  for (let i = 0; i < maxIter; i++) {
    const short = gaps.filter((g) => g < threshold);
    const long = gaps.filter((g) => g >= threshold);
    if (!short.length || !long.length) break;
    const m = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const next = (m(short) + m(long)) / 2;
    if (next === threshold) break;
    threshold = next;
  }
  return threshold;
}

export function adaptiveThreshold(times: number[], seq: number[] | null): number {
  return twoMeansThreshold(consecutiveGaps(times, seq));
}

/** metrics.decode_bits: bit index -> bit. */
export function decodeBits(times: number[], seq: number[] | null, threshold = 1.0, seqStart: number | null = null): Map<number, number> {
  const ipd = diff(times);
  const out = new Map<number, number>();
  if (!seq) {
    ipd.forEach((g, i) => out.set(i, g >= threshold ? 1 : 0));
    return out;
  }
  const first = seqStart ?? Math.min(...seq);
  ipd.forEach((g, i) => {
    if (seq[i + 1] - seq[i] === 1) out.set(seq[i] - first, g >= threshold ? 1 : 0);
  });
  return out;
}

export function decodingAccuracy(sent: number[], decoded: Map<number, number>): number {
  if (!sent.length) return NaN;
  let ok = 0;
  sent.forEach((b, i) => { if (decoded.get(i) === b) ok++; });
  return ok / sent.length;
}

export function bitsText(decoded: Map<number, number>, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += decoded.has(i) ? String(decoded.get(i)) : "?";
  return s;
}
