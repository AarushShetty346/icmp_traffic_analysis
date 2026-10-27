import { ArrowRightIcon, ChartBarIcon, LockClosedIcon, ShieldCheckIcon, SignalIcon, TableCellsIcon } from "@heroicons/react/20/solid";

const TOOLS = [
  { href: "#/runs", icon: TableCellsIcon, n: "01", title: "Recordings", old: "Runs", description: "See every normal and message-carrying recording. Add a packet-capture CSV and give it a label.", tryThis: "Open a simulated recording, then inspect its source and packet count." },
  { href: "#/signal", icon: SignalIcon, n: "02", title: "The signal", old: "Signal", description: "Place two recordings side by side and watch the pauses between packets.", tryThis: "Compare a normal run with a 0.95/1.05-second message run." },
  { href: "#/detectors", icon: ShieldCheckIcon, n: "03", title: "The judges", old: "Detectors", description: "Test a fixed alarm rule against one learned from normal traffic. Change the conditions and see both detection and false alarms.", tryThis: "Switch the baseline from Same conditions to Clean LAN." },
  { href: "#/stress", icon: ChartBarIcon, n: "04", title: "Stress test", old: "Stress matrix", description: "See how many combinations of message subtlety and network noise change the outcome.", tryThis: "Switch the coloured grid from detection rate to false-positive rate." },
  { href: "#/decode", icon: LockClosedIcon, n: "05", title: "Read the bits", old: "Decode", description: "Try your own message, then inspect how well a prepared run's bits survive noise and loss.", tryThis: "Type HI, then compare the fixed and adaptive dividing lines." },
];

export default function LabView() {
  return <div className="lab-home">
    <div className="lab-home-hero">
      <div><span className="eyebrow">OPEN WORKBENCH</span><h1>Go deeper when you’re ready.</h1><p>The guided case tells the story. These are the full instruments behind it. Start with a question, choose a tool, and use the Field guide whenever a word is unfamiliar.</p></div>
      <div className="lab-home-flow" aria-label="Workflow: recordings, pauses, alarms, stress, recovered bits"><span>record</span><i /> <span>see</span><i /> <span>judge</span><i /> <span>test</span><i /> <span>read</span></div>
    </div>
    <div className="lab-home-hint"><strong>One rule for every chart:</strong> check the data-source badge. The included results are simulated, and adding a CSV does not validate its origin automatically.</div>
    <div className="lab-tool-grid">
      {TOOLS.map(({ href, icon: Icon, n, title, old, description, tryThis }) => <a className="lab-tool-card" href={href} key={href}>
        <div className="lab-tool-top"><span>{n} / {old.toUpperCase()}</span><Icon className="size-6" aria-hidden /></div>
        <h2>{title}</h2><p>{description}</p><div className="lab-tool-try"><strong>Try this</strong><span>{tryThis}</span></div><span className="lab-tool-link">Open tool <ArrowRightIcon className="size-4" aria-hidden /></span>
      </a>)}
    </div>
    <p className="lab-home-end">The charts, CSV import, feature comparisons, raw tables, and exports from the original workbench are all here. <a href="#/case">Return to the guided case</a> for the simplest path.</p>
  </div>;
}
