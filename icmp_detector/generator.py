"""Controlled ICMP Echo Request sender for the closed lab testbed (Review 1, module A).

This is the real counterpart of ``simulate.py``: it sends Echo Requests with
Scapy and records when each one left, so receiver captures can be scored
against what was intended.

Safety guards (all enforced before anything is sent):

* ``--i-am-on-the-lab-testbed`` must be given explicitly;
* the destination must be a private address (RFC 1918 / RFC 4193), never a
  public, multicast or unspecified one;
* sending needs root (raw sockets); ``--dry-run`` writes the schedule and
  manifest without sending and without root.

Every packet in one stream keeps the same ICMP identifier, payload size, TTL
and payload layout; only the gap before it changes. Bit ``i`` is carried by the
gap between request ``i`` and ``i + 1`` (gap0 for 0, gap1 for 1), matching
``metrics.decode_bits``.
"""

from __future__ import annotations

import datetime as _dt
import getpass
import ipaddress
import json
import os
import socket
import struct
import subprocess
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

LAB_FLAG = "--i-am-on-the-lab-testbed"
PAYLOAD_KINDS = ("ping-like", "zeros")


class GuardError(RuntimeError):
    """Raised when a safety guard refuses to send."""


@dataclass
class GeneratorConfig:
    dst: str
    mode: str = "covert"  # "covert" or "normal"
    bits: str = ""
    count: int = 64  # Echo Requests in normal mode; covert mode sends len(bits) + 1
    gap0: float = 0.75
    gap1: float = 1.25
    nominal: float = 1.0
    ident: int = 0x4C42
    payload_size: int = 56  # bytes after the ICMP header, like ping's default
    payload_kind: str = "ping-like"
    ttl: int = 64
    start_seq: int = 1
    iface: str | None = None
    extra: dict = field(default_factory=dict)

    def validate(self) -> None:
        if self.mode not in ("covert", "normal"):
            raise ValueError("mode must be 'covert' or 'normal'")
        if self.mode == "covert":
            if not self.bits or set(self.bits) - {"0", "1"}:
                raise ValueError("covert mode needs --bits made of 0s and 1s")
            if not 0 < self.gap0 < self.gap1:
                raise ValueError("need 0 < gap0 < gap1")
        elif self.count < 2:
            raise ValueError("normal mode needs --count of at least 2")
        if self.nominal <= 0:
            raise ValueError("nominal interval must be positive")
        if not 0 <= self.ident <= 0xFFFF:
            raise ValueError("ICMP identifier must fit in 16 bits")
        if self.payload_kind not in PAYLOAD_KINDS:
            raise ValueError(f"payload kind must be one of {PAYLOAD_KINDS}")
        if self.payload_kind == "ping-like" and self.payload_size < 16:
            raise ValueError("ping-like payload needs at least 16 bytes for the timestamp")
        if not 1 <= self.ttl <= 255:
            raise ValueError("TTL must be 1..255")


def check_destination(dst: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address:
    """Refuse anything that is not a private unicast address."""
    try:
        ip = ipaddress.ip_address(dst)
    except ValueError as exc:
        raise GuardError(f"{dst!r} is not an IP address; give the lab receiver's address, not a host name") from exc
    if ip.is_multicast or ip.is_unspecified or ip.is_loopback:
        raise GuardError(f"{ip} is not a lab host address")
    lab_ranges = (
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("fc00::/7"),
    )
    if not any(ip in net for net in lab_ranges if net.version == ip.version):
        raise GuardError(f"{ip} is not a private (RFC 1918 / RFC 4193) address; the generator only sends inside the lab")
    if ip.version == 4 and int(ip) & 0xFF == 0xFF:
        raise GuardError(f"{ip} looks like a broadcast address")
    return ip


def check_guards(cfg: GeneratorConfig, lab_confirmed: bool, dry_run: bool) -> None:
    if not lab_confirmed:
        raise GuardError(f"refusing to send: pass {LAB_FLAG} to confirm this runs on the closed lab testbed")
    check_destination(cfg.dst)
    if not dry_run and hasattr(os, "geteuid") and os.geteuid() != 0:
        raise GuardError("sending raw ICMP needs root; run with sudo, or use --dry-run to only write the schedule")


def schedule(cfg: GeneratorConfig) -> tuple[np.ndarray, list[int | None]]:
    """Intended send offsets in seconds from the first request, and the bit each gap carries."""
    if cfg.mode == "covert":
        bits = [int(b) for b in cfg.bits]
        gaps = np.array([cfg.gap1 if b else cfg.gap0 for b in bits], dtype=float)
        carried: list[int | None] = bits + [None]
    else:
        gaps = np.full(cfg.count - 1, cfg.nominal, dtype=float)
        carried = [None] * cfg.count
    return np.concatenate([[0.0], np.cumsum(gaps)]), carried


def payload(cfg: GeneratorConfig, sent_epoch: float) -> bytes:
    """Payload bytes; "ping-like" mimics Linux ping (timeval, then 0x10, 0x11, ...)."""
    if cfg.payload_kind == "zeros":
        return bytes(cfg.payload_size)
    sec = int(sent_epoch)
    usec = int(round((sent_epoch - sec) * 1e6)) % 1_000_000
    head = struct.pack("<qq", sec, usec)
    tail = bytes((0x10 + i) & 0xFF for i in range(cfg.payload_size - len(head)))
    return head + tail


def git_commit(root: Path | None = None) -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root or Path(__file__).resolve().parent.parent,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None


def _scapy_sender(cfg: GeneratorConfig) -> Callable[[int, bytes], None]:  # pragma: no cover - needs root
    try:
        from scapy.all import ICMP, IP, IPv6, Raw, conf  # type: ignore
        from scapy.layers.inet6 import ICMPv6EchoRequest  # type: ignore
    except ImportError as exc:
        raise RuntimeError("the generator needs scapy (pip install scapy)") from exc
    ip = ipaddress.ip_address(cfg.dst)
    sock = conf.L3socket6(iface=cfg.iface) if ip.version == 6 else conf.L3socket(iface=cfg.iface)

    def send(seq: int, data: bytes) -> None:
        if ip.version == 6:
            pkt = IPv6(dst=cfg.dst, hlim=cfg.ttl) / ICMPv6EchoRequest(id=cfg.ident, seq=seq) / Raw(data)
        else:
            pkt = IP(dst=cfg.dst, ttl=cfg.ttl) / ICMP(type=8, code=0, id=cfg.ident, seq=seq) / Raw(data)
        sock.send(pkt)

    return send


def run(
    cfg: GeneratorConfig,
    lab_confirmed: bool = False,
    dry_run: bool = False,
    sender: Callable[[int, bytes], None] | None = None,
    clock: Callable[[], float] = time.perf_counter,
    wall: Callable[[], float] = time.time,
    sleep: Callable[[float], None] = time.sleep,
) -> dict:
    """Send one stream (or only plan it with ``dry_run``) and return its manifest."""
    cfg.validate()
    check_guards(cfg, lab_confirmed, dry_run)
    offsets, carried = schedule(cfg)
    if not dry_run and sender is None:
        sender = _scapy_sender(cfg)
    packets = []
    started_epoch = wall()
    t0 = clock()
    for i, (offset, bit) in enumerate(zip(offsets, carried)):
        seq = (cfg.start_seq + i) & 0xFFFF
        if dry_run:
            sent = started_epoch + float(offset)
        else:
            target = t0 + float(offset)
            while (remaining := target - clock()) > 0.002:
                sleep(remaining - 0.002)
            while clock() < target:  # spin for the last couple of milliseconds
                pass
            sent = wall()
            sender(seq, payload(cfg, sent))
        packets.append({"seq": seq, "bit": bit, "intended_s": float(offset), "sent_epoch": sent})
    return manifest(cfg, packets, started_epoch, dry_run)


def manifest(cfg: GeneratorConfig, packets: list[dict], started_epoch: float, dry_run: bool) -> dict:
    sent = np.array([p["sent_epoch"] for p in packets])
    intended = np.array([p["intended_s"] for p in packets]) + started_epoch
    error = sent - intended
    return {
        "kind": "generator",
        "schema": 1,
        "dry_run": dry_run,
        "simulated": False,
        "started_at": _dt.datetime.fromtimestamp(started_epoch, _dt.timezone.utc).isoformat(),
        "host": socket.gethostname(),
        "user": getpass.getuser(),
        "commit": git_commit(),
        "config": asdict(cfg),
        "send_error_s": {
            "mean": float(error.mean()),
            "max_abs": float(np.abs(error).max()),
        },
        "packets": packets,
    }


def write_manifest(data: dict, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1))
    return path
