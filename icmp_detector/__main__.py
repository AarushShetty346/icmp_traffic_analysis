"""Command-line interface: ``python -m icmp_detector <command> ...``"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from .capture import load_flow, save_flow
from .detector import DEFAULT_FEATURES, Baseline, BaselineDetector, FixedRuleDetector
from .experiment import LabelledSet, build_baseline, evaluate, simulated_study
from .features import windows
from .metrics import decode_bits, decoding_accuracy
from .simulate import Condition, SenderModel, channel_run, normal_run


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
    )
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").write_text(json.dumps(results, indent=1))
    from .report import write_report

    written = write_report(results, out)
    print(f"wrote {out / 'results.json'}")
    for p in written:
        print(f"wrote {p}")


def cmd_simulate(args) -> None:
    rng = np.random.default_rng(args.seed)
    cond = Condition("custom", args.jitter, args.loss)
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
    baseline = build_baseline(flows, args.window, args.percentile)
    baseline.save(args.out)
    print(f"baseline from {baseline.n_windows} windows of {args.window} requests -> {args.out}")
    for name in DEFAULT_FEATURES + ("mean",):
        lo = baseline.lower.get(name)
        print(f"  {name}: upper {baseline.upper[name]:.5f}" + (f", lower {lo:.5f}" if lo is not None else ""))


def cmd_detect(args) -> None:
    baseline = Baseline.load(args.baseline)
    window = args.window or baseline.window_size
    detectors = [BaselineDetector(baseline, tuple(args.features)), _fixed(args)]
    flow = _load([args.capture], args)[0]
    wins = windows(flow.times, window, seq=flow.seq)
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
    baseline = Baseline.load(args.baseline) if args.baseline else None
    window = args.window or (baseline.window_size if baseline else 32)
    if baseline is None:
        raise SystemExit("--baseline is required (build one with the 'baseline' command)")
    detectors = {"baseline": BaselineDetector(baseline, tuple(args.features)), "fixed": _fixed(args)}
    data = LabelledSet(normal, channel, [np.array(bits) if bits else None] * len(channel))
    result = evaluate(data, window, detectors)
    print(json.dumps(result, indent=2))


def cmd_decode(args) -> None:
    flow = _load([args.capture], args)[0]
    decoded = decode_bits(flow.times, flow.seq, args.threshold)
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
    p.set_defaults(func=cmd_simulate)

    p = sub.add_parser("baseline", help="build a baseline from normal captures")
    p.add_argument("normal", nargs="+", help="normal-traffic captures (CSV or pcap)")
    p.add_argument("--window", type=int, default=32)
    p.add_argument("--percentile", type=float, default=95.0)
    p.add_argument("--out", default="baseline.json")
    _flow_args(p)
    p.set_defaults(func=cmd_baseline)

    p = sub.add_parser("detect", help="classify every window of one capture")
    p.add_argument("capture")
    p.add_argument("--baseline", required=True)
    p.add_argument("--window", type=int, help="default: the baseline's window size")
    p.add_argument("--features", nargs="+", default=list(DEFAULT_FEATURES))
    _flow_args(p)
    _fixed_args(p)
    p.set_defaults(func=cmd_detect)

    p = sub.add_parser("evaluate", help="detection rate / FPR on labelled captures")
    p.add_argument("--normal", nargs="+", required=True, help="normal test captures (not used for the baseline)")
    p.add_argument("--channel", nargs="+", required=True, help="timing-channel test captures")
    p.add_argument("--baseline")
    p.add_argument("--window", type=int)
    p.add_argument("--bits", help="bit string sent in every channel run, for decoding accuracy")
    p.add_argument("--features", nargs="+", default=list(DEFAULT_FEATURES))
    _flow_args(p)
    _fixed_args(p)
    p.set_defaults(func=cmd_evaluate)

    p = sub.add_parser("decode", help="decode bits from a timing-channel capture")
    p.add_argument("capture")
    p.add_argument("--threshold", type=float, default=1.0, help="gap >= threshold decodes as 1")
    p.add_argument("--bits", help="bits that were sent, to report decoding accuracy")
    _flow_args(p)
    p.set_defaults(func=cmd_decode)

    args = ap.parse_args(argv)
    try:
        args.func(args)
    except (ValueError, RuntimeError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
