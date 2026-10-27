// Three example CSVs built from the bundled simulated study, so a demo can show the import path without lab files.
import type { KnownExample } from "./DataContext";
import type { Run } from "./runs";

export const SAMPLE_PREFIX = "sample_simulated_";
export const SAMPLE_NAMES = {
  baseline: `${SAMPLE_PREFIX}baseline_normal.csv`,
  normal: `${SAMPLE_PREFIX}test_normal.csv`,
  covert: `${SAMPLE_PREFIX}test_covert.csv`,
} as const;

const PREFERRED = { delayModel: "netem", condition: "jitter 20 ms", channel: "0.95/1.05 s" };

/** The same tshark-style columns the lab export writes, plus `simulated` so the parser marks the file simulated. */
export function runToCsv(r: Run): string {
  const header = r.seq ? "frame.time_epoch,icmp.seq,simulated" : "frame.time_epoch,simulated";
  const rows = r.times.map((t, i) => (r.seq ? `${t.toFixed(6)},${r.seq[i]},1` : `${t.toFixed(6)},1`));
  return `${header}\n${rows.join("\n")}\n`;
}

/** One matched-baseline normal run, one normal test run and one covert test run from the same simulated condition. */
export function pickSampleRuns(runs: Run[]): { baseline: Run; normal: Run; covert: Run } | null {
  const sim = runs.filter((r) => r.origin === "bundle" && r.source === "simulated");
  const find = (delayModel: string | null, condition: string, channel: string | null) => {
    const same = sim.filter((r) => (delayModel === null || r.delayModel === delayModel) && r.condition === condition);
    const baseline = same.find((r) => r.role === "baseline-matched");
    const normal = same.find((r) => r.role === "test" && r.label === "normal");
    const covert = same.find((r) => r.role === "test" && r.label === "covert" && (channel === null || r.channel === channel));
    return baseline && normal && covert ? { baseline, normal, covert } : null;
  };
  const preferred = find(PREFERRED.delayModel, PREFERRED.condition, PREFERRED.channel);
  if (preferred) return preferred;
  for (const r of sim) {
    if (r.role !== "baseline-matched") continue;
    const any = find(r.delayModel, r.condition, null);
    if (any) return any;
  }
  return null;
}

/** The three sample files and the roles they must receive; every one is labelled simulated. */
export function sampleFiles(runs: Run[]): { files: File[]; known: Record<string, KnownExample> } | null {
  const picked = pickSampleRuns(runs);
  if (!picked) return null;
  const files: File[] = [];
  const known: Record<string, KnownExample> = {};
  for (const [key, role] of [["baseline", "baseline-matched"], ["normal", "test"], ["covert", "test"]] as const) {
    const run = picked[key];
    const name = SAMPLE_NAMES[key];
    files.push(new File([runToCsv(run)], name, { type: "text/csv" }));
    known[name] = {
      source: "simulated", label: run.label, role, condition: `sample · ${run.condition}`,
      channel: run.channel, delayModel: run.delayModel, bits: run.bits,
    };
  }
  return { files, known };
}
