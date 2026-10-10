import { ArrowDownTrayIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { downloadText, toCsv } from "../../lib/exporting";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  csv?: (row: T) => string | number | null;
  numeric?: boolean;
}

export function DataTable<T>({ caption, columns, rows, rowKey, csvName, provenanceNote, maxHeight }: {
  caption: string; columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; csvName: string; provenanceNote: string; maxHeight?: number;
}) {
  const exportCsv = () => {
    const header = columns.map((c) => c.header);
    const body = rows.map((r) => columns.map((c) => (c.csv ? c.csv(r) : String(c.cell(r) ?? ""))));
    downloadText(`${csvName}.csv`, `# ${provenanceNote}\n` + toCsv([header, ...body]), "text/csv");
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="overflow-auto rounded-md border border-line" style={maxHeight ? { maxHeight } : undefined} tabIndex={0} role="region" aria-label={caption}>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`whitespace-nowrap px-3 py-2 text-left font-semibold text-ink-2 ${c.numeric ? "text-right" : ""}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="border-t border-line">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-1.5 align-middle text-ink ${c.numeric ? "tabular text-right font-mono" : ""}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="no-print flex">
        <Button size="sm" variant="ghost" icon={<ArrowDownTrayIcon className="size-4" aria-hidden />} onClick={exportCsv}>
          CSV: {caption}
        </Button>
      </div>
    </div>
  );
}
