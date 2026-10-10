// Downloads: CSV for any table, PNG for any chart, Markdown report, JSON bundle. All client-side.

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadText = (name: string, text: string, type = "text/plain") => downloadBlob(name, new Blob([text], { type: `${type};charset=utf-8` }));

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) => r.map((v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n") + "\n";
}

const STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "fill-opacity", "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline"];

/** Render an on-screen SVG chart to PNG, resolving CSS variables so the file looks like the screen. */
export async function svgToPng(svg: SVGSVGElement, name: string, footer: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll("*");
  const dst = clone.querySelectorAll("*");
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const target = dst[i] as SVGElement;
    for (const p of STYLE_PROPS) target.style.setProperty(p, cs.getPropertyValue(p));
  });
  const { width, height } = svg.getBoundingClientRect();
  const pad = 28;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("could not render chart")); img.src = url; });
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = (height + pad) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const bodyStyle = getComputedStyle(document.body);
  ctx.fillStyle = getComputedStyle(svg.closest("section") ?? document.body).backgroundColor || bodyStyle.backgroundColor;
  ctx.fillRect(0, 0, width, height + pad);
  ctx.drawImage(img, 0, 0, width, height);
  ctx.fillStyle = bodyStyle.color;
  ctx.font = "600 11px 'IBM Plex Mono', monospace";
  ctx.fillText(footer, 8, height + 18);
  URL.revokeObjectURL(url);
  await new Promise<void>((res) => canvas.toBlob((b) => { if (b) downloadBlob(name, b); res(); }, "image/png"));
}
