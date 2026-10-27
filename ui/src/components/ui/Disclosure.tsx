import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useId, useState, type ReactNode } from "react";
import { cx } from "./cx";

/** A button that shows or hides secondary controls, such as a view's advanced settings. */
export function Disclosure({ label, summary, defaultOpen = false, children }: {
  label: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className="mt-3 border-t border-line pt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-11 items-center gap-1 pressable rounded-md px-2 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
          <ChevronDownIcon className={cx("size-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-in-out)]", open && "rotate-180")} aria-hidden />
          {label}
        </button>
        {summary ? <span className="text-xs text-ink-3">{summary}</span> : null}
      </div>
      <div id={bodyId} hidden={!open} className={cx("pt-2", open && "reveal")}>{open ? children : null}</div>
    </div>
  );
}
