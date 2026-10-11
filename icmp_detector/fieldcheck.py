"""Compare packet fields between normal and covert captures.

The detector only looks at timing. If the covert sender also differs in some
other field (TTL, IP id pattern, payload size or bytes, flags), a much simpler
detector would catch it, and the timing results would overstate how hidden the
channel is. This module lists those differences so they are documented rather
than assumed away.

Input: pcap/pcapng (needs Scapy) or a tshark CSV with the extra fields::

    tshark -r capture.pcap -Y "icmp.type == 8" -T fields \\
        -e frame.time_epoch -e ip.src -e ip.dst -e icmp.ident -e icmp.seq \\
        -e ip.ttl -e ip.id -e ip.flags -e ip.dsfield -e ip.len -e icmp.code -e data.len -e data.data \\
        -E header=y -E separator=, > capture.csv
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .capture import parse_int

CSV_FIELDS = {
    "frame.time_epoch": "time",
    "ip.src": "src",
    "ip.dst": "dst",
    "icmp.ident": "ident",
    "icmp.seq": "seq",
    "ip.ttl": "ttl",
    "ip.id": "ip_id",
    "ip.flags": "ip_flags",
    "ip.dsfield": "tos",
    "ip.len": "ip_len",
    "icmp.code": "icmp_code",
    "data.len": "payload_len",
    "data.data": "payload_hex",
}
# Fields whose set of values should match between normal and covert traffic.
CONSTANT_FIELDS = ("ttl", "ip_flags", "tos", "ip_len", "icmp_code", "payload_len")
# Fields compared by how they change from one packet to the next.
PATTERN_FIELDS = ("ip_id", "seq")
# Leading payload bytes that legitimately change per packet (ping's timestamp).
TIMESTAMP_BYTES = 16


def read_fields(path: str | Path, src: str | None = None, dst: str | None = None) -> pd.DataFrame:
    """Per-packet header fields of the Echo Requests in a capture."""
    path = Path(path)
    if path.suffix.lower() in (".pcap", ".pcapng", ".cap"):
        df = _read_pcap_fields(path)
    else:
        raw = pd.read_csv(path, dtype={"data.data": str})
        df = raw.rename(columns={c: CSV_FIELDS[c] for c in raw.columns if c in CSV_FIELDS})
        for col in ("ident", "seq", "ttl", "ip_id", "ip_flags", "tos", "ip_len", "icmp_code", "payload_len"):
            if col in df.columns:
                df[col] = df[col].map(parse_int)
        if "payload_hex" in df.columns:
            df["payload_hex"] = df["payload_hex"].fillna("").astype(str).str.replace(":", "")
    if src is not None and "src" in df.columns:
        df = df[df["src"] == src]
    if dst is not None and "dst" in df.columns:
        df = df[df["dst"] == dst]
    if "time" in df.columns:
        df = df.sort_values("time")
    return df.reset_index(drop=True)


def _read_pcap_fields(path: Path) -> pd.DataFrame:
    try:
        from scapy.all import ICMP, IP, Raw, rdpcap  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise RuntimeError("reading pcap files needs scapy (pip install scapy), or export a CSV with tshark") from exc
    rows = []
    for pkt in rdpcap(str(path)):
        if IP in pkt and ICMP in pkt and pkt[ICMP].type == 8:
            data = bytes(pkt[Raw].load) if Raw in pkt else b""
            rows.append(
                {
                    "time": float(pkt.time),
                    "src": pkt[IP].src,
                    "dst": pkt[IP].dst,
                    "ident": int(pkt[ICMP].id),
                    "seq": int(pkt[ICMP].seq),
                    "ttl": int(pkt[IP].ttl),
                    "ip_id": int(pkt[IP].id),
                    "ip_flags": int(pkt[IP].flags),
                    "tos": int(pkt[IP].tos),
                    "ip_len": int(pkt[IP].len),
                    "icmp_code": int(pkt[ICMP].code),
                    "payload_len": len(data),
                    "payload_hex": data.hex(),
                }
            )
    return pd.DataFrame(rows)


def _pattern(values: pd.Series) -> dict:
    """How a counter moves between packets: constant, +1, other small steps, or scattered."""
    v = pd.to_numeric(values, errors="coerce").dropna().to_numpy(dtype=float)
    if len(v) < 2:
        return {"pattern": "too few packets", "step_plus_one": None}
    d = np.diff(v)
    plus_one = float(np.mean(d == 1))
    zero = float(np.mean(d == 0))
    if zero == 1.0:
        pattern = "constant"
    elif plus_one >= 0.9:
        pattern = "increments by 1"
    elif np.all(np.abs(d) < 1024):
        pattern = "small steps"
    else:
        pattern = "scattered"
    return {"pattern": pattern, "step_plus_one": plus_one, "step_zero": zero}


def _values(values: pd.Series) -> list:
    counts = values.value_counts()
    return [{"value": _plain(k), "count": int(c)} for k, c in counts.head(5).items()]


def _plain(v):
    return v.item() if hasattr(v, "item") else v


def _payload_summary(hex_values: pd.Series) -> dict:
    data = [bytes.fromhex(h) if isinstance(h, str) else b"" for h in hex_values]
    static = {hashlib.sha256(d[TIMESTAMP_BYTES:]).hexdigest()[:12] for d in data}
    whole = {hashlib.sha256(d).hexdigest()[:12] for d in data}
    return {
        "distinct_payloads": len(whole),
        "distinct_after_timestamp": len(static),
        "after_timestamp_hashes": sorted(static)[:5],
    }


def describe(df: pd.DataFrame) -> dict:
    out = {"packets": int(len(df))}
    for name in CONSTANT_FIELDS:
        if name in df.columns:
            out[name] = {"values": _values(df[name])}
    for name in PATTERN_FIELDS:
        if name in df.columns:
            out[name] = _pattern(df[name])
    if "ident" in df.columns:
        out["ident"] = {"distinct": int(df["ident"].nunique())}
    if "payload_hex" in df.columns:
        out["payload"] = _payload_summary(df["payload_hex"])
    return out


def compare(normal: pd.DataFrame, covert: pd.DataFrame) -> dict:
    """Field-by-field comparison. Each row says whether the field could give the sender away."""
    a, b = describe(normal), describe(covert)
    rows = []
    for name in CONSTANT_FIELDS:
        if name in a and name in b:
            va = {x["value"] for x in a[name]["values"]}
            vb = {x["value"] for x in b[name]["values"]}
            differs = va != vb
            rows.append(
                {
                    "field": name,
                    "normal": sorted(map(str, va)),
                    "covert": sorted(map(str, vb)),
                    "differs": differs,
                    "note": "values differ" if differs else "same values",
                }
            )
        else:
            rows.append(_missing(name, a, b))
    for name in PATTERN_FIELDS:
        if name in a and name in b:
            differs = a[name]["pattern"] != b[name]["pattern"]
            rows.append(
                {
                    "field": name,
                    "normal": a[name]["pattern"],
                    "covert": b[name]["pattern"],
                    "differs": differs,
                    "note": "counter behaves differently" if differs else "same behaviour",
                }
            )
        else:
            rows.append(_missing(name, a, b))
    if "payload" in a and "payload" in b:
        ha, hb = set(a["payload"]["after_timestamp_hashes"]), set(b["payload"]["after_timestamp_hashes"])
        differs = ha != hb
        rows.append(
            {
                "field": "payload bytes (after first 16)",
                "normal": f"{a['payload']['distinct_after_timestamp']} distinct",
                "covert": f"{b['payload']['distinct_after_timestamp']} distinct",
                "differs": differs,
                "note": "payload content differs" if differs else "same payload content",
            }
        )
    else:
        rows.append(_missing("payload bytes (after first 16)", a, b))
    return {
        "normal": a,
        "covert": b,
        "rows": rows,
        "differences": [r["field"] for r in rows if r["differs"]],
        "checked": [r["field"] for r in rows if r["differs"] is not None],
    }


def _missing(name: str, a: dict, b: dict) -> dict:
    key = "payload" if name.startswith("payload bytes") else name
    where = [side for side, d in (("normal", a), ("covert", b)) if key not in d]
    return {
        "field": name,
        "normal": None,
        "covert": None,
        "differs": None,
        "note": f"not in the {' and '.join(where)} capture; export it to check",
    }


def markdown(report: dict) -> str:
    lines = [
        "| field | normal | covert | differs | note |",
        "|---|---|---|---|---|",
    ]
    for r in report["rows"]:
        flag = "?" if r["differs"] is None else ("**yes**" if r["differs"] else "no")
        lines.append(f"| {r['field']} | {r['normal']} | {r['covert']} | {flag} | {r['note']} |")
    return "\n".join(lines)


def write_report(report: dict, path: str | Path) -> Path:
    path = Path(path)
    path.write_text(json.dumps(report, indent=1, default=str))
    return path
