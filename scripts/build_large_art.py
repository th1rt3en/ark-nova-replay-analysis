"""Full size card art for the hover preview: the sponsors' full cards (web/cards_large/<key>.webp) and every action card (web/action_cards/<type>_<variant>_<side>.webp).

Both come from the vendored upstream repo (img/sponsors/<id>.jpg are complete 745x1040 cards; img/actions/en/<type>/<type>_<variant>_<side>_*.webp are the 744x1039
action cards, variant 0 = the standard card, 1-4 = Marine Worlds variants, side 1 = I, 2 = II). Animals, projects and endgame cards only exist as the 240 px cards of
web/cards (build_card_images.py); the upstream animal images are just the photo.
Needs Pillow:  PYTHONIOENCODING=utf8 python scripts/build_large_art.py
"""
import glob
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from ark_nova import data  # noqa: E402

IMG = ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public" / "img"
TYPES = ["animals", "association", "build", "cards", "sponsors"]


def main() -> None:
    sp = ROOT / "web" / "cards_large"
    sp.mkdir(parents=True, exist_ok=True)
    n = 0
    for key, c in data.cards_by_key().items():
        src = IMG / "sponsors" / f"{c.get('bga_id')}.jpg"
        if c["card_type"] == "sponsor" and src.exists():
            Image.open(src).convert("RGB").save(sp / f"{key}.webp", quality=86)
            n += 1
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
    print(f"saved {n} sponsor cards to {sp} and {m} action cards to {ac}")


if __name__ == "__main__":
    main()
