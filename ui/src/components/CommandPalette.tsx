import * as RDialog from "@radix-ui/react-dialog";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { useEffect, useMemo, useState } from "react";

export interface Command { id: string; label: string; hint?: string; run: () => void }

/** Ctrl/Cmd-K command list: type to filter, arrows to move, Enter to run. */
export function CommandPalette({ open, onOpenChange, commands }: { open: boolean; onOpenChange: (o: boolean) => void; commands: Command[] }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? commands.filter((c) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(t)) : commands;
  }, [q, commands]);
  useEffect(() => { setActive(0); }, [q, open]);
  useEffect(() => { if (!open) setQ(""); }, [open]);
  const run = (c: Command | undefined) => { if (!c) return; onOpenChange(false); setTimeout(c.run, 0); };
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RDialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          <RDialog.Description className="sr-only">Type to filter commands, use the arrow keys to choose, Enter to run.</RDialog.Description>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <MagnifyingGlassIcon className="size-5 text-ink-3" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-list"
              aria-activedescendant={list[active] ? `cmd-${list[active].id}` : undefined}
              aria-label="Search commands"
              placeholder="Go to a view, change theme, export…"
              className="min-h-12 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                else if (e.key === "Enter") { e.preventDefault(); run(list[active]); }
              }}
            />
          </div>
          <ul id="cmd-list" role="listbox" aria-label="Commands" className="max-h-80 overflow-auto p-1">
            {list.length === 0 ? <li className="px-3 py-3 text-sm text-ink-3" role="presentation">No command matches.</li> : null}
            {list.map((c, i) => (
              <li
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === active}
                onPointerMove={() => setActive(i)}
                onClick={() => run(c)}
                className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md px-3 text-sm ${i === active ? "bg-accent-soft text-ink" : "text-ink-2"}`}
              >
                <span>{c.label}</span>
                {c.hint ? <span className="font-mono text-xs text-ink-3">{c.hint}</span> : null}
              </li>
            ))}
          </ul>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
