"""The version of the rules (docs/live_game_plan.md 5.10).

`ENGINE_VERSION` is declared here and nowhere else: *major* = the state / action format changed, *minor* = a rule changed, *patch* = a fix that changes no outcome. A version
ending in `-dev` is the one being worked on (not released: no table of the live service may depend on it). A release (`scripts/release_engine.py`) appends the version with
its fingerprints to `engine_versions.json` at the root of the repository; from then on the test `tests/test_engine_version.py` fails when the rule code or the data changed
without a new version, so nobody can change a rule and keep the number.

Fingerprints (computed from the files, never typed):
- `code_hash`: the modules that decide rules (`engine/*.py`, `data/*.py`);
- `data_hash`: the card and map data the engine reads (`data/*.json`) and the manual inputs it is generated from (`data_manual/` variants, projects, map geometry);
- `SCHEMA_VERSION`: the JSON formats of the state, the actions and the events.
"""
import hashlib
from pathlib import Path

ENGINE_VERSION = "0.2.4"
SCHEMA_VERSION = 1

_PKG = Path(__file__).resolve().parents[1]                  # src/ark_nova
_REPO = _PKG.parents[1]
MANIFEST = _REPO / "engine_versions.json"


def _digest(files: list[Path], root: Path) -> str:
    h = hashlib.sha256()
    for f in sorted(files, key=lambda p: p.relative_to(root).as_posix()):
        h.update(f.relative_to(root).as_posix().encode())
        h.update(f.read_bytes().replace(b"\r\n", b"\n"))     # (the same hash on a Windows and on a Linux checkout)
    return h.hexdigest()


def code_hash() -> str:
    return _digest(sorted((_PKG / "engine").glob("*.py")) + sorted((_PKG / "data").glob("*.py")), _PKG)


def data_hash() -> str:
    files = sorted((_PKG / "data").glob("*.json"))
    manual = _REPO / "data_manual"
    extra = [manual / "variants_mw.json", manual / "projects_mw.json"] + sorted((manual / "maps_geometry").glob("*.json")) if manual.exists() else []
    return _digest(files, _PKG) + ("+" + _digest([f for f in extra if f.exists()], manual) if extra else "")


def fingerprint() -> dict:
    return {"version": ENGINE_VERSION, "code_hash": code_hash(), "data_hash": data_hash(), "schema_version": SCHEMA_VERSION}
