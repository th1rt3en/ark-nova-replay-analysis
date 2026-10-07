"""Release the engine version declared in `engine/version.py`: append it with its fingerprints, the git commit and a change note to `engine_versions.json` (append only).

    python scripts/release_engine.py --note "confirm / undo / restart turn" [--note "..."]

Refuses a version that ends in -dev, one that is already in the manifest, and a working tree whose rule code or data changed since the last release with the same version number
(bump `ENGINE_VERSION` first). Every release abandons the running live tables (docs/live_game_plan.md decision 15): batch the rule changes.
"""
import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from ark_nova.engine.version import ENGINE_VERSION, MANIFEST, fingerprint  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--note", action="append", default=[], required=True, help="what changed (repeat for several lines)")
    args = ap.parse_args()
    if ENGINE_VERSION.endswith("-dev"):
        print(f"{ENGINE_VERSION} is a development version: drop the -dev suffix in engine/version.py to release it")
        return 1
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if any(e["version"] == ENGINE_VERSION for e in manifest):
        print(f"{ENGINE_VERSION} is already released: bump ENGINE_VERSION")
        return 1
    commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=MANIFEST.parent).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain", "src", "data_manual"], capture_output=True, text=True, cwd=MANIFEST.parent).stdout.strip())
    manifest.append({**fingerprint(), "commit": commit, "uncommitted_changes": dirty, "date": datetime.date.today().isoformat(), "notes": args.note})
    MANIFEST.write_text(json.dumps(manifest, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"released {ENGINE_VERSION}" + (" (with uncommitted changes: commit them)" if dirty else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
