"""Pictures of the whole printed sheet of every library wall map that has two sides (maps 1-8 and their alternate sides 1a-8a), for the 3D turn of
js/map_flip.js: web/wall_maps/<id>-sheet.webp, the DOM sheet of web/library/maps/ (paper, title, the three panels, the ability text, the side stamp)
exactly as the page draws it, without the rods (they cover its top and bottom edge), the cord and the shadow.

Run it after anything that changes how a sheet looks (scripts/build_library_maps.py, js/library_maps.js, css/library_room.css, the map texts):
    python scripts/build_library_sheets.py [--only 7,7a] [--scale 2.4]
It serves web/ itself (no dev server needed). Needs playwright (python) with Chromium and Pillow.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import io
import json
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
OUT = WEB / "wall_maps"


def two_sided(ids: list[str]) -> list[str]:
    have = set(ids)
    return [i for i in ids if (i.endswith("a") and i[:-1] in have) or (i + "a") in have]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--scale", type=float, default=2.4, help="pixels per pixel of the 1920 x 1080 stage")
    args = ap.parse_args()
    ids = [m["id"] for m in json.loads((OUT / "index.json").read_text("utf-8"))["maps"]]
    todo = [i for i in two_sided(ids) if not args.only or i in args.only.split(",")]
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k) -> None:
            pass
    handler = functools.partial(Quiet, directory=str(WEB))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=args.scale)
        page.emulate_media(reduced_motion="reduce")
        for mid in todo:
            page.goto("about:blank")                                          # (a new address with only another #map would not load the page again)
            page.goto(f"{base}/library/maps/index.html#{mid}")
            page.wait_for_selector("body.ready #rig .sheet", timeout=30000)
            page.evaluate("document.fonts.ready")
            page.wait_for_timeout(800)
            # the stage and the rig at their own size (1 px of the stage = 1 px of the page)
            page.evaluate("""() => { document.getAnimations().forEach((a) => a.finish());
                const st = document.getElementById('mstage'), rig = document.getElementById('rig');
                st.style.transform = 'none'; rig.style.transform = 'none'; rig.style.top = '0px';
                rig.querySelectorAll('.rod, .knob, svg:not(.mti)').forEach((e) => { e.style.visibility = 'hidden'; });
                document.querySelectorAll('#warm, .roombar, #mapdrawer, #mshade').forEach((e) => { e.style.display = 'none'; }); }       // (a screenshot of the sheet would take the fire light on top of it too)""")
            page.wait_for_timeout(300)
            png = page.locator("#rig .sheet").screenshot()
            im = Image.open(io.BytesIO(png)).convert("RGB")
            im.save(OUT / f"{mid}-sheet.webp", "WEBP", quality=84, method=6)
            print(mid, im.size)
        browser.close()
    server.shutdown()


if __name__ == "__main__":
    main()
