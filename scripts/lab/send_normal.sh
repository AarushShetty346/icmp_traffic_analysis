#!/usr/bin/env bash
# Sender side: ordinary ping traffic, one Echo Request per second.
# usage: send_normal.sh DST_IP COUNT OUT_PREFIX --i-am-on-the-lab-testbed
# shellcheck source=scripts/lab/lib.sh
. "$(dirname "$0")/lib.sh"
[ $# -ge 3 ] || die "usage: send_normal.sh DST_IP COUNT OUT_PREFIX --i-am-on-the-lab-testbed"
dst=$1; count=$2; prefix=$3; shift 3
require_lab_flag "$@"
require_cmd ping
require_lab_ip "$dst"
mkdir -p "$(dirname "$prefix")"
"$(dirname "$0")/write_manifest.sh" "$prefix.manifest.json" normal role=sender tool=ping dst="$dst" count="$count" interval_s=1 payload_size=56
ping -i 1 -s 56 -c "$count" "$dst" | tee "$prefix.ping.log"
