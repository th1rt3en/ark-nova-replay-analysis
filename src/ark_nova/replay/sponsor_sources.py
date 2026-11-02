"""Source-specific sponsor observations from retained BGA outcomes, without running the engine."""
from collections import defaultdict


def sponsor_event_gains(raw_log, parsed, known_maps=None) -> dict:
    """Return order -> [(sponsor, statistic, amount)]. Public source states are authoritative.

    Excavation normally uses known board geometry (awarded printed bonuses, twice).
    For an unknown map, retain only outcomes whose placement source is established.
    Private state snapshots may precede the public outcome and must not clear its source.
    """
    kept = {e.order: e for move in parsed.moves for e in move.events}
    known_maps = known_maps or {}
    out, seen = defaultdict(list), set()
    state, owner, source, reason = None, None, None, None
    excavation, scuba_used, signature = None, False, None
    active = defaultdict(set)
    order = 0
    for packet in raw_log["data"]["logs"]:
        for event in packet.get("data", []):
            order += 1
            a = event.get("args") if isinstance(event.get("args"), dict) else {}
            typ = event.get("type")
            if typ == "gameStateChange":
                if not str(packet.get("channel", "")).startswith("/table/"):
                    continue
                b = a.get("args") if isinstance(a.get("args"), dict) else {}
                state, owner = str(a.get("id")), str(a.get("active_player"))
                source, reason = str(b.get("sourceId") or "")[:4], b.get("source")
                now = (str(packet.get("move_id")), state, owner, source)
                if state == "91" and source == "S270" and now != signature:
                    scuba_used = False
                signature = now
                if state in {"7", "20"}:
                    excavation = None
                continue
            if order not in kept:
                continue
            pid = str(a.get("player_id", kept[order].player))
            uid = event.get("uid")
            identity = (str(packet.get("table_id")), str(packet.get("move_id")), typ, str(uid))
            if uid is not None and str(uid) and identity in seen:
                continue
            if uid is not None and str(uid):
                seen.add(identity)
            if typ == "playSponsor":
                card = a.get("card") or {}
                active[pid].add(str(a.get("card_id") or card.get("id") or "")[:4])
                excavation = None
            elif typ == "discardCardsOnDisplay":
                for card in a.get("cards") or []:
                    active[pid].discard(str(card.get("id") or "")[:4])
            elif typ == "chooseActionCard":
                excavation = None
            if typ == "buyBuilding":
                b = a.get("building") or {}
                if source == "S280" and state == "30" and owner == pid and b.get("type") in {"kiosk", "pavilion"}:
                    out[order].append(("S280", b["type"], 1))
                # A new building establishes a new placement source. Reposition notifications never enter here.
                excavation = pid if b.get("type") == "excavation" and "S271" in active[pid] and "S280" not in active[pid] else None
            if owner != pid:
                continue
            if typ == "markCard" and state == "103" and source == "S268":
                cards = a.get("cards") or {}
                ids = cards if isinstance(cards, dict) else [c.get("id", "") for c in cards]
                n = sum(str(key).startswith("A") for key in ids)
                if n:
                    out[order].append(("S268", "animals_marked", n))
            if typ in {"pDrawCards", "drawCards"} and source == "S270" and state in {"91", "114"} and not scuba_used:
                n = len(a["cards"]) if isinstance(a.get("cards"), list) else int(a.get("n") or 0)
                if n:
                    out[order].append(("S270", "scuba3", 1))
                    scuba_used = True
            if excavation != pid or known_maps.get(pid):
                continue
            # Unknown-map fallback: direct placement rewards, not nested university rewards or other sponsors.
            placement = reason == "placement bonus"
            if typ == "getBonuses" and a.get("source") == "placement bonus":
                for resource, n in (a.get("bonuses") or {}).items():
                    if isinstance(n, (int, float)) and n > 0:
                        out[order].append(("S271", "doubled:" + resource, int(n)))
            elif placement and typ == "slideMeeples" and state in {"80", "81"}:
                for token in a.get("meeples") or []:
                    location = str(token.get("location") or "")
                    name = "Fac" if location.startswith("university_") else "Partner-Zoo" if location.startswith("partner_") else None
                    if name:
                        out[order].append(("S271", "doubled:" + name, 1))
            elif placement and typ == "actionCardCleanup" and state == "65" and "Clever effect" in kept[order].log:
                out[order].append(("S271", "doubled:Clever", 1))
            elif placement and typ in {"pDrawCards", "drawCards", "snapCard"} and state in {"27", "59"}:
                n = len(a["cards"]) if isinstance(a.get("cards"), list) else int(a.get("n") or 0)
                if n:
                    out[order].append(("S271", "doubled:take-in-range-or-deck", n))
            elif placement and typ == "upgradeCard" and state == "37":
                out[order].append(("S271", "doubled:upgrade-card", 1))
    return dict(out)
