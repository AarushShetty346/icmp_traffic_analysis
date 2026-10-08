"""Plots and a Markdown summary for study results."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

NORMAL_COLOR = "#2a78c4"
CHANNEL_COLORS = ("#d9622b", "#8a5cc7")
DETECTOR_STYLES = {"fixed": "-o", "baseline (clean)": "--s", "baseline (matched)": ":^"}


def _style(ax, title, xlabel, ylabel):
    ax.set_title(title, fontsize=11)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.grid(alpha=0.3)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)


def plot_traces(results: dict, out: Path, condition: str = "clean") -> Path:
    traces = results["traces"][condition]
    fig, ax = plt.subplots(figsize=(9, 3.6))
    ax.plot(traces["normal"], color=NORMAL_COLOR, lw=1.4, label="normal ping")
    for color, name in zip(CHANNEL_COLORS, [k for k in traces if k != "normal"]):
        ax.plot(traces[name], color=color, lw=1.2, label=f"timing channel {name}")
    _style(ax, f"Inter-packet delay sequence ({condition})", "gap index", "Δt (s)")
    ax.legend(frameon=False, fontsize=8)
    path = out / f"ipd_sequence_{condition.replace(' ', '_').replace('%', 'pct')}.png"
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path


def plot_histogram(results: dict, out: Path, condition: str = "clean") -> Path:
    traces = results["traces"][condition]
    fig, ax = plt.subplots(figsize=(7, 3.6))
    ax.hist(traces["normal"], bins=40, range=(0.6, 1.4), color=NORMAL_COLOR, alpha=0.75, label="normal ping")
    for color, name in zip(CHANNEL_COLORS, [k for k in traces if k != "normal"]):
        ax.hist(traces[name], bins=40, range=(0.6, 1.4), color=color, alpha=0.55, label=f"channel {name}")
    _style(ax, f"Inter-packet delay distribution ({condition})", "Δt (s)", "count")
    ax.legend(frameon=False, fontsize=8)
    path = out / f"ipd_histogram_{condition.replace(' ', '_').replace('%', 'pct')}.png"
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path


def plot_scatter(results: dict, out: Path, condition: str = "clean") -> Path:
    pts = [p for p in results["scatter"] if p["condition"] == condition]
    labels = list(dict.fromkeys(p["label"] for p in pts))
    colors = dict(zip(labels, (NORMAL_COLOR,) + CHANNEL_COLORS))
    fig, ax = plt.subplots(figsize=(6, 4))
    for label in labels:
        sel = [p for p in pts if p["label"] == label]
        ax.scatter([p["mean"] for p in sel], [p["std"] for p in sel], s=22, color=colors[label], label=label, alpha=0.8)
    thr = results["baseline"]["upper"]["std"]
    ax.axhline(thr, color="#555", lw=1, ls="--", label=f"clean baseline p95 std = {thr:.4f}s")
    ax.axhline(results["config"]["fixed_rule"]["std_tol"], color="#999", lw=1, ls=":", label="fixed rule std tolerance")
    ax.set_yscale("log")
    _style(ax, f"Window features, {results['baseline']['window_size']}-request windows ({condition})", "mean Δt (s)", "std Δt (s, log)")
    ax.legend(frameon=False, fontsize=7)
    path = out / f"feature_scatter_{condition.replace(' ', '_').replace('%', 'pct')}.png"
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path


def plot_vs_jitter(results: dict, out: Path, channel: str, window: int = 32) -> Path:
    conds = [c for c in results["config"]["conditions"] if c["loss"] == 0]
    x = [c["net_jitter"] * 1000 for c in conds]
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.6), sharex=True)
    for det, style in DETECTOR_STYLES.items():
        rows = {
            r["condition"]: r
            for r in results["results"]
            if r["channel"] == channel and r["window"] == window and r["detector"] == det
        }
        axes[0].plot(x, [rows[c["name"]]["detection_rate"] for c in conds], style, label=det)
        axes[1].plot(x, [rows[c["name"]]["false_positive_rate"] for c in conds], style, label=det)
    _style(axes[0], f"Detection rate, channel {channel}", "added network jitter (ms)", "detection rate")
    _style(axes[1], "False-positive rate on normal traffic", "added network jitter (ms)", "false-positive rate")
    for ax in axes:
        ax.set_ylim(-0.05, 1.05)
    axes[1].legend(frameon=False, fontsize=8)
    slug = "subtle" if "subtle" in channel else "planned"
    path = out / f"rates_vs_jitter_{slug}_w{window}.png"
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path


def plot_vs_window(results: dict, out: Path, channel: str, condition: str) -> Path:
    sizes = results["config"]["window_sizes"]
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.6), sharex=True)
    for det, style in DETECTOR_STYLES.items():
        rows = {
            r["window"]: r
            for r in results["results"]
            if r["channel"] == channel and r["condition"] == condition and r["detector"] == det
        }
        axes[0].plot(sizes, [rows[w]["detection_rate"] for w in sizes], style, label=det)
        axes[1].plot(sizes, [rows[w]["false_positive_rate"] for w in sizes], style, label=det)
    _style(axes[0], f"Detection rate vs window ({channel}, {condition})", "window size (requests)", "detection rate")
    _style(axes[1], "False-positive rate vs window", "window size (requests)", "false-positive rate")
    for ax in axes:
        ax.set_ylim(-0.05, 1.05)
        ax.set_xticks(sizes)
    axes[1].legend(frameon=False, fontsize=8)
    slug = ("subtle" if "subtle" in channel else "planned") + "_" + condition.replace(" ", "_").replace("%", "pct")
    path = out / f"rates_vs_window_{slug}.png"
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path


def markdown_summary(results: dict, window: int = 32) -> str:
    cfg = results["config"]
    lines = [
        "# Detection results" + (" (SIMULATED traces)" if results.get("simulated") else ""),
        "",
    ]
    if results.get("simulated"):
        lines += [
            "> These numbers come from the offline simulator in `icmp_detector/simulate.py`,",
            "> not from the lab testbed. Replace them with real captures before quoting them as results.",
            "",
        ]
    lines += [
        f"- Runs per set: {cfg['runs_per_set']} x {cfg['requests_per_run']} Echo Requests",
        f"- Baseline: clean normal runs, p{cfg['percentile']:g} of window std "
        f"({results['baseline']['n_windows']} windows of {results['baseline']['window_size']} requests) "
        f"= {results['baseline']['upper']['std']:.4f} s",
        f"- Fixed rule: std > {cfg['fixed_rule']['std_tol']} s or |mean - {cfg['fixed_rule']['nominal']}| > "
        f"{cfg['fixed_rule']['mean_tol']} s",
        "",
    ]
    for channel in cfg["channels"]:
        lines += [
            f"## Channel {channel}, {window}-request windows",
            "",
            "| condition | detector | detection rate | false-positive rate | windows (ch/normal) |",
            "|---|---|---|---|---|",
        ]
        for r in results["results"]:
            if r["channel"] == channel and r["window"] == window:
                lines.append(
                    f"| {r['condition']} | {r['detector']} | {r['detection_rate']:.2f} | "
                    f"{r['false_positive_rate']:.2f} | {r['tp'] + r['fn']}/{r['fp'] + r['tn']} |"
                )
        lines += ["", "Decoding accuracy (bits recovered correctly):", ""]
        for cond, acc in results["decoding_accuracy"][channel].items():
            lines.append(f"- {cond}: {acc:.1%}")
        lines.append("")
    return "\n".join(lines)


def write_report(results: dict, out: str | Path) -> list[Path]:
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    channels = list(results["config"]["channels"])
    paths = [plot_traces(results, out), plot_histogram(results, out), plot_scatter(results, out)]
    if "jitter 100 ms" in results["traces"]:
        paths.append(plot_scatter(results, out, "jitter 100 ms"))
    for ch in channels:
        paths.append(plot_vs_jitter(results, out, ch))
    paths.append(plot_vs_window(results, out, channels[-1], "jitter 50 ms" if "jitter 50 ms" in results["traces"] else "clean"))
    md = out / "RESULTS.md"
    md.write_text(markdown_summary(results) + "\n## Figures\n\n" + "\n".join(f"![{p.stem}]({p.name})" for p in paths) + "\n")
    return [md, *paths]
