"""Evidence for each animal play: player-private requirements and the selected BGA Animals flow.

This is parser metadata, not an allocation of requirements among overlapping bypass sources.
A confirming public flow can follow buyAnimal in the same packet; counters still belong to the play's order.
"""
from collections import defaultdict
import re

_PLAYER = re.compile(r"^/player/p(\d+)$")


def _integer(value):
    try:
        return int(value) if value is not None else None
    except (ValueError, TypeError):
        return None


def _branch(flow):
    maximum, level, strength = (_integer(flow.get(k)) for k in ("max", "lvl", "strength"))
    if maximum is None or level not in {1, 2} or strength is None:
        return None
    if _integer(flow.get("ignore")) == 1:
        # The card table caps at five; boosted action strengths above five remain valid.
        return maximum == 1 and ((level == 1 and strength >= 5) or (level == 2 and strength >= 3))
    return False if maximum == 2 else None


def animal_ignore_evidence(packets, retained) -> dict:
    """Return retained buyAnimal order -> evidence, without depending on engine replay success.

    Only the matching player's private statuses are authoritative. Public flow states
    avoid private snapshots that can announce the next state before its public outcome.
    Token use is paired with the immediately following public notification, never turn-wide.
    Missing data remains unknown and cannot create an Ignore Animals statistic.
    """
    statuses = defaultdict(dict)
    actions, pre_flow, last_play, records = {}, {}, {}, {}
    seen = set()
    previous_public = None
    order = 0
    for packet_index, packet in enumerate(packets):
        channel = str(packet.get("channel", ""))
        private = _PLAYER.fullmatch(channel)
        private = private.group(1) if private else None
        public = channel.startswith("/table/")
        for event in packet.get("data", []):
            order += 1
            typ = event.get("type")
            a = event.get("args") if isinstance(event.get("args"), dict) else {}
            b = a.get("args") if isinstance(a.get("args"), dict) else {}
            if private:
                snapshot = a.get("statuses")
                if typ == "gameStateChange":
                    inner = b.get("_private") if isinstance(b.get("_private"), dict) else {}
                    snapshot = inner.get("statuses")
                if isinstance(snapshot, dict):
                    for card, status in snapshot.items():
                        if isinstance(status, dict):
                            conditions = status.get("conditions") or {}
                            if isinstance(conditions, dict):
                                statuses[private][str(card)[:4]] = (_integer(conditions.get("ignored")), order)
            if not public:
                continue
            pid = str(a.get("player_id", ""))
            token_for_play = (typ == "buyAnimal" and previous_public is not None
                              and previous_public[0] == pid and previous_public[1] == "ignore-token")
            previous_public = (pid, "ignore-token") if typ == "discardTokens" and any(
                isinstance(t, dict) and t.get("type") == "bonus-ignore-conditions" for t in a.get("meeples") or []) else None
            if typ == "gameStateChange":
                owner = str(a.get("active_player", ""))
                if str(a.get("id")) in {"7", "20"}:
                    actions.pop(owner, None)
                    pre_flow.pop(owner, None)
                    last_play.pop(owner, None)
                if not {"lvl", "max", "strength"} <= b.keys() or owner not in actions:
                    continue
                branch = _branch(b)
                selected = actions[owner]
                last = records.get(last_play.get(owner))
                if (last is not None and last["action_order"] == selected["order"]
                        and (last["packet"] == packet_index or last["move"] == str(packet.get("move_id"))) and not last.get("post_flow")):
                    # Same-packet post-play confirmation supersedes an ordinary pre-selection flow.
                    last.update(branch=branch, flow_order=order, post_flow=True)
                elif _integer(b.get("number", 0)) == 0:
                    pre_flow[owner] = (branch, order, selected["order"])
                continue
            if order not in retained:
                continue
            if typ == "chooseActionCard":
                actions[pid] = {"type": str((a.get("actionCard") or {}).get("type", "")), "order": order}
                pre_flow.pop(pid, None)
                last_play.pop(pid, None)
            elif typ == "actionCardCleanup" and "finishing action" in str(event.get("log", "")):
                actions.pop(pid, None)
                pre_flow.pop(pid, None)
                last_play.pop(pid, None)
            elif typ == "buyAnimal":
                uid = event.get("uid")
                identity = (str(packet.get("table_id")), str(packet.get("move_id")), typ, str(uid))
                duplicate = uid is not None and str(uid) != "" and identity in seen
                if uid is not None and str(uid) != "":
                    seen.add(identity)
                card = str(a.get("card_id") or (a.get("card") or {}).get("id") or "")[:4]
                required, status_order = statuses[pid].get(card, (None, None))
                selected = actions.get(pid, {})
                flow = pre_flow.pop(pid, None)
                records[order] = {
                    "player": pid, "card": card, "requirements": required, "status_order": status_order,
                    "action_type": selected.get("type"), "action_order": selected.get("order"),
                    "branch": flow[0] if flow and flow[2] == selected.get("order") else None,
                    "flow_order": flow[1] if flow and flow[2] == selected.get("order") else None,
                    "token": token_for_play, "duplicate": duplicate, "packet": packet_index, "move": str(packet.get("move_id")),
                }
                if not duplicate:
                    last_play[pid] = order
    return records
