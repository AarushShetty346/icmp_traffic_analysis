"""Synthetic receiver-side timestamps for testing the detector offline.

Nothing here sends packets. It models the arrival times the receiver would
capture, so the pipeline and plots can be exercised before (or alongside)
real lab captures. Results produced from these traces must be reported as
simulated, not as testbed measurements.

Model
-----
* Normal sender: one Echo Request every ``nominal`` seconds with small
  scheduling jitter (``send_jitter``), like the OS ping utility.
* Timing-channel sender: bit 0 -> ``gap0`` seconds, bit 1 -> ``gap1``
  seconds (0.75 s / 1.25 s around a 1 s interval, as planned in Review 1).
* Network condition: every packet gets an extra one-way delay drawn from
  N(0, ``net_jitter``) (clipped at 0, like tc netem delay jitter), and is
  dropped with probability ``loss``. Packets are re-sorted by arrival time,
  so large jitter can reorder them.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .capture import Flow


@dataclass(frozen=True)
class Condition:
    name: str
    net_jitter: float = 0.0  # seconds, std-dev of extra per-packet delay
    loss: float = 0.0  # probability a packet is dropped


CONDITIONS = (
    Condition("clean"),
    Condition("jitter 20 ms", net_jitter=0.020),
    Condition("jitter 50 ms", net_jitter=0.050),
    Condition("jitter 100 ms", net_jitter=0.100),
    Condition("jitter 150 ms", net_jitter=0.150),
    Condition("loss 5%", loss=0.05),
)


@dataclass(frozen=True)
class SenderModel:
    nominal: float = 1.0
    gap0: float = 0.75
    gap1: float = 1.25
    send_jitter: float = 0.002  # sender scheduling noise, seconds
    spike_prob: float = 0.02  # occasional OS scheduling hiccup
    spike_max: float = 0.03


def _send_gaps(n_gaps: int, bits: np.ndarray | None, model: SenderModel, rng: np.random.Generator) -> np.ndarray:
    if bits is None:
        gaps = np.full(n_gaps, model.nominal)
    else:
        gaps = np.where(bits[:n_gaps] == 1, model.gap1, model.gap0).astype(float)
    gaps = gaps + rng.normal(0.0, model.send_jitter, n_gaps)
    spikes = rng.random(n_gaps) < model.spike_prob
    gaps[spikes] += rng.uniform(0.0, model.spike_max, spikes.sum())
    return np.maximum(gaps, 1e-4)


def _through_network(send_times: np.ndarray, cond: Condition, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    n = len(send_times)
    seq = np.arange(n)
    delay = 0.001 + np.abs(rng.normal(0.0, cond.net_jitter, n)) if cond.net_jitter else np.full(n, 0.001)
    arrive = send_times + delay
    keep = rng.random(n) >= cond.loss
    arrive, seq = arrive[keep], seq[keep]
    order = np.argsort(arrive, kind="stable")
    return arrive[order], seq[order]


def normal_run(n_requests: int, cond: Condition, rng: np.random.Generator, model: SenderModel = SenderModel()) -> Flow:
    gaps = _send_gaps(n_requests - 1, None, model, rng)
    send = np.concatenate([[0.0], np.cumsum(gaps)])
    times, seq = _through_network(send, cond, rng)
    return Flow(times, seq.astype(float), "normal")


def channel_run(
    n_requests: int,
    cond: Condition,
    rng: np.random.Generator,
    bits: np.ndarray | None = None,
    model: SenderModel = SenderModel(),
) -> tuple[Flow, np.ndarray]:
    """A controlled timing-channel run. Returns the flow and the bits sent."""
    if bits is None:
        bits = rng.integers(0, 2, n_requests - 1)
    bits = np.asarray(bits, dtype=int)
    if len(bits) < n_requests - 1:
        bits = np.resize(bits, n_requests - 1)
    gaps = _send_gaps(n_requests - 1, bits, model, rng)
    send = np.concatenate([[0.0], np.cumsum(gaps)])
    times, seq = _through_network(send, cond, rng)
    return Flow(times, seq.astype(float), "channel"), bits[: n_requests - 1]
