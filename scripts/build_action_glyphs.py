"""Make the action glyphs of the Turn hover's Order view (web/js/move-hover.js `actionTile`): the black icon of each action tile and of the X token,
as a white shape on transparent, used by CSS as a mask (so it can take any colour): web/action_glyphs/<type>.webp
(type: animals, association, build, cards, sponsors, x).

Source: the icon sheet cut by build_icons.py (web/icons/<id>.webp, ids from web/icons/names.json: action-animals ... action-sponsors, xtoken).
The tile's own black frame is left out (an inset of 10 of the 118 px), the glyph is made a little bolder (max filter 3), the cards icon much bolder
(max filter 7: its thin outlines vanish on a coloured chip at 15 px).

Needs Pillow:  python scripts/build_action_glyphs.py
"""
import json
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "web" / "icons"
OUT = ROOT / "web" / "action_glyphs"
NAMES = {"animals": "action-animals", "association": "action-association", "build": "action-build", "cards": "action-cards",
         "sponsors": "action-sponsors", "x": "xtoken"}
BOLD = {"cards": 7, "x": 0}         # max filter size (0 = none); the others 3
SIZE = 64                          # output side in px


def glyph(src: Path, inset: int, bold: int) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    mask = Image.new("L", (w - 2 * inset, h - 2 * inset), 0)
    px = im.load()
    for y in range(inset, h - inset):
        for x in range(inset, w - inset):
            r, g, b, a = px[x, y]
            if a > 128 and r + g + b < 300:
                mask.putpixel((x - inset, y - inset), 255)
    if bold:
        mask = mask.filter(ImageFilter.MaxFilter(bold))
    out = Image.new("RGBA", mask.size, (255, 255, 255, 0))
    out.putalpha(mask)
    return out.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    names = json.loads((ICONS / "names.json").read_text(encoding="utf8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for kind, name in NAMES.items():
        src = ICONS / (names[name] + ".webp")
        g = glyph(src, 0 if kind == "x" else 10, BOLD.get(kind, 3))
        g.save(OUT / (kind + ".webp"), lossless=True)
        print(kind, "<-", src.name)


if __name__ == "__main__":
    main()
