# Lab testbed scripts

For the closed BCSE308P lab testbed only. Every script that sends traffic refuses
non-private destinations and needs `--i-am-on-the-lab-testbed`.

Topology assumed: **sender** (10.0.0.1) → [optional router] → **receiver** (10.0.0.2).
Run `pip install -r requirements.txt` on both hosts (the sender needs Scapy and root).

| Script | Host | What it does |
|---|---|---|
| `capture.sh IFACE SENDER OUT_PREFIX SECONDS [key=value…]` | receiver | tshark capture of the sender's Echo Requests, CSV export, manifest |
| `send_normal.sh DST COUNT OUT_PREFIX --i-am-on-the-lab-testbed` | sender | ordinary `ping -i 1 -s 56` |
| `send_covert.sh DST BITS GAP0 GAP1 OUT_PREFIX --i-am-on-the-lab-testbed` | sender (root) | Scapy timing-channel stream (`python -m icmp_detector generate`) + send manifest |
| `netem.sh IFACE PROFILE` | sender or router (root) | `tc netem` profile: clean, jitter10…jitter150, loss2/5/10, jitter50_loss5; `clear`, `show` |
| `load.sh server` / `load.sh start SERVER MBPS SECONDS --i-am-on-the-lab-testbed` / `load.sh stop` | both | iperf3 UDP background load |
| `export_csv.sh IN.pcapng OUT.csv` | any | the exact tshark export (timing + field-check fields) |
| `write_manifest.sh OUT.json KIND key=value…` | any | who / when / host / commit / parameters |

## One labelled run (example: jitter 20 ms, subtle 0.95/1.05 s channel)

```bash
# router or sender egress
sudo scripts/lab/netem.sh eth1 jitter20

# receiver: start first, capture a bit longer than the run (64 requests ≈ 64 s)
sudo scripts/lab/capture.sh eth1 10.0.0.1 captures/covert_j20_r01 75 label=covert netem=jitter20 channel=0.95/1.05 bits=010110...

# sender
sudo scripts/lab/send_covert.sh 10.0.0.2 010110... 0.95 1.05 captures/covert_j20_r01.sender --i-am-on-the-lab-testbed
```

Normal runs are the same with `send_normal.sh` and `label=normal`. Name files
`normal_*` / `covert_*`, keep each CSV next to its `.manifest.json`, then:

```bash
python -m icmp_detector fieldcheck --normal captures/normal_j20_r01.csv --covert captures/covert_j20_r01.csv
python -m icmp_detector export-ui --captures captures/ --src 10.0.0.1
```

Recommended counts for a usable baseline: at least 20 normal runs per condition,
256 requests each (≈ 4 min), so a 32-request window baseline has ≥ 160 windows.
