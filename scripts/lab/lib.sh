#!/usr/bin/env bash
# Shared helpers for the lab scripts. Source it; do not run it.
# These scripts are for the closed lab testbed only.
set -euo pipefail

LAB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export LAB_ROOT

die() { echo "error: $*" >&2; exit 1; }

require_cmd() {
  for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "'$c' is not installed"; done
}

require_root() {
  [ "$(id -u)" = 0 ] || die "this step needs root (run with sudo)"
}

# Refuse anything that is not a private (RFC 1918 / RFC 4193) unicast address.
require_lab_ip() {
  python3 - "$1" <<'PY' || die "$1 is not a private lab address; these scripts only target the closed testbed"
import ipaddress, sys
ip = ipaddress.ip_address(sys.argv[1])
nets = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")]
ok = any(ip in n for n in nets if n.version == ip.version) and not ip.is_multicast
sys.exit(0 if ok else 1)
PY
}

# The confirmation flag every sending script requires.
require_lab_flag() {
  for a in "$@"; do [ "$a" = "--i-am-on-the-lab-testbed" ] && return 0; done
  die "pass --i-am-on-the-lab-testbed to confirm this runs on the closed lab testbed"
}
