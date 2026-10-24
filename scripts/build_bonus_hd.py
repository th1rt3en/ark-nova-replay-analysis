"""HD versions of the bonus pictures of the pentagons (5 / 8 conservation, 16 reputation, the reputation track, 2 conservation): BGA's icons upscaled 4x with
Real-ESRGAN (model realesrgan-x4plus-anime, run on the CPU with the `ncnn` Python package), then centred in the pentagon of `bonusTile` (shared.js).

- The BGA bonus tiles that come with their own pentagon (bonus-ignore-conditions, -increased-hand, -icon, -scoring-cards, -sponsor-gray, -extra-shift, -kiosk-pavilion):
  the ground (yellow / beige / the light blue half of the hand tile) and the grey ring are keyed out, so only the picture is kept (edges un-blended from the ground);
  the Marine Worlds mark (the small green token) is left out (it says nothing in online play); parts of a picture that ran into BGA's ring may leave the pentagon
  (they are clipped by it).
- The pictures that sit in a composed pentagon (Partner-Zoo, Fac, size-3, upgrade-card, Worker, conservation): the upscaled icon as it is.
- Marketing (bonus-sponsor) has no pentagon: the whole upscaled picture.
Every picture keeps BGA's size in the pentagon unless it does not fit inside it: then it is made smaller until it does; it is centred on (40, 43) of the pentagon (80 high,
centred on (40, 40)). Output: web/icons_hd/<name>.webp (4x) and web/js/bonus_hd_data.js (where each picture sits: x, y, width, height in pentagon units; the ground).

Needs numpy, scipy, Pillow, ncnn and the Real-ESRGAN ncnn models (realesrgan-x4plus-anime.param / .bin from the release zip realesrgan-ncnn-vulkan-20220424-*.zip of
https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0):  python scripts/build_bonus_hd.py --models <dir with the .param / .bin>
The upscaled raw pictures are kept in build/bonus_hd_raw (delete it to upscale again).
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "web" / "icons"
OUT = ROOT / "web" / "icons_hd"
RAW = ROOT / "build" / "bonus_hd_raw"
DATA = ROOT / "web" / "js" / "bonus_hd_data.js"
SCALE = 4
TILES = {"bonus-ignore-conditions": "r6c1", "bonus-increased-hand": "r6c2", "bonus-icon": "r5c16", "bonus-scoring-cards": "r6c4", "bonus-sponsor-gray": "r6c5",
         "bonus-extra-shift": "r5c15", "bonus-kiosk-pavilion": "r6c3"}
MW = {"bonus-ignore-conditions", "bonus-icon", "bonus-sponsor-gray", "bonus-extra-shift"}
ICON = {"Partner-Zoo": "r10c14", "Fac": "r10c2", "size-3": "r8c10", "upgrade-card": "r10c5", "Worker": "r5c13", "conservation": "r3c15"}
FRAMELESS = {"bonus-sponsor": "r7c1"}
YELLOW, BEIGE, BLUE = (242, 226, 70), (205, 192, 172), (172, 220, 232)      # the grounds of BGA's tiles (references; the real colour is measured)
GROUND_REFS = {n: [BEIGE] if n in MW else [YELLOW] for n in TILES}
GROUND_REFS["bonus-increased-hand"] = [YELLOW, BLUE]
CENTRE = (40, 43)                    # where a picture's box is centred in the pentagon (the money / X token / reputation pictures sit there too)
ICON_H = 48                          # the height of a picture in a composed pentagon (bonusTile's `picture(id, 40, 43, 48)`)
FIT_H = 71                           # the pentagon a picture must stay inside: the inner edge of the ink line (77.8 - 2.2) less a margin


# ---- upscaling ------------------------------------------------------------------------------------------------------------------------------------------------------------
def esrgan(models: Path):
    import ncnn
    net = ncnn.Net()
    net.opt.use_vulkan_compute = False
    net.load_param(str(models / "realesrgan-x4plus-anime.param"))
    net.load_model(str(models / "realesrgan-x4plus-anime.bin"))

    def run(rgb):
        h, w, _ = rgb.shape
        m = ncnn.Mat.from_pixels(np.ascontiguousarray(rgb), ncnn.Mat.PixelType.PIXEL_RGB, w, h)
        m.substract_mean_normalize([], [1 / 255.0] * 3)
        ex = net.create_extractor()
        ex.input("data", m)
        _, out = ex.extract("output")
        return np.clip(np.array(out).transpose(1, 2, 0) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return run


def bleed(rgba):
    """The colour of the transparent pixels taken from their visible neighbours (so the upscaler draws no dark fringe at the edge)."""
    known = rgba[..., 3] > 8
    rgb = rgba[..., :3].astype(np.float32)
    for _ in range(12):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    k = np.roll(np.roll(known, dy, 0), dx, 1)
                    acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * k[..., None]
                    cnt += k
        new = (~known) & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        known |= new
    return rgb.astype(np.uint8)


def upscale(run, src: Path, fill_holes=False) -> np.ndarray:
    im = np.array(Image.open(src).convert("RGBA"))
    if fill_holes:                                                        # (two of BGA's tiles have a few transparent pixels inside: they would become holes)
        holes = ndimage.binary_fill_holes(im[..., 3] > 128) & (im[..., 3] <= 128)
        im[..., 3][holes] = 255
        im[..., :3][holes] = 0
        im[..., :3] = np.where(holes[..., None], bleed(np.dstack([im[..., :3], np.where(holes, 0, im[..., 3])])), im[..., :3])
    pad = 12
    rgb = np.pad(bleed(im), ((pad, pad), (pad, pad), (0, 0)), mode="edge")
    a = np.pad(im[..., 3], pad, mode="constant")
    up = run(rgb)
    aup = run(np.repeat(a[..., None], 3, 2)).mean(axis=2)
    p = pad * SCALE
    return np.dstack([up[p:-p, p:-p], np.clip(aup[p:-p, p:-p], 0, 255).astype(np.uint8)])


# ---- keying the ground out of a bonus tile ------------------------------------------------------------------------------------------------------------------------------------
def key_tile(img: np.ndarray, refs):
    """(content RGBA, the ground colours, the y of the yellow / blue split or None) of an upscaled bonus tile. The ground is the region connected to a band just inside
    the grey ring whose colour is close to one of the ground colours (a flood fill, so a pale picture with an outline is never keyed out); its edge is softened and
    the edge pixels of the picture are un-blended from the ground."""
    rgb = img[..., :3].astype(np.float32)
    solid = ndimage.binary_fill_holes(img[..., 3] > 128)
    band = ndimage.binary_erosion(solid, iterations=34) & ~ndimage.binary_erosion(solid, iterations=56)
    px = rgb[band]
    grounds = []
    for ref in refs:                                                      # each ground: the median of the band pixels close to its reference colour
        near_ref = px[np.sqrt(((px - np.array(ref, np.float32)) ** 2).sum(1)) < 55]
        grounds.append(np.median(near_ref, 0) if len(near_ref) else np.array(ref, np.float32))
    dist = np.array([np.sqrt(((rgb - g) ** 2).sum(2)) for g in grounds])
    d, near = dist.min(0), dist.argmin(0)
    # the grey ring: the pixels near the edge whose colour is the ring's grey or a mix of it and a ground, connected to the outside (a picture that runs into the ring keeps all of itself)
    grey = np.median(rgb[solid & ~ndimage.binary_erosion(solid, iterations=14) & ndimage.binary_erosion(solid, iterations=5)], 0)
    def seg(c0, c1):
        v = c1 - c0
        tt = np.clip(((rgb - c0) * v).sum(2) / (v * v).sum(), 0, 1)
        return np.sqrt(((rgb - (c0 + tt[..., None] * v)) ** 2).sum(2))
    ringlike = np.min([seg(grey, g) for g in grounds], 0) < 24
    lum, sat = rgb.mean(2), rgb.max(2) - rgb.min(2)
    ringlike |= (sat < 22) & (lum > 38) & (lum < 165)                     # (the upscaler draws a darker rim inside the ring)
    outer = solid & ~ndimage.binary_erosion(solid, iterations=44)
    ringlike = (ringlike & outer) | (solid & (img[..., 3] < 200) & outer)
    ring = ndimage.binary_propagation(ndimage.binary_dilation(~solid, iterations=1) & ringlike, mask=ringlike)
    ring |= solid & ~ndimage.binary_erosion(solid, iterations=6)             # (the outermost pixels are ring in any case)
    T = 40
    ground = ring | ~solid
    for k in range(len(grounds)):                                          # one flood per ground (a yellow card on the blue half is not the yellow ground)
        lab, _ = ndimage.label((dist[k] < T) & solid & ~ring)
        half = np.ones_like(solid)
        if len(grounds) == 2:                                              # (the hand tile: the yellow ground is the upper half, the blue one the lower half)
            half[:] = False
            if k == 0: half[: img.shape[0] // 2] = True
            else: half[img.shape[0] // 2:] = True
        seeds = np.unique(lab[band & half & (dist[k] < 22)])
        ground |= np.isin(lab, seeds[seeds > 0])
    a = (~ground).astype(np.float32)
    edge = ndimage.binary_dilation(ground, iterations=2) & ndimage.binary_dilation(~ground, iterations=2) & solid & ~ring
    a[edge] = np.clip((d[edge] - 10) / (T + 14 - 10), 0, 1)
    lab2, n = ndimage.label(a > 0.5)                                        # drop specks of texture and what is left of the ring's edge (small parts lying in the band along the ring)
    if n:
        ones = np.ones_like(a)
        sizes = ndimage.sum(ones, lab2, range(1, n + 1))
        in_band = ndimage.sum((solid & ~ndimage.binary_erosion(solid, iterations=60)).astype(float), lab2, range(1, n + 1)) / np.maximum(sizes, 1)
        drop = np.where((sizes < 350) | ((sizes < 1500) & (in_band > 0.85)))[0] + 1
        a[np.isin(lab2, drop)] = 0
        a[(a > 0) & ~ndimage.binary_dilation(a > 0.5, iterations=2)] = 0
    g = np.array(grounds, np.float32)[near]
    out = np.where(a[..., None] > 0.02, (rgb - (1 - a[..., None]) * g) / np.maximum(a[..., None], 0.02), rgb)
    content = np.dstack([np.clip(out, 0, 255), a * 255]).astype(np.uint8)
    split = None
    if len(grounds) == 2:                                                  # the hand tile: the first row (middle third) where the blue ground begins; the line between the grounds is ground too
        w = img.shape[1]
        rows = ((near == 1) & ground & solid & ~ring)[:, w // 3: 2 * w // 3].mean(1)
        ys = np.where(rows > 0.5)[0]
        split = int(ys.min()) if len(ys) else None
        if split is not None:
            line = np.zeros_like(solid)
            line[split - 8: split + 8] = True
            thin = line & (a > 0) & ~ndimage.binary_opening(a > 0.5, iterations=6)
            content[thin, 3] = 0
    touch = (content[..., 3] > 128) & ndimage.binary_dilation(ring & solid, iterations=6)     # the parts of the picture that run into the ring
    return content, grounds, split, touch


def split_mark(content: np.ndarray):
    """(content without the Marine Worlds mark, the mark) - the mark is the small yellow-green part in the upper half."""
    h, w = content.shape[:2]
    a = content[..., 3] > 128
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=2))
    for k in range(1, n + 1):
        m = (lab == k) & a
        ys, xs = np.where(m)
        r, g, b = content[m][:, :3].astype(float).mean(0)
        if ys.mean() < h * 0.45 and m.sum() < 0.06 * h * w and g > r + 5 and g > b + 40:
            mm = (lab == k)[..., None]
            return np.where(mm, 0, content).astype(np.uint8), np.where(mm, content, 0).astype(np.uint8)
    return content, None


def bbox(rgba):
    ys, xs = np.where(rgba[..., 3] > 20)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


# ---- placing a picture in the pentagon ---------------------------------------------------------------------------------------------------------------------------------------
def pentagon_pts(cx, cy, H):
    R = H / (1 + np.cos(np.pi / 5))
    pts = [(R * np.cos(-np.pi / 2 + i * 2 * np.pi / 5), R * np.sin(-np.pi / 2 + i * 2 * np.pi / 5)) for i in range(5)]
    dy = cy - (-R + R * np.cos(np.pi / 5)) / 2
    return np.array([(x + cx, y + dy) for x, y in pts])


def inside(pts, x, y):
    ok = np.ones_like(x, bool)
    for i in range(5):
        (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % 5]
        ok &= (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) >= 0
    return ok


def place(rgba, units_per_px, free=None):
    """(x, y, w, h) in pentagon units: the picture's box centred on CENTRE, as large as BGA has it unless it would leave the pentagon (`free`: the pixels that may,
    the parts that ran into BGA's ring: they are clipped by the pentagon instead)."""
    x0, y0, x1, y1 = bbox(rgba)
    crop = rgba[y0:y1, x0:x1]
    test = crop[..., 3] > 128
    if free is not None:
        test &= ~free[y0:y1, x0:x1]
    ys, xs = np.where(test)
    pts = pentagon_pts(40, 40, FIT_H)
    k = units_per_px
    while True:
        w, h = crop.shape[1] * k, crop.shape[0] * k
        X, Y = CENTRE[0] - w / 2 + (xs + 0.5) * k, CENTRE[1] - h / 2 + (ys + 0.5) * k
        if inside(pts, X, Y).all() or k < units_per_px * 0.4:
            break
        k *= 0.98
    w, h = crop.shape[1] * k, crop.shape[0] * k
    return crop, [round(CENTRE[0] - w / 2, 2), round(CENTRE[1] - h / 2, 2), round(w, 2), round(h, 2)], k


def save(rgba, name):
    Image.fromarray(rgba, "RGBA").save(OUT / f"{name}.webp", quality=92, alpha_quality=100, method=6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", type=Path, required=True)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    run = None
    raw = {}
    for name, iid in {**TILES, **ICON, **FRAMELESS}.items():
        p = RAW / f"{iid}.png"
        if not p.exists():
            run = run or esrgan(a.models)
            Image.fromarray(upscale(run, ICONS / f"{iid}.webp", fill_holes=name in TILES), "RGBA").save(p)
        raw[name] = np.array(Image.open(p).convert("RGBA"))
    data = {"tiles": {}, "icons": {}, "frameless": {}}
    for name in TILES:
        img = raw[name]
        units = 80 / (bbox(img)[3] - bbox(img)[1])                        # (the tile's pentagon is as high as the composed one: 80 units)
        content, grounds, split, touch = key_tile(img, GROUND_REFS[name])
        if name in MW:                                                     # (the Marine Worlds mark is left out: it says nothing in online play)
            content, _ = split_mark(content)
        crop, box, k = place(content, units, touch)
        x0, y0 = bbox(content)[:2]
        entry = {"box": box, "ground": "beige" if name in MW else "yellow", "clip": bool((touch & (content[..., 3] > 128)).any())}
        if split is not None:                                              # the light blue lower half moves with the picture
            entry["split"] = round(box[1] + (split - y0) * k, 2)
            entry["lower"] = "#%02X%02X%02X" % tuple(int(v) for v in grounds[1])
        if name in MW:
            entry["beige"] = "#%02X%02X%02X" % tuple(int(v) for v in grounds[0])
        save(crop, name)
        data["tiles"][name] = entry
    beiges = [np.array([int(e["beige"][i:i + 2], 16) for i in (1, 3, 5)]) for e in data["tiles"].values() if "beige" in e]
    data["beige"] = "#%02X%02X%02X" % tuple(int(v) for v in np.mean(beiges, 0))      # (one beige ground for every Marine Worlds tile)
    for name, iid in ICON.items():
        img = raw[name]
        units = ICON_H / (bbox(img)[3] - bbox(img)[1])
        crop, box, _ = place(img, units)
        save(crop, name)
        data["icons"][name] = {"box": box}
    for name in FRAMELESS:
        img = raw[name]
        x0, y0, x1, y1 = bbox(img)
        save(img[y0:y1, x0:x1], name)
        data["frameless"][name] = {"size": [int(x1 - x0), int(y1 - y0)]}
    DATA.write_text("// generated by scripts/build_bonus_hd.py: where the HD bonus pictures (web/icons_hd) sit in the pentagon of bonusTile (x, y, width, height in its units)\n"
                    "export const BONUS_HD = " + json.dumps(data, indent=4) + ";\n", encoding="utf-8")
    print("wrote", len(data["tiles"]) + len(data["icons"]) + len(data["frameless"]), "pictures to", OUT)


if __name__ == "__main__":
    main()
