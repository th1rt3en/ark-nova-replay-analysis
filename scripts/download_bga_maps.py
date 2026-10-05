"""Download the zoo map pictures from BGA into web/maps/map-<id>.jpg (1122x976, the hex board only).

Hex (x, y) is centred at (96 + 115 x, 88 + 66.5 y) in these pictures (web/js/replay.js uses the same numbers). A few maps (4a, 6a at the time of writing) are
not on BGA's server under that name; for those the picture is cut from the full board scan in the vendored upstream repo
(img/maps/plan<id>.jpg, hex (x, y) at (713.6 + 204.9 x, 235 + 118 y)) and resized to the same framing, so printed bonus icons are baked into it.

Needs Pillow:  python scripts/download_bga_maps.py
"""
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from ark_nova import data  # noqa: E402

BASE = "https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/img/maps/"
OUT = ROOT / "web" / "maps"
PLANS = ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public" / "img" / "maps"
SIZE = (1122, 976)
BGA = (96.0, 88.0, 115.0, 66.5)                  # x0, y0, dx, dy
VENDOR = (713.6, 235.0, 204.9, 118.0)


def from_plan(map_id: str) -> Image.Image:
    plan = Image.open(PLANS / f"plan{map_id}.jpg").convert("RGB")
    sx, sy = BGA[2] / VENDOR[2], BGA[3] / VENDOR[3]
    left, top = VENDOR[0] - BGA[0] / sx, VENDOR[1] - BGA[1] / sy
    return plan.crop((round(left), round(top), round(left + SIZE[0] / sx), round(top + SIZE[1] / sy))).resize(SIZE, Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for m in data.maps():
        mid = m["id"]
        if mid == "6a":                  # not used: the viewer shows map-6.jpg for 6a (same board; the 6a picture has the bonuses baked in)
            continue
        target = OUT / f"map-{mid}.jpg"
        try:
            req = urllib.request.Request(f"{BASE}map-{mid}.jpg", headers={"User-Agent": "Mozilla/5.0"})       # the default urllib agent gets a 403
            target.write_bytes(urllib.request.urlopen(req, timeout=60).read())
            print(f"map {mid}: downloaded")
        except urllib.error.HTTPError as e:
            print(f"map {mid}: BGA answered {e.code}, cutting it from the vendored board scan")
            from_plan(mid).save(target, quality=90)


if __name__ == "__main__":
    main()
