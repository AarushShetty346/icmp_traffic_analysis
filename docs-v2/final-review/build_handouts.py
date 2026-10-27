"""Render the final-review Markdown cards as ready-to-share PDFs.

Run from the project root: python docs-v2/final-review/build_handouts.py
Requires the local Python markdown/playwright packages and Microsoft Edge.
"""

from __future__ import annotations

from html import escape
from pathlib import Path

import markdown
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OUT = HERE / "handouts"
OUT.mkdir(exist_ok=True)
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")

FILES = [
    "START_HERE.md",
    "TEAM_CUE_CARD.md",
    "01_YOU.md",
    "02_HARSH.md",
    "03_AARUSH.md",
    "QUESTIONS_AND_ARCHITECTURE.md",
]

CSS = """
@page { size: A4; margin: 16mm 15mm 17mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #24302f; font-size: 10pt; line-height: 1.43; }
main { max-width: 100%; }
h1 { color: #143d43; font-size: 21pt; line-height: 1.15; margin: 0 0 13pt; padding-bottom: 8pt; border-bottom: 2px solid #00636d; }
h2 { color: #18444a; font-size: 13pt; margin: 18pt 0 6pt; break-after: avoid; }
h3 { color: #244348; font-size: 11pt; margin: 14pt 0 5pt; break-after: avoid; }
p { margin: 6pt 0; }
strong { color: #172d30; }
blockquote { margin: 7pt 0 9pt; padding: 7pt 10pt; background: #eef5f3; border-left: 3pt solid #00636d; break-inside: avoid; }
blockquote p { margin: 0; }
ul, ol { padding-left: 17pt; margin: 6pt 0; }
li { margin: 3pt 0; }
table { border-collapse: collapse; width: 100%; margin: 7pt 0 11pt; font-size: 8.5pt; }
thead { display: table-header-group; }
th { background: #e9f1ef; color: #173f44; text-align: left; }
th, td { border: 1px solid #ccd8d4; padding: 5pt 6pt; vertical-align: top; }
tr { break-inside: avoid; }
code { font-family: Consolas, 'Courier New', monospace; font-size: .93em; background: #f1f3f1; padding: 0 2pt; }
pre { white-space: pre-wrap; font: 8.4pt/1.35 Consolas, 'Courier New', monospace; background: #f3f5f4; border: 1px solid #d9e1de; padding: 8pt; break-inside: avoid; }
pre code { padding: 0; background: none; }
a { color: #00616b; text-decoration: underline; }
.packet { break-before: page; }
.packet:first-child { break-before: auto; }
.packet-label { color: #62736f; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; margin: 0 0 8pt; }
.cue { font-size: 10pt; }
.cue table { font-size: 9.6pt; }
.cue th, .cue td { padding: 5pt 6pt; }
"""


def rendered(name: str) -> str:
    source = (HERE / name).read_text(encoding="utf-8")
    return markdown.markdown(source, extensions=["tables", "fenced_code", "sane_lists"])


def document(body: str, title: str, body_class: str = "") -> str:
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        f"<title>{escape(title)}</title><style>{CSS}</style></head>"
        f"<body class='{body_class}'><main>{body}</main></body></html>"
    )


def footer() -> str:
    return (
        '<div style="width:100%;font:8px Segoe UI,Arial,sans-serif;'
        'color:#64716d;padding:0 15mm;display:flex;justify-content:space-between">'
        '<span>Cadence · final review handout</span>'
        '<span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
    )


def main() -> None:
    if not EDGE.exists():
        raise SystemExit(f"Microsoft Edge not found at {EDGE}")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=str(EDGE), headless=True)
        page = browser.new_page()
        for name in FILES:
            stem = Path(name).stem
            html = document(rendered(name), stem.replace("_", " "), "cue" if stem == "TEAM_CUE_CARD" else "")
            (OUT / f"{stem}.html").write_text(html, encoding="utf-8")
            page.set_content(html, wait_until="load")
            page.pdf(
                path=str(OUT / f"{stem}.pdf"), format="A4", landscape=stem == "TEAM_CUE_CARD",
                print_background=True, display_header_footer=True,
                header_template="<span></span>", footer_template=footer(),
                margin={"top": "16mm", "bottom": "17mm", "left": "15mm", "right": "15mm"},
            )
        combined = "".join(
            f'<section class="packet"><p class="packet-label">Team pack · {escape(name)}</p>{rendered(name)}</section>'
            for name in FILES if name != "TEAM_CUE_CARD.md"
        )
        html = document(combined, "Cadence — complete team pack")
        (OUT / "COMPLETE_TEAM_PACK.html").write_text(html, encoding="utf-8")
        page.set_content(html, wait_until="load")
        page.pdf(
            path=str(OUT / "COMPLETE_TEAM_PACK.pdf"), format="A4", print_background=True,
            display_header_footer=True, header_template="<span></span>", footer_template=footer(),
            margin={"top": "16mm", "bottom": "17mm", "left": "15mm", "right": "15mm"},
        )
        browser.close()
    print(f"Rendered {len(FILES)} individual PDFs and one complete team pack in {OUT}")


if __name__ == "__main__":
    main()
