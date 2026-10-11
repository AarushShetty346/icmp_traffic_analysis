"""Threshold sweeps, ROC / precision-recall, bootstrap intervals and feature comparisons.

These sit on top of the window features and the baseline. None of them change
how the baseline or the two detectors are defined; they measure how well a
feature separates normal and covert windows at every possible threshold, and
how much the detection and false-positive rates would move if the runs had
come out differently.

Bootstrap intervals resample whole runs, not windows: windows cut from the
same run share the same sender and network state, so treating them as
independent would make the intervals too narrow.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from .capture import Flow
from .detector import Baseline, BaselineDetector
from .features import ALL_FEATURES, windows


@dataclass
class RunWindows:
    """Windows of one run, kept together so the bootstrap can resample runs."""

    label: str
    windows: list[np.ndarray]


def run_windows(flows: list[Flow], window: int, step: int | None = None) -> list[RunWindows]:
    return [RunWindows(f.label, windows(f.times, window, step, seq=f.seq)) for f in flows]


def roc_curve(normal_scores: np.ndarray, channel_scores: np.ndarray) -> list[dict[str, float]]:
    """ROC and precision-recall points for "suspicious when score >= threshold".

    Returns one point per distinct score, from the strictest threshold (+inf,
    nothing flagged) down to the loosest (everything flagged). Each point holds
    ``threshold``, ``fpr``, ``tpr`` (= recall = detection rate) and
    ``precision`` (NaN when nothing is flagged).
    """
    neg = np.sort(np.asarray(normal_scores, dtype=float))
    pos = np.sort(np.asarray(channel_scores, dtype=float))
    if len(neg) == 0 or len(pos) == 0:
        raise ValueError("ROC needs at least one normal and one channel score")
    thresholds = np.unique(np.concatenate([neg, pos]))[::-1]
    points = [{"threshold": float("inf"), "fpr": 0.0, "tpr": 0.0, "precision": float("nan")}]
    for t in thresholds:
        tp = len(pos) - np.searchsorted(pos, t, side="left")
        fp = len(neg) - np.searchsorted(neg, t, side="left")
        points.append(
            {
                "threshold": float(t),
                "fpr": fp / len(neg),
                "tpr": tp / len(pos),
                "precision": tp / (tp + fp) if tp + fp else float("nan"),
            }
        )
    return points


def auc(points: list[dict[str, float]]) -> float:
    """Area under the ROC curve (trapezoid rule over ``roc_curve`` points)."""
    fpr = np.array([p["fpr"] for p in points])
    tpr = np.array([p["tpr"] for p in points])
    return float(np.sum(np.diff(fpr) * (tpr[1:] + tpr[:-1]) / 2.0))


def rates_at(normal_scores: np.ndarray, channel_scores: np.ndarray, threshold: float) -> dict[str, float]:
    """Detection rate / FPR / precision for "suspicious when score > threshold" (the baseline's rule)."""
    neg = np.asarray(normal_scores, dtype=float)
    pos = np.asarray(channel_scores, dtype=float)
    tp, fp = int(np.sum(pos > threshold)), int(np.sum(neg > threshold))
    return {
        "threshold": float(threshold),
        "tpr": tp / len(pos) if len(pos) else float("nan"),
        "fpr": fp / len(neg) if len(neg) else float("nan"),
        "precision": tp / (tp + fp) if tp + fp else float("nan"),
    }


def feature_scores(baseline: Baseline, runs: list[RunWindows], feature: str) -> np.ndarray:
    det = BaselineDetector(baseline, (feature,))
    return np.array([baseline.score(feature, det.features_of(w)[feature]) for r in runs for w in r.windows])


def bootstrap_rate(
    runs: list[RunWindows],
    flag: Callable[[np.ndarray], bool],
    n_boot: int = 1000,
    seed: int = 0,
    level: float = 0.95,
) -> dict[str, float]:
    """Fraction of flagged windows with a percentile bootstrap interval over runs."""
    flagged = np.array([sum(bool(flag(w)) for w in r.windows) for r in runs], dtype=float)
    counts = np.array([len(r.windows) for r in runs], dtype=float)
    if counts.sum() == 0:
        return {"estimate": float("nan"), "lo": float("nan"), "hi": float("nan"), "runs": len(runs)}
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(runs), size=(n_boot, len(runs)))
    tot = counts[idx].sum(axis=1)
    rates = np.divide(flagged[idx].sum(axis=1), tot, out=np.full(n_boot, np.nan), where=tot > 0)
    tail = (1.0 - level) / 2.0 * 100.0
    lo, hi = np.nanpercentile(rates, [tail, 100.0 - tail])
    return {"estimate": float(flagged.sum() / counts.sum()), "lo": float(lo), "hi": float(hi), "runs": len(runs)}


def detector_with_ci(
    normal: list[RunWindows],
    channel: list[RunWindows],
    flag: Callable[[np.ndarray], bool],
    n_boot: int = 1000,
    seed: int = 0,
) -> dict[str, dict[str, float]]:
    return {
        "detection_rate": bootstrap_rate(channel, flag, n_boot, seed),
        "false_positive_rate": bootstrap_rate(normal, flag, n_boot, seed + 1),
    }


def feature_comparison(
    baseline: Baseline,
    normal: list[RunWindows],
    channel: list[RunWindows],
    features: tuple[str, ...] = ALL_FEATURES,
    n_boot: int = 500,
    seed: int = 0,
) -> list[dict]:
    """Head-to-head of every feature: AUC, and DR / FPR (with CIs) at the baseline threshold."""
    out = []
    for name in features:
        if name not in baseline.upper:
            continue
        det = BaselineDetector(baseline, (name,))
        neg = feature_scores(baseline, normal, name)
        pos = feature_scores(baseline, channel, name)
        points = roc_curve(neg, pos)
        ci = detector_with_ci(normal, channel, lambda w, d=det: d.classify(w).suspicious, n_boot, seed)
        out.append(
            {
                "feature": name,
                "auc": auc(points),
                "operating_point": rates_at(neg, pos, baseline.score_threshold(name)),
                **ci,
            }
        )
    return out


def summarise_seeds(rows_by_seed: dict[int, list[dict]], keys=("channel", "condition", "window", "detector")) -> list[dict]:
    """Mean, spread and a normal-approximation 95% interval of DR / FPR across seeds."""
    grouped: dict[tuple, dict[str, list[float]]] = {}
    for rows in rows_by_seed.values():
        for r in rows:
            g = grouped.setdefault(tuple(r[k] for k in keys), {"detection_rate": [], "false_positive_rate": []})
            g["detection_rate"].append(r["detection_rate"])
            g["false_positive_rate"].append(r["false_positive_rate"])
    out = []
    for key, metrics in grouped.items():
        row = dict(zip(keys, key))
        for m, values in metrics.items():
            v = np.array(values, dtype=float)
            half = 1.96 * v.std(ddof=1) / np.sqrt(len(v)) if len(v) > 1 else float("nan")
            row[m] = {
                "mean": float(v.mean()),
                "std": float(v.std(ddof=1)) if len(v) > 1 else 0.0,
                "min": float(v.min()),
                "max": float(v.max()),
                "lo": float(v.mean() - half),
                "hi": float(v.mean() + half),
                "seeds": len(v),
            }
        out.append(row)
    return out
