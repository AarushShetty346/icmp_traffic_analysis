import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { InfoTip } from "./InfoTip";
import { ProvenanceBadge, type Provenance } from "./ProvenanceBadge";

/** good: the number is where it should be; alert: it needs a look. Shown as an accent bar plus words, never colour alone. */
export type Tone = "good" | "alert";

export function StatTile({ label, value, detail, help, provenance, tone, toneText }: {
  label: string; value: string; detail?: ReactNode; help?: ReactNode; provenance?: Provenance; tone?: Tone; toneText?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-3",
      tone === "good" && "border-l-4 border-l-ok", tone === "alert" && "border-l-4 border-l-danger bg-danger-bg")}>
      <div className="flex flex-wrap items-center gap-1 text-sm text-ink-2">
        <span>{label}</span>
        {help ? <InfoTip term={label}>{help}</InfoTip> : null}
        {provenance ? <ProvenanceBadge source={provenance} compact className="ml-auto" /> : null}
      </div>
      <div className="text-3xl font-semibold tabular-nums text-ink">{value}</div>
      {tone ? (
        <div className={cx("flex items-center gap-1 text-xs font-medium", tone === "good" ? "text-ok" : "text-danger")}>
          {tone === "good" ? <CheckCircleIcon className="size-3.5" aria-hidden /> : <ExclamationTriangleIcon className="size-3.5" aria-hidden />}
          {toneText ?? (tone === "good" ? "On target" : "Needs attention")}
        </div>
      ) : null}
      {detail ? <div className="text-xs text-ink-3">{detail}</div> : null}
    </div>
  );
}
