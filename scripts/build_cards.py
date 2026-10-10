"""Builds every card image (and the project strips of the project areas, web/project_strips/<key>.webp): web/cards/<key>.webp (360x503, lists and hands; only the names of the abilities, no texts, like BGA) and web/cards_large/<key>.webp (745x1040, hover preview).

One process for all card types (animals A###, sponsors S###, conservation projects P###, endgame cards F###, plus the Marine Worlds variant P131_MW; S250_MW is
made from the S250 card by build_mw_card_images.py: the sponsors' top part with the icons is a photo of the printed card): the cards are drawn as HTML/CSS by the card components and stylesheet of the fan site "Next-Ark-Nova-Cards" (permission given by its author), in
a headless Chromium, at twice the design size, and then scaled down with Pillow. The Marine Worlds projects P133-P139 (not in the fan site's data) are drawn by
scripts/cardgen/harness/mw.tsx from our own data/projects.json. Texts and effects come from the fan site's locale file (scripts/cardgen/site/locales).

Needs node + npm (like scripts/import_data.py), Pillow, and a Chromium for Playwright (`npx playwright install chromium` inside scripts/cardgen, or set
CHROMIUM_PATH). Run from the project root:  python scripts/build_cards.py [--only A401,S201,...]
Details: scripts/cardgen/README.md
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "scripts" / "cardgen"
DATA = ROOT / "src" / "ark_nova" / "data"
WEB = ROOT / "web"
LARGE, SMALL = (745, 1040), (360, 503)
STRIP = (1000, 412, 250)                               # the strip of a project in the project area (web/project_strips): width, height, width of the dark green left part; the cube positions are in web/project_strips/cubes.json
STRIP_OUT = (600, 247)
SLOT_SCALE = 1.5                                       # (the slots as large as the strip allows up to this factor of the card)
SLOT_HEIGHT = 0.8
VARIANTS = ["P131_MW"]                                 # Marine Worlds reprint with other indicators (data_manual/variants_mw.json); S250_MW is made from S250 below


def keys() -> list[str]:
    out = []
    for prefix, name in (("A", "animals"), ("S", "sponsors"), ("P", "projects"), ("F", "endgames")):
        out += [prefix + str(c["id"]) for c in json.loads((DATA / f"{name}.json").read_text("utf-8"))]
    return out + VARIANTS


def run(*cmd: str) -> None:
    subprocess.run(cmd, cwd=GEN, check=True, shell=sys.platform == "win32")


def build_strips(keys: list[str]) -> None:
    """web/project_strips/<key>.webp: the icon(s) of a project card left and its three slots right, on a transparent background (the dark / light green base is CSS).
    The visible parts of the three slots are spread with equal space left, between and right in the light green part (their tops on one line, the tallest part in the middle of the strip's height), enlarged as far as the strip allows; web/project_strips/cubes.json
    says where the cube of each slot goes (the cube holder of the card; the middle of the slot on the Marine Worlds plans): {key: [[x, y, width], ...]} as fractions of the strip."""
    geo = json.loads((GEN / "out" / "bare" / "geometry.json").read_text())
    W, H, L = STRIP
    (WEB / "project_strips").mkdir(exist_ok=True)
    cubes_file = WEB / "project_strips" / "cubes.json"
    cubes = json.loads(cubes_file.read_text()) if cubes_file.exists() else {}
    for k in keys:
        if k not in geo:
            continue
        g, card = geo[k], Image.open(GEN / "out" / "bare" / f"{k}.png").convert("RGBA")
        strip = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        x, y, w, h = g["icon"]
        strip.alpha_composite(card.crop((x, y, x + w, y + h)), (round(L / 2 - w / 2), round(H / 2 - h / 2)))
        parts = []                                                       # (picture, its visible box, the cube spot) of every slot, in the pixels of the card
        for s in g["slots"]:
            x, y, w, h = s["box"]
            pic = card.crop((x, y, x + w, y + h))
            vb = pic.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
            parts.append((pic, vb, (s["anchor"][0] - x, s["anchor"][1] - y), s["anchor_is_holder"]))
        vw = [vb[2] - vb[0] for _, vb, _, _ in parts]
        f = min(SLOT_SCALE, 0.9 * (W - L) / sum(vw), SLOT_HEIGHT * H / max(vb[3] - vb[1] for _, vb, _, _ in parts))     # (one scale for the three slots: the three visible parts together fill at most 90 % of the light green part, and are at most 80 % as high as the strip)
        top = (H - f * max(vb[3] - vb[1] for _, vb, _, _ in parts)) / 2        # (the tops of the three parts are on one line, the tallest is in the middle of the strip's height: the shields of the Marine Worlds plans stand side by side)
        space = (W - L - f * sum(vw)) / 4                                  # the visible parts are spread with EQUAL space left, between and right (slots of different width, e.g. the breeding projects, look centred as a whole)
        cubes[k], left = [], L + space
        for i, (pic, vb, (ax, ay), holder) in enumerate(parts):
            cx, cy = (vb[0] + vb[2]) / 2, (vb[1] + vb[3]) / 2
            ox, oy = left - vb[0] * f, top - vb[1] * f                     # (where the picture's corner goes so that its visible part starts at `left` and at `top`)
            left += vw[i] * f + space
            strip.alpha_composite(pic.resize((round(pic.width * f), round(pic.height * f)), Image.LANCZOS), (round(ox), round(oy)))
            if not holder:
                ax, ay = cx, cy
            cubes[k].append([round((ox + ax * f) / W, 4), round((oy + ay * f) / H, 4), round((100 if holder else 90) * f / W, 4)])
        strip.resize(STRIP_OUT, Image.LANCZOS).save(WEB / "project_strips" / f"{k}.webp", quality=90, method=4, alpha_quality=90)
    cubes_file.write_text(json.dumps(cubes, sort_keys=True) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma separated card keys (default: all)")
    ap.add_argument("--from-raw", action="store_true", help="skip drawing, scale the screenshots left in scripts/cardgen/out/raw by --keep-raw")
    ap.add_argument("--keep-raw", action="store_true", help="keep scripts/cardgen/out/raw (the 750x1044 screenshots)")
    a = ap.parse_args()
    ks = a.only.split(",") if a.only else keys()
    if not a.from_raw:
        if not (GEN / "node_modules").exists():
            run("npm", "install", "--no-audit", "--no-fund")
        run("node", "build.mjs")
        run("npx", "tailwindcss", "-i", "tailwind.css", "-o", "site/tw.css")
        shutil.copy(GEN / "src" / "arknova.css", GEN / "site" / "arknova.css")
        (GEN / "keys.json").write_text(json.dumps(ks))
        shutil.rmtree(GEN / "out", ignore_errors=True)
        run("node", "render.mjs", "keys.json")
        run("node", "shoot.mjs")
    rendered = json.loads((GEN / "rendered_keys.json").read_text())
    for d in ("cards", "cards_large"):
        (WEB / d).mkdir(exist_ok=True)
    for k in rendered["ok"]:
        im = Image.open(GEN / "out" / "raw" / f"{k}.png").convert("RGBA")
        im.resize(LARGE, Image.LANCZOS).save(WEB / "cards_large" / f"{k}.webp", quality=90, method=4, alpha_quality=80)   # (rounded corners stay transparent)
        small = Image.open(GEN / "out" / "compact" / f"{k}.png").convert("RGBA")                                          # the small card shows the ability names only (like BGA)
        small.resize(SMALL, Image.LANCZOS).save(WEB / "cards" / f"{k}.webp", quality=88, method=4, alpha_quality=80)
    build_strips([k for k in rendered["ok"] if k[0] == "P"])
    if "S250" in rendered["ok"]:                      # Marine Worlds Sea Turtle Tank: other icons painted over the S250 card (keeps its 360 / 745 px sizes)
        sys.path.insert(0, str(ROOT / "scripts"))
        import build_mw_card_images
        for folder in ("cards", "cards_large"):
            build_mw_card_images.build(folder)
    if not a.keep_raw:
        shutil.rmtree(GEN / "out", ignore_errors=True)
    print(f"{len(rendered['ok'])} cards written to web/cards and web/cards_large; not in the card data: {rendered['missing'] or 'none'}")


if __name__ == "__main__":
    main()
