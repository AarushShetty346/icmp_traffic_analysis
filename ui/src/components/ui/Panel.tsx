import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useId, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { InfoTip } from "./InfoTip";
import { ProvenanceBadge, type Provenance } from "./ProvenanceBadge";

/** A titled card. `collapsible` panels hide reference detail (raw tables) until asked for. */
export function Panel({ title, help, provenance, actions, children, className, id, collapsible, defaultOpen = true }: {
  title: string; help?: ReactNode; provenance?: Provenance; actions?: ReactNode; children: ReactNode; className?: string; id?: string;
  collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const shown = !collapsible || open;
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} id={id} className={cx("min-w-0 rounded-lg border border-line bg-surface", className)}>
      <header className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2", shown && "border-b border-line")}>
        <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold text-ink">{title}</h2>
        {help ? <InfoTip term={title}>{help}</InfoTip> : null}
        {provenance ? <ProvenanceBadge source={provenance} /> : null}
        {actions || collapsible ? (
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {actions}
            {collapsible ? (
              <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}
                className="inline-flex min-h-11 items-center gap-1 pressable rounded-md px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
                {open ? "Hide" : "Show"}<span className="sr-only"> {title.toLowerCase()}</span>
                <ChevronDownIcon className={cx("size-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-in-out)]", open && "rotate-180")} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </header>
      <div id={bodyId} hidden={!shown} className={cx("min-w-0 p-4", collapsible && "reveal")}>{shown ? children : null}</div>
    </section>
  );
}
