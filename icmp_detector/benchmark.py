"""Benchmarks: detector accuracy over a grid of channels and network conditions, and speed.

The accuracy sweep reuses ``simulated_study`` with a wider grid than the
Review-1 plan: four gap settings, from the planned 0.75/1.25 s down to a
0.98/1.02 s channel that hides inside ordinary scheduling noise, against
clean, jittered, lossy and combined network conditions. Like the study, it
runs on simulated traces and must be reported as simulated.

The speed benchmark times each stage of the pipeline on one long synthetic
capture, so the numbers say whether the detector keeps up with live traffic.
"""

from __future__ import annotations

import platform
import tempfile
import time
from pathlib import Path

import numpy as np

from .capture import load_flow
from .detector import BaselineDetector, FixedRuleDetector
from .experiment import build_baseline, simulated_study
from .features import windows
from .metrics import decode_bits
from .simulate import Condition, SenderModel, channel_run, normal_run

CHANNEL_GRID = {
    "0.75/1.25 s": SenderModel(),
    "0.90/1.10 s": SenderModel(gap0=0.90, gap1=1.10),
    "0.95/1.05 s": SenderModel(gap0=0.95, gap1=1.05),
    "0.98/1.02 s": SenderModel(gap0=0.98, gap1=1.02),
}

CONDITION_GRID = (
    Condition("clean"),
    Condition("jitter 10 ms", net_jitter=0.010),
    Condition("jitter 20 ms", net_jitter=0.020),
    Condition("jitter 50 ms", net_jitter=0.050),
    Condition("jitter 100 ms", net_jitter=0.100),
    Condition("jitter 150 ms", net_jitter=0.150),
    Condition("loss 2%", loss=0.02),
    Condition("loss 5%", loss=0.05),
    Condition("loss 10%", loss=0.10),
    Condition("jitter 50 ms + loss 5%", net_jitter=0.050, loss=0.05),
)


def accuracy_benchmark(seed: int = 11, runs: int = 30, requests: int = 64, window_sizes=(8, 16, 32)) -> dict:
    """Detection rate, false-positive rate and decoding accuracy over the whole grid."""
    r = simulated_study(
        seed=seed,
        runs=runs,
        requests=requests,
        window_sizes=tuple(window_sizes),
        conditions=CONDITION_GRID,
        channels=CHANNEL_GRID,
    )
    # the per-window scatter and example traces are only needed for the study plots
    return {k: v for k, v in r.items() if k not in ("scatter", "traces")}


def _best_of(fn, repeats: int) -> tuple[float, object]:
    best, out = float("inf"), None
    for _ in range(repeats):
        t0 = time.perf_counter()
        out = fn()
        best = min(best, time.perf_counter() - t0)
    return best, out


def speed_benchmark(seed: int = 3, packets: int = 100_000, window: int = 32, repeats: int = 3) -> dict:
    """Time each pipeline stage on one long capture of ``packets`` Echo Requests."""
    rng = np.random.default_rng(seed)
    cond = Condition("jitter 20 ms", net_jitter=0.020)
    normal = normal_run(packets, cond, rng)
    channel, _ = channel_run(packets, cond, rng)
    baseline = BaselineDetector(build_baseline([normal_run(640, cond, rng)], window))
    fixed = FixedRuleDetector()

    with tempfile.TemporaryDirectory() as d:
        csv = Path(d) / "capture.csv"
        rows = "\n".join(f"{t:.6f},10.0.0.1,10.0.0.2,0x0001,{int(s)}" for t, s in zip(channel.times, channel.seq))
        csv.write_text("frame.time_epoch,ip.src,ip.dst,icmp.ident,icmp.seq\n" + rows + "\n")
        t_load, _ = _best_of(lambda: load_flow(csv, src="10.0.0.1"), repeats)

    t_win, wins = _best_of(lambda: windows(channel.times, window, seq=channel.seq), repeats)
    t_base, flags = _best_of(lambda: [baseline.classify(w).suspicious for w in wins], repeats)
    t_fixed, _ = _best_of(lambda: [fixed.classify(w).suspicious for w in wins], repeats)
    t_dec, _ = _best_of(lambda: decode_bits(channel.times, channel.seq), repeats)
    total = t_load + t_win + t_base
    n_win = len(wins)
    stages = {
        "load tshark CSV": t_load,
        f"split into {window}-request windows": t_win,
        "features + baseline decision": t_base,
        "features + fixed-rule decision": t_fixed,
        "decode bits": t_dec,
    }
    return {
        "packets": packets,
        "window": window,
        "windows": n_win,
        "flagged": int(sum(flags)),
        "repeats": repeats,
        "stages_s": stages,
        "end_to_end_s": total,
        "packets_per_s": packets / total,
        "us_per_window": t_base / n_win * 1e6,
        # one ping per second means a 32-request window takes 31 s to fill
        "realtime_headroom": (window - 1) / (t_base / n_win),
        "machine": f"{platform.processor() or platform.machine()}, Python {platform.python_version()}",
    }


def _pct(x: float) -> str:
    return f"{x:.0%}"


def markdown(acc: dict, speed: dict, window: int = 32) -> str:
    cfg = acc["config"]
    rows = {(r["channel"], r["condition"], r["window"], r["detector"]): r for r in acc["results"]}
    dets = ("fixed", "baseline (clean)", "baseline (matched)")
    lines = [
        "# Benchmarks (SIMULATED traces)",
        "",
        "> The accuracy numbers come from the offline simulator (`icmp_detector/simulate.py`), not from the",
        "> lab testbed. Rerun `python -m icmp_detector benchmark` on real captures before quoting them as results.",
        "",
        f"- {cfg['runs_per_set']} runs x {cfg['requests_per_run']} Echo Requests for every normal and covert set, "
        f"seed {cfg['seed']}",
        f"- Fixed rule: std > {cfg['fixed_rule']['std_tol']} s or |mean - 1| > {cfg['fixed_rule']['mean_tol']} s. "
        f"Baselines: p{cfg['percentile']:g} of window std from clean normal runs, or from normal runs under the "
        "same conditions (matched).",
        "",
        "## 1. Who catches what",
        "",
        f"Detection rate (DR) on covert windows and false-positive rate (FPR) on normal windows, {window}-request "
        "windows. A detector is only useful when DR is high and FPR is low at the same time.",
        "",
        "| gaps | network | DR fixed | DR clean | DR matched | FPR fixed | FPR clean | FPR matched | bits decoded |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for ch in cfg["channels"]:
        for c in cfg["conditions"]:
            r = [rows[(ch, c["name"], window, d)] for d in dets]
            lines.append(
                f"| {ch} | {c['name']} | "
                + " | ".join(_pct(x["detection_rate"]) for x in r)
                + " | "
                + " | ".join(_pct(x["false_positive_rate"]) for x in r)
                + f" | {_pct(acc['decoding_accuracy'][ch][c['name']])} |"
            )
    lines += [
        "",
        "## 2. Window size",
        "",
        "Matched baseline, DR / FPR by window size. Bigger windows average out noise but take longer to fill "
        "(one request per second).",
        "",
        "| gaps | network | " + " | ".join(f"{w} requests" for w in cfg["window_sizes"]) + " |",
        "|---|---|" + "---|" * len(cfg["window_sizes"]),
    ]
    for ch in cfg["channels"]:
        for cname in ("clean", "jitter 50 ms"):
            cells = []
            for w in cfg["window_sizes"]:
                r = rows[(ch, cname, w, "baseline (matched)")]
                cells.append(f"{_pct(r['detection_rate'])} / {_pct(r['false_positive_rate'])}")
            lines.append(f"| {ch} | {cname} | " + " | ".join(cells) + " |")
    lines += [
        "",
        "## 3. Speed",
        "",
        f"One capture of {speed['packets']:,} Echo Requests ({speed['windows']:,} windows of {speed['window']}), "
        f"best of {speed['repeats']} runs on {speed['machine']}.",
        "",
        "| stage | time | per window |",
        "|---|---|---|",
    ]
    for name, t in speed["stages_s"].items():
        lines.append(f"| {name} | {t * 1000:.0f} ms | {t / speed['windows'] * 1e6:.0f} µs |")
    lines += [
        "",
        f"- End to end (load, window, baseline decision): **{speed['packets_per_s']:,.0f} packets/s**.",
        f"- A {speed['window']}-request window takes {speed['window'] - 1} s to fill at one ping per second and "
        f"{speed['us_per_window']:.0f} µs to judge, so one core keeps up with about "
        f"**{speed['realtime_headroom']:,.0f} flows at once**.",
        "",
    ]
    lines += ["## Figures", "", "![detection heatmap](benchmark_detection.png)", "",
              "![false positives](benchmark_false_positives.png)", "", "![decoding](benchmark_decoding.png)", ""]
    return "\n".join(lines)


def plots(acc: dict, out: Path, window: int = 32) -> list[Path]:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cfg = acc["config"]
    chans = list(cfg["channels"])
    conds = [c["name"] for c in cfg["conditions"]]
    rows = {(r["channel"], r["condition"], r["window"], r["detector"]): r for r in acc["results"]}
    paths = []

    def heat(ax, grid, title, cmap, ylabels):
        im = ax.imshow(grid, vmin=0, vmax=1, cmap=cmap, aspect="auto")
        ax.set_xticks(range(len(conds)), conds, rotation=35, ha="right", fontsize=8)
        ax.set_yticks(range(len(ylabels)), ylabels, fontsize=8)
        ax.set_title(title, fontsize=10)
        for i in range(grid.shape[0]):
            for j in range(grid.shape[1]):
                ax.text(j, i, f"{grid[i, j]:.0%}", ha="center", va="center", fontsize=7,
                        color="white" if grid[i, j] < 0.5 else "black")
        return im

    fig, axes = plt.subplots(1, 3, figsize=(16, 3.8), sharey=True)
    for ax, det in zip(axes, ("fixed", "baseline (clean)", "baseline (matched)")):
        g = np.array([[rows[(ch, c, window, det)]["detection_rate"] for c in conds] for ch in chans])
        im = heat(ax, g, f"Detection rate: {det}", "viridis", chans)
    fig.colorbar(im, ax=axes, shrink=0.8)
    p = out / "benchmark_detection.png"
    fig.savefig(p, dpi=140, bbox_inches="tight")
    plt.close(fig)
    paths.append(p)

    dets = ("fixed", "baseline (clean)", "baseline (matched)")
    g = np.array([[rows[(chans[0], c, window, d)]["false_positive_rate"] for c in conds] for d in dets])
    fig, ax = plt.subplots(figsize=(10, 2.6))
    heat(ax, g, f"False-positive rate on normal ping ({window}-request windows)", "magma", list(dets))
    p = out / "benchmark_false_positives.png"
    fig.savefig(p, dpi=140, bbox_inches="tight")
    plt.close(fig)
    paths.append(p)

    g = np.array([[acc["decoding_accuracy"][ch][c] for c in conds] for ch in chans])
    fig, ax = plt.subplots(figsize=(10, 2.8))
    heat(ax, g, "Bits the receiver decodes correctly", "cividis", chans)
    p = out / "benchmark_decoding.png"
    fig.savefig(p, dpi=140, bbox_inches="tight")
    plt.close(fig)
    paths.append(p)
    return paths
