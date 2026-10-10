"""Command-line interface: ``python -m icmp_detector <command> ...``"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from .capture import load_flow, save_flow
from .detector import DEFAULT_FEATURES, Baseline, BaselineDetector, FixedRuleDetector
from .experiment import LabelledSet, build_baseline, evaluate, multi_seed_study, simulated_study
from .features import ALL_FEATURES, windows
from .metrics import decode_bits, decoding_accuracy
from .simulate import DELAY_MODELS, Condition, SenderModel, channel_run, normal_run


def _flow_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--src", help="keep only Echo Requests from this IP")
    p.add_argument("--dst", help="keep only Echo Requests to this IP")
    p.add_argument("--ident", type=int, help="keep only this ICMP identifier")


def _load(paths, args, label=""):
    return [load_flow(p, args.src, args.dst, args.ident, label) for p in paths]


def _fixed(args) -> FixedRuleDetector:
    return FixedRuleDetector(args.nominal, args.mean_tol, args.std_tol)


def _fixed_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--nominal", type=float, default=1.0, help="nominal ping interval in s (default 1.0)")
    p.add_argument("--mean-tol", type=float, default=0.1, help="fixed rule: allowed |mean - nominal| in s")
    p.add_argument("--std-tol", type=float, default=0.1, help="fixed rule: allowed std of gaps in s")


def _bits(text: str | None) -> list[int] | None:
    if not text:
        return None
    if set(text) - {"0", "1"}:
        raise SystemExit("--bits must be a string of 0s and 1s")
    return [int(c) for c in text]


def cmd_study(args) -> None:
    results = simulated_study(
        seed=args.seed,
        runs=args.runs,
        requests=args.requests,
        window_sizes=tuple(args.windows),
        percentile=args.percentile,
        fixed=_fixed(args),
        step=args.step,
        delay_model=args.delay_model,
        n_boot=args.bootstrap,
    )
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").write_text(json.dumps(results, indent=1))
    from .report import write_report

    written = write_report(results, out)
    print(f"wrote {out / 'results.json'}")
    for p in written:
        print(f"wrote {p}")
    if args.seeds:
        ms = multi_seed_study(
            tuple(args.seeds),
            runs=args.runs,
            requests=args.requests,
            window_sizes=tuple(args.windows),
            percentile=args.percentile,
            fixed=_fixed(args),
            step=args.step,
            delay_model=args.delay_model,
        )
        (out / "multiseed.json").write_text(json.dumps(ms, indent=1))
        from .report import seed_section

        md = out / "RESULTS.md"
        md.write_text(md.read_text() + seed_section(ms, 32 if 32 in args.windows else args.windows[-1]))
        print(f"wrote {out / 'multiseed.json'} ({len(args.seeds)} seeds)")


def cmd_simulate(args) -> None:
    rng = np.random.default_rng(args.seed)
    cond = Condition("custom", args.jitter, args.loss, args.delay_model)
    if args.kind == "normal":
        flow = normal_run(args.requests, cond, rng)
    else:
        model = SenderModel(gap0=args.gap0, gap1=args.gap1)
        bits = _bits(args.bits)
        flow, sent = channel_run(args.requests, cond, rng, np.array(bits) if bits else None, model)
        print("bits:", "".join(map(str, sent)))
    save_flow(flow, args.out)
    print(f"wrote {args.out} ({len(flow)} Echo Requests, simulated)")


def cmd_baseline(args) -> None:
    flows = _load(args.normal, args)
    baseline = build_baseline(flows, args.window, args.percentile, args.step)
    baseline.save(args.out)
    step = f", step {args.step}" if args.step else ""
    print(f"baseline from {baseline.n_windows} windows of {args.window} requests{step} -> {args.out}")
    for name in DEFAULT_FEATURES + ("mean",):
        lo = baseline.lower.get(name)
        print(f"  {name}: upper {baseline.upper[name]:.5f}" + (f", lower {lo:.5f}" if lo is not None else ""))


def cmd_detect(args) -> None:
    baseline = Baseline.load(args.baseline)
    window = args.window or baseline.window_size
    step = args.step or baseline.step or None
    detectors = [BaselineDetector(baseline, tuple(args.features)), _fixed(args)]
    flow = _load([args.capture], args)[0]
    wins = windows(flow.times, window, step, seq=flow.seq)
    if not wins:
        raise SystemExit(f"capture has fewer than {window} requests; try a smaller --window")
    flagged = {d.name: 0 for d in detectors}
    for i, ipd in enumerate(wins):
        parts = []
        for d in detectors:
            dec = d.classify(ipd)
            flagged[d.name] += dec.suspicious
            parts.append(f"{d.name}={dec.label}" + (f" ({'; '.join(dec.reasons)})" if dec.reasons else ""))
        print(f"window {i}: mean={ipd.mean():.4f}s std={ipd.std(ddof=1):.4f}s  " + "  ".join(parts))
    for name, n in flagged.items():
        print(f"{name}: {n}/{len(wins)} windows suspicious")


def cmd_evaluate(args) -> None:
    normal = _load(args.normal, args, "normal")
    channel = _load(args.channel, args, "channel")
    bits = _bits(args.bits)
    if not args.baseline:
        raise SystemExit("--baseline is required (build one with the 'baseline' command)")
    baseline = Baseline.load(args.baseline)
    window = args.window or baseline.window_size
    detectors = {"baseline": BaselineDetector(baseline, tuple(args.features)), "fixed": _fixed(args)}
    step = args.step or baseline.step or None
    data = LabelledSet(normal, channel, [np.array(bits) if bits else None] * len(channel))
    result = evaluate(data, window, detectors, step, args.bootstrap, decode_threshold=_threshold(args.decode_threshold))
    if args.compare_features:
        from .evaluation import feature_comparison, run_windows

        result["feature_comparison"] = feature_comparison(
            baseline, run_windows(normal, window, step), run_windows(channel, window, step), n_boot=args.bootstrap or 500
        )
    print(json.dumps(result, indent=2))


def _threshold(text: str) -> float | str:
    if text == "auto":
        return "auto"
    try:
        return float(text)
    except ValueError:
        raise SystemExit("--threshold must be a number of seconds or 'auto'") from None


def cmd_decode(args) -> None:
    flow = _load([args.capture], args)[0]
    threshold = _threshold(args.threshold)
    if threshold == "auto":
        from .metrics import consecutive_gaps, two_means_threshold

        threshold = two_means_threshold(consecutive_gaps(flow.times, flow.seq))
        print(f"adaptive threshold (2-means): {threshold:.4f} s")
    decoded = decode_bits(flow.times, flow.seq, threshold)
    text = "".join(str(decoded.get(i, "?")) for i in range(max(decoded) + 1)) if decoded else ""
    print("decoded:", text)
    sent = _bits(args.bits)
    if sent:
        print(f"decoding accuracy: {decoding_accuracy(sent, decoded):.1%}")


def cmd_benchmark(args) -> None:
    from .benchmark import accuracy_benchmark, markdown, plots, speed_benchmark

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    acc = accuracy_benchmark(seed=args.seed, runs=args.runs)
    speed = speed_benchmark(packets=args.packets)
    (out / "benchmark.json").write_text(json.dumps({"accuracy": acc, "speed": speed}, indent=1))
    written = plots(acc, out)
    (out / "BENCHMARK.md").write_text(markdown(acc, speed))
    for p in [out / "benchmark.json", out / "BENCHMARK.md", *written]:
        print(f"wrote {p}")
    print(f"{speed['packets_per_s']:,.0f} packets/s end to end, {speed['us_per_window']:.0f} us per window")


def cmd_generate(args) -> None:
    from .generator import GeneratorConfig, run, write_manifest

    cfg = GeneratorConfig(
        dst=args.dst,
        mode=args.mode,
        bits=args.bits or "",
        count=args.count,
        gap0=args.gap0,
        gap1=args.gap1,
        nominal=args.nominal,
        ident=args.ident,
        payload_size=args.payload_size,
        payload_kind=args.payload,
        ttl=args.ttl,
        iface=args.iface,
    )
    data = run(cfg, lab_confirmed=args.i_am_on_the_lab_testbed, dry_run=args.dry_run)
    path = write_manifest(data, args.manifest)
    what = "planned (dry run)" if args.dry_run else "sent"
    print(f"{len(data['packets'])} Echo Requests {what} to {cfg.dst}; manifest -> {path}")
    if not args.dry_run:
        err = data["send_error_s"]
        print(f"send-time error: mean {err['mean'] * 1000:.3f} ms, worst {err['max_abs'] * 1000:.3f} ms")


def cmd_fieldcheck(args) -> None:
    from . import fieldcheck

    report = fieldcheck.compare(
        fieldcheck.read_fields(args.normal, args.src, args.dst), fieldcheck.read_fields(args.covert, args.src, args.dst)
    )
    print(fieldcheck.markdown(report))
    if report["differences"]:
        print("\nnon-timing differences: " + ", ".join(report["differences"]))
    else:
        print("\nno non-timing differences in the checked fields")
    if args.out:
        print(f"wrote {fieldcheck.write_report(report, args.out)}")


def cmd_export_ui(args) -> None:
    from .export import build_bundle, write_bundle

    bundle = build_bundle(
        seed=args.seed,
        runs=args.runs,
        n_boot=args.bootstrap,
        captures=args.captures,
        multi_seeds=tuple(args.seeds) if args.seeds else (),
        src=args.src,
    )
    for p in write_bundle(bundle, args.out):
        print(f"wrote {p} ({p.stat().st_size / 1024:.0f} KB)")
    prov = bundle["provenance"]
    kind = "simulated + real captures" if prov["hasCapture"] else "simulated only"
    print(f"bundle validated against schema {bundle['schemaVersion']} ({kind})")


def cmd_golden(args) -> None:
    from .golden import write_golden

    for p in write_golden(args.out):
        print(f"wrote {p}")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="icmp_detector", description="Detect ICMP covert timing channels from inter-packet delays.")
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("study", help="run the full experiment plan on simulated traces and write plots")
    p.add_argument("--out", default="results")
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--runs", type=int, default=10, help="runs per labelled set (default 10)")
    p.add_argument("--requests", type=int, default=64, help="requests in each run (default 64)")
    p.add_argument("--windows", type=int, nargs="+", default=[8, 16, 32])
    p.add_argument("--percentile", type=float, default=95.0)
    p.add_argument("--step", type=int, help="window step in requests (default: window size, no overlap)")
    p.add_argument("--delay-model", choices=DELAY_MODELS, default="folded", help="simulated network delay model")
    p.add_argument("--bootstrap", type=int, default=0, help="bootstrap resamples over runs for DR/FPR intervals")
    p.add_argument("--seeds", type=int, nargs="+", help="also run these seeds and write multiseed.json")
    _fixed_args(p)
    p.set_defaults(func=cmd_study)

    p = sub.add_parser("benchmark", help="accuracy over channels x network conditions, plus pipeline speed")
    p.add_argument("--out", default="results/benchmark")
    p.add_argument("--seed", type=int, default=11)
    p.add_argument("--runs", type=int, default=30, help="runs per labelled set (default 30)")
    p.add_argument("--packets", type=int, default=100_000, help="capture length for the speed test")
    p.set_defaults(func=cmd_benchmark)

    p = sub.add_parser("simulate", help="write one synthetic capture CSV (no packets are sent)")
    p.add_argument("kind", choices=["normal", "channel"])
    p.add_argument("--out", required=True)
    p.add_argument("--requests", type=int, default=64)
    p.add_argument("--jitter", type=float, default=0.0, help="added network jitter std-dev in s")
    p.add_argument("--loss", type=float, default=0.0, help="packet loss probability")
    p.add_argument("--gap0", type=float, default=0.75)
    p.add_argument("--gap1", type=float, default=1.25)
    p.add_argument("--bits", help="bit string for the channel run (default random)")
    p.add_argument("--seed", type=int)
    p.add_argument("--delay-model", choices=DELAY_MODELS, default="folded")
    p.set_defaults(func=cmd_simulate)

    p = sub.add_parser("baseline", help="build a baseline from normal captures")
    p.add_argument("normal", nargs="+", help="normal-traffic captures (CSV or pcap)")
    p.add_argument("--window", type=int, default=32)
    p.add_argument("--percentile", type=float, default=95.0)
    p.add_argument("--step", type=int, help="window step (default: window size, no overlap)")
    p.add_argument("--out", default="baseline.json")
    _flow_args(p)
    p.set_defaults(func=cmd_baseline)

    p = sub.add_parser("detect", help="classify every window of one capture")
    p.add_argument("capture")
    p.add_argument("--baseline", required=True)
    p.add_argument("--window", type=int, help="default: the baseline's window size")
    p.add_argument("--step", type=int, help="window step (default: the baseline's)")
    p.add_argument("--features", nargs="+", default=list(DEFAULT_FEATURES), choices=list(ALL_FEATURES))
    _flow_args(p)
    _fixed_args(p)
    p.set_defaults(func=cmd_detect)

    p = sub.add_parser("evaluate", help="detection rate / FPR on labelled captures")
    p.add_argument("--normal", nargs="+", required=True, help="normal test captures (not used for the baseline)")
    p.add_argument("--channel", nargs="+", required=True, help="timing-channel test captures")
    p.add_argument("--baseline")
    p.add_argument("--window", type=int)
    p.add_argument("--step", type=int, help="window step (default: the baseline's)")
    p.add_argument("--bits", help="bit string sent in every channel run, for decoding accuracy")
    p.add_argument("--decode-threshold", default="1.0", help="decode threshold in s, or 'auto' (2-means)")
    p.add_argument("--features", nargs="+", default=list(DEFAULT_FEATURES), choices=list(ALL_FEATURES))
    p.add_argument("--bootstrap", type=int, default=0, help="bootstrap resamples over runs for DR/FPR intervals")
    p.add_argument("--compare-features", action="store_true", help="also report AUC and DR/FPR for every feature")
    _flow_args(p)
    _fixed_args(p)
    p.set_defaults(func=cmd_evaluate)

    p = sub.add_parser("decode", help="decode bits from a timing-channel capture")
    p.add_argument("capture")
    p.add_argument("--threshold", default="1.0", help="gap >= threshold decodes as 1; 'auto' fits it with 2-means")
    p.add_argument("--bits", help="bits that were sent, to report decoding accuracy")
    _flow_args(p)
    p.set_defaults(func=cmd_decode)

    p = sub.add_parser("generate", help="send a controlled Echo Request stream on the lab testbed (Scapy, root)")
    p.add_argument("mode", choices=["covert", "normal"])
    p.add_argument("--dst", required=True, help="lab receiver address (private addresses only)")
    p.add_argument("--bits", help="covert mode: bit string to send")
    p.add_argument("--count", type=int, default=64, help="normal mode: number of Echo Requests")
    p.add_argument("--gap0", type=float, default=0.75)
    p.add_argument("--gap1", type=float, default=1.25)
    p.add_argument("--nominal", type=float, default=1.0, help="normal mode: interval in s")
    p.add_argument("--ident", type=lambda v: int(v, 0), default=0x4C42, help="ICMP identifier (constant per stream)")
    p.add_argument("--payload-size", type=int, default=56)
    p.add_argument("--payload", choices=["ping-like", "zeros"], default="ping-like")
    p.add_argument("--ttl", type=int, default=64)
    p.add_argument("--iface")
    p.add_argument("--manifest", required=True, help="where to write the send manifest (JSON)")
    p.add_argument("--dry-run", action="store_true", help="plan the schedule and write the manifest without sending")
    p.add_argument("--i-am-on-the-lab-testbed", action="store_true", help="required: confirms this is the closed lab")
    p.set_defaults(func=cmd_generate)

    p = sub.add_parser("fieldcheck", help="compare non-timing packet fields of a normal and a covert capture")
    p.add_argument("--normal", required=True)
    p.add_argument("--covert", required=True)
    p.add_argument("--src")
    p.add_argument("--dst")
    p.add_argument("--out", help="write the comparison as JSON")
    p.set_defaults(func=cmd_fieldcheck)

    p = sub.add_parser("export-ui", help="write the versioned JSON bundle the workbench reads")
    p.add_argument("--out", default="ui/public/data")
    p.add_argument("--seed", type=int, default=11)
    p.add_argument("--runs", type=int, default=20, help="simulated runs per labelled set")
    p.add_argument("--bootstrap", type=int, default=300, help="bootstrap resamples over runs")
    p.add_argument("--seeds", type=int, nargs="*", default=[7, 8, 9, 10, 11], help="seeds for the seed-spread table")
    p.add_argument("--captures", help="folder of real tshark CSVs with capture manifests")
    p.add_argument("--src", help="keep only Echo Requests from this IP in real captures")
    p.set_defaults(func=cmd_export_ui)

    p = sub.add_parser("golden", help="write parity fixtures for the workbench's TypeScript port")
    p.add_argument("--out", default="tests/golden")
    p.set_defaults(func=cmd_golden)

    args = ap.parse_args(argv)
    try:
        args.func(args)
    except (ValueError, RuntimeError, FileNotFoundError, PermissionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
