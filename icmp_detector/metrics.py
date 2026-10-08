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
    return {
        "tp": tp,
        "fn": fn,
        "fp": fp,
        "tn": tn,
        "detection_rate": tp / pos if pos else float("nan"),
        "false_positive_rate": fp / neg if neg else float("nan"),
        "accuracy": (tp + tn) / (pos + neg) if pos + neg else float("nan"),
    }


def decode_bits(
    times: np.ndarray,
    seq: np.ndarray | None = None,
    threshold: float = 1.0,
    seq_start: int | None = None,
) -> dict[int, int]:
    """Recover bits from gaps: gap < threshold -> 0, otherwise 1.

    Returns ``{bit_index: bit}``. With ICMP sequence numbers, a gap is only
    decoded when both packets arrived consecutively (``seq`` differs by 1), so
    a lost packet costs the bits around it instead of shifting every later bit.
    Bit ``i`` is carried by the gap between request ``i`` and ``i + 1``,
    counting requests from ``seq_start`` (default: lowest sequence seen).
    """
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
