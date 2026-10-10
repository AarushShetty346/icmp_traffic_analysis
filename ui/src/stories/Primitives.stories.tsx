import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowDownTrayIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import { Button } from "../components/ui/Button";
import { RangeField, Segmented, SelectField, SliderField, SwitchField } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { ProvenanceBadge } from "../components/ui/ProvenanceBadge";
import { StatTile } from "../components/ui/StatTile";
import { ChartSkeleton, EmptyState, ErrorState } from "../components/ui/States";

const meta: Meta = { title: "Primitives" };
export default meta;
type Story = StoryObj;

export const Buttons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary">Primary</Button>
      <Button>Secondary</Button>
      <Button variant="ghost" icon={<ArrowDownTrayIcon className="size-4" aria-hidden />}>Ghost with icon</Button>
      <Button variant="danger">Danger</Button>
      <Button loading>Loading</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};

export const Provenance: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ProvenanceBadge source="simulated" />
      <ProvenanceBadge source="capture" />
      <ProvenanceBadge source="mixed" />
      <ProvenanceBadge source="simulated" compact />
    </div>
  ),
};

export const Tiles: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile label="Detection rate" value="94%" detail="95% CI 88%–99% over 20 runs" provenance="simulated" help="Share of covert windows flagged." />
      <StatTile label="False positives" value="5%" provenance="capture" />
      <StatTile label="Windows" value="40" />
    </div>
  ),
};

function FieldsDemo() {
  const [v, setV] = useState(32);
  const [r, setR] = useState<[number, number]>([0, 40]);
  const [s, setS] = useState("matched");
  const [on, setOn] = useState(true);
  return (
    <Panel title="Fields" help="Every control is at least 44 px tall.">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Network condition" value="clean" onValueChange={() => {}} options={[{ value: "clean", label: "clean" }, { value: "j", label: "jitter 20 ms" }]} />
        <SliderField label="Window size" value={v} min={4} max={64} step={1} unit="requests" onValueChange={setV} help="Requests per window." />
        <RangeField label="Gaps shown" value={r} min={0} max={63} step={1} format={(x) => `#${x}`} onValueChange={setR} />
        <Segmented label="Baseline" value={s} onValueChange={setS} options={[{ value: "matched", label: "Same conditions" }, { value: "clean", label: "Clean LAN" }]} />
        <SwitchField label="Show lost requests" checked={on} onCheckedChange={setOn} />
      </div>
    </Panel>
  );
}
export const Fields: Story = { render: () => <FieldsDemo /> };

export const States: Story = {
  render: () => (
    <div className="grid gap-3">
      <EmptyState title="No runs match these filters">Change a filter, or add tshark CSV files.</EmptyState>
      <ErrorState title="The data bundle did not load" message="could not load data/bundle.json (HTTP 404)" onRetry={() => {}} />
      <ChartSkeleton height={120} />
    </div>
  ),
};
