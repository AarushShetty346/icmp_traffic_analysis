# QA report: Phase 5 acceptance

Run on 2026-10-10 against the production build (`npm run build && npm run preview`) in the cloud container,
Chromium 141 (Playwright build 1194), Node 22. All commands are in the repository; CI repeats every check
except Lighthouse and the screenshots.

## Result

| Criterion (from the rebuild brief) | Result | Evidence |
|---|---|---|
| Playwright: 100 % of manifest controls pass at 390×844 and 1440×900, no console errors | **Pass** | 218 / 218 control tests (below) |
| A control in the DOM but not in the manifest fails the run | **Pass** | 10 coverage scans per viewport, all clean |
| axe-core: 0 critical / serious violations on every route | **Pass** | 24 / 24 (6 routes × light, dark × 2 viewports) |
| Lighthouse accessibility ≥ 95, best-practices ≥ 95 | **Pass** | 100 / 100 on every route |
| No horizontal scroll at 360, 390, 768, 1024, 1440, 1920 | **Pass** | 36 / 36 route × width checks |
| Keyboard-only walkthrough of every route | **Pass** | `docs-ui/keyboard-walkthrough.md` |
| Initial JS ≤ 300 KB gzipped, charts lazy-loaded | **Pass** | 143.3 KB |
| LCP ≤ 2.5 s on a throttled mobile profile | **Pass** | 1.7–2.3 s |
| Golden-fixture parity tests pass | **Pass** | 66 / 66 at 1e-9 |
| Phase 2 grep re-run on the final tree: zero legacy matches | **Pass** | below |
| Screenshots of each route in light and dark | **Done** | `docs-ui/screens/` (24 files: 6 routes × 2 themes × 390 / 1440) |
| README rewritten for the new layout | **Done** | `README.md`, `ui/README.md` |

## Commands and output

### Python

```text
$ python -m unittest
Ran 62 tests in 11.193s
OK
$ ruff check .
All checks passed!
```

### Unit and parity tests (`cd ui && npm test`)

```text
 Test Files  2 passed (2)
      Tests  70 passed (70)
```

`src/lib/analysis/parity.test.ts` (66 tests) loads `tests/golden/*.json`, written by
`python -m icmp_detector golden`, and asserts window features, KS distance, baseline thresholds (including
the leave-one-run-out KS threshold), both detectors' decisions, ROC points and AUC, 2-means threshold and
decoded bits equal to 1e-9. `src/lib/data/csv.test.ts` (4 tests) covers tshark CSV parsing.

### End-to-end (`cd ui && npm run e2e`)

```text
Running 248 tests using 4 workers
  2 skipped
  246 passed (2.0m)
```

- `e2e/controls.manifest.json` lists 84 controls (route, role, accessible name, action, expected effect).
  `e2e/controls.spec.ts` reads every control from the accessibility tree on each route (and with CSV files
  added, with a stress cell selected, in manual decode mode, and with the command palette open) and fails
  on any control that matches no manifest entry. It then performs each entry's action and checks its
  effect: URL state, dialog open and closed by Escape, download, file picker, print, theme, value or text
  change. Entries that apply to every instance (all "What is …?" explanations, every CSV and PNG export)
  are exercised on every instance on every route. 109 tests per viewport, 218 in all, every one also
  asserts no console errors.
- `e2e/quality.spec.ts`: axe (WCAG 2.0/2.1/2.2 A and AA rules) on all six routes in light and dark at
  both viewports; overflow at six widths; the keyboard walkthrough. The 2 skipped tests are the
  overflow and keyboard tests in the mobile project, which set their own viewport and run once.

### Lighthouse 12.8.2 (mobile, simulated throttling: 150 ms RTT, 1.6 Mbps, 4× CPU)

| Route | Accessibility | Best practices | Performance | LCP | TBT | CLS |
|---|---|---|---|---|---|---|
| runs | 100 | 100 | 95 | 2.2 s | 130 ms | 0.041 |
| signal | 100 | 100 | 94 | 2.3 s | 150 ms | 0 |
| detectors | 100 | 100 | 91 | 2.3 s | 250 ms | 0 |
| stress | 100 | 100 | 92 | 2.3 s | 220 ms | 0 |
| decode | 100 | 100 | 91 | 2.3 s | 250 ms | 0 |
| evidence | 100 | 100 | 98 | 1.7 s | 120 ms | 0.055 |

```bash
CHROME_PATH=<chromium> npx lighthouse "http://localhost:4173/#/<route>" \
  --only-categories=accessibility,best-practices,performance --chrome-flags="--headless=new"
```

The first measurement put Runs and Evidence at 4.0 s LCP: their main text waited for the 2.4 MB data bundle
(312 KB gzipped). Fixed by rendering those two views before the data arrives, bundling them eagerly, and
starting the bundle download after the first paint. LCP is sensitive to that ordering, so it was measured
three times per changed route.

### Bundle size (`npm run size`)

```text
  143.3 KB  ./assets/index-CE77V-f0.js
  143.3 KB  initial JS, gzipped (budget 300 KB)
```

The Signal, Detectors, Stress matrix and Decode views and the d3 modules load on first visit (5–10 KB
each, gzipped).

### Phase 2 grep, final tree

Same script and string list as `SCRAP_REPORT.md`, excluding `.git`, `node_modules`, build outputs and the
three reports that name the removed site.

```text
$ git ls-files | grep -E "^(site|docs)/|build_site|site_check|site\.json"
(exit 1 — 1 means no matches)
term 'three.min': 0 files      term 'gsap': 0 files        term 'lenis': 0 files
term 'ScrollTrigger': 0 files  term 'data-nav': 0 files    term 'chapter-grid': 0 files
term 'secretForm': 0 files     term 'wireText': 0 files    term '#secret': 0 files
term 'verdicts': 0 files       term 'seqChart': 0 files    term 'drChart': 0 files
term 'studyTabs': 0 files      term 'studyTable': 0 files  term 'findings': 0 files
term 'stdtol': 0 files         term 'msgBits': 0 files     term 'Send it': 0 files
term 'Play page': 0 files      term 'build_site': 0 files  term 'site_check': 0 files
term 'site.json': 0 files      term 'docs/index.html': 0 files
--- legacy copy strings (104 strings, >=3 words each)
legacy string hits: 0
SCRAP CHECK: CLEAN
```

The first re-run found two new matches in UI code: the identifier `stdTol` and the component name
`VerdictStrip` (case-insensitive substrings of the banned terms). Both were renamed (`stdLimit`,
`DecisionStrip`) and the check re-run clean.

## Not covered here

- **Real captures.** Every number in the shipped bundle is simulated. The upload path is tested with
  three small simulated CSV fixtures (`ui/e2e/fixtures/`, written by `python -m icmp_detector simulate`
  and labelled simulated by the app).
- **Browsers other than Chromium.** Firefox and WebKit were not run.
- **Lighthouse is not in CI**; the numbers above are from one container and vary run to run.
- **Screen readers.** Checked through the accessibility tree and axe only; no NVDA / VoiceOver session.
