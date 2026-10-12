"""What the action card variants did (Marine Worlds; the replay only): statistics per player and action, read off the engine actions of the differential replay.

`observe_variants(before, act, after)` is called for every engine action (with the engine state before and after it) and returns [(key, statistic, amount)] where key is
"<seat>:<action type>", e.g. "1:animals". The viewer shows them when the action card is hovered (web/js/side-panel.js, `ACTION_STATS` in web/js/cards.js).
The statistics of one card side are named apart from those of the other, so a card that has both sides over a game shows both.

Counted from the engine, because the log has no line for it: Ignore Animals (a condition of the single animal was really missing), the hunts of Hunter Animals, the mark and
the reputation of Mark Animals, the workers of Hire Association, the donation discount of X Association, the card instead of a donation, the extra strength of +1 Build and the
terrain of Terrain Build. Counted from the log elsewhere (view.py): the money that Money Sponsors (variant 2) gave.
"""
import copy


def _action_args(state) -> dict:
    """The arguments of the action that is open (an effects prompt keeps them in `resume`)."""
    pr = state.prompt
    if pr is None:
        return {}
    if pr.kind == "effects":
        return (pr.args.get("resume") or {}).get("args") or {}
    return pr.args


def _effect(state, act):
    """The pending effect that a choose_effect / skip_effect action points at."""
    pr = state.prompt
    if pr is None or pr.kind != "effects":
        return None
    pending, i = pr.args.get("pending") or [], act.args.get("index")
    return pending[i] if isinstance(i, int) and 0 <= i < len(pending) else None


def _after_effects(before, act) -> list:
    """The effects that the variants leave for the end of the action (the mark of Mark Animals, the hunt of Hunter Animals, the Clever of Clever Cards): they are resolved when the action is
    over, so the statistics come from the effect, not from the action that is open."""
    if act.kind != "choose_effect":
        return []
    eff = _effect(before, act)
    if not eff:
        return []
    seat, src, kind = eff.get("player", act.player), eff.get("source"), eff.get("kind")
    out = []
    if src == "animals4" and kind == "mark":
        out.append((f"{seat}:animals", "marks", 1))
    elif src == "animals2" and kind == "reveal":
        out += [(f"{seat}:animals", "hunts", 1), (f"{seat}:animals", "seen", int(eff.get("x") or 0))]
    elif src == "cards4" and kind == "slot1":
        out.append((f"{seat}:cards", "clever_paid" if eff.get("cost") else "clever_free", 1))
    elif src == "cards2" and kind == "digging":
        out.append((f"{seat}:cards", "dig_hand" if "hand" in act.args else "dig_display" if "display" in act.args else "dig", 1))
    return out


def observe_variants(before, act, after) -> list:
    out_effects = _after_effects(before, act)
    ca = before.current_action
    if not ca or not ca.get("variant") or ca.get("type") in (None, "break"):
        return out_effects
    typ, v, lvl, seat = ca["type"], ca["variant"], ca.get("level", 1), ca.get("seat", act.player)
    key = f"{seat}:{typ}"
    out: list = []

    def add(stat: str, n: int = 1) -> None:
        if n:
            out.append((key, stat, n))

    a = _action_args(before)
    eff = _effect(before, act) if act.kind == "choose_effect" else None
    p = before.players[seat]
    if typ == "animals":
        from ark_nova.engine import animals_action as aa, marks
        if v == 1 and act.kind == "play_animal" and before.prompt.kind == "animals_play":
            k = act.args["card"]
            credits = aa.credits(before, seat, k)
            if credits and credits[0] == "ignore" and aa.failed_conditions(before, seat, k, aa.live_level(p, a)):
                add("ignored")                                     # the single animal had a condition that the zoo does not meet
        elif v == 2:
            pass                                                   # (the hunt: `_after_effects`)
        elif v == 3:
            if lvl == 1 and act.kind == "play_animal" and before.prompt.kind == "animals_play" and not a.get("played"):
                k = act.args["card"]
                folder = before.display.index(k) + 1 if act.args.get("from_display") and k in before.display else 0
                plain = copy.deepcopy(before)
                plain.prompt.args["played"] = ["-"]                 # (the discount is for the first animal only)
                add("saved", aa.cost(plain, seat, k, folder) - aa.cost(before, seat, k, folder))
            elif lvl >= 2 and eff and eff.get("kind") == "pay_appeal" and act.args.get("apply") == "pay_appeal":
                add("appeal")
        elif v == 4:
            if lvl >= 2 and act.kind == "play_animal" and act.args.get("from_display") and marks.owner(before, act.args["card"]) == seat:
                add("reputation")
    elif typ == "association":
        from ark_nova.engine import association
        if v == 2 and act.kind == "association_task":
            if act.args.get("task") == "hire" and lvl == 1:
                add("hired")
            if lvl >= 2:
                add("reduced", int(act.args.get("extra") or 0))
        elif v == 3:
            if act.kind == "association_task" and lvl == 1:
                task = "conservation" if act.args.get("task") == "hire" else act.args.get("task")
                if task in association.TASK_VALUE and a.get("strength", 0) > association.strength_needed(p, task):
                    add("xtoken")
            elif act.kind == "donate" and lvl >= 2:
                add("saved", association.donation_cost(before, p, False) - association.donation_cost(before, p, True))
        elif v == 4:
            if act.kind == "self_clever":
                add("determination")
            elif act.kind == "take_instead":
                add("draws")
    elif typ == "build":
        from ark_nova.engine import build_action
        if act.kind == "place_building":
            t = act.args.get("type")
            if v in (1, 2) and act.args.get("extra"):
                add("extra3" if lvl == 1 else "extra2")             # the additional pavilion / kiosk: 3 money at level I, 2 at level II
            elif v == 3:
                placed = sum(build_action.SIZES.get(x, 0) for x in a.get("placed") or [])
                size = build_action.SIZES.get(t, 0)
                if placed <= ca.get("strength", 0) < placed + size:
                    add("extra_strength")                           # this building is the one that goes over the strength of the card
            elif v == 4 and _action_args(after).get("terrain_used") and not a.get("terrain_used"):
                add("terrain_paid" if lvl == 1 else "terrain_gained")
    elif typ == "cards":
        if v == 3 and act.kind == "take_cards" and act.args.get("mode") == "snap":
            add("snaps")
    elif typ == "sponsors":
        if act.kind == "sponsor_side":
            stat = {"trade_money": "x_money", "trade_x": "money_x", "rep_money": "money_rep", "rep_x": "x_rep", "discard_money": "money", "discard_strength": "strength",
                    "discard_snap": "snap", "discard_play": "play"}.get(act.args.get("op"))
            if stat:
                add(stat)
    return out + out_effects
