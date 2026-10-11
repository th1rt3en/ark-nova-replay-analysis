"""Cut one empty worker slot (the grey worker silhouette on its light blue panel) out of the association board and give it rounded corners:
web/assets/worker_slot.webp, the background of the locked workers on the bonus panel of the zoo (web/js/association.js, `bonusPanel`).

Run with the system python (Pillow). The board is the 3335 x 986 picture, the box is given in the 2000 x 591 drawing of the viewer (the silhouette of the middle slot of the
"hire a worker" row, centre (890, 522)).
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
K = 3335 / 2000
BOX = (834, 466, 946, 578)                    # x0, y0, x1, y1 in the 2000-wide drawing: a square around the silhouette
RADIUS = 0.2                                  # of the side

im = Image.open(ROOT / 'web' / 'assets' / 'association_board_base.webp').convert('RGBA')
tile = im.crop(tuple(round(v * K) for v in BOX))
side = min(tile.size)
tile = tile.crop((0, 0, side, side))
mask = Image.new('L', (side * 4, side * 4), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, side * 4 - 1, side * 4 - 1), radius=side * 4 * RADIUS, fill=255)
tile.putalpha(mask.resize((side, side), Image.LANCZOS))
tile.save(ROOT / 'web' / 'assets' / 'worker_slot.webp', lossless=True)
print('worker_slot.webp', tile.size)
