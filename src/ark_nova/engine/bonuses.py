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
    if p.map_id == "T1" and len(worker_tokens(p, "reserve")) + len(worker_tokens(p, "association_")) in (2, 3):
        _g()._gain(state, seat, reputation=1)                          # map T1: the 1st and the 2nd hired worker give 1 reputation (logs)
    if len(supply) == 1:
        from ark_nova.engine import association
        _g()._gain(state, seat, conservation=association.map_bonus(p.map_id, "last_worker"))
    return True


TOKEN_BONUSES = ("bonus-sponsor-gray", "bonus-extra-shift", "bonus-ignore-conditions")
_TOKEN_EFFECT = {"bonus-sponsor-gray": "marketing", "bonus-extra-shift": "extra_shift"}      # the tokens that are used with a free action


def use_token(state, action) -> None:
    """Free action during the player's own action: a Marketing token or an Extra Shift token turns into the effect (the token is gone)."""
    p = state.players[action.player]
    kind = _TOKEN_EFFECT.get(action.args.get("token"))
    tok = next((t for t in p.tokens if t.type == action.args.get("token")), None)
    if kind is None or tok is None or not _token_window(state, p):
        raise _g().IllegalAction("that token cannot be used now")
    p.tokens.remove(tok)
    eff = {"kind": kind, "source": tok.type, "optional": True, "player": p.seat}
    if state.current_action is not None and state.current_action.get("seat") == p.seat and state.prompt is not None and state.prompt.kind == "effects":
        state.prompt.args["pending"].append(eff)
    elif state.current_action is not None and state.current_action.get("seat") == p.seat and state.prompt is not None and state.prompt.player == p.seat:
        _fx().open_prompt(state, p.seat, [eff], {"kind": "prompt", "prompt_kind": state.prompt.kind, "args": state.prompt.args})
    else:                                                  # the turn is over but the next player has not acted yet: BGA still lets the token be used
        pr = state.prompt
        state.current_action = {"seat": p.seat, "type": "window", "strength": 0, "after": []}
        _fx().open_prompt(state, p.seat, [eff], {"kind": "restore", "player": pr.player, "prompt_kind": pr.kind, "args": pr.args})


def _token_window(state, p) -> bool:
    """Tokens are used during the player's own action, or in the moment after their turn."""
    if state.prompt is None:
        return False
    if state.current_action is not None:
        return state.current_action.get("seat") == p.seat and state.prompt.player == p.seat
    if state.prompt.kind == "choose_action_card" and state.prompt.player == p.seat and state.active_player == p.seat:
        return True                                        # the player's turn has begun, no action card chosen yet
    return bool(p.flags.get("turn_window")) and state.prompt.kind == "choose_action_card"


def token_actions(state, p) -> list:
    """The free actions with tokens that make sense now."""
    from ark_nova.engine import animal_abilities
    if not _token_window(state, p):
        return []
    out = []
    if any(t.type == "bonus-sponsor-gray" for t in p.tokens) and animal_abilities._marketing_options(state, p.seat):
        out.append(Action(p.seat, "use_token", {"token": "bonus-sponsor-gray"}))
    if any(t.type == "bonus-extra-shift" for t in p.tokens) and any(t.type == "worker" and t.location.startswith("association_") for t in p.tokens):
        out.append(Action(p.seat, "use_token", {"token": "bonus-extra-shift"}))
    return out


def apply_bonus(state, seat: int, bonus: dict, income: bool = False) -> None:
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
            defer(state, {"kind": "build", "source": "bonus", "type": "size-2", "rules": {}, "optional": income, "double": False, "player": seat})      # (a player may pass on the income enclosure)
        elif k == "take-in-range-or-deck":               # v cards (3 for the conservation bonus)
            for _ in range(int(v)):
                defer(state, {"kind": "take", "source": "bonus", "optional": False, "player": seat})
        elif k == "bonus-icon":                          # a token that adds one icon of your choice when you support a project (spent then)
            ids = [t.id for q in state.players for t in q.tokens]
            state.players[seat].tokens.append(Token(max(ids, default=0) + 1, "bonus-icon", "notepad"))
        elif k == "special-enclosure":                   # a free large bird aviary, reptile house or (Marine Worlds) large aquarium, the player's choice
            types = ["large-bird-aviary", "reptile-house"] + (["large-aquarium"] if state.config.marine_worlds else [])
            defer(state, {"kind": "build", "source": "bonus", "types": types, "type": types[0], "rules": {"any_level": True}, "optional": False, "double": False, "player": seat})
        elif k == "Determination":                       # a second action of another action card (the Determination effect of an animal)
            from ark_nova.engine import animal_abilities
            if state.current_action is None:
                raise NotImplementedError("Determination outside an action")
            state.current_action["extra"] = {"types": [t for t in animal_abilities.ACTION_TYPES if t != state.current_action["type"]], "optional": False}
        elif k == "cut-down":                            # the Cut Down animal ability (map 13's income slot): an optional effect
            for _ in range(int(v)):
                defer(state, {"kind": "cut_down", "source": "bonus", "optional": True, "player": seat})
        elif k == "Clever":                              # the notepad's Clever income: any action card may go to slot 1, free (v times)
            for _ in range(int(v)):
                defer(state, {"kind": "slot1", "source": "bonus", "optional": True, "cost": 0, "player": seat})
        elif k == "bonus-sponsor":                       # a Marketing effect at once (optional)
            defer(state, {"kind": "marketing", "source": "bonus", "optional": True, "player": seat})
        elif k in TOKEN_BONUSES:                         # a token for later: Marketing at any time / recall a worker at any time / play an animal ignoring its conditions
            ids = [t.id for q in state.players for t in q.tokens]
            state.players[seat].tokens.append(Token(max(ids, default=0) + 1, k, "notepad"))
        elif k in ("Fac", "Partner-Zoo"):                 # conservation bonus: take a university / partner zoo tile from the association board
            defer(state, {"kind": "take_tile", "tile": "university" if k == "Fac" else "partner", "player": seat, "optional": False})
        elif k == "bonus-increased-hand":                # hand size +1 (counted by breaks.hand_limit)
            ids = [t.id for q in state.players for t in q.tokens]
            state.players[seat].tokens.append(Token(max(ids, default=0) + 1, "bonus-increased-hand", "notepad"))
            defer(state, {"kind": "take", "source": "bonus", "snap": True, "optional": False, "player": seat})      # (the bonus also gives one Snapping)
        elif k == "size-3":                              # a free size 3 enclosure
            defer(state, {"kind": "build", "source": "bonus", "type": "size-3", "rules": {}, "optional": income, "double": False, "player": seat})
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


def tracks_module():
    from ark_nova.engine import tracks
    return tracks


def _board(p):
    from ark_nova.engine.board import board
    return board(p.map_id)


def archaeologist_cells(state, p) -> list:
    """Archeologist: the hexes with a (known) placement bonus that none of the player's buildings covers."""
    from ark_nova.engine import map_rules
    bd = _board(p)
    covered = map_rules.covered_cells(p)
    return sorted(c for c, l in bd.bonuses.items() if c not in covered and l and all(b and b["type"] != "conceal" for b in l))


def upgradable(p) -> list:
    return [c.type for c in p.action_cards if c.level < 2]


KINDS = ("upgrade", "threshold2", "threshold_bonus", "endgame_discard", "adapt", "break_discard", "take_tile", "archaeologist", "income_appeal", "rep_bonus")


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
    elif k == "rep_bonus":                              # Marine Worlds: the bonus on 16 reputation, instead of the point gained at 15
        out += [Action(seat, "choose_effect", {"index": i, "rep_bonus": j}) for j in range(len(state.conservation_options.get("99", [])))]
        out.append(Action(seat, "skip_effect", {"index": i}))
    elif k == "income_appeal":                          # the break income of the appeal track
        out.append(Action(seat, "choose_effect", {"index": i, "apply": "income_appeal"}))
    elif k == "archaeologist":                          # a placement bonus anywhere on the map that no building covers yet
        out += [Action(seat, "choose_effect", {"index": i, "cell": list(c)}) for c in archaeologist_cells(state, p)]
        if not out:
            out.append(Action(seat, "skip_effect", {"index": i}))
    elif k == "take_tile":
        from ark_nova.engine import association
        out += [Action(seat, "choose_effect", {"index": i, **o}) for o in association.tile_options(state, p, e["tile"])]
        if not out:
            out.append(Action(seat, "skip_effect", {"index": i}))               # nothing left on the board to take
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
    elif k == "rep_bonus":
        opts = state.conservation_options.get("99", [])
        j = int(a["rep_bonus"])
        if not 0 <= j < len(opts):
            raise fx.IllegalEffect("the bonus of 16 reputation has been taken")
        apply_bonus(state, p.seat, opts.pop(j))
    elif k == "income_appeal":
        _g()._gain(state, p.seat, money=tracks_module().income_from_appeal(p.appeal))
    elif k == "archaeologist":
        cell = tuple(a.get("cell") or ())
        if cell not in archaeologist_cells(state, p):
            raise fx.IllegalEffect("choose a placement bonus that is not covered")
        for b in _board(p).bonuses[cell]:
            _g().apply_placement_bonus(state, p.seat, b)
    elif k == "take_tile":
        from ark_nova.engine import association
        opt = {x: v for x, v in a.items() if x in ("partner", "university", "category")}
        if {x: v for x, v in opt.items() if x != "category"} not in association.tile_options(state, p, e["tile"]):
            raise fx.IllegalEffect("that tile is not on the board")
        association.take_tile(state, p, opt)
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
