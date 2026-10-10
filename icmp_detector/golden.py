"""Golden fixtures: Python outputs the browser port must reproduce to 1e-9.

    python -m icmp_detector golden --out tests/golden

``ui/src/lib/analysis`` re-implements windowing, features, the baseline fit,
both detectors, KS distance, the ROC sweep and decoding in TypeScript. Its
unit tests load these files and compare every number. ``tests/test_golden.py``
fails when the committed files no longer match what this module produces.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .capture import Flow
from .detector import BaselineDetector, FixedRuleDetector
from .evaluation import auc, feature_scores, roc_curve, run_windows
from .experiment import build_baseline
from .features import ALL_FEATURES, ks_distance, window_features, windows
from .metrics import consecutive_gaps, decode_bits, two_means_threshold
from .simulate import Condition, SenderModel, channel_run, normal_run

SEED = 20261026


def _floats(a) -> list[float]:
    return [float(x) for x in a]


def _flows() -> dict[str, tuple[Flow, list[int] | None]]:
    rng = np.random.default_rng(SEED)
    jitter = Condition("jitter 20 ms", net_jitter=0.020, delay_model="netem")
    lossy = Condition("jitter 50 ms + loss 5%", net_jitter=0.050, loss=0.05, delay_model="netem", net_corr=0.25)
    out: dict[str, tuple[Flow, list[int] | None]] = {}
    for i in range(3):
        out[f"normal_{i}"] = (normal_run(96, jitter, rng), None)
    out["normal_lossy"] = (normal_run(96, lossy, rng), None)
    flow, bits = channel_run(96, jitter, rng, model=SenderModel(gap0=0.95, gap1=1.05))
    out["covert_subtle"] = (flow, [int(b) for b in bits])
    flow, bits = channel_run(96, lossy, rng, model=SenderModel())
    out["covert_lossy"] = (flow, [int(b) for b in bits])
    return out


def _case(name: str, flow: Flow, bits: list[int] | None) -> dict:
    return {
        "name": name,
        "times": _floats(flow.times),
        "seq": None if flow.seq is None else [int(s) for s in flow.seq],
        "bits": bits,
    }


def build() -> dict[str, dict]:
    flows = _flows()
    cases = [_case(k, f, b) for k, (f, b) in flows.items()]

    windowing = []
    for name, (flow, _) in flows.items():
        for size, step in ((8, None), (32, None), (16, 8)):
            wins = windows(flow.times, size, step, seq=flow.seq)
            windowing.append(
                {
                    "case": name,
                    "size": size,
                    "step": step,
                    "windows": [_floats(w) for w in wins],
                    "features": [window_features(w) for w in wins],
                }
            )

    normals = [flows[f"normal_{i}"][0] for i in range(3)]
    baselines, detections, rocs = [], [], []
    for size, step in ((16, None), (32, 16)):
        b = build_baseline(normals, size, 95.0, step)
        baselines.append(
            {
                "runs": ["normal_0", "normal_1", "normal_2"],
                "size": size,
                "step": step,
                "percentile": 95.0,
                "nWindows": b.n_windows,
                "lower": b.lower,
                "upper": b.upper,
                "reference": b.reference,
            }
        )
        fixed = FixedRuleDetector()
        for feats in (("std",), ("std", "ks"), ("mean", "iqr")):
            det = BaselineDetector(b, feats)
            for name in ("normal_lossy", "covert_subtle", "covert_lossy"):
                flow = flows[name][0]
                wins = windows(flow.times, size, step, seq=flow.seq)
                detections.append(
                    {
                        "case": name,
                        "size": size,
                        "step": step,
                        "features": list(feats),
                        "baselineFlags": [det.classify(w).suspicious for w in wins],
                        "ks": [ks_distance(w, np.asarray(b.reference)) for w in wins],
                        "fixedFlags": [fixed.classify(w).suspicious for w in wins],
                    }
                )
        neg = run_windows([flows["normal_lossy"][0]], size, step)
        pos = run_windows([flows["covert_subtle"][0], flows["covert_lossy"][0]], size, step)
        for feat in ALL_FEATURES:
            ns, ps = feature_scores(b, neg, feat), feature_scores(b, pos, feat)
            pts = roc_curve(ns, ps)
            rocs.append(
                {
                    "size": size,
                    "step": step,
                    "feature": feat,
                    "negative": _floats(ns),
                    "positive": _floats(ps),
                    "points": [
                        {
                            **p,
                            "threshold": None if np.isinf(p["threshold"]) else p["threshold"],
                            "precision": None if np.isnan(p["precision"]) else p["precision"],
                        }
                        for p in pts
                    ],
                    "auc": auc(pts),
                    "operatingThreshold": b.score_threshold(feat),
                }
            )

    decoding = []
    for name in ("covert_subtle", "covert_lossy"):
        flow, bits = flows[name]
        thr = two_means_threshold(consecutive_gaps(flow.times, flow.seq))
        decoding.append(
            {
                "case": name,
                "adaptiveThreshold": thr,
                "fixed": {str(k): v for k, v in decode_bits(flow.times, flow.seq, 1.0).items()},
                "adaptive": {str(k): v for k, v in decode_bits(flow.times, flow.seq, thr).items()},
                "noSeq": {str(k): v for k, v in decode_bits(flow.times, None, 1.0).items()},
            }
        )

    rng = np.random.default_rng(SEED + 1)
    a, b2 = rng.normal(1.0, 0.01, 40), rng.normal(1.002, 0.012, 75)
    stats = {
        "percentile": [
            {"values": _floats(v), "q": q, "result": float(np.percentile(v, q))}
            for v in (a[:7], a, b2[:20])
            for q in (2.5, 25.0, 50.0, 95.0, 97.5)
        ],
        "ks": [{"a": _floats(a), "b": _floats(b2), "result": ks_distance(a, b2)}],
        "twoMeans": [{"gaps": _floats(g), "result": two_means_threshold(g)} for g in (a, np.concatenate([a - 0.05, b2 + 0.05]))],
    }

    return {
        "cases.json": {"seed": SEED, "cases": cases},
        "windows.json": {"items": windowing},
        "baseline.json": {"items": baselines},
        "detect.json": {"items": detections},
        "roc.json": {"items": rocs},
        "decode.json": {"items": decoding},
        "stats.json": stats,
    }


def write_golden(out: str | Path) -> list[Path]:
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, data in build().items():
        p = out / name
        p.write_text(json.dumps(data, allow_nan=False, separators=(",", ":")) + "\n")
        paths.append(p)
    return paths
