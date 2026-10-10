import { useMemo } from "react";
import { GroupedBars } from "../components/charts/Bars";
import { ChartFrame } from "../components/charts/ChartFrame";
import { RocChart, type Curve } from "../components/charts/RocChart";
import { DecisionStrip, type StripRow } from "../components/charts/DecisionStrip";
import { DataTable } from "../components/ui/DataTable";
import { FieldLabel, Segmented, SelectField, SliderField } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { StatTile } from "../components/ui/StatTile";
import { EmptyState, ErrorState } from "../components/ui/States";
import {
  auc, buildBaseline, classifyBaseline, classifyFixed, confusion, DIRECTION, featureScores, rocCurve, score, scoreThreshold, type Baseline,
} from "../lib/analysis/detect";
import { ALL_FEATURES, FEATURE_HELP, windows, type FeatureName } from "../lib/analysis/features";
import { useData } from "../lib/data/DataContext";
import { runLabel, type Run } from "../lib/data/runs";
import { numParam, useRoute } from "../lib/state/route";
import {
  bundleSet, channelOptions, conditionOptions, MODEL_HELP, modelOptions, pct, pick, runsProvenance, uploadSet,
} from "../lib/view/select";

const SOURCES = ["bundle", "uploads"] as const;

export default function DetectorsView() {
  const { runs, uploads, bundle } = useData();
  const { params, setParams } = useRoute();
  const src = pick(params.get("src"), SOURCES, "bundle");
  const model = params.get("model") ?? bundle?.provenance.delayModels.at(-1) ?? "netem";
  const cond = params.get("cond") ?? "jitter 20 ms";
  const chan = params.get("chan") ?? "0.95/1.05 s";
  const base = pick(params.get("base"), ["matched", "clean"] as const, "matched");
  const w = numParam(params, "w", bundle?.settings.defaultWindow ?? 32, 4, 64);
  const step = numParam(params, "step", 0, 0, w);
  const percentile = numParam(params, "pct", bundle?.settings.percentile ?? 95, 50, 100);
  const stdLimit = numParam(params, "std", bundle?.settings.fixedRule.stdLimit ?? 0.1, 0.001, 1);
  const meanLimit = numParam(params, "mean", bundle?.settings.fixedRule.meanLimit ?? 0.1, 0.001, 1);
  const feats = (params.get("feat")?.split(",").filter((f): f is FeatureName => (ALL_FEATURES as readonly string[]).includes(f)) ?? []);
  const features: FeatureName[] = feats.length ? feats : ["std"];
  const rocFeature = pick(params.get("roc"), ALL_FEATURES, features[0]);
  const mode = pick(params.get("mode"), ["roc", "pr"] as const, "roc");

  const set = useMemo(() => (src === "uploads" ? uploadSet(uploads) : bundleSet(runs, model, cond, chan, base)), [src, uploads, runs, model, cond, chan, base]);
  const prov = runsProvenance([...set.baseline, ...set.normal, ...set.covert]);

  const result = useMemo(() => {
    if (!set.baseline.length || !set.normal.length || !set.covert.length) return null;
    let baseline: Baseline;
    try {
      baseline = buildBaseline(set.baseline.map((r) => ({ times: r.times, seq: r.seq })), w, percentile, step || null);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) } as const;
    }
    const perRun = (rs: Run[]) => rs.map((r) => ({ run: r, wins: windows(r.times, w, step || null, r.seq) }));
    const normal = perRun(set.normal), covert = perRun(set.covert);
    const rule = { nominal: bundle?.settings.nominal ?? 1, meanLimit: meanLimit, stdLimit: stdLimit };
    const rulings = [...normal, ...covert].map(({ run, wins }) => ({
      run,
      fixed: wins.map((ipd) => classifyFixed(ipd, rule).suspicious),
      learned: wins.map((ipd) => classifyBaseline(ipd, baseline, features).suspicious),
    }));
    const truth = rulings.flatMap((v) => v.fixed.map(() => v.run.label === "covert"));
    const fixedRates = confusion(truth, rulings.flatMap((v) => v.fixed));
    const baseRates = confusion(truth, rulings.flatMap((v) => v.learned));
    const nWins = normal.flatMap((r) => r.wins), cWins = covert.flatMap((r) => r.wins);
    if (!nWins.length || !cWins.length) return { error: `no complete windows of ${w} requests in the test runs; lower the window size` } as const;
    const comparison = ALL_FEATURES.filter((f) => baseline.upper[f] !== undefined).map((f) => {
      const neg = featureScores(baseline, nWins, f), pos = featureScores(baseline, cWins, f);
      const t = scoreThreshold(baseline, f);
      const points = rocCurve(neg, pos);
      return {
        feature: f, auc: auc(points), points,
        dr: pos.filter((s) => s > t).length / pos.length, fpr: neg.filter((s) => s > t).length / neg.length,
        precision: (() => { const tp = pos.filter((s) => s > t).length, fp = neg.filter((s) => s > t).length; return tp + fp ? tp / (tp + fp) : null; })(),
      };
    });
    return { baseline, rulings, fixedRates, baseRates, comparison, nNormal: nWins.length, nCovert: cWins.length };
  }, [set, w, step, percentile, stdLimit, meanLimit, features.join(","), bundle]); // eslint-disable-line react-hooks/exhaustive-deps

  const matrixRow = (det: string) => src === "bundle"
    ? bundle?.matrix.find((m) => m.delayModel === model && m.condition === cond && m.channel === chan && m.window === w && m.detector === det)
    : undefined;
  const exportedRoc = src === "bundle" && base === "matched" && !step && percentile === 95
    ? bundle?.roc.find((r) => r.delayModel === model && r.condition === cond && r.channel === chan && r.window === w && r.feature === rocFeature)
    : undefined;
  const exportedFeatures = src === "bundle" && base === "matched"
    ? bundle?.features.find((f) => f.delayModel === model && f.condition === cond && f.channel === chan && f.window === w)
    : undefined;
  const ciText = (det: string, key: "detection_rate" | "false_positive_rate") => {
    const ci = matrixRow(det)?.ci?.[key];
    return ci ? `Exported, ${ci.runs} runs: ${pct(ci.estimate)} (95% CI ${pct(ci.lo)}–${pct(ci.hi)})` : "No exported interval for these settings";
  };
  const isDefault = !step && percentile === 95 && stdLimit === 0.1 && meanLimit === 0.1 && features.length === 1 && features[0] === "std";

  const toggleFeature = (f: FeatureName) => {
    const next = features.includes(f) ? features.filter((x) => x !== f) : [...features, f];
    setParams({ feat: next.length && !(next.length === 1 && next[0] === "std") ? next.join(",") : null });
  };

  const settings = (
    <Panel title="Settings" id="settings" help="Every change recomputes the baseline and every window's verdict in this browser.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Segmented label="Data" value={src} onValueChange={(v) => setParams({ src: v === "bundle" ? null : v })}
          options={[{ value: "bundle", label: "Exported runs" }, { value: "uploads", label: "My CSV files" }]}
          help="Exported runs come from the bundle. 'My CSV files' uses the files added on the Runs view, with the roles and labels set there." />
        {src === "bundle" ? (
          <>
            <SelectField label="Delay model" help={MODEL_HELP} value={model} options={modelOptions(bundle)} onValueChange={(v) => setParams({ model: v })} />
            <SelectField label="Network condition" value={cond} options={conditionOptions(bundle)} onValueChange={(v) => setParams({ cond: v })}
              help="Added jitter and loss in the simulated network." />
            <SelectField label="Covert channel" value={chan} options={channelOptions(bundle)} onValueChange={(v) => setParams({ chan: v })}
              help="Gap used for a 0 bit and for a 1 bit. Closer to 1 s is harder to see." />
            <Segmented label="Baseline learned on" value={base} onValueChange={(v) => setParams({ base: v === "matched" ? null : v })}
              options={[{ value: "matched", label: "Same conditions" }, { value: "clean", label: "Clean LAN" }]}
              help="Same conditions: normal runs under the tested network condition. Clean LAN: normal runs without added jitter or loss." />
          </>
        ) : null}
        <SliderField label="Window size" value={w} min={4} max={64} step={1} unit="requests" onValueChange={(v) => setParams({ w: v, step: step > v ? null : step || null })}
          help="Requests per observation window." />
        <SliderField label="Window step" value={step} min={0} max={w} step={1} format={(v) => (v === 0 || v === w ? "no overlap" : `${v} requests`)} onValueChange={(v) => setParams({ step: v === 0 || v === w ? null : v })}
          help="Smaller than the window size gives overlapping windows (more, correlated rulings)." />
        <SliderField label="Baseline percentile" value={percentile} min={80} max={99.5} step={0.5} format={(v) => `p${v}`} onValueChange={(v) => setParams({ pct: v === 95 ? null : v })}
          help="The baseline flags a window when a feature passes this percentile of normal windows. Two-sided features use the central band instead." />
        <SliderField label="Fixed rule: std limit" value={stdLimit} min={0.005} max={0.3} step={0.005} format={(v) => `${(v * 1000).toFixed(0)} ms`} onValueChange={(v) => setParams({ std: v === 0.1 ? null : v })}
          help="The fixed rule flags a window when its gap standard deviation is above this." />
        <SliderField label="Fixed rule: mean limit" value={meanLimit} min={0.005} max={0.3} step={0.005} format={(v) => `± ${(v * 1000).toFixed(0)} ms`} onValueChange={(v) => setParams({ mean: v === 0.1 ? null : v })}
          help="The fixed rule also flags a window when its mean gap is further than this from 1 s." />
      </div>
      <fieldset className="mt-3">
        <legend><FieldLabel label="Baseline detector features" help="The baseline flags a window if any checked feature is outside its learned range." /></legend>
        <div className="flex flex-wrap gap-1">
          {ALL_FEATURES.map((f) => (
            <label key={f} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${features.includes(f) ? "border-accent bg-accent-soft text-ink" : "border-line-strong text-ink-2"}`}>
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={features.includes(f)} onChange={() => toggleFeature(f)} />
              <span className="font-mono">{f}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {!isDefault ? <p className="mt-2 text-xs text-ink-3">Settings differ from the project defaults (window step none, p95, 100 ms limits, std only), so exported intervals below are for the defaults, not these settings.</p> : null}
    </Panel>
  );

  if (!result) {
    return (
      <div className="grid gap-4">
        {settings}
        <EmptyState title={src === "uploads" ? "Not enough of your files yet" : "No runs for these settings"}>
          {src === "uploads"
            ? "Add at least one baseline run, one normal test run and one covert test run on the Runs view, and set their roles and labels there."
            : "This combination is not in the exported bundle. Pick another condition or delay model."}
        </EmptyState>
      </div>
    );
  }
  if ("error" in result) return <div className="grid gap-4">{settings}<ErrorState title="Cannot evaluate these settings" message={String(result.error)} /></div>;

  const { fixedRates, baseRates, rulings, comparison, baseline } = result;
  const roc = comparison.find((c) => c.feature === rocFeature) ?? comparison[0];
  const curves: Curve[] = [{ key: "live", label: `${roc.feature}, live (${set.normal.length + set.covert.length} runs)`, color: "var(--series-normal)", points: roc.points }];
  if (exportedRoc) curves.push({ key: "exp", label: `${roc.feature}, exported (${bundle?.provenance.runsPerSet ?? "?"} runs per set)`, color: "var(--series-covert)", points: exportedRoc.points, dashed: true });
  const strip: StripRow[] = rulings.flatMap((v) => [
    { key: `${v.run.id}-f`, label: `${v.run.label} #${v.run.id.split("-").pop()} · fixed`, flags: v.fixed, truth: v.run.label },
    { key: `${v.run.id}-b`, label: `${v.run.label} #${v.run.id.split("-").pop()} · baseline`, flags: v.learned, truth: v.run.label },
  ]);

  return (
    <div className="grid gap-4">
      {settings}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Fixed rule: detection rate" value={pct(fixedRates.detectionRate)} detail={ciText("fixed", "detection_rate")} provenance={prov}
          help="Share of covert windows the fixed rule flags." />
        <StatTile label="Fixed rule: false positives" value={pct(fixedRates.falsePositiveRate)} detail={ciText("fixed", "false_positive_rate")} provenance={prov}
          help="Share of normal windows the fixed rule flags by mistake." />
        <StatTile label="Baseline: detection rate" value={pct(baseRates.detectionRate)} detail={ciText(base === "matched" ? "baseline (matched)" : "baseline (clean)", "detection_rate")} provenance={prov}
          help="Share of covert windows the learned baseline flags." />
        <StatTile label="Baseline: false positives" value={pct(baseRates.falsePositiveRate)} detail={ciText(base === "matched" ? "baseline (matched)" : "baseline (clean)", "false_positive_rate")} provenance={prov}
          help="Share of normal windows the baseline flags. Its target is 100 minus the percentile, but a small baseline overshoots it." />
      </div>
      <p className="text-xs text-ink-3">
        Live numbers: {result.nNormal} normal and {result.nCovert} covert windows from the {set.normal.length + set.covert.length} test runs shown; the baseline uses {baseline.nWindows} windows
        from {set.baseline.length} runs. Exported intervals resample all {bundle?.provenance.runsPerSet ?? "?"} runs per set.
      </p>

      <Panel title="Verdict per window" id="rulings" provenance={prov}
        help="One row per test run and detector, one cell per window. Filled cells are windows flagged suspicious. Covert rows should be filled, normal rows empty.">
        <ChartFrame title="Verdict per window" provenance={prov} height={0} fileName="cadence-rulings"
          legend={[{ label: "flagged suspicious", color: "var(--flag)", shape: "square" }, { label: "judged normal", color: "var(--surface-2)", shape: "square" }]}>
          {(width) => <DecisionStrip width={width} rows={strip} />}
        </ChartFrame>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={mode === "roc" ? "ROC curve" : "Precision and recall"} id="roc" provenance={prov}
          help="Sweeps the threshold on one feature from strict to loose. The dot is where the baseline's own threshold sits. Area under the ROC curve (AUC) is 1 for perfect separation and 0.5 for chance."
          actions={<Segmented label="Curve" value={mode} onValueChange={(v) => setParams({ mode: v === "roc" ? null : v })} options={[{ value: "roc", label: "ROC" }, { value: "pr", label: "PR" }]} />}>
          <div className="mb-3 max-w-xs">
            <SelectField label="Feature" value={roc.feature} help={FEATURE_HELP[roc.feature]} onValueChange={(v) => setParams({ roc: v })}
              options={comparison.map((c) => ({ value: c.feature, label: `${c.feature} (AUC ${c.auc.toFixed(3)})` }))} />
          </div>
          <ChartFrame title={mode === "roc" ? "ROC curve" : "Precision-recall"} provenance={prov} height={320} fileName={`cadence-${mode}-${roc.feature}`}
            legend={curves.map((c) => ({ label: c.label, color: c.color, shape: c.dashed ? "dash" as const : "line" as const }))}
            caption={exportedRoc ? `Exported AUC ${exportedRoc.auc?.toFixed(3) ?? "–"}; live AUC ${roc.auc.toFixed(3)}.` : `Live AUC ${roc.auc.toFixed(3)}. The exported curve is shown for the default settings only.`}>
            {(width, height) => <RocChart width={width} height={height} curves={curves} mode={mode}
              operating={{ fpr: roc.fpr, tpr: roc.dr, precision: roc.precision, label: `baseline p${percentile}` }} />}
          </ChartFrame>
        </Panel>

        <Panel title="Which feature separates best" id="features" provenance={prov}
          help="Every feature on its own, scored live on the runs above: AUC, and the detection and false-positive rates at the baseline threshold.">
          <ChartFrame title="AUC by feature" provenance={prov} height={0} fileName="cadence-feature-auc"
            legend={[{ label: "AUC, live", color: "var(--series-normal)", shape: "square" }, ...(exportedFeatures ? [{ label: "AUC, exported", color: "var(--series-covert)", shape: "square" as const }] : [])]}>
            {(width) => <GroupedBars width={width} unit="auc" groups={comparison.map((c) => ({
              key: c.feature, label: c.feature,
              values: [
                { series: "live", value: c.auc, color: "var(--series-normal)" },
                ...(exportedFeatures ? [{ series: "exported", value: exportedFeatures.rows.find((r) => r.feature === c.feature)?.auc ?? null, color: "var(--series-covert)" }] : []),
              ],
            }))} />}
          </ChartFrame>
          <div className="mt-3">
            <DataTable caption="Feature comparison" csvName="cadence-features" provenanceNote={`${prov.toUpperCase()} · ${src === "bundle" ? `${model} · ${cond} · ${chan}` : "uploaded CSVs"} · window ${w}`}
              rows={comparison} rowKey={(c) => c.feature}
              columns={[
                { key: "f", header: "Feature", cell: (c) => <span className="font-mono">{c.feature}</span>, csv: (c) => c.feature },
                { key: "dir", header: "Flags when", cell: (c) => (DIRECTION[c.feature] === "upper" ? "too high" : "outside band"), csv: (c) => DIRECTION[c.feature] },
                { key: "auc", header: "AUC", numeric: true, cell: (c) => c.auc.toFixed(3), csv: (c) => c.auc },
                { key: "dr", header: "Detection", numeric: true, cell: (c) => pct(c.dr), csv: (c) => c.dr },
                { key: "fpr", header: "False pos.", numeric: true, cell: (c) => pct(c.fpr), csv: (c) => c.fpr },
                { key: "ci", header: "Exported DR (95% CI)", cell: (c) => {
                  const ci = exportedFeatures?.rows.find((r) => r.feature === c.feature)?.ci?.detection_rate;
                  return ci ? `${pct(ci.estimate)} (${pct(ci.lo)}–${pct(ci.hi)})` : "–";
                }, csv: (c) => exportedFeatures?.rows.find((r) => r.feature === c.feature)?.ci?.detection_rate.estimate ?? null },
              ]} />
          </div>
        </Panel>
      </div>

      <Panel title="Learned baseline" id="baseline" provenance={runsProvenance(set.baseline)}
        help="The normal range of each feature, learned from the baseline runs. The KS threshold is fitted leave-one-run-out so a run is never compared with itself.">
        <DataTable caption="Learned baseline" csvName="cadence-baseline" provenanceNote={`${runsProvenance(set.baseline).toUpperCase()} · ${set.baseline.map(runLabel).join("; ")}`}
          rows={ALL_FEATURES.filter((f) => baseline.upper[f] !== undefined)} rowKey={(f) => f}
          columns={[
            { key: "f", header: "Feature", cell: (f) => <span className="font-mono">{f}</span>, csv: (f) => f },
            { key: "lo", header: "Lower", numeric: true, cell: (f) => baseline.lower[f]?.toFixed(5) ?? "–", csv: (f) => baseline.lower[f] ?? null },
            { key: "hi", header: "Upper", numeric: true, cell: (f) => baseline.upper[f]!.toFixed(5), csv: (f) => baseline.upper[f]! },
            { key: "s", header: "Score threshold", numeric: true, cell: (f) => scoreThreshold(baseline, f).toFixed(5), csv: (f) => scoreThreshold(baseline, f) },
            { key: "c", header: "Example score (first covert window)", numeric: true, cell: (f) => {
              const v = rulings.find((x) => x.run.label === "covert");
              const win = v ? windows(v.run.times, w, step || null, v.run.seq)[0] : undefined;
              if (!win) return "–";
              const feat = classifyBaseline(win, baseline, [f]).features[f];
              return score(baseline, f, feat).toFixed(5);
            } },
          ]} />
      </Panel>
    </div>
  );
}
