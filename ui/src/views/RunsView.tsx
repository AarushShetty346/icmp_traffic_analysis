import { ArrowUpTrayIcon, ArrowUturnLeftIcon, ChartBarIcon, DocumentTextIcon, MagnifyingGlassIcon, TrashIcon } from "@heroicons/react/20/solid";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Button } from "../components/ui/Button";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Dialog } from "../components/ui/Dialog";
import { SelectField } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { StatTile } from "../components/ui/StatTile";
import { ProvenanceBadge } from "../components/ui/ProvenanceBadge";
import { ChartSkeleton, EmptyState, ErrorState } from "../components/ui/States";
import { useData } from "../lib/data/DataContext";
import { lostPackets, type Run } from "../lib/data/runs";
import { compareFields } from "../lib/analysis/fieldcheck";
import { runsProvenance } from "../lib/view/select";
import { useRoute } from "../lib/state/route";

const PAGE = 25;

export default function RunsView() {
  const { runs, uploads, uploadErrors, parsing, addFiles, updateUpload, removeUpload, restoreUpload, bundle, status } = useData();
  const { params, setParams, navigate } = useRoute();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [manifestRun, setManifestRun] = useState<Run | null>(null);
  const source = params.get("source") ?? "all";
  const label = params.get("label") ?? "all";
  const role = params.get("role") ?? "test";
  const query = params.get("q") ?? "";
  const [removed, setRemoved] = useState<Run | null>(null);

  useEffect(() => {
    if (params.get("add") === "1") { input.current?.click(); setParams({ add: null }); }
  }, [params, setParams]);

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return runs.filter((r) =>
      (source === "all" || r.source === source) && (label === "all" || r.label === label) && (role === "all" || r.role === role || (role === "baseline" && r.role !== "test")) &&
      terms.every((t) => `${r.name} ${r.condition} ${r.channel ?? ""} ${r.delayModel ?? ""} ${r.bits ?? ""}`.toLowerCase().includes(t)));
  }, [runs, source, label, role, query]);
  useEffect(() => setLimit(PAGE), [source, label, role, query]);
  const totals = useMemo(() => ({
    covert: runs.filter((r) => r.label === "covert").length,
    capture: runs.filter((r) => r.source === "capture").length,
    lost: runs.reduce((n, r) => n + (r.seq ? lostPackets(r) : 0), 0),
    requests: runs.reduce((n, r) => n + r.times.length, 0),
  }), [runs]);
  const remove = (r: Run) => { removeUpload(r.id); setRemoved(r); };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles([...e.dataTransfer.files].filter((f) => /\.(csv|txt)$/i.test(f.name)));
  };

  const manifestFor = (r: Run) => bundle?.provenance.captureManifests.find((m) => m.runId === r.id)?.manifest;
  const columns: Column<Run>[] = [
    { key: "name", header: "Run", cell: (r) => <span className="font-mono text-xs">{r.name}</span>, csv: (r) => r.name },
    { key: "prov", header: "Provenance", cell: (r) => r.origin === "upload" ? (
      <select aria-label={`Provenance of ${r.name}`} value={r.source} onChange={(e) => updateUpload(r.id, { source: e.target.value as Run["source"] })}
        className="min-h-11 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink">
        <option value="capture">Real capture</option><option value="simulated">Simulated</option>
      </select>) : <ProvenanceBadge source={r.source} compact />, csv: (r) => r.source },
    { key: "label", header: "Label", cell: (r) => r.origin === "upload" ? (
      <select aria-label={`Label of ${r.name}`} value={r.label} onChange={(e) => updateUpload(r.id, { label: e.target.value as Run["label"] })}
        className="min-h-11 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink">
        <option value="normal">normal</option><option value="covert">covert</option>
      </select>) : <LabelChip label={r.label} />, csv: (r) => r.label },
    { key: "role", header: "Used as", cell: (r) => r.origin === "upload" ? (
      <select aria-label={`Use of ${r.name}`} value={r.role} onChange={(e) => updateUpload(r.id, { role: e.target.value as Run["role"] })}
        className="min-h-11 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink">
        <option value="test">test run</option><option value="baseline-matched">baseline run</option>
      </select>) : r.role.replace("baseline-", "baseline · "), csv: (r) => r.role },
    { key: "cond", header: "Condition", cell: (r) => `${r.condition}${r.channel ? ` · ${r.channel}` : ""}`, csv: (r) => r.condition },
    { key: "model", header: "Delay model", cell: (r) => r.delayModel ?? "—", csv: (r) => r.delayModel },
    { key: "n", header: "Requests", numeric: true, cell: (r) => r.times.length, csv: (r) => r.times.length },
    { key: "dur", header: "Duration (s)", numeric: true, cell: (r) => (r.times[r.times.length - 1] - r.times[0]).toFixed(1), csv: (r) => (r.times[r.times.length - 1] - r.times[0]).toFixed(3) },
    { key: "lost", header: "Lost", numeric: true, cell: (r) => r.seq ? lostPackets(r) : "n/a", csv: (r) => (r.seq ? lostPackets(r) : null) },
    { key: "bits", header: "Bits sent", cell: (r) => r.origin === "upload" && r.label === "covert" ? (
      <input aria-label={`Bits sent in ${r.name}`} defaultValue={r.bits ?? ""} placeholder="0101…" inputMode="numeric" pattern="[01]*"
        onBlur={(e) => updateUpload(r.id, { bits: e.target.value.replace(/[^01]/g, "") || null })}
        className="min-h-11 w-28 rounded-md border border-line-strong bg-surface px-2 font-mono text-xs text-ink" />) :
      <span className="font-mono text-xs">{r.bits ? `${r.bits.slice(0, 12)}${r.bits.length > 12 ? "…" : ""}` : "—"}</span>, csv: (r) => r.bits },
    { key: "act", header: "Actions", cell: (r) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" icon={<ChartBarIcon className="size-4" aria-hidden />} onClick={() => navigate("signal", { a: r.id })} aria-label={`Open ${r.name} in Signal`} />
        <Button size="sm" variant="ghost" icon={<DocumentTextIcon className="size-4" aria-hidden />} onClick={() => setManifestRun(r)} aria-label={`Manifest of ${r.name}`} />
        {r.origin === "upload" ? <Button size="sm" variant="ghost" icon={<TrashIcon className="size-4" aria-hidden />} onClick={() => remove(r)} aria-label={`Remove ${r.name}`} /> : null}
      </div>), csv: () => null },
  ];

  const upNormal = uploads.filter((u) => u.label === "normal" && u.capture);
  const upCovert = uploads.filter((u) => u.label === "covert" && u.capture);
  const localCheck = upNormal[0] && upCovert[0] ? compareFields(upNormal[0].capture!, upCovert[0].capture!) : null;

  return (
    <div className="grid gap-4">
      <Panel title="What this project does" id="intro">
        <p className="max-w-prose text-sm text-ink-2">
          A normal computer sends ping requests at roughly regular intervals. A hidden message can change
          the time between requests: a short gap can stand for 0 and a long gap for 1. This project checks
          those gaps to see whether the traffic looks normal or carries a message.
        </p>
        <ol className="mt-3 grid gap-2 text-sm text-ink-2 sm:grid-cols-3">
          <li><strong className="text-ink">1. Collect</strong><br />Record the arrival times of ping requests.</li>
          <li><strong className="text-ink">2. Detect</strong><br />Compare gap patterns with normal traffic.</li>
          <li><strong className="text-ink">3. Decode</strong><br />Read short and long gaps as 0s and 1s.</li>
        </ol>
        <p className="mt-3 text-sm text-ink-2">
          {totals.capture === 0
            ? "Only simulated runs are loaded right now; real lab captures are still needed."
            : `${totals.capture} run${totals.capture === 1 ? " is" : "s are"} marked Real capture. Check each run's source before using its results.`}{" "}
          Try the message example in <a href="#/decode" className="text-accent underline">Decode</a>,
          then see what evidence is still needed in <a href="#/evidence" className="text-accent underline">Evidence</a>.
        </p>
      </Panel>
      <Panel title="Add captures" id="add" help="Drop tshark CSV exports (scripts/lab/export_csv.sh). They are parsed in a background thread in this browser and never uploaded anywhere.">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${dragging ? "border-accent bg-accent-soft" : "border-line-strong"}`}
        >
          <ArrowUpTrayIcon className="size-8 text-ink-3" aria-hidden />
          <p className="text-sm text-ink-2">Drop <span className="font-mono">.csv</span> files here, or</p>
          <Button variant="primary" loading={parsing} onClick={() => input.current?.click()}>Choose CSV files</Button>
          <input ref={input} type="file" accept=".csv,text/csv" multiple className="sr-only" tabIndex={-1} aria-hidden
            onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
          <p className="max-w-prose text-xs text-ink-3">Files whose name starts with <span className="font-mono">covert</span> are labelled covert, others normal; change it in the table. Files written by <span className="font-mono">icmp_detector simulate</span> are recognised and badged Simulated.</p>
        </div>
        {uploadErrors.length ? (
          <div className="mt-3"><ErrorState title="Some files could not be read" message={uploadErrors.map((e) => `${e.name}: ${e.error}`).join(" · ")} /></div>
        ) : null}
        {removed ? (
          <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1 text-sm text-ink">
            <span>Removed <span className="font-mono">{removed.name}</span>.</span>
            <Button size="sm" variant="ghost" icon={<ArrowUturnLeftIcon className="size-4" aria-hidden />} onClick={() => { restoreUpload(removed); setRemoved(null); }}>Undo</Button>
          </div>
        ) : null}
      </Panel>

      {status === "loading" ? <ChartSkeleton height={320} /> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Runs loaded" value={String(runs.length)} provenance={runsProvenance(runs)} detail={`${runs.length - totals.covert} normal · ${totals.covert} covert`} />
        <StatTile label="Echo Requests" value={totals.requests.toLocaleString("en")} provenance={runsProvenance(runs)} detail="across every run" />
        <StatTile label="Real captures" value={String(totals.capture)} tone={totals.capture ? "good" : undefined}
          detail={totals.capture ? "from the lab testbed" : "none yet; every number here is simulated"} />
        <StatTile label="Requests lost" value={String(totals.lost)} provenance={runsProvenance(runs)} tone={totals.lost ? "alert" : undefined} toneText="Gaps will include losses"
          detail="counted from ICMP sequence numbers" />
      </div>
      <Panel title="Runs" id="runs" provenance={runsProvenance(filtered)} help="Baseline runs fit the detector's thresholds; test runs are scored. Simulated runs carry their seed and delay model.">
        <div className="mb-3 flex min-w-0 flex-col gap-1">
          <label htmlFor="run-search" className="text-sm font-medium text-ink-2">Search runs</label>
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input id="run-search" type="search" value={query} placeholder="Name, condition, channel or bits, e.g. jitter covert"
              onChange={(e) => setParams({ q: e.target.value || null })}
              className="min-h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-3" />
          </div>
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <SelectField label="Provenance" value={source} onValueChange={(v) => setParams({ source: v === "all" ? null : v })}
            options={[{ value: "all", label: "All" }, { value: "simulated", label: "Simulated" }, { value: "capture", label: "Real capture" }]} />
          <SelectField label="Label" value={label} onValueChange={(v) => setParams({ label: v === "all" ? null : v })}
            options={[{ value: "all", label: "All" }, { value: "normal", label: "Normal" }, { value: "covert", label: "Covert" }]} />
          <SelectField label="Used as" value={role} onValueChange={(v) => setParams({ role: v === "test" ? null : v })}
            options={[{ value: "test", label: "Test runs" }, { value: "baseline", label: "Baseline runs" }, { value: "all", label: "All" }]} />
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="No runs match these filters">Change the search or a filter above, or add tshark CSV files.</EmptyState>
        ) : (
          <>
            <p className="mb-2 text-xs text-ink-3" aria-live="polite">Showing {Math.min(limit, filtered.length)} of {filtered.length} runs.</p>
            <DataTable caption="Runs" csvName="cadence-runs" provenanceNote={`provenance column per row; exported ${new Date().toISOString()}`}
              columns={columns} rows={filtered.slice(0, limit)} rowKey={(r) => r.id} />
            {limit < filtered.length ? <Button className="mt-2" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, filtered.length - limit)} more runs</Button> : null}
          </>
        )}
      </Panel>

      <Panel title="Packet-field comparison" id="fields" provenance={bundle?.fieldcheck.length ? "capture" : undefined}
        help="Compares non-timing fields (TTL, IP id pattern, flags, payload) between a normal and a covert capture. A difference here means a simpler detector than timing would catch the sender, so it must be documented.">
        {bundle?.fieldcheck.length ? bundle.fieldcheck.map((fc) => (
          <div key={`${fc.normalFile}-${fc.covertFile}`} className="mb-4">
            <p className="mb-2 text-sm text-ink-2">{fc.condition}: <span className="font-mono">{fc.normalFile}</span> vs <span className="font-mono">{fc.covertFile}</span></p>
            <FieldTable rows={fc.rows} />
          </div>
        )) : localCheck ? (
          <div>
            <p className="mb-2 text-sm text-ink-2">Your files: <span className="font-mono">{upNormal[0].name}</span> (normal) vs <span className="font-mono">{upCovert[0].name}</span> (covert)</p>
            <FieldTable rows={localCheck} />
          </div>
        ) : (
          <EmptyState title="No field comparison yet">
            The exported bundle has no real captures. Add a normal and a covert CSV exported with the extra fields
            (<span className="font-mono">scripts/lab/export_csv.sh</span>), or run <span className="font-mono">python -m icmp_detector fieldcheck</span>.
          </EmptyState>
        )}
      </Panel>

      </>}

      <Dialog open={!!manifestRun} onOpenChange={(o) => !o && setManifestRun(null)} title={manifestRun ? `Manifest: ${manifestRun.name}` : "Manifest"} wide
        description={manifestRun?.source === "simulated" ? "Simulated run: these are the generation parameters, not a capture manifest." : "Run manifest written by the lab scripts."}>
        {manifestRun ? (
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs text-ink">{JSON.stringify(
            manifestFor(manifestRun) ?? (manifestRun.origin === "upload"
              ? { note: "No manifest loaded for this file. scripts/lab/capture.sh writes one next to each capture.", file: manifestRun.file, requests: manifestRun.times.length, sources: manifestRun.capture?.sources }
              : { simulated: manifestRun.source === "simulated", seed: bundle?.provenance.seed, delayModel: manifestRun.delayModel, condition: manifestRun.condition, channel: manifestRun.channel, role: manifestRun.role, commit: bundle?.provenance.commit }),
            null, 2)}</pre>
        ) : null}
      </Dialog>
    </div>
  );
}

function FieldTable({ rows }: { rows: { field: string; normal: string | null; covert: string | null; differs: boolean | null; note: string }[] }) {
  return (
    <DataTable caption="Packet fields" csvName="cadence-fieldcheck" provenanceNote="REAL CAPTURE field comparison"
      rows={rows} rowKey={(r) => r.field}
      columns={[
        { key: "f", header: "Field", cell: (r) => r.field },
        { key: "n", header: "Normal", cell: (r) => r.normal ?? "—" },
        { key: "c", header: "Covert", cell: (r) => r.covert ?? "—" },
        { key: "d", header: "Differs", cell: (r) => r.differs === null ? "not exported" : r.differs ? <strong className="text-danger">yes</strong> : "no", csv: (r) => (r.differs === null ? "unknown" : r.differs ? "yes" : "no") },
        { key: "note", header: "Note", cell: (r) => r.note },
      ]} />
  );
}

function LabelChip({ label }: { label: Run["label"] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: label === "covert" ? "var(--series-covert)" : "var(--series-normal)" }} />
      {label}
    </span>
  );
}
