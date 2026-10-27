// Review 3 checklist: the ten Review 1 objectives, worded as in the Review 1 report, with the status and
// evidence given in the Review 3 report's scorecard (3 met, 6 partly met, 1 not met). An objective that
// needs real lab data moves to "met" once matching real captures are in the bundle.
import type { Bundle } from "../lib/data/schema";

export type Status = "met" | "partly" | "not-met" | "code-ready" | "simulated-only" | "unknown";

export interface Objective { n: number; text: string; status: Status; evidence: string; links: { label: string; href: string }[] }

const REPO = "https://github.com/AarushShetty346/icmp_traffic_analysis/blob/main/";

export function objectives(b: Bundle | null): Objective[] {
  const realNormal = !!b?.runs.some((r) => r.source === "capture" && r.label === "normal");
  const realCovert = !!b?.runs.some((r) => r.source === "capture" && r.label === "covert");
  const realMatrix = !!b?.matrix.some((m) => m.source === "capture");
  const link = (path: string) => ({ label: path, href: `${REPO}${path}` });
  return [
    { n: 1, text: "Generate normal ICMP Echo Request traffic in a controlled LAN and collect it as baseline data.",
      status: realNormal ? "met" : "not-met",
      evidence: realNormal ? "Real normal runs are in this bundle." : "Normal-data simulator and ping script exist; no receiver-side LAN normal captures.",
      links: [link("scripts/lab/send_normal.sh"), link("scripts/lab/capture.sh")] },
    { n: 2, text: "Implement a controlled timing-pattern generator that represents a short test bit sequence using two planned inter-packet delay ranges.",
      status: realCovert ? "met" : "partly",
      evidence: realCovert ? "Real covert runs from the generator are in this bundle." : "Scapy generator and safeguards implemented; no verified live sent/received packet series.",
      links: [link("icmp_detector/generator.py")] },
    { n: 3, text: "Capture receiver-side ICMP Echo Request timestamps and filter packets by source/destination and ICMP flow identifiers where applicable.",
      status: realCovert ? "met" : "partly",
      evidence: realCovert ? "Receiver captures of covert runs are in this bundle." : "Capture scripts and flow filters implemented; no actual receiver capture demonstrated.",
      links: [link("scripts/lab/README.md"), link("icmp_detector/capture.py")] },
    { n: 4, text: "Calculate inter-packet delay as Δtᵢ = tᵢ − tᵢ₋₁ for the filtered Echo Request sequence.", status: "met",
      evidence: "IPD extractor implemented and exercised on simulated timestamps.",
      links: [link("icmp_detector/capture.py"), { label: "Signal", href: "#/signal" }] },
    { n: 5, text: "Extract a defined feature set from fixed-size observation windows: mean, variance, standard deviation and distribution-oriented measurements/visualisations.",
      status: "met", evidence: "Feature extraction and 8/16/32 window comparisons and plots available.",
      links: [link("icmp_detector/features.py"), { label: "Signal", href: "#/signal" }] },
    { n: 6, text: "Construct a normal timing baseline from multiple normal-traffic runs.", status: realNormal ? "met" : "partly",
      evidence: realNormal ? "A baseline can be built from the real normal runs in this bundle." : "10 synthetic normal runs yield 20 W=32 windows; no real normal-traffic baseline.",
      links: [link("icmp_detector/experiment.py")] },
    { n: 7, text: "Implement and compare two simple decision approaches: a fixed threshold/rule and a threshold derived from the measured normal baseline.",
      status: "met", evidence: "Both comparators implemented and scored using controlled simulated cases.",
      links: [link("icmp_detector/detector.py"), { label: "Detectors", href: "#/detectors" }] },
    { n: 8, text: "Evaluate both approaches on labelled normal and controlled timing-channel windows using detection rate and false-positive rate.",
      status: realMatrix ? "met" : "partly",
      evidence: realMatrix ? "Real-capture rows exist in the stress matrix." : "Complete simulated tables exist; no validated physical traffic evaluation.",
      links: [link("results/netem/RESULTS.md"), { label: "Stress matrix", href: "#/stress" }] },
    { n: 9, text: "Repeat selected tests under controlled additional jitter/load and with different observation-window sizes to study robustness.",
      status: realMatrix ? "met" : "partly",
      evidence: realMatrix ? "Real-capture rows exist in the stress matrix." : "Simulated jitter/loss and window-size sweeps exist; no real tc netem or iperf3 load trials.",
      links: [link("scripts/lab/netem.sh"), link("scripts/lab/load.sh"), { label: "Stress matrix", href: "#/stress" }] },
    { n: 10, text: "Measure decoding accuracy of the controlled test message so that packet loss/timing disturbance can be related to channel reliability.",
      status: realCovert ? "met" : "partly",
      evidence: realCovert ? "Decoding accuracy is measured on real covert captures." : "Simulated bit-recovery accuracy reported; receiver capture accuracy unverified.",
      links: [link("icmp_detector/metrics.py"), { label: "Decode", href: "#/decode" }] },
  ];
}

export const STATUS_TEXT: Record<Status, string> = {
  met: "Met",
  partly: "Partly met",
  "not-met": "Not met",
  "code-ready": "Code ready, waiting for lab data",
  "simulated-only": "Simulated only",
  unknown: "Not mapped",
};

export const LIMITS = [
  "No actual LAN captures: results do not prove detection on physical sender/receiver links or real network equipment.",
  "Hardware / OS not documented: packet timestamp fidelity, sender scheduler accuracy and capture platform cannot be established.",
  "No completed Scapy vs ping field check: TTL, IP IDs, sequence/payload differences may disclose the sender independently of timing.",
  "Simulation approximates netem: modelled jitter/loss and buffering may differ from actual qdisc scheduling and network load.",
  "Small baseline (20 windows at W=32): the p95 threshold is noisy; the observed clean 15–25% FPR challenges nominal calibration.",
  "Limited seeds / run-level dependence: single-seed tables are illustrative; the multi-seed spread and bootstrap intervals are also given.",
  "Sparse 5% loss windows: at W=32 only 10 covert / 12 normal windows, so one decision shifts DR by 10 pp or FPR by 8.3 pp.",
  "No iperf3 load experiment: the effect of actual background congestion/load remains unmeasured.",
  "No sender-receiver gap comparison: configured gaps cannot be conflated with measured receiver arrival gaps.",
  "The decoder model does not include long-term sender pacing drift or receiver timestamp clock error.",
];

export const REFERENCES = [
  "J. Postel, \u201cInternet Control Message Protocol,\u201d RFC 792, September 1981. doi: 10.17487/RFC0792.",
  "S. Cabuk, C. E. Brodley, and C. Shields, \u201cIP Covert Timing Channels: Design and Detection,\u201d Proceedings of ACM CCS, pp. 178\u2013187, 2004. doi: 10.1145/1030083.1030108.",
  "S. Gianvecchio and H. Wang, \u201cDetecting Covert Timing Channels: An Entropy-Based Approach,\u201d Proceedings of ACM CCS, pp. 307\u2013316, 2007.",
  "F. Iglesias V\u00e1zquez, R. Annessi, and T. Zseby, \u201cAnalytic Study of Features for the Detection of Covert Timing Channels in Network Traffic,\u201d Journal of Cyber Security and Mobility, vol. 6, no. 3, pp. 245\u2013270, 2017. doi: 10.13052/2245-1439.632.",
  "X. Luo, E. W. W. Chan, and R. K. C. Chang, \u201cTCP Covert Timing Channels: Design and Detection,\u201d Proceedings of DSN, pp. 420\u2013429, 2008. doi: 10.1109/DSN.2008.4630112.",
  "A. Ondov and P. Helebrandt, \u201cCovert Channel Detection Methods,\u201d ICETA, pp. 491\u2013496, 2022. doi: 10.1109/ICETA57911.2022.9974878.",
  "K. Meusburger, \u201cOn the Statistical Detectability of Covert Timing Channels,\u201d Diploma Thesis, TU Wien, 2023. doi: 10.34726/hss.2023.113904.",
  "V. Berk, A. Giani, and G. Cybenko, \u201cDetection of Covert Channel Encoding in Network Packet Delays,\u201d Dartmouth College Technical Report TR2005-536, 2005.",
];
