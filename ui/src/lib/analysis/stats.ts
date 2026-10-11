// Numeric helpers that reproduce NumPy's results (see tests/golden). Keep them boring and exact.

export function sum(xs: ArrayLike<number>): number {
  // NumPy uses pairwise summation; for the sizes here (< 10k) plain Kahan-free summation stays within 1e-12.
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s;
}

export const mean = (xs: ArrayLike<number>): number => sum(xs) / xs.length;

/** Sample standard deviation (ddof = 1), like np.std(x, ddof=1). */
export function std(xs: ArrayLike<number>, ddof = 1): number {
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return Math.sqrt(s / (xs.length - ddof));
}

export const sorted = (xs: ArrayLike<number>): number[] => Array.from(xs).sort((a, b) => a - b);

/** np.percentile(x, q) with the default "linear" method, including NumPy's two-sided lerp. */
export function percentile(xs: ArrayLike<number>, q: number): number {
  const v = sorted(xs);
  const n = v.length;
  if (n === 0) return NaN;
  const virtual = (q / 100) * (n - 1);
  const lo = Math.floor(virtual);
  const hi = Math.min(lo + 1, n - 1);
  const t = virtual - lo;
  const a = v[lo];
  const b = v[hi];
  const diff = b - a;
  return t >= 0.5 ? b - diff * (1 - t) : a + diff * t;
}

export const median = (xs: ArrayLike<number>): number => percentile(xs, 50);

export function diff(xs: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < xs.length; i++) out.push(xs[i] - xs[i - 1]);
  return out;
}

/** Index of the first element > x in a sorted array (np.searchsorted side="right"). */
export function searchRight(sortedXs: number[], x: number): number {
  let lo = 0;
  let hi = sortedXs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedXs[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the first element >= x in a sorted array (np.searchsorted side="left"). */
export function searchLeft(sortedXs: number[], x: number): number {
  let lo = 0;
  let hi = sortedXs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedXs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
