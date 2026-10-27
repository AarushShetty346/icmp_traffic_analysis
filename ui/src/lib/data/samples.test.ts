import { describe, expect, it } from "vitest";
import { parseCaptureCsv } from "./csv";
import { fromBundle } from "./runs";
import { pickSampleRuns, runToCsv, SAMPLE_NAMES, sampleFiles } from "./samples";
import type { BundleRun } from "./schema";

const run = (id: string, label: "normal" | "covert", role: BundleRun["role"], channel: string | null): BundleRun => ({
  id, label, role, source: "simulated", condition: "jitter 20 ms", delayModel: "netem", channel,
  times: [0, 1.01, 1.99, 3.02], seq: [0, 1, 2, 3], bits: label === "covert" ? "010" : null, file: null,
} as unknown as BundleRun);

const runs = [
  run("sim-b1", "normal", "baseline-matched", null),
  run("sim-n1", "normal", "test", null),
  run("sim-c1", "covert", "test", "0.90/1.10 s"),
  run("sim-c2", "covert", "test", "0.95/1.05 s"),
].map(fromBundle);

describe("sample CSVs", () => {
  it("picks a baseline, a normal test and a covert test run from one condition", () => {
    const p = pickSampleRuns(runs)!;
    expect([p.baseline.id, p.normal.id, p.covert.id]).toEqual(["sim-b1", "sim-n1", "sim-c2"]);
  });
  it("round-trips through the user CSV parser and stays marked simulated", () => {
    const parsed = parseCaptureCsv(runToCsv(runs[3]), "x.csv");
    expect(parsed.simulated).toBe(true);
    expect(parsed.seq).toEqual([0, 1, 2, 3]);
    expect(parsed.times).toEqual(runs[3].times);
  });
  it("gives each file its role and the simulated source", () => {
    const s = sampleFiles(runs)!;
    expect(s.files.map((f) => f.name)).toEqual(Object.values(SAMPLE_NAMES));
    expect(s.known[SAMPLE_NAMES.baseline]).toMatchObject({ role: "baseline-matched", label: "normal", source: "simulated" });
    expect(s.known[SAMPLE_NAMES.normal]).toMatchObject({ role: "test", label: "normal", source: "simulated" });
    expect(s.known[SAMPLE_NAMES.covert]).toMatchObject({ role: "test", label: "covert", source: "simulated", bits: "010" });
  });
  it("returns nothing when the bundle has no complete set", () => {
    expect(sampleFiles(runs.slice(1))).toBeNull();
  });
});
