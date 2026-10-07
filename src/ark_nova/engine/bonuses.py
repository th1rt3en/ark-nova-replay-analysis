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


# the 16 bonuses that the 5 and 8 conservation spaces (two each) and the 16 reputation space (one, Marine Worlds) draw from at the start of a game, as seen in the logs;
# the option of 5 money is always there besides
CONSERVATION_POOL = [{"Partner-Zoo": 1}, {"Fac": 1}, {"Multiplier": 1}, {"xtoken": 3}, {"take-in-range-or-deck": 3}, {"size-3": 1}, {"bonus-ignore-conditions": 3},
                     {"bonus-increased-hand": 1}, {"bonus-icon": 1}, {"bonus-scoring-cards": 3}, {"bonus-sponsor-gray": 1}, {"bonus-sponsor": 1}, {"reputation": 2},
                     {"bonus-extra-shift": 1}, {"bonus-kiosk-pavilion": 3}, {"money": 10}]


def draw_conservation_bonuses(rng, marine_worlds: bool) -> dict:
    """The bonuses of a new game (each bonus once on the board): two for the 5 space, two for the 8 space and, in Marine Worlds, one for the 16 reputation space."""
    pool = [dict(b) for b in CONSERVATION_POOL]
    rng.shuffle(pool)
    out = {"5": pool[:2], "8": pool[2:4]}
    if marine_worlds:
        out["99"] = pool[4:5]
    return out


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


def hire_worker(state, seat: int, where: str = "reserve") -> bool:
    """Take a lying worker (lowest space first) to the notepad as an active worker (`where`: the Hire Association task puts it next to the one doing the task);
    the 1st / 2nd / last one pays a bonus on some maps."""
    p = state.players[seat]
    supply = worker_tokens(p, "supply_")
    if not supply:
        return False
    supply[0].location = where
    if p.map_id == "11" and len(worker_tokens(p, "reserve")) + len(worker_tokens(p, "association_")) == 3:
        defer(state, {"kind": "upgrade", "player": seat, "optional": False, "source": "third worker (map 11, Caves)"})
    if p.map_id == "T1" and len(worker_tokens(p, "reserve")) + len(worker_tokens(p, "association_")) in (2, 3):
        _g()._gain(state, seat, reputation=1)                          # map T1: the 1st and the 2nd hired worker give 1 reputation (logs)
    if p.map_id == "14" and len(worker_tokens(p, "reserve")) + len(worker_tokens(p, "association_")) in (2, 3, 4):
        from ark_nova.engine.cards import search_deck               # map 14: every hired worker brings the first person sponsor of the deck (1st, 2nd and last worker bonus)
        found = search_deck(state.main_deck, ("person", None))
        if found:
            p.hand.append(found)
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
    if state.current_action is not None and state.current_action.get("type") == "break" and state.prompt is not None and state.prompt.kind == "effects":
        state.prompt.args["pending"].append(eff)               # in the break either player may use a token
    elif state.current_action is not None and state.current_action.get("seat") == p.seat and state.prompt is not None and state.prompt.kind == "effects":
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
    if state.prompt.kind == "final_window":
        return state.prompt.player == p.seat                  # (the last turn is over, the game is not scored yet)
    if state.current_action is not None:
        if state.current_action.get("type") == "break":
            return state.prompt.kind == "effects"
        return state.current_action.get("seat") == p.seat and state.prompt.player == p.seat
    if state.prompt.kind == "choose_action_card" and state.prompt.player == p.seat and state.active_player == p.seat:
        return True                                        # the player's turn has begun, no action card chosen yet
    if state.prompt.kind == "effects" and state.prompt.player == p.seat and state.active_player == p.seat and (state.prompt.args.get("resume") or {}).get("kind") == "end":
        return True                                        # the effects after the action (Clever, Boost, marks): the token may be used before them
    return bool(p.flags.get("turn_window")) and state.prompt.kind == "choose_action_card"


def token_uses(state, p) -> bool:
    """The player owns a notepad token that could be used now, whatever the prompt is."""
    from ark_nova.engine import animal_abilities
    if any(t.type == "bonus-sponsor-gray" for t in p.tokens) and animal_abilities._marketing_options(state, p.seat):
        return True
    return any(t.type == "bonus-extra-shift" for t in p.tokens) and any(t.type == "worker" and t.location.startswith("association_") for t in p.tokens)


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
    p = state.players[seat]
    for k, v in bonus.items():
        if k == "money":
            g._gain(state, seat, money=v)
        elif k == "appeal":
            g._gain(state, seat, appeal=v)
        elif k == "reputation":                          # an effect of its own: an upgrade of the Cards action that is still pending lifts the cap of 9 first (814950957 turn 45)
            defer(state, {"kind": "gain", "source": "bonus", "res": "reputation", "n": v, "optional": False, "player": seat})
        elif k == "conservation":
            g._gain(state, seat, conservation=v)
        elif k == "xtoken":
            g._gain(state, seat, x_tokens=v)
        elif k == "upgrade-card":
            defer(state, {"kind": "upgrade", "player": seat, "optional": False})
        elif k == "kiosk-pavilion":                      # a free kiosk or pavilion (map 9 continent bonus)
            defer(state, {"kind": "build", "source": "bonus", "types": ["kiosk", "pavilion"], "type": "kiosk", "rules": {}, "optional": True, "double": False, "player": seat})
        elif k == "Multiplier":                          # a token on an action card of the player's choice (map 4 hex, the bonus on 16 reputation)
            defer(state, {"kind": "multiplier", "optional": False, "player": seat})
        elif k == "sponsor-person-card":                 # map 14: a person sponsor of the hand is played for free (optional)
            defer(state, {"kind": "marketing", "source": "bonus", "optional": True, "player": seat, "free": True, "person": True})
        elif k == "store":                               # map 11 (Caves): a card of the hand may go into the storage
            defer(state, {"kind": "store", "source": "map11", "optional": True, "player": seat})
        elif k == "add-worker":
            hire_worker(state, seat)
        elif k == "Worker":                              # a new worker; with all four hired, a worker comes back from the association board (like Extra Shift)
            if not hire_worker(state, seat):
                defer(state, {"kind": "extra_shift", "source": "bonus", "optional": False, "player": seat})
        elif k == "size-2":
            defer(state, {"kind": "build", "source": "bonus", "type": "size-2", "rules": {}, "optional": True, "double": False, "player": seat})      # (optional wherever it comes from: income, a project bonus, the reward track)
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
        elif k == "animal-magnet":                       # map 12 (income-less space): every animal of the display goes to the hand, the display is refilled at the end of the turn
            from ark_nova.engine import marks
            p = state.players[seat]
            for j, c in enumerate(state.display):
                if c and c.startswith("A"):
                    state.display[j] = None
                    marks.taken(state, c)
                    p.hand.append(c)
        elif k == "continent":                           # map 9 space: one of the remaining continent cubes is unlocked (with its bonus), nothing when all are
            from ark_nova.engine import map_rules
            if map_rules.continents_left(state.players[seat]):
                defer(state, {"kind": "continent", "optional": True, "player": seat})
        elif k == "Pouch":                               # maps 7 / 7a (income slot): up to v cards of the hand go under the map for appeal
            for _ in range(int(v)):
                defer(state, {"kind": "pouch", "source": "map", "optional": True, "player": seat})
        elif k == "cut-down":                            # the Cut Down animal ability (map 13's income slot): an optional effect
            for _ in range(int(v)):
                defer(state, {"kind": "cut_down", "source": "bonus", "optional": True, "player": seat})
        elif k == "Clever":                              # the notepad's Clever income: any action card may go to slot 1, free (v times)
            for _ in range(int(v)):
                if state.current_action is not None and state.current_action.get("type") not in ("break", None):      # (the card goes to slot 1 after the action itself)
                    state.current_action.setdefault("after", []).append({"kind": "slot1", "source": "bonus", "optional": True, "cost": 0})
                else:
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
            defer(state, {"kind": "build", "source": "bonus", "type": "size-3", "rules": {}, "optional": True, "double": False, "player": seat})
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


_MOVE_SPEC = {"reptile-house": "Reptile House", "large-bird-aviary": "Large Bird Aviary", "small-aquarium": "Aquarium", "large-aquarium": "Aquarium"}


def move_options(state, p, e) -> list:
    """[(animal, [x, y] of the enclosure it leaves)]: the animals that may move into the newly built special enclosure, from a standard
    enclosure (emptied by the release priority) or from another special enclosure (its spaces are free again)."""
    from ark_nova.engine import animals_action as aa, project_effects as pe
    nb = next((b for b in p.buildings if [b.x, b.y] == e["building"]), None)
    if nb is None:
        return []
    free = aa.CAPACITY[nb.type] - sum(aa._special_size(a_) for a_ in nb.animals)
    out = []
    for key in p.animals:
        specs = [s for s in aa.card(key).get("specialEnclosures") or [] if s["type"] == _MOVE_SPEC[nb.type]]
        if key in nb.animals or not specs or free < specs[0]["size"]:
            continue
        special = [b for b in p.buildings if key in b.animals]
        for b in special or pe.release_enclosures(state, p.seat, key, exclude=nb):
            out.append((key, [b.x, b.y]))
    return out


def upgradable(p) -> list:
    return [c.type for c in p.action_cards if c.level < 2]


KINDS = ("upgrade", "threshold2", "threshold_bonus", "endgame_discard", "adapt", "break_discard", "take_tile", "archaeologist", "income_appeal", "income_kiosk", "rep_bonus", "store", "move_in", "continent", "multiplier", "wave", "income_map", "income_sponsor", "search_category", "pbonus", "search_sponsor")


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
    elif k == "continent":                              # map 9: remove a continent marker for one of the 5 bonuses
        from ark_nova.engine import map_rules
        left = map_rules.continents_left(p)
        names = [e["continent"]] if e.get("continent") else left
        out += [Action(seat, "choose_effect", {"index": i, "continent": c, "pick": j}) for c in names if c in left for j in range(len(map_rules.CONTINENT_BONUSES))]
        out.append(Action(seat, "skip_effect", {"index": i}))
    elif k == "wave":                                   # a Wave effect (map 14 placement bonus): no choice, resolved in the order the player likes
        out.append(Action(seat, "choose_effect", {"index": i, "apply": "wave"}))
    elif k == "multiplier":                             # a Multiplier token on an action card of the player's choice
        out += [Action(seat, "choose_effect", {"index": i, "multiplier": c.type}) for c in p.action_cards]
    elif k == "move_in":                                # a new reptile house / bird aviary / first aquarium: animals of the zoo may move in
        out += [Action(seat, "choose_effect", {"index": i, "move": key, "from": src}) for key, src in move_options(state, p, e)]
        out.append(Action(seat, "skip_effect", {"index": i}))
    elif k == "store":                                  # map 11 (Caves): a card of the hand goes into the hidden storage (2 money income each, no hand size)
        out += [Action(seat, "choose_effect", {"index": i, "store": c}) for c in dict.fromkeys(p.hand)]
        out.append(Action(seat, "skip_effect", {"index": i}))
    elif k == "rep_bonus":                              # Marine Worlds: the bonus on 16 reputation, instead of the point gained at 15
        out += [Action(seat, "choose_effect", {"index": i, "rep_bonus": j}) for j in range(len(state.conservation_options.get("99", [])))]
        out.append(Action(seat, "skip_effect", {"index": i}))
    elif k == "search_sponsor":                         # maps 8 / 8a: the first sponsor of the deck joins the hand
        out.append(Action(seat, "choose_effect", {"index": i, "apply": "search_sponsor"}))
    elif k == "pbonus":                                 # one of several placement bonuses of the same building: the player chooses the order
        out.append(Action(seat, "choose_effect", {"index": i, "apply": "pbonus", "bonus": e["bonus"]["type"]}))
    elif k == "search_category":                        # the search of a category university: the first card of the category leaves the deck (after the trigger effects of the new icons: 796946880 turn 23)
        out.append(Action(seat, "choose_effect", {"index": i, "apply": "search_category"}))
    elif k == "income_map":                             # the income of the zoo map (restaurant spaces, stored cards, kiosks of the ice cream parlors)
        out.append(Action(seat, "choose_effect", {"index": i, "apply": "income_map"}))
    elif k == "income_appeal":                          # the break income of the appeal track
        out.append(Action(seat, "choose_effect", {"index": i, "apply": "income_appeal"}))
    elif k == "income_sponsor":                         # the break income of one sponsor
        out.append(Action(seat, "choose_effect", {"index": i, "apply": "income_sponsor", "source": e["source"]}))
    elif k == "income_kiosk":                           # the break income of the kiosks (a building of the income may change it)
        out.append(Action(seat, "choose_effect", {"index": i, "apply": "income_kiosk"}))
    elif k == "archaeologist":                          # a placement bonus anywhere on the map that no building covers yet
        out += [Action(seat, "choose_effect", {"index": i, "cell": list(c)}) for c in archaeologist_cells(state, p)]
        if not out:
            out.append(Action(seat, "skip_effect", {"index": i}))
    elif k == "take_tile":
        from ark_nova.engine import association
        out += [Action(seat, "choose_effect", {"index": i, **o}) for o in association.with_categories(state, association.tile_options(state, p, e["tile"]))]
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
    elif k == "continent":
        from ark_nova.engine import map_rules
        c, j = a["continent"], int(a["pick"])
        if c not in map_rules.continents_left(p) or (e.get("continent") and e["continent"] != c) or not 0 <= j < len(map_rules.CONTINENT_BONUSES):
            raise fx.IllegalEffect("that continent marker cannot be removed")
        p.flags["m9_removed"] = p.flags.get("m9_removed", 0) | 1 << map_rules.CONTINENTS.index(c)
        bonus = dict(map_rules.CONTINENT_BONUSES[j])
        if "Clever" in bonus and state.current_action is not None and state.current_action.get("type") != "break":
            state.current_action.setdefault("after", []).append({"kind": "slot1", "source": "map9", "optional": True})        # any action card to slot 1 at the end of the action
        else:
            apply_bonus(state, p.seat, bonus)
        if not map_rules.continents_left(p):
            _g()._gain(state, p.seat, conservation=1)                           # the 5th and last marker
    elif k == "wave":
        gone = next((c for c in state.display if c), None)
        if gone is not None:                                                    # the first card of the display goes (to the owner of its mark, if any) and the display is replenished
            state.display[state.display.index(gone)] = None
            from ark_nova.engine import marks
            marks.discard(state, gone)
            _g()._refill_display(state)
    elif k == "multiplier":
        card = next((c for c in p.action_cards if c.type == a.get("multiplier")), None)
        if card is None:
            raise fx.IllegalEffect("no such action card")
        from ark_nova.engine import animal_abilities
        animal_abilities.add_multiplier(state, p, card)
    elif k == "move_in":
        key, src = a.get("move"), list(a.get("from") or [])
        if (key, src) not in move_options(state, p, e):
            raise fx.IllegalEffect("that animal cannot move into the new enclosure")
        nb = next(b for b in p.buildings if [b.x, b.y] == e["building"])
        old = next(b for b in p.buildings if [b.x, b.y] == src)
        if old.type.startswith("size-"):
            old.animal = None                                   # the standard enclosure is empty again
        else:
            old.animals.remove(key)
        nb.animals.append(key)
        return                                                  # more animals may follow; the player skips the effect when done
    elif k == "store":
        if a["store"] not in p.hand:
            raise fx.IllegalEffect("that card is not in the hand")
        p.hand.remove(a["store"])
        p.stored.append(a["store"])
    elif k == "rep_bonus":
        opts = state.conservation_options.get("99", [])
        j = int(a["rep_bonus"])
        if not 0 <= j < len(opts):
            raise fx.IllegalEffect("the bonus of 16 reputation has been taken")
        apply_bonus(state, p.seat, opts.pop(j))
    elif k == "search_sponsor":
        from ark_nova.engine.cards import search_deck
        found = search_deck(state.main_deck, ("sponsor", None))
        if found:
            p.hand.append(found)
    elif k == "pbonus":
        _g().apply_placement_bonus(state, p.seat, e["bonus"])
    elif k == "search_category":
        fx.search_for_category(state, p.seat, e["category"])
    elif k == "income_map":
        from ark_nova.engine import breaks
        _g()._gain(state, p.seat, money=breaks.map_ability_income(state, p))
    elif k == "income_kiosk":
        from ark_nova.engine import breaks
        _g()._gain(state, p.seat, money=breaks.kiosk_income(p))
    elif k == "income_appeal":
        _g()._gain(state, p.seat, money=tracks_module().income_from_appeal(p.appeal))
    elif k == "income_sponsor":
        from ark_nova.engine import breaks
        inc = breaks.sponsor_income(state, p, only=[e["source"]])
        _g()._gain(state, p.seat, money=inc["money"], x_tokens=inc["xtoken"], appeal=inc["appeal"], conservation=inc["conservation"])
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
