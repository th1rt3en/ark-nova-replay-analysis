"""Marine Worlds versions of sponsor cards whose icons changed: web/cards/<key>_MW.webp and web/cards_large/<key>_MW.webp (the viewer uses them when the game
has Marine Worlds, see `card_catalog` in replay/view.py). Needs Pillow; run with the system `python`.

S250 Sea Turtle Tank: 2 water icons (the flag of the Aquarium S245 is moved over the one of the card) and a sea animal icon below the reptile icon (the blue
octopus disc of the sea animal icon sheet cell r2c8, in the ring of the reptile icon).
"""
from pathlib import Path

from PIL import Image, ImageDraw

WEB = Path(__file__).resolve().parents[1] / "web"
W = 745                                                      # the large cards are 745 wide, the small ones are scaled copies
FLAG = (136, 30, 243, 140)                                   # the flag of the water icons (large card pixels)
COLUMN = (600, 0, 712)                                       # the column of the tag icons: x0, y0, x1
DISC = (13, 11, 91, 89)                                      # the blue disc with the octopus on r2c8


def build(folder: str) -> None:
    base = Image.open(WEB / folder / "S250.webp").convert("RGBA")
    donor = Image.open(WEB / folder / "S245.webp").convert("RGBA")
    k = base.width / W
    sc = lambda v: round(v * k)
    box = tuple(sc(v) for v in FLAG)
    base.paste(donor.crop(box), box[:2])
    d = ImageDraw.Draw(base)
    x0, y0, x1 = (sc(v) for v in COLUMN)
    gray = base.getpixel((sc(655), sc(10)))
    ring_y = sc(205)
    d.rounded_rectangle((x0, sc(147), x1, sc(268)), radius=sc(14), fill=gray)
    d.rectangle((x0, sc(147), x1, sc(170)), fill=gray)
    size = sc(110)
    cx = (x0 + x1) // 2
    big = 8 * size
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    ring = Image.new("RGB", (big, big), (255, 255, 255))
    disc = Image.open(WEB / "icons" / "r2c8.webp").convert("RGB").crop(DISC).resize((int(big * 0.9),) * 2, Image.LANCZOS)
    dm = Image.new("L", disc.size, 0)
    ImageDraw.Draw(dm).ellipse((0, 0, disc.width - 1, disc.height - 1), fill=255)
    ring.paste(disc, ((big - disc.width) // 2,) * 2, dm)
    icon = ring.resize((size, size), Image.LANCZOS)
    base.paste(icon, (cx - size // 2, ring_y - size // 2), mask.resize((size, size), Image.LANCZOS))
    base.save(WEB / folder / "S250_MW.webp", quality=92)


if __name__ == "__main__":
    for folder in ("cards", "cards_large"):
        build(folder)
    print("ok")
