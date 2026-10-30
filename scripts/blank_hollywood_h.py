"""Take the H letters of the Hollywood maps (8 and 8a) off the map pictures and cut one of them out as a sprite:

    python scripts/blank_hollywood_h.py [--check]       (run with the venv python: needs Pillow + numpy + scipy)

The H hexes are placement bonuses of a special kind (`hollywood_h`, no yellow pentagon): the viewer draws them on top of the board from the geometry (or, in an Ark360 game, from the
player's layout), so the pictures `web/maps/map-8.jpg` / `map-8a.jpg` must show empty hexes there. Each H hex is replaced by the same hex of `web/map_editor/blank_map.png`
(`scripts/build_blank_map.py`); the sprite `web/bonus/hollywood_h.webp` is the H sign (white board, black outline, legs) cut out of the first picture before it is blanked. The script
reads the H cells from `data_manual/maps_geometry/<id>.json` (`special_hexes` of the kind `hollywood_h`) and can be run again: a picture without an H at those hexes is left as it is.
`--check` only reports.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
R = 115 / 1.5
HH = 133.0
SPRITE = ROOT / "web" / "bonus" / "hollywood_h.webp"


def centre(x, y):
    return 96 + 115 * x, 88 + 66.5 * y


def hexagon(cx, cy, grow=0.0):
    from PIL import ImageDraw
    ss = 4
    m = Image.new("L", (1122 * ss, 976 * ss), 0)
    r, h = R + grow * 2 / 3 ** 0.5, HH + grow * 2
    pts = [(cx + r, cy), (cx + r / 2, cy + h / 2), (cx - r / 2, cy + h / 2), (cx - r, cy), (cx - r / 2, cy - h / 2), (cx + r / 2, cy - h / 2)]
    ImageDraw.Draw(m).polygon([(px * ss, py * ss) for px, py in pts], fill=255)
    return np.array(m.resize((1122, 976), Image.LANCZOS)).astype(float) / 255


def h_cells(map_id):
    geo = json.loads((ROOT / "data_manual" / "maps_geometry" / f"{map_id}.json").read_text(encoding="utf-8"))
    return [(s["x"], s["y"]) for s in geo["special_hexes"] if s["kind"] == "hollywood_h"]


def has_h(img, cx, cy):
    """A white sign in the middle of the hex: more than 1.5 % of a 70 x 70 window is near white."""
    win = img[int(cy - 40):int(cy + 30), int(cx - 35):int(cx + 35)].astype(int)
    return float((win.min(axis=2) > 225).mean()) > 0.015


def cut_sprite(img, cx, cy):
    """The H sign as an RGBA picture (the sign's own pixels: white board, dark outline and legs), the shadow left out."""
    x0, y0, x1, y1 = int(cx - 50), int(cy - 60), int(cx + 50), int(cy + 50)
    win = img[y0:y1, x0:x1].astype(int)
    white = win.min(axis=2) > 225
    lab, n = ndimage.label(white)
    cy_w, cx_w = int(cy - 5 - y0), int(cx - x0)
    near = lab[cy_w - 12:cy_w + 12, cx_w - 12:cx_w + 12]
    ids = [i for i in np.unique(near) if i]
    sign = np.isin(lab, ids)
    box = ndimage.binary_dilation(ndimage.binary_fill_holes(sign), iterations=7)
    dark = win.max(axis=2) < 95
    keep = ndimage.binary_closing((sign | (dark & box)), iterations=2)
    keep = ndimage.binary_fill_holes(keep)
    lab2, n2 = ndimage.label(ndimage.binary_dilation(keep, iterations=1))
    sizes = ndimage.sum(keep, lab2, range(1, n2 + 1))
    keep = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s > 12]) & ndimage.binary_dilation(keep, iterations=1)
    alpha = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    rgba = Image.fromarray(win.astype(np.uint8)).convert("RGBA")
    rgba.putalpha(alpha)
    bb = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    return rgba.crop((bb[0] - 2, bb[1] - 2, bb[2] + 2, bb[3] + 2)), (bb[0] - 2 + x0 - cx, bb[1] - 2 + y0 - cy)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    blank = np.array(Image.open(ROOT / "web" / "map_editor" / "blank_map.png").convert("RGB")).astype(float)
    sprite_done = SPRITE.exists()
    for mid in ("8", "8a"):
        path = ROOT / "web" / "maps" / f"map-{mid}.jpg"
        img = np.array(Image.open(path).convert("RGB"))
        out = img.astype(float)
        for c in h_cells(mid):
            cx, cy = centre(*c)
            seen = has_h(img, cx, cy)
            print(mid, c, "H on the picture" if seen else "no H (already blank)")
            if not seen or a.check:
                continue
            if not sprite_done:
                sp, off = cut_sprite(img, cx, cy)
                sp.save(SPRITE, quality=95, lossless=True)
                print("sprite", sp.size, "offset from the hex centre", off)
                sprite_done = True
            m = hexagon(cx, cy, grow=1.0)[..., None]
            out = out * (1 - m) + blank * m
        if not a.check:
            Image.fromarray(out.round().astype(np.uint8)).save(path, quality=95, subsampling=0)


if __name__ == "__main__":
    main()
