import { ArrowDownTrayIcon, CheckCircleIcon, ClockIcon, PrinterIcon, QuestionMarkCircleIcon, BeakerIcon } from "@heroicons/react/20/solid";
import { Button } from "../components/ui/Button";
import { DataTable } from "../components/ui/DataTable";
import { Panel } from "../components/ui/Panel";
import { ProvenanceBadge } from "../components/ui/ProvenanceBadge";
import { StatTile } from "../components/ui/StatTile";
import { Skeleton } from "../components/ui/States";
import { LIMITS, objectives, STATUS_TEXT, type Status } from "../content/evidence";
import { useData } from "../lib/data/DataContext";
import { downloadBlob, downloadText } from "../lib/exporting";
import { markdownReport } from "../lib/report";

const STATUS_ICON: Record<Status, typeof CheckCircleIcon> = {
  met: CheckCircleIcon, "code-ready": ClockIcon, "simulated-only": BeakerIcon, unknown: QuestionMarkCircleIcon,
};
const STATUS_TONE: Record<Status, string> = {
  met: "text-ok", "code-ready": "text-ink-2", "simulated-only": "text-sim-ink", unknown: "text-ink-3",
};

export default function EvidenceView() {
  const { bundle, uploads, runs, bundleUrl, status } = useData();
  const loading = status === "loading";
  const objs = objectives(bundle);
  const count = (pred: (r: (typeof runs)[number]) => boolean) => runs.filter(pred).length;
  const coverage = [
    { what: "Normal runs", sim: count((r) => r.label === "normal" && r.source === "simulated"), real: count((r) => r.label === "normal" && r.source === "capture") },
    { what: "Covert runs", sim: count((r) => r.label === "covert" && r.source === "simulated"), real: count((r) => r.label === "covert" && r.source === "capture") },
    { what: "Stress-matrix cells", sim: bundle?.matrix.filter((m) => m.source === "simulated").length ?? 0, real: bundle?.matrix.filter((m) => m.source === "capture").length ?? 0 },
    { what: "Decoded runs", sim: bundle?.decode.filter((d) => d.source === "simulated").length ?? 0, real: bundle?.decode.filter((d) => d.source === "capture").length ?? 0 },
    { what: "Field comparisons", sim: 0, real: bundle?.fieldcheck.length ?? 0 },
  ];

  return (
    <div className="grid gap-4">
      <Panel title="About this project" id="about">
        <p className="text-lg font-semibold text-ink">Detection of ICMP-Based Covert Timing Channels Using Network Traffic Analysis</p>
        <p className="mt-1 text-sm text-ink-2">BCSE308P Computer Networks lab project, VIT Vellore, by Harsh Jha, Anuj Deshpande and Aarush Shetty.</p>
        <p className="mt-2 max-w-prose text-sm text-ink-2">
          Cadence is the analysis workbench for the project. It reads the JSON bundle exported by <span className="font-mono">python -m icmp_detector export-ui</span> and
          tshark CSV files you add, and recomputes the detectors in the browser with code checked against the Python implementation to 10⁻⁹.
          The work is defensive analysis on an authorised, closed lab testbed; nothing here sends traffic.
        </p>
      </Panel>

      {loading ? <Skeleton className="h-24" label="Loading the data bundle" /> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Objectives met with real data" value={`${objs.filter((o) => o.status === "met").length} of ${objs.length}`} />
        <StatTile label="Code ready, waiting for lab data" value={String(objs.filter((o) => o.status === "code-ready").length)} />
        <StatTile label="Simulated only" value={String(objs.filter((o) => o.status === "simulated-only").length)} provenance="simulated" />
        <StatTile label="Wording still to add" value={String(objs.filter((o) => o.status === "unknown").length)} detail="from the Review 1 report" />
      </div>

      <Panel title="Review 3 checklist" id="checklist" help="Status of each Review 1 objective, judged from the data that is actually loaded. Objectives with no wording are not in the repository yet.">
        <ol className="grid gap-2">
          {objs.map((o) => {
            const Icon = STATUS_ICON[o.status];
            return (
              <li key={o.n} className="grid gap-1 rounded-md border border-line p-3 sm:grid-cols-[2rem_1fr_auto] sm:items-start">
                <span className="font-mono text-sm text-ink-3">{o.n}.</span>
                <div className="min-w-0">
                  <p className="text-sm text-ink">{o.text}</p>
                  <p className="text-xs text-ink-3">{o.evidence}</p>
                  {o.links.length ? (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      {o.links.map((l) => <a key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-accent underline" {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>{l.label}</a>)}
                    </p>
                  ) : null}
                </div>
                <span className={`inline-flex items-center gap-1 text-sm font-medium ${STATUS_TONE[o.status]}`}><Icon className="size-4" aria-hidden />{STATUS_TEXT[o.status]}</span>
              </li>
            );
          })}
        </ol>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Data coverage" id="coverage" help="How much of the loaded data is simulated and how much is real capture, including CSV files added in this browser.">
          <DataTable caption="Data coverage" csvName="cadence-coverage" provenanceNote="counts by provenance"
            rows={coverage} rowKey={(r) => r.what}
            columns={[
              { key: "w", header: "What", cell: (r) => r.what },
              { key: "s", header: "Simulated", numeric: true, cell: (r) => r.sim },
              { key: "r", header: "Real capture", numeric: true, cell: (r) => r.real },
            ]} />
          {bundle ? (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-ink-2">
              <dt>Bundle</dt><dd className="font-mono">schema {bundle.schemaVersion}, generated {bundle.generatedAt}</dd>
              <dt>Commit</dt><dd className="font-mono [overflow-wrap:anywhere]">{bundle.provenance.commit ?? "unknown"}</dd>
              <dt>Seed</dt><dd className="font-mono">{bundle.provenance.seed}, {bundle.provenance.runsPerSet} runs per set, {bundle.provenance.bootstrapResamples} bootstrap resamples</dd>
              <dt>Delay models</dt><dd className="font-mono">{bundle.provenance.delayModels.join(", ")}</dd>
              <dt>Added files</dt><dd className="font-mono">{uploads.length}</dd>
            </dl>
          ) : null}
        </Panel>

        <Panel title="Known limits" id="limits" help="Threats to validity to state at Review 3. Details in AUDIT.md, section B.">
          <ul className="grid list-disc gap-2 pl-5 text-sm text-ink-2">
            {LIMITS.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </Panel>
      </div>



      <Panel title="References" id="refs">
        <p className="max-w-prose text-sm text-ink-2">
          The reference list from the Review 1 report is not in the repository, so none is shown here rather than an invented one.
          Add it to <span className="font-mono">ui/src/content/evidence.ts</span>.
        </p>
      </Panel>

      <Panel title="Exports" id="exports" provenance={bundle?.provenance.hasCapture ? (bundle.provenance.hasSimulated ? "mixed" : "capture") : "simulated"}
        help="Every export carries its provenance: the report states it at the top, CSV files in their first line, PNG charts in their footer.">
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="primary" icon={<ArrowDownTrayIcon className="size-4" aria-hidden />} disabled={!bundle}
            onClick={() => bundle && downloadText("cadence-evidence.md", markdownReport(bundle, uploads), "text/markdown")}>Markdown report</Button>
          <Button icon={<PrinterIcon className="size-4" aria-hidden />} onClick={() => window.print()}>Print or save as PDF</Button>
          <Button icon={<ArrowDownTrayIcon className="size-4" aria-hidden />} onClick={() => fetch(bundleUrl).then((r) => r.blob()).then((b) => downloadBlob("cadence-bundle.json", b))}>JSON bundle</Button>
          <Button icon={<ArrowDownTrayIcon className="size-4" aria-hidden />} onClick={() => fetch(bundleUrl.replace(/bundle\.json$/, "bundle.schema.json")).then((r) => r.blob()).then((b) => downloadBlob("bundle.schema.json", b))}>JSON Schema</Button>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">Printing keeps the provenance banner on every page. <ProvenanceBadge source="simulated" compact /> marks simulated numbers.</p>
      </Panel>
      </>}
    </div>
  );
}
