"""Embed study results into the dashboard page.

    python -m icmp_detector study --out results
    python scripts/build_site.py            # writes docs/index.html

``--fragment PATH`` also writes the page body without the HTML skeleton.
"""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>
</head>
<body>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default=ROOT / "results" / "results.json")
    ap.add_argument("--out", default=ROOT / "docs" / "index.html")
    ap.add_argument("--fragment")
    args = ap.parse_args()
    study = json.loads(Path(args.results).read_text())
    keep = {k: study[k] for k in ("simulated", "config", "baseline", "results", "decoding_accuracy")}
    data = json.dumps(keep, separators=(",", ":")).replace("</", "<\\/")
    page = (ROOT / "site" / "template.html").read_text().replace("__STUDY_JSON__", data)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(HEAD + page + "\n</body>\n</html>\n")
    print(f"wrote {out}")
    if args.fragment:
        Path(args.fragment).write_text(page)
        print(f"wrote {args.fragment}")


if __name__ == "__main__":
    main()
