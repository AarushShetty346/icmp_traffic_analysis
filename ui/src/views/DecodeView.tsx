import { useMemo } from "react";
import { GroupedBars } from "../components/charts/Bars";
import { BitGrid } from "../components/charts/BitGrid";
import { ChartFrame } from "../components/charts/ChartFrame";
import { Distribution } from "../components/charts/Distribution";
import { DataTable } from "../components/ui/DataTable";
import { Segmented, SelectField, SliderField } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { StatTile } from "../components/ui/StatTile";
import { EmptyState } from "../components/ui/States";
import { adaptiveThreshold, bitsText, decodeBits, decodingAccuracy } from "../lib/analysis/decode";
import { useData } from "../lib/data/DataContext";
import { runLabel } from "../lib/data/runs";
import { numParam, useRoute } from "../lib/state/route";
import { channelOptions, conditionOptions, MODEL_HELP, modelOptions, ms, pct, pick, runsProvenance } from "../lib/view/select";

const MODES = ["fixed", "adaptive", "manual"] as const;

export default function DecodeView() {
  const { runs, bundle } = useData();
  const { params, setParams } = useRoute();
  const linked = runs.find((r) => r.id === params.get("run"));
  const model = params.get("model") ?? linked?.delayModel ?? bundle?.provenance.delayModels.at(-1) ?? "netem";
  const cond = params.get("cond") ?? (linked?.origin === "bundle" ? linked.condition : "jitter 50 ms");
  const chan = params.get("chan") ?? linked?.channel ?? "0.95/1.05 s";
  const mode = pick(params.get("mode"), MODES, "fixed");

  const candidates = useMemo(() => runs.filter((r) => r.label === "covert" && r.bits &&
    (r.origin === "upload" || (r.delayModel === model && r.condition === cond && r.channel === chan))), [runs, model, cond, chan]);
  const run = (linked && candidates.includes(linked) ? linked : null) ?? candidates[0];
  const auto = run ? adaptiveThreshold(run.times, run.seq) : 1;
  const manual = numParam(params, "th", auto, 0.5, 1.5);
  const threshold = mode === "fixed" ? bundle?.settings.nominal ?? 1 : mode === "adaptive" ? auto : manual;

  const byCondition = useMemo(() => {
    const groups = new Map<string, { fixed: number[]; adaptive: number[] }>();
    for (const d of bundle?.decode ?? []) {
      if (d.delayModel !== model || d.channel !== chan) continue;
      const g = groups.get(d.condition) ?? { fixed: [], adaptive: [] };
      if (d.accuracyFixed !== null) g.fixed.push(d.accuracyFixed);
      if (d.accuracyAdaptive !== null) g.adaptive.push(d.accuracyAdaptive);
      groups.set(d.condition, g);
    }
    const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    return (bundle?.settings.conditions ?? []).filter((c) => groups.has(c.name)).map((c) => ({ condition: c.name, n: groups.get(c.name)!.fixed.length, fixed: avg(groups.get(c.name)!.fixed), adaptive: avg(groups.get(c.name)!.adaptive) }));
  }, [bundle, model, chan]);

  const pickers = (
    <Panel title="Choose a covert run" id="pick">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField label="Delay model" help={MODEL_HELP} value={model} options={modelOptions(bundle)} onValueChange={(v) => setParams({ model: v, run: null })} />
        <SelectField label="Network condition" value={cond} options={conditionOptions(bundle)} onValueChange={(v) => setParams({ cond: v, run: null })} />
        <SelectField label="Covert channel" value={chan} options={channelOptions(bundle)} onValueChange={(v) => setParams({ chan: v, run: null })} />
        <SelectField label="Run" value={run?.id ?? ""} disabled={!candidates.length} onValueChange={(v) => setParams({ run: v, model, cond, chan })}
          options={candidates.length ? candidates.map((r) => ({ value: r.id, label: runLabel(r) })) : [{ value: "", label: "No covert runs with known bits" }]} />
      </div>
    </Panel>
  );
  if (!run) {
    return <div className="grid gap-4">{pickers}<EmptyState title="No covert run with known bits">Covert CSV files need the bits that were sent; type them in the Runs table.</EmptyState></div>;
  }

  const sent = run.bits!;
  const sentBits = [...sent].map(Number);
  const seqStart = null;
  const decoded = decodeBits(run.times, run.seq, threshold, seqStart);
  const text = bitsText(decoded, sent.length);
  const acc = decodingAccuracy(sentBits, decoded);
  const accFixed = decodingAccuracy(sentBits, decodeBits(run.times, run.seq, bundle?.settings.nominal ?? 1, seqStart));
  const accAuto = decodingAccuracy(sentBits, decodeBits(run.times, run.seq, auto, seqStart));
  const missing = [...text].filter((c) => c === "?").length;
  const prov = runsProvenance([run]);
  const zeros: number[] = [], ones: number[] = [];
  const first = run.seq ? Math.min(...run.seq) : 0;
  for (let i = 1; i < run.times.length; i++) {
    if (run.seq && run.seq[i] - run.seq[i - 1] !== 1) continue;
    const bit = sent[run.seq ? run.seq[i - 1] - first : i - 1];
    if (bit === "0") zeros.push(run.times[i] - run.times[i - 1]);
    else if (bit === "1") ones.push(run.times[i] - run.times[i - 1]);
  }
  const bundleEntry = bundle?.decode.find((d) => d.runId === run.id);

  return (
    <div className="grid gap-4">
      {pickers}
      <Panel title="Threshold" id="threshold" help="A gap shorter than the threshold decodes as 0, otherwise 1. The fixed threshold is the nominal 1 s; the adaptive one splits this run's gaps into two groups (2-means), so it follows a shifted network delay.">
        <div className="grid gap-3 md:grid-cols-2">
          <Segmented label="Threshold" value={mode} onValueChange={(v) => setParams({ mode: v === "fixed" ? null : v })}
            options={[{ value: "fixed", label: "Fixed 1 s" }, { value: "adaptive", label: "Adaptive" }, { value: "manual", label: "Manual" }]} />
          <SliderField label="Manual threshold" value={manual} min={0.5} max={1.5} step={0.001} format={(v) => ms(v, 0)} disabled={mode !== "manual"}
            onValueChange={(v) => setParams({ th: v.toFixed(3), mode: "manual" })} help="Drag to see how sensitive decoding is to where the split sits." />
        </div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Bits recovered" value={pct(acc, 1)} detail={`threshold ${ms(threshold, 2)}`} provenance={prov} help="Share of sent bits decoded correctly. Bits lost with a dropped request count as wrong." />
        <StatTile label="Fixed 1 s threshold" value={pct(accFixed, 1)} provenance={prov} detail={bundleEntry ? `exported: ${pct(bundleEntry.accuracyFixed, 1)}` : undefined} />
        <StatTile label="Adaptive threshold" value={pct(accAuto, 1)} detail={`${ms(auto, 2)}${bundleEntry ? ` · exported: ${pct(bundleEntry.accuracyAdaptive, 1)}` : ""}`} provenance={prov} />
        <StatTile label="Bits missing" value={String(missing)} detail={`of ${sent.length}; a lost request costs the bits beside it`} provenance={prov} />
      </div>

      <Panel title="Sent and decoded bits" id="bits" provenance={prov}
        help="Top row: bits the sender encoded. Bottom row: what the receiver decoded. Wrong bits are outlined and marked ×; '?' means the gap was lost.">
        <ChartFrame title="Sent and decoded bits" provenance={prov} height={0} fileName="cadence-bits"
          legend={[{ label: "1 bit", color: "var(--series-normal)", shape: "square" }, { label: "0 bit", color: "var(--surface-2)", shape: "square" }, { label: "decoded wrong", color: "var(--flag)", shape: "line" }]}>
          {(width) => <BitGrid width={width} sent={sent} decoded={text} />}
        </ChartFrame>
        <dl className="mt-3 grid gap-1 font-mono text-xs text-ink-2 [overflow-wrap:anywhere]">
          <div><dt className="inline text-ink-3">sent    </dt><dd className="inline">{sent}</dd></div>
          <div><dt className="inline text-ink-3">decoded </dt><dd className="inline">{text}</dd></div>
        </dl>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Gaps by the bit they carried" id="gapdist" provenance={prov}
          help="If the two groups overlap, no threshold can decode every bit: network jitter has blurred the channel.">
          <ChartFrame title="Gaps by bit" provenance={prov} height={300} fileName="cadence-bit-gaps"
            legend={[{ label: "gaps sent as 0", color: "var(--series-normal)", shape: "square" }, { label: "gaps sent as 1", color: "var(--series-covert)", shape: "square" }]}
            caption={`Current threshold: ${ms(threshold, 2)}.`}>
            {(width, height) => <Distribution width={width} height={height} series={[
              { key: "0", label: "sent as 0", color: "var(--series-normal)", values: zeros },
              { key: "1", label: "sent as 1", color: "var(--series-covert)", values: ones },
            ]} />}
          </ChartFrame>
        </Panel>
        <Panel title="Accuracy by network condition" id="bycond" provenance="simulated"
          help={`Mean decoding accuracy over the exported example runs of ${chan} (${model} model), fixed against adaptive threshold.`}>
          {byCondition.length ? (
            <>
              <ChartFrame title="Decoding accuracy by condition" provenance="simulated" height={0} fileName="cadence-decode-by-condition"
                legend={[{ label: "fixed 1 s", color: "var(--series-3)", shape: "square" }, { label: "adaptive", color: "var(--series-4)", shape: "square" }]}>
                {(width) => <GroupedBars width={width} groups={byCondition.map((c) => ({
                  key: c.condition, label: c.condition,
                  values: [{ series: "fixed 1 s", value: c.fixed, color: "var(--series-3)" }, { series: "adaptive", value: c.adaptive, color: "var(--series-4)" }],
                }))} />}
              </ChartFrame>
              <div className="mt-3">
                <DataTable caption="Decoding accuracy by condition" csvName="cadence-decode" provenanceNote={`SIMULATED · ${model} · ${chan}`}
                  rows={byCondition} rowKey={(c) => c.condition}
                  columns={[
                    { key: "c", header: "Condition", cell: (c) => c.condition },
                    { key: "n", header: "Runs", numeric: true, cell: (c) => c.n },
                    { key: "f", header: "Fixed", numeric: true, cell: (c) => pct(c.fixed, 1), csv: (c) => c.fixed },
                    { key: "a", header: "Adaptive", numeric: true, cell: (c) => pct(c.adaptive, 1), csv: (c) => c.adaptive },
                  ]} />
              </div>
            </>
          ) : <EmptyState title="No exported decoding results for this channel" />}
        </Panel>
      </div>
    </div>
  );
}
