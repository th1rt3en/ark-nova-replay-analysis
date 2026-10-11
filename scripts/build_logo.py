"""Builds the Park Poster logo (the crowned emu on a hill, in a circle) as a vector file and its PNG / ICO exports.

Input:  web/brand/emu_silhouette.png (the emu with the crown, alpha channel = shape).
Output: web/brand/logo.svg (vector: the silhouette is traced), logo-1024.png, logo-512.png, logo-180.png, logo-64.png, logo-32.png (the favicon is made by build_favicon.py).
Needs numpy, opencv-python (cv2), Pillow and playwright with Chromium (for the PNGs). Run with the system python:  python scripts/build_logo.py
Colours are the Park Poster tokens of web/css/parkposter.css (ink, paper, gold, teal)."""
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

BRAND = Path(__file__).resolve().parents[1] / "web" / "brand"
INK, PAPER, GOLD, SKY1, SKY2, LEAF = "#17262B", "#F8EDCB", "#F4B63F", "#1B7D8C", "#146577", "#3F9A4E"
S = 512                      # the viewBox
BORDER = 34                  # ink border of the disc (6.6 %, like the pills' border at 60 px)
EMU_H = 330                  # height of the emu: small enough that the crown keeps a gap to the border
FEET = 406                   # y of the emu's feet (on the ink line of the hill)
CROWN_SPLIT = 0.13           # the top 13 % of the picture is the crown


def contours(alpha):
    """Traced outlines of the alpha mask, in the mask's pixel units: [(points, is_crown)]"""
    k = 6
    big = cv2.resize(alpha, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (0, 0), 2.2)
    _, bw = cv2.threshold(big, 127, 255, cv2.THRESH_BINARY)
    found, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in found:
        if cv2.contourArea(c) < 40 * k * k / 6:
            continue
        c = cv2.approxPolyDP(c, 1.1, True)[:, 0, :].astype(float) / k
        top = c[:, 1].min()
        out.append((c, top < alpha.shape[0] * CROWN_SPLIT and c[:, 1].max() < alpha.shape[0] * (CROWN_SPLIT + .02)))
    return out


def smooth_path(pts, tx, ty, sc):
    """closed Catmull-Rom spline through the points as a cubic bezier path"""
    p = [(tx + x * sc, ty + y * sc) for x, y in pts]
    n = len(p)
    d = "M%.2f %.2f" % p[0]
    for i in range(n):
        p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % n], p[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += "C%.2f %.2f %.2f %.2f %.2f %.2f" % (*c1, *c2, *p2)
    return d + "Z"


def build_svg():
    im = Image.open(BRAND / "emu_silhouette.png").convert("RGBA")
    alpha = np.array(im.split()[3])
    h, w = alpha.shape
    sc = EMU_H / h
    tx, ty = S / 2 - w * sc / 2 - 4, FEET - EMU_H
    body, crown = [], []
    for c, is_crown in contours(alpha):
        (crown if is_crown else body).append(smooth_path(c, tx, ty, sc))
    cx = cy = S / 2
    r_in = S / 2 - BORDER / 2
    rays = []
    ox, oy = S / 2, S
    for i in range(-8, 9):                     # 12 degree wedges around the bottom centre, like the page's rays
        a0, a1 = math.radians(270 + i * 24 - 6), math.radians(270 + i * 24 + 6)
        far = 900
        rays.append("M%.1f %.1f L%.1f %.1f L%.1f %.1f Z" % (ox, oy, ox + far * math.cos(a0), oy + far * math.sin(a0), ox + far * math.cos(a1), oy + far * math.sin(a1)))
    hill_top = S * .76
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}" role="img" aria-label="Ark Nova Replay: a crowned emu on a hill">
  <defs><clipPath id="disc"><circle cx="{cx}" cy="{cy}" r="{r_in}"/></clipPath></defs>
  <circle cx="{cx}" cy="{cy}" r="{S / 2 - BORDER / 2}" fill="{SKY2}"/>
  <g clip-path="url(#disc)">
    <path d="{' '.join(rays)}" fill="{SKY1}"/>
    <ellipse cx="{S / 2}" cy="{hill_top + S * .31}" rx="{S * .6}" ry="{S * .31}" fill="{LEAF}" stroke="{INK}" stroke-width="{S * .04}"/>
    <path d="{' '.join(body)}" fill="{PAPER}"/>
    <path d="{' '.join(crown)}" fill="{GOLD}"/>
  </g>
  <circle cx="{cx}" cy="{cy}" r="{S / 2 - BORDER / 2}" fill="none" stroke="{INK}" stroke-width="{BORDER}"/>
</svg>
'''


def export_pngs():
    from playwright.sync_api import sync_playwright
    svg = (BRAND / "logo.svg").read_text()
    with sync_playwright() as p:
        b = p.chromium.launch()
        for size in (1024, 512, 180, 64, 32):
            pg = b.new_page(viewport={"width": size, "height": size})
            pg.set_content(f'<body style="margin:0;background:transparent"><div style="width:{size}px;height:{size}px">{svg.replace(f"width=\"{S}\" height=\"{S}\"", "width=\"100%\" height=\"100%\"")}</div></body>')
            pg.screenshot(path=str(BRAND / f"logo-{size}.png"), omit_background=True)
            pg.close()
        b.close()


if __name__ == "__main__":
    (BRAND / "logo.svg").write_text(build_svg())
    export_pngs()
    print("written to", BRAND)
