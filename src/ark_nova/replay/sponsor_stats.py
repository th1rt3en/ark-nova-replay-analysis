"""Replay-only sponsor observations. These functions never change game rules/state."""
import functools
from collections import Counter

from ark_nova import data
from ark_nova.parser.sponsor_messages import protection_ability

EXTRA_TRACKED = {"S201", "S206", "S207", "S209", "S215", "S216", "S218", "S220", "S222", "S225", "S226",
                 "S231", "S232", "S233", "S234", "S235", "S257", "S258", "S259", "S260", "S261", "S264",
                 "S265", "S267", "S271", "S272", "S274", "S281"}
RESOURCE_POLICY = {
    "S201": {"conservation"}, "S206": {"appeal", "conservation"}, "S207": {"conservation"},
    "S209": {"xtoken", "conservation"}, "S210": {"appeal", "conservation"}, "S211": {"appeal", "conservation"},
    "S212": {"appeal"}, "S213": {"appeal"}, "S214": {"appeal"}, "S215": {"conservation"},
    "S216": {"conservation"}, "S218": {"conservation"}, "S220": {"money"}, "S222": {"conservation"},
    "S224": {"xtoken", "conservation"}, "S225": {"conservation"}, "S226": {"conservation"},
    "S228": set(), "S229": {"appeal"}, "S230": {"appeal"},
    **{f"S{n}": {"appeal", "money"} for n in range(231, 236)},
    "S257": {"money", "appeal"},
    **{key: {"appeal", "conservation"} for key in ("S258", "S259", "S260", "S264", "S267")},
    "S261": {"conservation"}, "S265": {"money", "conservation"}, "S271": {"conservation"},
    "S272": {"conservation"}, "S273": set(), "S274": {"appeal"}, "S279": {"appeal"},
    "S280": {"appeal"}, "S281": {"money", "appeal"},
}
FINAL_ONLY = {"S201": {"conservation"}, "S209": {"conservation"}, "S210": {"conservation"}, "S211": {"conservation"},
              "S215": {"conservation"}, "S216": {"conservation"}, "S218": {"conservation"}, "S225": {"conservation"}, "S226": {"conservation"}}
FINAL_ONLY.update({key: {"conservation"} for key in ("S258", "S259", "S260", "S261", "S264", "S265", "S267", "S271", "S272")})
FINAL_ONLY.update({key: {"appeal"} for key in ("S257", "S280", "S281")})
SAVES = {"S229": ("small", 3), "S230": ("large", 4)}


@functools.lru_cache(maxsize=1)
def tracked_sponsors() -> dict:
    return {str(c["name"]).lower(): c["key"] for c in data.cards_by_key().values()
            if c.get("card_type") == "sponsor"
            and (c["key"] in EXTRA_TRACKED or any(e.get("effectType") == "passive" for e in c.get("effects") or []))}


def card_key(value) -> str:
    return str(value or "")[:4]


class SponsorLogStats:
    """Keep card ownership and action context across backend moves/substeps."""
    def __init__(self, timeline, seat_of, source_hints=None, maps=None, event_gains=None):
        self.timeline, self.seat_of = timeline, seat_of
        self.source_hints = source_hints or {}
        self.maps = maps or []
        self.in_play = {}
        self.actions = {}
        self.actor = None
        self.token_uses = set()
        self.event_gains = event_gains or {}
        self.statue_initial = set()

    def gains(self, move) -> list:
        from ark_nova.engine.sponsor_extras import size_class
        from ark_nova.replay.actions import parse_action_type
        out = []
        self.geometry_actions = {}
        cards, tracked = data.cards_by_key(), tracked_sponsors()
        for event in move.events:
            a = event.args if isinstance(event.args, dict) else {}
            pid = str(a.get("player_id", event.player))
            card = a.get("card")
            key = card_key(a.get("card_id") or (card.get("id") if isinstance(card, dict) else ""))
            for sponsor, stat, amount in self.event_gains.get(event.order, ()):
                if sponsor in self.in_play.get(pid, ()):
                    out.append((event.order, sponsor, stat, amount))
            if event.type in ("buyBuilding", "buyAnimal", "donation"):
                self.geometry_actions[event.order] = self.actions.get(pid)
            if event.type == "chooseActionCard":
                self.actor = pid
                ac = a.get("actionCard") or {}
                typ, variant = parse_action_type(str(ac.get("type") or ""))
                # BGA's outer strength already includes X tokens and modifiers. Never add paid X tokens twice.
                strength = a.get("strength", ac.get("strength"))
                self.actions[pid] = [typ, int(strength) if str(strength).isdigit() else None, variant, False]
            elif event.type == "playSponsor":
                self.actor = pid
                self.in_play.setdefault(pid, set()).add(key)
                if key == "S265":
                    out.append((event.order, key, "money", 0))
                if key == "S274":
                    self.statue_initial.add(pid)
            elif event.type == "buyAnimal":
                self.actor = pid
                c = cards.get(key)
                if (a.get("card") or {}).get("location") != "rescueStation":
                    kind = size_class(c) if c and "size" in c else None
                    for expert, (wanted, amount) in SAVES.items():
                        if expert in self.in_play.get(pid, ()) and kind == wanted:
                            out.append((event.order, expert, "saved", amount))
            elif event.type == "discardCardsOnDisplay":
                for c in a.get("cards") or []:
                    self.in_play.get(pid, set()).discard(card_key(c.get("id")))
            elif event.type == "slideMeeples" and event.log.startswith("${player_name} supports a conservation project"):
                if "S203" in self.in_play.get(pid, ()) and tuple(self.actions.get(pid, ())[:2]) == ("association", 4):
                    out.append((event.order, "S203", "effect_used", 1))
            elif event.type == "discardTokens":
                for position, token in enumerate(a.get("meeples") or []):
                    sponsor = card_key(token.get("location"))
                    identity = (pid, sponsor, str(token["id"])) if token.get("id") is not None else (pid, sponsor, event.order, position)
                    if sponsor in {"S215", "S218", "S253"} and token.get("type") == "token" and identity not in self.token_uses:
                        self.token_uses.add(identity)
                        out.append((event.order, sponsor, "tokens_spent", 1))
            elif event.type == "midmessage":
                ability = protection_ability({"type": event.type, "log": event.log, "args": a})
                # BGA also emits this message for the attacker's own Lab. Retain only an opposing ability owner.
                if ability and self.actor in self.seat_of and self.actor != pid and "S225" in self.in_play.get(pid, ()):
                    out.append((event.order, "S225", "attacks_prevented", 1))
            elif event.type in {"pDrawCards", "drawCards", "snapCard"}:
                if self.source_hints.get(event.order) == "S201" and "S201" in self.in_play.get(pid, ()):
                    count = len(a["cards"]) if isinstance(a.get("cards"), list) else int(a.get("n") or 0)
                    if count:
                        out.append((event.order, "S201", "cards_gained", count))
            elif event.type == "takeBonus" and self.source_hints.get(event.order) == "S221":
                if "S221" in self.in_play.get(pid, ()):
                    desc = (a.get("bonus_desc") or {}).get("args") or {}
                    typ, amount = desc.get("bonus_type"), int(desc.get("bonus_n") or 1)
                    typ = {"SharkAttack": "shark-attack", "ExtraShift": "extra-shift", "map10": "Digging"}.get(typ, typ)
                    seat = self.seat_of.get(pid)
                    if typ == "Worker" and seat is not None and seat < len(self.maps) and self.maps[seat] == "11":
                        typ = "extra-shift"
                    if typ:
                        stat, n = (f"placement:{typ}:{amount}", 1) if typ in {"Scavenging", "Digging"} else ("placement:" + typ, amount)
                        out.append((event.order, "S221", stat, n))
            elif event.type == "getBonuses":
                source = a.get("card_name") or a.get("source")
                key = key if key in tracked.values() else tracked.get(str(source).lower())
                bonuses = a.get("bonuses")
                if source == "Sponsors2 effect" and isinstance(bonuses, dict) and pid in self.seat_of:
                    out.append((event.order, f"{self.seat_of[pid]}:sponsors", "money", int(bonuses.get("money") or 0)))
                if key and isinstance(bonuses, dict):
                    # An opponent's payment (Basic Research / Patents) is not a benefit of their own sponsor.
                    if key not in self.in_play.get(pid, ()):
                        continue
                    phase = self.timeline.context(event.order)["phase"]
                    scoring = phase == "scoring"
                    for resource, amount in bonuses.items():
                        if not isinstance(amount, (int, float)) or not amount or resource not in RESOURCE_POLICY.get(key, {resource}):
                            continue
                        if resource in FINAL_ONLY.get(key, ()) and not scoring:
                            continue
                        stat = resource
                        if resource == "appeal":
                            if key in {"S214", "S279"}:
                                stat = "appeal_final" if scoring else "appeal_initial"
                            elif key == "S269":
                                stat = "appeal_final" if scoring else "appeal_enlargement"
                            elif key == "S274":
                                # Income also pays once on play, including plays during a break.
                                # Exclude that initial 1 appeal from cumulative break income.
                                if not scoring and pid in self.statue_initial:
                                    self.statue_initial.discard(pid)
                                    amount = max(0, amount - 1)
                                if not amount or (not scoring and phase != "break"):
                                    continue
                                stat = "appeal_final" if scoring else "appeal_income"
                            elif key in {"S257", "S280", "S281"}:
                                stat = "appeal_final"
                        out.append((event.order, key, stat, int(amount)))
            if event.type == "actionCardCleanup" and "finishing action" in event.log:
                # Other effects can finish after cleanup. Keep actor, but don't reuse this action's strength for a future support.
                self.actions.pop(pid, None)
        return sorted(out)


def diversity_gains(event, state, seat_of, action=None) -> list:
    """Actual placement/requirement benefits using the log-built board, independent of engine coverage."""
    from ark_nova.engine.board import board, neighbours
    from ark_nova.engine.build_action import footprint, knows_shape
    from ark_nova.engine.icons import requirement
    a = event.args if isinstance(event.args, dict) else {}
    seat = seat_of.get(str(a.get("player_id")))
    if seat is None or state is None:
        return []
    p = state.players[seat]
    if not state.config.map_known[seat]:
        return []
    bd = board(p.map_id)
    covered = {c for b in p.buildings if knows_shape(b.type) for c in footprint(b.type, b.x, b.y, b.rotation)}
    out = []
    if event.type == "buyBuilding":
        b = a.get("building") or {}
        if not knows_shape(b.get("type")) or b["type"] == "underwater-tunnel":
            return []
        cells = set(footprint(b["type"], b["x"], b["y"], b.get("rotation", 0))) - covered
        terrain = Counter(bd.terrain.get(c) for c in cells)
        # Keep Terrain Build's one-use allowance in statistics context, never mutate the replay state.
        terrain_n = terrain["water"] + terrain["rock"]
        independent = action and action[0] == "build" and action[2] == 4 and not action[3]
        if terrain_n and action and action[0] == "build" and action[2] == 4:
            action[3] = True
        if "S219" not in p.sponsors:
            return []
        if not (independent and terrain_n == 1):
            for name in ("water", "rock"):
                if terrain[name]:
                    out.append((event.order, "S219", name + "_covered", terrain[name]))
        # Unique sponsor buildings can also have terrain adjacency requirements.
        from ark_nova.engine.card_programs import UNIQUE_BUILD
        source = card_key(a.get("card_id"))
        if source not in UNIQUE_BUILD:
            source = next((key for key, (typ, _) in UNIQUE_BUILD.items() if typ == b["type"] and typ not in {"kiosk", "pavilion"} and not typ.startswith("size-")), None)
        around = {n for c in cells for n in neighbours(c) if n not in cells}
        for name in ("water", "rock"):
            required = requirement(source, name, state.config.marine_worlds) if source else 0
            available = sum(bd.terrain.get(c) == name and c not in covered for c in around)
            if name == "water" and b["type"] in {"small-aquarium", "large-aquarium"}:
                required = max(required, 1)
                available += int(any(bd.terrain.get(c) == "water" for c in cells))
            if available < required:
                out.append((event.order, "S219", name + "_ignored", 1))
    elif event.type == "buyAnimal" and "S219" in p.sponsors and (a.get("card") or {}).get("location") != "rescueStation":
        used = a.get("buildings") or []
        if not used:
            return []                         # Flock Animal has no selected enclosure.
        first = used[0]
        b = next((b for b in p.buildings if b.id == first.get("id") or (b.x, b.y) == (first.get("x"), first.get("y"))), None)
        if b is None or not knows_shape(b.type):
            return []
        cells = set(footprint(b.type, b.x, b.y, b.rotation))
        # Water under a tunnel still counts as water; other covered terrain does not.
        blocked = {c for other in p.buildings if other.type != "underwater-tunnel" and knows_shape(other.type)
                   for c in footprint(other.type, other.x, other.y, other.rotation)}
        around = {n for c in cells for n in neighbours(c) if n not in cells} - blocked
        key = card_key((a.get("card") or {}).get("id"))
        for name in ("water", "rock"):
            available = sum(bd.terrain.get(c) == name for c in around)
            if name == "water" and b.type == "underwater-tunnel":
                available += sum(bd.terrain.get(c) == name for c in cells)
            if available < requirement(key, name, state.config.marine_worlds):
                out.append((event.order, "S219", name + "_ignored", 1))
    return out


def sponsor_source_hints(raw_log, parsed) -> dict:
    """Bind retained acquisitions/bonus choices to BGA's explicit source state.

    State 27 identifies the card-taking source; state 91 identifies the bonus
    selection source; state 33 identifies an Association donation. Read the raw stream because the replay parser drops state
    notifications. Count outcomes, not entries into a choice state. Only retained
    events consume a choice, so public/private draw twins cannot lose/double it.
    """
    retained = {e.order: e for m in parsed.moves for e in m.events}
    hints, seen = {}, set()
    order, source, actor, previous = 0, None, None, None
    for packet in raw_log["data"]["logs"]:
        for event in packet.get("data", []):
            order += 1
            args = event.get("args") if isinstance(event.get("args"), dict) else {}
            if event["type"] == "gameStateChange":
                # Private snapshots often announce the NEXT state before the public outcome notification.
                # The public source state remains authoritative until that outcome is emitted.
                if not str(packet.get("channel", "")).startswith("/table/"):
                    continue
                state_args = args.get("args") if isinstance(args.get("args"), dict) else {}
                sid, owner, key = str(args.get("id")), str(args.get("active_player")), card_key(state_args.get("sourceId"))
                signature = (str(packet.get("move_id")), sid, owner, key)
                if signature != previous:
                    source = "association-donation" if sid == "33" else key if (sid, key) in {("27", "S201"), ("91", "S221")} else None
                    actor = owner
                    previous = signature
                continue
            if order not in retained or source is None:
                continue
            kept = retained[order]
            pid = str(args.get("player_id", kept.player))
            if pid != actor:
                continue
            uid = event.get("uid")
            identity = (str(packet.get("table_id")), str(packet.get("move_id")), event["type"], str(uid))
            if uid is not None and str(uid) != "" and identity in seen:
                continue
            if source == "association-donation" and event["type"] == "donation":
                hints[order], source = source, None
            elif source == "S201" and event["type"] in {"pDrawCards", "drawCards", "snapCard"}:
                # The source is one mandatory take; don't attribute a following unrelated draw to it.
                hints[order], source = source, None
            elif source == "S221" and event["type"] == "takeBonus" and not args.get("source") and not args.get("remove"):
                hints[order] = source
            else:
                continue
            if uid is not None and str(uid) != "":
                seen.add(identity)
    return hints


def sponsor_state_gains(event, state, seat_of, action=None, source_hint=None) -> list:
    """State-dependent observations from the log-built pre-effect state; never mutate game state."""
    from ark_nova.engine import association
    from ark_nova.engine.icons import icon_counts
    from ark_nova.engine.board import board
    from ark_nova.engine.build_action import footprint, knows_shape
    a = event.args if isinstance(event.args, dict) else {}
    seat = seat_of.get(str(a.get("player_id")))
    if state is None or seat is None:
        return []
    p = state.players[seat]
    if event.type == "donation" and "S273" in p.sponsors:
        count = association.donation_count(state)
        base = association.DONATION_COSTS[count] if count < len(association.DONATION_COSTS) else association.DONATION_OVERFLOW_COST
        science = icon_counts(state, seat)["Science"]
        # Attribute only money actually avoided by Publications, excluding X Association's independent rebate.
        x_discount = p.x_tokens if source_hint == "association-donation" and action and action[0] == "association" and action[2] == 3 else 0
        saved = max(0, base - x_discount) - max(0, base - science - x_discount)
        return [(event.order, "S273", "saved", saved), (event.order, "S273", "donations", 1)]
    b = a.get("building") or {}
    if event.type != "buyBuilding" or b.get("type") != "excavation" or "S271" not in p.sponsors or "S280" in p.sponsors:
        return []
    if not state.config.map_known[seat]:
        return []                       # Explicit placement outcomes are the fallback for unknown maps.
    bd = board(p.map_id)
    covered = {c for old in p.buildings if knows_shape(old.type) for c in footprint(old.type, old.x, old.y, old.rotation)}
    cells = set(footprint("excavation", b["x"], b["y"], b.get("rotation", 0))) - covered
    gains = Counter()
    for cell in cells:
        for bonus in bd.bonuses.get(cell, []):
            typ, amount = bonus["type"], int(bonus["value"])
            if typ == "Worker" and p.map_id == "11":
                typ = "extra-shift"
            # Ability strength is not an activation count: Scavenging 3 twice is two bonuses, not six.
            stat, n = (f"doubled:{typ}:{amount}", 2) if typ in {"Scavenging", "Digging", "shark-attack", "adapt"} else ("doubled:" + typ, 2 * amount)
            gains[stat] += n
    return [(event.order, "S271", stat, n) for stat, n in sorted(gains.items())]
