# Cadence

The analysis workbench for this project: a static React app that reads the JSON bundle exported by
`python -m icmp_detector export-ui` and tshark CSV files you drop in, and recomputes the detectors in the
browser. The guided case teaches the same methods step by step. Every number keeps its source label.

```bash
npm ci
npm run dev            # http://localhost:5173
npm run build          # static site in dist/ (relative base, works under any GitHub Pages path)
npm run preview        # serve dist/ on :4173
npm test               # unit tests, incl. parity with Python golden fixtures to 1e-9
npm run typecheck
npm run size           # initial JS budget: 300 KB gzipped
npm run storybook      # component states
npm run e2e            # Playwright: guided case, controls, axe, overflow, keyboard (needs npm run build)
```

If Playwright cannot download its browser, point it at a local Chromium: `CHROMIUM_PATH=/path/to/chrome npm run e2e`.
`RECORD=1 npm run e2e` also refreshes `../docs-ui/screens/` and `../docs-ui/keyboard-walkthrough.md`.

## Data

`public/data/bundle.json` is the 610-run simulated bundle used by the guided case. The narrower 250-run Review 3 study is preserved as `public/data/review3.bundle.json`. `bundle.schema.json` describes the data format. Regenerate either bundle with

```bash
python -m icmp_detector export-ui --out review3-export --plan review3         # simulated only, narrower Review 3 study
cp review3-export/bundle.json ui/public/data/review3.bundle.json             # preserve it beside the guided-case bundle
python -m icmp_detector export-ui --out ui/public/data                       # simulated only, wider stress grid used by the guided case
python -m icmp_detector export-ui --out ui/public/data --captures captures/   # plus real testbed CSVs
```

The bundle is validated with Zod (`src/lib/data/schema.ts`) before any view sees it.

## Layout

| Path | What |
|---|---|
| `src/lib/analysis/` | TypeScript port of features, detectors, ROC and decoding; `parity.test.ts` checks it against `tests/golden/` |
| `src/lib/data/` | Bundle schema, CSV parser (runs in `src/workers/csv.worker.ts`), data context |
| `src/views/` | Guided case, Runs, Signal, Detectors, Stress matrix, Decode, Guide, Evidence |
| `src/components/` | UI primitives (Radix-based) and SVG charts (d3-scale / d3-shape) |
| `src/content/evidence.ts` | Confirmed Review 3 objective checklist, references, and known limits |
| `e2e/controls.manifest.json` | Every interactive control, its action and expected effect |
| `scripts/palette.mjs` | Colour scales and contrast checks |

## Deploying to GitHub Pages

Set Settings → Pages → Build and deployment → Source to **GitHub Actions**. After that, every push to
`main` that touches `ui/` deploys the site (workflow "Deploy Cadence to GitHub Pages"; it can also be run by
hand from the Actions tab). The site is at `https://aarushshetty346.github.io/icmp_traffic_analysis/`.
The old Pages site served from `docs/` no longer exists.
