// Golden-fixture parity: the browser port must reproduce Python to 1e-9.
// Fixtures: python -m icmp_detector golden --out tests/golden
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_FEATURES, FEATURES, ksDistance, windowFeatures, windows, type FeatureName } from "./features";
import { auc, buildBaseline, classifyBaseline, classifyFixed, featureScores, rocCurve, scoreThreshold, type Flow } from "./detect";
import { decodeBits, twoMeansThreshold } from "./decode";
import { percentile } from "./stats";

const TOL = 1e-9;
const golden = (name: string) => JSON.parse(readFileSync(resolve(__dirname, "../../../../tests/golden", name), "utf8"));
const close = (a: number | null, b: number | null, what: string) => {
  if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) {
    expect(a === null || Number.isNaN(a as number), what).toBe(b === null || Number.isNaN(b as number));
    return;
  }
  expect(Math.abs(a - b), `${what}: ${a} vs ${b}`).toBeLessThanOrEqual(TOL);
};
const cases: Record<string, { times: number[]; seq: number[] | null; bits: number[] | null }> = Object.fromEntries(
  golden("cases.json").cases.map((c: { name: string }) => [c.name, c]),
);
const flow = (name: string): Flow => ({ times: cases[name].times, seq: cases[name].seq });

describe("stats", () => {
  it("percentile matches numpy", () => {
    for (const p of golden("stats.json").percentile) close(percentile(p.values, p.q), p.result, `p${p.q}`);
  });
  it("KS distance matches", () => {
    for (const k of golden("stats.json").ks) close(ksDistance(k.a, k.b), k.result, "ks");
  });
  it("2-means threshold matches", () => {
    for (const k of golden("stats.json").twoMeans) close(twoMeansThreshold(k.gaps), k.result, "2-means");
  });
});

describe("windows and features", () => {
  for (const item of golden("windows.json").items) {
    it(`${item.case} size ${item.size} step ${item.step}`, () => {
      const wins = windows(cases[item.case].times, item.size, item.step, cases[item.case].seq);
      expect(wins.length).toBe(item.windows.length);
      wins.forEach((w, i) => {
        expect(w.length).toBe(item.windows[i].length);
        w.forEach((g, j) => close(g, item.windows[i][j], `gap ${i}.${j}`));
        const f = windowFeatures(w);
        for (const name of FEATURES) close(f[name], item.features[i][name], `${name} window ${i}`);
      });
    });
  }
});

describe("baseline fit", () => {
  for (const b of golden("baseline.json").items) {
    it(`window ${b.size} step ${b.step}`, () => {
      const fit = buildBaseline(b.runs.map(flow), b.size, b.percentile, b.step);
      expect(fit.nWindows).toBe(b.nWindows);
      for (const k of Object.keys(b.upper)) close(fit.upper[k as FeatureName]!, b.upper[k], `upper ${k}`);
      for (const k of Object.keys(b.lower)) close(fit.lower[k as FeatureName]!, b.lower[k], `lower ${k}`);
      expect(fit.reference.length).toBe(b.reference.length);
      fit.reference.forEach((x, i) => close(x, b.reference[i], "reference"));
    });
  }
});

describe("detectors", () => {
  const baselines = golden("baseline.json").items;
  for (const d of golden("detect.json").items) {
    it(`${d.case} window ${d.size} features ${d.features.join("+")}`, () => {
      const b = baselines.find((x: { size: number; step: number | null }) => x.size === d.size && x.step === d.step);
      const fit = buildBaseline(b.runs.map(flow), b.size, b.percentile, b.step);
      const wins = windows(cases[d.case].times, d.size, d.step, cases[d.case].seq);
      expect(wins.map((w) => classifyBaseline(w, fit, d.features).suspicious)).toEqual(d.baselineFlags);
      expect(wins.map((w) => classifyFixed(w).suspicious)).toEqual(d.fixedFlags);
      wins.forEach((w, i) => close(ksDistance(w, fit.reference), d.ks[i], "ks"));
    });
  }
});

describe("ROC", () => {
  const baselines = golden("baseline.json").items;
  for (const r of golden("roc.json").items) {
    it(`${r.feature} window ${r.size}`, () => {
      const b = baselines.find((x: { size: number; step: number | null }) => x.size === r.size && x.step === r.step);
      const fit = buildBaseline(b.runs.map(flow), b.size, b.percentile, b.step);
      const neg = featureScores(fit, windows(cases.normal_lossy.times, r.size, r.step, cases.normal_lossy.seq), r.feature);
      const pos = [
        ...featureScores(fit, windows(cases.covert_subtle.times, r.size, r.step, cases.covert_subtle.seq), r.feature),
        ...featureScores(fit, windows(cases.covert_lossy.times, r.size, r.step, cases.covert_lossy.seq), r.feature),
      ];
      neg.forEach((x, i) => close(x, r.negative[i], "neg score"));
      pos.forEach((x, i) => close(x, r.positive[i], "pos score"));
      const pts = rocCurve(neg, pos);
      expect(pts.length).toBe(r.points.length);
      pts.forEach((p, i) => {
        close(p.threshold, r.points[i].threshold, "threshold");
        close(p.fpr, r.points[i].fpr, "fpr");
        close(p.tpr, r.points[i].tpr, "tpr");
        close(p.precision, r.points[i].precision, "precision");
      });
      close(auc(pts), r.auc, "auc");
      close(scoreThreshold(fit, r.feature), r.operatingThreshold, "operating threshold");
    });
  }
  it("covers every feature", () => {
    expect(new Set(golden("roc.json").items.map((r: { feature: string }) => r.feature))).toEqual(new Set(ALL_FEATURES));
  });
});

describe("decoding", () => {
  for (const d of golden("decode.json").items) {
    it(d.case, () => {
      const c = cases[d.case];
      const thr = twoMeansThreshold(
        c.times.slice(1).map((t, i) => t - c.times[i]).filter((_, i) => c.seq![i + 1] - c.seq![i] === 1),
      );
      close(thr, d.adaptiveThreshold, "adaptive threshold");
      const asObj = (m: Map<number, number>) => Object.fromEntries([...m].map(([k, v]) => [String(k), v]));
      expect(asObj(decodeBits(c.times, c.seq, 1.0))).toEqual(d.fixed);
      expect(asObj(decodeBits(c.times, c.seq, thr))).toEqual(d.adaptive);
      expect(asObj(decodeBits(c.times, null, 1.0))).toEqual(d.noSeq);
    });
  }
});
