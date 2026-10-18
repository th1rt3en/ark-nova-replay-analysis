"""Builds web/icons/played.webp: the icon of the "played cards" button of the hand tray (dock.js, KIND_ICON.played).

The animal tile and the sponsor tile of the icon sheet (action-animals r3c7, action-sponsors r3c12) overlap, the sponsor tile in front at the bottom right, with a soft shadow.
Needs Pillow; run it with the system python from the project root:  python scripts/build_played_icon.py
"""
import json
from pathlib import Path
from PIL import Image, ImageFilter

ICONS = Path(__file__).resolve().parent.parent / 'web' / 'icons'
SIZE, TILE = 118, 71


def tile(name):
    ids = json.loads((ICONS / 'names.json').read_text(encoding='utf-8'))
    return Image.open(ICONS / (ids[name] + '.webp')).convert('RGBA').resize((TILE, TILE), Image.LANCZOS)


def main():
    c = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    c.alpha_composite(tile('action-animals'), (2, 3))
    c.alpha_composite(tile('action-sponsors'), (SIZE - TILE - 2, SIZE - TILE - 2))
    shadow = Image.new('RGBA', c.size, (0, 0, 0, 0))
    shadow.putalpha(c.split()[3].filter(ImageFilter.GaussianBlur(2.5)).point(lambda v: int(v * .5)))
    out = Image.new('RGBA', c.size, (0, 0, 0, 0))
    out.alpha_composite(shadow, (0, 2))
    out.alpha_composite(c)
    out.save(ICONS / 'played.webp', 'WEBP', quality=92, method=6)
    print('written', ICONS / 'played.webp')


if __name__ == '__main__':
    main()
