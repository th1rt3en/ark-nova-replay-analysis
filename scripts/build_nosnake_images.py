"""No-snake mode images (web/cards/<key>_ns.webp / _sw.webp and the same in web/cards_large/): the 11 cards whose photo shows a snake (8 animals, the projects Reptiles
and Reptile Breeding Program, the sponsor Veterinarian), with the photo replaced and everything else (icons, tabs, name bar, text) kept pixel for pixel.
  _ns = "missing photo": a dashed frame with a crossed-out camera;  _sw = the photo of the Slow Worm (A488, not a snake) instead.
The icons that lie on the photo are kept by shapes (KEEP, large-card pixels; the small card uses the same shapes scaled). Run with the system python (needs Pillow):
  python scripts/build_nosnake_images.py
The list of cards is SNAKE_CARDS (the web page has the same list in web/js/nosnake.js).
REMINDER: when a new card with a snake photo is added to the game (an animal, project or sponsor), put it in SNAKE_CARDS (animals also in ANIMALS) and in web/js/nosnake.js, run this script and look at the card in Slow Worm mode; the requirement badges of animals are kept by `bars_bottom`."""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
PHOTO = ROOT / "scripts" / "cardgen" / "site" / "img" / "animals" / "A488_SlowWorm.jpg"
LARGE, SMALL = (745, 1040), (360, 503)
ANIMALS = ["A470", "A474", "A475", "A482", "A483", "A485", "A487", "A492"]
SNAKE_CARDS = ANIMALS + ["P109", "P125", "S203"]
ART_BOTTOM = {"A": (520, 252), "P": (520, 252), "S": (520, 252)}           # y where the title bar starts: (large card, small card)
PAPER = (233, 224, 196)
INK = (120, 110, 90)

# shapes that stay (large-card pixels): ("rect", x0, y0, x1, y1) | ("circle", cx, cy, r) | ("rrect", x0, y0, x1, y1, r)
def animal_keep(wide):                                                  # the grey panel top left is 293 wide with a water icon in the stat row, else 231; below it a 154 wide block
    return [("rrect", -60, -60, 293 if wide else 231, 136, 12), ("rrect", -60, -60, 154, 260, 14), ("rect", 478, 0, 712, 100), ("circle", 533, 92, 58), ("circle", 655, 92, 58)]
KEEP = {
    **{k: animal_keep(k in ("A487", "A492")) for k in ANIMALS},
    "P109": [("rrect", -60, -60, 200, 202, 52)],
    "P125": [("rrect", -60, -60, 200, 346, 52)],
    "S203": [("rrect", -60, -60, 147, 147, 28), ("rrect", 316, -60, 574, 164, 30), ("rect", 598, 0, 708, 90), ("circle", 652, 92, 58)],
}


def kind(key):
    return key[0]


BARS = {}                                                              # animal -> large-card y where its red requirement bars end (0 = none): the column of requirement badges has to stay as well


def bars_bottom(key):
    """The lowest row (large-card pixels) of the red requirement bars under the price panel: scanned down column x = 12 of the large card from the panel's bottom edge (y 262) to the end of the art (520)."""
    im = Image.open(WEB / "cards_large" / f"{key}.webp").convert("RGB")
    last, gap = 0, 0
    for y in range(262, ART_BOTTOM["A"][0]):                            # (the bars follow one another with a thin seam; the photo may be reddish, so only the run that starts right under the panel counts)
        r, g, b = im.getpixel((12, y))
        if r > 170 and g < 130 and b < 130:
            last, gap = y, 0
        else:
            gap += 1
            if gap > 8 and (last or y > 290):
                break
    return last


def keep_mask(key, size, scale):
    w, h = size
    s = 4
    m = Image.new("L", (w * s, h * s), 0)
    d = ImageDraw.Draw(m)
    for sh in KEEP[key]:
        if BARS.get(key) and sh[0] == "rrect" and sh[3] == 154:           # (the block under the grey panel reaches down to the last requirement bar)
            sh = (*sh[:4], max(sh[4], BARS[key] + 4), sh[5])
        v = [c * scale * s for c in sh[1:]]
        if sh[0] == "rect":
            d.rectangle(v, fill=255)
        elif sh[0] == "circle":
            d.ellipse([v[0] - v[2], v[1] - v[2], v[0] + v[2], v[1] + v[2]], fill=255)
        else:
            d.rounded_rectangle(v[:4], radius=v[4], fill=255)
    return m.resize((w, h), Image.LANCZOS)


def placeholder(w, h):
    """Missing photo: paper, a dashed frame and a crossed-out camera."""
    s = 3
    im = Image.new("RGB", (w * s, h * s), PAPER)
    d = ImageDraw.Draw(im)
    u = min(w, h) / 100 * s                                              # 1 % of the short side
    inset = 12 * u * 0.6
    x0, y0, x1, y1 = inset + 10 * s * w / 745, inset + 10 * s * w / 745, w * s - inset - 10 * s * w / 745, h * s - inset - 10 * s * w / 745
    dash, gap, lw = 7 * u * .8, 5 * u * .8, 1.5 * u * .8
    x = x0
    while x < x1:
        d.line([x, y0, min(x + dash, x1), y0], fill=INK, width=round(lw)); d.line([x, y1, min(x + dash, x1), y1], fill=INK, width=round(lw)); x += dash + gap
    y = y0
    while y < y1:
        d.line([x0, y, x0, min(y + dash, y1)], fill=INK, width=round(lw)); d.line([x1, y, x1, min(y + dash, y1)], fill=INK, width=round(lw)); y += dash + gap
    cx, cy = w * s * .52, h * s * .5
    k = u * 0.9
    col = (110, 100, 82)
    d.rounded_rectangle([cx - 28 * k, cy - 18 * k, cx + 28 * k, cy + 19 * k], radius=5 * k, outline=col, width=round(4.6 * k))
    d.rectangle([cx - 11 * k, cy - 26 * k, cx + 7 * k, cy - 17 * k], fill=col)
    r = 10 * k; d.ellipse([cx - r, cy - r + k, cx + r, cy + r + k], outline=col, width=round(3.6 * k))
    d.line([cx - 33 * k, cy + 28 * k, cx + 33 * k, cy - 28 * k], fill=col, width=round(4.6 * k))
    return im.resize((w, h), Image.LANCZOS)


def worm(w, h):
    """The Slow Worm photo, cropped to fill w x h (centre)."""
    ph = Image.open(PHOTO).convert("RGB")
    k = max(w / ph.width, h / ph.height)
    ph = ph.resize((math.ceil(ph.width * k), math.ceil(ph.height * k)), Image.LANCZOS)
    x, y = (ph.width - w) // 2, (ph.height - h) // 2
    return ph.crop((x, y, x + w, y + h))


def make(key, folder, size, scale, bottom):
    card = Image.open(WEB / folder / f"{key}.webp").convert("RGB")
    assert card.size == size, (key, card.size)
    w = size[0]
    mask = keep_mask(key, size, scale)
    for suffix, art in (("ns", placeholder), ("sw", worm)):
        out = card.copy()
        out.paste(art(w, bottom), (0, 0))                               # the new photo over the whole art area ...
        out.paste(card, (0, 0), mask)                                   # ... then the icons and tabs back
        out.save(WEB / folder / f"{key}_{suffix}.webp", "WEBP", quality=92, method=6)


def main():
    for key in ANIMALS:
        BARS[key] = bars_bottom(key)
    print("requirement bars end at", BARS)
    for key in SNAKE_CARDS:
        k = kind(key)
        make(key, "cards_large", LARGE, 1, ART_BOTTOM[k][0])
        make(key, "cards", SMALL, SMALL[0] / LARGE[0], ART_BOTTOM[k][1])
    print("done", len(SNAKE_CARDS) * 4, "images")


if __name__ == "__main__":
    main()
