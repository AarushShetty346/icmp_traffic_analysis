// Builds the brand and neutral 50-950 scales from one brand hue in OKLCH and checks WCAG contrast
// of the semantic text tokens. Run: node scripts/palette.mjs  (prints CSS custom properties + a report)
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklchToHex(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return "#" + [r, g, bl].map((x) => Math.round(clamp(fromLin(clamp(x))) * 255).toString(16).padStart(2, "0")).join("");
}
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((x) => toLin(x / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const Ls = [0.975, 0.945, 0.885, 0.81, 0.71, 0.6, 0.5, 0.42, 0.35, 0.28, 0.21];
const scale = (hue, chromaMax) => Object.fromEntries(steps.map((s, i) => {
  const L = Ls[i]; const C = chromaMax * Math.min(1, (1 - L) * 2.4) * Math.min(1, (L - 0.1) * 3.2);
  return [s, oklchToHex(L, Math.max(0.006, C), hue)];
}));
export const brand = scale(205, 0.11);   // deep teal: the one brand colour
export const neutral = scale(85, 0.012); // warm paper grey
export const sim = scale(70, 0.13);      // amber, reserved for SIMULATED
if (process.argv[1].endsWith("palette.mjs")) {
  for (const [name, sc] of Object.entries({ brand, neutral, sim })) for (const s of steps) console.log(`  --${name}-${s}: ${sc[s]};`);
  const checks = [
    ["light body ink on bg", neutral[950], neutral[50], 7], ["light secondary ink on bg", neutral[700], neutral[50], 4.5],
    ["light muted ink on surface", neutral[600], "#ffffff", 4.5], ["light accent on bg", brand[700], neutral[50], 4.5],
    ["light sim ink on sim bg", sim[800], sim[100], 4.5], ["light real ink on real bg", brand[800], brand[100], 4.5],
    ["dark body ink on bg", neutral[50], neutral[950], 7], ["dark secondary ink on bg", neutral[300], neutral[950], 4.5],
    ["dark muted ink on surface", neutral[400], neutral[900], 4.5], ["dark accent on bg", brand[300], neutral[950], 4.5],
    ["dark sim ink on sim bg", sim[200], sim[900], 4.5], ["dark real ink on real bg", brand[200], brand[900], 4.5],
    ["white on accent button", "#ffffff", brand[700], 4.5], ["dark: ink on accent button", neutral[950], brand[300], 4.5],
  ];
  let ok = true;
  for (const [n, a, b, need] of checks) { const c = contrast(a, b); ok &&= c >= need; console.log(`${c >= need ? "PASS" : "FAIL"} ${n}: ${c.toFixed(2)} (need ${need})`); }
  process.exit(ok ? 0 : 1);
}
