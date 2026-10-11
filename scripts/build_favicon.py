"""Builds the favicon: the crowned emu silhouette alone (teal body, golden crown, cream outline), no hill and no disc, because the logo does not read at 16 px.

Input:  web/brand/emu_silhouette.png (via the tracing of build_logo.py).
Output: web/brand/favicon.svg, favicon-32.png, favicon-48.png, apple-touch-icon.png (180 px, on a cream square), favicon.ico (16 / 32 / 48 px).
Needs numpy, opencv-python (cv2), Pillow and playwright with Chromium. Run with the system python:  python scripts/build_favicon.py
Colours: Park Poster teal / sun / paper (web/css/parkposter.css)."""
import re
from pathlib import Path

import numpy as np
from PIL import Image

from build_logo import BRAND, contours, smooth_path

TEAL, SUN, PAPER = "#0E6F78", "#F7B529", "#F8EDCB"
S = 512
EMU_H = 430          # height of the emu in the 512 box (the outline lies outside it)
OUTLINE = 28         # stroke width, half of it outside the shape


def build_svg(emu_h=EMU_H, size=S, bg=None, rx=0):
    alpha = np.array(Image.open(BRAND / "emu_silhouette.png").convert("RGBA").split()[3])
    h, w = alpha.shape
    sc = emu_h / h
    tx, ty = size / 2 - w * sc / 2, size / 2 - emu_h / 2
    body, crown = [], []
    for c, is_crown in contours(alpha):
        (crown if is_crown else body).append(smooth_path(c, tx, ty, sc))
    bp, cp = " ".join(body), " ".join(crown)
    back = f'  <rect width="{size}" height="{size}" rx="{rx}" fill="{bg}"/>\n' if bg else ""
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-label="Ark Nova Replay: a crowned emu">
{back}  <defs><path id="b" d="{bp}"/><path id="c" d="{cp}"/></defs>
  <g fill="{PAPER}" stroke="{PAPER}" stroke-width="{OUTLINE * size / S}" stroke-linejoin="round"><use xlink:href="#b"/><use xlink:href="#c"/></g>
  <use xlink:href="#b" fill="{TEAL}"/>
  <use xlink:href="#c" fill="{SUN}"/>
</svg>
'''
    return re.sub(r"(\d+\.\d)\d+", r"\1", svg)          # (one decimal is enough at this size: the file gets much smaller)


def export():
    from playwright.sync_api import sync_playwright
    svgs = {"icon": build_svg(), "apple": build_svg(emu_h=360, bg=PAPER)}
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, size, key in (("favicon-32.png", 32, "icon"), ("favicon-48.png", 48, "icon"), ("favicon-16.png", 16, "icon"), ("apple-touch-icon.png", 180, "apple"), ("_big.png", 256, "icon")):
            pg = b.new_page(viewport={"width": size, "height": size})
            svg = svgs[key].replace(f'width="{S}" height="{S}"', 'width="100%" height="100%"')
            pg.set_content(f'<body style="margin:0;background:transparent"><div style="width:{size}px;height:{size}px">{svg}</div></body>')
            pg.screenshot(path=str(BRAND / name), omit_background=True)
            pg.close()
        b.close()
    big = Image.open(BRAND / "_big.png").convert("RGBA")
    big.save(BRAND / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])       # (Pillow scales the 256 px picture down for every size)
    (BRAND / "_big.png").unlink()
    (BRAND / "favicon-16.png").unlink()


if __name__ == "__main__":
    (BRAND / "favicon.svg").write_text(build_svg())
    export()
    print("written to", BRAND)
