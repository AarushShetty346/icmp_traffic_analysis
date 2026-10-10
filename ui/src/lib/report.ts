// Markdown evidence report built from the loaded bundle. Every number carries its provenance.
import { LIMITS, objectives, STATUS_TEXT } from "../content/evidence";
import type { Bundle } from "./data/schema";
import type { Run } from "./data/runs";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(0)}%`);

export function markdownReport(b: Bundle, uploads: Run[], now = new Date()): string {
  const lines: string[] = [];
  const tag = b.provenance.hasCapture ? (b.provenance.hasSimulated ? "SIMULATED + REAL CAPTURE" : "REAL CAPTURE") : "SIMULATED";
  lines.push("# Detection of ICMP-Based Covert Timing Channels Using Network Traffic Analysis", "");
  lines.push(`Evidence report from the Cadence workbench, ${now.toISOString()}.`, "");
  lines.push(`**Provenance: ${tag}.** ${b.provenance.note}`, "");
  lines.push(`Bundle schema ${b.schemaVersion}, generated ${b.generatedAt}, commit ${b.provenance.commit ?? "unknown"}, seed ${b.provenance.seed}, ` +
    `${b.provenance.runsPerSet} runs per set, ${b.provenance.bootstrapResamples} bootstrap resamples, delay models ${b.provenance.delayModels.join(", ")}.`, "");
  if (uploads.length) lines.push(`${uploads.length} CSV file(s) were added in the browser; they are not part of the numbers below.`, "");

  lines.push("## Review 3 checklist", "", "| # | Objective | Status | Evidence |", "|---|---|---|---|");
  for (const o of objectives(b)) lines.push(`| ${o.n} | ${o.text} | ${STATUS_TEXT[o.status]} | ${o.evidence} |`);
  lines.push("");

  const model = b.provenance.delayModels.at(-1);
  const w = b.settings.defaultWindow;
  const rows = b.matrix.filter((m) => m.window === w && (m.source === "capture" || m.delayModel === model));
  for (const source of ["capture", "simulated"] as const) {
    const part = rows.filter((r) => r.source === source);
    if (!part.length) continue;
    lines.push(`## Stress matrix, window ${w}${source === "simulated" ? `, ${model} delay model` : ""} (${source === "capture" ? "REAL CAPTURE" : "SIMULATED"})`, "");
    lines.push("| Channel | Condition | Detector | Detection (95% CI) | False positives (95% CI) |", "|---|---|---|---|---|");
    for (const r of part) {
      const dr = r.ci ? `${pct(r.detectionRate)} (${pct(r.ci.detection_rate.lo)}–${pct(r.ci.detection_rate.hi)})` : pct(r.detectionRate);
      const fpr = r.ci ? `${pct(r.falsePositiveRate)} (${pct(r.ci.false_positive_rate.lo)}–${pct(r.ci.false_positive_rate.hi)})` : pct(r.falsePositiveRate);
      lines.push(`| ${r.channel} | ${r.condition} | ${r.detector} | ${dr} | ${fpr} |`);
    }
    lines.push("");
  }

  lines.push("## Known limits", "", ...LIMITS.map((l) => `- ${l}`), "");
  lines.push("Defensive analysis for an authorised, closed lab testbed only.", "");
  return lines.join("\n");
}
