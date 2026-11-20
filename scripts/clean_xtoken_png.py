"""Clean the upscaled X-token PNGs of the upscaling round (bonus-remaining-v3: xtoken-dotted.png, xtoken.png): an opaque body in one flat dark colour (the originals are only 253/254 opaque and the dotted one has a semi-transparent smear on the right), the antialiased edge, the white border and the four squares kept as they are. The results are the archived (unused) files assets_src/icons_hd_lossless/xtoken-dotted.webp and xtoken-solid.webp; the site uses the vectors in web/icons_hd/xtoken-*.svg. Usage: python scripts/clean_xtoken_png.py SRC.png DST.png (needs numpy, scipy, Pillow)."""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

def clean(src, dst):
    im = np.array(Image.open(src).convert('RGBA'))
    rgb, a = im[..., :3].astype(float), im[..., 3]
    sil = ndi.binary_fill_holes(a > 127)
    inner = ndi.binary_erosion(sil, iterations=5)              # the antialiased edge band (5 px) is left alone
    lum = rgb.mean(2)
    white = inner & (lum > 170) & (a > 200)                     # border ring + squares (the smear is faint, a < 200 or small)
    lab, n = ndi.label(white)
    sizes = ndi.sum(white, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 4000])
    dark_px = inner & ~ndi.binary_dilation(white, iterations=8) & (a > 250) & (lum < 80)
    dark = np.median(rgb[dark_px], axis=0)
    out = im.copy()
    soft = inner & ~keep & ~ndi.binary_dilation(keep, iterations=0)
    # dark body: everything inside that is not a kept white piece nor its antialiased rim (3 px around it)
    rim = ndi.binary_dilation(keep, iterations=4) & ~keep
    body = inner & ~keep & ~rim
    out[body, :3] = np.round(dark).astype(np.uint8)
    # the antialiased rim of the white pieces: opaque, colour kept where it is clearly part of the blend, else dark
    out[inner, 3] = 255
    print(src, 'components', n, 'kept', int((sizes > 4000).sum()), 'dark', dark.round(), 'sil', int(sil.sum()))
    Image.fromarray(out).save(dst, optimize=True)

clean(sys.argv[1], sys.argv[2])
