"""Labelled evaluation of both detectors on sets of normal and channel flows."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .capture import Flow
from .detector import Baseline, BaselineDetector, FixedRuleDetector
from .evaluation import detector_with_ci, run_windows, summarise_seeds
from .features import ks_distance, windows
from .metrics import confusion, consecutive_gaps, decode_bits, decoding_accuracy
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


def flow_gaps(flow: Flow) -> np.ndarray:
    """Gaps between consecutively numbered requests of one flow."""
    return consecutive_gaps(flow.times, flow.seq)


def build_baseline(
    normal_flows: list[Flow], window_size: int, percentile: float = 95.0, step: int | None = None
) -> Baseline:
    """Fit a baseline from normal runs.

    Thresholds for the ten window features are unchanged from the original
    method. The KS-distance threshold is fitted out of sample: each run's
    windows are compared with a reference pooled from the *other* runs, so the
    threshold is not biased low by comparing windows with themselves. With a
    single run the in-sample distances are used.
    """
    per_run = [windows(f.times, window_size, step, seq=f.seq) for f in normal_flows]
    wins = [w for ws in per_run for w in ws]
    gaps = [flow_gaps(f) for f in normal_flows]
    reference = np.concatenate(gaps) if gaps else np.array([])
    ks_values = None
    if len(normal_flows) > 1:
        ks_values = []
        for i, ws in enumerate(per_run):
            others = np.concatenate([g for j, g in enumerate(gaps) if j != i])
            ks_values += [ks_distance(w, others) for w in ws]
    return Baseline.fit(wins, percentile, window_size, reference, ks_values, step or 0)


def evaluate(
    data: LabelledSet,
    window_size: int,
    detectors: dict,
    step: int | None = None,
    n_boot: int = 0,
    seed: int = 0,
    decode_threshold: float | str = 1.0,
) -> dict:
    """Classify every window of every flow and score each detector.

    With ``n_boot > 0`` each detector also gets bootstrap intervals for its
    detection and false-positive rates, resampling whole runs.
    """
    normal = run_windows(data.normal, window_size, step)
    channel = run_windows(data.channel, window_size, step)
    labelled = [(w, False) for r in normal for w in r.windows] + [(w, True) for r in channel for w in r.windows]
    truth = [t for _, t in labelled]
    out = {
        "window_size": window_size,
        "step": step or window_size,
        "n_normal_windows": truth.count(False),
        "n_channel_windows": truth.count(True),
    }
    out["detectors"] = {}
    for name, det in detectors.items():
        result = confusion(truth, [det.classify(w).suspicious for w, _ in labelled])
        if n_boot:
            result["ci"] = detector_with_ci(normal, channel, lambda w, d=det: d.classify(w).suspicious, n_boot, seed)
        out["detectors"][name] = result
    accs = [
        decoding_accuracy(list(bits), decode_bits(f.times, f.seq, decode_threshold))
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
    step: int | None = None,
    delay_model: str = "folded",
    n_boot: int = 0,
) -> dict:
    """Run the Review-1 experiment plan on simulated traces.

    The baseline comes from ``runs`` clean normal runs (as planned). For each
    network condition we also fit a "matched" baseline from separate normal
    runs captured under that same condition, to show how much of any
    false-positive rise is caused by a stale baseline. Each channel model in
    ``channels`` (planned 0.75/1.25 s gaps, plus a subtler variant) is
    evaluated against the same normal test runs.

    ``delay_model`` picks the simulator's network delay model for every
    condition (``"folded"`` reproduces the original results); ``step`` makes
    windows overlap; ``n_boot > 0`` adds bootstrap intervals over runs.
    """
    rng = np.random.default_rng(seed)
    fixed = fixed or FixedRuleDetector()
    conditions = tuple(c.with_model(delay_model) for c in conditions)
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
                    "baseline (clean)": BaselineDetector(build_baseline(clean_baseline_flows, w, percentile, step)),
                    "baseline (matched)": BaselineDetector(build_baseline(matched_flows, w, percentile, step)),
                }
                result = evaluate(data, w, detectors, step, n_boot, seed)
                decoding.setdefault(ch_name, {})[cond.name] = result["decoding_accuracy"]
                for name, m in result["detectors"].items():
                    rows.append(
                        {
                            "channel": ch_name,
                            "condition": cond.name,
                            "delay_model": cond.delay_model,
                            "window": w,
                            "detector": name,
                            **m,
                        }
                    )
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
    baseline = build_baseline(clean_baseline_flows, ref_w, percentile, step)
    return {
        "simulated": True,
        "config": {
            "seed": seed,
            "delay_model": delay_model,
            "step": step,
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


def multi_seed_study(seeds: tuple[int, ...], **kwargs) -> dict:
    """Run ``simulated_study`` once per seed and summarise how much DR / FPR move between seeds."""
    if len(seeds) < 2:
        raise ValueError("give at least two seeds")
    per_seed = {s: simulated_study(seed=s, **kwargs) for s in seeds}
    first = per_seed[seeds[0]]
    return {
        "simulated": True,
        "seeds": list(seeds),
        "config": {k: v for k, v in first["config"].items() if k != "seed"},
        "summary": summarise_seeds({s: r["results"] for s, r in per_seed.items()}),
    }
