// Parses dropped tshark CSVs off the main thread. Files never leave the browser.
import { parseCaptureCsv } from "../lib/data/csv";

self.onmessage = async (e: MessageEvent<{ id: number; files: File[] }>) => {
  const { id, files } = e.data;
  const results = [];
  for (const f of files) {
    try {
      const text = await f.text();
      results.push({ ok: true as const, value: parseCaptureCsv(text, f.name) });
    } catch (err) {
      results.push({ ok: false as const, name: f.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  (self as unknown as Worker).postMessage({ id, results });
};
