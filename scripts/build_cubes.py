"""Cut the player-colour cubes and cylinders of the fan site (vendor/Next-Ark-Nova-Cards/public/img/cubes.png, cylinders.png) into web/cubes/<hex>.webp and web/cylinders/<hex>.webp.

Run with the system python (Pillow). Cells are in BGA's player colour order, the same as web/workers (icons.js WORKER_COLORS).
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
COLORS = ['30a638', '1863a5', '7f4e30', '000000', '5a5856', 'ffffff', 'd1c81c', 'b91b1b', 'c028d3', 'cb7b19']

for sheet, folder in (('cubes', 'cubes'), ('cylinders', 'cylinders')):
    im = Image.open(ROOT / 'vendor' / 'Next-Ark-Nova-Cards' / 'public' / 'img' / f'{sheet}.png').convert('RGBA')
    cell = im.height
    assert im.width == cell * len(COLORS), (sheet, im.size)
    out = ROOT / 'web' / folder
    out.mkdir(exist_ok=True)
    for i, c in enumerate(COLORS):
        im.crop((i * cell, 0, (i + 1) * cell, cell)).save(out / f'{c}.webp', lossless=True)
    print(sheet, cell, 'px cells ->', out)
