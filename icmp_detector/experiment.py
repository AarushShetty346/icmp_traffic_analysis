"""Labelled evaluation of both detectors on sets of normal and channel flows."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .capture import Flow
from .detector import Baseline, BaselineDetector, FixedRuleDetector
from .features import windows
from .metrics import confusion, decode_bits, decoding_accuracy
from .simulate import CONDITIONS, Condition, SenderModel, channel_run, normal_run

CHANNELS = {
    "0.75/1.25 s": SenderModel(),
    "0.95/1.05 s (subtle)": SenderModel(gap0=0.95, gap1=1.05),
}


@dataclass
class LabelledSet:
    normal: list[Flow]
    channel: list[Flow]
    sent_bits: list[np.ndarray | None] = field(default_factory=list)


def build_baseline(normal_flows: list[Flow], window_size: int, percentile: float = 95.0) -> Baseline:
    wins = [w for f in normal_flows for w in windows(f.times, window_size, seq=f.seq)]
    return Baseline.fit(wins, percentile, window_size)


def evaluate(data: LabelledSet, window_size: int, detectors: dict) -> dict:
    """Classify every window of every flow and score each detector."""
    labelled = [(w, False) for f in data.normal for w in windows(f.times, window_size, seq=f.seq)]
    labelled += [(w, True) for f in data.channel for w in windows(f.times, window_size, seq=f.seq)]
    truth = [t for _, t in labelled]
    out = {"window_size": window_size, "n_normal_windows": truth.count(False), "n_channel_windows": truth.count(True)}
    out["detectors"] = {
        name: confusion(truth, [det.classify(w).suspicious for w, _ in labelled]) for name, det in detectors.items()
    }
    accs = [
        decoding_accuracy(list(bits), decode_bits(f.times, f.seq))
        for f, bits in zip(data.channel, data.sent_bits)
        if bits is not None
    ]
    out["decoding_accuracy"] = float(np.mean(accs)) if accs else None
    return out


def simulated_study(
    seed: int = 7,
    runs: int = 10,
    requests: int = 64,
    window_sizes: tuple[int, ...] = (8, 16, 32),
    conditions: tuple[Condition, ...] = CONDITIONS,
    percentile: float = 95.0,
    fixed: FixedRuleDetector | None = None,
    channels: dict[str, SenderModel] = CHANNELS,
) -> dict:
    """Run the Review-1 experiment plan on simulated traces.

    The baseline comes from ``runs`` clean normal runs (as planned). For each
    network condition we also fit a "matched" baseline from separate normal
    runs captured under that same condition, to show how much of any
    false-positive rise is caused by a stale baseline. Each channel model in
    ``channels`` (planned 0.75/1.25 s gaps, plus a subtler variant) is
    evaluated against the same normal test runs.
    """
    rng = np.random.default_rng(seed)
    fixed = fixed or FixedRuleDetector()
    clean_baseline_flows = [normal_run(requests, CONDITIONS[0], rng) for _ in range(runs)]

    rows, decoding, scatter, traces, scatter_sets = [], {}, [], {}, {}
    for cond in conditions:
        matched_flows = [normal_run(requests, cond, rng) for _ in range(runs)]
        test_normal = [normal_run(requests, cond, rng) for _ in range(runs)]
        traces[cond.name] = {"normal": np.diff(test_normal[0].times).round(5).tolist()}
        for ch_name, model in channels.items():
            test_channel, bits = [], []
            for _ in range(runs):
                flow, sent = channel_run(requests, cond, rng, model=model)
                test_channel.append(flow)
                bits.append(sent)
            data = LabelledSet(test_normal, test_channel, bits)
            traces[cond.name][ch_name] = np.diff(test_channel[0].times).round(5).tolist()
            for w in window_sizes:
                detectors = {
                    "fixed": fixed,
                    "baseline (clean)": BaselineDetector(build_baseline(clean_baseline_flows, w, percentile)),
                    "baseline (matched)": BaselineDetector(build_baseline(matched_flows, w, percentile)),
                }
                result = evaluate(data, w, detectors)
                decoding.setdefault(ch_name, {})[cond.name] = result["decoding_accuracy"]
                for name, m in result["detectors"].items():
                    rows.append({"channel": ch_name, "condition": cond.name, "window": w, "detector": name, **m})
            all_channel = scatter_sets.setdefault(cond.name, [("normal", test_normal)])
            all_channel.append((ch_name, test_channel))
        w = 32 if 32 in window_sizes else window_sizes[-1]
        for label, flows in scatter_sets[cond.name]:
            for f in flows:
                for ipd in windows(f.times, w, seq=f.seq):
                    scatter.append(
                        {
                            "condition": cond.name,
                            "label": label,
                            "mean": round(float(ipd.mean()), 5),
                            "std": round(float(ipd.std(ddof=1)), 5),
                        }
                    )

    ref_w = 32 if 32 in window_sizes else window_sizes[-1]
    baseline = build_baseline(clean_baseline_flows, ref_w, percentile)
    return {
        "simulated": True,
        "config": {
            "seed": seed,
            "runs_per_set": runs,
            "requests_per_run": requests,
            "window_sizes": list(window_sizes),
            "percentile": percentile,
            "fixed_rule": {"nominal": fixed.nominal, "mean_tol": fixed.mean_tol, "std_tol": fixed.std_tol},
            "conditions": [c.__dict__ for c in conditions],
            "channels": {name: m.__dict__ for name, m in channels.items()},
        },
        "baseline": {
            "window_size": ref_w,
            "n_windows": baseline.n_windows,
            "upper": baseline.upper,
            "lower": baseline.lower,
        },
        "results": rows,
        "decoding_accuracy": decoding,
        "scatter": scatter,
        "traces": traces,
    }
