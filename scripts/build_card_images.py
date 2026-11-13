"""Cut the full card images out of the community sprite sheets and save them as web/cards/<key>.webp.

Source: https://github.com/ssimeonoff/ssimeonoff.github.io/tree/master/images-ark (cards1..7.jpg, used with the publisher's permission for this
non-profit project). The sheets are grids of 240x335 cards:
- cards1.jpg (6x2): endgame cards F001-F011, in order; cards2.jpg (6x2): base projects P101-P112, in order;
- cards3..7.jpg (10x7): projects P113-P132 first, then sponsors and animals (and, in cards7, the Marine Worlds cards), not strictly in id order.
The cells of cards3..7 are in id order (see `expected` below); the assignment is cross-checked against the art in the vendored
upstream repo (img/sponsors = the full card, img/animals = the photo).

Needs Pillow and numpy (not in the project venv): python scripts/build_card_images.py
"""
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from ark_nova import data  # noqa: E402

BASE_URL = "https://raw.githubusercontent.com/ssimeonoff/ssimeonoff.github.io/master/images-ark/"
SHEETS = ROOT / "vendor" / "card_sheets"
ART = ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public" / "img"
OUT = ROOT / "web" / "cards"
CELL_W, CARD_H = 240, 335
ART_H = 192                      # height of the photo at the top of an animal card (240 wide)
THUMB = (60, 84)
NOT_ON_SHEETS = {"A341", "S281", "S282"}   # promo cards (Capybara, Arcade, Promotion Team) the sheets do not have
MAX_DIST = 30.0                  # mean abs difference (0-255) up to which a cell clearly matches the vendor art


def sheet(name: str) -> Image.Image:
    path = SHEETS / name
    if not path.exists():
        SHEETS.mkdir(parents=True, exist_ok=True)
        print("downloading", name)
        urllib.request.urlretrieve(BASE_URL + name, path)
    return Image.open(path).convert("RGB")


def cells(img: Image.Image, cols: int, rows: int):
    h = img.height / rows
    for r in range(rows):
        for c in range(cols):
            yield img.crop((c * CELL_W, round(r * h), (c + 1) * CELL_W, round((r + 1) * h)))


def thumb(img: Image.Image, size) -> np.ndarray:
    return np.asarray(img.convert("RGB").resize(size, Image.LANCZOS), dtype=np.float32)


def check_against_art(sheet_cells, expected, cards) -> None:
    """Sanity check of the id-order assignment: sponsor cells must look like the vendor's full sponsor card, animal photos like the vendor art.
    The art of some Marine Worlds cards is cropped differently upstream, so only report how many of the confident comparisons disagree."""
    bad = agree = 0
    for key, (n, i, cell) in zip(expected, sheet_cells):
        c = cards[key]
        bga = c.get("bga_id")
        if c["card_type"] == "sponsor" and (ART / "sponsors" / f"{bga}.jpg").exists():
            d = np.abs(thumb(cell, THUMB) - thumb(Image.open(ART / "sponsors" / f"{bga}.jpg"), THUMB)).mean()
        elif c["card_type"] == "animal" and (ART / "animals" / f"{bga}.jpg").exists():
            size = (THUMB[0], round(THUMB[0] * ART_H / CELL_W))
            d = np.abs(thumb(cell.crop((0, 0, CELL_W, ART_H)), size) - thumb(Image.open(ART / "animals" / f"{bga}.jpg"), size)).mean()
        else:
            continue
        if d <= MAX_DIST:
            agree += 1
        elif d > 55:
            bad += 1
            print(f"  suspicious: {key} {c['name']} (cards{n}.jpg cell {i}) differs from the vendor art by {d:.0f}")
    print(f"order check: {agree} cells clearly match the vendor art, {bad} look wrong")


def is_empty(cell: Image.Image) -> bool:
    """Unused cells at the end of a sheet are plain black (cards3-6) or plain white (cards7)."""
    return np.asarray(cell.resize((16, 16))).std() < 3


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cards = data.cards_by_key()
    saved: dict[str, Image.Image] = {}

    for name, cols, rows, keys in (
        ("cards1.jpg", 6, 2, [f"F{n:03d}" for n in range(1, 12)]),
        ("cards2.jpg", 6, 2, [f"P{n}" for n in range(101, 113)]),
    ):
        for key, cell in zip(keys, cells(sheet(name), cols, rows)):
            saved[key] = cell

    # the cells of cards3..7 (empty ones skipped) come in id order: projects P113-P132, sponsors S201-S264, animals, then the Marine Worlds
    # sponsors S265-S282 and the Marine Worlds projects / endgame cards
    sheet_cells = []
    for n in range(3, 8):
        sheet_cells += [(n, i, cell) for i, cell in enumerate(cells(sheet(f"cards{n}.jpg"), 10, 7)) if not is_empty(cell)]
    def num(k):
        return int(k[1:])
    on_sheet = {k for k in cards if k not in NOT_ON_SHEETS}
    expected = ([f"P{n}" for n in range(113, 133)]
                + sorted((k for k in on_sheet if k[0] == "S" and num(k) <= 264), key=num)
                + sorted((k for k in on_sheet if k[0] == "A"), key=num)
                + sorted((k for k in on_sheet if k[0] == "S" and num(k) > 264), key=num)
                + [f"P{n}" for n in range(133, 140)] + [f"F{n:03d}" for n in range(12, 18)])
    print(f"{len(sheet_cells)} cells on cards3-7, {len(expected)} cards expected there")
    if len(sheet_cells) != len(expected):
        sys.exit("cell and card counts differ: a card is missing from the sheets or the order assumption is wrong")
    for key, (n, i, cell) in zip(expected, sheet_cells):
        saved[key] = cell

    check_against_art(sheet_cells, expected, cards)

    for key, cell in saved.items():
        cell.save(OUT / f"{key}.webp", quality=88)
    missing = sorted(set(cards) - set(saved))
    print(f"saved {len(saved)} card images to {OUT}; no image for {len(missing)}: {missing}")


if __name__ == "__main__":
    main()
