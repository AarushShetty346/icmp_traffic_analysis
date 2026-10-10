// Initial JavaScript cost: the entry script and every chunk index.html preloads, gzipped. Budget 300 KB.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const refs = [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="([^"]+\.js)"/g)].map((m) => m[1]);
let total = 0;
for (const ref of refs) {
  const gz = zlib.gzipSync(fs.readFileSync(path.join(dist, ref.replace(/^\.?\//, "")))).length;
  total += gz;
  console.log(`${(gz / 1024).toFixed(1).padStart(7)} KB  ${ref}`);
}
const budget = 300 * 1024;
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  initial JS, gzipped (budget ${budget / 1024} KB)`);
if (total > budget) { console.error("over budget"); process.exit(1); }
