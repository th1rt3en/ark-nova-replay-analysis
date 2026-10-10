"""The manifest `data_manual/minigames.json` decides which mini games exist (docs/accounts_plan.md, "Isolation rules").

A list of {key, enabled, module, title, blurb, allow_past}. A disabled or missing game has no routes, no tile on the hub and no rollover; removing a game is deleting its
folders and its line here. Games are loaded with importlib, so the platform never imports one by name.
"""
import importlib
import json
import logging
from pathlib import Path
from typing import Optional

from ark_nova.minigames.platform.contract import ManifestEntry, MiniGame

log = logging.getLogger(__name__)
MANIFEST = Path(__file__).resolve().parents[4] / "data_manual" / "minigames.json"


def load_manifest(path: Optional[Path] = None) -> list[ManifestEntry]:
    path = path or MANIFEST
    if not path.exists():
        return []
    entries = [ManifestEntry(**e) for e in json.loads(path.read_text(encoding="utf-8"))]
    keys = [e.key for e in entries]
    if len(set(keys)) != len(keys):
        raise ValueError("data_manual/minigames.json: a key is listed twice")
    return [e for e in entries if e.enabled]


def load_games(entries: list[ManifestEntry]) -> dict[str, MiniGame]:
    """The game of every entry that has a `module`. A module that cannot be imported disables that game only (it is logged), never the others."""
    games = {}
    for e in entries:
        if not e.module:
            continue
        try:
            game = importlib.import_module(e.module).GAME
            if game.key != e.key:
                raise ValueError(f"the module's game is {game.key!r}, the manifest says {e.key!r}")
            games[e.key] = game
        except Exception:                                                           # noqa: BLE001
            log.exception("mini game %s could not be loaded: it is left out", e.key)
    return games
