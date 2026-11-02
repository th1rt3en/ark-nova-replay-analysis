"""A copy of every map picture without its rock and water: the plain terrain only (the map pictures for Ark 960, where the rock and water hexes are random too).

    python scripts/build_blank_maps.py [--out web/maps_blank] [--check]       (run with the venv python: needs Pillow + numpy)

`web/maps/map-<id>.jpg` (1122 x 976) is the painted board of a map with its rock formations and ponds. This script takes the hexes that `data_manual/maps_geometry/<id>.json` marks as
`rock` or `water` and paints them over with the plain hexes of `web/map_editor/blank_map.png` (`scripts/build_blank_map.py`: 58 plain hexes, the same cell at the same place). The painted rocks
and the grass round a pond reach over the border of their hex, so the replaced area is the hexes grown by `grow` pixels (and feathered at the edge); `grow` is the smallest of the steps
below that leaves no rock / water coloured pixel behind (the hexes of special_hexes kind continent_area, the coloured areas of map 9, are left as painted). Everything else on the picture (the margin, the plain hexes, the lines) is the map's own. Nothing is painted onto the hexes: the
upgrade flags, the placement bonuses and the special spots are drawn by the viewer from the geometry, exactly as on the normal pictures.

Output: `web/maps_blank/map-<id>.jpg` for every map with a picture (map 6a uses the picture of map 6, like `PICTURE_OF` in `replay/view.py`), and `web/maps_blank/index.json` (the grow that was
used and the number of hexes replaced; grow 0 = the whole board of lank_map.png, see WHOLE_BOARD). `--check` only reports. The sprites to put a random rock / water hex back are `web/map_editor/hex_rock.png` and `hex_water.png`.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
W, H_IMG = 1122, 976
R = 115 / 1.5
HH = 133.0
GROWS = (14, 22, 30, 40, 52)
PICTURE_OF = {"6a": "6"}
WHOLE_BOARD = ("13",)        # map 13 paints a dark rim along the edges of the hexes next to its rock and water: patching the hexes would leave rims round nothing, so its blank is the plain board
                            # of lank_map.png as a whole (the margin is the cleanest map's, which looks like the map's own)


def centre(x, y):
    return 96 + 115 * x, 88 + 66.5 * y


def hex_points(cx, cy, grow=0.0):
    r, h = R + grow * 2 / 3 ** 0.5, HH + grow * 2
    return [(cx + r, cy), (cx + r / 2, cy + h / 2), (cx - r / 2, cy + h / 2), (cx - r, cy), (cx - r / 2, cy - h / 2), (cx + r / 2, cy - h / 2)]


def region(cells, grow):
    """The mask (0..1, float) of the given hexes grown by `grow` pixels, feathered."""
    m = Image.new("L", (W, H_IMG), 0)
    d = ImageDraw.Draw(m)
    for x, y in cells:
        cx, cy = centre(x, y)
        d.polygon(hex_points(cx, cy, grow), fill=255)
    return np.array(m.filter(ImageFilter.GaussianBlur(3))).astype(float) / 255


def odd_ones(img):
    """Boolean map of the pixels that look like painted rock (grey-violet) or water (blue)."""
    a = img.astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    water = (b > r + 45) & (b > g + 5)
    rock = (b >= r - 12) & (b > g + 12) & (abs(r - g) < 70) & (r > 70)
    return water | rock


KEEP_KINDS = ("continent_area",)       # hexes that are painted on purpose (map 9: the five coloured continent areas): never painted over, whatever lies next to them


def terrain_cells(map_id):
    geo = json.loads((ROOT / "data_manual" / "maps_geometry" / f"{map_id}.json").read_text(encoding="utf-8"))
    keep = [(s["x"], s["y"]) for s in geo["special_hexes"] if s["kind"] in KEEP_KINDS]
    return [(h["x"], h["y"]) for h in geo["hexes"] if h["terrain"] in ("rock", "water")], keep


def blank_one(map_id, blank):
    src = ROOT / "web" / "maps" / f"map-{PICTURE_OF.get(map_id, map_id)}.jpg"
    orig = np.array(Image.open(src).convert("RGB"))
    cells, keep = terrain_cells(map_id)
    if map_id in WHOLE_BOARD:
        return 0, blank.copy(), 0, len(cells)
    keepers = region(keep, -3) if keep else 0
    best = None
    for grow in GROWS:
        m = np.clip(region(cells, grow) - keepers, 0, 1)[..., None]
        out = (orig * (1 - m) + blank * m).round().astype(np.uint8)
        left = int((odd_ones(out) & ~(np.asarray(keepers) > 0.05).reshape(H_IMG, W)).sum()) if keep else int(odd_ones(out).sum())       # (the blue area of map 9 is not water)
        best = (grow, out, left)
        if left < 120:
            break
    return best[0], best[1], best[2], len(cells)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "web" / "maps_blank"))
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    blank = np.array(Image.open(ROOT / "web" / "map_editor" / "blank_map.png").convert("RGB"))
    out_dir = Path(args.out)
    if not args.check:
        out_dir.mkdir(parents=True, exist_ok=True)
    ids = sorted(p.stem for p in (ROOT / "data_manual" / "maps_geometry").glob("*.json"))
    index = {}
    for map_id in ids:
        if not (ROOT / "web" / "maps" / f"map-{PICTURE_OF.get(map_id, map_id)}.jpg").exists():
            print(f"{map_id}: no picture, skipped")
            continue
        grow, img, left, n = blank_one(map_id, blank)
        index[map_id] = {"hexes_replaced": n, "grow": grow, "odd_pixels_left": left}
        print(f"{map_id:>3}: {n:2d} rock / water hexes, grow {grow:2d} px, {left} rock / water coloured pixels left")
        if not args.check:
            Image.fromarray(img).save(out_dir / f"map-{map_id}.jpg", quality=92, optimize=True)
    if not args.check:
        (out_dir / "index.json").write_text(json.dumps(index, indent=4) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
