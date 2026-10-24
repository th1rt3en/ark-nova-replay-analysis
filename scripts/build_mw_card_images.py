"""Marine Worlds versions of sponsor cards whose icons changed: web/cards/<key>_MW.webp and web/cards_large/<key>_MW.webp (the viewer uses them when the game
has Marine Worlds, see `card_catalog` in replay/view.py). Needs Pillow; run with the system `python`.

S250 Sea Turtle Tank, as on BGA: 2 water icons (the flag of the Aquarium S245 is moved over the one of the card); the photo is mirrored (the turtle looks left, so its
head is not under the icons; the top strip with the printed panels and icons stays as printed, the photo below it is flipped and blended in over 12 px); the grey tag
tab on the right is made longer, down to the centre of the sea animal icon under the reptile icon, so the icon's round lower half closes the tab as on BGA (the
printed reptile icon is put back on the tab); the icon is the viewer's own badge `web/badges/SeaAnimal.webp` (the artwork of the reptile disc, checked against the printed
one) cut to a disc in a white ring. All coordinates are large card pixels (745 x 1040), scaled for the small card.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

WEB = Path(__file__).resolve().parents[1] / "web"
OUT = WEB                                                    # (run as a script with a folder argument: cards/ and cards_large/ are written there instead, for trying it out)
W = 745                                                      # the large cards are 745 wide, the small ones are scaled copies
FLAG = (136, 30, 243, 140)                                   # the flag of the water icons
PHOTO = 520                                                  # height of the photo (50 % of the card)
SEAM = (172, 184)                                            # the unmirrored top strip ends here, blended with the mirrored photo down to the second value
TAB = (601, 711, 220)                                        # the tag tab: x0, x1, new bottom edge (= the sea animal icon's centre: the icon's lower half closes the tab)
TAB_COLOR = (218, 221, 231)
REPTILE = (656, 92, 53)                                      # the printed reptile icon: centre x, y, radius that is copied back
OCTOPUS = (656, 220, 110, 102)                               # the sea animal icon: centre x, y, ring diameter, disc diameter (as the printed reptile icon: centre y 91)


def badge_icon(name: str, ring_d: int, disc_d: int) -> tuple[Image.Image, Image.Image]:
    """The badge as a disc in a white ring (drawn 8 times larger, then scaled down), and the mask of the ring."""
    S = 8
    big = ring_d * S
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    ring = Image.new("RGB", (big, big), (255, 255, 255))
    disc = Image.open(WEB / "badges" / f"{name}.webp").convert("RGB").resize((disc_d * S,) * 2, Image.LANCZOS)
    dm = Image.new("L", disc.size, 0)
    ImageDraw.Draw(dm).ellipse((0, 0, disc.width - 1, disc.height - 1), fill=255)
    ring.paste(disc, ((big - disc.width) // 2,) * 2, dm)
    return ring.resize((ring_d, ring_d), Image.LANCZOS), mask.resize((ring_d, ring_d), Image.LANCZOS)


def build(folder: str) -> None:
    src = Image.open(WEB / folder / "S250.webp").convert("RGBA")
    donor = Image.open(WEB / folder / "S245.webp").convert("RGBA")
    k = src.width / W
    sc = lambda v: round(v * k)
    box = tuple(sc(v) for v in FLAG)
    src.paste(donor.crop(box), box[:2])                      # two water icons
    out = src.copy()
    ph = sc(PHOTO)
    flip = ImageOps.mirror(src.crop((0, 0, src.width, ph)))
    y0, y1 = sc(SEAM[0]), sc(SEAM[1])
    m = Image.new("L", (src.width, ph), 0)
    d = ImageDraw.Draw(m)
    d.rectangle((0, y1, src.width, ph), fill=255)
    for y in range(y0, y1):
        d.line((0, y, src.width, y), fill=int(255 * (y - y0) / max(1, y1 - y0)))
    out.paste(flip, (0, 0), m)
    # the longer tab: runs down to the sea animal icon's centre, so the tab ends in the lower half of the icon's ring (as on BGA)
    x0, x1, bot = sc(TAB[0]), sc(TAB[1]), sc(TAB[2])
    ImageDraw.Draw(out).rectangle((x0, 0, x1, bot), fill=TAB_COLOR)
    cx, cy, rr = (sc(v) for v in REPTILE)
    ring = Image.new("L", out.size, 0)
    ImageDraw.Draw(ring).ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=255)
    out.paste(src, (0, 0), ring.filter(ImageFilter.GaussianBlur(.5 * k)))
    ox, oy, od, dd = (sc(v) for v in OCTOPUS)
    icon, mask = badge_icon("SeaAnimal", od, dd)
    out.paste(icon, (ox - od // 2, oy - od // 2), mask)
    out.save(OUT / folder / "S250_MW.webp", quality=92)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        OUT = Path(sys.argv[1])
    for folder in ("cards", "cards_large"):
        (OUT / folder).mkdir(parents=True, exist_ok=True)
        build(folder)
    print("ok")
