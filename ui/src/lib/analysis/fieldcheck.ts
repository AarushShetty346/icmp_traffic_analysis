// A browser version of fieldcheck.compare for dropped CSVs (same rules, simplified payload check).
import type { ParsedCapture } from "../data/csv";

const CONSTANT = ["ttl", "ip_flags", "tos", "ip_len", "icmp_code", "payload_len"] as const;

function pattern(values: (number | string)[]): string {
  const v = values.map(Number).filter(Number.isFinite);
  if (v.length < 2) return "too few packets";
  const d = v.slice(1).map((x, i) => x - v[i]);
  if (d.every((x) => x === 0)) return "constant";
  if (d.filter((x) => x === 1).length / d.length >= 0.9) return "increments by 1";
  if (d.every((x) => Math.abs(x) < 1024)) return "small steps";
  return "scattered";
}

export function compareFields(a: ParsedCapture, b: ParsedCapture) {
  const rows: { field: string; normal: string | null; covert: string | null; differs: boolean | null; note: string }[] = [];
  for (const f of CONSTANT) {
    const va = a.fields[f], vb = b.fields[f];
    if (!va || !vb) { rows.push({ field: f, normal: null, covert: null, differs: null, note: "not in both files; export it to check" }); continue; }
    const sa = [...new Set(va.map(String))].sort(), sb = [...new Set(vb.map(String))].sort();
    const differs = sa.join() !== sb.join();
    rows.push({ field: f, normal: sa.slice(0, 5).join(", "), covert: sb.slice(0, 5).join(", "), differs, note: differs ? "values differ" : "same values" });
  }
  const ida = a.fields.ip_id, idb = b.fields.ip_id;
  if (ida && idb) { const pa = pattern(ida), pb = pattern(idb); rows.push({ field: "ip_id", normal: pa, covert: pb, differs: pa !== pb, note: pa !== pb ? "counter behaves differently" : "same behaviour" }); }
  else rows.push({ field: "ip_id", normal: null, covert: null, differs: null, note: "not in both files; export it to check" });
  if (a.seq && b.seq) { const pa = pattern(a.seq), pb = pattern(b.seq); rows.push({ field: "seq", normal: pa, covert: pb, differs: pa !== pb, note: pa !== pb ? "counter behaves differently" : "same behaviour" }); }
  if (a.payloadHex && b.payloadHex) {
    const tail = (h: string[]) => new Set(h.map((x) => x.slice(32)));
    const ta = tail(a.payloadHex), tb = tail(b.payloadHex);
    const differs = [...ta].sort().join() !== [...tb].sort().join();
    rows.push({ field: "payload bytes (after first 16)", normal: `${ta.size} distinct`, covert: `${tb.size} distinct`, differs, note: differs ? "payload content differs" : "same payload content" });
  }
  return rows;
}
