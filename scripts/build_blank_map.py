"""A blank zoo map made of plain hexes only, and one hex of rock and one of water, cut out of the map pictures (the pieces for a map editor).

    python scripts/build_blank_map.py [--out web/map_editor]       (run with the system `python`: needs Pillow + numpy)

Every map picture (`web/maps/map-<id>.jpg`, 1122 x 976) is a painting of its own: the plain hexes of two maps do not look alike. The 58 cells of a board are therefore filled with
the plain hexes of the maps where that cell is clean (plain terrain, no bonus or special spot, no rock / water / icon painted over it); the map that has the most clean cells
supplies as many hexes as possible, the others fill the rest. The margin around the board comes from the cleanest map.
Hex geometry (flat-top): the centre of cell (x, y) is at (96 + 115 x, 88 + 66.5 y); a hex has circumradius R = 115 / 1.5 and is 133 high.

Outputs in the folder: `blank_map.png` (the board), `hex_plain.png`, `hex_rock.png`, `hex_water.png` (transparent outside the hexagon, 156 x 135) and `hexes.json` (the geometry and which map
every piece came from).
"""
import argparse
import glob
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
W, H_IMG = 1122, 976
R = 115 / 1.5
HH = 133.0
CELLS = [(x, y) for x in range(9) for y in range(13) if (x + y) % 2 == 1]
TILE_W, TILE_H = 156, 135                      # the size of the extracted hexes (the hexagon is 153 x 133)


def centre(x, y):
    return 96 + 115 * x, 88 + 66.5 * y


def hex_points(cx, cy, r=R, h=HH):
    return [(cx + r, cy), (cx + r / 2, cy + h / 2), (cx - r / 2, cy + h / 2), (cx - r, cy), (cx - r / 2, cy - h / 2), (cx + r / 2, cy - h / 2)]


def hex_mask(cx, cy, grow=0.0, ss=4):
    """A full-picture mask (bool) of the hexagon around (cx, cy), grown by `grow` pixels."""
    m = Image.new("L", (W * ss, H_IMG * ss), 0)
    ImageDraw.Draw(m).polygon([(px * ss, py * ss) for px, py in hex_points(cx, cy, R + grow * 2 / math.sqrt(3), HH + grow * 2)], fill=255)
    return np.array(m.resize((W, H_IMG), Image.LANCZOS)) > 127


def window(cx, cy, pad=20):
    return int(cy - HH / 2 - pad), int(cy + HH / 2 + pad) + 1, int(cx - R - pad), int(cx + R + pad) + 1


def foreign(rgb: np.ndarray) -> np.ndarray:
    """Pixels that are not the plain painting (sand, grass tufts, the white grid line): water, rock, dark / strongly coloured icons."""
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    water = (b > r + 25) & (b > 120)
    rock = (b > g + 3) & (b >= r - 25) & (r < 215) & ~water
    dark = (np.maximum(np.maximum(r, g), b) < 80)
    icon = ((r > 170) & (g < 100) & (b < 100)) | ((r > 200) & (g > 150) & (b < 60) & (r - b > 150) & (g > 190))       # red flags, bright yellow pentagons
    return water | rock | dark | icon


def load_maps():
    maps = {}
    for f in sorted(glob.glob(str(ROOT / "data_manual" / "maps_geometry" / "*.json"))):
        g = json.load(open(f, encoding="utf-8"))
        pic = ROOT / "web" / "maps" / f"map-{g['map_id']}.jpg"
        if not pic.exists():
            continue
        terrain = {(h["x"], h["y"]): h["terrain"] for h in g["hexes"]}
        spots = {(b["x"], b["y"]) for b in g.get("placement_bonuses", [])} | {(s["x"], s["y"]) for s in g.get("special_hexes", []) if not s.get("off_board")}
        maps[g["map_id"]] = {"id": g["map_id"], "img": np.array(Image.open(pic).convert("RGB")), "terrain": terrain, "spots": spots}
    return maps


def neighbours(x, y):
    return [(x, y - 2), (x, y + 2), (x - 1, y - 1), (x - 1, y + 1), (x + 1, y - 1), (x + 1, y + 1)]


def dirt(m, x, y):
    """How much of the hex of cell (x, y) in map `m` is not plain painting (fraction of the grown hexagon)."""
    cx, cy = centre(x, y)
    y0, y1, x0, x1 = window(cx, cy)
    mask = hex_mask(cx, cy, grow=10)[y0:y1, x0:x1]
    f = foreign(m["img"][y0:y1, x0:x1]) & mask
    return float(f.sum()) / max(1, int(mask.sum()))


def edge_shift(m, x, y):
    """How different the colour of the rim of the hex is from its core (a shadow or a halo painted along an edge of the hexagon darkens or tints only the rim)."""
    cx, cy = centre(x, y)
    y0, y1, x0, x1 = window(cx, cy)
    rgb = m["img"][y0:y1, x0:x1].astype(float)
    core = hex_mask(cx, cy, grow=-22)[y0:y1, x0:x1]
    rim = hex_mask(cx, cy, grow=-4)[y0:y1, x0:x1] & ~hex_mask(cx, cy, grow=-16)[y0:y1, x0:x1]
    return float(np.abs(rgb[rim].mean(axis=0) - rgb[core].mean(axis=0)).max())


def tan(m, x, y):
    """How sandy the hex is (mean red minus blue over its core): a purple haze painted over it lowers the number."""
    cx, cy = centre(x, y)
    y0, y1, x0, x1 = window(cx, cy)
    core = hex_mask(cx, cy, grow=-12)[y0:y1, x0:x1]
    rgb = m["img"][y0:y1, x0:x1].astype(float)
    return float((rgb[..., 0] - rgb[..., 2])[core].mean())


def clean_cells(maps):
    """For every cell the maps where its hex is clean: `{cell: [(dirt, map id, strict)]}`. Strict = plain terrain all around and almost nothing foreign in the hexagon."""
    out = {}
    for mid, m in maps.items():
        for c in CELLS:
            if m["terrain"].get(c) != "plain" or c in m["spots"]:
                continue
            d = dirt(m, *c)
            strict = d < 0.0005 and all(m["terrain"].get(n) in (None, "plain") for n in neighbours(*c))
            if strict or d < 0.03:
                out.setdefault(c, []).append((d, mid, strict, edge_shift(m, *c), tan(m, *c)))
    return out


def best_sources(maps, clean):
    """For every cell the map that supplies its hex: the cheapest candidates (cost = how much the rim differs from the core + the foreign pixels + a haze penalty, a little more when a neighbour is not
    plain), and among those within 1.5 of the cheapest the map with the most strictly clean cells (so that neighbouring hexes come from the same painting where possible)."""
    count = {}
    for c, lst in clean.items():
        for d, mid, strict, shift, _ in lst:
            if strict:
                count[mid] = count.get(mid, 0) + 1
    order = sorted(maps, key=lambda k: -count.get(k, 0))
    pick = {}
    for c in CELLS:
        lst = clean.get(c, [])
        if not lst:
            continue
        top = max(t for *_, t in lst)
        cost = {mid: shift + 1200 * d + (0 if strict else 3) + 1.5 * (top - t) for d, mid, strict, shift, t in lst}
        best = min(cost.values())
        pick[c] = next(mid for mid in order if mid in cost and cost[mid] <= best + 1.5)
    return pick, order


def margin_source(maps, order):
    """The margin (outside the 58 hexagons): the picture of the first map (in `order`) whose margin is cleanest."""
    inside = np.zeros((H_IMG, W), bool)
    for c in CELLS:
        inside |= hex_mask(*centre(*c), grow=2)
    best, best_d = None, 2.0
    for mid in order or maps:
        f = foreign(maps[mid]["img"]) & ~inside
        d = f.sum() / max(1, (~inside).sum())
        if d < best_d:
            best, best_d = mid, d
    return best, inside


def build_blank(maps, pick, base_id, inside):
    canvas = maps[base_id]["img"].copy()
    # a margin pixel that is not clean in the base picture is taken from the next map where it is
    bad = foreign(canvas) & ~inside
    if bad.any():
        for mid, m in maps.items():
            if mid == base_id:
                continue
            ok = ~foreign(m["img"]) & bad
            canvas[ok] = m["img"][ok]
            bad &= ~ok
            if not bad.any():
                break
    for c in CELLS:
        cx, cy = centre(*c)
        mask = hex_mask(cx, cy, grow=0)
        src = maps[pick[c]]["img"] if c in pick else None
        if src is None:
            continue
        canvas[mask] = src[mask]
    return Image.fromarray(canvas)


def cut_hex(img: np.ndarray, x: int, y: int) -> Image.Image:
    """The hexagon of cell (x, y) as a transparent RGBA picture of TILE_W x TILE_H (the hexagon centred in it, anti-aliased edge)."""
    cx, cy = centre(x, y)
    ss = 4
    tile = Image.new("RGBA", (TILE_W, TILE_H), (0, 0, 0, 0))
    m = Image.new("L", (TILE_W * ss, TILE_H * ss), 0)
    ox, oy = TILE_W / 2, TILE_H / 2
    ImageDraw.Draw(m).polygon([(px * ss, py * ss) for px, py in hex_points(ox, oy)], fill=255)
    m = m.resize((TILE_W, TILE_H), Image.LANCZOS)
    x0, y0 = int(round(cx - ox)), int(round(cy - oy))
    crop = np.zeros((TILE_H, TILE_W, 3), np.uint8)
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(W, x0 + TILE_W), min(H_IMG, y0 + TILE_H)
    crop[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = img[sy0:sy1, sx0:sx1]
    tile = Image.fromarray(crop).convert("RGBA")
    tile.putalpha(m)
    return tile


def pick_terrain_hex(maps, kind):
    """The cell of `kind` (rock / water) whose terrain stays inside its own hexagon: a lot of it inside, as little as possible leaking into the ring around."""
    best = None
    for mid, m in maps.items():
        for c in CELLS:
            if m["terrain"].get(c) != kind or c in m["spots"]:
                continue
            cx, cy = centre(*c)
            y0, y1, x0, x1 = window(cx, cy, pad=40)
            sub = m["img"][y0:y1, x0:x1].astype(int)
            r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
            water = (b > r + 25) & (b > 120)
            rock = (b > g + 3) & (b >= r - 25) & (r < 215) & ~water
            mine = water if kind == "water" else rock
            inner = hex_mask(cx, cy, grow=-3)[y0:y1, x0:x1]
            ring = hex_mask(cx, cy, grow=40)[y0:y1, x0:x1] & ~hex_mask(cx, cy, grow=0)[y0:y1, x0:x1]
            other = (rock if kind == "water" else water)
            inside = float((mine & inner).sum()) / max(1, int(inner.sum()))
            leak = float((mine & ring).sum()) / max(1, int(ring.sum()))
            clutter = float((other & inner).sum()) / max(1, int(inner.sum())) + float(foreign(m["img"][y0:y1, x0:x1]).sum() - (mine | other).sum()) / max(1, inner.sum()) * 0.2
            score = inside - 4 * leak - 3 * clutter
            if inside > 0.25 and (best is None or score > best[0]):
                best = (score, mid, c, inside, leak)
    return best


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "web" / "map_editor"))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    maps = load_maps()
    clean = clean_cells(maps)
    pick, order = best_sources(maps, clean)
    missing = [c for c in CELLS if c not in pick]
    if missing:
        raise SystemExit(f"no clean plain hex for the cells {missing}")
    base_id, inside = margin_source(maps, order)
    blank = build_blank(maps, pick, base_id, inside)
    blank.save(out / "blank_map.png", optimize=True)
    pieces = {"plain": None}
    # a plain hex: the one of the cell in the middle of the board from the main map
    mid_cell = (4, 5)
    plain_src = pick[mid_cell]
    cut_hex(maps[plain_src]["img"], *mid_cell).save(out / "hex_plain.png", optimize=True)
    pieces["plain"] = {"map": plain_src, "cell": list(mid_cell)}
    for kind in ("rock", "water"):
        best = pick_terrain_hex(maps, kind)
        if best is None:
            raise SystemExit(f"no {kind} hex found")
        _, mid, c, inside_frac, leak = best
        cut_hex(maps[mid]["img"], *c).save(out / f"hex_{kind}.png", optimize=True)
        pieces[kind] = {"map": mid, "cell": list(c), "inside": round(inside_frac, 2), "leak": round(leak, 3)}
    info = {"geometry": {"image": [W, H_IMG], "centre": "(96 + 115 x, 88 + 66.5 y)", "radius": R, "hex_height": HH, "tile": [TILE_W, TILE_H], "cells": CELLS},
            "blank_map": {"margin_from": base_id, "cell_sources": {f"{x},{y}": pick[(x, y)] for x, y in CELLS}}, "pieces": pieces}
    (out / "hexes.json").write_text(json.dumps(info, indent=4), encoding="utf-8")
    counts = {}
    for c in pick.values():
        counts[c] = counts.get(c, 0) + 1
    print("hexes per source map:", counts, "| margin from", base_id, "| pieces:", pieces)


if __name__ == "__main__":
    main()
