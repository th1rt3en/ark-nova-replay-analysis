"""Redraws the player-colour cubes of web/cubes at 4x the size of the fan site's sheet (scripts/cardgen/site/img/cubes.png, 10 cells of 48 px), so the association board
and the project cards can draw them large without blur: web/cubes/<hex>.webp becomes 192 x 192 (was 48 x 48). Same cube, same colours, smooth edges.

How: the shapes of the red cube (the sheet's cell 7) are split into five classes (black outline, face, dark underside / right side, soft shadow, transparent); each class
mask is scaled up with a smooth filter and every output pixel takes the class with the highest value, which gives crisp curved contours instead of stairs. Each cube then
gets the median colour its own cell has inside the same masks (the ten cubes are recolours of one drawing). Run with the system python (Pillow + numpy):
    python scripts/build_cubes_hd.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "scripts" / "cardgen" / "site" / "img" / "cubes.png"
COLORS = ['30a638', '1863a5', '7f4e30', '000000', '5a5856', 'ffffff', 'd1c81c', 'b91b1b', 'c028d3', 'cb7b19']   # same order as scripts/build_cubes.py
REF = COLORS.index('b91b1b')
SCALE, SS = 4, 2                                      # final size = 48 * 4; drawn at 2x that and averaged down


def classes(cell: np.ndarray) -> np.ndarray:
    a = cell[..., 3]
    rgb = cell[..., :3].astype(int)
    k = np.zeros(a.shape, int)                         # 0 transparent
    opaque = a > 200
    k[(a > 20) & ~opaque] = 3                          # soft shadow
    dark = rgb.max(2) < 70
    k[opaque & dark] = 1                               # outline
    k[opaque & ~dark & (rgb[..., 0] >= 150)] = 2       # face
    k[opaque & ~dark & (rgb[..., 0] < 150)] = 4        # darker sides
    return k


def main() -> None:
    sheet = np.asarray(Image.open(SHEET).convert("RGBA"))
    cell = sheet.shape[0]
    cells = [sheet[:, i * cell:(i + 1) * cell] for i in range(len(COLORS))]
    ref = classes(cells[REF])
    big = cell * SCALE * SS
    score = []
    for c in range(5):
        m = Image.fromarray(((ref == c) * 255).astype(np.uint8)).resize((big, big), Image.BICUBIC).filter(ImageFilter.GaussianBlur(SCALE * SS * 0.45))
        score.append(np.asarray(m).astype(float))
    pick = np.argmax(np.stack(score), 0)
    shade = np.asarray(Image.fromarray(cells[REF][..., 3]).resize((big, big), Image.BICUBIC).filter(ImageFilter.GaussianBlur(SCALE * SS * 0.3))).astype(float)   # the soft shadow keeps its own smooth transparency               # class per output pixel (the classes keep their mutual order, transparent = 0)
    out_dir = ROOT / "web" / "cubes"
    for hexc, px in zip(COLORS, cells):
        rgba = np.zeros((big, big, 4), np.uint8)
        sh = ref == 3
        rgba[(pick == 0) | (pick == 3), :3] = np.median(px[sh][:, :3], 0).astype(np.uint8)
        rgba[(pick == 0) | (pick == 3), 3] = np.clip(shade[(pick == 0) | (pick == 3)], 0, 255).astype(np.uint8)    # shadow (and the faint edge of the outline): colour of the shadow, its own smooth transparency
        for c in (1, 2, 4):
            sel = ref == c
            if not sel.any():
                continue
            col = np.median(px[sel][:, :3], 0)
            m = pick == c
            rgba[m, :3] = col.astype(np.uint8)
            rgba[m, 3] = 255
        im = Image.fromarray(rgba).resize((cell * SCALE, cell * SCALE), Image.LANCZOS)
        im.save(out_dir / f"{hexc}.webp", lossless=True)
    print("10 cubes ->", out_dir, cell * SCALE, "px")


if __name__ == "__main__":
    main()
