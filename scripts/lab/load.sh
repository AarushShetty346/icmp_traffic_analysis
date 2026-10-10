#!/usr/bin/env bash
# Background load with iperf3 between two lab hosts.
# receiver: load.sh server                       (starts iperf3 -s as a daemon)
# sender:   load.sh start SERVER_IP MBPS SECONDS --i-am-on-the-lab-testbed
#           load.sh stop
# shellcheck source=scripts/lab/lib.sh
. "$(dirname "$0")/lib.sh"
require_cmd iperf3
case "${1:-}" in
  server) iperf3 -s -D && echo "iperf3 server running" ;;
  start)
    [ $# -ge 4 ] || die "usage: load.sh start SERVER_IP MBPS SECONDS --i-am-on-the-lab-testbed"
    require_lab_flag "${@:5}"
    require_lab_ip "$2"
    nohup iperf3 -c "$2" -b "${3}M" -t "$4" -u > /tmp/icmp_lab_iperf3.log 2>&1 &
    echo $! > /tmp/icmp_lab_iperf3.pid
    echo "iperf3 UDP load ${3} Mbit/s for ${4}s to $2 (pid $(cat /tmp/icmp_lab_iperf3.pid))" ;;
  stop)
    [ -f /tmp/icmp_lab_iperf3.pid ] && kill "$(cat /tmp/icmp_lab_iperf3.pid)" 2>/dev/null || true
    rm -f /tmp/icmp_lab_iperf3.pid; echo "load stopped" ;;
  *) die "usage: load.sh server | start SERVER_IP MBPS SECONDS --i-am-on-the-lab-testbed | stop" ;;
esac
