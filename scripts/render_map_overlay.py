"""Draw the BGA hex coordinate grid (x,y) over a map board screenshot, to help fill data_manual/maps_geometry/<id>.json.

Usage: python scripts/render_map_overlay.py <board_image> <out_png> [--preset screenshot|full] [--scale N] [--crop x0,y0,x1,y1]
Calibration = pixel centre of hex (0,0), i.e. x pixel = x0 + x*dx, y pixel = y0 + y*dy (dy = half a hex height).
Presets: `screenshot` = the 624x461 crop of map 1 the project started with; `full` = the 4038x2130 full player-board scans
in vendor/Next-Ark-Nova-Cards/public/img/maps (fitted on map 1). Override with --x0 --y0 --dx --dy for other images
(pick far-apart hexes: dx = column spacing, dy = vertical distance per y unit). `scripts/render_all_map_overlays.py` runs the whole set.
"""
import argparse
import math

from PIL import Image, ImageDraw

p = argparse.ArgumentParser()
p.add_argument("image")
p.add_argument("out")
PRESETS = {"screenshot": (168, 56.4, 51.3, 29.6, 2.0), "full": (713.6, 235.0, 204.9, 118.0, 0.5)}
p.add_argument("--preset", choices=PRESETS, default="screenshot")
p.add_argument("--x0", type=float)
p.add_argument("--y0", type=float)
p.add_argument("--dx", type=float)
p.add_argument("--dy", type=float)
p.add_argument("--scale", type=float, help="output scale relative to the input image")
p.add_argument("--crop", help="crop box in INPUT pixels: x0,y0,x1,y1")
a = p.parse_args()
d0 = PRESETS[a.preset]
for i, name in enumerate(["x0", "y0", "dx", "dy", "scale"]):
    if getattr(a, name) is None:
        setattr(a, name, d0[i])

im = Image.open(a.image).convert("RGB")
s = a.scale
ox = oy = 0
if a.crop:
    ox, oy, x1, y1 = (int(v) for v in a.crop.split(","))
    im = im.crop((ox, oy, x1, y1))
im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
d = ImageDraw.Draw(im)
R = a.dx / 1.5  # flat-top hex circumradius
for x in range(9):
    for y in range(13):
        if (x + y) % 2 != 1:  # valid BGA cells have x+y odd
            continue
        cx, cy = (a.x0 + x * a.dx - ox) * s, (a.y0 + y * a.dy - oy) * s
        pts = [(cx + R * s * math.cos(math.radians(60 * i)), cy + R * s * math.sin(math.radians(60 * i))) for i in range(6)]
        d.polygon(pts, outline=(255, 0, 255))
        label = f"{x},{y}"
        w = d.textlength(label)
        ly = cy + 0.38 * a.dy * 2 * s  # label near the bottom of the hex so it does not hide the icon in the middle
        d.rectangle((cx - w / 2 - 2, ly - 7, cx + w / 2 + 2, ly + 7), fill=(255, 255, 255))
        d.text((cx - w / 2, ly - 5), label, fill=(200, 0, 0))
im.save(a.out, quality=88)
print("saved", a.out, im.size)
