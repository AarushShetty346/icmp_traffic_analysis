"""Normal-traffic baseline and the two decision approaches.

* ``FixedRuleDetector`` uses tolerances chosen before any test run.
* ``BaselineDetector`` derives its thresholds from windows of labelled
  normal traffic (95th percentile by default).

Both classify one observation window as ``normal`` or ``suspicious``.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

from .features import ALL_FEATURES, FEATURES, ks_distance, window_features

# "upper": only unusually large values are suspicious (dispersion features).
# "both": values outside the normal band on either side are suspicious.
DIRECTION = {
    "mean": "both",
    "median": "both",
    "min": "both",
    "max": "upper",
    "var": "upper",
    "std": "upper",
    "cv": "upper",
    "iqr": "upper",
    "entropy": "upper",
    "off_nominal": "upper",
    "ks": "upper",
}

DEFAULT_FEATURES = ("std",)


@dataclass
class Baseline:
    """Per-feature thresholds learned from normal windows."""

    percentile: float
    window_size: int
    n_windows: int
    lower: dict[str, float] = field(default_factory=dict)
    upper: dict[str, float] = field(default_factory=dict)
    summary: dict[str, dict[str, float]] = field(default_factory=dict)
    # Pooled normal gaps for reference features (KS distance); empty in older baseline files.
    reference: list[float] = field(default_factory=list)
    step: int = 0  # window step used to fit (0 = non-overlapping)

    @classmethod
    def fit(
        cls,
        normal_windows: list[np.ndarray],
        percentile: float = 95.0,
        window_size: int = 0,
        reference: np.ndarray | None = None,
        ks_values: list[float] | None = None,
        step: int = 0,
    ) -> Baseline:
        """Fit thresholds from normal windows.

        With ``reference`` (pooled normal gaps) the KS-distance feature is fitted
        too. Pass ``ks_values`` to fit its threshold from out-of-sample distances
        (see ``experiment.build_baseline``, which leaves each run out of its own
        reference); otherwise the in-sample distances are used.
        """
        if not normal_windows:
            raise ValueError("baseline needs at least one normal window")
        feats = [window_features(w) for w in normal_windows]
        ref = np.sort(np.asarray(reference, dtype=float)) if reference is not None and len(reference) else None
        if ref is not None:
            ks = ks_values if ks_values is not None else [ks_distance(w, ref) for w in normal_windows]
            for f, k in zip(feats, ks):
                f["ks"] = float(k)
        names = FEATURES + (("ks",) if ref is not None else ())
        lower, upper, summary = {}, {}, {}
        tail = (100.0 - percentile) / 2.0
        for name in names:
            values = np.array([f[name] for f in feats])
            summary[name] = {
                "mean": float(values.mean()),
                "std": float(values.std()),
                "min": float(values.min()),
                "max": float(values.max()),
                "median": float(np.median(values)),
            }
            if DIRECTION[name] == "upper":
                upper[name] = float(np.percentile(values, percentile))
            else:
                lower[name] = float(np.percentile(values, tail))
                upper[name] = float(np.percentile(values, 100.0 - tail))
        return cls(
            percentile,
            window_size,
            len(feats),
            lower,
            upper,
            summary,
            [] if ref is None else ref.tolist(),
            step,
        )

    def score(self, name: str, value: float) -> float:
        """Suspicion score for ROC sweeps: larger means further from normal.

        One-sided features score as the raw value; two-sided features as the
        distance from the centre of the normal band.
        """
        if DIRECTION[name] == "upper":
            return float(value)
        centre = (self.lower[name] + self.upper[name]) / 2.0
        return abs(float(value) - centre)

    def score_threshold(self, name: str) -> float:
        """The baseline's own threshold expressed on the ``score`` scale."""
        if DIRECTION[name] == "upper":
            return self.upper[name]
        return (self.upper[name] - self.lower[name]) / 2.0

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2))

    @classmethod
    def load(cls, path: str | Path) -> Baseline:
        return cls(**json.loads(Path(path).read_text()))


@dataclass
class Decision:
    suspicious: bool
    reasons: list[str]
    features: dict[str, float]

    @property
    def label(self) -> str:
        return "suspicious" if self.suspicious else "normal"


class BaselineDetector:
    """Flags a window when any chosen feature leaves the normal baseline range."""

    name = "baseline"

    def __init__(self, baseline: Baseline, features: tuple[str, ...] = DEFAULT_FEATURES):
        unknown = set(features) - set(ALL_FEATURES)
        if unknown:
            raise ValueError(f"unknown features: {sorted(unknown)}")
        if "ks" in features and not baseline.reference:
            raise ValueError("the ks feature needs a baseline built with a reference sample")
        self.baseline = baseline
        self.features = tuple(features)
        self._reference = np.asarray(baseline.reference, dtype=float)

    def features_of(self, ipd: np.ndarray) -> dict[str, float]:
        feats = window_features(ipd)
        if len(self._reference):
            feats["ks"] = ks_distance(ipd, self._reference)
        return feats

    def classify(self, ipd: np.ndarray) -> Decision:
        feats = self.features_of(ipd)
        reasons = []
        for name in self.features:
            value = feats[name]
            hi = self.baseline.upper.get(name)
            lo = self.baseline.lower.get(name)
            if hi is not None and value > hi:
                reasons.append(f"{name}={value:.4f} > baseline p{self.baseline.percentile:g} {hi:.4f}")
            if lo is not None and value < lo:
                reasons.append(f"{name}={value:.4f} < baseline lower {lo:.4f}")
        return Decision(bool(reasons), reasons, feats)


class FixedRuleDetector:
    """Predefined tolerance around the nominal ping interval.

    Suspicious when the window's standard deviation exceeds ``std_tol`` or its
    mean drifts more than ``mean_tol`` from ``nominal`` (all in seconds).
    """

    name = "fixed"

    def __init__(self, nominal: float = 1.0, mean_tol: float = 0.1, std_tol: float = 0.1):
        self.nominal = nominal
        self.mean_tol = mean_tol
        self.std_tol = std_tol

    def classify(self, ipd: np.ndarray) -> Decision:
        feats = window_features(ipd)
        reasons = []
        if feats["std"] > self.std_tol:
            reasons.append(f"std={feats['std']:.4f} > fixed {self.std_tol:g}")
        if abs(feats["mean"] - self.nominal) > self.mean_tol:
            reasons.append(f"|mean-{self.nominal:g}|={abs(feats['mean'] - self.nominal):.4f} > fixed {self.mean_tol:g}")
        return Decision(bool(reasons), reasons, feats)
