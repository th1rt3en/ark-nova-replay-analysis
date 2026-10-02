"""Cut the building sprites (enclosures, kiosk, pavilion, special enclosures, sponsor buildings) out of the hex-lattice sprite sheet.

Input: bga_ui_screenshots/enclosures.png (2720x2591, RGBA, from BGA). The sheet is laid out on a regular flat-top hex lattice: hex (c, v)
(c + v even) is centred at (137 + 204 c, 117.8 (1 + v)) with circumradius 136 px. Lattice cell (c, v) <-> axial (q, r) = (c, (v - c) / 2), so the
engine's footprints (engine.build_action.SHAPES, data/unique_shapes.json) apply directly to the lattice.
- standard enclosures: yellow (empty, under construction) and green (occupied) versions of size 1-5, anchors listed in STANDARD below;
- special enclosures (petting zoo, reptile house, bird aviary, small / large aquarium) and kiosk / pavilion: one sprite each;
- sponsor buildings: one coloured hex group each, found from the silhouette hex that marks it (ICONS below) and the shape in unique_shapes.json.
Output: web/enclosures/<id>.webp (the union of the hexes, hex-masked, transparent outside) + web/enclosures/sprites.json with, for every sprite, the
pixel of its anchor cell in the image (the building's (x, y) on the board is the anchor cell). Needs Pillow and numpy:
    python scripts/build_enclosure_sprites.py [--contact-sheet out.png]
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from ark_nova.engine.build_action import SHAPES, UNIQUE_SHAPES  # noqa: E402

SHEET = ROOT / "bga_ui_screenshots" / "enclosures.png"
OUT = ROOT / "web" / "enclosures"
R, DX, H = 136, 204, 117.8              # lattice: circumradius, column spacing, half row height
X0 = 137
HEX_W, HEX_H = 2 * R, round(2 * R * math.sqrt(3) / 2)

# anchor lattice cell of every engine shape in the sheet (offset (0, 0) of engine.build_action.SHAPES)
STANDARD = {
    "size-1_empty": ("size-1", (0, 0)), "size-1_occupied": ("size-1", (0, 6)),
    "size-2_empty": ("size-2", (0, 2)), "size-2_occupied": ("size-2", (0, 8)),
    "size-3_empty": ("size-3", (1, 1)), "size-3_occupied": ("size-3", (1, 5)),
    "size-4_empty": ("size-4", (3, 3)), "size-4_occupied": ("size-4", (3, 7)),
    "size-5_empty": ("size-5", (6, 2)), "size-5_occupied": ("size-5", (6, 8)),
    "petting-zoo": ("petting-zoo", (1, 9)), "reptile-house": ("reptile-house", (1, 13)), "large-bird-aviary": ("large-bird-aviary", (4, 12)),
    "small-aquarium": ("small-aquarium", (12, 8)), "large-aquarium": ("large-aquarium", (11, 3)),
    "kiosk": ("kiosk", (2, 4)), "pavilion": ("pavilion", (5, 5)),
}
# sponsor buildings (keys of data/unique_shapes.json): the lattice cell of the silhouette hex that marks them. A cell of the shape sits there, not
# necessarily the anchor; the other cells are the coloured hexes around it. `victory_mw` is the Mascot Statue (the Victory Column has the laurel).
ICONS = {
    "victory": (2, 0), "victory_mw": (11, 1), "arcade": (4, 0), "meerkat": (3, 9), "penguin": (9, 1), "polar-bear": (1, 15), "owl": (7, 5),
    "sea-turtle": (7, 11), "okapi": (7, 13), "water-playground": (7, 15), "monkey": (8, 4), "amazon": (8, 8), "hyena": (9, 7),
    "adventure": (9, 15), "aquarium": (10, 4), "baboon": (10, 12), "cable": (11, 11), "entrance": (11, 17), "excavation": (0, 20),
    "zoo-school": (5, 15),
}
# the underwater tunnel has no silhouette hex: its two cells are drawn as one picture across the cell border
FIXED = {"underwater-tunnel": [(12, 12), (12, 14)]}


def centre(cell):
    return X0 + DX * cell[0], H * (1 + cell[1])


def offset_cell(anchor, off):
    """Lattice cell at axial offset (dq, dr) from `anchor`."""
    return anchor[0] + off[0], anchor[1] + off[0] + 2 * off[1]


def hex_mask() -> Image.Image:
    m = Image.new("L", (HEX_W, HEX_H), 0)
    ImageDraw.Draw(m).polygon([(R + R * math.cos(math.radians(60 * i)), HEX_H / 2 + R * math.sin(math.radians(60 * i))) for i in range(6)], fill=255)
    return m


def cell_image(sheet: Image.Image, cell) -> Image.Image:
    cx, cy = centre(cell)
    crop = sheet.crop((round(cx - R), round(cy - HEX_H / 2), round(cx - R) + HEX_W, round(cy - HEX_H / 2) + HEX_H))
    a = np.minimum(np.asarray(crop.getchannel("A")), np.asarray(hex_mask()))
    crop.putalpha(Image.fromarray(a))
    return crop


def is_filled(sheet: Image.Image, cell) -> bool:
    cx, cy = centre(cell)
    if cx - R < -2 or cy - HEX_H / 2 < -2 or cx + R > sheet.width + 2 or cy + HEX_H / 2 > sheet.height + 2:
        return False
    img = np.asarray(cell_image(sheet, cell))
    opaque = img[..., 3] > 128
    if opaque.mean() < 0.35:
        return False
    rgb = img[..., :3][opaque].astype(float)
    return not (rgb.mean() > 235 and rgb.std() < 14)          # the unused parts of the sheet are plain white


def mean_colour(sheet: Image.Image, cell) -> np.ndarray:
    a = np.asarray(cell_image(sheet, cell)).astype(float)
    return a[..., :3][a[..., 3] > 128].mean(axis=0)


def sprite(sheet: Image.Image, cells: list, anchor) -> tuple[Image.Image, list]:
    xs = [centre(c)[0] for c in cells]
    ys = [centre(c)[1] for c in cells]
    x0, y0 = round(min(xs) - R), round(min(ys) - HEX_H / 2)
    x1, y1 = round(max(xs) + R), round(max(ys) + HEX_H / 2)
    out = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    for c in cells:
        cx, cy = centre(c)
        tile = cell_image(sheet, c)
        piece = Image.new("RGBA", out.size, (0, 0, 0, 0))
        piece.paste(tile, (round(cx - R) - x0, round(cy - HEX_H / 2) - y0))
        out = Image.alpha_composite(out, piece)
    ax, ay = centre(anchor)
    return out, [round(ax - x0), round(ay - y0)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--contact-sheet")
    args = ap.parse_args()
    sheet = Image.open(SHEET).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    meta, shown = {}, []

    def save(name, img, anchor_px, cells):
        img.save(OUT / f"{name}.webp", quality=90)
        meta[name] = {"image": f"{name}.webp", "anchor": anchor_px, "size": list(img.size), "cells": len(cells)}
        shown.append((name, img))

    for name, (shape_id, anchor) in STANDARD.items():
        cells = [offset_cell(anchor, o) for o in SHAPES[shape_id]]
        assert all(is_filled(sheet, c) for c in cells), f"{name}: a cell is outside the sheet or empty"
        save(name, *sprite(sheet, cells, anchor), cells)

    other_icons = set(ICONS.values())
    claimed = {offset_cell(a, o) for sid, a in STANDARD.values() for o in SHAPES[sid]} | {c for cells in FIXED.values() for c in cells}

    def unique_cells(key: str):
        shape = UNIQUE_SHAPES[key.removesuffix("_mw") if key == "victory_mw" else key]
        icon = ICONS[key]
        sols = []
        for marker in shape:                                       # which cell of the shape carries the silhouette
            anchor = (icon[0] - marker[0], icon[1] - marker[0] - 2 * marker[1])
            cells = [offset_cell(anchor, o) for o in shape]
            others = [c for c in cells if c != icon]
            if all(is_filled(sheet, c) for c in cells) and not any(c in other_icons or c in claimed for c in cells if c != icon):
                colours = [mean_colour(sheet, c) for c in others]
                spread = max((np.abs(a - b).max() for a in colours for b in colours), default=0)   # the cells around the icon share one texture
                sols.append((spread, anchor, cells))
        sols.sort(key=lambda x: x[0])
        return [(a, c) for _, a, c in sols], [round(sp) for sp, _, _ in sols]

    for key in ICONS:
        sols, spreads = unique_cells(key)
        if not sols:
            print(f"{key}: no placement")
            continue
        if len(sols) > 1:
            print(f"{key}: {len(sols)} placements, texture spreads {spreads}: using {sols[0][1]}")
        anchor, cells = sols[0]
        save(key, *sprite(sheet, cells, anchor), cells)
    for key, cells in FIXED.items():
        anchor = (cells[0][0], cells[0][1])
        save(key, *sprite(sheet, cells, anchor), cells)

    (OUT / "sprites.json").write_text(json.dumps({"hex_radius": R, "sprites": meta}, indent=4))
    print(f"saved {len(meta)} sprites to {OUT}")
    if args.contact_sheet:
        cols, cw, ch = 8, 300, 300
        S = Image.new("RGBA", (cols * cw, ((len(shown) + cols - 1) // cols) * ch), (255, 0, 255, 255))
        d = ImageDraw.Draw(S)
        for i, (name, img) in enumerate(shown):
            t = img.copy()
            t.thumbnail((cw - 10, ch - 30))
            S.alpha_composite(t, ((i % cols) * cw + 5, (i // cols) * ch + 22))
            d.text(((i % cols) * cw + 5, (i // cols) * ch + 4), name, fill=(255, 255, 255, 255))
        S.convert("RGB").save(args.contact_sheet)


if __name__ == "__main__":
    main()
