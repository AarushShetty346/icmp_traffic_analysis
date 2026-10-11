#!/usr/bin/env bash
# Receiver side: capture the sender's Echo Requests for a fixed time, then export the CSV.
# usage: sudo capture.sh IFACE SENDER_IP OUT_PREFIX DURATION_S [label=normal|covert] [netem=PROFILE] [load=MBPS]
# writes OUT_PREFIX.pcapng, OUT_PREFIX.csv (via export_csv.sh) and OUT_PREFIX.manifest.json
# shellcheck source=scripts/lab/lib.sh
. "$(dirname "$0")/lib.sh"
[ $# -ge 4 ] || die "usage: capture.sh IFACE SENDER_IP OUT_PREFIX DURATION_S [key=value ...]"
iface=$1; sender=$2; prefix=$3; duration=$4; shift 4
require_cmd tshark
require_lab_ip "$sender"
mkdir -p "$(dirname "$prefix")"
echo "capturing Echo Requests from $sender on $iface for ${duration}s -> $prefix.pcapng"
tshark -i "$iface" -f "icmp and src host $sender and icmp[icmptype] == icmp-echo" \
  -a "duration:$duration" -w "$prefix.pcapng" -q
"$(dirname "$0")/export_csv.sh" "$prefix.pcapng" "$prefix.csv"
"$(dirname "$0")/write_manifest.sh" "$prefix.manifest.json" capture role=receiver iface="$iface" \
  sender="$sender" duration_s="$duration" pcap="$prefix.pcapng" csv="$prefix.csv" "$@"
