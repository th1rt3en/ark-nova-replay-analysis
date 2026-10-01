"""Conservation thresholds, reputation track, bonuses and workers: effects with decisions that arise while another effect resolves.

They are pending effects of the prompt `effects` (see `effects.py`); when no prompt is open they wait in `state.current_action["threshold"]`
until the step ends. Kinds: `upgrade` (flip an action card), `threshold2` (conservation 2: upgrade OR hire a worker), `threshold_bonus`
(conservation 5 / 8: one of the bonuses left, or 5 money), `endgame_discard` (conservation 10: every player discards an endgame card).
"""
from itertools import combinations

from ark_nova.engine.actions import Action
from ark_nova.engine.state import Token


def _g():
    from ark_nova.engine import game
    return game


def _fx():
    from ark_nova.engine import effects
    return effects


def reputation_cap(p) -> int:
    """Reputation stops at 9 until the Cards action is upgraded (rulebook p.13)."""
    return 15 if any(c.type == "cards" and c.level >= 2 for c in p.action_cards) else 9


def defer(state, effect: dict) -> None:
    """A pending effect that arises while another one resolves: it joins the open prompt or waits for the end of the step."""
    if effect["kind"] in ("upgrade", "threshold2") and not upgradable(state.players[effect["player"]])             and not (effect["kind"] == "threshold2" and worker_tokens(state.players[effect["player"]], "supply_")):
        return                                                          # nothing left to upgrade (or hire)
    if state.prompt is not None and state.prompt.kind == "effects":
        state.prompt.args["pending"].append(effect)
    elif state.current_action is not None:
        state.current_action.setdefault("threshold", []).append(effect)
    else:
        raise NotImplementedError("an effect with a decision outside a player's action (break, end of game) is not implemented yet")


def drain(state) -> list:
    if state.current_action is None:
        return []
    return state.current_action.pop("threshold", [])


def threshold_reached(state, seat: int, t: int) -> None:
    if t == 2:
        defer(state, {"kind": "threshold2", "player": seat, "optional": False})
    elif t in (5, 8):
        if str(t) not in state.conservation_options:
            raise NotImplementedError(f"the bonuses of conservation space {t} are not known (input needed)")
        defer(state, {"kind": "threshold_bonus", "t": t, "player": seat, "optional": False})
    elif t == 10 and not state.endgame_discard_done:
        state.endgame_discard_done = True
        for s in range(len(state.players)):
            defer(state, {"kind": "endgame_discard", "player": s, "optional": False})


def worker_tokens(p, where: str) -> list:
    return sorted((t for t in p.tokens if t.type == "worker" and t.location.startswith(where)), key=lambda t: t.location)


def hire_worker(state, seat: int) -> bool:
    """Take a lying worker (lowest space first) to the notepad as an active worker; the last one pays a conservation bonus on some maps."""
    p = state.players[seat]
    supply = worker_tokens(p, "supply_")
    if not supply:
        return False
    supply[0].location = "reserve"
    if p.map_id == "11" and len(worker_tokens(p, "reserve")) + len(worker_tokens(p, "association_")) == 3:
        defer(state, {"kind": "upgrade", "player": seat, "optional": False, "source": "third worker (map 11, Caves)"})
    if len(supply) == 1:
        from ark_nova.engine import association
        _g()._gain(state, seat, conservation=association.map_bonus(p.map_id, "last_worker"))
    return True


def apply_bonus(state, seat: int, bonus: dict) -> None:
    """A bonus of the map, the conservation track or a card (`{name: value}` as in the BGA logs and the map data)."""
    g = _g()
    for k, v in bonus.items():
        if k == "money":
            g._gain(state, seat, money=v)
        elif k == "appeal":
            g._gain(state, seat, appeal=v)
        elif k == "reputation":
            g._gain(state, seat, reputation=v)
        elif k == "conservation":
            g._gain(state, seat, conservation=v)
        elif k == "xtoken":
            g._gain(state, seat, x_tokens=v)
        elif k == "upgrade-card":
            defer(state, {"kind": "upgrade", "player": seat, "optional": False})
        elif k in ("add-worker", "Worker"):
            hire_worker(state, seat)
        elif k == "size-2":
            defer(state, {"kind": "build", "source": "bonus", "type": "size-2", "rules": {}, "optional": False, "double": False, "player": seat})
        elif k == "take-in-range-or-deck":
            defer(state, {"kind": "take", "source": "bonus", "optional": False, "player": seat})
        elif k == "bonus-icon":                          # a token that adds one icon of your choice when you support a project (spent then)
            ids = [t.id for q in state.players for t in q.tokens]
            state.players[seat].tokens.append(Token(max(ids, default=0) + 1, "bonus-icon", "notepad"))
        elif k == "bonus-kiosk-pavilion":                # Posturing 3: up to 3 free kiosks / pavilions, each one can be skipped
            for _ in range(3):
                defer(state, {"kind": "build", "source": "bonus", "types": ["kiosk", "pavilion"], "type": "kiosk", "rules": {},
                              "optional": True, "double": False, "player": seat})
        elif k == "bonus-scoring-cards":                 # Adapt 3: draw 3 final scoring cards, then discard 3
            defer(state, {"kind": "adapt", "player": seat, "optional": False, "n": 3})
        elif k == "Snapping":
            defer(state, {"kind": "take", "source": "bonus", "snap": True, "optional": False, "player": seat})
        else:
            raise NotImplementedError(f"bonus {k!r} is not implemented yet")   # e.g. bonus-kiosk-pavilion, bonus-scoring-cards


def upgradable(p) -> list:
    return [c.type for c in p.action_cards if c.level < 2]


KINDS = ("upgrade", "threshold2", "threshold_bonus", "endgame_discard", "adapt", "break_discard")


def open_break_prompt(state, seat: int, pending: list, resume: dict) -> None:
    _fx().open_prompt(state, seat, pending, resume)


def legal(state, e: dict, i: int, seat: int) -> list:
    p = state.players[seat]
    k = e["kind"]
    out = []
    if k == "break_discard":
        from ark_nova.engine import breaks
        return breaks.legal_discard(state, e, i, seat)
    if k in ("upgrade", "threshold2"):
        out += [Action(seat, "choose_effect", {"index": i, "upgrade": t}) for t in upgradable(p)]
        if k == "threshold2" and worker_tokens(p, "supply_"):
            out.append(Action(seat, "choose_effect", {"index": i, "hire": True}))
        if not out or e.get("optional"):
            out.append(Action(seat, "skip_effect", {"index": i}))               # nothing left to upgrade / a bonus the log sometimes omits
    elif k == "threshold_bonus":                       # the random bonus tokens still there, or 5 money (always available)
        out += [Action(seat, "choose_effect", {"index": i, "option": j}) for j in range(len(state.conservation_options[str(e["t"])]) + 1)]
    elif k == "adapt":                                  # the top cards of the endgame deck are drawn, then `n` of the hand are discarded
        pool = sorted(p.endgame_hand + state.endgame_deck[:e.get("draw", e["n"])])
        out += [Action(seat, "choose_effect", {"index": i, "discard": list(c)}) for c in sorted(set(combinations(pool, e["n"])))]
    elif k == "endgame_discard":
        out += [Action(seat, "choose_effect", {"index": i, "card": c}) for c in sorted(set(p.endgame_hand))]
        if not p.endgame_hand:
            out.append(Action(seat, "skip_effect", {"index": i}))
    return out


def resolve(state, action: Action, e: dict, i: int) -> None:
    fx = _fx()
    if e["kind"] == "break_discard":
        from ark_nova.engine import breaks
        breaks.resolve_discard(state, action, e, i)
        return
    p = state.players[action.player]
    k = e["kind"]
    a = action.args
    if k in ("upgrade", "threshold2"):
        if "hire" in a and k == "threshold2":
            if not hire_worker(state, p.seat):
                raise fx.IllegalEffect("no worker left to hire")
        else:
            c = next((c for c in p.action_cards if c.type == a.get("upgrade") and c.level < 2), None)
            if c is None:
                raise fx.IllegalEffect("no such action card to upgrade")
            c.level = 2
    elif k == "threshold_bonus":
        opts = state.conservation_options[str(e["t"])]
        j = int(a["option"])
        if not 0 <= j <= len(opts):
            raise fx.IllegalEffect("no such bonus")
        apply_bonus(state, p.seat, {"money": 5} if j == len(opts) else opts.pop(j))
    elif k == "adapt":
        if len(state.endgame_deck) < e.get("draw", e["n"]):
            raise NotImplementedError("the endgame deck would run out")
        p.endgame_hand += [state.endgame_deck.pop(0) for _ in range(e.get("draw", e["n"]))]
        gone = list(a["discard"])
        if len(gone) != e["n"] or any(gone.count(c) > p.endgame_hand.count(c) for c in gone):
            raise fx.IllegalEffect("discard the right number of endgame cards from the hand")
        for c in gone:
            p.endgame_hand.remove(c)
            state.endgame_discard.append(c)
    elif k == "endgame_discard":
        c = a["card"]
        if c not in p.endgame_hand:
            raise fx.IllegalEffect("that endgame card is not in hand")
        p.endgame_hand.remove(c)
        state.endgame_discard.append(c)
    fx._done(state, i)
