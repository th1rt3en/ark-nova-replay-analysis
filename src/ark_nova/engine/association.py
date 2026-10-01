"""The Association action (rulebook p.14-16).

Tasks (each needs the action strength to be at least its value and 1 active worker, or 2 when one of your workers is already on the
task; 3 workers on a task block it until the next break): reputation (2): +2 reputation; partner zoo (3): take one from the board (a
continent you do not have; a 3rd / 4th needs the upgraded action); university (4): take one of the tiles on the board; conservation
project (5): support a project (in play, from the hand, or from the display with the upgraded action). The upgraded action performs
several different tasks with a total value up to the strength and may make one donation (needs at least one task).

State: workers, partner zoos, universities and project tokens are player tokens with BGA's location strings (`reserve`, `supply_k`,
`association_<value>`, `partner_k`, `university_k`, `<project>_<slot>`); the tiles on offer are `state.board_tokens` (`association_3`,
`association_4`); the donation tokens sit on `association_0_k`; the notepad bonuses already taken are the bits of `p.flags["bonus_used"]`.
Supported projects: those with icon conditions (base and normal projects); release / breed / management projects raise NotImplementedError.
"""
import json
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

from ark_nova import data
from ark_nova.engine import bonuses, cards_action
from ark_nova.engine.actions import Action
from ark_nova.engine.icons import icon_counts
from ark_nova.engine.rng import Rng
from ark_nova.engine.state import Token

TASK_VALUE = {"reputation": 2, "partner": 3, "university": 4, "conservation": 5}
MAX_PARTNERS = 4
LEVEL_I_PARTNERS = 2
MAX_UNIVERSITIES = 3
DONATION_COSTS = (2, 5, 7, 10)
DONATION_OVERFLOW_COST = 12
DONATION_SLOTS = ("association_0_0", "association_0_2", "association_0_4", "association_0_6")
DONATION_OVERFLOW_SLOT = "association_0_7"
CONTINENTS = ("Africa", "Europe", "Asia", "Americas", "Australia")
UNIVERSITY_KINDS = ("fac-rep-hand", "fac-science-rep", "fac-science-science", "fac-generic")
CATEGORY_TILES = ("bird", "predator", "herbivore", "primate", "reptile", "marine")
PROJECTS_IN_PLAY = 2                     # conservation projects above the board in a 2 player game
BLOCKED_BASE_SLOT = {0: 0, 1: 1, 2: 2}   # 2 players: base project card k has its slot k covered
ANIMAL_CATEGORIES = ("Bird", "Predator", "Herbivore", "Bear", "Reptile", "Pet", "Primate")
_TILE_REPUTATION = {"fac-rep-hand": 1, "fac-science-rep": 2}
_ICON = {"africa": "Africa", "europe": "Europe", "asia": "Asia", "americas": "Americas", "australia": "Australia", "reptile": "Reptile",
         "water": "Water", "rock": "Rock", "science": "Science", "seaAnimal": "SeaAnimal", "bird": "Bird", "predator": "Predator",
         "herbivore": "Herbivore", "primate": "Primate", "bear": "Bear", "pet": "Pet"}
_BONUSES = Path(data.__file__).with_name("association_bonuses.json")


def _g():
    from ark_nova.engine import game
    return game


def _fx():
    from ark_nova.engine import effects
    return effects


@lru_cache(maxsize=None)
def _map_bonuses() -> dict:
    return json.loads(_BONUSES.read_text()) if _BONUSES.exists() else {}


def map_bonus(map_id: str, key: str) -> int:
    """Conservation points of the map dependent zoo-map bonuses (`partner4`, `university3`, `last_worker`), see data/association_bonuses.json."""
    v = _map_bonuses().get(map_id, {}).get(key)
    if v is None:
        raise NotImplementedError(f"the {key} bonus of map {map_id} is not known (input needed in data/association_bonuses.json)")
    return int(v)


# ---- setup ---------------------------------------------------------------------------------------------------------------------

def initial_board(marine_worlds: bool) -> list:
    """One partner zoo of each continent and one university of each kind on the board."""
    toks = [Token(1 + 4 * i, f"partner-{c}", "association_3") for i, c in enumerate(CONTINENTS)]        # the ids BGA uses for the first tile of each kind
    toks += [Token(21 + 4 * i, k, "association_4") for i, k in enumerate(UNIVERSITY_KINDS)]
    return toks


# ---- helpers ---------------------------------------------------------------------------------------------------------------------

def own(p, prefix: str) -> list:
    return [t for t in p.tokens if t.location.startswith(prefix)]


def partners(p) -> list:
    return sorted((t for t in p.tokens if t.location.startswith("partner_")), key=lambda t: t.location)


def universities(p) -> list:
    return sorted((t for t in p.tokens if t.location.startswith("university_")), key=lambda t: t.location)


def continent_of(t: Token) -> str:
    return t.type.split("-", 1)[1]


def university_class(kind: str) -> str:
    return kind if kind in UNIVERSITY_KINDS[:3] else "fac-generic"


def tile_icons(tile_type: str) -> Counter:
    """Icons a university tile puts into the zoo (research icons, and the animal category of a category university)."""
    out: Counter = Counter()
    if tile_type.startswith("fac-science-"):
        kind = tile_type.split("-", 2)[2]
        out["Science"] += 2 if kind == "science" else 1
        icon = {"bird": "Bird", "predator": "Predator", "herbivore": "Herbivore", "reptile": "Reptile", "primate": "Primate",
                "marine": "SeaAnimal"}.get(kind)
        if icon:
            out[icon] += 1
    return out


def free_space(tokens: list, prefix: str, maximum: int) -> int:
    used = {t.location for t in tokens}
    return next((k for k in range(1, maximum + 1) if f"{prefix}{k}" not in used), 0)


def strength_needed(p, task: str) -> int:
    """The action strength a task needs (Veterinarian, S203: supporting a conservation project only needs 4)."""
    if task == "conservation" and "S203" in p.sponsors:
        return 4
    return TASK_VALUE[task]


def workers_needed(p, task: str):
    on = len(bonuses.worker_tokens(p, f"association_{TASK_VALUE[task]}"))
    return 1 if on == 0 else 2 if on == 1 else None


def donation_count(state) -> int:
    return sum(1 for q in state.players for t in q.tokens if t.location in DONATION_SLOTS + (DONATION_OVERFLOW_SLOT,))


def donation_cost(state, p, x_discount: bool = False) -> int:
    n = donation_count(state)
    base = DONATION_COSTS[n] if n < len(DONATION_COSTS) else DONATION_OVERFLOW_COST
    if "S273" in p.sponsors:                                    # Publications: 1 less per science icon
        base = max(0, base - icon_counts(state, p.seat)["Science"])
    if x_discount:                                              # X Association (3), level II: 1 less per X token
        base = max(0, base - p.x_tokens)
    return base


def category_pool(state) -> list:
    """Category universities not yet taken by anybody."""
    taken = {t.type.split("-", 2)[2] for q in state.players for t in q.tokens if t.type.startswith("fac-science-") and t.type.count("-") == 2
             and t.type.split("-", 2)[2] in CATEGORY_TILES}
    return [c for c in CATEGORY_TILES if c not in taken and (c != "marine" or state.config.marine_worlds)]


# ---- projects ---------------------------------------------------------------------------------------------------------------------

def project(key: str, marine_worlds: bool) -> dict:
    card = data.cards_by_key()[key]
    if marine_worlds and card.get("variants", {}).get("marine_worlds"):
        card = {**card, **card["variants"]["marine_worlds"]}
    return card


def project_location(key: str, slot: int) -> str:
    """BGA's location of a token on a project: `P109_Reptiles_2` (card id + slot)."""
    name = "".join(w.capitalize() for w in re.split(r"[^A-Za-z]+", card_name(key)) if w)
    return f"{key}_{name}_{slot}"


def card_name(key: str) -> str:
    return data.cards_by_key()[key]["name"]


def supported_by(state, key: str) -> list:
    """(seat, slot) of every player token on the project."""
    out = []
    for q in state.players:
        for t in q.tokens:
            if t.location.startswith(key + "_") and t.type == "token":
                out.append((q.seat, int(t.location.rsplit("_", 1)[1])))
    return out


def project_count(state, seat: int, requirement: str) -> int:
    p = state.players[seat]
    icons = icon_counts(state, seat)
    cards = data.cards_by_key()
    if requirement == "all-animals":
        cats = ANIMAL_CATEGORIES + (("SeaAnimal",) if state.config.marine_worlds else ())
        return sum(1 for c in cats if icons[c])
    if requirement == "all-continents":
        return sum(1 for c in CONTINENTS if icons[c])
    if requirement == "animal-size-2":
        return sum(1 for k in p.animals if (cards[k].get("size") or 9) <= 2)
    if requirement == "animal-size-4":
        return sum(1 for k in p.animals if (cards[k].get("size") or 0) >= 4)
    if requirement in _ICON:
        return icons[_ICON[requirement]]
    raise NotImplementedError(f"project requirement {requirement!r}")


def project_supported(card: dict) -> bool:
    return card["type"] in ("Base", "Normal") and all(s["bonuses"] and s["bonuses"][0].get("bonusRequirement") for s in card["slots"])


def slot_options(state, seat: int, key: str, extra: int = 0) -> list:
    """Slots of the project the player can claim: [(slot index, conservation, reputation)]. `extra` = icons added by a bonus-icon token."""
    p = state.players[seat]
    card = project(key, state.config.marine_worlds)
    if not project_supported(card):
        raise NotImplementedError(f"conservation project {key} ({card['type']}) is not implemented yet")
    if any(t.location.startswith(key + "_") for t in p.tokens if t.type == "token"):
        return []                                                     # every project can be supported once
    taken = {s for _, s in supported_by(state, key)}
    if key in state.base_projects:
        taken.add(BLOCKED_BASE_SLOT[state.base_projects.index(key)])
    out = []
    for i, slot in enumerate(card["slots"]):
        if i in taken:
            continue
        # the card's `tag` names the icon; the slots of Habitat Diversity wrongly say 'all-animals' in the upstream data
        if project_count(state, seat, card.get("tag") or slot["bonuses"][0]["bonusRequirement"]) + extra >= slot["indicator"]:
            cons = sum(x["bonusValue"] for x in slot["bonuses"] if x["bonusType"] == "Conservation Point")
            rep = sum(x["bonusValue"] for x in slot["bonuses"] if x["bonusType"] == "Reputation")
            out.append((i, cons, rep))
    return out


def notepad_bonuses(state, p) -> list:
    """(index, bonus) of the notepad tokens still on the map."""
    slots = data.map_by_id(p.map_id)["geometry"]["bonus_slots"]
    used = p.flags.get("bonus_used", 0)
    return [(s["index"], s["bonus"]) for s in slots if not used >> s["index"] & 1 and s.get("bonus")]


# ---- the action --------------------------------------------------------------------------------------------------------------------

def open_action(state, seat: int, level: int, strength: int, variant: int = 0) -> None:
    from ark_nova.engine.state import Prompt
    state.prompt = Prompt(kind="association_tasks", player=seat, args={"level": level, "strength": strength, "left": strength, "done": [],
                                                                        "donated": False, "variant": variant})


# Association variants (cards `action_cards.json`): 1 Supply: partner zoos (level II: also universities) come from the supply, duplicates allowed;
# 2 Hire: at strength 5 a new worker instead of supporting a project; level II: extra workers on a task, 2 strength less for each;
# 3 X: an X token when the strength is above the task's, level II: donations cost 1 less per X token; 4 Self-clever: at strength 5 (level I) do
# nothing and perform another action, level II: a card from the deck or the display instead of the donation.
SUPPLY_UNIVERSITIES = ("fac-rep-hand", "fac-science-rep", "fac-science-science")
EXTRA_WORKER_STRENGTH = 2


def _extra_options(p, a, task: str) -> list:
    """Hire Association, level II: n extra workers lower the strength a task needs by 2 each."""
    if a.get("variant") != 2 or a["level"] < 2:
        return [0]
    need = workers_needed(p, task)
    if need is None:
        return [0]
    on = len(bonuses.worker_tokens(p, f"association_{TASK_VALUE[task]}"))
    return [n for n in range(0, 4) if on + need + n <= 3 and len(bonuses.worker_tokens(p, "reserve")) >= need + n]


def task_actions(state, p, a) -> list:
    acts = []
    level = a["level"]
    variant = a.get("variant", 0)
    for task, value in TASK_VALUE.items():
        if task in a["done"] or (level < 2 and a["done"]):
            continue
        need = workers_needed(p, task)
        if need is None:
            continue
        for extra in _extra_options(p, a, task):
            if max(1, strength_needed(p, task) - EXTRA_WORKER_STRENGTH * extra) > a["left"] or len(bonuses.worker_tokens(p, "reserve")) < need + extra:
                continue
            mark = {"extra": extra} if extra else {}
            if task == "reputation":
                acts.append(Action(p.seat, "association_task", {"task": task, **mark}))
            elif task == "partner":
                room = len(partners(p)) < (MAX_PARTNERS if level >= 2 else LEVEL_I_PARTNERS)
                mine = {continent_of(t) for t in partners(p)}
                if room and variant == 1:                       # from the supply, a continent that is already in the zoo too
                    acts += [Action(p.seat, "association_task", {"task": task, "continent": c, "supply": True, **mark}) for c in CONTINENTS]
                elif room:
                    for t in state.board_tokens:
                        if t.location == "association_3" and continent_of(t) not in mine:
                            acts.append(Action(p.seat, "association_task", {"task": task, "continent": continent_of(t), **mark}))
            elif task == "university":
                if len(universities(p)) < MAX_UNIVERSITIES:
                    mine = {university_class(t.type) for t in universities(p)}
                    if variant == 1 and level >= 2:             # from the supply: the tiles of the three kinds, even a kind the zoo has
                        acts += [Action(p.seat, "association_task", {"task": task, "kind": k, "supply": True, **mark}) for k in SUPPLY_UNIVERSITIES]
                    for t in state.board_tokens:
                        if t.location == "association_4" and university_class(t.type) not in mine:
                            acts.append(Action(p.seat, "association_task", {"task": task, "kind": t.type, **mark}))
            elif task == "conservation":
                for act in conservation_actions(state, p, level):
                    acts.append(Action(act.player, act.kind, {**act.args, **mark}))
                if variant == 2 and not extra:                  # Hire Association: a new worker instead of supporting a project (strength 5)
                    acts.append(Action(p.seat, "association_task", {"task": "hire"}))
    if variant == 4 and level == 1 and not a["done"] and a["strength"] >= 5:
        acts.append(Action(p.seat, "self_clever", {}))
    if a["done"] and level >= 2 and not a["donated"]:
        if donation_cost(state, p, variant == 3) <= p.money:
            acts.append(Action(p.seat, "donate", {}))
        if variant == 4:                                        # a card from the deck or the display instead of the donation
            acts.append(Action(p.seat, "take_instead", {}))
    if a["done"] and level >= 2:
        acts.append(Action(p.seat, "finish_association", {}))
    return acts


def conservation_actions(state, p, level: int) -> list:
    acts = []
    sources = [(k, "play", 0) for k in state.base_projects + state.projects_in_play]
    sources += [(k, "hand", 0) for k in sorted(set(p.hand)) if k.startswith("P") and k not in state.base_projects]
    if level >= 2:
        reach = state.display[:cards_action.reputation_range(p.reputation)]
        sources += [(k, "display", i + 1) for i, k in enumerate(reach) if k and k.startswith("P")]
    bonus_slots = notepad_bonuses(state, p)
    for key, src, cost in sources:
        if cost > p.money or not project_supported(project(key, state.config.marine_worlds)):        # release / breed / management: not implemented
            continue
        plain = slot_options(state, p.seat, key)
        for slot, cons, rep in plain:
            for j, _ in bonus_slots:
                acts.append(Action(p.seat, "association_task", {"task": "conservation", "project": key, "source": src, "slot": slot, "bonus": j}))
        if any(t.type == "bonus-icon" for t in p.tokens):          # a bonus-icon token counts as one more icon of the project
            for slot, cons, rep in slot_options(state, p.seat, key, extra=1):
                if (slot, cons, rep) not in plain:
                    for j, _ in bonus_slots:
                        acts.append(Action(p.seat, "association_task", {"task": "conservation", "project": key, "source": src, "slot": slot,
                                                                         "bonus": j, "icon": True}))
    return acts


def legal(state, p) -> list:
    return task_actions(state, p, state.prompt.args)


def do_task(state, action: Action) -> None:
    g, fx = _g(), _fx()
    p = state.players[action.player]
    a = state.prompt.args
    args = dict(action.args)
    category = args.pop("category", None)
    if Action(p.seat, "association_task", args) not in task_actions(state, p, a):
        raise fx.IllegalEffect(f"that association task is not possible: {args}")
    task = args["task"]
    kind = "conservation" if task == "hire" else task
    extra = int(args.get("extra", 0))
    need = workers_needed(p, kind)
    for w in bonuses.worker_tokens(p, "reserve")[:need + extra]:
        w.location = f"association_{TASK_VALUE[kind]}"
    paid = max(1, strength_needed(p, kind) - EXTRA_WORKER_STRENGTH * extra)
    a["left"] -= paid
    a["done"].append(kind)
    if a.get("variant") == 3 and a["level"] == 1 and a["strength"] > strength_needed(p, kind):      # X Association: strength above the task's
        g._gain(state, p.seat, x_tokens=1)
    if task == "hire":                                             # Hire Association: a new worker next to the one doing the task
        supply = bonuses.worker_tokens(p, "supply_")
        if not supply:
            raise fx.IllegalEffect("no worker left to hire")
        supply[0].location = "association_5"
    elif task == "reputation":
        g._gain(state, p.seat, reputation=2)
    elif task == "partner":
        if args.get("supply"):                                     # Supply Association: a new tile from the supply
            ids = [t.id for q in state.players for t in q.tokens] + [t.id for t in state.board_tokens]
            tok = Token(max(ids, default=0) + 1, f"partner-{args['continent']}", "association_3")
        else:
            tok = next(t for t in state.board_tokens if t.location == "association_3" and continent_of(t) == args["continent"])
            state.board_tokens.remove(tok)
        k = free_space(p.tokens, "partner_", MAX_PARTNERS)
        tok.location = f"partner_{k}"
        p.tokens.append(tok)
        space_bonuses(state, p, "partner", k)
        for eff in fx.fire_icon_counter(state, p.seat, Counter({continent_of(tok): 1})):
            bonuses.defer(state, eff)
    elif task == "university":
        if args.get("supply"):
            ids = [t.id for q in state.players for t in q.tokens] + [t.id for t in state.board_tokens]
            tok = Token(max(ids, default=0) + 1, args["kind"], "association_4")
        else:
            tok = next(t for t in state.board_tokens if t.location == "association_4" and t.type == args["kind"])
            state.board_tokens.remove(tok)
        if tok.type == "fac-generic":
            pool = category_pool(state)
            if category is not None and category not in pool:
                raise fx.IllegalEffect("that university is not left")
            if category is None:                                  # the tile is drawn at random from the bag
                rng = Rng(state.rng)
                category = pool[rng.randbelow(len(pool))]
                state.rng = rng.state
            tok.type = f"fac-science-{category}"
        k = free_space(p.tokens, "university_", MAX_UNIVERSITIES)
        tok.location = f"university_{k}"
        p.tokens.append(tok)
        rep = _TILE_REPUTATION.get(tok.type, 0)
        if rep:
            g._gain(state, p.seat, reputation=rep)
        space_bonuses(state, p, "university", k)
        cat =tok.type.split("-", 2)[2] if tok.type.count("-") == 2 else None
        if cat in CATEGORY_TILES:
            fx.search_for_category(state, p.seat, cat)
        for eff in fx.fire_icon_counter(state, p.seat, tile_icons(tok.type)):
            bonuses.defer(state, eff)
    elif task == "conservation":
        support_project(state, p, args)
    after_step(state, p.seat)


SET_MAPS = ("11", "12", "T1")            # maps where the upgrades come with a *set* of partner zoo + university (see space_bonuses)


def space_bonuses(state, p, kind: str, k: int) -> None:
    """Bonuses of the zoo-map space that a partner zoo / university has just been placed on (`k` = its space, counted after placing).

    Most maps: an upgrade for the 2nd partner zoo and for the 2nd university. Map 11 (Caves): one upgrade for the first set (partner zoo +
    university) and one for the third worker (see `bonuses.hire_worker`); maps 12 (AI) and T1: one upgrade for the first set and one for
    the second; map 11 also gives 1 conservation for the third set. 3rd partner zoo: hire a worker. 4th partner zoo / 3rd university:
    conservation points that depend on the map."""
    g = _g()
    n_p, n_u = len(partners(p)), len(universities(p))
    old_p, old_u = n_p - (kind == "partner"), n_u - (kind == "university")
    upgrade = {"kind": "upgrade", "player": p.seat, "optional": False}
    if p.map_id not in SET_MAPS:
        if k == 2:
            bonuses.defer(state, dict(upgrade, source=f"second {kind}"))
    else:
        old_min, new_min = min(old_p, old_u), min(n_p, n_u)
        if new_min > old_min and new_min <= (1 if p.map_id == "11" else 2):
            bonuses.defer(state, dict(upgrade, source=f"set {new_min}"))
        if p.map_id == "11" and new_min > old_min and new_min == 3:
            g._gain(state, p.seat, conservation=1)
    if kind == "partner":
        if k == 3:
            bonuses.hire_worker(state, p.seat)
        elif k == 4:
            g._gain(state, p.seat, conservation=map_bonus(p.map_id, "partner4"))
    elif k == 3:
        g._gain(state, p.seat, conservation=map_bonus(p.map_id, "university3"))


def support_project(state, p, args: dict) -> None:
    g, fx = _g(), _fx()
    key, src, slot, j = args["project"], args["source"], int(args["slot"]), int(args["bonus"])
    card = project(key, state.config.marine_worlds)
    if args.get("icon"):
        p.tokens.remove(next(t for t in p.tokens if t.type == "bonus-icon"))
    if src == "hand":
        p.hand.remove(key)
    elif src == "display":
        i = state.display.index(key)
        p.money -= i + 1
        state.display[i] = None
    if src in ("hand", "display"):
        state.projects_in_play.insert(0, key)
        while len(state.projects_in_play) > PROJECTS_IN_PLAY:
            gone = state.projects_in_play.pop()
            for q in state.players:
                q.tokens = [t for t in q.tokens if not (t.location.startswith(gone + "_") and t.type == "token")]
            state.main_discard.append(gone)
    ids = [t.id for q in state.players for t in q.tokens]
    p.tokens.append(Token(max(ids, default=0) + 1, "token", project_location(key, slot)))
    _, cons, rep = next(o for o in slot_options_with(state, p.seat, key, slot))
    g._gain(state, p.seat, conservation=cons, reputation=rep)
    bonus = dict(notepad_bonuses(state, p))[j]
    p.flags["bonus_used"] = p.flags.get("bonus_used", 0) | (1 << j)
    bonuses.apply_bonus(state, p.seat, {bonus["type"]: bonus["value"]})


def slot_options_with(state, seat: int, key: str, slot: int):
    """The (slot, conservation, reputation) entry of one slot, ignoring that the token has just been placed."""
    card = project(key, state.config.marine_worlds)
    s = card["slots"][slot]
    cons = sum(x["bonusValue"] for x in s["bonuses"] if x["bonusType"] == "Conservation Point")
    rep = sum(x["bonusValue"] for x in s["bonuses"] if x["bonusType"] == "Reputation")
    yield (slot, cons, rep)


def make_donation(state, p, x_discount: bool = False) -> None:
    """Pay the smallest visible donation, cover its space with a player token and gain 1 conservation point."""
    n = donation_count(state)
    cost = donation_cost(state, p, x_discount)
    if cost > p.money:
        raise _fx().IllegalEffect("not enough money")
    p.money -= cost
    loc = DONATION_SLOTS[n] if n < len(DONATION_SLOTS) else DONATION_OVERFLOW_SLOT
    ids = [t.id for q in state.players for t in q.tokens]
    p.tokens.append(Token(max(ids, default=0) + 1, "token", loc))
    _g()._gain(state, p.seat, conservation=1)


def donate(state, action: Action) -> None:
    p = state.players[action.player]
    a = state.prompt.args
    if not a["done"] or a["level"] < 2 or a["donated"]:
        raise _fx().IllegalEffect("no donation possible now")
    make_donation(state, p, a.get("variant") == 3)
    a["donated"] = True
    after_step(state, p.seat)


def self_clever(state, action: Action) -> None:
    """Self-clever Association (level I, strength 5): do nothing, the card goes to slot 1, and another action follows."""
    fx = _fx()
    a = state.prompt.args
    if Action(action.player, "self_clever", {}) not in task_actions(state, state.players[action.player], a):
        raise fx.IllegalEffect("no self-clever now")
    state.current_action["extra"] = {"types": [t for t in ("animals", "build", "cards", "sponsors")], "optional": False}
    _g()._end_turn(state)


def take_instead(state, action: Action) -> None:
    """Self-clever Association, level II: a card from the deck or the display instead of the donation (at least one task was done)."""
    p = state.players[action.player]
    a = state.prompt.args
    if Action(p.seat, "take_instead", {}) not in task_actions(state, p, a):
        raise _fx().IllegalEffect("no card instead of a donation now")
    a["donated"] = True
    g = _g()
    if not g._open_effects(state, p.seat, [{"kind": "take", "source": "association4", "optional": False}], {"kind": "association_tasks", "args": a}):
        after_step(state, p.seat)


def finish(state, action: Action) -> None:
    if not state.prompt.args["done"]:
        raise _fx().IllegalEffect("perform a task first")
    _g()._end_turn(state)


def after_step(state, seat: int) -> None:
    """A task or donation is done: resolve what it triggered, then go on (upgraded action) or end the turn."""
    g = _g()
    a = state.prompt.args
    p = state.players[seat]
    if g._open_effects(state, seat, [], {"kind": "association_tasks", "args": a}):
        return
    if a["level"] < 2 or not task_actions(state, p, a) or all(x.kind == "finish_association" for x in task_actions(state, p, a)):
        g._end_turn(state)
