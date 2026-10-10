# AUDIT — icmp_traffic_analysis (state at `main` 6a4194d, tagged `legacy-site-v1`)

Scope: every tracked file at commit 6a4194d. Line numbers refer to that commit.
Anything marked **unverified** could not be checked from the repository.

> **Review 1 report is not in the repository or the project files.** Objective numbers below
> come only from the rebuild brief (objectives 1, 2, 3 = real normal capture, real controlled
> generator, real receiver capture; objective 9 = jitter/load experiments). The wording of
> objectives 4–8 and 10, the module B definition, the timeline and the tools table are
> **unverified** and must be filled in from the Review 1 document.

## A. Implemented

| Capability | Where | Notes |
|---|---|---|
| tshark CSV loading, column aliases, `seq` "1/256" split | `icmp_detector/capture.py:25-61`, `:87-114` | `frame.time_epoch`/`time`/`timestamp` accepted |
| Optional Scapy pcap reader | `icmp_detector/capture.py:64-84` | Echo Requests only (type 8) |
| Flow filtering by src/dst/ident | `icmp_detector/capture.py:100-107` | |
| Inter-packet delays | `icmp_detector/features.py:15-17` | Δtᵢ = tᵢ − tᵢ₋₁ |
| Windowing with loss-aware gap skipping | `icmp_detector/features.py:20-46` | `step` exists in the function but is not exposed by the CLI |
| 10 window features | `icmp_detector/features.py:12`, `:56-73` | mean, var, std (ddof=1), cv, median, iqr, min, max, entropy (20 ms bins), off_nominal |
| Baseline: p95 upper / two-sided band | `icmp_detector/detector.py:22-35`, `:39-76` | "both" features use 2.5/97.5 tails |
| Baseline detector | `icmp_detector/detector.py:90-113` | default feature set is `("std",)` only |
| Fixed-rule detector | `icmp_detector/detector.py:116-137` | std > 0.1 s or \|mean−1\| > 0.1 s |
| Confusion metrics | `icmp_detector/metrics.py:8-25` | DR, FPR, accuracy; no precision/recall |
| Sequence-aware bit decoding | `icmp_detector/metrics.py:28-51` | fixed threshold 1.0 s |
| Simulator (no packets sent) | `icmp_detector/simulate.py` | half-normal network delay, Bernoulli loss |
| Simulated study (Review-1 plan) | `icmp_detector/experiment.py:51-136` | clean vs matched baseline, 2 channels, 6 conditions |
| 4×10 benchmark grid | `icmp_detector/benchmark.py:29-61` | 4 gap settings × 10 conditions, 30 runs |
| Speed benchmark | `icmp_detector/benchmark.py:73-114` | |
| CLI: study, benchmark, simulate, baseline, detect, evaluate, decode | `icmp_detector/__main__.py:153-226` | |
| Plots + RESULTS.md | `icmp_detector/report.py` | |
| Unit tests (14) | `tests/test_detector.py` | features, detectors, metrics, capture, study, benchmark |
| Dashboard site | `site/template.html` → `docs/index.html` via `scripts/build_site.py` | |
| Playwright site check (50 checks) | `scripts/site_check.js` | writes `results/benchmark/site.json` |

## B. Gaps against Review 1

Status: **V** = verified in code/results, **P** = partly true (detail given), **U** = unverified.

1. **V — No real data anywhere.** Every number in `results/RESULTS.md` and `results/benchmark/BENCHMARK.md` comes from `simulate.py` (both files say so: `RESULTS.md:1-4`, `BENCHMARK.md:1-4`). No capture files, no manifests. Objectives 1, 2, 3 are unmet in code and results. Biggest Review 3 risk; UI work does not fix it.
2. **V — No real sender.** No Scapy/ping timing generator exists; `simulate.py:1-8` states it only models arrival timestamps. Review 1 Module A is not implemented.
3. **V — No packet-field / payload consistency check.** Nothing compares TTL, id, payload, flags between normal and covert captures; the CSV export (`capture.py:7-9`) does not even carry those fields.
4. **V — No tc netem / iperf3 orchestration.** No shell scripts in the repo; README only says "capture under each `tc netem` / `iperf3` setting" (`README.md:70`). Objective 9 has no tooling.
5. **V — SciPy / distribution tests unused.** No `scipy` import anywhere; no KS, Mann-Whitney or ECDF comparison. `requirements.txt` lists numpy/pandas/matplotlib only.
6. **V — Only `std` is evaluated.** `DEFAULT_FEATURES = ("std",)` (`detector.py:35`); the other nine features are computed and stored in baselines but never compared head-to-head. No threshold sweep, ROC/AUC or precision/recall.
7. **V — Statistically weak baseline.** 10 runs × 64 requests → 2 non-overlapping 32-request windows per run → 20 baseline windows (`RESULTS.md:7`). p95 of 20 values is essentially the 2nd-largest value. Clean-baseline FPR on clean traffic is 25 % (clean baseline) / 15 % (matched) in `RESULTS.md:15-16`, far above the nominal 5 %. Windows inside one run are correlated; there are no confidence intervals, no multiple seeds, and the CLI has no overlapping-window option.
8. **V — Headline result is trivially separable.** Window std ≈ 0.25 s for 0.75/1.25 s vs ≈ 0.004 s for normal ping (`RESULTS.md:7`, baseline p95 = 0.0036 s). The informative regime is 0.95/1.05 and 0.98/1.02 under jitter (`BENCHMARK.md:48`: 0.98/1.02 at 50 ms jitter → 32 % DR with matched baseline, 0 % fixed rule).
9. **V — Simulator delay model.** `simulate.py:70` uses `0.001 + |N(0, σ)|` — a folded (half-normal) delay with mean shift σ·√(2/π) ≈ 0.80σ. The docstring (`simulate.py:15-17`) says "clipped at 0, like tc netem", which is not what the code does, and netem's default `delay D J` is a uniform/normal jitter around a non-zero base with optional correlation. Validity threat.
10. **V — Over-extrapolated speed claim.** "one core keeps up with about **239,520 flows at once**" (`BENCHMARK.md:84`, generated at `benchmark.py:186-189`) divides window fill time by per-window CPU time and ignores capture I/O, per-flow state, flow demultiplexing and memory.
11. **V — Fixed decode threshold.** `metrics.py:31` threshold = 1.0 s; no adaptive / clustering threshold; no clock-drift handling.
12. Small code issues:
    - **V** dead branch in `cmd_evaluate`: `__main__.py:117` computes `baseline.window_size if baseline else 32` before the `None` check on `:118-119`, so `else 32` is unreachable.
    - **P** `int(v, 0)` in `capture._normalise` (`capture.py:60`): it is only called for values starting with `0x`, so `"01"` does **not** raise. The real defect: decimal identifiers stay strings, so `"01"` never matches `--ident 1` and the flow is silently filtered to nothing (then "fewer than 2 Echo Requests"). `int("01", 0)` itself would raise, so a naive fix would make it worse.
    - **V** `report.plot_scatter` colour list (`report.py:13`, `:59`) covers 3 labels; any study with > 2 channels raises `KeyError` (e.g. calling it on the 4-channel benchmark grid).
    - **V** `site_check.js` hard-codes the repo URL (`site_check.js:127`) and CDN-file routing (`:21`).
13. **V — Project hygiene.** No `.github/workflows`, no `LICENSE`, no pinned dev requirements, no tests for the CLI, report or site build.

Additional findings:

14. **V** Both `icmp.seq` and `icmp.seq_le` map to `seq` (`capture.py:30-31`); a CSV exporting both gets duplicate `seq` columns and pandas returns a frame, breaking `to_numeric`.
15. **V** The fixed rule's mean test (`detector.py:135`) can never fire on a balanced 0/1 channel centred on 1 s, so in practice the fixed rule is a std rule only.
16. **V** `evaluate` decodes every channel at threshold 1.0 regardless of the channel's gap pair (`experiment.py:43`).
17. **V** No provenance on outputs beyond a `"simulated": true` flag in `results.json`; no seed list, commit hash or capture manifest.
18. **U** Whether lab machines can run Scapy as root, and which OS/kernel the testbed uses — not recorded anywhere.

## C. UI audit (this is the Phase 2 deletion list, not a design reference)

- Files: `site/template.html` (97,221 B, 1,472 lines), `docs/index.html` (119,824 B ≈ 117 KB, built output with inline study JSON), `scripts/build_site.py`, `scripts/site_check.js`, `results/benchmark/site.json`.
- Runtime dependencies from CDNs: three.js r128 (cdnjs), GSAP 3.12.5 + ScrollTrigger (cdnjs), Lenis 1.1.13 (jsdelivr). Page is unusable offline / without CDN.
- Product name: "Ping Gap Detector" (`template.html:1`, `:399`).
- Six pages (`.page` divs, `template.html:414-717`): `home`, `why`, `lab`, `play`, `results`, `team`, with top bar `[data-nav]` tabs, `.chapter-grid` cards, `.pager .prev/.next` buttons, arrow-key paging.
- Hero "secret message" demo: `#secretForm`, `#secret`, "Send it" button, `#wire`, `#wireBits`, `#wireText`, three.js `#scene`.
- Play page controls: gap presets `button[data-g0]` (.75/1.25, .90/1.10, .95/1.05, .98/1.02), `#jitter`, `#loss`, `#win`, `#stdtol` sliders/select, `#rerun`, `#msg` / `#msgBits`, outputs `#verdicts`, `#seqChart`, `#histChart`, `#stdChart`, `#decodeOut`, `#challenge`.
- Results page: `#studyTabs`, `#drChart`, `#fprChart`, `#findings details`, `#studyTable`, `#studyMeta`.
- All ids: arr background bench bench-h bg-h bitsOut c1 c2 c3 ch-h challenge challengeText claims con-h conclusions controls decodeOut drChart enc-h encLetter encStrip encoding find-h findings fprChart histChart home jitter jitterOut lab loss lossOut mCov mFlag mNorm msg msgBits pages pipe-h pipeline play rerun results scene secret secretForm seqChart stdChart stdtol stdtolOut study studyMeta studyTable studyTabs tb-h team team-h testbed top verdicts why win wire wireBits wireText.
- Classes (selection): nav, brand, brand-mark, nav-progress, page, hero, hero-copy, chapter-grid, chapters, pager, prev, next, btn, btn-primary, btn-ghost, secret, wire, wire-head, wire-read, bitstream, encode, testbed, topo, rail, findings, findings-grid, claims, verdicts, verdict-line, meter, plots, plot-title, people, person, mono-avatar, closing, conclude.
- `site_check.js` covers 50 checks: 6 nav tabs, logo, 5 chapter cards, 5 next + 5 previous, arrow keys (3), back/forward, hero CTA, hero send (button + Enter), 4 gap presets, 4 sliders/select, rerun, message box, results tabs, details toggle, external links, in-page links, 4 deep links, phone (2), script errors.
- README rows/commands for the site: `README.md:25-26` (layout table) and `:35`, `:37` (quick start).
- Benchmark coupling: `benchmark.py:121` (`site` parameter) and `:192-208` ("Website" section), `__main__.py:143-147` (reads `site.json`), `BENCHMARK.md:86-97`.
- No `package.json`, `node_modules` or GitHub Pages config file is tracked; Pages (if enabled) is configured in repo settings to serve `docs/` — **unverified**, settings are not visible from the repo.

## D. Next steps, ranked

| Pri | Item | Effort |
|---|---|---|
| P0 | Real normal captures on the testbed (≥ 30 runs, longer runs so the baseline has ≥ 100 windows) | 1 lab day |
| P0 | Real controlled generator (Scapy) + covert captures with manifests | 1 day code + 1 lab day |
| P0 | Lab scripts: capture, netem profiles, iperf3 load, tshark export, manifest | 0.5 day |
| P0 | Packet-field consistency check on real captures | 0.5 day |
| P0 | Lead the write-up with subtle channels under jitter; drop the flows-at-once claim | 1 h |
| P1 | ROC/AUC, precision/recall, per-feature head-to-head, bootstrap CIs over runs, multi-seed | 1 day |
| P1 | netem-style simulator delay model, labelled per result | 0.5 day |
| P1 | Adaptive decode threshold (2-means) | 2 h |
| P1 | KS / ECDF distance feature | 2 h |
| P1 | CI, LICENSE, dev requirements, CLI tests | 0.5 day |
| P2 | New analysis workbench UI driven by exported JSON | 3–5 days |
| P2 | Clock-drift handling in the decoder | 0.5 day |
