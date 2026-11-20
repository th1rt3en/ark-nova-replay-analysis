"""Make the HD pictures of web/icons_hd that the site loads from the lossless originals in assets_src/icons_hd_lossless/.

The originals (the approved restorations at their full resolution, and the whole bonus tiles of build_hd_tiles.py) are kept lossless and are
never deployed (the Dockerfile copies only src/ and web/, Pages only web/). The site gets near-lossless WebP: quality 95 with the transparency
lossless, about 80 % smaller and not different to the eye at the sizes the pictures are shown (50-250 px, the originals are 1000-1400 px).

    python scripts/compress_hd_icons.py [--quality 95] [--check]

Needs Pillow. `--check` prints the largest per-pixel difference of each picture (premultiplied RGB, 0-255) and writes nothing.
The pictures of `ELSEWHERE` (pavilion, hollywood) go to the files named there, not to icons_hd; `ARCHIVE_ONLY` ones are skipped.
When a picture changes: replace its original in assets_src/icons_hd_lossless/, run this. build_hd_tiles.py writes the lossless tiles into the
originals' folder (--out), build_library_tiles.py reads the compressed icons (the drawer shows them small).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets_src" / "icons_hd_lossless"
WEB = ROOT / "web"
OUT = WEB / "icons_hd"
ARCHIVE_ONLY = {"xtoken-dotted", "xtoken-solid"}          # (cleaned upscaled PNGs kept for the archive: the site draws the X tokens from the vectors in web/icons_hd/xtoken-*.svg)
ELSEWHERE = {                                              # (pictures that the site loads from another place than web/icons_hd/, relative to web/; one file each)
    "pavilion": ["bonus/pavilion.webp", "enclosures/pavilion_hd.webp"],      # the placement bonus (board.js, map_editor.js) and the building sprite (enclosures/sprites.json)
    "hollywood": ["bonus/hollywood_h.webp"],                                 # the H sign of maps 8 / 8a (board.js)
}


def premul(im: Image.Image) -> np.ndarray:
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    return a[..., :3] * a[..., 3:] / 255


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", type=int, default=95)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    total_in = total_out = 0
    for src in sorted(SRC.glob("*.webp")):
        if src.stem in ARCHIVE_ONLY:
            continue
        im = Image.open(src).convert("RGBA")
        dest = OUT / src.name
        if src.stem in ELSEWHERE:
            for rel in ELSEWHERE[src.stem][1:]:
                if not args.check:
                    im.save(WEB / rel, "WEBP", quality=args.quality, alpha_quality=100, method=6)
            dest = WEB / ELSEWHERE[src.stem][0]
        if args.check:
            import io
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=args.quality, alpha_quality=100, method=6)
            back = Image.open(io.BytesIO(buf.getvalue()))
            d = np.abs(premul(im) - premul(back))
            print(f"{src.name:36s} max {d.max():5.1f}  mean {d.mean():.3f}  {src.stat().st_size // 1024:5d}K -> {buf.tell() // 1024:4d}K")
            continue
        im.save(dest, "WEBP", quality=args.quality, alpha_quality=100, method=6)
        total_in += src.stat().st_size
        total_out += dest.stat().st_size
        print(f"{src.name:36s} {src.stat().st_size // 1024:5d}K -> {dest.stat().st_size // 1024:4d}K")
    if not args.check:
        print(f"total {total_in // 1024}K -> {total_out // 1024}K")


if __name__ == "__main__":
    main()
