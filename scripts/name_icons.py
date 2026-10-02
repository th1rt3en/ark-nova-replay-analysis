"""Give the icons cut by build_icons.py their BGA names (web/icons/names.json: BGA icon name -> icon id such as r4c9).

BGA's stylesheet (arknova.css, same folder as the maps) defines `.arknova-icon.icon-<name>` with the position of the icon on the sheet in percent
(background-position / background-size, a 60x60 window), so the window on the 2048x2048 sheet is
    w = 204800 / size%,  x = pos_x% * (2048 - w) / 100,  y = pos_y% * (2048 - w) / 100.
The icon whose rectangle (web/icons/icons.json "pos" + "size") lies mostly inside the window gets the name. Run build_icons.py first.
Optionally pass a local copy of the stylesheet:  python scripts/name_icons.py [arknova.css]
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "web" / "icons"
CSS_URL = "https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/arknova.css"
SHEET = 2048


def main() -> None:
    if len(sys.argv) > 1:
        css = Path(sys.argv[1]).read_text(encoding="utf8", errors="replace")
    else:
        css = urllib.request.urlopen(urllib.request.Request(CSS_URL, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf8", "replace")
    icons = json.loads((ICONS / "icons.json").read_text())
    names = {}
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        for one in sel.split(","):
            m = re.fullmatch(r"\s*\.arknova-icon\.icon-([\w-]+)\s*", one)
            pos = re.search(r"background-position:([\d.]+)%\s+([\d.]+)%", body)
            size = re.search(r"background-size:([\d.]+)%", body)
            if not (m and pos and size):
                continue
            w = 204800 / float(size.group(1))
            x, y = float(pos.group(1)) / 100 * (SHEET - w), float(pos.group(2)) / 100 * (SHEET - w)
            best, best_overlap = None, 0.5
            for icon_id, v in icons.items():
                ix, iy = v["pos"]
                iw, ih = v["size"]
                overlap = max(0, min(x + w, ix + iw) - max(x, ix)) * max(0, min(y + w, iy + ih) - max(y, iy)) / (iw * ih)
                if overlap > best_overlap:
                    best, best_overlap = icon_id, overlap
            if best:
                names[m.group(1)] = best
    (ICONS / "names.json").write_text(json.dumps(dict(sorted(names.items())), indent=4))
    print(f"named {len(names)} icons -> {ICONS / 'names.json'}")


if __name__ == "__main__":
    main()
