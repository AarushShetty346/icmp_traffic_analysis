import * as RDialog from "@radix-ui/react-dialog";
import { XMarkIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";

export function Dialog({ open, onOpenChange, title, description, children, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RDialog.Content
          className={`fixed left-1/2 top-[8vh] z-50 max-h-[84vh] w-[calc(100vw-2rem)] -translate-x-1/2 overflow-auto rounded-lg border border-line bg-surface p-4 shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="mb-3 flex items-start gap-2">
            <RDialog.Title className="text-lg font-semibold text-ink">{title}</RDialog.Title>
            <RDialog.Close className="-m-2 ml-auto inline-flex size-11 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close dialog">
              <XMarkIcon className="size-5" aria-hidden />
            </RDialog.Close>
          </div>
          <RDialog.Description className={description ? "mb-3 text-sm text-ink-2" : "sr-only"}>{description ?? title}</RDialog.Description>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
