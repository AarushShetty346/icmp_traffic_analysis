"""Export everything the analysis workbench (``ui/``) shows, as one versioned JSON bundle.

    python -m icmp_detector export-ui --out ui/public/data
    python -m icmp_detector export-ui --out ui/public/data --captures captures/

The bundle is validated against ``schema/bundle.schema.json`` before it is
written. Every run, matrix cell and curve carries ``source`` (``simulated`` or
``capture``) so the UI can badge it; simulated parts also carry the delay
model and seed that produced them.

Real captures: put tshark CSVs (``scripts/lab/export_csv.sh``) in a folder,
each next to the ``.manifest.json`` written by ``scripts/lab/capture.sh``.
The label comes from the manifest's ``label`` parameter (or a file name
starting with ``normal`` / ``covert``), the condition from ``netem`` (default
``lab``), and covert bits from a ``bits`` parameter if present.
"""

from __future__ import annotations

import datetime as _dt
import json
from importlib import resources
from pathlib import Path

import numpy as np

from . import fieldcheck
from .benchmark import CHANNEL_GRID, CONDITION_GRID
from .capture import Flow, load_flow
from .detector import BaselineDetector, FixedRuleDetector
from .evaluation import auc, feature_comparison, feature_scores, roc_curve, run_windows
from .experiment import CHANNELS, LabelledSet, build_baseline, evaluate, multi_seed_study
from .features import ALL_FEATURES
from .generator import git_commit
from .metrics import consecutive_gaps, decode_bits, decoding_accuracy, two_means_threshold
from .simulate import DELAY_MODELS, channel_run, normal_run

SCHEMA_VERSION = "1.0.0"
ROC_FEATURES = ("std", "iqr", "entropy", "off_nominal", "ks")
MAX_ROC_POINTS = 32


def schema() -> dict:
    return json.loads(resources.files("icmp_detector").joinpath("schema/bundle.schema.json").read_text())


def validate(bundle: dict) -> None:
    """Raise ``jsonschema.ValidationError`` if the bundle does not match the schema."""
    import jsonschema  # type: ignore

    jsonschema.validate(bundle, schema())


def _num(x: float | None, digits: int = 6) -> float | None:
    if x is None:
        return None
    x = float(x)
    if not np.isfinite(x):
        return None
    return round(x, digits)


def _decimate(points: list[dict], limit: int = MAX_ROC_POINTS) -> list[dict]:
    if len(points) <= limit:
        keep = points
    else:
        idx = np.unique(np.round(np.linspace(0, len(points) - 1, limit)).astype(int))
        keep = [points[i] for i in idx]
    return [
        {
            "threshold": None if not np.isfinite(p["threshold"]) else _num(p["threshold"], 7),
            "fpr": _num(p["fpr"]),
            "tpr": _num(p["tpr"]),
            "precision": _num(p["precision"]),
        }
        for p in keep
    ]


def _bits_text(decoded: dict[int, int], n: int) -> str:
    return "".join(str(decoded[i]) if i in decoded else "?" for i in range(n))


def _run_entry(run_id: str, flow: Flow, label: str, source: str, **extra) -> dict:
    return {
        "id": run_id,
        "label": label,
        "source": source,
        "times": [round(float(t - flow.times[0]), 6) for t in flow.times],
        "seq": None if flow.seq is None else [int(s) for s in flow.seq],
        **extra,
    }


def _decode_entry(run_id: str, flow: Flow, bits: np.ndarray | list[int], source: str) -> dict:
    sent = [int(b) for b in bits]
    fixed = decode_bits(flow.times, flow.seq, 1.0)
    gaps = consecutive_gaps(flow.times, flow.seq)
    thr = two_means_threshold(gaps) if len(gaps) else 1.0
    adaptive = decode_bits(flow.times, flow.seq, thr)
    return {
        "runId": run_id,
        "source": source,
        "sent": "".join(map(str, sent)),
        "fixedThreshold": 1.0,
        "adaptiveThreshold": _num(thr),
        "decodedFixed": _bits_text(fixed, len(sent)),
        "decodedAdaptive": _bits_text(adaptive, len(sent)),
        "accuracyFixed": _num(decoding_accuracy(sent, fixed)),
        "accuracyAdaptive": _num(decoding_accuracy(sent, adaptive)),
    }


def _baseline_entry(bid: str, kind: str, condition: str, model: str | None, b, source: str, with_reference: bool) -> dict:
    return {
        "id": bid,
        "kind": kind,
        "condition": condition,
        "delayModel": model,
        "source": source,
        "window": b.window_size,
        "step": b.step or b.window_size,
        "percentile": b.percentile,
        "nWindows": b.n_windows,
        "lower": {k: _num(v, 9) for k, v in b.lower.items()},
        "upper": {k: _num(v, 9) for k, v in b.upper.items()},
        "reference": [round(x, 6) for x in b.reference] if with_reference else None,
    }


def _ci(ci: dict | None) -> dict | None:
    if not ci:
        return None
    return {k: {"estimate": _num(v["estimate"]), "lo": _num(v["lo"]), "hi": _num(v["hi"]), "runs": v["runs"]} for k, v in ci.items()}


def simulated_part(
    seed: int = 11,
    runs: int = 20,
    requests: int = 64,
    window_sizes: tuple[int, ...] = (8, 16, 32),
    delay_models: tuple[str, ...] = DELAY_MODELS,
    example_runs: int = 2,
    n_boot: int = 300,
    channels: dict = CHANNEL_GRID,
    conditions: tuple = CONDITION_GRID,
) -> dict:
    """Matrix, ROC, decode and example runs for the simulated stress grid."""
    fixed = FixedRuleDetector()
    ref_w = 32 if 32 in window_sizes else window_sizes[-1]
    out = {"runs": [], "baselines": [], "matrix": [], "roc": [], "decode": [], "features": []}
    for model in delay_models:
        rng = np.random.default_rng(seed)
        conds = [c.with_model(model) for c in conditions]
        clean_flows = [normal_run(requests, conds[0], rng) for _ in range(runs)]
        clean_b = {w: build_baseline(clean_flows, w) for w in window_sizes}
        out["baselines"].append(
            _baseline_entry(f"sim-{model}-clean", "clean", conds[0].name, model, clean_b[ref_w], "simulated", True)
        )
        for cond in conds:
            matched_flows = [normal_run(requests, cond, rng) for _ in range(runs)]
            test_normal = [normal_run(requests, cond, rng) for _ in range(runs)]
            matched_b = {w: build_baseline(matched_flows, w) for w in window_sizes}
            out["baselines"].append(
                _baseline_entry(f"sim-{model}-{cond.name}-matched", "matched", cond.name, model, matched_b[ref_w], "simulated", False)
            )
            normal_ids = []
            for i, f in enumerate(test_normal[:example_runs]):
                rid = f"sim-{model}-{cond.name}-normal-{i}"
                normal_ids.append(rid)
                out["runs"].append(
                    _run_entry(rid, f, "normal", "simulated", condition=cond.name, delayModel=model, channel=None, seed=seed, bits=None)
                )
            for ch_name, sender in channels.items():
                test_channel, bits = [], []
                for _ in range(runs):
                    flow, sent = channel_run(requests, cond, rng, model=sender)
                    test_channel.append(flow)
                    bits.append(sent)
                covert_ids = []
                for i, (f, b) in enumerate(zip(test_channel[:example_runs], bits)):
                    rid = f"sim-{model}-{cond.name}-{ch_name}-covert-{i}"
                    covert_ids.append(rid)
                    out["runs"].append(
                        _run_entry(
                            rid, f, "covert", "simulated", condition=cond.name, delayModel=model, channel=ch_name,
                            seed=seed, bits="".join(map(str, b)), gap0=sender.gap0, gap1=sender.gap1,
                        )
                    )
                    out["decode"].append({**_decode_entry(rid, f, b, "simulated"), "channel": ch_name, "condition": cond.name, "delayModel": model})
                data = LabelledSet(test_normal, test_channel, bits)
                acc_fixed = float(np.mean([decoding_accuracy(list(b), decode_bits(f.times, f.seq, 1.0)) for f, b in zip(test_channel, bits)]))
                acc_auto = float(np.mean([decoding_accuracy(list(b), decode_bits(f.times, f.seq, "auto")) for f, b in zip(test_channel, bits)]))
                for w in window_sizes:
                    dets = {
                        "fixed": fixed,
                        "baseline (clean)": BaselineDetector(clean_b[w]),
                        "baseline (matched)": BaselineDetector(matched_b[w]),
                    }
                    res = evaluate(data, w, dets, n_boot=n_boot, seed=seed)
                    for det_name, m in res["detectors"].items():
                        out["matrix"].append(
                            {
                                "source": "simulated",
                                "channel": ch_name,
                                "condition": cond.name,
                                "delayModel": model,
                                "window": w,
                                "detector": det_name,
                                "detectionRate": _num(m["detection_rate"]),
                                "falsePositiveRate": _num(m["false_positive_rate"]),
                                "precision": _num(m["precision"]),
                                "nCovertWindows": m["tp"] + m["fn"],
                                "nNormalWindows": m["fp"] + m["tn"],
                                "runsPerSet": runs,
                                "ci": _ci(m.get("ci")),
                                "decodeFixed": _num(acc_fixed),
                                "decodeAdaptive": _num(acc_auto),
                                "runIds": normal_ids + covert_ids,
                            }
                        )
                    if w == ref_w:
                        nr, cr = run_windows(test_normal, w), run_windows(test_channel, w)
                        comp = feature_comparison(matched_b[w], nr, cr, ALL_FEATURES, n_boot=n_boot, seed=seed)
                        out["features"].append(
                            {
                                "source": "simulated",
                                "channel": ch_name,
                                "condition": cond.name,
                                "delayModel": model,
                                "window": w,
                                "baseline": "matched",
                                "rows": [
                                    {
                                        "feature": r["feature"],
                                        "auc": _num(r["auc"]),
                                        "detectionRate": _num(r["operating_point"]["tpr"]),
                                        "falsePositiveRate": _num(r["operating_point"]["fpr"]),
                                        "ci": _ci({"detection_rate": r["detection_rate"], "false_positive_rate": r["false_positive_rate"]}),
                                    }
                                    for r in comp
                                ],
                            }
                        )
                        for feat in ROC_FEATURES:
                            if feat not in matched_b[w].upper:
                                continue
                            neg = feature_scores(matched_b[w], nr, feat)
                            pos = feature_scores(matched_b[w], cr, feat)
                            pts = roc_curve(neg, pos)
                            out["roc"].append(
                                {
                                    "source": "simulated",
                                    "channel": ch_name,
                                    "condition": cond.name,
                                    "delayModel": model,
                                    "window": w,
                                    "feature": feat,
                                    "auc": _num(auc(pts)),
                                    "operatingThreshold": _num(matched_b[w].score_threshold(feat), 9),
                                    "points": _decimate(pts),
                                }
                            )
    return out


def _capture_meta(csv: Path) -> dict:
    for cand in (csv.with_suffix(".manifest.json"), csv.parent / (csv.stem + ".manifest.json")):
        if cand.exists():
            return json.loads(cand.read_text())
    return {}


def capture_part(folder: str | Path, window: int = 32, n_boot: int = 300, src: str | None = None) -> dict:
    """Runs, baselines, matrix rows and field checks from real lab captures."""
    folder = Path(folder)
    out = {"runs": [], "baselines": [], "matrix": [], "roc": [], "decode": [], "features": [], "fieldcheck": [], "manifests": []}
    groups: dict[str, dict[str, list]] = {}
    for csv in sorted(folder.glob("*.csv")):
        meta = _capture_meta(csv)
        params = meta.get("params", {})
        label = params.get("label") or ("covert" if csv.stem.startswith("covert") else "normal" if csv.stem.startswith("normal") else None)
        if label not in ("normal", "covert"):
            continue
        condition = params.get("netem", "lab")
        flow = load_flow(csv, src=src, label=csv.stem)
        rid = f"cap-{csv.stem}"
        bits = params.get("bits")
        out["runs"].append(
            _run_entry(rid, flow, label, "capture", condition=condition, delayModel=None, channel=params.get("channel"),
                       seed=None, bits=bits, file=csv.name)
        )
        if meta:
            out["manifests"].append({"runId": rid, "manifest": meta})
        g = groups.setdefault(condition, {"normal": [], "covert": [], "bits": [], "ids": [], "csv_normal": [], "csv_covert": []})
        g[label].append(flow)
        g["ids"].append(rid)
        g[f"csv_{label}"].append(csv)
        if label == "covert":
            g["bits"].append(np.array([int(c) for c in bits]) if bits else None)
            if bits:
                out["decode"].append({**_decode_entry(rid, flow, [int(c) for c in bits], "capture"), "channel": params.get("channel"), "condition": condition, "delayModel": None})
    for condition, g in groups.items():
        if len(g["normal"]) >= 2:
            # leave half of the normal runs out of the baseline so FPR is measured on unseen runs
            half = max(1, len(g["normal"]) // 2)
            base_flows, test_normal = g["normal"][:half], g["normal"][half:]
            b = build_baseline(base_flows, window)
            out["baselines"].append(_baseline_entry(f"cap-{condition}", "matched", condition, None, b, "capture", True))
            if g["covert"]:
                dets = {"fixed": FixedRuleDetector(), "baseline (matched)": BaselineDetector(b)}
                res = evaluate(LabelledSet(test_normal, g["covert"], g["bits"]), window, dets, n_boot=n_boot)
                for det_name, m in res["detectors"].items():
                    out["matrix"].append(
                        {
                            "source": "capture",
                            "channel": "lab",
                            "condition": condition,
                            "delayModel": None,
                            "window": window,
                            "detector": det_name,
                            "detectionRate": _num(m["detection_rate"]),
                            "falsePositiveRate": _num(m["false_positive_rate"]),
                            "precision": _num(m["precision"]),
                            "nCovertWindows": m["tp"] + m["fn"],
                            "nNormalWindows": m["fp"] + m["tn"],
                            "runsPerSet": len(g["covert"]),
                            "ci": _ci(m.get("ci")),
                            "decodeFixed": _num(res["decoding_accuracy"]),
                            "decodeAdaptive": None,
                            "runIds": g["ids"],
                        }
                    )
        for cn in g["csv_normal"][:1]:
            for cc in g["csv_covert"][:1]:
                rep = fieldcheck.compare(fieldcheck.read_fields(cn, src), fieldcheck.read_fields(cc, src))
                out["fieldcheck"].append(
                    {
                        "condition": condition,
                        "normalFile": cn.name,
                        "covertFile": cc.name,
                        "rows": [
                            {"field": r["field"], "normal": _text(r["normal"]), "covert": _text(r["covert"]), "differs": r["differs"], "note": r["note"]}
                            for r in rep["rows"]
                        ],
                    }
                )
    return out


def _text(v) -> str | None:
    if v is None:
        return None
    return ", ".join(map(str, v)) if isinstance(v, list) else str(v)


def build_bundle(
    seed: int = 11,
    runs: int = 20,
    n_boot: int = 300,
    captures: str | Path | None = None,
    delay_models: tuple[str, ...] = DELAY_MODELS,
    multi_seeds: tuple[int, ...] = (7, 8, 9, 10, 11),
    src: str | None = None,
    **sim_kwargs,
) -> dict:
    sim = simulated_part(seed=seed, runs=runs, n_boot=n_boot, delay_models=delay_models, **sim_kwargs)
    cap = capture_part(captures, n_boot=n_boot, src=src) if captures else None
    ms = multi_seed_study(multi_seeds, runs=10, requests=64, window_sizes=(32,), channels=CHANNELS, delay_model="netem") if multi_seeds else None
    parts = [sim] + ([cap] if cap else [])

    def merged(key: str) -> list:
        return [x for p in parts for x in p.get(key, [])]

    fixed = FixedRuleDetector()
    bundle = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "provenance": {
            "simulated": cap is None or not cap["runs"],
            "hasSimulated": True,
            "hasCapture": bool(cap and cap["runs"]),
            "commit": git_commit(),
            "seed": seed,
            "runsPerSet": runs,
            "bootstrapResamples": n_boot,
            "delayModels": list(delay_models),
            "captureManifests": cap["manifests"] if cap else [],
            "note": "Simulated parts come from icmp_detector/simulate.py and are not testbed measurements.",
        },
        "settings": {
            "nominal": fixed.nominal,
            "fixedRule": {"meanLimit": fixed.mean_tol, "stdLimit": fixed.std_tol},
            "percentile": 95.0,
            "windowSizes": list(sim_kwargs.get("window_sizes", (8, 16, 32))),
            "defaultWindow": 32,
            "features": list(ALL_FEATURES),
            "channels": [{"name": k, "gap0": v.gap0, "gap1": v.gap1} for k, v in sim_kwargs.get("channels", CHANNEL_GRID).items()],
            "conditions": [
                {"name": c.name, "netJitter": c.net_jitter, "loss": c.loss}
                for c in sim_kwargs.get("conditions", CONDITION_GRID)
            ],
        },
        "runs": merged("runs"),
        "baselines": merged("baselines"),
        "matrix": merged("matrix"),
        "features": merged("features"),
        "roc": merged("roc"),
        "decode": merged("decode"),
        "fieldcheck": cap["fieldcheck"] if cap else [],
        "multiSeed": None
        if ms is None
        else {
            "source": "simulated",
            "seeds": ms["seeds"],
            "delayModel": "netem",
            "runsPerSet": 10,
            "rows": [
                {
                    "channel": r["channel"],
                    "condition": r["condition"],
                    "window": r["window"],
                    "detector": r["detector"],
                    "detectionRate": {k: _num(v) if isinstance(v, float) else v for k, v in r["detection_rate"].items()},
                    "falsePositiveRate": {k: _num(v) if isinstance(v, float) else v for k, v in r["false_positive_rate"].items()},
                }
                for r in ms["summary"]
            ],
        },
    }
    return bundle


def write_bundle(bundle: dict, out: str | Path) -> list[Path]:
    validate(bundle)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / "bundle.json"
    path.write_text(json.dumps(bundle, separators=(",", ":"), allow_nan=False))
    schema_path = out / "bundle.schema.json"
    schema_path.write_text(json.dumps(schema(), indent=1))
    return [path, schema_path]
