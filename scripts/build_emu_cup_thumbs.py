"""web/emu_cup_winners/thumbs/<season, 2 digits>.webp: the round portraits of the roll of honour next to the enlarged Victory Column card (web/js/cards.js `showRoll`), 112 x 112 px, cut square
out of the winner's photo (data_manual/emu_cup_photos/<photo>: the photos are sources and are not served, see web/emu_cup_winners/winners.json: `photo`, `focus` = the face as fractions of the photo; default the middle). A winner without a photo file gets no thumbnail (the page shows an initial).
Run with the system python (Pillow):  python scripts/build_emu_cup_thumbs.py"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "web" / "emu_cup_winners"                 # (winners.json, thumbs/: served)
PHOTOS = ROOT / "data_manual" / "emu_cup_photos"        # (the source photos: not served)
SIZE, ZOOM = 112, 0.62                     # (thumbnail px; the square is ZOOM x the photo's shorter side)


def main() -> None:
    (DIR / "thumbs").mkdir(exist_ok=True)
    data = json.loads((DIR / "winners.json").read_text("utf-8"))
    for w in data["winners"]:
        f = PHOTOS / w.get("photo", "")
        w.pop("thumb", None)
        if not w.get("photo") or not f.exists():
            continue
        w["thumb"] = True                                  # (the page asks for the thumbnails of these winners only)
        im = Image.open(f).convert("RGB")
        side = round(min(im.size) * ZOOM)
        fx, fy = w.get("focus", [0.5, 0.5])
        x = min(max(round(fx * im.width - side / 2), 0), im.width - side)
        y = min(max(round(fy * im.height - side / 2), 0), im.height - side)
        out = DIR / "thumbs" / f"{int(w['season']):02d}.webp"
        im.crop((x, y, x + side, y + side)).resize((SIZE, SIZE), Image.LANCZOS).save(out, quality=88)
        print("written", out.name, f"({w['name']})")
    (DIR / "winners.json").write_text(json.dumps(data, indent=4, ensure_ascii=False) + "\n", "utf-8")


if __name__ == "__main__":
    main()
