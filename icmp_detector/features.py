"""Inter-packet delays, observation windows and window features."""

from __future__ import annotations

import numpy as np

# Bin width used for the entropy feature, in seconds.
ENTROPY_BIN = 0.02
# A gap counts as "off-nominal" when it is this far from the window median.
OFF_NOMINAL = 0.1

FEATURES = ("mean", "var", "std", "cv", "median", "iqr", "min", "max", "entropy", "off_nominal")


def inter_packet_delays(times: np.ndarray) -> np.ndarray:
    """Return delta_t_i = t_i - t_(i-1) for a sorted timestamp sequence."""
    return np.diff(np.asarray(times, dtype=float))


def windows(
    times: np.ndarray,
    size: int,
    step: int | None = None,
    seq: np.ndarray | None = None,
) -> list[np.ndarray]:
    """Split a flow into observation windows of ``size`` Echo Requests.

    Each window yields up to ``size - 1`` inter-packet delays. Windows are
    non-overlapping by default; a partial window at the end is dropped.

    If ICMP sequence numbers are given, gaps between requests that are not
    consecutive (a request was lost or reordered) are left out, so one lost
    packet does not look like a deliberate 2 s gap.
    """
    if size < 3:
        raise ValueError("window size must be at least 3 requests")
    step = step or size
    times = np.asarray(times, dtype=float)
    out = []
    for start in range(0, len(times) - size + 1, step):
        ipd = inter_packet_delays(times[start : start + size])
        if seq is not None:
            ipd = ipd[np.diff(np.asarray(seq[start : start + size])) == 1]
        if len(ipd) >= 2:
            out.append(ipd)
    return out


def _entropy(ipd: np.ndarray) -> float:
    bins = np.floor(ipd / ENTROPY_BIN).astype(int)
    _, counts = np.unique(bins, return_counts=True)
    p = counts / counts.sum()
    return float(-(p * np.log2(p)).sum())


def window_features(ipd: np.ndarray) -> dict[str, float]:
    """Statistical features of one window of inter-packet delays."""
    ipd = np.asarray(ipd, dtype=float)
    mean = float(ipd.mean())
    std = float(ipd.std(ddof=1)) if len(ipd) > 1 else 0.0
    q1, median, q3 = np.percentile(ipd, [25, 50, 75])
    return {
        "mean": mean,
        "var": std**2,
        "std": std,
        "cv": std / mean if mean > 0 else 0.0,
        "median": float(median),
        "iqr": float(q3 - q1),
        "min": float(ipd.min()),
        "max": float(ipd.max()),
        "entropy": _entropy(ipd),
        "off_nominal": float(np.mean(np.abs(ipd - median) > OFF_NOMINAL)),
    }
