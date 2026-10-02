"""Cut the worker meeples (one per BGA player colour) out of the vendored workers.png (10 cells in a row, the order of BGA's `.icon-worker[data-color=...]`).

Output: web/workers/<colour>.webp, e.g. web/workers/c028d3.webp (trimmed to the picture, shadow included).
Needs Pillow:  python scripts/build_workers.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public" / "img" / "workers.png"
OUT = ROOT / "web" / "workers"
COLORS = ["30a638", "1863a5", "7f4e30", "000000", "5a5856", "ffffff", "d1c81c", "b91b1b", "c028d3", "cb7b19"]


def main() -> None:
    sheet = Image.open(SHEET).convert("RGBA")
    cw = sheet.width / len(COLORS)
    OUT.mkdir(parents=True, exist_ok=True)
    for i, color in enumerate(COLORS):
        cell = sheet.crop((round(i * cw), 0, round((i + 1) * cw), sheet.height))
        cell.crop(cell.getbbox()).save(OUT / f"{color}.webp", quality=92)
    print(f"saved {len(COLORS)} workers to {OUT}")


if __name__ == "__main__":
    main()
