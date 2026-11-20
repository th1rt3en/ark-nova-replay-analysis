"""The whole bonus tiles as single pictures (web/icons_hd/tile-<name>.webp) for the places that show a tile as one icon: the log, the map editor,
the conservation track's fallback. Each is drawn by the viewer's own `bonusTile` (shared.js: our vector pentagon with the approved HD picture of
web/icons_hd), trimmed to its edge and saved lossless in assets_src/icons_hd_lossless/; then run scripts/compress_hd_icons.py to put it in web/icons_hd. icons.js (HD_ICON) points the ids of BGA's sheet (r6c1, r6c2, ...) at them.

Needs a running dev server (python scripts/dev_server.py --port 8001) and playwright (python) with Chromium, Pillow:
    python scripts/build_hd_tiles.py [--base http://localhost:8001] [--height 1200]
"""
from __future__ import annotations

import argparse
import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets_src" / "icons_hd_lossless"          # (the lossless originals; scripts/compress_hd_icons.py makes the files the site loads)
TILES = ["bonus-ignore-conditions", "bonus-increased-hand", "bonus-sponsor-gray", "bonus-extra-shift", "bonus-icon", "bonus-kiosk-pavilion",
         "bonus-scoring-cards"]
PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>html,body{background:transparent;margin:0}#box{position:fixed;left:0;top:0}
#box>svg{display:block}</style><script>window.MAP_EDITOR=true;</script></head><body><div id="box"></div><script type="module">
import {bonusTile} from '/js/shared.js'; import {S} from '/js/state.js'; import {applyIconNames} from '/js/icons.js';
const [names, sizes] = await Promise.all([fetch('/icons/names.json').then((r) => r.json()), fetch('/icons/icons.json').then((r) => r.json())]);
applyIconNames(names); S.iconNames = names; for (const [id, v] of Object.entries(sizes)) S.iconSizes[id] = v.size;
window.show = async (name, h) => {
  const t = bonusTile(name, 1); t.style.height = h + 'px'; t.style.width = h * 88 / 94 + 'px'; document.getElementById('box').replaceChildren(t);
  await Promise.all([...t.querySelectorAll('image')].map((i) => new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = i.getAttribute('href'); })));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};
window.ready = true;
</script></body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8001")
    ap.add_argument("--height", type=int, default=1200)
    args = ap.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": args.height + 100, "height": args.height + 100}, device_scale_factor=1)
        page.route(args.base + "/__hd_tiles.html", lambda route: route.fulfill(status=200, content_type="text/html", body=PAGE))
        page.goto(args.base + "/__hd_tiles.html")
        page.wait_for_function("window.ready")
        for name in TILES:
            page.evaluate("([n, h]) => window.show(n, h)", [name, args.height])
            im = Image.open(io.BytesIO(page.locator("#box > svg").screenshot(omit_background=True))).convert("RGBA")
            im = im.crop(im.getbbox())
            im.save(OUT / f"tile-{name}.webp", "WEBP", lossless=True, method=6)
            print(name, im.size)
        browser.close()


if __name__ == "__main__":
    main()
