"""Detection and decoding metrics."""

from __future__ import annotations

import numpy as np


def confusion(truth: list[bool], predicted: list[bool]) -> dict[str, float]:
    """Counts and rates for labelled windows (True = timing channel)."""
    t = np.asarray(truth, dtype=bool)
    p = np.asarray(predicted, dtype=bool)
    tp = int(np.sum(t & p))
    fn = int(np.sum(t & ~p))
    fp = int(np.sum(~t & p))
    tn = int(np.sum(~t & ~p))
    pos, neg = tp + fn, fp + tn
    precision = tp / (tp + fp) if tp + fp else float("nan")
    recall = tp / pos if pos else float("nan")
    return {
        "tp": tp,
        "fn": fn,
        "fp": fp,
        "tn": tn,
        "detection_rate": recall,
        "false_positive_rate": fp / neg if neg else float("nan"),
        "accuracy": (tp + tn) / (pos + neg) if pos + neg else float("nan"),
        "precision": precision,
        "recall": recall,
        "f1": 2 * precision * recall / (precision + recall) if tp else (0.0 if pos else float("nan")),
    }


def two_means_threshold(gaps: np.ndarray, max_iter: int = 100) -> float:
    """Adaptive bit threshold: 1-D 2-means on the gaps, split at the midpoint of the two centres.

    Starts from the smallest and largest gap and alternates assignment
    (``gap < threshold`` -> short cluster) and centre updates until the split
    stops moving. Unlike the fixed 1.0 s threshold it follows the sender's real
    gap pair and any constant offset added by the path.
    """
    g = np.asarray(gaps, dtype=float)
    if len(g) == 0:
        raise ValueError("need at least one gap")
    lo, hi = float(g.min()), float(g.max())
    if lo == hi:
        return lo
    threshold = (lo + hi) / 2.0
    for _ in range(max_iter):
        short, long_ = g[g < threshold], g[g >= threshold]
        if len(short) == 0 or len(long_) == 0:
            break
        new = (float(short.mean()) + float(long_.mean())) / 2.0
        if new == threshold:
            break
        threshold = new
    return threshold


def consecutive_gaps(times: np.ndarray, seq: np.ndarray | None = None) -> np.ndarray:
    """Gaps between requests that arrived back to back (all gaps when ``seq`` is unknown)."""
    ipd = np.diff(np.asarray(times, dtype=float))
    if seq is None:
        return ipd
    return ipd[np.diff(np.asarray(seq, dtype=int)) == 1]


def decode_bits(
    times: np.ndarray,
    seq: np.ndarray | None = None,
    threshold: float | str = 1.0,
    seq_start: int | None = None,
) -> dict[int, int]:
    """Recover bits from gaps: gap < threshold -> 0, otherwise 1.

    ``threshold="auto"`` picks the split with :func:`two_means_threshold`.

    Returns ``{bit_index: bit}``. With ICMP sequence numbers, a gap is only
    decoded when both packets arrived consecutively (``seq`` differs by 1), so
    a lost packet costs the bits around it instead of shifting every later bit.
    Bit ``i`` is carried by the gap between request ``i`` and ``i + 1``,
    counting requests from ``seq_start`` (default: lowest sequence seen).
    """
    if threshold == "auto":
        threshold = two_means_threshold(consecutive_gaps(times, seq))
    threshold = float(threshold)
    ipd = np.diff(np.asarray(times, dtype=float))
    if seq is None:
        return {i: int(g >= threshold) for i, g in enumerate(ipd)}
    seq = np.asarray(seq, dtype=int)
    first = int(seq.min()) if seq_start is None else seq_start
    out = {}
    for i, g in enumerate(ipd):
        if seq[i + 1] - seq[i] == 1:
            out[int(seq[i] - first)] = int(g >= threshold)
    return out


def decoding_accuracy(sent: list[int], decoded: dict[int, int]) -> float:
    """Fraction of sent bits recovered correctly (missing bits count as errors)."""
    if not sent:
        return float("nan")
    correct = sum(1 for i, bit in enumerate(sent) if decoded.get(i) == bit)
    return correct / len(sent)
