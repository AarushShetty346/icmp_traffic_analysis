import type { ReactNode } from "react";
import { InfoTip } from "./InfoTip";
import { ProvenanceBadge, type Provenance } from "./ProvenanceBadge";

export function StatTile({ label, value, detail, help, provenance }: {
  label: string; value: string; detail?: ReactNode; help?: ReactNode; provenance?: Provenance;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-1 text-sm text-ink-2">
        <span>{label}</span>
        {help ? <InfoTip term={label}>{help}</InfoTip> : null}
        {provenance ? <ProvenanceBadge source={provenance} compact className="ml-auto" /> : null}
      </div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
      {detail ? <div className="text-xs text-ink-3">{detail}</div> : null}
    </div>
  );
}
