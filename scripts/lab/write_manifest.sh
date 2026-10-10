#!/usr/bin/env bash
# Write a run manifest: who, when, where, what, and the repo commit.
# usage: write_manifest.sh OUT.json KIND key=value [key=value ...]
#   KIND: normal | covert | capture | netem | load | export
# example: write_manifest.sh runs/r01.manifest.json capture role=receiver iface=eth1 sender=10.0.0.1 netem=jitter20
# shellcheck source=scripts/lab/lib.sh
. "$(dirname "$0")/lib.sh"
[ $# -ge 2 ] || die "usage: write_manifest.sh OUT.json KIND key=value ..."
out=$1; kind=$2; shift 2
python3 - "$out" "$kind" "$LAB_ROOT" "$@" <<'PY'
import datetime, getpass, json, os, socket, subprocess, sys
out, kind, root, *pairs = sys.argv[1:]
def git(*args):
    try:
        return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=5).stdout.strip() or None
    except Exception:
        return None
params = {}
for p in pairs:
    k, _, v = p.partition("=")
    params[k] = v
data = {
    "kind": kind,
    "schema": 1,
    "simulated": False,
    "written_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "user": os.environ.get("SUDO_USER") or getpass.getuser(),
    "host": socket.gethostname(),
    "commit": git("rev-parse", "HEAD"),
    "dirty": bool(git("status", "--porcelain")),
    "params": params,
}
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
with open(out, "w") as f:
    json.dump(data, f, indent=1)
print(f"wrote {out}")
PY
