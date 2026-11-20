"""Pictures of the library's wall maps (web/library/maps/, js/library_maps.js).

For every zoo map, the three panels of a player board as the viewer draws them at the start of a game, without player pieces
(no cubes, no workers, so every bonus space shows what it gives; the cubes of the bonus slots and of map 9's continent markers are black): the bonus / project panel (left), the map (middle) and the
association strip (right). Written to web/wall_maps/<id>-proj.webp, <id>-board.webp, <id>-strip.webp plus web/wall_maps/index.json
(order, names, abilities, picture sizes).

The panels come from the sandbox page of a running dev server (its map preview before the game starts), so this needs:
    python scripts/dev_server.py --port 8001        (in another shell)
    python scripts/build_library_maps.py [--base http://localhost:8001] [--only 8,8a]
Needs playwright (python) with Chromium and Pillow.
"""
from __future__ import annotations

import argparse
import dataclasses
import io
import json
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

from ark_nova.replay import map_texts

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "wall_maps"
ORDER = ["0", "A", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14",
         "1a", "2a", "3a", "4a", "5a", "6a", "7a", "8a", "T1"]
GROUP = {"0": "Beginner", "A": "Beginner", "T1": "Tournament"}
HIDE = ('.zoo.seat0 svg.strip image[href*="/cubes/"], .zoo.seat0 svg.board image[href*="/cubes/"]:not(.m9cube), image.lift, image[href*="/workers/"], .tip, .tooltip, #dock {display:none!important}'
        ' .zoo.seat0 svg.board {box-shadow: none !important; filter: none !important}'          # (the board is shot with what sticks out of it: its shadow would come along)
        ' html, body {background: transparent !important}'
        ' body * {visibility: hidden !important}'
        ' .zoo.seat0 svg.board, .zoo.seat0 svg.board *, .zoo.seat0 svg.strip, .zoo.seat0 svg.strip *,'
        ' .zoo.seat0 svg.bonuspanel, .zoo.seat0 svg.bonuspanel * {visibility: visible !important}')


def start_buildings(mid: str) -> list[dict]:
    """The buildings the map starts with, as the viewer gets them (engine `_initial_buildings` + view `building_cells`): map A, map 13."""
    from ark_nova.engine.game import _initial_buildings
    from ark_nova.replay.view import building_cells
    out = []
    for b in _initial_buildings(mid, 0):
        d = dataclasses.asdict(b)
        d["cells"], d["cubes"] = building_cells(d), []
        out.append(d)
    return out


def group_of(mid: str) -> str:
    if mid in GROUP:
        return GROUP[mid]
    if mid.endswith("a"):
        return "Alternate side"
    return "Marine Worlds" if int(mid) >= 10 else "Base game"


def save(png: bytes, path: Path) -> list[int]:
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    box = im.getchannel("A").getbbox()
    if box:
        im = im.crop(box)
    im.save(path, "WEBP", quality=82, method=6)
    return list(im.size)


def save_board(png: bytes, path: Path, inner: list[float]) -> tuple[list[int], list[int] | None]:
    """The map with what sticks out of it (map 9's continent markers): the picture is cropped to everything drawn; `inner` is the svg's own box in the
    screenshot (px). Returns the picture's size and, when something sticks out, the svg's box inside the picture [x, y, w, h] (`board_box` in index.json)."""
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    im.putalpha(im.getchannel("A").point(lambda a: 0 if a < 40 else a))          # (a faint veil of the page lies in the clip around the map)
    box = im.getchannel("A").getbbox() or (0, 0, im.width, im.height)
    im = im.crop(box)
    im.save(path, "WEBP", quality=82, method=6)
    x, y, w, h = (round(inner[0] - box[0]), round(inner[1] - box[1]), round(inner[2]), round(inner[3]))
    out = None if x <= 1 and y <= 1 and abs(im.width - w) <= 2 and abs(im.height - h) <= 2 else [x, y, w, h]
    return list(im.size), out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8001")
    ap.add_argument("--only", default="")
    ap.add_argument("--parts", default="", help="only these parts, e.g. proj (the others keep their pictures)")
    ap.add_argument("--scale", type=float, default=3)
    args = ap.parse_args()
    only = [x for x in args.only.split(",") if x]
    data = {m["id"]: m for m in json.loads((ROOT / "src" / "ark_nova" / "data" / "maps.json").read_text("utf-8"))}
    OUT.mkdir(parents=True, exist_ok=True)
    idx_path = OUT / "index.json"
    index = {m["id"]: m for m in json.loads(idx_path.read_text("utf-8"))["maps"]} if idx_path.exists() else {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=args.scale)
        page.goto(args.base + "/sandbox.html")
        page.get_by_text("Start the sandbox").click()
        page.get_by_text("Seat 1").first.click()
        page.wait_for_selector(".zoo.seat0 svg.board", timeout=60000)
        page.wait_for_timeout(1500)
        for mid in ORDER:
            if only and mid not in only:
                continue
            page.evaluate("""async ([id, start]) => {
                const view = await (await fetch('/api/sandbox/map/' + encodeURIComponent(id))).json();
                const { S } = await import('/js/state.js'); const { render } = await import('/js/main.js');
                S.replay.steps[S.step].state.players[0].buildings = start;          // (what the map starts with: map A's size-3 enclosure and kiosk, map 13's size-2 enclosure; nothing on the others)
                S.replay.setup.maps[0] = id; S.replay.maps[0] = view; render(); render();          // (twice: the first render would frame the buildings as new)
            }""", [mid, start_buildings(mid)])
            page.wait_for_timeout(1200)
            style = page.add_style_tag(content=HIDE)
            page.mouse.move(1919, 1)
            page.evaluate("""() => document.querySelectorAll('.zoo.seat0 svg.bonuspanel image[href*="/cubes/"], .zoo.seat0 svg.board image.m9cube').forEach((i) => i.setAttribute('href', '/cubes/000000.webp'))""")       # (the cubes on the bonus slots and map 9's continent markers, black: the print shows no player)
            page.wait_for_timeout(600)
            sizes = {}
            board_box = (index.get(mid) or {}).get("board_box")          # (kept when the board is not drawn again)
            for part, sel in (("proj", "svg.bonuspanel"), ("board", "svg.board"), ("strip", "svg.strip")):
                if args.parts and part not in args.parts.split(","):
                    sizes[part] = (index.get(mid) or {}).get("sizes", {}).get(part)          # (not drawn again: the size stays)
                    continue
                if part == "board":          # (with what sticks out of the map: the union of the svg's box and every shape in it)
                    page.locator(".zoo.seat0 svg.board").first.scroll_into_view_if_needed()
                    r = page.evaluate("""() => { const s = document.querySelector('.zoo.seat0 svg.board'), b = s.getBoundingClientRect(); let l = b.left, t = b.top, r = b.right, d = b.bottom;
                        s.querySelectorAll('*').forEach((e) => { const q = e.getBoundingClientRect(); if (q.width && q.height) { l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); d = Math.max(d, q.bottom); } });
                        return { svg: [b.left, b.top, b.width, b.height], clip: [Math.floor(l) - 2, Math.floor(t) - 2, Math.ceil(r - l) + 4, Math.ceil(d - t) + 4] }; }""")
                    cx, cy, cw, ch = r["clip"]
                    side = "document.querySelectorAll('.zoo.seat0 svg.strip, .zoo.seat0 svg.bonuspanel').forEach((e) => e.style.setProperty('opacity', '%s', 'important'))"
                    page.evaluate("() => " + side % "0")          # (the panels next to the map would show in the clip)
                    png = page.screenshot(omit_background=True, clip={"x": cx, "y": cy, "width": cw, "height": ch})
                    page.evaluate("() => " + side % "1")
                    inner = [(r["svg"][0] - cx) * args.scale, (r["svg"][1] - cy) * args.scale, r["svg"][2] * args.scale, r["svg"][3] * args.scale]
                    sizes[part], board_box = save_board(png, OUT / f"{mid}-{part}.webp", inner)
                    continue
                clip_board = "(v) => { const b = document.querySelector('.zoo.seat0 svg.board'); if (b && b.style.overflow) b.style.overflow = v; }"
                page.evaluate(clip_board, "hidden")          # (map 9's markers stick out over the panels next to the map: not in their pictures)
                png = page.locator(".zoo.seat0 " + sel).first.screenshot(omit_background=True)
                page.evaluate(clip_board, "visible")
                sizes[part] = save(png, OUT / f"{mid}-{part}.webp")
            style.evaluate("(e) => e.remove()")
            m = data[mid]
            index[mid] = {"id": mid, "name": m["name"], "group": group_of(mid), "ability": map_texts.description(mid, m.get("description")),
                          "sizes": sizes}
            if board_box:
                index[mid]["board_box"] = board_box          # the map's own box inside the board picture [x, y, w, h], when something sticks out of it (map 9)
            print(mid, m["name"], sizes)
        browser.close()
    maps = [index[k] for k in ORDER if k in index]
    idx_path.write_text(json.dumps({"maps": maps}, indent=4, ensure_ascii=False) + "\n", "utf-8")


if __name__ == "__main__":
    main()
