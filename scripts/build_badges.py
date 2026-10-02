"""Cut the round badges (continents, animal categories, science, rock, water, ...) out of BGA's badge sheet.

img/zoo-card-badges.jpg (downloaded from BGA next to the maps; the vendored upstream repo's copy has a different order) is a 5 x 7 grid; BGA's stylesheet (`.badge-icon[data-type=...]`, background-size 500% 700%) says which cell is which badge:
column = background-position-x / 25, row = background-position-y / (100 / 6). Output: web/badges/<type>.webp (+ badges.json, the list of types).
Needs Pillow:  python scripts/build_badges.py
"""
import json
import re
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "vendor" / "card_sheets" / "zoo-card-badges.jpg"
SHEET_URL = "https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/img/zoo-card-badges.jpg"
OUT = ROOT / "web" / "badges"
CSS_URL = "https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/arknova.css"
COLS, ROWS = 5, 7


def main() -> None:
    css = urllib.request.urlopen(urllib.request.Request(CSS_URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf8", "replace")
    cells = {}
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        m = re.fullmatch(r"\s*\.badge-icon\[data-type=([\w-]+)\]\s*", sel)
        x = re.search(r"background-position-x:([\d.]+)(%?)", body)
        y = re.search(r"background-position-y:([\d.]+)(%?)", body)
        if m and x and y:
            cells[m.group(1)] = (round(float(x.group(1)) / 25), round(float(y.group(1)) / (100 / (ROWS - 1))))
    if not SHEET.exists():
        SHEET.parent.mkdir(parents=True, exist_ok=True)
        SHEET.write_bytes(urllib.request.urlopen(urllib.request.Request(SHEET_URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read())
    sheet = Image.open(SHEET).convert("RGBA")
    cw, ch = sheet.width / COLS, sheet.height / ROWS
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (c, r) in cells.items():
        sheet.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))).save(OUT / f"{name}.webp", quality=90)
    (OUT / "badges.json").write_text(json.dumps({n: list(v) for n, v in sorted(cells.items(), key=lambda kv: (kv[1][1], kv[1][0]))}, indent=4))
    print(f"saved {len(cells)} badges to {OUT}: {sorted(cells)}")


if __name__ == "__main__":
    main()
