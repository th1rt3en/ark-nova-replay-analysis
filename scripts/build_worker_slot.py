"""Cut one empty worker slot (the grey worker silhouette on its light blue panel) out of the association board and give it rounded corners:
web/assets/worker_slot.webp, the background of the locked workers on the bonus panel of the zoo (web/js/association.js, `bonusPanel`).

The picture is recoloured from light blue to a lighter shade of the pink of the locked workers' zone (`BG`, `SILHOUETTE`).

Run with the system python (Pillow). The board is the 3335 x 986 picture, the box is given in the 2000 x 591 drawing of the viewer (the silhouette of the middle slot of the
"hire a worker" row, centre (890, 522)).
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
K = 3335 / 2000
BOX = (834, 466, 946, 578)                    # x0, y0, x1, y1 in the 2000-wide drawing: a square around the silhouette
RADIUS = 0.2                                  # of the side
BG, SILHOUETTE = (252, 222, 222), (222, 160, 160)       # the pink zone is #f4a3a3: the tile is lighter, the silhouette a little darker than the tile

im = Image.open(ROOT / 'web' / 'assets' / 'association_board_base.webp').convert('RGBA')
tile = im.crop(tuple(round(v * K) for v in BOX))
side = min(tile.size)
tile = tile.crop((0, 0, side, side))
grey = tile.convert('L')
lo, hi = grey.getpixel((side // 2, int(side * 0.62))), grey.getpixel((side // 8, side // 8))          # (the silhouette's and the panel's brightness)
px = tile.load()
for y in range(side):
    for x in range(side):
        t = min(1.0, max(0.0, (grey.getpixel((x, y)) - lo) / max(1, hi - lo)))
        px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(SILHOUETTE, BG)) + (255,)
mask = Image.new('L', (side * 4, side * 4), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, side * 4 - 1, side * 4 - 1), radius=side * 4 * RADIUS, fill=255)
tile.putalpha(mask.resize((side, side), Image.LANCZOS))
tile.save(ROOT / 'web' / 'assets' / 'worker_slot.webp', lossless=True)
print('worker_slot.webp', tile.size)
