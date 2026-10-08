# Detection of ICMP-Based Covert Timing Channels

BCSE308P Computer Networks lab project (VIT Vellore, Fall 2026–27) by Harsh Jha, Anuj Deshpande and Aarush Shetty.

A covert timing channel hides bits in the gaps between packets. Here the test channel sends ICMP Echo Requests with a short gap (≈0.75 s) for a 0 bit and a long gap (≈1.25 s) for a 1 bit, around the usual 1 s ping interval. This repo holds the detection side: it reads receiver-side captures, computes inter-packet delays (Δtᵢ = tᵢ − tᵢ₋₁), splits them into fixed windows, extracts statistical features, and compares two detectors:

- **Fixed rule**: suspicious if the window's std of Δt exceeds a preset tolerance (0.1 s) or its mean drifts more than 0.1 s from the nominal interval.
- **Baseline rule**: suspicious if the window's std exceeds the 95th percentile measured on labelled normal traffic.

It reports detection rate, false-positive rate and decoding accuracy.

## Layout

| Path | What it is |
|---|---|
| `icmp_detector/capture.py` | Load tshark CSV exports or pcap files, filter one Echo Request flow |
| `icmp_detector/features.py` | Inter-packet delays, observation windows, window features |
| `icmp_detector/detector.py` | Baseline construction, baseline detector, fixed-rule detector |
| `icmp_detector/metrics.py` | Detection rate / FPR, bit decoding and decoding accuracy |
| `icmp_detector/simulate.py` | Offline model of receiver timestamps (sends no packets) |
| `icmp_detector/experiment.py` | Labelled evaluation and the simulated study |
| `icmp_detector/report.py` | Plots and `RESULTS.md` |
| `icmp_detector/benchmark.py` | Accuracy over 4 gap settings x 10 network conditions, and pipeline speed |
| `results/` | Output of the simulated study; `results/benchmark/BENCHMARK.md` holds the benchmark |
| `scripts/site_check.js` | Clicks every button on the site with Playwright and times page load |
| `docs/index.html` | Interactive dashboard (GitHub Pages ready), built from `site/template.html` |
| `tests/` | Unit tests |

## Quick start

```bash
pip install -r requirements.txt
python -m unittest                                  # run the tests
python -m icmp_detector study --out results         # simulated study + plots
python scripts/build_site.py                        # refresh docs/index.html
python -m icmp_detector benchmark                   # accuracy grid + speed -> results/benchmark/
node scripts/site_check.js docs/index.html node_modules results/benchmark/site.json  # site buttons + load time
```

## Using lab captures

Export Echo Request timestamps from each capture with tshark (run on the receiver):

```bash
tshark -r normal1.pcap -Y "icmp.type == 8" -T fields \
  -e frame.time_epoch -e ip.src -e ip.dst -e icmp.ident -e icmp.seq \
  -E header=y -E separator=, > normal1.csv
```

Then:

```bash
# 1. baseline from normal runs only (e.g. 10 runs x 64 requests)
python -m icmp_detector baseline captures/normal_*.csv --window 32 --src 10.0.0.1 --out baseline.json

# 2. classify each window of one capture
python -m icmp_detector detect captures/test.csv --baseline baseline.json --src 10.0.0.1

# 3. score both detectors on labelled test runs (kept separate from the baseline runs)
python -m icmp_detector evaluate --baseline baseline.json \
  --normal captures/test_normal_*.csv --channel captures/test_channel_*.csv \
  --bits 0101011001001001... --src 10.0.0.1

# 4. decode one channel capture
python -m icmp_detector decode captures/test_channel_1.csv --bits 0101011001001001...
```

`--src`, `--dst` and `--ident` filter the flow. Pcap files work directly if `scapy` is installed. When ICMP sequence numbers are present, gaps across a lost request are skipped so a lost packet does not look like a deliberate long gap, and decoding places each bit by sequence number.

For the jitter/load experiments, capture under each `tc netem` / `iperf3` setting, then run steps 1–3 with a baseline from clean runs and again with a baseline from normal runs under the same setting.

## Simulated results

`results/RESULTS.md` has the current numbers and plots. **They come from `simulate.py`, not the lab testbed**; use them to check the pipeline and to know which effects to look for, then replace them with real captures. Headline findings from the simulation:

- The planned 0.75 / 1.25 s channel is caught in every window by both detectors (window std ≈ 0.25 s vs a few ms for normal ping).
- A baseline built on a clean LAN raises false alarms on all normal windows once ≈20 ms of jitter is added; a baseline built under the same conditions keeps FPR ≤ 15 %.
- The fixed 0.1 s rule is fine up to ≈50 ms of jitter and fails at 150 ms.
- A subtler 0.95 / 1.05 s channel evades the fixed rule entirely and becomes indistinguishable from normal traffic at ≈100 ms of jitter.

The work is limited to an authorised closed lab testbed and is intended for defensive analysis.
