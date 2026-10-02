"""Check that an uploaded file is a finished 2-player Ark Nova BGA replay log (returns human readable problems)."""
import re
from typing import Any

from ark_nova.parser.log import parse_log

CARD_ID = re.compile(r"^[ASPF]\d{3}_")
_PLAYER_CHANNEL = re.compile(r"^/player/p(\d+)$")


def _events(packets: list[dict]):
    for p in packets:
        for e in p["data"]:
            if isinstance(e, dict):
                yield e


def verify_log(raw: Any, table_id: int | None = None) -> list[str]:
    if not isinstance(raw, dict) or not isinstance(raw.get("data"), dict) or not isinstance(raw["data"].get("logs"), list):
        return ["Not a BGA replay log: expected a JSON object shaped like {\"data\": {\"logs\": [...]}}."]
    packets = raw["data"]["logs"]
    if not packets:
        return ["The log has no packets."]
    for p in packets:
        if not (isinstance(p, dict) and {"channel", "table_id", "packet_id", "move_id", "time"} <= p.keys()
                and isinstance(p.get("data"), list)):
            return ["Malformed log: a packet is missing channel, table_id, packet_id, move_id, time or data."]
    errors = []
    if table_id is not None and str(packets[0]["table_id"]) != str(table_id):
        errors.append(f"The log is for table {packets[0]['table_id']}, not table {table_id}.")

    players = {str(p["id"]) for p in raw["data"].get("players") or [] if isinstance(p, dict) and "id" in p}
    if not players:
        players = {m.group(1) for p in packets if (m := _PLAYER_CHANNEL.match(str(p["channel"])))}
    if len(players) != 2:
        errors.append(f"Only 2-player games are supported (the log has {len(players)} players).")

    if not all(isinstance(e.get("type"), str) and "args" in e for e in _events(packets)):
        return errors + ["Malformed log: an event is missing type or args."]
    types = {e["type"] for e in _events(packets)}
    card_ids = (c.get("id") for e in _events(packets) if e["type"] in ("fillPool", "pDrawCards")
                for c in (e["args"].get("cards") or [] if isinstance(e["args"], dict) else []) if isinstance(c, dict))
    if "chooseActionCard" not in types or not any(isinstance(i, str) and CARD_ID.match(i) for i in card_ids):
        errors.append("This does not look like an Ark Nova log (no action card choices or Ark Nova cards found).")
        return errors
    ended = any(e["type"] == "finalScoring" or (e["type"] == "gameStateChange" and isinstance(e["args"], dict) and e["args"].get("id") == 99)
                for e in _events(packets))
    if not ended:
        errors.append("The game is not finished: the log never reaches the end of the game.")
    if errors:
        return errors

    try:
        parsed = parse_log(raw)
    except Exception as e:  # noqa: BLE001 - any parser failure means the log is unusable
        return [f"The log could not be parsed ({type(e).__name__}: {e})."]
    if not parsed.moves:
        errors.append("The log contains no game moves.")
    return errors
