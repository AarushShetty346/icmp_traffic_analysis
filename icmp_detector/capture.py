"""Load receiver-side ICMP Echo Request timestamps.

Two input formats are supported:

* CSV exported by tshark (recommended, no extra dependencies)::

    tshark -r capture.pcap -Y "icmp.type == 8" -T fields \\
        -e frame.time_epoch -e ip.src -e ip.dst -e icmp.ident -e icmp.seq \\
        -E header=y -E separator=, > capture.csv

  Any CSV with a ``frame.time_epoch`` (or ``time``) column works; the other
  columns are optional and only used for flow filtering and decoding.

* pcap / pcapng files, read with Scapy if it is installed.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

TIME_COLUMNS = ("frame.time_epoch", "time", "timestamp")
COLUMN_ALIASES = {
    "ip.src": "src",
    "ip.dst": "dst",
    "icmp.ident": "ident",
    "icmp.seq": "seq",
    "icmp.seq_le": "seq",
}


@dataclass
class Flow:
    """One filtered ICMP Echo Request flow, sorted by arrival time."""

    times: np.ndarray  # arrival timestamps in seconds
    seq: np.ndarray | None = None  # ICMP sequence numbers, if known
    label: str = ""

    def __len__(self) -> int:
        return len(self.times)


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={c: COLUMN_ALIASES.get(c, c) for c in df.columns})
    for col in TIME_COLUMNS:
        if col in df.columns:
            df = df.rename(columns={col: "time"})
            break
    else:
        raise ValueError(f"no timestamp column found; expected one of {TIME_COLUMNS}")
    if "seq" in df.columns:
        # tshark prints "seq (BE)" style values for some builds, e.g. "1/256".
        df["seq"] = pd.to_numeric(df["seq"].astype(str).str.split("/").str[0], errors="coerce")
    if "ident" in df.columns:
        df["ident"] = df["ident"].astype(str).str.split("/").str[0]
        df["ident"] = df["ident"].map(lambda v: int(v, 0) if v.startswith("0x") else v)
    return df


def _read_pcap(path: Path) -> pd.DataFrame:
    try:
        from scapy.all import ICMP, IP, rdpcap  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise RuntimeError(
            "reading pcap files needs scapy (pip install scapy); "
            "alternatively export a CSV with tshark, see icmp_detector/capture.py"
        ) from exc
    rows = []
    for pkt in rdpcap(str(path)):
        if IP in pkt and ICMP in pkt and pkt[ICMP].type == 8:
            rows.append(
                {
                    "time": float(pkt.time),
                    "src": pkt[IP].src,
                    "dst": pkt[IP].dst,
                    "ident": int(pkt[ICMP].id),
                    "seq": int(pkt[ICMP].seq),
                }
            )
    return pd.DataFrame(rows, columns=["time", "src", "dst", "ident", "seq"])


def load_flow(
    path: str | Path,
    src: str | None = None,
    dst: str | None = None,
    ident: int | None = None,
    label: str = "",
) -> Flow:
    """Load one Echo Request flow from a CSV or pcap file and filter it."""
    path = Path(path)
    if path.suffix.lower() in (".pcap", ".pcapng", ".cap"):
        df = _read_pcap(path)
    else:
        df = _normalise(pd.read_csv(path))
    if "icmp.type" in df.columns:
        df = df[df["icmp.type"] == 8]
    if src is not None and "src" in df.columns:
        df = df[df["src"] == src]
    if dst is not None and "dst" in df.columns:
        df = df[df["dst"] == dst]
    if ident is not None and "ident" in df.columns:
        df = df[df["ident"].astype(str) == str(ident)]
    df = df.sort_values("time")
    if len(df) < 2:
        raise ValueError(f"{path}: fewer than 2 Echo Requests left after filtering")
    seq = df["seq"].to_numpy(dtype=float) if "seq" in df.columns else None
    if seq is not None and np.isnan(seq).any():
        seq = None
    return Flow(df["time"].to_numpy(dtype=float), seq, label or path.stem)


def save_flow(flow: Flow, path: str | Path) -> None:
    """Write a flow in the same CSV layout tshark produces."""
    data = {"frame.time_epoch": flow.times}
    if flow.seq is not None:
        data["icmp.seq"] = flow.seq.astype(int)
    pd.DataFrame(data).to_csv(path, index=False, float_format="%.6f")
