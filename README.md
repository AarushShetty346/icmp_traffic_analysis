# Detection of ICMP-Based Covert Timing Channels Using Network Traffic Analysis

BCSE308P Computer Networks lab project (VIT Vellore, Fall 2026–27) by Harsh Jha, Anuj Deshpande and Aarush Shetty.
Defensive analysis on an authorised, closed lab testbed only.

A covert timing channel hides bits in the gaps between packets: here a sender spaces ICMP Echo Requests by
`gap0` for a 0 bit and `gap1` for a 1 bit around the usual 1 s ping interval. This repository holds

- **the detector** (`icmp_detector/`): reads receiver-side captures, computes inter-packet delays, cuts them
  into windows, extracts 11 features and compares a fixed-rule detector with a baseline detector learned from
  normal traffic;
- **the lab tooling**: a Scapy sender (`generate`), tshark / tc netem / iperf3 scripts (`scripts/lab/`) and a
  packet-field check (`fieldcheck`);
- **Cadence**, an analysis workbench (`ui/`) that reads an exported JSON bundle or your own tshark CSVs.

## What is real and what is simulated

| Output | Source |
|---|---|
| `results/RESULTS.md`, `results/*.png` | **SIMULATED** — `simulate.py`, original "folded" delay model, seed 7 |
| `results/netem/` | **SIMULATED** — netem-style delay model, seed 7, plus a 5-seed spread and bootstrap intervals |
| `results/benchmark/` | **SIMULATED** — 4 gap settings × 10 network conditions; the speed table is a CPU measurement |
| `ui/public/data/bundle.json` | **SIMULATED** unless exported with `--captures`; every run, cell and curve is labelled |
| Real testbed captures | **None yet.** Objectives 1–3 (real normal capture, real generator, real receiver capture) are still open |

Never quote a simulated number as a testbed result. The workbench shows a SIMULATED / REAL CAPTURE badge on
every number for the same reason.

What the simulation suggests (to be checked on the testbed):

- The informative cases are the subtle channels. A 0.95/1.05 s channel slips past the fixed 0.1 s rule
  entirely; a baseline built under the same network conditions catches it at 50 ms of jitter but not at 100 ms
  (`results/netem/RESULTS.md`), and 0.98/1.02 s is hard to catch even at 50 ms (`results/benchmark/BENCHMARK.md`).
- A baseline learned on a clean LAN raises false alarms on every normal window once ≈20 ms of jitter is added.
- The planned 0.75/1.25 s channel is trivially separable (window std ≈ 0.25 s against a few ms for ping).
- With only 20 baseline windows the p95 threshold is noisy: clean-traffic FPR is 15–25 %, not 5 %, and moves
  between seeds (see the seed-spread table in `results/netem/RESULTS.md`).

## Layout

| Path | What it is |
|---|---|
| `icmp_detector/capture.py` | Load tshark CSV exports or pcap files, filter one Echo Request flow |
| `icmp_detector/features.py` | Inter-packet delays, windows (optional overlap), 10 window features, KS distance / ECDF |
| `icmp_detector/detector.py` | Baseline fit, baseline detector (any feature incl. `ks`), fixed-rule detector |
| `icmp_detector/metrics.py` | DR / FPR / precision / recall, bit decoding with fixed or 2-means threshold |
| `icmp_detector/evaluation.py` | ROC / AUC, precision-recall, bootstrap intervals over runs, feature head-to-head, seed summaries |
| `icmp_detector/simulate.py` | Offline model of receiver timestamps; `folded` and `netem` delay models (sends nothing) |
| `icmp_detector/experiment.py` | Labelled evaluation, simulated study, multi-seed study |
| `icmp_detector/benchmark.py` | Accuracy over 4 gap settings × 10 conditions, and pipeline speed |
| `icmp_detector/generator.py` | Real Scapy sender for the lab (guarded: private destination, explicit flag, root) |
| `icmp_detector/fieldcheck.py` | TTL / IP id / flags / payload comparison between normal and covert captures |
| `icmp_detector/export.py`, `schema/` | Versioned JSON bundle for the workbench and its JSON Schema |
| `icmp_detector/golden.py` | Parity fixtures (`tests/golden/`) the TypeScript port must match to 1e-9 |
| `scripts/lab/` | Testbed scripts: capture, senders, netem profiles, iperf3 load, tshark export, manifests |
| `ui/` | Cadence workbench (Vite + React + TypeScript), see `ui/README.md` |
| `docs-ui/` | Workbench design brief, decisions, screenshots |
| `AUDIT.md`, `SCRAP_REPORT.md`, `QA_REPORT.md` | Rebuild audit, legacy-site removal evidence, acceptance evidence |

## Quick start

```bash
pip install -r requirements.txt            # requirements-dev.txt pins exact versions + ruff
python -m unittest                         # Python tests
python -m icmp_detector study --out results                                   # simulated study (folded model)
python -m icmp_detector study --out results/netem --delay-model netem \
    --seeds 7 8 9 10 11 --bootstrap 500                                       # netem model, CIs, seed spread
python -m icmp_detector benchmark                                             # stress grid + speed
python -m icmp_detector export-ui --out ui/public/data                        # workbench data (validated)
python -m icmp_detector golden --out tests/golden                             # parity fixtures
```

Workbench: `cd ui && npm ci && npm run dev` (details in `ui/README.md`). To publish it, set the repository's
Pages source to GitHub Actions and run the "Deploy Cadence to GitHub Pages" workflow.

The workbench views: **Runs** (add tshark CSVs, label them, packet-field comparison), **Signal** (gap
timeline, histogram and ECDF), **Detectors** (fixed rule against the baseline with live settings, ROC/PR,
feature comparison), **Stress matrix** (gap setting × network condition, with run-level intervals and the
seed spread), **Decode** (sent against decoded bits, fixed or adaptive threshold) and **Evidence** (Review 3
checklist, limits, exports). Acceptance evidence is in `QA_REPORT.md`.

## Lab workflow (real data)

Full runbook: `scripts/lab/README.md`. In short, on the testbed (sender 10.0.0.1, receiver 10.0.0.2):

```bash
sudo scripts/lab/netem.sh eth1 jitter20                                              # sender/router egress
sudo scripts/lab/capture.sh eth1 10.0.0.1 captures/normal_j20_r01 270 label=normal netem=jitter20   # receiver
scripts/lab/send_normal.sh 10.0.0.2 256 captures/normal_j20_r01.sender --i-am-on-the-lab-testbed    # sender
sudo scripts/lab/send_covert.sh 10.0.0.2 0101... 0.95 1.05 captures/covert_j20_r01.sender --i-am-on-the-lab-testbed
```

The CSV export used everywhere (the first five fields are what the detector needs):

```bash
tshark -r capture.pcapng -Y "icmp.type == 8" -T fields \
  -e frame.time_epoch -e ip.src -e ip.dst -e icmp.ident -e icmp.seq \
  -e ip.ttl -e ip.id -e ip.flags -e ip.dsfield -e ip.len -e icmp.code -e data.len -e data.data \
  -E header=y -E separator=, > capture.csv
```

Then:

```bash
# 1. baseline from normal runs only (optionally overlapping windows with --step)
python -m icmp_detector baseline captures/normal_*.csv --window 32 --src 10.0.0.1 --out baseline.json

# 2. classify each window of one capture (any features, e.g. std and the KS distance)
python -m icmp_detector detect captures/test.csv --baseline baseline.json --features std ks --src 10.0.0.1

# 3. score both detectors on labelled runs kept out of the baseline, with run-level bootstrap intervals
python -m icmp_detector evaluate --baseline baseline.json \
  --normal captures/test_normal_*.csv --channel captures/test_covert_*.csv \
  --bits 0101... --bootstrap 1000 --compare-features --src 10.0.0.1

# 4. decode one channel capture (fixed 1.0 s threshold or adaptive 2-means)
python -m icmp_detector decode captures/test_covert_1.csv --bits 0101... --threshold auto

# 5. document non-timing differences between the senders
python -m icmp_detector fieldcheck --normal captures/normal_j20_r01.csv --covert captures/covert_j20_r01.csv

# 6. put real runs into the workbench (they are badged REAL CAPTURE)
python -m icmp_detector export-ui --out ui/public/data --captures captures/ --src 10.0.0.1
```

`--src`, `--dst` and `--ident` filter the flow (identifiers may be written `0x0001`, `1` or `01`). When ICMP
sequence numbers are present, gaps across a lost request are skipped, and decoding places each bit by
sequence number.

## Known limits

See `AUDIT.md` section B. The main validity threats: no real captures yet; a small, correlated baseline
(20 windows); the simulated delay models are approximations of netem, not measurements; the decoder does
not model clock drift.

## Licence

MIT, see `LICENSE`.
