"""Load a BGA replay log into a `ParsedLog`.

Rules (details and evidence in docs/log_format.md):
- packets are chronological in `packet_id` order; events keep their order inside a packet;
- moves are grouped by `move_id`; a move with no non-noise event is state-only and is dropped (replay steps = kept moves);
- a public event whose private twin exists in the same move is dropped (the private one carries the card ids).
"""
import json
import re
from pathlib import Path
from typing import Any

from ark_nova.parser.model import Event, Move, ParsedLog, PlayerInfo

NOISE = {
    "gameStateChange", "gameStateMultipleActiveUpdate", "updateReflexionTime", "midmessage", "wakeupPlayers",
    "simpleNote", "simpleNode", "newUndoableStep",
}
PUBLIC_TWIN_OF = {          # public event -> its private twin
    "drawCards": "pDrawCards",
    "discardCards": "pDiscardCards",
    "storeCard": "pStoreCard",
    "unstoreCard": "pUnstoreCard",
}
_PLAYER_CHANNEL = re.compile(r"^/player/p(\d+)$")


def data_key(card_id: str) -> str:
    from ark_nova import data
    return data.parse_bga_card_id(card_id)[0]


def load_json(path: str | Path) -> dict:
    return json.loads(Path(path).read_text("utf8"))


def parse_log(raw: dict | str | Path) -> ParsedLog:
    """`raw` is the decoded JSON of a log file (or a path to it)."""
    if not isinstance(raw, dict):
        raw = load_json(raw)
    data = raw["data"]
    packets = data["logs"]

    table_id = int(packets[0]["table_id"]) if packets else 0
    players = [PlayerInfo(id=str(p["id"]), name=p.get("name", "")) for p in data.get("players", [])]
    if not players:      # e.g. a concede where BGA left the list empty: derive from the private channels
        seen = []
        for p in packets:
            m = _PLAYER_CHANNEL.match(p["channel"])
            if m and m.group(1) not in seen:
                seen.append(m.group(1))
        players = [PlayerInfo(id=i) for i in seen]

    by_move: dict[Any, Move] = {}
    order = 0
    result = None
    conceded = None
    final_scores: dict[str, int] = {}
    turn_markers: list[tuple[int, str]] = []
    move_ids = set()
    current_move_key = None
    for p in packets:
        mid = p["move_id"]
        key = int(mid) if mid is not None else current_move_key      # null move ids belong to the surrounding move
        if mid is not None:
            current_move_key = key
            move_ids.add(key)
        m = _PLAYER_CHANNEL.match(p["channel"])
        player = m.group(1) if m else None
        for e in p["data"]:
            order += 1
            t, a = e["type"], e["args"]
            if t == "gameStateChange" and isinstance(a, dict) and a.get("id") == 99 and isinstance(a.get("args"), dict):
                result = a["args"].get("result") or result
            if t == "playerConcedeGame" and isinstance(a, dict):
                conceded = str(a.get("player_id", conceded))
            if t == "finalScoring" and isinstance(a, dict):
                final_scores[str(a["player_id"])] = int(a["newScore"])
            if t == "gameStateChange" and isinstance(a, dict) and a.get("id") == 20 and player is None:
                turn_markers.append((order, str(a.get("active_player"))))
            if t == "gameStateChange" and isinstance(a, dict) and a.get("id") == 20 and player and isinstance(a.get("args"), dict):
                statuses = (a["args"].get("_private") or {}).get("statuses")
                if isinstance(statuses, dict):
                    mv0 = by_move.get(key)
                    if mv0 is None:
                        mv0 = by_move[key] = Move(index=-1, move_id=key, time=int(p["time"]))
                    mv0.checks.append({"player": player, "hand_and_display": sorted(data_key(c) for c in statuses),
                                       "xtokens": a["args"].get("xtokens"), "active": str(a.get("active_player"))})
            if t == "gameStateChange" and isinstance(a, dict) and a.get("id") == 30 and player and isinstance(a.get("args"), dict):
                aa = a["args"]
                opts = aa.get("buildings")
                mv0 = by_move.get(key)
                if mv0 is None:
                    mv0 = by_move[key] = Move(index=-1, move_id=key, time=int(p["time"]))
                mv0.checks.append({"player": player, "active": str(a.get("active_player")), "build": {
                    "lvl": aa.get("lvl"), "source_id": aa.get("sourceId"), "max_size": aa.get("maxSize"), "free": aa.get("free"), "can_pass": aa.get("canPass"),
                    "types": aa.get("allBuildings"),
                    "options": {t2: sorted((d["pos"]["x"], d["pos"]["y"], r) for d in lst for r in d["rotations"])
                                for t2, lst in opts.items()} if isinstance(opts, dict) else {}}})
            if t in NOISE:
                continue
            mv = by_move.get(key)
            if mv is None:
                mv = by_move[key] = Move(index=-1, move_id=key, time=int(p["time"]))
            mv.events.append(Event(type=t, args=a, log=e.get("log", ""), player=player, packet_id=int(p["packet_id"]), order=order))

    moves = []
    for mv in by_move.values():
        if not mv.events:
            if moves:                       # a state-only move: the state did not change, its snapshots belong to the previous step
                moves[-1].checks.extend(mv.checks)
            continue
        types = {e.type for e in mv.events}
        mv.events = [e for e in mv.events if not (e.type in PUBLIC_TWIN_OF and PUBLIC_TWIN_OF[e.type] in types)]
        mv.index = len(moves)
        moves.append(mv)
    return ParsedLog(table_id=table_id, players=players, moves=moves, total_move_ids=len(move_ids),
                     result=result, conceded=conceded, final_scores=final_scores, turn_markers=turn_markers)
