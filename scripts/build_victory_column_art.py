"""Makes scripts/cardgen/site/art/S274_VC.jpg: the card face of the sponsor S274 shown as the Victory Column with the picture of the incumbent Emu Cup winner
(data_manual/emu_cup_photos/<file>, see PHOTO below). The face is the Mascot Statue image of the fan site (card background, 745 x 1040) with the photo area (down to the title bar)
replaced by the new picture; the strength tab and the purple play-effect box in the top left corner of the original stay on top of it (their shapes are drawn by hand: SCALE 4
supersampled rounded rectangles; the soft shadow under them is made again). The photo is scaled to the card's width; its missing upper part is filled with its own top edge.
Run with the system python (needs Pillow, numpy, scipy):  python scripts/build_victory_column_art.py"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PHOTO = ROOT / "data_manual" / "emu_cup_photos" / "04-skalding.png"
BASE = ROOT / "scripts" / "cardgen" / "site" / "img" / "sponsors" / "S274_MascotStatue.jpg"
OUT = ROOT / "scripts" / "cardgen" / "site" / "art" / "S274_VC.jpg"
W, H, PHOTO_H = 745, 1040, 566           # card size; the photo area ends where the title bar starts
SCALE = 4
DOWN = 36                                # (px the picture is moved down, the lower edge is cut off: the head stays clear of the purple box)


def rounded_mask(box, radii) -> Image.Image:
    """box = (x0, y0, x1, y1); radii = (top-left, top-right, bottom-right, bottom-left); an anti-aliased 'L' mask of the card's size (drawn SCALE times larger, then reduced)."""
    x0, y0, x1, y1 = box
    ys, xs = np.mgrid[0:H * SCALE, 0:W * SCALE]
    x, y = (xs + 0.5) / SCALE, (ys + 0.5) / SCALE
    inside = (x >= x0) & (x <= x1) & (y >= y0) & (y <= y1)
    for (cx, cy, r, sx, sy) in ((x0 + radii[0], y0 + radii[0], radii[0], -1, -1), (x1 - radii[1], y0 + radii[1], radii[1], 1, -1),
                                (x1 - radii[2], y1 - radii[2], radii[2], 1, 1), (x0 + radii[3], y1 - radii[3], radii[3], -1, 1)):
        if r > 0:
            corner = ((x - cx) * sx > 0) & ((y - cy) * sy > 0)
            inside &= ~(corner & ((x - cx) ** 2 + (y - cy) ** 2 > r * r))
    return Image.fromarray((inside * 255).astype("uint8")).resize((W, H), Image.LANCZOS)


def main() -> None:
    base = Image.open(BASE).convert("RGB").resize((W, H), Image.LANCZOS)
    src = Image.open(PHOTO).convert("RGB")
    ph = src.resize((W, round(src.height * W / src.width)), Image.LANCZOS)
    area = Image.new("RGB", (W, PHOTO_H))
    top = PHOTO_H - ph.height + DOWN                            # px missing above the photo
    if top > 0:
        edge = np.asarray(ph.crop((0, 0, W, 6))).astype(float).mean(0)            # the mean of its top rows, column by column
        edge = np.stack([np.convolve(np.pad(edge[:, c], 25, mode="edge"), np.ones(51) / 51, mode="valid") for c in range(3)], 1)
        fill = np.repeat(edge[None], top, 0)
        fill += np.random.default_rng(1).normal(0, 1.2, fill.shape)               # (a little grain: no banding)
        area.paste(Image.fromarray(np.clip(fill, 0, 255).astype("uint8")), (0, 0))
        area.paste(ph, (0, top))                                # (a photo that reaches below the area is cut there)
    else:
        area.paste(ph, (0, top // 2))
    out = base.copy()
    out.paste(area, (0, 0))
    tab = rounded_mask((-6, -6, 148.5, 147.5), (0, 0, 24, 0))
    box = rounded_mask((167.5, -6, 419.5, 164.5), (0, 0, 42, 62))
    ov = np.maximum(np.asarray(tab), np.asarray(box))
    shadow = Image.fromarray(ov).filter(ImageFilter.GaussianBlur(7)).point(lambda v: int(v * 0.45))
    black = Image.new("RGB", (W, H), (10, 12, 18))
    out = Image.composite(black, out, shadow.transform(shadow.size, Image.AFFINE, (1, 0, 0, 0, 1, -5)))     # (shadow 5 px lower)
    out = Image.composite(base, out, Image.fromarray(ov))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, quality=93)
    print("written", OUT, out.size, "photo", src.size, "-> top fill", max(top, 0), "px")


if __name__ == "__main__":
    main()
