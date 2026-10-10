// tshark CSV parsing, shared by the Web Worker and the tests. Mirrors capture.py / fieldcheck.py column handling.

export interface ParsedCapture {
  name: string;
  times: number[];
  seq: number[] | null;
  simulated: boolean;
  sources: string[];
  fields: Partial<Record<FieldName, (number | string)[]>>;
  payloadHex: string[] | null;
  rowsRead: number;
  rowsKept: number;
}

export const FIELD_COLUMNS = {
  "ip.ttl": "ttl", "ip.id": "ip_id", "ip.flags": "ip_flags", "ip.dsfield": "tos", "ip.len": "ip_len",
  "icmp.code": "icmp_code", "data.len": "payload_len", "icmp.ident": "ident",
} as const;
export type FieldName = (typeof FIELD_COLUMNS)[keyof typeof FIELD_COLUMNS];

/** capture.parse_int: "0x0001", "1", "01", "1/256" -> 1; anything else stays text. */
export function parseIntLoose(v: string): number | string {
  const t = v.trim().split("/")[0].trim();
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  return t;
}

function splitLine(line: string): string[] {
  // tshark -E separator=, does not quote by default; handle simple double-quoted cells too.
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface ParseOptions { src?: string | null }

export function parseCaptureCsv(text: string, name: string, opts: ParseOptions = {}): ParsedCapture {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error(`${name}: the file has no data rows`);
  const header = splitLine(lines[0]).map((h) => h.trim());
  const col = (n: string) => header.indexOf(n);
  const timeCol = ["frame.time_epoch", "time", "timestamp"].map(col).find((i) => i >= 0);
  if (timeCol === undefined) throw new Error(`${name}: no timestamp column (expected frame.time_epoch, time or timestamp)`);
  const seqCol = col("icmp.seq") >= 0 ? col("icmp.seq") : col("icmp.seq_le") >= 0 ? col("icmp.seq_le") : col("seq");
  const srcCol = col("ip.src") >= 0 ? col("ip.src") : col("src");
  const typeCol = col("icmp.type");
  const payloadCol = col("data.data");
  const fieldCols = Object.entries(FIELD_COLUMNS).map(([c, f]) => [col(c), f] as const).filter(([i]) => i >= 0);
  const rows: { t: number; seq: number; src: string; cells: string[] }[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    if (typeCol >= 0 && parseIntLoose(cells[typeCol] ?? "") !== 8) continue;
    const t = Number(cells[timeCol]);
    if (!Number.isFinite(t)) continue;
    const src = srcCol >= 0 ? (cells[srcCol] ?? "").trim() : "";
    if (opts.src && src && src !== opts.src) continue;
    const s = seqCol >= 0 ? parseIntLoose(cells[seqCol] ?? "") : NaN;
    rows.push({ t, seq: typeof s === "number" ? s : NaN, src, cells });
  }
  rows.sort((a, b) => a.t - b.t);
  if (rows.length < 2) throw new Error(`${name}: fewer than 2 Echo Requests left after filtering`);
  const seqOk = seqCol >= 0 && rows.every((r) => Number.isFinite(r.seq));
  const fields: ParsedCapture["fields"] = {};
  for (const [i, f] of fieldCols) fields[f] = rows.map((r) => parseIntLoose(r.cells[i] ?? ""));
  return {
    name,
    times: rows.map((r) => r.t),
    seq: seqOk ? rows.map((r) => r.seq) : null,
    simulated: col("simulated") >= 0,
    sources: [...new Set(rows.map((r) => r.src).filter(Boolean))],
    fields,
    payloadHex: payloadCol >= 0 ? rows.map((r) => (r.cells[payloadCol] ?? "").replace(/:/g, "").trim()) : null,
    rowsRead: lines.length - 1,
    rowsKept: rows.length,
  };
}
