"""Cuts the printed bottom strip of every sponsor card (instant effect chip, endgame chip, reputation / conservation / appeal chips) out of the 745 x 1040 scans
in scripts/cardgen/site/img/sponsors/ and writes it as a transparent PNG to scripts/cardgen/site/img/sponsor_strips/<bga id>.png.

The generated sponsor cards paint their own text panel over the printed lower half, so the chips would be lost; BaseSponsorCard.tsx puts this strip back
at the bottom edge (see changelog). The pale blue paper around the chips becomes transparent: it is found by flood fill from the top edge of the crop, so
white areas inside a chip (hexagons, icons) stay opaque.   Run with the system python (Pillow + numpy + scipy):  python scripts/build_sponsor_strips.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "scripts" / "cardgen" / "site" / "img" / "sponsors"
OUT = ROOT / "scripts" / "cardgen" / "site" / "img" / "sponsor_strips"
TOP_HIGH = 740                                   # the crop starts here when a chip rises above y = 790 (the yellow chips of Release of Patents / Basic Research start at y = 765; the scans have no text there)
TOP = 790                                   # the usual crop start (the tallest strips start near y = 820; the text panel's last line ends above y = 884)


def strip(path: Path, top: int = TOP) -> Image.Image:
    im = Image.open(path).convert("RGB")
    crop = im.crop((0, top, im.width, im.height))
    a = np.asarray(crop).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    paper = (b - r >= 6) & (a.min(2) >= 185)                     # the pale blue paper (chips are yellow, brown, grey, green, salmon: none is bluish and light)
    lab, _ = ndimage.label(paper)
    outside = np.isin(lab, np.unique(np.concatenate([lab[0, :], lab[:, 0], lab[:, -1]]))[1:])
    chip = ~outside
    chip = ndimage.binary_opening(chip, iterations=1)             # specks of paper noise
    cl, n = ndimage.label(chip)                                  # drop loose specks (a chip is thousands of pixels)
    sizes = ndimage.sum(chip, cl, range(1, n + 1))
    chip = np.isin(cl, [i + 1 for i, v in enumerate(sizes) if v >= 1500])
    chip = ndimage.binary_erosion(chip, iterations=1)            # the blue anti-aliasing halo
    alpha = Image.fromarray((chip * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = crop.convert("RGBA")
    out.putalpha(alpha)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for p in sorted(SRC.glob("S*_*.jpg")):
        out = strip(p)
        if np.asarray(out.getchannel("A"))[:8].max() > 20:        # a chip is cut at the crop's top edge: start higher (for a scan where the paper filter fails the whole crop would become a chip: then the usual start stays)
            high = strip(p, TOP_HIGH)
            if np.asarray(high.getchannel("A"))[0].max() <= 20:
                out = high
        out.save(OUT / (p.stem + ".png"), optimize=True)
        n += 1
    print(n, "strips written to", OUT)


if __name__ == "__main__":
    main()
