"""The break (rulebook p.18-19): when the break token reaches the last space, the turn is finished and then
1. hand limit: every player discards down to 3 cards (5 with a hand-size university);
2. tokens on action cards (Multiplier, Venom, Constriction) are removed;
3. association board: all workers return to the notepad; the partner zoos and universities on offer are replenished to one of each kind
   (not those both players already have);
4. display: the two cards of folders 1 and 2 are discarded, the others move down, the display is refilled;
5. income, each player in turn order starting with the one who triggered the break: appeal income, kiosk income, the income bonuses of the map
   already activated, and the income of sponsors;
6. the break token goes back to the start and the next player takes a turn.

Decisions (the hand limit discard, cards taken as income) are pending effects of the prompt `effects`; the break is a small state machine
(`resume` kind `break`, step `board` / `end`).
"""
from itertools import combinations

from ark_nova import data
from ark_nova.engine import association, bonuses, endgame, gamestats, marks, tracks
from ark_nova.engine.actions import Action
from ark_nova.engine.board import neighbours
from ark_nova.engine.build_action import SIZES, footprint
from ark_nova.engine.icons import icon_counts

HAND_LIMIT = 3
HAND_LIMIT_UNIVERSITY = 5
SPECIAL_ENCLOSURES = ("petting-zoo", "reptile-house", "large-bird-aviary", "small-aquarium", "large-aquarium")


def _g():
    from ark_nova.engine import game
    return game


def hand_limit(p) -> int:
    base = HAND_LIMIT_UNIVERSITY if any(t.type == "fac-rep-hand" for t in p.tokens if t.location.startswith("university_")) else HAND_LIMIT
    return base + sum(1 for t in p.tokens if t.type == "bonus-increased-hand")                  # the conservation bonus: one more card


# ---- the steps -------------------------------------------------------------------------------------------------------------------

def start(state, initiator: int) -> None:
    """Called when the break token has reached the last space and the turn is over."""
    state.current_action = {"seat": initiator, "type": "break", "strength": 0}
    gamestats.count(state, initiator, "breaks")
    state.prompt = None                                       # (the effects prompt of the last action is over: the effects of the break must not join it)
    pending = [{"kind": "break_discard", "player": p.seat, "n": len(p.hand) - hand_limit(p), "optional": False}
               for p in state.players if len(p.hand) > hand_limit(p)]
    if pending:
        bonuses.open_break_prompt(state, initiator, pending, {"kind": "break", "initiator": initiator, "step": "board"})
        return
    run(state, initiator, "board")


def run(state, initiator: int, step: str) -> None:
    g = _g()
    if step == "board":
        _action_card_tokens(state)
        _workers_home(state)
        _replenish_board(state)
        _refresh_display(state)
        for seat in (initiator, 1 - initiator):
            _income(state, seat)
        if g._open_effects(state, initiator, [], {"kind": "break", "initiator": initiator, "step": "end"}):
            return
        step = "end"
    if step == "end":
        g._refill_display(state)                                  # cards snapped as income leave gaps
        endgame.check_trigger(state, [initiator, 1 - initiator], False, 1 - initiator)     # the income can reach 100
        state.break_position = 0
        state.round += 1                                          # the break is over: the next round starts
        if state.end_triggered_by is not None and not state.final_turns:               # the break of the very last turn: the final scoring follows it
            state.current_action = None
            g._end_game(state)
            return
        for q in state.players:
            q.flags.pop("built_now", None)
            q.flags["post_break"] = 1                              # (a token used before the next action still belongs to the break in BGA's log: a sponsor played then pays its income)
        state.current_action = None
        state.active_player = 1 - initiator
        from ark_nova.engine.state import Prompt
        state.prompt = Prompt(kind="choose_action_card", player=state.active_player)


def _action_card_tokens(state) -> None:
    """Venom and Constriction tokens go at the break (the logs show Multiplier tokens staying)."""
    from ark_nova.engine import venom
    venom.clear_at_break(state)


def _workers_home(state) -> None:
    for p in state.players:
        for t in p.tokens:
            if t.type == "worker" and t.location.startswith("association_"):
                t.location = "reserve"


def _replenish_board(state) -> None:
    """Exactly one partner zoo of each continent and one university of each kind on the board again, unless both players have it."""
    owned = [t for q in state.players for t in q.tokens]
    ids = [t.id for t in owned] + [t.id for t in state.board_tokens]

    def new_id() -> int:
        ids.append(max(ids, default=0) + 1)
        return ids[-1]

    for c in association.CONTINENTS:
        have = sum(1 for q in state.players if any(t.type == f"partner-{c}" for t in q.tokens if t.location.startswith("partner_")))
        if not any(t.type == f"partner-{c}" and t.location == "association_3" for t in state.board_tokens) and have < len(state.players):
            from ark_nova.engine.state import Token
            state.board_tokens.append(Token(new_id(), f"partner-{c}", "association_3"))
    for kind in association.UNIVERSITY_KINDS:
        both = all(any(association.university_class(t.type) == kind for t in q.tokens if t.location.startswith("university_"))
                   for q in state.players)
        on_board = any(t.type == kind and t.location == "association_4" for t in state.board_tokens)
        if kind == "fac-generic" and not association.category_pool(state):
            continue
        if not on_board and not both:
            from ark_nova.engine.state import Token
            state.board_tokens.append(Token(new_id(), kind, "association_4"))


def _refresh_display(state) -> None:
    g = _g()
    gone = [c for c in state.display[:2] if c]
    state.display[0] = state.display[1] = None
    for c in gone:
        marks.discard(state, c)
    g._refill_display(state)


# ---- income ----------------------------------------------------------------------------------------------------------------------

def _counted_cells(p, skip=None) -> dict:
    """cell -> index of the building (the buildings that can be next to a kiosk / the entrance)."""
    cells = {}
    for i, b in enumerate(p.buildings):
        if i != skip and (b.type in SIZES or b.type in ("kiosk", "pavilion") or b.type in association_building_types()):
            for c in footprint(b.type, b.x, b.y, b.rotation):
                cells[c] = i
    return cells


def kiosk_income(p) -> int:
    """1 money for every unique building, special enclosure, occupied standard enclosure and pavilion next to each kiosk."""
    cells = _counted_cells(p)
    total = 0
    for ki, k in enumerate(p.buildings):
        if k.type != "kiosk":
            continue
        near = {cells[n] for n in neighbours(footprint("kiosk", k.x, k.y, k.rotation)[0]) if n in cells and cells[n] != ki}
        for i in near:
            b = p.buildings[i]
            if b.type == "kiosk":
                continue
            total += (1 if b.animal else 0) if b.type.startswith("size-") else 1
    return total


def association_building_types():
    from ark_nova.engine.build_action import UNIQUE_SHAPES
    return tuple(UNIQUE_SHAPES)


INCOME_SPONSORS = {"S209", "S220", "S206", "S274", "S281", "S265", "S257", "S231", "S232", "S233", "S234", "S235"}
def income_effects(k: str, seat: int) -> list:
    """The pending income effects of one sponsor (a sponsor played during the break triggers its instant and its income effect)."""
    out = []
    if k in INCOME_SPONSORS:
        out.append({"kind": "income_sponsor", "source": k, "optional": False, "player": seat})
    if k == "S201":                                              # Science Lab: take 1 card from the deck or within the reputation range
        out.append({"kind": "take", "source": k, "optional": False, "player": seat})
    return out


_SPONSORSHIP = {"S231": "Primate", "S232": "Reptile", "S233": "Bird", "S234": "Predator", "S235": "Herbivore"}


def sponsor_income(state, p, only=None) -> dict:
    """{resource: n} of the income effects of the sponsors in play (the ones with a decision are handled by `_income`); `only`: just these sponsors."""
    out = {"money": 0, "xtoken": 0, "appeal": 0, "conservation": 0}
    icons = icon_counts(state, p.seat)
    for k in (p.sponsors if only is None else only):
        if k == "S209":
            out["xtoken"] += 1
        elif k == "S220":
            out["money"] += 3
        elif k == "S206":
            out["conservation"] += 1
        elif k == "S274":
            out["appeal"] += 1
        elif k == "S281":
            out["money"] += p.appeal // 10
        elif k in _SPONSORSHIP:
            n = icons[_SPONSORSHIP[k]]
            out["money"] += 9 if n >= 5 else 6 if n >= 3 else 3 if n >= 1 else 0
        elif k == "S265":
            out["money"] += sum(1 for q in state.players if q.seat != p.seat for b in q.buildings if b.type == "kiosk")
        elif k == "S257":
            ei = next((i for i, b in enumerate(p.buildings) if b.type == "entrance"), None)
            if ei is not None:
                e = p.buildings[ei]
                cells = _counted_cells(p, skip=ei)
                near = {cells[n] for c in footprint(e.type, e.x, e.y, e.rotation) for n in neighbours(c) if n in cells}
                out["money"] += 2 * sum(1 for i in near if not (p.buildings[i].type.startswith("size-") and not p.buildings[i].animal))
    return out


def map_income(state, p) -> list:
    """The income bonuses of the map that the player has already activated."""
    slots = data.map_by_id(p.map_id)["geometry"]["bonus_slots"]
    used = p.flags.get("bonus_used", 0)
    return [s["bonus"] for s in slots if s["kind"] == "instant_income" and used >> s["index"] & 1 and s.get("bonus")]


def map_ability_income(state, p) -> int:
    """Money from the printed ability of the zoo map: Park Restaurant (5): 1 per covered space next to the restaurant; Caves (11): 2 per
    stored card; Ice Cream Parlors (7 / 7a): 1 per kiosk once all kiosk hexes are covered. The Drawing Board (13) is paid in `_income` (`map_rules.quarter_bonus`)."""
    if p.map_id in ("5", "5a"):
        from ark_nova.engine.board import board
        bd = board(p.map_id)
        rest = next(s for s in data.map_by_id(p.map_id)["geometry"]["special_hexes"] if s["kind"] == "restaurant")
        covered = {c for b in p.buildings for c in footprint(b.type, b.x, b.y, b.rotation)}
        return sum(1 for n in neighbours((rest["x"], rest["y"])) if n in covered)
    if p.map_id == "11":
        return 2 * len(p.stored)
    if p.map_id in ("7", "7a"):                            # all kiosk placement bonuses covered: 1 more for each kiosk
        from ark_nova.engine import map_rules
        return sum(1 for b in p.buildings if b.type == "kiosk") if map_rules.kiosk_hexes_covered(p) else 0
    return 0


def _income(state, seat: int) -> None:
    g = _g()
    p = state.players[seat]
    bonuses.defer(state, {"kind": "income_appeal", "optional": False, "player": seat})      # the money of the appeal track is counted when the player resolves it: appeal gained first counts
    bonuses.defer(state, {"kind": "income_kiosk", "optional": False, "player": seat})
    if p.map_id in ("11", "5", "5a", "7", "7a"):           # the income of the map is an effect of its own: the player may resolve it before or after the free enclosure / store of the income
        bonuses.defer(state, {"kind": "income_map", "optional": False, "player": seat})
    else:
        g._gain(state, seat, money=map_ability_income(state, p))
    if p.map_id == "13":                                   # Drawing Board: every covered area pays again
        from ark_nova.engine import map_rules
        for name in sorted(map_rules.quarters_done(p)):
            map_rules.quarter_bonus(state, seat, name)
    for b in map_income(state, p):
        bonuses.apply_bonus(state, seat, {b["type"]: b["value"]}, income=True)
    for k in p.sponsors:                                        # every income of a sponsor is an effect of its own, in the order the player likes
        for eff in income_effects(k, seat):
            bonuses.defer(state, eff)


# ---- the hand limit discard ---------------------------------------------------------------------------------------------------------

def legal_discard(state, e: dict, i: int, seat: int) -> list:
    p = state.players[seat]
    n = min(e["n"], len(p.hand) - hand_limit(p))                  # (a sponsor played before the break proper may have brought the hand down: 868837221 turn 42)
    if n <= 0:
        return [Action(seat, "skip_effect", {"index": i})]
    return [Action(seat, "choose_effect", {"index": i, "cards": list(c)}) for c in sorted(set(combinations(sorted(p.hand), n)))]


def resolve_discard(state, action: Action, e: dict, i: int) -> None:
    fx = bonuses._fx()
    p = state.players[action.player]
    cards = list(action.args["cards"])
    if len(cards) != min(e["n"], len(p.hand) - hand_limit(p)) or any(cards.count(c) > p.hand.count(c) for c in cards):
        raise fx.IllegalEffect("discard the right number of cards from the hand")
    for c in cards:
        p.hand.remove(c)
    state.main_discard.extend(cards)
    fx._done(state, i)
