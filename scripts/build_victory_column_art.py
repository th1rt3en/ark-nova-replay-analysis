"""Makes scripts/cardgen/site/art/S274_VC_<season, 2 digits>.jpg (small and enlarged card) for every Emu Cup winner of web/emu_cup_winners/winners.json whose photo exists, and S274_VC.jpg = the newest
winner's: the card face of the sponsor S274 shown as the Victory Column with the picture of that winner (data_manual/emu_cup_photos/<photo>; `art` of the winner: `sign_x` = the middle of the face as a
fraction of the scaled photo's width (default 0.5), `shift` = how far the photo starts below its top edge in px of the card (positive: cut off at the top; negative: the photo moves down, the sky above is
mirrored and blurred; default 0)). The face is the Mascot Statue image of the fan site (card background, 745 x 1040) with the photo area (down to the title bar)
replaced by the new picture; the strength tab and the purple play-effect box in the top left corner of the original stay on top of it (their shapes are drawn by hand: SCALE 4
supersampled rounded rectangles; the soft shadow under them is made again). The photo is scaled to cover the photo area, starts at the top edge and is shown so that the sign SKANSEN (`sign_x`) stands in the middle of the card.
Run with the system python (needs Pillow, numpy, scipy):  python scripts/build_victory_column_art.py"""
from pathlib import Path

import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
WINNERS = ROOT / "web" / "emu_cup_winners" / "winners.json"
PHOTOS = ROOT / "data_manual" / "emu_cup_photos"
BASE = ROOT / "scripts" / "cardgen" / "site" / "img" / "sponsors" / "S274_MascotStatue.jpg"
ART = ROOT / "scripts" / "cardgen" / "site" / "art"
W, H, PHOTO_H = 745, 1040, 572           # card size; the photo area ends where the title bar starts (the enlarged card: photo 50 % + winner row 5 %)
SCALE = 4


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


def build(w: dict, outs: list) -> None:
    """The card face of one winner `w` (an entry of winners.json), written to every path of `outs`: the photo covers the top PHOTO_H px (scaled to cover the area, `art.shift` moves it as described above);
    the strength tab and the purple income box of the printed card are on top."""
    art = w.get("art", {})
    photo_h, shift = PHOTO_H, art.get("shift", 0)
    base = Image.open(BASE).convert("RGB").resize((W, H), Image.LANCZOS)
    src = Image.open(PHOTOS / w["photo"]).convert("RGB")
    k = max(W / src.width, photo_h / src.height)
    ph = src.resize((round(src.width * k), round(src.height * k)), Image.LANCZOS)
    left = min(max(round(art.get("sign_x", 0.5) * ph.width - W / 2), 0), ph.width - W)
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
    ART.mkdir(parents=True, exist_ok=True)
    for o in outs:
        out.save(ART / o, quality=93)
    print("written", ", ".join(outs), out.size, "photo", src.size, "scale", round(k, 4), "left", left, "shift", art.get("shift", 0))


def main() -> None:
    """python scripts/build_victory_column_art.py [season ...]  (no season: every winner with a photo)"""
    winners = [w for w in json.loads(WINNERS.read_text("utf-8"))["winners"] if w.get("photo") and (PHOTOS / w["photo"]).exists()]
    newest = max(winners, key=lambda w: w["season"])
    only = {int(a) for a in sys.argv[1:]}
    for w in sorted(winners, key=lambda w: w["season"]):
        if only and w["season"] not in only:
            continue
        build(w, [f"S274_VC_{int(w['season']):02d}.jpg"] + (["S274_VC.jpg"] if w is newest else []))      # (S274_VC = the incumbent champion: the default of the Victory Column)


if __name__ == "__main__":
    main()
