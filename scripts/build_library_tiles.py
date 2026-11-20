"""Pictures of the library's bonus tile drawer (web/library/tiles/, js/library_tiles.js).

Every tile that can be gained as a conservation bonus (5 / 8 conservation) or at the end of the reputation track (the 16 tiles of
the engine's CONSERVATION_POOL, engine/bonuses.py), drawn by the viewer's own `bonusTile` (shared.js) without its yellow pentagon:
the picture and its number only, on a transparent ground. The page lays them on wooden pentagons. Written to
web/tile_art/<name>.webp; the list of tiles with their names and texts is in js/library_tiles.js (TILES).

Needs a running dev server (python scripts/dev_server.py --port 8001), playwright (python) with Chromium and Pillow:
    python scripts/build_library_tiles.py [--base http://localhost:8001]
"""
from __future__ import annotations

import argparse
import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "tile_art"
POOL = [("Partner-Zoo", 1), ("Fac", 1), ("Multiplier", 1), ("xtoken", 3), ("take-in-range-or-deck", 3), ("size-3", 1),
        ("bonus-ignore-conditions", 3), ("bonus-increased-hand", 1), ("bonus-icon", 1), ("bonus-scoring-cards", 3),
        ("bonus-sponsor", 1), ("bonus-sponsor-gray", 1), ("reputation", 2), ("bonus-extra-shift", 1), ("bonus-kiosk-pavilion", 3),
        ("money", 10)]
SIZE = 440          # css px of the pentagon's height (x 1.5 device pixels, the viewer at 1920 px wide is not zoomed: 660 px; the drawer shows a tile at up to
                    # 2.75 px per unit, about 250 px for the picture, from the HD art of web/icons_hd)


# The tiles lie on bare wood in the drawer, not on the yellow pentagon of the board, so two of them get a touch-up here (the approved icons stay as they are):
#  * FILL_INSIDE: the framed picture of the larger hand has an empty upper half inside its dark outline (on the board the yellow pentagon shows through): filled with the pentagon's yellow.
#  * TONE_REDS: the saturated reds of the Ignore conditions and Adapt 3 tiles are too loud on the wood: saturation and brightness of the red pixels lowered.
PENTAGON_YELLOW = (248, 232, 77)
FILL_INSIDE = {"bonus-increased-hand": PENTAGON_YELLOW}
TONE_REDS = {"bonus-ignore-conditions": (0.86, 0.93), "bonus-scoring-cards": (0.82, 0.92)}        # name -> (saturation factor, brightness factor)


def finish(name: str, im: Image.Image) -> Image.Image:
    import numpy as np
    from scipy import ndimage as ndi
    a = np.array(im).astype(np.float32)
    if name in FILL_INSIDE:
        holes, n = ndi.label(a[..., 3] < 40)
        edge = set(holes[0, :]) | set(holes[-1, :]) | set(holes[:, 0]) | set(holes[:, -1])
        inside = np.isin(holes, [i for i in range(1, n + 1) if i not in edge])                  # the transparent area that the outline encloses
        inside = ndi.binary_dilation(inside, iterations=3)                                      # (and the soft edges of what lies in it)
        al = a[..., 3:] / 255
        under = np.array(FILL_INSIDE[name], np.float32)
        a[..., :3] = np.where(inside[..., None], a[..., :3] * al + under * (1 - al), a[..., :3])
        a[..., 3] = np.where(inside, 255, a[..., 3])
    if name in TONE_REDS:
        sat, val = TONE_REDS[name]
        rgb = a[..., :3] / 255
        mx, mn = rgb.max(2), rgb.min(2)
        d = mx - mn
        s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        red = (r >= g) & (r >= b) & (s > 0.3) & (g <= r * 0.62) & (b <= r * 0.7) & (a[..., 3] > 0)          # red, not yellow (green near red) and not pink-white
        grey = mx[..., None]                                                                   # (desaturate towards the same brightness, then darken)
        new = (grey - (grey - rgb) * sat) * val
        a[..., :3] = np.where(red[..., None], new * 255, a[..., :3])
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8001")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1.5)
        page.goto(args.base + "/sandbox.html")
        page.get_by_text("Start the sandbox").click()
        page.wait_for_timeout(2500)
        page.add_style_tag(content="html, body {background: transparent !important} body > * {visibility: hidden !important}"
                                   " html::before, html::after, body::before, body::after {display: none !important}"          # (the poster's paper texture would lie on the picture's transparent ground)
                                   " #tileart, #tileart * {visibility: visible !important}")
        for name, value in POOL:
            page.evaluate("""async ([name, value, size]) => {
                const { bonusTile } = await import('/js/shared.js');
                document.getElementById('tileart')?.remove();
                const box = document.createElement('div'); box.id = 'tileart';
                Object.assign(box.style, { position: 'fixed', left: '20px', top: '20px', width: size * 88 / 94 + 'px', height: size + 'px', zIndex: 99999 });
                const t = bonusTile(name, value > 1 || name === 'money' || name === 'reputation' ? value : 0);
                t.querySelectorAll('.pent').forEach((g) => g.remove());
                t.setAttribute('width', '100%'); t.setAttribute('height', '100%');
                t.style.cssText = 'position:static!important;inset:auto!important;transform:none!important;width:100%!important;height:100%!important;display:block!important;margin:0!important;filter:none!important';
                box.append(t); document.body.append(box);
                await Promise.all([...t.querySelectorAll('image')].map((i) => new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = i.getAttribute('href'); })));
            }""", [name, value, SIZE])
            page.wait_for_timeout(500)
            png = page.locator("#tileart").screenshot(omit_background=True)
            im = finish(name, Image.open(io.BytesIO(png)).convert("RGBA"))
            im.save(OUT / f"{name}.webp", "WEBP", lossless=True, method=6)          # (lossless: a lossy WebP frays the edges of a picture on a transparent ground)
            print(name, im.size)
        browser.close()


if __name__ == "__main__":
    main()
