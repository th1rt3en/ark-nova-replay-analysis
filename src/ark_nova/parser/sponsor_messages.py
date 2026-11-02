"""Recognize the informational notifications needed by sponsor statistics."""
import re

_PROTECTION = re.compile(r"^\$\{player_name\} is not affected by (Venom|Constriction|Hypnosis|Pilfering) thanks to their Quarantine Lab sponsor card[.!]?$", re.IGNORECASE)


def protection_ability(event: dict) -> str | None:
    if event.get("type") != "midmessage":
        return None
    match = _PROTECTION.fullmatch(str(event.get("log") or ""))
    args = event.get("args")
    return match[1].lower() if match and isinstance(args, dict) and args.get("player_id") is not None else None


def accepted_protection_orders(packets: list[dict]) -> frozenset[int]:
    """Keep one representation per identified message, preferring public copies.

    Different UIDs at one move are distinct protections. Without a UID, only
    identical packet/position provenance is deduplicated, never equal wording.
    """
    chosen = {}
    order, move = 0, None
    for packet_index, packet in enumerate(packets):
        if packet.get("move_id") is not None:
            move = int(packet["move_id"])
        public = str(packet.get("channel", "")).startswith("/table/")
        for position, event in enumerate(packet.get("data", [])):
            order += 1
            if not protection_ability(event):
                continue
            uid = event.get("uid")
            identity = (str(packet.get("table_id", "")), move, event["type"])
            if uid is not None and str(uid) != "":
                identity += ("uid", str(uid))
            else:
                provenance = str(packet["packet_id"]) if packet.get("packet_id") is not None else ("position", packet_index)
                identity += ("packet", str(packet.get("channel", "")), provenance, position)
            old = chosen.get(identity)
            if old is None or (public and not old[1]):
                chosen[identity] = (order, public)
    return frozenset(order for order, _ in chosen.values())
