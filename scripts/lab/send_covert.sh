#!/usr/bin/env bash
# Sender side: controlled timing-channel stream with the Scapy generator (needs root).
# usage: sudo send_covert.sh DST_IP BITS GAP0 GAP1 OUT_PREFIX --i-am-on-the-lab-testbed
# example: sudo send_covert.sh 10.0.0.2 0101100101 0.95 1.05 runs/covert_r01 --i-am-on-the-lab-testbed
# shellcheck source=scripts/lab/lib.sh
. "$(dirname "$0")/lib.sh"
[ $# -ge 5 ] || die "usage: send_covert.sh DST_IP BITS GAP0 GAP1 OUT_PREFIX --i-am-on-the-lab-testbed"
dst=$1; bits=$2; gap0=$3; gap1=$4; prefix=$5; shift 5
require_lab_flag "$@"
require_root
require_lab_ip "$dst"
mkdir -p "$(dirname "$prefix")"
cd "$LAB_ROOT" || die "cannot enter $LAB_ROOT"
python3 -m icmp_detector generate covert --dst "$dst" --bits "$bits" --gap0 "$gap0" --gap1 "$gap1" \
  --manifest "$prefix.manifest.json" --i-am-on-the-lab-testbed
