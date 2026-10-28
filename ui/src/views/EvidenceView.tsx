import { BeakerIcon } from "@heroicons/react/20/solid";
import { REFERENCES } from "../content/evidence";
import { useData } from "../lib/data/DataContext";

export default function EvidenceView() {
  const { runs } = useData();
  const real = runs.filter((r) => r.source === "capture").length;
  const simulated = runs.filter((r) => r.source === "simulated").length;
  const unverified = runs.filter((r) => r.source === "unverified").length;

  return <div className="evidence-v2">
    <header className="evidence-hero"><span className="eyebrow">EVIDENCE BEFORE CLAIMS</span><h1>What do we actually know?</h1><p>Cadence lets you investigate timing channels and compare defences. This page separates what the software demonstrates from what still needs a measured network experiment.</p><div className="evidence-hero-status"><BeakerIcon className="size-5" aria-hidden /><strong>Current shipped study: simulated</strong><span>No real receiver captures are included in the bundle.</span></div></header>
    <div className="evidence-counts"><div><span>SIMULATED RECORDINGS</span><strong>{simulated}</strong><small>Computer-generated examples</small></div><div><span>REAL-CAPTURE LABELS</span><strong>{real}</strong><small>{real ? "Check their manifests before citing them" : "None included yet"}</small></div><div><span>UNVERIFIED IMPORTS</span><strong>{unverified}</strong><small>Set their source in Recordings</small></div></div>
    <section className="evidence-v2-section"><div className="evidence-section-head"><span className="eyebrow">THE HONEST STORY</span><h2>Three levels of evidence</h2></div><div className="evidence-levels"><article><span>01 / SOFTWARE</span><h3>Working now</h3><p>The browser can read recordings, measure packet gaps, compare detection rules, model a paced relay, and lock and unlock a message with browser encryption.</p><strong>Shows the method works as software.</strong></article><article><span>02 / SIMULATION</span><h3>Included now</h3><p>Prepared runs show how the methods behave under modelled delay and loss. They help us find interesting conditions and failure cases.</p><strong>Shows behaviour in a model.</strong></article><article><span>03 / NETWORK MEASUREMENT</span><h3>Still needed</h3><p>Capture normal and covert ping traffic at a lab receiver, repeat under controlled conditions, and compare observed results with the model.</p><strong>Needed for real-network conclusions.</strong></article></div></section>
    <details className="evidence-review"><summary>Full research references <span>{REFERENCES.length} sources</span></summary><ol>{REFERENCES.map((reference) => <li key={reference}>{reference}</li>)}</ol></details>
  </div>;
}
