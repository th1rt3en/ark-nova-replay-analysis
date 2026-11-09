"""What the engine says the active player can do at a replay step: the decision (prompt) and a summary of `legal_actions`.

The viewer builds the bar at the top of the page from this (instead of guessing from the log-built state). Only a summary is sent: the kinds
of action with their counts, and for the choice of an action card the cards and the X tokens that can be spent on each.
"""
from ark_nova import data
from ark_nova.engine.game import apply, legal_actions
from ark_nova.engine.state import GameState, Phase

FREE = {"use_token", "harbor_sell"}            # free actions of the notepad / zoo map: possible at any time, not the decision of the prompt


# the keyword of the card ability that each kind of pending effect comes from (the button is named like the ability: "Perception 2", "Digging 3", ...)
ABILITY_PREFIX = {"digging": "Digging", "scavenge": "Scavenging", "glide": "Glide", "glide_gain": "Glide", "shark": "Shark Attack", "symbiosis": "Symbiosis",
                  "cut_down": "Cut Down", "trade": "Trade", "extra_shift": "Extra Shift", "assertion": "Assertion", "pilfer": "Pilfering", "venom": "Venom",
                  "constrict": "Constriction", "jumping": "Jumping", "hypnosis": "Hypnosis", "pouch": "Pouch", "mark": "Mark", "boost": "Boost", "marketing": "Marketing", "sell": "Sunbathing"}
REVEAL_NAME = {"animal": "Hunter", "any": "Perception", "sponsor": "Scuba Dive"}          # what a reveal-and-keep effect is called, by what it may keep


# the placement bonuses (the bonus of a space or a building that a building covers): how the bar names them
PLACEMENT_BONUS = {
    "money": "money", "xtoken": "X token", "reputation": "reputation", "appeal": "appeal", "conservation": "conservation",
    "Worker": "worker", "Multiplier": "multiplier", "Scavenging": "scavenging", "Digging": "digging", "Pouch": "pouch", "Mark": "mark",
    "kiosk": "kiosk", "Clever": "clever", "upgrade-card": "upgrade", "bonus-sponsor": "marketing token", "bonus-extra-shift": "extra shift",
    "bonus-ignore-conditions": "ignore conditions", "bonus-increased-hand": "hand size", "Snapping": "snap", "Partner-Zoo": "partner zoo",
    "Fac": "university", "animal-magnet": "animal magnet", "sponsor-person-card": "person sponsor", "Cut Down": "cut down",
}
VALUED = {"money", "xtoken", "reputation", "appeal", "conservation", "Snapping", "Scavenging", "Worker", "Multiplier"}


def placement_bonus_name(bonus: dict) -> str:
    """"Placement bonus: 5 money", "Placement bonus: kiosk" (the bonus of a space or building that the player chooses to take)."""
    t = str((bonus or {}).get("type", ""))
    label = PLACEMENT_BONUS.get(t) or (f"{t} enclosure" if t.startswith("size-") else t.replace("bonus-", "").replace("-", " ").lower()) or "bonus"
    v = (bonus or {}).get("value")
    value = f"{v} " if isinstance(v, int) and v > 0 and (t in VALUED or t == "money") else ""
    return f"Placement bonus: {value}{label}"


def _bonus_entry(e: dict) -> dict:
    """The bonus of a placement bonus / a project bonus effect as {type, value}, for the buttons of the bar (a project bonus is stored as {type: value})."""
    b = e.get("bonus")
    if e.get("kind") == "pbonus" and isinstance(b, dict):
        return {"bonus": {"type": b.get("type"), "value": b.get("value")}}
    if e.get("kind") == "project_bonus" and isinstance(b, dict) and len(b) == 1:
        (t, v), = b.items()
        return {"bonus": {"type": t, "value": v}}
    return {}


def effect_name(e: dict) -> str | None:
    """The name of the ability behind a pending effect, as the card writes it ("Perception 2"), None when it is not an ability."""
    kind, src = e.get("kind"), e.get("source")
    if kind == "build" and (e.get("rules") or {}).get("reposition"):
        return "Crane: reposition the enclosure"                                  # BDW2
    if kind == "pbonus":
        return placement_bonus_name(e.get("bonus"))
    if kind == "project_bonus" and isinstance(e.get("bonus"), dict) and len(e["bonus"]) == 1:
        (t, v), = e["bonus"].items()
        return placement_bonus_name({"type": t, "value": v}).replace("Placement bonus", "Project bonus", 1)
    if kind == "reveal":
        prefix = REVEAL_NAME.get(e.get("filter", "any"))
        return f"{prefix} {e['x']}" if prefix and e.get("x") is not None else None
    prefix = ABILITY_PREFIX.get(kind)
    if prefix is None:
        return None
    card = data.cards_by_key().get(src) if isinstance(src, str) else None
    for ab in (card or {}).get("abilities") or []:
        name = ab["keyword"]["name"]
        if name.startswith(prefix) or name.startswith(prefix.replace(" ", "")):
            value = ab.get("value")
            return name if not value or str(value) in name else f"{name} {value}"
    n = e.get("n") or e.get("x")
    return f"{prefix} {n}" if isinstance(n, int) and n > 1 else prefix


def _unusable_cards(state: GameState, acts: list) -> list:
    """The action cards that offer nothing to do when chosen (Association with no worker left, or nothing the workers could do): the bar greys them out."""
    out = []
    mine = [a for a in acts if a.kind == "choose_action_card" and a.args["type"] == "association" and not a.args.get("hypnosis")]
    if not mine:
        return out
    for a in mine:                                                       # (any spend of X tokens: more strength may allow a task)
        try:
            new = apply(state, a)
            kinds = {x.kind for x in legal_actions(new)}
        except Exception:                                                # (not known to the engine: leave it usable)
            return out
        ends = new.prompt is None or new.prompt.kind != "association_tasks"
        if not ends and kinds & {"association_task", "donate"}:
            return out
        if ends and new.prompt is not None and new.prompt.kind != "choose_action_card":
            return out                                                   # (effects or another prompt follow: something to do)
    return ["association"]


def _expedition_buttons(state: GameState, pending: list, entry: dict) -> list:
    """Marine Research Expedition is two buttons: the expedition (send a person sponsor away, greyed out without one) and Scuba Dive 3."""
    e = pending[entry["index"]] if isinstance(entry.get("index"), int) and entry["index"] < len(pending) else {}
    if entry.get("kind") != "expedition" or e.get("kind") != "expedition":
        return [entry]
    owner = e.get("player", 0)
    persons = [s for s in state.players[owner].sponsors if data.cards_by_key().get(s, {}).get("type") == "HUMAN"]
    return [{**entry, "name": "Expedition", "option": "send", "enabled": bool(persons)},
            {**entry, "name": "Scuba Dive 3", "option": "scuba", "enabled": True}]


def _revealed_cards(state: GameState, e: dict) -> dict:
    """The cards of a reveal-and-keep effect, for the lightbox of the page: the topmost cards of the deck (Perception / Hunter / Scuba Dive) or the cards drawn from the discard pile (Scavenging)."""
    if e.get("kind") == "reveal" and isinstance(e.get("x"), int):
        return {"cards": list(state.main_deck[:e["x"]])}
    if e.get("kind") == "scavenge" and e.get("cards"):
        return {"cards": list(e["cards"])}
    if e.get("kind") == "adapt":                                         # Adapt: what each endgame card of the pool (hand + the cards to draw) would score now, for the lightbox's strips
        from ark_nova.engine import endgame
        seat, pool = e.get("player"), list(state.players[e["player"]].endgame_hand) + list(state.endgame_deck[:e.get("draw", e["n"])])
        pts = {}
        for k in pool:
            try:
                pts[k] = {"conservation": endgame.card_points(state, seat, k), "appeal": 0}
            except Exception:
                pass
        return {"pts": pts}
    return {}


def step_options(state: GameState, seat: int | None = None) -> dict | None:
    """What the bar is drawn from. `seat`: a live game gives each player their own (both discard at once in a break: each one sees their own discard); None = the player of the prompt."""
    pr = state.prompt
    if pr is None or state.phase in (Phase.SETUP, Phase.SCORING, Phase.OVER):
        return None
    try:
        acts = [a for a in legal_actions(state) if a.kind not in FREE and (seat is None or a.player == seat)]
    except NotImplementedError:
        return None
    kinds: dict[str, int] = {}
    for a in acts:
        kinds[a.kind] = kinds.get(a.kind, 0) + 1
    who = pr.player if seat is None else seat
    out: dict = {"prompt": pr.kind, "seat": who, "kinds": kinds}
    pieces = []
    for a in acts:                                                      # the building pieces that can be placed (the additional kiosk / pavilion of a Build variant first)
        if a.kind != "place_building":
            continue
        piece = {"type": a.args["type"], **({"extra": True} if a.args.get("extra") else {})}
        if piece not in pieces:
            pieces.append(piece)
    if pieces:
        out["pieces"] = sorted(pieces, key=lambda q: not q.get("extra"))
        if pr.kind == "build_place":
            out["build"] = {"variant": pr.args.get("variant", 0), "level": pr.args.get("level", 1)}
    if pr.kind == "sponsors_play":                                      # the Sponsors action: the sponsors that can be played (the other cards of the hand are greyed out)
        sa = pr.args
        out["sponsors"] = {"hand": [a.args["card"] for a in acts if a.kind == "play_sponsor" and not a.args.get("from_display")],
                           "display": [a.args["card"] for a in acts if a.kind == "play_sponsor" and a.args.get("from_display")],
                           "strength": sa.get("strength"), "gain": sa.get("strength", 0) * (2 if sa.get("level", 1) >= 2 else 1),
                           "level": sa.get("level", 1), "variant": sa.get("variant", 0), "side_used": bool(sa.get("side_used")), "played": bool(sa.get("played")), "can_break": any(a.kind == "sponsor_break" for a in acts)}
    if pr.kind == "association_tasks":                                  # the tasks of the Association action that can be done (one entry per kind of task)
        tasks: dict[str, int] = {}
        for a in acts:
            if a.kind == "association_task":
                tasks[a.args["task"]] = tasks.get(a.args["task"], 0) + 1
        out["association"] = {"tasks": tasks, "strength": pr.args.get("strength"), "left": pr.args.get("left")}
    if pr.kind == "cards_discard":                                      # discarding: the bar only says how many (the player picks the cards in the hand)
        out["discard"] = {"count": pr.args.get("count", 1), "what": "card"}
    elif pr.kind == "effects":
        mine = [e for e in pr.args.get("pending", []) if e.get("player", pr.player) == who]
        d = next((e for e in mine if e.get("kind") in ("break_discard", "endgame_discard")), None)
        if d is not None:
            out["discard"] = {"count": d.get("n", 1), "what": "card" if d["kind"] == "break_discard" else "endgame card"}
    takes = [a for a in acts if a.kind == "take_cards"]
    if pr.kind == "effects" and (pr.args.get("resume") or {}).get("kind") == "break":
        out["in_break"] = True                                          # (the effects are those of a break: the replay may still be inside the action that ended in it)
    if takes:                                                           # taking cards: the deck and/or the display cards the player may take (the others are greyed out)
        take: dict = {"deck": max([a.args.get("count", 1) for a in takes if a.args["mode"] == "deck"], default=0),
                      "range": [a.args["card"] for a in takes if a.args["mode"] == "range"],
                      "snap": [a.args["card"] for a in takes if a.args["mode"] == "snap"]}
        if pr.kind == "cards_take":
            take.update(remaining=pr.args.get("remaining"), snapping=bool(pr.args.get("snap")), taken=pr.args.get("taken", 0), discard=pr.args.get("discard", 0),
                        snaps_left=pr.args.get("snaps_left", 1), all_at_once=pr.args.get("level") == 1)
        elif pr.kind == "effects":
            e = next((e for e in pr.args.get("pending", []) if e.get("kind") == "take" and e.get("player", pr.player) == who
                      and bool(e.get("snap")) == bool(take["snap"])), None)
            if e is not None:
                take.update(source=e.get("source"), is_snap=bool(e.get("snap")), small=bool(e.get("small")), range_only=bool(e.get("range_only")))
        out["take"] = take
    if pr.kind == "choose_action_card":
        cards: dict[str, list[int]] = {}
        for a in acts:
            if a.kind == "choose_action_card":
                cards.setdefault(a.args["type"], []).append(a.args.get("spend", 0))
        out["cards"] = {t: sorted(set(v)) for t, v in cards.items()}
        unusable = _unusable_cards(state, acts)
        if unusable:
            out["unusable"] = unusable                                  # (greyed out in the bar: the card can be chosen but nothing could be done with it)
        out["skip"] = sorted({a.args["type"] for a in acts if a.kind == "skip_action" and not a.args.get("hypnosis")})
        out["skip_hypnosis"] = sorted({a.args["type"] for a in acts if a.kind == "skip_action" and a.args.get("hypnosis")})      # (the opponent's card: not the same as the own put-back)
        if pr.args.get("only"):
            out["only"] = list(pr.args["only"])
        if pr.args.get("hypnosis"):
            out["hypnosis"] = True
    elif pr.kind == "effects":
        pending = pr.args.get("pending", [])
        out["pending"] = [e.get("kind") for e in pending][:12]
        out["effects"] = [{**{k: e[k] for k in ("kind", "res", "n", "source", "optional", "type", "category", "tile", "filter") if k in e and isinstance(e[k], (str, int, bool))},
                           **_revealed_cards(state, e),
                           **({"name": effect_name(e)} if effect_name(e) else {}),
                           **_bonus_entry(e),
                           **({"enabled": False} if e.get("cond") == "no_animals" and any(c.startswith("A") for c in state.players[who].hand) else {}),      # (Hunter Animals: not while the hand holds an animal)
                           "index": i}
                          for i, e in enumerate(pending) if e.get("player", pr.player) == who][:12]               # what the player can resolve, in any order (`index`: the one of choose_effect)
        out["effects"] = [b for entry in out["effects"] for b in _expedition_buttons(state, pending, entry)]
    return out
