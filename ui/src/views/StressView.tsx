import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { useMemo } from "react";
import { ChartFrame } from "../components/charts/ChartFrame";
import { Heatmap, RampLegend, type Cell } from "../components/charts/Heatmap";
import { Button } from "../components/ui/Button";
import { DataTable } from "../components/ui/DataTable";
import { Segmented, SelectField } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { StatTile } from "../components/ui/StatTile";
import { EmptyState } from "../components/ui/States";
import { useData } from "../lib/data/DataContext";
import type { MatrixRow } from "../lib/data/schema";
import { useRoute } from "../lib/state/route";
import { DETECTOR_HELP, DETECTOR_NAME, DETECTOR_OPTIONS, MODEL_HELP, modelOptions, pct, pick, type DetectorKey } from "../lib/view/select";

const METRICS = ["dr", "fpr", "decodeFixed", "decodeAdaptive"] as const;
type Metric = (typeof METRICS)[number];
const METRIC_LABEL: Record<Metric, string> = {
  dr: "detection rate", fpr: "false-positive rate", decodeFixed: "decoding accuracy (fixed 1 s threshold)", decodeAdaptive: "decoding accuracy (adaptive threshold)",
};
const METRIC_HELP =
  "Detection rate: share of covert windows flagged. False-positive rate: share of normal windows flagged (lower is better). Decoding accuracy: share of bits the receiver recovers; it does not depend on the detector.";

const value = (m: MatrixRow, metric: Metric) =>
  metric === "dr" ? m.detectionRate : metric === "fpr" ? m.falsePositiveRate : metric === "decodeFixed" ? m.decodeFixed : m.decodeAdaptive;
const interval = (m: MatrixRow, metric: Metric) =>
  metric === "dr" ? m.ci?.detection_rate : metric === "fpr" ? m.ci?.false_positive_rate : undefined;

export default function StressView() {
  const { bundle } = useData();
  const { params, setParams, navigate } = useRoute();
  const matrix = bundle?.matrix ?? [];
  const sources = [...new Set(matrix.map((m) => m.source))];
  const source = pick(params.get("source"), sources, sources[0] ?? "simulated");
  const metric = pick(params.get("metric"), METRICS, "dr");
  const det = pick(params.get("det"), DETECTOR_OPTIONS.map((d) => d.value), "matched") as DetectorKey;
  const windowsAvail = [...new Set(matrix.map((m) => m.window))].sort((a, b) => a - b);
  const w = Number(pick(params.get("w"), windowsAvail.map(String), String(bundle?.settings.defaultWindow ?? 32)));
  const model = params.get("model") ?? bundle?.provenance.delayModels.at(-1) ?? "netem";
  const selected = params.get("cell");

  const rows = useMemo(() => matrix.filter((m) => m.source === source && m.window === w && m.detector === DETECTOR_NAME[det] && (source === "capture" || (m.delayModel ?? "") === model)),
    [matrix, source, w, det, model]);
  const channels = [...new Set(rows.map((r) => r.channel))];
  const conditions = (bundle?.settings.conditions.map((c) => c.name) ?? []).filter((c) => rows.some((r) => r.condition === c));
  const cells: Cell[] = rows.map((r) => {
    const ci = interval(r, metric);
    return { row: r.channel, col: r.condition, value: value(r, metric), lo: ci?.lo ?? null, hi: ci?.hi ?? null, selected: `${r.channel}|${r.condition}` === selected };
  });
  const sel = rows.find((r) => `${r.channel}|${r.condition}` === selected);
  const prov = source === "capture" ? "capture" : "simulated";
  const seedRows = bundle?.multiSeed?.rows.filter((r) => r.window === w && r.detector === DETECTOR_NAME[det] && (!sel || (r.channel === sel.channel && r.condition === sel.condition))) ?? [];

  if (!matrix.length) return <EmptyState title="No stress matrix in this bundle">Export one with python -m icmp_detector export-ui.</EmptyState>;

  return (
    <div className="grid gap-4">
      <Panel title="Filters" id="filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField label="Metric" help={METRIC_HELP} value={metric} onValueChange={(v) => setParams({ metric: v === "dr" ? null : v })}
            options={METRICS.map((m) => ({ value: m, label: METRIC_LABEL[m] }))} />
          <SelectField label="Detector" help={DETECTOR_HELP} value={det} disabled={metric.startsWith("decode")} onValueChange={(v) => setParams({ det: v === "matched" ? null : v })}
            options={DETECTOR_OPTIONS.map((d) => ({ value: d.value, label: d.label }))} />
          <Segmented label="Window" value={String(w)} onValueChange={(v) => setParams({ w: v })} options={windowsAvail.map((x) => ({ value: String(x), label: `${x}` }))}
            help="Requests per observation window." />
          {source === "simulated" ? <SelectField label="Delay model" help={MODEL_HELP} value={model} options={modelOptions(bundle)} onValueChange={(v) => setParams({ model: v })} /> : null}
          {sources.length > 1 ? (
            <SelectField label="Data" value={source} onValueChange={(v) => setParams({ source: v, cell: null })}
              options={sources.map((s) => ({ value: s, label: s === "capture" ? "Real captures" : "Simulated" }))} />
          ) : null}
        </div>
      </Panel>

      <Panel title={`${METRIC_LABEL[metric][0].toUpperCase()}${METRIC_LABEL[metric].slice(1)} by channel and condition`} id="matrix" provenance={prov}
        help="Rows: gap settings of the covert channel (bit 0 / bit 1). Columns: network conditions. Darker is higher. Select a cell to see its runs and interval.">
        {rows.length ? (
          <ChartFrame title={`Stress matrix, ${METRIC_LABEL[metric]}`} provenance={prov} height={0} fileName={`cadence-stress-${metric}`}
            caption={<RampLegend label={METRIC_LABEL[metric]} />}>
            {(width) => <Heatmap width={width} rows={channels} cols={conditions} cells={cells} metricLabel={METRIC_LABEL[metric]}
              onSelect={(c) => setParams({ cell: `${c.row}|${c.col}` === selected ? null : `${c.row}|${c.col}` })} />}
          </ChartFrame>
        ) : <EmptyState title="Nothing for these filters">Try another window or delay model.</EmptyState>}
      </Panel>

      {sel ? (
        <Panel title={`${sel.channel} under ${sel.condition}`} id="cell" provenance={prov}
          actions={<Button size="sm" variant="ghost" icon={<ArrowTopRightOnSquareIcon className="size-4" aria-hidden />}
            onClick={() => navigate("detectors", { model: sel.delayModel ?? null, cond: sel.condition, chan: sel.channel, w: String(sel.window), base: det === "clean" ? "clean" : null })}>
            Open in Detectors</Button>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Detection rate" value={pct(sel.detectionRate)} provenance={prov}
              detail={sel.ci ? `95% CI ${pct(sel.ci.detection_rate.lo)}–${pct(sel.ci.detection_rate.hi)} over ${sel.ci.detection_rate.runs} runs` : `${sel.nCovertWindows} windows`} />
            <StatTile label="False-positive rate" value={pct(sel.falsePositiveRate)} provenance={prov}
              detail={sel.ci ? `95% CI ${pct(sel.ci.false_positive_rate.lo)}–${pct(sel.ci.false_positive_rate.hi)} over ${sel.ci.false_positive_rate.runs} runs` : `${sel.nNormalWindows} windows`} />
            <StatTile label="Precision" value={pct(sel.precision)} provenance={prov} help="Of the windows flagged, the share that really were covert." />
            <StatTile label="Bits decoded" value={`${pct(sel.decodeFixed)} / ${pct(sel.decodeAdaptive)}`} detail="fixed / adaptive threshold" provenance={prov} />
          </div>
          <p className="mt-3 text-sm text-ink-2">Intervals resample whole runs ({sel.runsPerSet} per set), since windows from one run are not independent. Example runs in this bundle:</p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {sel.runIds.map((id) => (
              <li key={id}>
                <a href={`#/signal?a=${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-3 font-mono text-xs text-ink hover:bg-surface-2">
                  {id.replace(/^sim-/, "")}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="All cells as a table" id="table" provenance={prov}>
        <DataTable caption="Stress matrix" csvName="cadence-stress" maxHeight={420}
          provenanceNote={`${prov.toUpperCase()} · ${source === "simulated" ? `delay model ${model} · seed ${bundle?.provenance.seed}` : "real captures"} · window ${w} · ${DETECTOR_NAME[det]}`}
          rows={rows} rowKey={(r) => `${r.channel}|${r.condition}`}
          columns={[
            { key: "ch", header: "Channel", cell: (r) => r.channel },
            { key: "co", header: "Condition", cell: (r) => r.condition },
            { key: "dr", header: "Detection", numeric: true, cell: (r) => pct(r.detectionRate), csv: (r) => r.detectionRate },
            { key: "drci", header: "DR 95% CI", cell: (r) => (r.ci ? `${pct(r.ci.detection_rate.lo)}–${pct(r.ci.detection_rate.hi)}` : "–"), csv: (r) => (r.ci ? `${r.ci.detection_rate.lo}-${r.ci.detection_rate.hi}` : null) },
            { key: "fpr", header: "False pos.", numeric: true, cell: (r) => pct(r.falsePositiveRate), csv: (r) => r.falsePositiveRate },
            { key: "fprci", header: "FPR 95% CI", cell: (r) => (r.ci ? `${pct(r.ci.false_positive_rate.lo)}–${pct(r.ci.false_positive_rate.hi)}` : "–"), csv: (r) => (r.ci ? `${r.ci.false_positive_rate.lo}-${r.ci.false_positive_rate.hi}` : null) },
            { key: "df", header: "Decode fixed", numeric: true, cell: (r) => pct(r.decodeFixed), csv: (r) => r.decodeFixed },
            { key: "da", header: "Decode adaptive", numeric: true, cell: (r) => pct(r.decodeAdaptive), csv: (r) => r.decodeAdaptive },
          ]} />
      </Panel>

      {bundle?.multiSeed ? (
        <Panel title="Spread across seeds" id="seeds" provenance="simulated"
          help="The same study repeated with different random seeds. A wide spread means one seed's number should not be quoted on its own.">
          <p className="mb-2 text-sm text-ink-2">
            {bundle.multiSeed.seeds.length} seeds ({bundle.multiSeed.seeds.join(", ")}), {bundle.multiSeed.delayModel} delay model, {bundle.multiSeed.runsPerSet} runs per set
            {sel ? `, for ${sel.channel} under ${sel.condition}` : ""}. Interval: mean ± 1.96 standard errors.
          </p>
          {seedRows.length ? (
            <DataTable caption="Seed spread" csvName="cadence-seed-spread" maxHeight={360} provenanceNote={`SIMULATED · seeds ${bundle.multiSeed.seeds.join(" ")}`}
              rows={seedRows} rowKey={(r) => `${r.channel}|${r.condition}|${r.detector}`}
              columns={[
                { key: "ch", header: "Channel", cell: (r) => r.channel },
                { key: "co", header: "Condition", cell: (r) => r.condition },
                { key: "dr", header: "Detection mean", numeric: true, cell: (r) => pct(r.detectionRate.mean), csv: (r) => r.detectionRate.mean },
                { key: "drr", header: "DR min–max", cell: (r) => `${pct(r.detectionRate.min)}–${pct(r.detectionRate.max)}`, csv: (r) => `${r.detectionRate.min}-${r.detectionRate.max}` },
                { key: "fpr", header: "FPR mean", numeric: true, cell: (r) => pct(r.falsePositiveRate.mean), csv: (r) => r.falsePositiveRate.mean },
                { key: "fprr", header: "FPR min–max", cell: (r) => `${pct(r.falsePositiveRate.min)}–${pct(r.falsePositiveRate.max)}`, csv: (r) => `${r.falsePositiveRate.min}-${r.falsePositiveRate.max}` },
              ]} />
          ) : <EmptyState title="No seed spread for this window">The multi-seed study was run for window {bundle.settings.defaultWindow} only.</EmptyState>}
        </Panel>
      ) : null}
    </div>
  );
}
