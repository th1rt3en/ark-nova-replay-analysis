"""Cut the silver effect badge out of the Marine Worlds action card variants (upstream img/actions/en/<type>/<type>_<variant>_<side>_*.webp).

Every card of the set has the circle at the same place near the top left (centre (231, 89.6), radius 70.6 in the 744x1039 image) but the blue
action-type panel covers its left edge. The covered part is rebuilt by mirroring the right half of the circle across the vertical diameter, then everything outside the
circle is made transparent (anti-aliased), so the result is a full round badge. Variants 1-4 of the 5 action cards, both sides (I and II):
web/action_icons/<type>_<variant>_<side>.webp  (type: animals, association, build, cards, sponsors; side 1 = I, 2 = II).

Needs Pillow and numpy:  python scripts/build_action_icons.py [--contact-sheet out.png]
"""
import argparse
import glob
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public" / "img" / "actions" / "en"
OUT = ROOT / "web" / "action_icons"
TYPES = ["animals", "association", "build", "cards", "sponsors"]
CX, CY, R = 231.0, 89.6, 70.6
SCALE = 4                       # supersampling for the circle edge


def panel_edge(a: np.ndarray) -> int:
    """First column right of the circle's left edge that is no longer the action-type panel (blue on side I, purple on side II)."""
    row = a[round(CY)].astype(int)
    x0 = round(CX - R) - 2
    panel = row[x0]                                              # the panel colour at the left end of the circle
    for x in range(x0 + 1, round(CX)):
        if np.abs(row[x] - panel).sum() > 90:
            return x
    return x0


def badge(path: str) -> Image.Image:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im)
    edge = panel_edge(a)
    out = a.copy()
    h, w, _ = a.shape
    for x in range(round(CX - R) - 2, edge + 4):          # the columns covered by the panel (plus its anti-aliased border)
        sx = round(2 * CX - x)                                  # the mirror image of column x
        out[:, x] = a[:, sx]
    box = (round(CX - R) - 1, round(CY - R) - 1, round(CX + R) + 2, round(CY + R) + 2)
    img = Image.fromarray(out).crop(box).convert("RGBA")
    mask = Image.new("L", (img.width * SCALE, img.height * SCALE), 0)
    cx, cy = (CX - box[0]) * SCALE, (CY - box[1]) * SCALE
    ImageDraw.Draw(mask).ellipse((cx - (R - 0.8) * SCALE, cy - (R - 0.8) * SCALE, cx + (R - 0.8) * SCALE, cy + (R - 0.8) * SCALE), fill=255)
    img.putalpha(mask.resize(img.size, Image.LANCZOS))
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--contact-sheet")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    shown = []
    for t in TYPES:
        for v in (1, 2, 3, 4):
            for side in (1, 2):
                files = glob.glob(str(SRC / t / f"{t}_{v}_{side}_*"))
                if not files:
                    print(f"missing: {t} variant {v} side {side}")
                    continue
                img = badge(files[0])
                img.save(OUT / f"{t}_{v}_{side}.webp", quality=92)
                shown.append((f"{t}_{v}_{side}", img))
    print(f"saved {len(shown)} badges to {OUT}")
    if args.contact_sheet:
        cols, cell = 8, 160
        S = Image.new("RGBA", (cols * cell, ((len(shown) + cols - 1) // cols) * (cell + 16)), (60, 90, 60, 255))
        d = ImageDraw.Draw(S)
        for i, (name, img) in enumerate(shown):
            S.alpha_composite(img, ((i % cols) * cell + 8, (i // cols) * (cell + 16) + 16))
            d.text(((i % cols) * cell + 4, (i // cols) * (cell + 16) + 2), name, fill=(255, 255, 0, 255))
        S.convert("RGB").save(args.contact_sheet)


if __name__ == "__main__":
    main()
