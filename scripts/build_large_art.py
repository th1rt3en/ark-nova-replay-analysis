"""Full size action cards for the hover preview (web/action_cards/<type>_<variant>_<side>.webp).

They come from the vendored upstream repo (img/actions/en/<type>/<type>_<variant>_<side>_*.webp are the 744x1039 action cards, variant 0 = the standard card, 1-4 = Marine
Worlds variants, side 1 = I, 2 = II). The animal / sponsor / project / endgame cards (web/cards, web/cards_large) are made by scripts/build_cards.py, not here.
Needs Pillow:  PYTHONIOENCODING=utf8 python scripts/build_large_art.py
"""
import glob
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

IMG = ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public" / "img"
TYPES = ["animals", "association", "build", "cards", "sponsors"]


def main() -> None:
    ac = ROOT / "web" / "action_cards"
    ac.mkdir(parents=True, exist_ok=True)
    m = 0
    for t in TYPES:
        for v in range(5):
            for side in (1, 2):
                files = glob.glob(str(IMG / "actions" / "en" / t / f"{t}_{v}_{side}_*"))
                if files:
                    Image.open(files[0]).convert("RGB").save(ac / f"{t}_{v}_{side}.webp", quality=86)
                    m += 1
    print(f"saved {m} action cards to {ac}")


if __name__ == "__main__":
    main()
