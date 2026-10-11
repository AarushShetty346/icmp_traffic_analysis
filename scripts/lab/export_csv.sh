#!/usr/bin/env bash
# Export Echo Requests from a capture to the CSV layout icmp_detector reads.
# The first five fields are the ones the detector needs (same command as the README);
# the rest feed the packet-field check (python -m icmp_detector fieldcheck).
# usage: export_csv.sh IN.pcap[ng] OUT.csv
# shellcheck source=scripts/lab/lib.sh
. "$(dirname "$0")/lib.sh"
[ $# -eq 2 ] || die "usage: export_csv.sh IN.pcap OUT.csv"
require_cmd tshark
tshark -r "$1" -Y "icmp.type == 8" -T fields \
  -e frame.time_epoch -e ip.src -e ip.dst -e icmp.ident -e icmp.seq \
  -e ip.ttl -e ip.id -e ip.flags -e ip.dsfield -e ip.len -e icmp.code -e data.len -e data.data \
  -E header=y -E separator=, > "$2"
echo "wrote $2 ($(($(wc -l < "$2") - 1)) Echo Requests)"
