# SCRAP REPORT — legacy site removal (Gate 2)

Baseline for comparison: tag `legacy-site-v1` = `main` @ 6a4194d.

## What was removed

| Item | Action |
|---|---|
| `site/template.html` | deleted |
| `docs/index.html` (only file under `docs/`) | deleted |
| `scripts/build_site.py`, `scripts/site_check.js` | deleted |
| `results/benchmark/site.json` | deleted |
| `benchmark.markdown(..., site=...)` parameter and its "Website" section | removed (`icmp_detector/benchmark.py`) |
| `cmd_benchmark` reading `site.json` | removed (`icmp_detector/__main__.py`) |
| "Website" section of `results/benchmark/BENCHMARK.md` | gone after regeneration |
| README layout rows and quick-start commands for the site | removed |
| `package.json` / `node_modules` / Pages config for the old site | none were tracked |

Python detector logic is unchanged: `capture.py`, `features.py`, `detector.py`, `metrics.py`,
`simulate.py`, `experiment.py`, `report.py` have no diff. `__main__.py` lost only the `site.json`
read (plus one help string reworded because it matched old site copy); `benchmark.py` lost only
the `site` parameter and the Website section.

## How the grep checks were run

* Excluded paths: `.git`, and the three report files that must inventory the removed UI by name
  (`AUDIT.md`, `SCRAP_REPORT.md`, `QA_REPORT.md`). Later runs also exclude build outputs
  (`node_modules`, `dist`, `storybook-static`, Playwright output).
* Legacy copy: every heading, title, button/link label, paragraph and attribute text
  (`aria-label`, `placeholder`, `title`, `alt`) of `site/template.html` was extracted before
  deletion into a file outside the repo. Strings with fewer than three words (e.g. "Home",
  "Results", "Team") were dropped from the comparison because they are ordinary English words, not
  identifiable copy; 104 strings remained. Two hits were found on the first pass and reworded
  ("Headline findings…" and "0.75 / 1.25 s" in README, "Echo Requests per run" in a CLI help string).

## Verification output

```
$ git ls-files | grep -E "^(site|docs)/|build_site|site_check|site\.json"
(exit 1 — 1 means no matches)
term 'three.min': 0 files
term 'gsap': 0 files
term 'lenis': 0 files
term 'ScrollTrigger': 0 files
term 'data-nav': 0 files
term 'chapter-grid': 0 files
term 'secretForm': 0 files
term 'wireText': 0 files
term '#secret': 0 files
term 'verdicts': 0 files
term 'seqChart': 0 files
term 'drChart': 0 files
term 'studyTabs': 0 files
term 'studyTable': 0 files
term 'findings': 0 files
term 'stdtol': 0 files
term 'msgBits': 0 files
term 'Send it': 0 files
term 'Play page': 0 files
term 'build_site': 0 files
term 'site_check': 0 files
term 'site.json': 0 files
term 'docs/index.html': 0 files
--- legacy copy strings (104 strings, >=3 words each)
legacy string hits: 0
SCRAP CHECK: CLEAN

$ python -m unittest
Ran 14 tests in 0.948s

OK
$ python -m icmp_detector study --out results
wrote results/results.json
wrote results/RESULTS.md
wrote results/ipd_sequence_clean.png
wrote results/ipd_histogram_clean.png
wrote results/feature_scatter_clean.png
wrote results/feature_scatter_jitter_100_ms.png
wrote results/rates_vs_jitter_planned_w32.png
wrote results/rates_vs_jitter_subtle_w32.png
wrote results/rates_vs_window_subtle_jitter_50_ms.png
$ python -m icmp_detector benchmark
wrote results/benchmark/benchmark.json
wrote results/benchmark/BENCHMARK.md
wrote results/benchmark/benchmark_detection.png
wrote results/benchmark/benchmark_false_positives.png
wrote results/benchmark/benchmark_decoding.png
149,634 packets/s end to end, 132 us per window
$ grep -ci website results/benchmark/BENCHMARK.md
0
$ git diff --stat legacy-site-v1
 AUDIT.md                         |   98 +++
 README.md                        |    8 +-
 docs/index.html                  | 1483 --------------------------------------
 icmp_detector/__main__.py        |    6 +-
 icmp_detector/benchmark.py       |   19 +-
 results/benchmark/BENCHMARK.md   |   29 +-
 results/benchmark/benchmark.json |   18 +-
 results/benchmark/site.json      |  262 -------
 scripts/build_site.py            |   45 --
 scripts/site_check.js            |  174 -----
 site/template.html               | 1472 -------------------------------------
 11 files changed, 120 insertions(+), 3494 deletions(-)
```

Gate 2: **clean**. The new UI was started only after this report.
