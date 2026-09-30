"""Render docs/images/maps/overlay_<id>.jpg for every map image in the vendored upstream repo."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public" / "img" / "maps"
OUT = ROOT / "docs" / "images" / "maps"
OUT.mkdir(parents=True, exist_ok=True)
for img in sorted(SRC.glob("plan*.jpg")):
    map_id = img.stem[4:]  # plan1a -> 1a, planT1 -> T1, plana -> a (beginner board), plan0 -> 0 (beginner board)
    # map area of the full board scan (input pixels); the rest of the scan is the player board
    subprocess.run([sys.executable, str(ROOT / "scripts" / "render_map_overlay.py"), str(img),
                    str(OUT / f"overlay_{map_id}.jpg"), "--preset", "full", "--crop", "0,0,2800,2000"], check=True)
