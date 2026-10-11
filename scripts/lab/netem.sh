#!/usr/bin/env bash
# Apply a tc netem profile to an interface's egress (run on the sender, or on the lab router).
# usage: sudo netem.sh IFACE PROFILE    PROFILE: clean jitter10 jitter20 jitter50 jitter100 jitter150
#                                                loss2 loss5 loss10 jitter50_loss5
#        sudo netem.sh IFACE clear | show
# Note: netem jitter can reorder packets, like the simulator's "netem" delay model.
# shellcheck source=scripts/lab/lib.sh
. "$(dirname "$0")/lib.sh"
[ $# -eq 2 ] || die "usage: netem.sh IFACE PROFILE|clear|show"
iface=$1; profile=$2
require_cmd tc
case "$profile" in
  show) tc qdisc show dev "$iface"; exit 0 ;;
  clear) require_root; tc qdisc del dev "$iface" root 2>/dev/null || true; echo "cleared $iface"; exit 0 ;;
  clean) args="delay 1ms" ;;
  jitter10) args="delay 1ms 10ms distribution normal" ;;
  jitter20) args="delay 1ms 20ms distribution normal" ;;
  jitter50) args="delay 1ms 50ms distribution normal" ;;
  jitter100) args="delay 1ms 100ms distribution normal" ;;
  jitter150) args="delay 1ms 150ms distribution normal" ;;
  loss2) args="delay 1ms loss 2%" ;;
  loss5) args="delay 1ms loss 5%" ;;
  loss10) args="delay 1ms loss 10%" ;;
  jitter50_loss5) args="delay 1ms 50ms distribution normal loss 5%" ;;
  *) die "unknown profile '$profile'" ;;
esac
require_root
# shellcheck disable=SC2086
tc qdisc replace dev "$iface" root netem $args
echo "$iface: netem $args"
tc qdisc show dev "$iface"
