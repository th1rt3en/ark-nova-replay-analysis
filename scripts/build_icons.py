"""Cut the individual icons out of the BGA icon sheet (bga_ui_screenshots/icons.png, 2048x2048 RGBA, transparent background).

The icons sit in rows separated by empty bands, and within a row they are separated by empty columns, so the sheet is split by projection
(row band, then column band inside it). Every icon is saved as web/icons/r<row>c<col>.webp (row / column counted from 1, trimmed to its
bounding box) and listed in web/icons/icons.json with its size; web/js/icons.js refers to them by these ids (see ICON_IDS there).

Needs Pillow and numpy:  python scripts/build_icons.py [--contact-sheet out.png]
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "bga_ui_screenshots" / "icons.png"
OUT = ROOT / "web" / "icons"
MIN_GAP = 4          # pixels of empty space that separate two bands / two icons
MIN_SIZE = 12        # ignore specks smaller than this


def bands(mask: np.ndarray, axis: int) -> list[tuple[int, int]]:
    """[start, end) of the runs of non-empty lines along `axis` (merging runs closer than MIN_GAP)."""
    filled = mask.any(axis=axis)
    runs, start = [], None
    for i, f in enumerate(filled):
        if f and start is None:
            start = i
        elif not f and start is not None:
            runs.append([start, i])
            start = None
    if start is not None:
        runs.append([start, len(filled)])
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < MIN_GAP:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [(a, b) for a, b in merged if b - a >= MIN_SIZE]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--contact-sheet")
    args = ap.parse_args()
    sheet = Image.open(SHEET).convert("RGBA")
    alpha = np.asarray(sheet.getchannel("A")) > 20
    OUT.mkdir(parents=True, exist_ok=True)
    meta, shown = {}, []
    for r, (y0, y1) in enumerate(bands(alpha, axis=1), start=1):
        for c, (x0, x1) in enumerate(bands(alpha[y0:y1], axis=0), start=1):
            box = alpha[y0:y1, x0:x1]
            ys = np.where(box.any(axis=1))[0]
            icon = sheet.crop((x0, y0 + ys[0], x1, y0 + ys[-1] + 1))
            name = f"r{r}c{c}"
            icon.save(OUT / f"{name}.webp", lossless=True)
            meta[name] = {"image": f"{name}.webp", "size": list(icon.size), "pos": [x0, y0 + int(ys[0])]}       # pos: top left corner on the sheet
            shown.append((name, icon))
    (OUT / "icons.json").write_text(json.dumps(meta, indent=4))
    print(f"saved {len(meta)} icons to {OUT}")
    if args.contact_sheet:
        cols, cell = 10, 200
        S = Image.new("RGBA", (cols * cell, ((len(shown) + cols - 1) // cols) * cell), (70, 110, 70, 255))
        d = ImageDraw.Draw(S)
        for i, (name, icon) in enumerate(shown):
            t = icon.copy()
            t.thumbnail((cell - 20, cell - 36))
            S.alpha_composite(t, ((i % cols) * cell + 10, (i // cols) * cell + 28))
            d.text(((i % cols) * cell + 6, (i // cols) * cell + 6), name, fill=(255, 255, 0, 255))
        S.convert("RGB").save(args.contact_sheet)


if __name__ == "__main__":
    main()
