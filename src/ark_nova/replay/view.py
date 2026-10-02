"""Everything the replay viewer needs for one table, as JSON: static facts (players, maps, card catalog) + one view per replay step.

A step is one kept `move_id` of the log; its state is the replay builder's state after that move (`Replay.states`), without the
decks (only their sizes) and with the cells every building covers, so the browser needs no board geometry code.
"""
import re
from pathlib import Path
from typing import Any

from ark_nova import data
from ark_nova.engine import tracks
from ark_nova.engine.breaks import hand_limit
from ark_nova.engine.board import footprint_cells
from ark_nova.engine.build_action import knows_shape, shape_of
from ark_nova.engine.state import GameState
from ark_nova.parser.log import parse_log
from ark_nova.parser.model import Move, ParsedLog
from ark_nova.replay.builder import Replay, build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.storage.index import TableRecord

_PLACEHOLDER = re.compile(r"\$\{(\w+)\}")
IMAGE_DIR = {"animal": "animals", "sponsor": "sponsors"}       # fallback art from the vendored upstream repo (/img)
LARGE_DIR = Path(__file__).resolve().parents[3] / "web" / "cards_large"      # full size sponsor cards for the hover preview (scripts/build_large_art.py)
CARD_DIR = Path(__file__).resolve().parents[3] / "web" / "cards"    # full card images cut by scripts/build_card_images.py
STATE_DROP = ("main_deck", "main_discard", "endgame_deck", "endgame_discard", "seed", "config", "rng", "base_projects_unused", "version")


def render_log(template: str, args: Any, depth: int = 0) -> str:
    """BGA log template + args -> plain text. Icon placeholders and unknown arguments disappear."""
    if not isinstance(args, dict) or depth > 4:
        return _PLACEHOLDER.sub("", template or "").strip()

    def sub(m: re.Match) -> str:
        v = args.get(m.group(1))
        if isinstance(v, dict) and "log" in v:
            return render_log(v["log"], v.get("args"), depth + 1)
        if isinstance(v, (str, int, float)) and not isinstance(v, bool):
            return str(v)
        return ""

    return re.sub(r"\s+", " ", _PLACEHOLDER.sub(sub, template or "")).strip()


def step_label(move: Move, names: dict[str, str]) -> str:
    texts = []
    for e in move.events:
        t = render_log(e.log, e.args)
        if e.player and names.get(e.player):          # private events are written for the player: "You draw ..."
            t = re.sub(r"^You", names[e.player], t)
        if t and t not in texts:
            texts.append(t)
    return " · ".join(texts[:3])


def building_cells(state_building: dict) -> list[list[int]]:
    t = state_building["type"]
    if not knows_shape(t):
        return []
    return [list(c) for c in footprint_cells(shape_of(t), (state_building["x"], state_building["y"]), state_building["rotation"])]


def state_view(state: GameState) -> dict:
    s = state.to_dict()
    s["main_deck_size"], s["endgame_deck_size"] = len(s["main_deck"]), len(s["endgame_deck"])
    s["main_discard_size"] = len(s["main_discard"])
    for k in STATE_DROP:
        s.pop(k, None)
    for p, ps in zip(s["players"], state.players):
        p["score"] = tracks.score(ps.appeal, ps.conservation)
        p["hand_limit"] = hand_limit(ps)
        p["income"] = tracks.income_from_appeal(ps.appeal)       # the money the appeal track gives at a break
        for b in p["buildings"]:
            b["cells"] = building_cells(b)
    return s


def card_catalog(keys: set[str]) -> dict[str, dict]:
    cards = data.cards_by_key()
    out = {}
    for k in sorted(keys):
        c = cards.get(k)
        if not c:
            out[k] = {"name": k, "type": "unknown"}
            continue
        entry = {"name": c.get("name", k), "type": c["card_type"], "bga_id": c.get("bga_id")}
        if (LARGE_DIR / f"{k}.webp").exists():
            entry["large"] = f"/cards_large/{k}.webp"
        if (CARD_DIR / f"{k}.webp").exists():
            entry["image"] = f"/cards/{k}.webp"
        elif c["card_type"] in IMAGE_DIR and c.get("bga_id"):
            entry["image"] = f"/img/{IMAGE_DIR[c['card_type']]}/{c['bga_id']}.jpg"
        if c["card_type"] == "animal":
            entry.update(size=c.get("size"), price=c.get("price"), appeal=c.get("appeal"))
        out[k] = entry
    return out


def _card_keys(obj: Any, out: set[str]) -> None:
    if isinstance(obj, str):
        if re.fullmatch(r"[ASPF]\d{3}", obj):
            out.add(obj)
    elif isinstance(obj, list):
        for x in obj:
            _card_keys(x, out)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _card_keys(k, out)
            _card_keys(v, out)


def map_view(map_id: str) -> dict:
    m = data.map_by_id(map_id)
    geo = m["geometry"] or {}
    return {"id": map_id, "name": m["name"], "image": f"/maps/map-{map_id}.jpg",
            "hexes": geo.get("hexes", []), "placement_bonuses": geo.get("placement_bonuses", []),
            "special_hexes": geo.get("special_hexes", []), "bonus_slots": geo.get("bonus_slots", [])}


def build_replay_view(raw_log: dict, record: TableRecord) -> dict:
    parsed: ParsedLog = parse_log(raw_log)
    seats = [str(p.id) for p in parsed.players]
    maps = None
    if record.player_maps and all(pid in record.player_maps for pid in seats):
        maps = [record.player_maps[pid] for pid in seats]
    setup, config, seed = game_from_log(parsed, maps=maps, marine_worlds=record.marine_worlds if record.player_maps else None)
    if maps is None:
        maps = config.maps
    rep: Replay = build_replay(parsed, setup, config, seed)
    names = {str(p.id): p.name for p in parsed.players}
    colors = {str(p["id"]): p.get("color") for p in raw_log["data"].get("players") or [] if isinstance(p, dict)}
    states = [state_view(s) for s in rep.states]
    keys: set[str] = set()
    _card_keys(states, keys)
    _card_keys(config.base_projects, keys)
    return {
        "table_id": parsed.table_id,
        "marine_worlds": config.marine_worlds,
        "players": [{"seat": i, "id": pid, "name": names.get(pid, pid), "color": colors.get(pid)} for i, pid in enumerate(config.player_ids)],
        "maps": [map_view(m) for m in config.maps],
        "base_projects": config.base_projects,
        "result": [{k: r.get(k) for k in ("id", "name", "score", "rank")} for r in parsed.result or []],
        "setup_steps": rep.setup_moves,
        "cards": card_catalog(keys),
        "steps": [{"index": i, "move_id": mv.move_id, "label": step_label(mv, names), "state": st}
                  for i, (mv, st) in enumerate(zip(rep.moves, states))],
    }
