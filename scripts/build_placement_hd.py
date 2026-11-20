"""The approved placement-bonus pictures at full resolution: assets_src/placement_approved/*.svg (+ adapt-1.png) -> lossless pictures in
assets_src/icons_hd_lossless/ (scripts/compress_hd_icons.py then makes the files the site loads in web/icons_hd/).

The sources are the other agent's approved restorations (docs: changelog.md, "placement-approved"): eleven are SVG wrappers around the full-size PNG (the wrapper
crops it to the icon's visible bounds and stretches it to the icon's logical box), five are real vector drawings (clever, mark, wave, hollywood, pentagon) and
Adapt 1 is a PNG. Every picture is rendered by Chromium at the pixel size of the picture it replaces on the site:
  * the wrapped PNGs at the PNG's own resolution (the crop's width in pixels, the height from the logical box, so nothing is resampled but the few percent of stretch),
  * the vector drawings at 12 px per unit of the logical box (the wrapped ones come out at 9-12),
  * Adapt 1 as it is (a PNG: only converted).
`BOXES` has each picture's logical box (the one the viewer draws it in; icons.json `size` for the sprites of BGA's sheet) and where the site loads it.

    python scripts/build_placement_hd.py [--per-unit 12]

Needs playwright (python) with Chromium and Pillow.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets_src" / "placement_approved"
OUT = ROOT / "assets_src" / "icons_hd_lossless"

# name -> (logical width, height, what loads it)
BOXES = {
    "clever": (86, 117, "r6c6"), "rescue": (99, 98, "r9c13"), "mark": (99, 115, "r3c3"), "scavenging": (118, 118, "r4c10"), "appeal": (91, 118, "r3c13"),
    "kiosk": (120, 103.923, "r7c3"), "shark-attack": (118, 118, "r5c1"), "store": (118, 118, "r5c2"), "wave": (137, 46, "r11c14"),
    "search-sponsor": (118, 118, "r4c13"), "digging": (118, 118, "r4c2"), "pouch": (115, 115, "r7c11"), "perception": (115, 115, "r7c10"),
    "pentagon": (117, 115, "r5c14"), "pavilion": (120, 103.923, "bonus/pavilion.webp, enclosures/pavilion_hd.webp"),
    "hollywood": (69, 82, "bonus/hollywood_h.webp"),
}


def native_width(svg: str) -> int | None:
    """The width in pixels of the PNG crop of a wrapper (the widest viewBox: the inner svg of most wrappers, the outer one of rescue), None for a real vector drawing."""
    if "<image" not in svg:
        return None
    return round(max(float(m) for m in re.findall(r'viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) [\d.]+"', svg)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-unit", type=float, default=12)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for name, (lw, lh, target) in BOXES.items():
            svg = (SRC / (name + ".svg")).read_text(encoding="utf8")
            w = native_width(svg) or round(args.per_unit * lw)
            h = round(w * lh / lw)
            page = browser.new_page(viewport={"width": w, "height": h})
            page.set_content(f'<body style="margin:0;background:transparent"><img id="i" src="data:image/svg+xml;base64,{__import__("base64").b64encode(svg.encode()).decode()}" '
                             f'width="{w}" height="{h}" style="display:block"></body>')
            page.wait_for_function("document.getElementById('i').complete")
            page.wait_for_timeout(200)
            png = page.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": w, "height": h})
            page.close()
            im = Image.open(__import__("io").BytesIO(png)).convert("RGBA")
            im.save(OUT / (name + ".webp"), "WEBP", lossless=True, exact=True, method=6)
            print(f"{name:15s} {im.size[0]:5d} x {im.size[1]:<5d} -> {target}")
        browser.close()
    im = Image.open(SRC / "adapt-1.png").convert("RGBA")
    im.save(OUT / "adapt-1.webp", "WEBP", lossless=True, exact=True, method=6)
    print(f"{'adapt-1':15s} {im.size[0]:5d} x {im.size[1]:<5d} -> icons_hd/adapt-1.webp (adaptIcon)")


if __name__ == "__main__":
    main()
