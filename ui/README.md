# Cadence

The analysis workbench for this project: a static React app that reads the JSON bundle exported by
`python -m icmp_detector export-ui` and tshark CSV files you drop in, and recomputes the detectors in the
browser. Every number is badged SIMULATED or REAL CAPTURE.

```bash
npm ci
npm run dev            # http://localhost:5173
npm run build          # static site in dist/ (relative base, works under any GitHub Pages path)
npm run preview        # serve dist/ on :4173
npm test               # unit tests, incl. parity with Python golden fixtures to 1e-9
npm run typecheck
npm run size           # initial JS budget: 300 KB gzipped
npm run storybook      # component states, light/dark toolbar
npm run e2e            # Playwright: controls manifest, axe, overflow, keyboard (needs npm run build)
```

If Playwright cannot download its browser, point it at a local Chromium: `CHROMIUM_PATH=/path/to/chrome npm run e2e`.
`RECORD=1 npm run e2e` also refreshes `../docs-ui/screens/` and `../docs-ui/keyboard-walkthrough.md`.

## Data

`public/data/bundle.json` and `bundle.schema.json` come from the Python exporter; regenerate them with

```bash
python -m icmp_detector export-ui --out ui/public/data                       # simulated only
python -m icmp_detector export-ui --out ui/public/data --captures captures/   # plus real testbed CSVs
```

The bundle is validated with Zod (`src/lib/data/schema.ts`) before any view sees it.

## Layout

| Path | What |
|---|---|
| `src/lib/analysis/` | TypeScript port of features, detectors, ROC and decoding; `parity.test.ts` checks it against `tests/golden/` |
| `src/lib/data/` | Bundle schema, CSV parser (runs in `src/workers/csv.worker.ts`), data context |
| `src/views/` | Runs, Signal, Detectors, Stress matrix, Decode, Evidence |
| `src/components/` | UI primitives (Radix-based) and SVG charts (d3-scale / d3-shape) |
| `src/content/evidence.ts` | Review 3 checklist text and known limits; add the Review 1 objective wording and references here |
| `e2e/controls.manifest.json` | Every interactive control, its action and expected effect |
| `scripts/palette.mjs` | Colour scales and contrast checks |

## Deploying to GitHub Pages

Set Settings → Pages → Source to **GitHub Actions**, then run the "Deploy Cadence to GitHub Pages"
workflow. The old Pages site served from `docs/` no longer exists.
