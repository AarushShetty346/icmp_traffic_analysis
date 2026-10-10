// Review 3 checklist. Objective wording is only filled in where it is known from the rebuild brief;
// the Review 1 report itself is not in the repository. Edit the `text` fields to match it.
import type { Bundle } from "../lib/data/schema";

export type Status = "met" | "code-ready" | "simulated-only" | "unknown";

export interface Objective { n: number; text: string; status: Status; evidence: string; links: { label: string; href: string }[] }

const REPO = "https://github.com/AarushShetty346/icmp_traffic_analysis/blob/main/";

export function objectives(b: Bundle | null): Objective[] {
  const realNormal = !!b?.runs.some((r) => r.source === "capture" && r.label === "normal");
  const realCovert = !!b?.runs.some((r) => r.source === "capture" && r.label === "covert");
  const realMatrix = !!b?.matrix.some((m) => m.source === "capture");
  const unknown = (n: number): Objective => ({
    n, text: "Wording not in the repository: copy it from the Review 1 report into ui/src/content/evidence.ts.",
    status: "unknown", evidence: "Not mapped yet.", links: [],
  });
  return [
    { n: 1, text: "Capture real normal ICMP traffic on the testbed.", status: realNormal ? "met" : "code-ready",
      evidence: realNormal ? "Real normal runs are in this bundle." : "Capture and export scripts exist; no real normal capture is in the data yet.",
      links: [{ label: "scripts/lab/capture.sh", href: `${REPO}scripts/lab/capture.sh` }] },
    { n: 2, text: "Build a real controlled timing-channel generator.", status: realCovert ? "met" : "code-ready",
      evidence: realCovert ? "Real covert runs from the generator are in this bundle." : "Scapy generator with lab guards and send manifests exists; not yet run on the testbed.",
      links: [{ label: "icmp_detector/generator.py", href: `${REPO}icmp_detector/generator.py` }] },
    { n: 3, text: "Capture the generator's traffic at the receiver.", status: realCovert ? "met" : "code-ready",
      evidence: realCovert ? "Receiver captures of covert runs are in this bundle." : "Receiver capture script exists; no covert capture yet.",
      links: [{ label: "scripts/lab/README.md", href: `${REPO}scripts/lab/README.md` }] },
    unknown(4), unknown(5), unknown(6), unknown(7), unknown(8),
    { n: 9, text: "Repeat the experiments under added jitter and load (tc netem, iperf3).", status: realMatrix ? "met" : "simulated-only",
      evidence: realMatrix ? "Real-capture rows exist in the stress matrix." : "netem / iperf3 scripts exist; the stress matrix is simulated only.",
      links: [{ label: "scripts/lab/netem.sh", href: `${REPO}scripts/lab/netem.sh` }, { label: "Stress matrix", href: "#/stress" }] },
    unknown(10),
  ];
}

export const STATUS_TEXT: Record<Status, string> = {
  met: "Met with real data",
  "code-ready": "Code ready, waiting for lab data",
  "simulated-only": "Simulated only",
  unknown: "Not mapped",
};

export const LIMITS = [
  "No real captures yet: every number in the shipped bundle is simulated.",
  "The baseline is small and correlated: 10–20 runs of 64 requests give 20–40 windows of 32, so the 95th percentile is noisy and clean-traffic false-positive rates sit at 15–25 %, not 5 %.",
  "Both simulated delay models are approximations of tc netem behaviour, not measurements of the testbed.",
  "The planned 0.75/1.25 s channel is trivially separable; conclusions should lead with the subtle 0.95/1.05 s and 0.98/1.02 s channels.",
  "The decoder does not model clock drift between sender and receiver.",
  "Non-timing differences (TTL, IP id, payload) between the real senders are not measured until the field check runs on real captures.",
  "Speed figures measure CPU per window only, not live capture or many flows at once.",
];
