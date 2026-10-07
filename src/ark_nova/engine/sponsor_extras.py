"""Sponsors with their own rules (rules given by the user): Basic Research (S207), Release of Patents (S222), Explorer (S262), Waza Special
Assignment (S227), Reconstruction (S280), plus the pending effects `waza`, `reposition` and `boost` (the Boost ability of animals).

- S207 Basic Research (needs the upgraded action and appeal <= 25): 1 conservation for each pair of different continent / species icons; every
  opponent gets twice that in money.
- S222 Release of Patents (appeal <= 25): up to 3 conservation, 1 per research icon; every opponent gets twice that in money.
- S262 Explorer (upgraded action): 2 money per different continent / animal icon in the zoo (its trigger is in `effects.fire_icon_counter`).
- S227 Waza Special Assignment (reputation 6): choose small (size 1-2, petting zoo animals included) or large (4-5) animals; the other kind can
  never be played again, the chosen kind gives 2 (small) / 4 (large) appeal each time, size 3 is not affected; the first animal of the chosen
  kind is taken from the deck.
- S280 Reconstruction (upgraded action): optionally a free kiosk and a free pavilion, and pick up to 3 buildings and place them again (same
  rules as a Build action); from then on no placement bonuses.
- Boost: X (animal ability): the X action card goes to slot 1 or slot 5 at the end of the action.
"""
import re
from collections import Counter
from itertools import combinations

from ark_nova import data
from ark_nova.engine import build_action, card_programs as prog
from ark_nova.engine.actions import Action
from ark_nova.engine.board import board, neighbours
from ark_nova.engine.icons import icon_counts

KINDS = ("waza", "reposition", "boost", "enlarge", "expedition")
SPECIES = ("Bird", "Predator", "Herbivore", "Primate", "Reptile", "Bear", "Pet", "SeaAnimal")
CONTINENTS = ("Africa", "Europe", "Asia", "Americas", "Australia")
WAZA_SMALL, WAZA_LARGE = 1, 2
WAZA_APPEAL = {WAZA_SMALL: 2, WAZA_LARGE: 4}


def _g():
    from ark_nova.engine import game
    return game


def _fx():
    from ark_nova.engine import effects
    return effects


def size_class(card: dict):
    """'small' (size 1-2, petting zoo animals included), 'large' (4-5) or None (size 3)."""
    return "small" if card["size"] <= 2 else "large" if card["size"] >= 4 else None


def distinct_pairs(icons: Counter) -> int:
    """Basic Research: only which continent / species icons are present counts, not how many (5 kinds present = 2 pairs)."""
    return sum(1 for i in CONTINENTS + SPECIES if icons[i]) // 2


def _covered(p) -> set:
    return {c for b in p.buildings for c in build_action.footprint(b.type, b.x, b.y, b.rotation)}


def _adjacent_free(state, seat: int, wanted) -> int:
    """Uncovered spaces of the map with `wanted(board, cell)` that touch a building of any type."""
    p = state.players[seat]
    bd = board(p.map_id)
    cov = _covered(p)
    near = {n for c in cov for n in neighbours(c)}
    return sum(1 for c in near if c in bd.cells and c not in cov and wanted(bd, c))


def special_on_play(state, seat: int, key: str, total: Counter) -> list:
    g = _g()
    opp = 1 - seat
    pending: list = []
    if key == "S207":
        pairs = distinct_pairs(total)
        g._gain(state, seat, conservation=pairs)
        g._gain(state, opp, money=2 * pairs)
    elif key == "S222":
        n = min(3, total["Science"])
        g._gain(state, seat, conservation=n)
        g._gain(state, opp, money=2 * n)
    elif key == "S262":
        g._gain(state, seat, money=2 * sum(1 for i in prog.EXPLORER_ICONS if total[i]))
    elif key in ("S229", "S230"):                # Expert in Small / Large Animals: appeal for each small animal / 2 for each large animal
        c = Counter(size_class(data.cards_by_key()[a]) for a in list(state.players[seat].animals) + list(state.players[seat].rescued))      # (the rescued animals count: 839041784 turn 82)
        g._gain(state, seat, appeal=c["small"] if key == "S229" else 2 * c["large"])
    elif key == "S203":                          # Veterinarian: 0 / 2 / 5 / 10 money for 0 / 1 / 2 / 3 universities
        g._gain(state, seat, money=(0, 2, 5, 10)[min(3, sum(t.location.startswith("university_") for t in state.players[seat].tokens))])
    elif key == "S206":                          # Medical Breakthrough: 2 appeal per supported project
        p_ = state.players[seat]          # (a support on a project that was discarded since still counts)
        g._gain(state, seat, appeal=2 * (sum(1 for t in p_.tokens if t.type == "token" and re.match(r"P\d+_", t.location)) + p_.flags.get("supports_gone", 0)))
    elif key == "S219":                          # Diversity Researcher: 2 money per rock / water icon
        g._gain(state, seat, money=2 * (total["Rock"] + total["Water"]))
    elif key == "S258":
        g._gain(state, seat, appeal=_adjacent_free(state, seat, lambda bd, c: bd.terrain[c] == "water"))
    elif key == "S259":
        g._gain(state, seat, appeal=_adjacent_free(state, seat, lambda bd, c: bd.terrain[c] == "rock"))
    elif key == "S260":
        g._gain(state, seat, appeal=_adjacent_free(state, seat, lambda bd, c: bd.terrain[c] == "plain" and c in bd.border))
    elif key == "S264":
        g._gain(state, seat, appeal=_adjacent_free(state, seat, lambda bd, c: c in bd.bonuses))
    elif key == "S267":                          # Farm Cat: 1 / 3 / 5 appeal for 1 / 4 / 7 kiosks and pavilions
        n = sum(1 for b in state.players[seat].buildings if b.type in ("kiosk", "pavilion"))
        g._gain(state, seat, appeal=5 if n >= 7 else 3 if n >= 4 else 1 if n >= 1 else 0)
    elif key == "S268":                          # Conference on Europe: 2 / 5 / 10 money for 1 / 3 / 5 Europe icons
        n = total["Europe"]
        g._gain(state, seat, money=10 if n >= 5 else 5 if n >= 3 else 2 if n >= 1 else 0)
    elif key == "S228":                          # Waza Small Animal Program: 2 money per small animal in the zoo (checked on the 7 plays in the logs)
        g._gain(state, seat, money=2 * sum(size_class(data.cards_by_key()[a]) == "small" for a in state.players[seat].animals))
    elif key == "S227":
        pending.append({"kind": "waza", "source": key, "optional": False})
    elif key == "S280":
        pending.append({"kind": "reposition", "source": key, "optional": True})
        pending += [{"kind": "build", "source": key, "type": t, "rules": {}, "optional": True, "double": False} for t in ("kiosk", "pavilion")]
    return pending


def _unique_rules(t: str, marine_worlds: bool = False) -> dict:
    """The placement rules of the sponsor that brought a unique building (rock / water next to it, ...)."""
    from ark_nova.engine import effects
    for key, (bt, _) in prog.UNIQUE_BUILD.items():
        if bt == t:
            return effects.build_rules(key, marine_worlds)[1]
    return {}


def enlarge_options(state, seat: int, b) -> list:
    """Conference on Australia: (x, y, rotation) of the next bigger enclosure that covers all the hexes of the old one."""
    p = state.players[seat]
    if not re.fullmatch(r"size-[1-4]", b.type):
        return []
    bd = board(p.map_id)
    new = f"size-{int(b.type[5:]) + 1}"
    old = set(build_action.footprint(b.type, b.x, b.y, b.rotation))
    others = _covered(p) - old
    level = max((c.level for c in p.action_cards if c.type == "build"), default=1)
    over = "S219" in p.sponsors
    out = []
    for x, y in sorted(bd.cells):
        for r in range(6):
            cells = build_action.footprint(new, x, y, r)
            if old <= set(cells) and all(c in bd.cells and c not in others and c not in bd.blocked and (c in old or over or bd.terrain[c] == "plain")   # (a rock / water space the old enclosure already covers stays covered; new spaces need Diversity Researcher)
                                         and (level >= 2 or c in old or c not in bd.flags) for c in cells):
                out.append((x, y, r))
    return out


def legal(state, e: dict, i: int, seat: int) -> list:
    p = state.players[seat]
    k = e["kind"]
    if k == "waza":
        return [Action(seat, "choose_effect", {"index": i, "waza": w}) for w in ("small", "large")]
    if k == "boost":
        return [Action(seat, "choose_effect", {"index": i, "slot": s}) for s in (1, 5)]
    if k == "expedition":                                    # Marine Research Expedition: a person away for 1 conservation, or Scuba Dive 3
        persons = sorted({s for s in p.sponsors if data.cards_by_key()[s].get("type") == "HUMAN"})
        return [Action(seat, "choose_effect", {"index": i, "send": s}) for s in persons] + [Action(seat, "choose_effect", {"index": i, "scuba": True})]
    if k == "enlarge":
        out = [Action(seat, "choose_effect", {"index": i, "building": [b.x, b.y], "x": x, "y": y, "rotation": r})
               for b in p.buildings for x, y, r in enlarge_options(state, seat, b)]
        return out
    if k == "reposition":
        cells = sorted((b.x, b.y) for b in p.buildings)
        return [Action(seat, "choose_effect", {"index": i, "remove": [list(c) for c in combo]})
                for n in (1, 2, 3) for combo in combinations(cells, n)]
    return []


def resolve(state, action: Action, e: dict, i: int) -> None:
    fx, g = _fx(), _g()
    p = state.players[action.player]
    k = e["kind"]
    a = action.args
    if k == "waza":
        choice = {"small": WAZA_SMALL, "large": WAZA_LARGE}[a["waza"]]
        p.flags["waza"] = choice
        for j, key in enumerate(state.main_deck):                 # the first animal of the chosen kind, a search
            if key.startswith("A") and size_class(data.cards_by_key()[key]) == a["waza"]:
                p.hand.append(state.main_deck.pop(j))
                break
    elif k == "expedition":
        if a.get("send"):
            s = a["send"]
            if s not in p.sponsors or data.cards_by_key()[s].get("type") != "HUMAN":
                raise fx.IllegalEffect("send a person sponsor of the zoo away")
            p.sponsors.remove(s)
            state.main_discard.append(s)
            g._gain(state, p.seat, conservation=1)
        else:                                                    # Scuba Dive 3: the 3 topmost cards, 1 sponsor is kept
            state.prompt.args["pending"][i + 1:i + 1] = [{"kind": "reveal", "source": e["source"], "x": 3, "filter": "sponsor", "optional": False, "player": p.seat}]
    elif k == "boost":
        j = next(j for j, c in enumerate(p.action_cards) if c.type == e["type"])
        card = p.action_cards.pop(j)
        p.action_cards = [card] + p.action_cards if int(a["slot"]) == 1 else p.action_cards + [card]
    elif k == "enlarge":
        b = next((b for b in p.buildings if [b.x, b.y] == list(a["building"])), None)
        opt = (int(a["x"]), int(a["y"]), int(a["rotation"]))
        if b is None or opt not in enlarge_options(state, action.player, b):
            raise fx.IllegalEffect("that enclosure cannot be enlarged like this")
        old = set(build_action.footprint(b.type, b.x, b.y, b.rotation))
        b.type = f"size-{int(b.type[5:]) + 1}"
        b.x, b.y, b.rotation = opt
        g.hydrologist_geologist(state, p.seat, [c for c in build_action.footprint(b.type, b.x, b.y, b.rotation) if c not in old])      # (the new spaces pay the Hydrologist / Geologist)
        for c in build_action.footprint(b.type, b.x, b.y, b.rotation):
            if c not in old and "S280" not in p.sponsors:
                for bon in board(p.map_id).bonuses.get(c, []):          # (the covered hex pays its placement bonus, a Marketing one included)
                    g.apply_placement_bonus(state, action.player, bon)
        if b.animal:
            g._gain(state, action.player, appeal=2)
    elif k == "reposition":
        gone = {tuple(c) for c in a["remove"]}
        if not 1 <= len(gone) <= 3 or not gone <= {(b.x, b.y) for b in p.buildings}:
            raise fx.IllegalEffect("pick 1 to 3 of your buildings")
        held = [b for b in p.buildings if (b.x, b.y) in gone]
        p.buildings = [b for b in p.buildings if (b.x, b.y) not in gone]
        for b in held:
            state.prompt.args["pending"].append({
                "kind": "build", "source": e["source"], "type": b.type, "rules": _unique_rules(b.type, state.config.marine_worlds), "optional": False, "double": False, "player": action.player,
                "placeback": {"id": b.id, "animal": b.animal, "animals": list(b.animals)}})
    fx._done(state, i)
