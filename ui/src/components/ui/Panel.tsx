import type { ReactNode } from "react";
import { cx } from "./cx";
import { InfoTip } from "./InfoTip";
import { ProvenanceBadge, type Provenance } from "./ProvenanceBadge";

export function Panel({ title, help, provenance, actions, children, className, id }: {
  title: string; help?: ReactNode; provenance?: Provenance; actions?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} id={id} className={cx("min-w-0 rounded-lg border border-line bg-surface", className)}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-2">
        <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold text-ink">{title}</h2>
        {help ? <InfoTip term={title}>{help}</InfoTip> : null}
        {provenance ? <ProvenanceBadge source={provenance} /> : null}
        {actions ? <div className="ml-auto flex flex-wrap items-center gap-1">{actions}</div> : null}
      </header>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}
