"""End of the game: the trigger, the last turns and the final scoring.

Trigger: a score (appeal + conservation points) of 100 or more, checked when a turn ends and after the income of a break.
- reached in a turn: the other player gets one more turn (a break caused by the triggering turn is played first);
- reached in a break: the break is finished, then every player gets one more turn, starting with the player after the break.
No break is played after the last turn. Then (nobody reached 10 conservation: the endgame cards are discarded down to one first) the
final scoring: Arcade (score first), then per player the endgame effects of the sponsors in the zoo and the endgame cards, then Mascot
Statue (score last). The final score is appeal + the conservation track points (`tracks.score`).

"Connected" (Hydrologist, Geologist, Natives, Architectural Zoo, ...): a space is connected when it is covered by or next to a building.
See docs/engine_design.md, End of the game.
"""
from collections import Counter

from ark_nova import data
from ark_nova.engine import build_action, tracks
from ark_nova.engine.board import board, neighbours
from ark_nova.engine.icons import icon_counts
from ark_nova.engine.state import Phase, Result

ANIMAL_CATEGORIES = ("Bird", "Predator", "Herbivore", "Primate", "Reptile", "Bear", "Pet", "SeaAnimal")
CONTINENTS = ("Africa", "Americas", "Asia", "Australia", "Europe")
BASE_PROJECT_OF = {"Bear": "bear", "Pet": "pet", "Africa": "africa", "Americas": "americas", "Asia": "asia", "Australia": "australia", "Europe": "europe",
                   "Primate": "primate", "Reptile": "reptile", "Predator": "predator", "Herbivore": "herbivore", "Bird": "bird",
                   "SeaAnimal": "seaAnimal"}


# ---- the trigger ---------------------------------------------------------------------------------------------------------------------

def reached(state, seat: int) -> bool:
    p = state.players[seat]
    return tracks.end_triggered(p.appeal, p.conservation)


def check_trigger(state, order: list, turn_end: bool, next_seat: int):
    """Start the end of the game when a player (looked at in `order`) has reached 100. Returns True when it has just been triggered.
    `next_seat` is the player that plays next (after the current turn or break)."""
    if state.end_triggered_by is not None:
        return False
    for seat in order:
        if reached(state, seat):
            state.end_triggered_by = seat
            state.phase = Phase.FINAL_TURNS
            n = len(state.players)
            state.final_turns = ([s for s in range(n) if s != seat] if turn_end else
                                 [(next_seat + i) % n for i in range(n)])
            if turn_end:                                         # the player after the turn plays first
                state.final_turns.sort(key=lambda s: (s - next_seat) % n)
            return True
    return False


def last_turn_done(state, seat: int) -> bool:
    """A turn has ended: True when it was the last one (the game is over or goes to the final scoring)."""
    if state.end_triggered_by is None:
        return False
    if seat in state.final_turns:
        state.final_turns.remove(seat)
    return not state.final_turns


# ---- final scoring -------------------------------------------------------------------------------------------------------------------

def covered(p) -> set:
    return {c for b in p.buildings if build_action.knows_shape(b.type) for c in build_action.footprint(b.type, b.x, b.y, b.rotation)}


def connected(state, seat: int) -> set:
    """Spaces that are covered by a building or next to one."""
    cov = covered(state.players[seat])
    return cov | {n for c in cov for n in neighbours(c)}


def _buildable(bd) -> set:
    return {c for c in bd.cells if bd.terrain[c] == "plain" and c not in bd.blocked}


def empty_spaces(state, seat: int) -> int:
    """Building spaces (plain terrain) without a building."""
    bd = board(state.players[seat].map_id)
    return len(_buildable(bd) - covered(state.players[seat]))


def _terrain(bd, kind: str) -> set:
    return {c for c in bd.cells if bd.terrain[c] == kind}


def unconnected(state, seat: int, cells: set) -> int:
    con = connected(state, seat)
    return sum(1 for c in cells if c not in con)


def _groups(cells: set) -> list:
    """Sizes of the groups of touching spaces."""
    cells, sizes = set(cells), []
    while cells:
        todo, n = [cells.pop()], 0
        while todo:
            c = todo.pop()
            n += 1
            for m in neighbours(c):
                if m in cells:
                    cells.remove(m)
                    todo.append(m)
        sizes.append(n)
    return sizes


def supports(state, seat: int) -> list:
    """Conservation projects the player supports (the project key of every token of the player on a project)."""
    import re
    keys = []
    for t in state.players[seat].tokens:
        m = re.match(r"(P\d+)_", t.location)
        if t.type == "token" and m:
            keys.append(m.group(1))
    return keys + ["gone"] * state.players[seat].flags.get("supports_gone", 0)           # projects that were discarded keep their supports


def donations(state, seat: int) -> int:
    return sum(1 for t in state.players[seat].tokens if t.type == "token" and t.location.startswith("association_0_"))


def _project_requirement(key: str) -> str:
    card = data.cards_by_key()[key]
    return card["slots"][0]["bonuses"][0].get("bonusRequirement")


def _supported_base(state, seat: int) -> set:
    """Requirement names (africa, bird, ...) of the base projects the player supports."""
    return {_project_requirement(k) for k in supports(state, seat) if k in state.base_projects}


def tier_points(card: dict, marine_worlds: bool, value: int) -> int:
    table = card["scoring"]["marine_worlds" if marine_worlds else "base"]
    return max((t["conservationPoint"] for t in table if isinstance(t["requirement"], int) and value >= t["requirement"]), default=0)


def _size_class(k: str, mw: bool = True) -> str:
    from ark_nova.engine.association import project
    s = project(k, mw)["size"]
    return "small" if s <= 2 else "large" if s >= 4 else "medium"


def metric(state, seat: int, key: str) -> int:
    """The number an endgame card counts (tiered cards)."""
    p = state.players[seat]
    icons = icon_counts(state, seat)
    if key == "F001":
        return sum(_size_class(a, state.config.marine_worlds) == "large" for a in p.animals + p.rescued)
    if key == "F002":
        return sum(_size_class(a, state.config.marine_worlds) == "small" for a in p.animals + p.rescued)
    if key == "F003":
        return icons["Science"]
    if key == "F005":
        return len(supports(state, seat))
    if key == "F006":
        return empty_spaces(state, seat)
    if key == "F007":
        return p.reputation
    if key == "F008":
        return len(p.sponsors)
    if key == "F010":
        return icons["Rock"]
    if key == "F011":
        return icons["Water"]
    if key == "F012":
        return len({_shape_signature(b.type) for b in p.buildings})
    if key in ("F013", "F014"):
        names = CONTINENTS if key == "F013" else ANIMAL_CATEGORIES
        done = _supported_base(state, seat)
        return max((icons[n] for n in names if BASE_PROJECT_OF[n] not in done), default=0)
    if key == "F015":
        return min(sum(b.type == "kiosk" for b in p.buildings), sum(b.type == "pavilion" for b in p.buildings))
    if key == "F016":
        return sum(_conditions(k) for k in p.animals + p.sponsors)
    raise KeyError(key)


def _shape_signature(t: str) -> tuple:
    """A building type as a shape: the same cells up to rotation and position (kiosk = pavilion = size-1, small aquarium = size-2)."""
    from ark_nova.engine.board import footprint_cells
    best = None
    for r in range(6):
        cells = footprint_cells(build_action.shape_of(t), (0, 0), r)
        ax = sorted((x, y) for x, y in cells)
        base = ax[0]
        norm = tuple((x - base[0], y - base[1]) for x, y in ax)
        best = norm if best is None or norm < best else best
    return best


def _conditions(k: str) -> int:
    return len(data.cards_by_key()[k].get("requirements", []))


def card_points(state, seat: int, key: str) -> int:
    card = data.cards_by_key()[key]
    mw = state.config.marine_worlds
    p = state.players[seat]
    bd = board(p.map_id)
    if key == "F004":
        con, cov = connected(state, seat), covered(p)
        return (all(c in con for c in _terrain(bd, "water")) + all(c in con for c in _terrain(bd, "rock"))
                + all(c in cov for c in bd.border if c in _buildable(bd)) + (not _buildable(bd) - cov))
    if key in ("F009", "F017"):
        names = ANIMAL_CATEGORIES if key == "F009" else CONTINENTS
        mine, theirs = icon_counts(state, seat), icon_counts(state, 1 - seat)
        if key == "F017":
            mine = Counter(mine)
            for t in p.tokens:
                if t.type.startswith("partner-"):
                    mine[t.type.split("-", 1)[1]] += 1
        return min(4, sum(mine[n] > theirs[n] for n in names))
    return tier_points(card, mw, metric(state, seat, key))


# endgame effects that the card data does not show: 1 conservation for that many icons of a kind (fitted to the logs)
HIDDEN_ICON_TIERS = {"S243": ("Herbivore", 6), "S244": ("Bird", 6), "S245": ("Water", 6), "S246": ("Rock", 7), "S247": ("Primate", 6),
                     "S251": ("Bear", 3)}


def sponsor_points(state, seat: int, key: str) -> dict:
    """{'conservation': n, 'appeal': n} of the endgame effect of one sponsor (not the two that compare appeal)."""
    p = state.players[seat]
    bd = board(p.map_id)
    icons = icon_counts(state, seat)
    cov, con = covered(p), connected(state, seat)
    cons = appeal = 0
    if key == "S201":
        cons = 2 if icons["Science"] >= 6 else 1 if icons["Science"] >= 3 else 0
    elif key in ("S208", "S261"):
        cons = sum(1 for c in ANIMAL_CATEGORIES if icons[c]) >= 5
    elif key in ("S225", "S226"):
        cons = all(icons[c] for c in CONTINENTS)
    elif key in ("S215", "S218"):
        cons = len(supports(state, seat)) >= 5
    elif key == "S241":
        cons = all(c in con for c in _terrain(bd, "water"))
    elif key == "S242":
        cons = all(c in con for c in _terrain(bd, "rock"))
    elif key == "S258":
        cons = unconnected(state, seat, _terrain(bd, "water")) // 2
    elif key == "S259":
        cons = unconnected(state, seat, _terrain(bd, "rock")) // 2
    elif key == "S260":
        cons = sum(n // 6 for n in _groups(_buildable(bd) - cov))
    elif key == "S264":
        cons = unconnected(state, seat, set(bd.bonuses)) // 2
    elif key == "S265":
        cons = sum(b.type == "kiosk" for b in p.buildings) >= 5
    elif key == "S267":
        free = _buildable(bd) - cov
        cons = min(3, sum(1 for b in p.buildings if b.type == "kiosk"
                          and sum(1 for n in neighbours(build_action.footprint(b.type, b.x, b.y, b.rotation)[0]) if n in free) >= 3))
    elif key == "S268":
        cons = donations(state, seat) >= 3
    elif key == "S269":
        appeal = min(5, len(p.pouched) + sum(len(v) for v in p.under.values()))
    elif key == "S271":
        cons = all(c in cov for c in bd.bonuses)
    elif key == "S272":
        cons = all(c in cov for c in bd.border if c in _buildable(bd))
    elif key == "S257":
        appeal = 5 if not _buildable(bd) - cov else 0
    elif key in ("S203", "S209"):
        cons = sum(t.location.startswith("university_") for t in p.tokens) >= 3
    elif key == "S210":
        cons = sum(b.type == "kiosk" for b in p.buildings) >= 5
    elif key in ("S216", "S220"):
        cons = p.reputation >= 9
    elif key == "S221":
        cons = all(c in cov for c in bd.border if c in _buildable(bd))
    elif key in HIDDEN_ICON_TIERS:
        name, n = HIDDEN_ICON_TIERS[key]
        cons = icons[name] >= n
    elif key == "S214":
        appeal = p.x_tokens
    elif key in ("S217", "S280"):
        appeal = 5 if not _buildable(bd) - cov else 0
    elif key == "S219":
        appeal = 2 * min(3, icons["Rock"], icons["Water"])
    elif key == "S279":
        b = next((b for b in p.buildings if b.type == "underwater-tunnel"), None)
        if b:
            around = {n for c in build_action.footprint(b.type, b.x, b.y, b.rotation) for n in neighbours(c)}
            near = sum(1 for a in p.buildings if a.type in build_action.AQUARIUMS
                       and around & set(build_action.footprint(a.type, a.x, a.y, a.rotation)))
            appeal = 5 if near >= 2 else 3 if near == 1 else 0
    return {"conservation": int(cons), "appeal": int(appeal)}


def final_scoring(state) -> list:
    """Apply the final scoring to the state (direct gains: no thresholds any more). Returns the log [(seat, source, resource, n)]."""
    log = []

    def add(seat, source, res, n):
        if n:
            p = state.players[seat]
            setattr(p, res, getattr(p, res) + n)
            log.append((seat, source, res, n))

    base = {s: state.players[s].appeal for s in range(len(state.players))}
    for s, p in enumerate(state.players):                       # Arcade: score first
        if "S281" in p.sponsors:
            add(s, "S281", "appeal", 2 * sum(base[o] < base[s] for o in base if o != s))
    order = [(state.end_triggered_by or 0) + i for i in range(len(state.players))]
    for seat in (o % len(state.players) for o in order):
        p = state.players[seat]
        for k in list(p.sponsors):
            r = sponsor_points(state, seat, k)
            add(seat, k, "conservation", r["conservation"])
            add(seat, k, "appeal", r["appeal"])
        for c in list(p.endgame_hand):
            add(seat, c, "conservation", card_points(state, seat, c))
    final = {s: state.players[s].appeal for s in range(len(state.players))}
    for s, p in enumerate(state.players):                       # Mascot Statue: score last
        if "S274" in p.sponsors:
            add(s, "S274", "appeal", 2 * sum(final[o] > final[s] for o in final if o != s))
    return log


def scores(state) -> list:
    return [tracks.score(p.appeal, p.conservation) for p in state.players]


def finish(state) -> None:
    """The final scoring has been done: the result."""
    sc = scores(state)
    state.phase = Phase.OVER
    state.prompt = None
    state.current_action = None
    top = max(sc)
    state.result = Result(scores=sc, winner=sc.index(top) if sc.count(top) == 1 else None)
