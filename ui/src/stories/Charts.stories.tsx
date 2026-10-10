import type { Meta, StoryObj } from "@storybook/react-vite";
import { BitGrid } from "../components/charts/BitGrid";
import { ChartFrame } from "../components/charts/ChartFrame";
import { Distribution } from "../components/charts/Distribution";
import { Heatmap, RampLegend } from "../components/charts/Heatmap";
import { IpdTimeline } from "../components/charts/IpdTimeline";
import { RocChart } from "../components/charts/RocChart";
import { DecisionStrip } from "../components/charts/DecisionStrip";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

// Deterministic demo data (not project results): a small LCG so stories render the same every time.
let s = 7;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const normal = Array.from({ length: 63 }, () => 1 + (rnd() - 0.5) * 0.01);
const covert = Array.from({ length: 63 }, () => (rnd() > 0.5 ? 1.05 : 0.95) + (rnd() - 0.5) * 0.01);
const asGaps = (g: number[]) => g.map((dt, index) => ({ index, seq: index + 1, dt }));

export const Timeline: Story = {
  render: () => (
    <ChartFrame title="Demo timeline" provenance="simulated" height={280} fileName="demo"
      legend={[{ label: "normal", color: "var(--series-normal)" }, { label: "covert", color: "var(--series-covert)" }]}>
      {(w, h) => <IpdTimeline width={w} height={h} range={[0, 62]} boundaries={[0, 32]}
        series={[{ key: "n", label: "normal", color: "var(--series-normal)", gaps: asGaps(normal), lost: [] },
          { key: "c", label: "covert", color: "var(--series-covert)", gaps: asGaps(covert), lost: [20] }]} />}
    </ChartFrame>
  ),
};

export const DistributionChart: Story = {
  render: () => (
    <ChartFrame title="Demo distribution" provenance="simulated" height={300} fileName="demo">
      {(w, h) => <Distribution width={w} height={h} series={[
        { key: "n", label: "normal", color: "var(--series-normal)", values: normal },
        { key: "c", label: "covert", color: "var(--series-covert)", values: covert }]} />}
    </ChartFrame>
  ),
};

export const Roc: Story = {
  render: () => (
    <ChartFrame title="Demo ROC" provenance="simulated" height={300} fileName="demo">
      {(w, h) => <RocChart width={w} height={h} mode="roc" operating={{ fpr: 0.1, tpr: 0.8, precision: 0.9, label: "p95" }}
        curves={[{ key: "a", label: "std", color: "var(--series-normal)", points: [0, 0.05, 0.1, 0.3, 1].map((f, i) => ({ fpr: f, tpr: [0, 0.6, 0.8, 0.95, 1][i], precision: null, threshold: null })) }]} />}
    </ChartFrame>
  ),
};

const conds = ["clean", "jitter 20 ms", "jitter 50 ms", "jitter 100 ms"];
const chans = ["0.75/1.25 s", "0.95/1.05 s", "0.98/1.02 s"];
export const Matrix: Story = {
  render: () => (
    <ChartFrame title="Demo matrix" provenance="simulated" height={0} fileName="demo" caption={<RampLegend label="detection rate" />}>
      {(w) => <Heatmap width={w} rows={chans} cols={conds} metricLabel="detection rate" onSelect={() => {}}
        cells={chans.flatMap((r, i) => conds.map((c, j) => ({ row: r, col: c, value: Math.max(0, 1 - i * j * 0.18), selected: i === 1 && j === 2 })))} />}
    </ChartFrame>
  ),
};

export const WindowDecisions: Story = {
  render: () => (
    <ChartFrame title="Demo rulings" provenance="simulated" height={0} fileName="demo">
      {(w) => <DecisionStrip width={w} rows={[
        { key: "a", label: "normal #0 · baseline", flags: [false, true], truth: "normal" },
        { key: "b", label: "covert #0 · baseline", flags: [true, true], truth: "covert" }]} />}
    </ChartFrame>
  ),
};

export const Bits: Story = {
  render: () => (
    <ChartFrame title="Demo bits" provenance="simulated" height={0} fileName="demo">
      {(w) => <BitGrid width={w} sent="0110100111010010" decoded="01101?0111010110" />}
    </ChartFrame>
  ),
};
