import * as RSlider from "@radix-ui/react-slider";
import * as RSwitch from "@radix-ui/react-switch";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import { InfoTip } from "./InfoTip";

export function FieldLabel({ id, label, help }: { id?: string; label: string; help?: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center gap-0.5 text-sm font-medium text-ink-2">
      <span id={id}>{label}</span>
      {help ? <InfoTip term={label}>{help}</InfoTip> : null}
    </div>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label: string;
  help?: ReactNode;
  options: { value: string; label: string }[];
  onValueChange: (v: string) => void;
}

export function SelectField({ label, help, options, onValueChange, className, ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id}>
        <FieldLabel label={label} help={help} />
      </label>
      <select
        id={id}
        className="min-h-11 w-full min-w-0 truncate rounded-md border border-line-strong bg-surface px-3 text-sm text-ink"
        onChange={(e) => onValueChange(e.target.value)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export interface SliderFieldProps {
  label: string;
  help?: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (v: number) => string;
  onValueChange: (v: number) => void;
  disabled?: boolean;
}

export function SliderField({ label, help, value, min, max, step, unit = "", format, onValueChange, disabled }: SliderFieldProps) {
  const id = useId();
  const shown = format ? format(value) : `${value}${unit ? ` ${unit}` : ""}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel id={id} label={label} help={help} />
        <output className="tabular font-mono text-sm text-ink" aria-live="polite">{shown}</output>
      </div>
      <RSlider.Root
        className="relative flex h-11 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onValueChange(v[0])}
      >
        <RSlider.Track className="relative h-1.5 grow rounded-full bg-surface-2 ring-1 ring-line">
          <RSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RSlider.Track>
        <RSlider.Thumb aria-labelledby={id} aria-valuetext={shown} className="block size-5 rounded-full border-2 border-accent bg-surface shadow" />
      </RSlider.Root>
    </div>
  );
}

export function RangeField({ label, help, value, min, max, step, format, onValueChange }: {
  label: string; help?: ReactNode; value: [number, number]; min: number; max: number; step: number;
  format: (v: number) => string; onValueChange: (v: [number, number]) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel id={id} label={label} help={help} />
        <output className="tabular font-mono text-sm text-ink">{format(value[0])} – {format(value[1])}</output>
      </div>
      <RSlider.Root
        className="relative flex h-11 w-full touch-none select-none items-center"
        value={value}
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={1}
        onValueChange={(v) => onValueChange([v[0], v[1]])}
      >
        <RSlider.Track className="relative h-1.5 grow rounded-full bg-surface-2 ring-1 ring-line">
          <RSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RSlider.Track>
        <RSlider.Thumb aria-label={`${label} start`} aria-valuetext={format(value[0])} className="block size-5 rounded-full border-2 border-accent bg-surface shadow" />
        <RSlider.Thumb aria-label={`${label} end`} aria-valuetext={format(value[1])} className="block size-5 rounded-full border-2 border-accent bg-surface shadow" />
      </RSlider.Root>
    </div>
  );
}

export function SwitchField({ label, checked, onCheckedChange, help }: { label: string; checked: boolean; onCheckedChange: (v: boolean) => void; help?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3">
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line-strong bg-surface-2 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <RSwitch.Thumb className="block size-4 translate-x-1 rounded-full bg-ink-3 transition-transform duration-[var(--dur-fast)] data-[state=checked]:translate-x-6 data-[state=checked]:bg-accent-ink" />
      </RSwitch.Root>
      <label htmlFor={id} className="text-sm text-ink-2">{label}</label>
      {help ? <InfoTip term={label}>{help}</InfoTip> : null}
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onValueChange, help }: {
  label: string; value: T; options: { value: T; label: string }[]; onValueChange: (v: T) => void; help?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FieldLabel id={id} label={label} help={help} />
      <ToggleGroup.Root
        type="single"
        value={value}
        onValueChange={(v) => v && onValueChange(v as T)}
        aria-labelledby={id}
        className="inline-flex w-full flex-wrap rounded-md border border-line-strong bg-surface p-0.5"
      >
        {options.map((o) => (
          <ToggleGroup.Item
            key={o.value}
            value={o.value}
            className="min-h-10 flex-1 rounded-[5px] px-3 text-sm text-ink-2 hover:text-ink data-[state=on]:bg-accent data-[state=on]:text-accent-ink"
          >
            {o.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
