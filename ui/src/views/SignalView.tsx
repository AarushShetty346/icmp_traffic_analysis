import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { useMemo } from "react";
import { ChartFrame } from "../components/charts/ChartFrame";
import { Distribution } from "../components/charts/Distribution";
import { IpdTimeline } from "../components/charts/IpdTimeline";
import { Button } from "../components/ui/Button";
import { DataTable } from "../components/ui/DataTable";
import { RangeField, SelectField, SliderField } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { StatTile } from "../components/ui/StatTile";
import { EmptyState } from "../components/ui/States";
import { consecutiveGaps } from "../lib/analysis/detect";
import { FEATURE_HELP, ksDistance, windowFeatures, windows, windowStarts } from "../lib/analysis/features";
import { mean, std } from "../lib/analysis/stats";
import { useData } from "../lib/data/DataContext";
import { runLabel, type Run } from "../lib/data/runs";
import { numParam, useRoute } from "../lib/state/route";
import { conditionOptions, MODEL_HELP, modelOptions, ms, runGaps, runsProvenance, seriesColor } from "../lib/view/select";

export default function SignalView() {
  const { runs, bundle } = useData();
  const { params, setParams } = useRoute();
  const byId = useMemo(() => new Map(runs.map((r) => [r.id, r])), [runs]);
  const linkedA = byId.get(params.get("a") ?? "");
  const model = params.get("model") ?? linkedA?.delayModel ?? bundle?.provenance.delayModels.at(-1) ?? "netem";
  const cond = params.get("cond") ?? (linkedA?.origin === "bundle" ? linkedA.condition : "clean");

  const here = useMemo(() => runs.filter((r) => r.origin === "upload" || (r.delayModel === model && r.condition === cond && r.role === "test")), [runs, model, cond]);
  const a = (linkedA && here.includes(linkedA) ? linkedA : null)
    ?? here.find((r) => r.label === "covert" && r.channel === "0.95/1.05 s") ?? here.find((r) => r.label === "covert") ?? here[0];
  const b = byId.get(params.get("b") ?? "") ?? here.find((r) => r.label === "normal" && r !== a) ?? here.find((r) => r !== a);
  const shown = [a, b].filter(Boolean) as Run[];

  const w = numParam(params, "w", bundle?.settings.defaultWindow ?? 32, 4, 128);
  const step = numParam(params, "step", 0, 0, w);
  const series = useMemo(() => shown.map((r, i) => {
    const sameLabel = shown.length === 2 && shown[0].label === shown[1].label;
    return { key: `${i}-${r.id}`, label: `${i ? "B" : "A"}: ${runLabel(r)}`, color: sameLabel && i ? "var(--series-3)" : seriesColor(r.label), ...runGaps(r) };
  }), [shown]);
  const maxIndex = Math.max(1, ...series.map((s) => s.gaps.at(-1)?.index ?? 1));
  const from = numParam(params, "from", 0, 0, maxIndex - 1);
  const to = numParam(params, "to", maxIndex, from + 1, maxIndex);

  if (!a) {
    return <EmptyState title="No runs to plot">Load the data bundle or add tshark CSV files on the Runs view.</EmptyState>;
  }
  const prov = runsProvenance(shown);
  const gapsA = consecutiveGaps(a.times, a.seq);
  const gapsB = b ? consecutiveGaps(b.times, b.seq) : [];
  const ks = b ? ksDistance(gapsA, gapsB) : NaN;
  const boundaries = windowStarts(a.times.length, w, step).map((s) => s);
  const runOptions = here.map((r) => ({ value: r.id, label: runLabel(r) }));
  const winsA = windows(a.times, w, step, a.seq);
  const winRows = winsA.map((ipd, i) => {
    const f = windowFeatures(ipd);
    return { i, mean: f.mean, std: f.std, ks: gapsB.length ? ksDistance(ipd, gapsB) : NaN, n: ipd.length };
  });

  return (
    <div className="grid gap-4">
      <Panel title="Choose runs" id="pick">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Delay model" help={MODEL_HELP} value={model} options={modelOptions(bundle)} onValueChange={(v) => setParams({ model: v, a: null, b: null })} />
          <SelectField label="Network condition" help="Simulated network condition the runs were generated under. Your own CSV files are listed under every condition." value={cond} options={conditionOptions(bundle)} onValueChange={(v) => setParams({ cond: v, a: null, b: null })} />
          <SelectField label="Run A" value={a.id} options={runOptions} onValueChange={(v) => setParams({ a: v, model, cond })} />
          <SelectField label="Run B (compare)" value={b?.id ?? ""} options={[{ value: "", label: "None" }, ...runOptions]} onValueChange={(v) => setParams({ b: v || null, model, cond })} />
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Mean gap, A" value={ms(mean(gapsA))} detail={`${gapsA.length} gaps`} provenance={runsProvenance([a])} help={FEATURE_HELP.mean} />
        <StatTile label="Gap std, A" value={ms(gapsA.length > 1 ? std(gapsA) : 0)} detail={b ? `B: ${ms(gapsB.length > 1 ? std(gapsB) : 0)}` : undefined} provenance={prov} help={FEATURE_HELP.std} />
        <StatTile label="KS distance A vs B" value={b ? ks.toFixed(3) : "–"} detail="0 = same distribution, 1 = no overlap" provenance={prov} help={FEATURE_HELP.ks} />
        <StatTile label="Windows in A" value={String(winsA.length)} detail={`${w} requests each${step ? `, every ${step}` : ", no overlap"}`} provenance={runsProvenance([a])}
          help="An observation window is a run of consecutive Echo Requests the detectors judge together. Gaps across a lost request are dropped." />
      </div>

      <Panel title="Inter-packet delay over time" id="timeline" provenance={prov}
        help="Each point is the time between two consecutive Echo Requests, in milliseconds. Dashed lines mark window starts; red triangles mark lost requests (that gap is left out)."
        actions={<Button size="sm" variant="ghost" icon={<ArrowPathIcon className="size-4" aria-hidden />} onClick={() => setParams({ from: null, to: null })}>Reset zoom</Button>}>
        <div className="mb-3 grid gap-3 md:grid-cols-3">
          <RangeField label="Gaps shown" value={[from, to]} min={0} max={maxIndex} step={1} format={(v) => `#${v}`} onValueChange={([f, t]) => setParams({ from: f || null, to: t === maxIndex ? null : t })}
            help="Zoom the timeline to a range of gap indices. Drag either end." />
          <SliderField label="Window size" value={w} min={4} max={64} step={1} unit="requests" onValueChange={(v) => setParams({ w: v, step: step > v ? null : step || null })}
            help="Requests per observation window. Larger windows give steadier statistics but react later." />
          <SliderField label="Window step" value={step} min={0} max={w} step={1} format={(v) => (v === 0 || v === w ? "no overlap" : `${v} requests`)} onValueChange={(v) => setParams({ step: v === 0 || v === w ? null : v })}
            help="How far each window moves. Smaller than the window size means windows overlap." />
        </div>
        <ChartFrame title="Inter-packet delay over time" provenance={prov} height={300} fileName="cadence-timeline"
          legend={series.map((s) => ({ label: s.label, color: s.color }))}
          caption="Δt in milliseconds against gap index. Lost requests are drawn as triangles on the axis.">
          {(width, height) => <IpdTimeline width={width} height={height} series={series} range={[from, to]} boundaries={boundaries} />}
        </ChartFrame>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Gap distribution" id="dist" provenance={prov}
          help="Top: share of gaps in each millisecond bin. Bottom: empirical cumulative distribution (ECDF); the KS distance is the largest vertical gap between the two ECDF lines.">
          <ChartFrame title="Gap distribution" provenance={prov} height={320} fileName="cadence-distribution"
            legend={series.map((s) => ({ label: s.label, color: s.color, shape: "square" as const }))}>
            {(width, height) => <Distribution width={width} height={height} series={series.map((s, i) => ({ key: s.key, label: s.label, color: s.color, values: i ? gapsB : gapsA }))} />}
          </ChartFrame>
        </Panel>
        <Panel title="Windows of run A" id="windows" provenance={runsProvenance([a])}
          help="Features of each window of run A. KS is measured against all of run B's gaps.">
          {winRows.length ? (
            <DataTable caption="Windows of run A" csvName="cadence-windows" provenanceNote={`${prov.toUpperCase()} · ${a.id} · window ${w} step ${step || w}`} maxHeight={320}
              rows={winRows} rowKey={(r) => String(r.i)}
              columns={[
                { key: "i", header: "Window", numeric: true, cell: (r) => r.i + 1 },
                { key: "n", header: "Gaps", numeric: true, cell: (r) => r.n },
                { key: "mean", header: "Mean (ms)", numeric: true, cell: (r) => (r.mean * 1000).toFixed(2), csv: (r) => r.mean },
                { key: "std", header: "Std (ms)", numeric: true, cell: (r) => (r.std * 1000).toFixed(2), csv: (r) => r.std },
                { key: "ks", header: "KS vs B", numeric: true, cell: (r) => (Number.isNaN(r.ks) ? "–" : r.ks.toFixed(3)), csv: (r) => (Number.isNaN(r.ks) ? null : r.ks) },
              ]} />
          ) : <EmptyState title="Run A is shorter than one window">Lower the window size.</EmptyState>}
        </Panel>
      </div>
    </div>
  );
}
