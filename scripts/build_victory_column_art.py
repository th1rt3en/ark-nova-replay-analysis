"""Makes scripts/cardgen/site/art/S274_VC.jpg (small and enlarged card): the card face of the sponsor S274 shown as the Victory Column with the picture of the incumbent Emu Cup winner
(data_manual/emu_cup_photos/<file>, see PHOTO below). The face is the Mascot Statue image of the fan site (card background, 745 x 1040) with the photo area (down to the title bar)
replaced by the new picture; the strength tab and the purple play-effect box in the top left corner of the original stay on top of it (their shapes are drawn by hand: SCALE 4
supersampled rounded rectangles; the soft shadow under them is made again). The photo is scaled to cover the photo area, starts at the top edge and is shown so that the sign SKANSEN (SIGN_X) stands in the middle of the card.
Run with the system python (needs Pillow, numpy, scipy):  python scripts/build_victory_column_art.py"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PHOTO = ROOT / "data_manual" / "emu_cup_photos" / "04-skalding.png"
BASE = ROOT / "scripts" / "cardgen" / "site" / "img" / "sponsors" / "S274_MascotStatue.jpg"
OUT = ROOT / "scripts" / "cardgen" / "site" / "art" / "S274_VC.jpg"
W, H, PHOTO_H = 745, 1040, 572           # card size; the photo area ends where the title bar starts (the enlarged card: photo 50 % + winner row 5 %)
SCALE = 4
SIGN_X = 0.405                           # (the middle of the sign SKANSEN as a fraction of the photo's width: the card shows the photo so that it stands in the middle)
SMALL_SHIFT = -105                        # (the photo moves down by this much so that the face stays clear of the income box)


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


def tab_only(base: Image.Image):
    """The strength tab of the printed card (top left): (layer the size of the card, its mask)."""
    return base, Image.fromarray(np.asarray(rounded_mask((-6, -6, 148.5, 147.5), (0, 0, 24, 0))))


def build() -> None:
    """The card face: the photo covers the top PHOTO_H px (scaled to cover the area; SMALL_SHIFT < 0 moves it down so that the face stays clear of the income box, the sky above it is the photo's
    top rows mirrored and blurred); the strength tab and the purple income box of the printed card are on top."""
    photo_h, shift = PHOTO_H, SMALL_SHIFT
    base = Image.open(BASE).convert("RGB").resize((W, H), Image.LANCZOS)
    src = Image.open(PHOTO).convert("RGB")
    k = max(W / src.width, photo_h / src.height)      # (the last: the sign can only be in the middle when enough of the photo is left of it)
    ph = src.resize((round(src.width * k), round(src.height * k)), Image.LANCZOS)
    left = min(max(round(SIGN_X * ph.width - W / 2), 0), ph.width - W)
    if shift < 0:      # (the photo moves down by -shift px so that the face stays clear of the income box: the sky above it is made by mirroring and blurring the photo's top rows)
        pad = -shift
        top = ph.crop((0, 0, ph.width, pad)).transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(6))
        tall = Image.new("RGB", (ph.width, ph.height + pad))
        tall.paste(top, (0, 0))
        tall.paste(ph, (0, pad))
        ph, shift = tall, 0
    out = base.copy()
    out.paste(ph.crop((left, shift, left + W, shift + photo_h)), (0, 0))
    layer, ov = tab_only(base)
    ov = np.asarray(ov)
    ov = np.maximum(ov, np.asarray(rounded_mask((167.5, -6, 419.5, 164.5), (0, 0, 42, 62))))
    shadow = Image.fromarray(ov).filter(ImageFilter.GaussianBlur(7)).point(lambda v: int(v * 0.45))
    black = Image.new("RGB", (W, H), (10, 12, 18))
    out = Image.composite(black, out, shadow.transform(shadow.size, Image.AFFINE, (1, 0, 0, 0, 1, -5)))     # (shadow 5 px lower)
    out = Image.composite(layer, out, Image.fromarray(ov))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, quality=93)
    print("written", OUT, out.size, "photo", src.size, "scale", round(k, 4), "left", left)


def main() -> None:
    build()


if __name__ == "__main__":
    main()
