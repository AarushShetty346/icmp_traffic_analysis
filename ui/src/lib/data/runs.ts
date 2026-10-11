// The one run type every view uses, whether it came from the exported bundle or a dropped CSV.
import type { Bundle, BundleRun, Source } from "./schema";
import type { ParsedCapture } from "./csv";

export type Label = "normal" | "covert";
export type Role = "baseline-clean" | "baseline-matched" | "test";

export interface Run {
  id: string;
  name: string;
  label: Label;
  source: Source;
  role: Role;
  origin: "bundle" | "upload";
  condition: string;
  delayModel: "folded" | "netem" | null;
  channel: string | null;
  times: number[];
  seq: number[] | null;
  bits: string | null;
  file?: string;
  capture?: ParsedCapture;
}

export function fromBundle(r: BundleRun): Run {
  return {
    id: r.id,
    name: r.id.replace(/^sim-/, ""),
    label: r.label,
    source: r.source,
    role: r.role,
    origin: "bundle",
    condition: r.condition,
    delayModel: r.delayModel,
    channel: r.channel,
    times: r.times,
    seq: r.seq,
    bits: r.bits,
    file: r.file,
  };
}

export function fromUpload(p: ParsedCapture, index: number): Run {
  const lower = p.name.toLowerCase();
  return {
    id: `upload-${index}-${p.name}`,
    name: p.name,
    label: lower.startsWith("covert") ? "covert" : "normal",
    source: p.simulated ? "simulated" : "capture",
    role: "test",
    origin: "upload",
    condition: "uploaded",
    delayModel: null,
    channel: null,
    times: p.times.map((t) => t - p.times[0]),
    seq: p.seq,
    bits: null,
    file: p.name,
    capture: p,
  };
}

export const runLabel = (r: Run) =>
  r.origin === "upload" ? r.name : `${r.label} · ${r.condition}${r.channel ? ` · ${r.channel}` : ""}${r.delayModel ? ` · ${r.delayModel}` : ""} · #${r.id.split("-").pop()}`;

export function lostPackets(r: Run): number {
  if (!r.seq) return 0;
  let lost = 0;
  for (let i = 1; i < r.seq.length; i++) if (r.seq[i] - r.seq[i - 1] > 1) lost += r.seq[i] - r.seq[i - 1] - 1;
  return lost;
}

export type { Bundle };
