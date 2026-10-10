import * as Popover from "@radix-ui/react-popover";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";

/** Plain-language explanation of a statistic. A button (not hover-only) so it works by touch and keyboard. */
export function InfoTip({ term, children }: { term: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className="-my-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:text-ink"
        aria-label={`What is ${term}?`}
      >
        <InformationCircleIcon className="size-4" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          collisionPadding={12}
          className="z-50 max-w-72 rounded-md border border-line bg-surface p-3 text-sm text-ink-2 shadow-lg"
        >
          <p className="mb-1 font-semibold text-ink">{term}</p>
          {children}
          <Popover.Arrow className="fill-[var(--line)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
