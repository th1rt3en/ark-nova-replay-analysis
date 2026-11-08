"""Builds `web/maps/map-BDW1.jpg` .. `map-BDW4.jpg` (1122 x 976, like the BGA pictures of the other maps) from the Board Design Workshop artwork.

The artwork (`bdw_maps/BDW<n>_<name>_high.png`, 12083 x 6378, not in the repository) is a whole player board with the printed placement bonuses, upgrade flags, the notepad and
the association board. The viewer draws the bonuses and flags itself, so they are painted out here: each icon's spot is filled with a piece of the same texture taken one (or more)
hexes away (the hex lattice repeats, so the hex borders line up), and where the hex is rock or water with a diffusion fill. The crane of BDW2 and the rest of the board art stay.
Hex (x, y) is at (713.6 + 204.9 x, 235 + 118 y) of the artwork scaled to 4038 x 2130 (the vendor scans), at (96 + 115 x, 88 + 66.5 y) of the result.

    python scripts/build_bdw_images.py [--src bdw_maps] [--check]      (needs Pillow + numpy; run with the system python)
"""
import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "ark_nova" / "data" / "bdw_maps.json"
NAMES = {"BDW1": "Management_Zoo", "BDW2": "Construction_Yard", "BDW3": "Enigma_Isle", "BDW4": "Vast_Valley"}
X0, Y0, DX, DY = 713.6, 235.0, 204.9, 118.0
SCALE = (4038, 2130)
CROP = (542, 79, 2541, 1810)                    # the board region of the 4038 x 2130 picture that becomes the 1122 x 976 map picture
OUT_SIZE = (1122, 976)
PENTAGON_R = 100
LATTICE = [(0, 236.0), (0, -236.0), (DX, DY), (DX, -DY), (-DX, DY), (-DX, -DY), (2 * DX, 0), (-2 * DX, 0), (0, 472.0), (0, -472.0), (2 * DX, 2 * DY), (-2 * DX, 2 * DY),
           (2 * DX, -2 * DY), (-2 * DX, -2 * DY), (3 * DX, DY), (-3 * DX, DY), (3 * DX, -DY), (-3 * DX, -DY)]


def centre(x, y):
    return X0 + DX * x, Y0 + DY * y


def cell_at(px, py, cells):
    """The cell whose centre is nearest to the point, or None when the point is off the board."""
    best = min(cells, key=lambda c: (centre(*c)[0] - px) ** 2 + (centre(*c)[1] - py) ** 2)
    cx, cy = centre(*best)
    return best if math.hypot(cx - px, cy - py) < 150 else None


def region(kind, cx, cy):
    """(bounding box, a function drawing the mask into a local image of that box) of what is painted out at a hex centre."""
    if kind == "bonus":
        box = (cx - PENTAGON_R, cy - PENTAGON_R - 8, cx + PENTAGON_R, cy + PENTAGON_R - 8)

        def draw(d, ox, oy):
            d.ellipse((box[0] - ox, box[1] - oy, box[2] - ox, box[3] - oy), fill=255)
        return box, draw
    box = (cx - 150, cy - 135, cx + 75, cy + 20)                                   # the flag: the red wedge to the left and the badge on it

    def draw(d, ox, oy):
        R = DX / 1.5
        h = R * 0.866
        d.polygon([(cx - R * 0.95 - ox, cy - oy), (cx - R * 0.475 - ox, cy - h * 0.95 - oy), (cx + R * 0.36 - ox, cy - h * 0.95 - oy), (cx - R * 0.115 - ox, cy - oy)], fill=255)
        d.ellipse((cx - 11 - 72 - ox, cy - 56 - 72 - oy, cx - 11 + 72 - ox, cy - 56 + 72 - oy), fill=255)
    return box, draw


def diffuse(arr, mask, rounds=400):
    """Fill the masked pixels of `arr` (h, w, 3 floats) by letting the colour of the surroundings flow in, then add a little of the neighbourhood's noise back."""
    out = arr.copy()
    keep = ~mask
    out[mask] = out[keep].mean(0) if keep.any() else 128
    for _ in range(rounds):
        blur = (np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 4
        out[mask] = blur[mask]
    noise = np.random.default_rng(7).normal(0, 3.0, arr.shape)
    out[mask] += noise[mask]
    return out


def clean(img, rec, bd):
    """The board picture without the printed placement bonuses and upgrade flags."""
    cells = [(h["x"], h["y"]) for h in rec["geometry"]["hexes"]]
    terrain = {(h["x"], h["y"]): h["terrain"] for h in rec["geometry"]["hexes"]}
    spots = [("bonus", b["x"], b["y"]) for b in rec["geometry"]["placement_bonuses"]] + [("flag", s["x"], s["y"]) for s in rec["geometry"]["special_hexes"] if s["kind"] == "upgrade_flag"]
    busy = {(x, y) for _, x, y in spots}
    arr = np.asarray(img).astype(np.float32)
    done = []
    for kind, x, y in spots:
        cx, cy = centre(x, y)
        box, draw = region(kind, cx, cy)
        x0, y0, x1, y1 = (int(round(v)) for v in box)
        mask_img = Image.new("L", (x1 - x0, y1 - y0), 0)
        draw(ImageDraw.Draw(mask_img), x0, y0)
        mask = np.asarray(mask_img.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255.0
        source = None
        if kind == "bonus":                                                       # the disc lies inside its hex: the middle of another hex of the same terrain without an icon has the same texture
            for sx_, sy_ in sorted((c for c in cells if terrain[c] == terrain[(x, y)] and c not in busy and c != (x, y)), key=lambda c: (abs(c[0] - x) + abs(c[1] - y) / 2, c)):
                vx, vy = centre(sx_, sy_)[0] - cx, centre(sx_, sy_)[1] - cy
                if x0 + vx >= 0 and y0 + vy >= 0 and x1 + vx <= img.width and y1 + vy <= img.height:
                    source = (vx, vy)
                    break
        elif kind == "flag":                                                           # the wedge crosses a hex border: the source is a lattice step away, so the borders line up
            pts = [(cx, cy), (cx - 11, cy - 100), (cx - 100, cy - 56), (cx - 120, cy - 10), (cx + 40, cy - 100)]
            if terrain[(x, y)] == "plain":
                for vx, vy in LATTICE:
                    cs = [cell_at(px + vx, py + vy, cells) for px, py in pts]
                    if all(c is not None and terrain[c] == "plain" and c not in busy for c in cs) and x0 + vx >= 0 and y0 + vy >= 0 and x1 + vx <= img.width and y1 + vy <= img.height:
                        source = (vx, vy)
                        break
        patch = arr[y0:y1, x0:x1].copy()
        if source:
            sx, sy = int(round(source[0])), int(round(source[1]))
            fill = arr[y0 + sy:y1 + sy, x0 + sx:x1 + sx]
        else:
            fill = diffuse(patch, mask > 0.5)
        arr[y0:y1, x0:x1] = patch * (1 - mask[..., None]) + fill * mask[..., None]
        done.append((kind, x, y, source))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)), done


def main():
    import json
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT / "bdw_maps"))
    ap.add_argument("--out", default=str(ROOT / "web" / "maps"))
    ap.add_argument("--only")
    a = ap.parse_args()
    Image.MAX_IMAGE_PIXELS = None
    recs = {m["id"]: m for m in json.loads(DATA.read_text(encoding="utf-8"))}
    for mid, name in NAMES.items():
        if a.only and a.only != mid:
            continue
        src = Path(a.src) / f"{mid}_{name}_high.png"
        img = Image.open(src).convert("RGB").resize(SCALE, Image.LANCZOS)
        out, done = clean(img, recs[mid], None)
        board = out.crop(CROP).resize(OUT_SIZE, Image.LANCZOS)
        dest = Path(a.out) / f"map-{mid}.jpg"
        board.save(dest, quality=90)
        print(mid, "->", dest, "|", sum(1 for d in done if d[3]), "copied,", sum(1 for d in done if not d[3]), "diffused")


if __name__ == "__main__":
    main()
