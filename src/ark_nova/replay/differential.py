"""Differential test of the rules engine against the log-driven replay, one turn at a time.

For every supported turn: start from the replay state at the turn marker, apply the engine actions derived from the log, require
each action to be one of `legal_actions` at that point, and compare the engine state after the turn with the replay state at
the next marker (only the fields the engine implements). During a Build action the engine's legal placements are also compared
with BGA's own list of legal placements (state 30) after every step. Unsupported turns are counted by reason and skipped, so
the coverage grows with the engine.
"""
import copy
import re
from collections import Counter
from dataclasses import dataclass, field

from ark_nova import data
from ark_nova.engine import map_rules
from ark_nova.engine.actions import Action
from ark_nova.engine.build_action import SIZES, knows_shape
from ark_nova.engine.game import IllegalAction, apply, legal_actions
from ark_nova.engine.state import GameState, Phase, Prompt
from ark_nova.parser.model import ParsedLog
from ark_nova.replay import actions as _actions_module
from ark_nova.replay.actions import parse_action_type, turn_actions, turn_events
from ark_nova.replay.builder import Replay


@dataclass
class TurnResult:
    """What the engine did with one turn: `ok` (replayed and equal to the log), `mismatch` (replayed, state differs), `illegal` (a logged
    action is not legal for the engine) or `skipped` (not supported yet). `trace` = (move index or None, event order or None, engine state after the action, whether the test added the action itself)
    for every engine action of the turn; `end` is the state after the turn when `ok`."""
    status: str
    detail: str = ""
    trace: list = field(default_factory=list)
    last_turn: int = 0                                     # the turn marker this result ends at (Multiplier turns are merged)


@dataclass
class DiffReport:
    turns: int = 0
    checked: int = 0                                       # turns replayed by the engine and compared
    skipped: Counter = field(default_factory=Counter)      # reason -> turns
    illegal: list[str] = field(default_factory=list)       # logged action not in legal_actions / rejected
    mismatches: list[str] = field(default_factory=list)    # engine state differs from the replay state
    checked_kinds: Counter = field(default_factory=Counter)   # action kind -> number of compared actions
    placement_lists: int = 0                               # BGA legal-placement lists compared with the engine's
    project_lists: int = 0                                 # BGA lists of supportable projects compared with the engine's
    results: dict = field(default_factory=dict)            # turn index -> TurnResult


def marks_of(state: GameState) -> list:
    from ark_nova.engine import marks
    return marks.all_marks(state)


def project(state: GameState) -> dict:
    """The part of the state the engine implements (extended as rules are added)."""
    return {
        "players": [{"hand": sorted(p.hand), "money": p.money, "appeal": p.appeal, "reputation": p.reputation,
                     "conservation": p.conservation, "x_tokens": p.x_tokens,
                     "action_cards": [(c.type, c.variant, c.level, tuple(sorted(c.tokens))) for c in p.action_cards],
                     "buildings": sorted((b.type, b.x, b.y, b.rotation, bool(b.animal), len(b.animals)) for b in p.buildings), "animals": sorted(p.animals), "icons": p.icons, "marks": [m for m in marks_of(state) if m[0] == p.seat], "under": {k: sorted(v) for k, v in p.under.items()},
                     "tokens": sorted((t.type, t.location) for t in p.tokens if _tracked_token(t))} for p in state.players],
        "display": list(state.display), "main_deck": list(state.main_deck), "main_discard": sorted(state.main_discard),
        "projects_in_play": list(state.projects_in_play),
        "break_position": state.break_position, "round": state.round, "active_player": state.active_player, "turn": state.turn,
    }


def _tracked_token(t) -> bool:
    """Tokens the engine implements: workers, partner zoos, universities, tokens on projects and on the donation spaces."""
    return (t.type in ("worker", "bonus-icon", "bonus-increased-hand", "bonus-sponsor-gray", "bonus-extra-shift", "bonus-ignore-conditions") or t.type.startswith(("partner-", "fac-"))
            or (t.type == "token" and (t.location.startswith("association_0_") or re.match(r"P\d+_.*\d$", t.location) is not None
                                   or t.location.startswith(("S215_", "S218_", "S253_")))))


def _diff(a, b, path="") -> list[str]:
    """Differences between the engine's projection `a` and the replay's `b`, one readable line each: "<what> - engine: ...; replay: ..."."""
    if isinstance(a, dict):
        if not isinstance(b, dict):
            return [f"{_where(path)}: engine {a}; replay {b}"]
        return [d for k in a.keys() | b.keys() for d in (_diff(a[k], b[k], f"{path}.{k}") if k in a and k in b
                else [f"{_where(path)}.{k}: engine {a.get(k)}; replay {b.get(k)}"])]
    if isinstance(a, list) and a and isinstance(a[0], dict):
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in _diff(x, y, f"{path}[{i}]")]
    if a == b:
        return []
    return [f"{_where(path)}: {_describe(path, a, b)}"]


def _where(path: str) -> str:
    """".players[1].action_cards" -> "player 1, action cards"."""
    m = re.match(r"\.players\[(\d+)\]\.(\w+)", path)
    if m:
        return f"player {m.group(1)}, {m.group(2).replace('_', ' ')}"
    return path.lstrip(".").replace("_", " ")


def _action_name(c) -> str:
    t, variant, level, tokens = c
    return t + (" II" if level >= 2 else "") + (f" v{variant}" if variant else "") + (f" +{'/'.join(tokens)}" if tokens else "")


def _describe(path: str, a, b) -> str:
    if path.endswith(".action_cards"):                              # the five action cards, slot 1 first
        ea, eb = [_action_name(c) for c in a], [_action_name(c) for c in b]
        if sorted(ea) == sorted(eb):
            for x in ea:                                            # one card moved and the others kept their order?
                if [y for y in ea if y != x] == [y for y in eb if y != x]:
                    return (f"{x} is in slot {ea.index(x) + 1} in the engine but slot {eb.index(x) + 1} in the replay (the other cards keep their order)"
                            f"  [engine: {', '.join(ea)} | replay: {', '.join(eb)}]")
            return f"same cards, other order  [engine: {', '.join(ea)} | replay: {', '.join(eb)}]"
        return f"engine: {', '.join(ea)} | replay: {', '.join(eb)}"
    if isinstance(a, list) and isinstance(b, list):
        extra_e, extra_r = list((Counter(map(str, a)) - Counter(map(str, b))).elements()), list((Counter(map(str, b)) - Counter(map(str, a))).elements())
        if not extra_e and not extra_r:
            return f"same entries, other order  [engine: {a} | replay: {b}]"
        out = []
        if extra_e:
            out.append("only in the engine: " + ", ".join(extra_e))
        if extra_r:
            out.append("only in the replay: " + ", ".join(extra_r))
        return "; ".join(out)
    if isinstance(a, dict) and isinstance(b, dict):
        keys = [k for k in sorted(set(a) | set(b), key=str) if a.get(k) != b.get(k)]
        return "; ".join(f"{k}: engine {a.get(k)!r}, replay {b.get(k)!r}" for k in keys)
    return f"engine {a!r}, replay {b!r}"


def engine_placements(state: GameState) -> dict:
    out: dict = {}
    for a in legal_actions(state):
        if a.kind == "place_building":
            out.setdefault(a.args["type"], []).append((a.args["x"], a.args["y"], a.args["rotation"]))
    return {t: sorted(set(v)) for t, v in out.items()}


class _Stop(Exception):
    pass


def _placement_types(state: GameState, act: Action) -> Counter:
    """The placement bonus types that the building of `act` covers (before it is placed)."""
    from ark_nova.engine import build_action
    from ark_nova.engine.board import board
    bd = board(state.players[act.player].map_id)
    cells = build_action.footprint(act.args["type"], act.args["x"], act.args["y"], act.args.get("rotation", 0))
    return Counter(b["type"] for c in cells for b in bd.bonuses.get(c, []) if b)


_ARCH_TAKEN: list = []       # the bonuses that `_archaeologist` picked for the turn that is being replayed


def _archaeologist(state: GameState, act: Action, events: list, expected: Counter, ap) -> GameState:
    """Archeologist (S221): the log does not name the extra placement bonus that the player chose, only its effect: find an uncovered
    hex with that bonus and resolve the pending choice with it."""
    from ark_nova.engine import bonuses as bon
    from ark_nova.engine.board import board
    if state.prompt is None or state.prompt.kind != "effects" or not any(e["kind"] == "archaeologist" for e in state.prompt.args["pending"]):
        return state
    seat = act.player
    start = next((i for i, e in enumerate(events) if e.type == "buyBuilding" and isinstance(e.args, dict) and "building" in e.args
                  and (e.args["building"]["x"], e.args["building"]["y"], e.args["building"]["type"]) == (act.args["x"], act.args["y"], act.args["type"])), None)
    if start is None:
        return state
    extra: Counter = Counter()                        # BGA names the chosen bonus with a takeBonus that has no source ("gets 1 x reputation")
    for e in events[start + 1:]:
        if e.type == "buyBuilding" or (e.type == "actionCardCleanup" and "Clever" not in e.log):
            break
        a = e.args if isinstance(e.args, dict) else {}
        if e.type == "takeBonus" and not a.get("source"):
            bd_args = (a.get("bonus_desc") or {}).get("args") or {}
            bt = bd_args.get("bonus_type")
            if bt:
                extra[(bt, bd_args.get("bonus_n"))] += 1
    bd = board(state.players[seat].map_id)
    for (typ, amount), n in extra.items():
        for _ in range(n):
            if state.prompt is None or state.prompt.kind != "effects":
                return state
            i = next((i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "archaeologist"), None)
            if i is None:
                return state
            cell = next((c for c in bon.archaeologist_cells(state, state.players[seat])
                        if any(b and b["type"].replace("-", "").lower() == {"extrashift": "worker", "map10": "digging"}.get(str(typ).replace("-", "").lower(), str(typ).replace("-", "").lower())
                               and (amount is None or b["type"] not in ("money", "xtoken", "reputation") or b["value"] == amount) for b in bd.bonuses[c])), None)
            if cell is None:
                break                                      # (not a bonus of a hex: the choice at conservation 5 / 8 is logged the same way)
            state = ap(state, Action(seat, "choose_effect", {"index": i, "cell": list(cell)}))
            _ARCH_TAKEN.append((str(typ), amount))                  # (the plan still holds the log's "gets 1 x <bonus>" as an action: it is this pick)
    return state


def _fit_income_slots(state: GameState, events: list, seat_of: dict) -> None:
    """The map income slots a player has used are known from the bonuses BGA pays in a break: the replay's notepad guess can be wrong
    (a snap or a building of a supported project does not say which slot it came from)."""
    if not any(e.type == "startBreak" for e in events):
        return
    seen: dict = {}
    for e in events[[e.type for e in events].index("startBreak"):]:
        a = e.args if isinstance(e.args, dict) else {}
        bd = ((a.get("bonus_desc") or {}).get("args") or {})
        if e.type == "takeBonus" and a.get("source") == "map bonus space" and bd.get("bonus_type") and a.get("player_id") is not None:
            seen.setdefault(seat_of[str(a["player_id"])], []).append((str(bd["bonus_type"]).lower().replace("-", "").replace("_", ""), bd.get("bonus_n")))
    supports: dict = {}
    for e in events:                                          # (a project supported in this turn covers one of the income slots itself: the break pays it, but the support has not used it yet: 877649220 turn 27)
        if e.type == "startBreak":
            break
        if e.type == "slideMeeples" and isinstance(e.args, dict) and "supports a conservation project" in str(e.log) and e.args.get("player_id") is not None and str(e.args["player_id"]) in seat_of:
            supports[seat_of[str(e.args["player_id"])]] = supports.get(seat_of[str(e.args["player_id"])], 0) + 1
    for seat, got in seen.items():
        got = got[:max(0, len(got) - supports.get(seat, 0))]
        p = state.players[seat]
        slots = data.map_by_id(p.map_id)["geometry"]["bonus_slots"]
        income = [s for s in slots if s["kind"] == "instant_income" and s.get("bonus")]
        used = p.flags.get("bonus_used", 0)
        for s in income:
            used &= ~(1 << s["index"])
        for kind, n in got:
            for s in income:
                if not used >> s["index"] & 1 and s["bonus"]["type"].lower().replace("-", "").replace("_", "") == kind and (n is None or s["bonus"]["value"] == n):
                    used |= 1 << s["index"]
                    break
        p.flags["bonus_used"] = used


def _needs_a_token(state: GameState, act: Action) -> bool:
    """The animal fails a condition that nothing but the ignore-conditions token (or Ignore Animals) would cover: not the Research Institute of map 6 / 6a, Waza Large,
    Camouflage."""
    from ark_nova.engine import animals_action as aa, sponsor_extras
    p = state.players[act.player]
    failed = aa.failed_conditions(state, act.player, act.args["card"], state.prompt.args["level"])
    if not failed:
        return False
    if aa.institute_connected(p) and len(failed) == 1:
        return False
    if "S263" in p.sponsors and sponsor_extras.size_class(aa.card(act.args["card"])) == "large" and len(failed) == 1:
        return False
    if state.current_action is not None and state.current_action.get("camouflage") and len(failed) == 1:
        return False
    return True


def _plain(act: Action) -> Action:
    """The action as `legal_actions` lists it: the category of a category university is a chance outcome, not a choice."""
    if act.args.get("mark") or "also" in act.args or "shown" in act.args or "trigger" in act.args:
        return Action(act.player, act.kind, {k: v for k, v in act.args.items() if k not in ("mark", "also", "shown", "trigger")})
    return act


def _flip_take(state: GameState, act: Action) -> Action:
    for mode in ("snap", "range"):                        # BGA words a snap and a take within the reputation range alike: the card is what counts
        alt = Action(act.player, act.kind, {"mode": mode, "card": act.args["card"]})
        if alt in legal_actions(state):
            return alt
    return act


_UPCOMING: list = [[]]      # the actions that follow the one being normalised (set by the replay loop): lets an ambiguous threshold choice look ahead


def _threshold_option_has(state, e: dict, bonus_type: str, n) -> bool:
    j_all = state.conservation_options[str(e["t"])]
    return any(bonus_type in o and (o[bonus_type] or 0) == (n or 0) for o in list(j_all) + [{"money": 5}])


def _normalise(state: GameState, act: Action, end=None) -> Action:
    """The log does not say which pending effect a choice belongs to (or which notepad bonus a project took): find it among the legal
    actions."""
    if "psrc" in act.args:                                # a pouched card: the log names the card it goes under
        src = act.args["psrc"]
        act = Action(act.player, act.kind, {k: v for k, v in act.args.items() if k != "psrc"})
        if state.prompt is not None and state.prompt.kind == "effects":
            for cand in legal_actions(state):
                if cand.kind == "choose_effect" and cand.args.get("card") == act.args.get("card") and "index" in cand.args and state.prompt.args["pending"][cand.args["index"]].get("source") == src                         and state.prompt.args["pending"][cand.args["index"]]["kind"] == "pouch":
                    return cand
    if act.kind == "choose_effect" and "release" in act.args and "building" in act.args and state.prompt is not None and state.prompt.kind == "effects"             and not any(c.kind == "choose_effect" and c.args.get("release") == act.args["release"] and c.args.get("building") == act.args["building"] for c in legal_actions(state)):
        for cand in legal_actions(state):                  # the aquariums of a zoo share their spaces: BGA names the aquarium the animal sits in, the engine keeps it in one of them (820534913 turn 56)
            if cand.kind == "choose_effect" and cand.args.get("release") == act.args["release"] and cand.args.get("index") == act.args.get("index", cand.args.get("index"))                     and any(b.type.endswith("aquarium") and [b.x, b.y] == list(act.args["building"]) for b in state.players[act.player].buildings):
                return cand
    if act.kind == "donate" and state.prompt is not None and state.prompt.kind == "effects" and _plain(act) not in legal_actions(state):
        for cand in legal_actions(state):                  # the donation of a sponsor (Publications ...) is logged like the donation of the Association action
            if cand.kind == "choose_effect" and "donate" in cand.args and state.prompt.args["pending"][cand.args["index"]]["kind"] == "donation":
                return cand
    if act.kind == "play_animal" and not act.args.get("stored") and _plain(act) not in legal_actions(state) \
            and Action(act.player, act.kind, {**act.args, "stored": True}) in legal_actions(state):
        return Action(act.player, act.kind, {**act.args, "stored": True})         # map 11: played directly from the storage
    if act.kind == "play_sponsor" and state.prompt is not None and state.prompt.kind == "effects" and _plain(act) not in legal_actions(state):
        mk = [i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "marketing"]
        if not getattr(_normalise, "cube_used", False) and any(not state.prompt.args["pending"][i].get("cube") for i in mk):
            mk = [i for i in mk if not state.prompt.args["pending"][i].get("cube")]            # (the cube of an Okapi Stable only when the log shows it used)
        alt = Action(act.player, "choose_effect", {"index": mk[0] if mk else -1, "card": act.args["card"]})
        if alt in legal_actions(state):                     # a Marketing effect (placement bonus / bonus token): the log shows an ordinary sponsor play
            return alt
    if act.kind == "take_cards" and act.args.get("card") and _plain(act) not in legal_actions(state):
        if act.args.get("mode") == "range" and state.prompt is not None and state.prompt.kind == "effects" and any(
                e["kind"] == "gain" and e["res"] == "reputation" for e in state.prompt.args["pending"]):
            return act                                    # the reputation gain (pending) brings the take within the range: the card does not belong to a Snapping
        return _flip_take(state, act)
    if act.kind == "choose_effect" and "boost" in act.args and end is not None and state.prompt is not None and state.prompt.kind == "effects":          # Boost: slot 1 or 5, read off the final order
        order = [c.type for c in end.players[act.player].action_cards]
        where = order.index(act.args["boost"])
        if act.args.get("position") in (1, 5):                                              # (the log names the slot of this very Boost: several Boosts of one action share the final order)
            where = 0 if act.args["position"] == 1 else len(order) - 1
        if 0 < where < len(order) - 1 and not act.args.get("position"):                                                      # neither on slot 1 nor on slot 5: the Boost was declined
            for j, e in enumerate(state.prompt.args["pending"]):
                if e["kind"] == "boost" and e.get("type") == act.args["boost"]:
                    return Action(act.player, "skip_effect", {"index": j})
        slot = 5 if where == len(order) - 1 and where != 0 else 1
        for cand in legal_actions(state):
            if cand.kind == "choose_effect" and cand.player == act.player and cand.args.get("slot") == slot                     and state.prompt.args["pending"][cand.args["index"]].get("type") == act.args["boost"]:
                return cand
        return act
    if act.kind == "choose_effect" and "drawn" in act.args and state.prompt is not None:          # Scavenging: the cards the log drew
        for e in state.prompt.args["pending"]:
            if e["kind"] == "scavenge":
                state.main_discard += e["cards"]
                for c in act.args["drawn"]:
                    if c in state.main_discard:
                        state.main_discard.remove(c)
                e["cards"] = list(act.args["drawn"])
                act = Action(act.player, act.kind, {"keep": act.args["keep"]})
                break
    if act.kind == "choose_effect" and "card" in act.args and "index" not in act.args and "mark" not in act.args and state.prompt is not None and state.prompt.kind == "effects"             and not getattr(_normalise, "cube_used", False):
        pend = state.prompt.args["pending"]
        cands = [c for c in legal_actions(state) if c.kind == "choose_effect" and c.args.get("card") == act.args["card"] and "index" in c.args]
        if str(act.args["card"]).startswith("S") and any(pend[c.args["index"]]["kind"] == "marketing" for c in cands):
            cands = [c for c in cands if pend[c.args["index"]]["kind"] == "marketing"]        # (a sponsor of the hand: Marketing, not a Pouch of the same card)
        if len(cands) > 1:                                  # several Marketing effects: the one of an Okapi Stable cube only when the log shows the cube used
            free = [c for c in cands if not pend[c.args["index"]].get("cube")]
            if free:
                return free[0]
    if act.kind == "choose_effect" and "worker" in act.args and state.prompt is not None and state.prompt.kind == "effects" and _plain(act) not in legal_actions(state):
        cands = [c for c in legal_actions(state) if c.kind == "choose_effect" and c.player == act.player and isinstance(c.args.get("worker"), int)]
        if cands and not any(c.args["worker"] == act.args["worker"] for c in cands):      # (the workers on the board are interchangeable: BGA's id of the one just used may be another one in the engine)
            return sorted(cands, key=lambda c: c.args["worker"] < 9000)[0] if len(cands) == 1 or any(c.args["worker"] >= 9000 for c in cands) else cands[0]
    if act.kind == "choose_effect" and "building_id" in act.args:                                # Cut Down: the building by its id
        b = next((b for b in state.players[act.player].buildings if b.id == act.args["building_id"]), None)
        if b is not None:
            act = Action(act.player, act.kind, {"building": [b.x, b.y]})
    if act.kind == "association_task" and "workers" in act.args:        # Hire Association, level II: the workers beyond what the task needs are extra
        from ark_nova.engine.association import TASK_VALUE, workers_needed
        kind = act.args["task"]
        n = int(act.args["workers"]) - (workers_needed(state.players[act.player], kind) or 0)
        args = {k: v for k, v in act.args.items() if k != "workers"}
        act = Action(act.player, act.kind, {**args, **({"extra": n} if n > 0 else {})})
    if act.kind == "association_task" and isinstance(act.args.get("bonus"), dict):
        from ark_nova.engine.association import notepad_bonuses
        want = act.args["bonus"]
        p = state.players[act.player]
        if "slot" in want:                                  # the bonus left no trace in the log: the keyword space of the map
            for j, b in notepad_bonuses(state, p):
                adapt_logged = any(x.kind == "choose_effect" and "discard" in x.args for x in _UPCOMING[0])          # (Adapt 3 of map 13 shows its draw and discard in the log)
                if j == want["slot"] and b["type"] not in ("reputation", "money", "xtoken", "appeal", "Worker") and (b["type"] != "bonus-scoring-cards" or adapt_logged):
                    return Action(act.player, act.kind, {**act.args, "bonus": j})
            for j, b in notepad_bonuses(state, p):          # a bonus that was unlocked and declined leaves no trace: Cut Down (map 13) is optional
                if b["type"] == "cut-down" and want["slot"] == 3:
                    return Action(act.player, act.kind, {**act.args, "bonus": j})
            for j, b in notepad_bonuses(state, p):          # reputation at the top of the track: the bonus shows only as the appeal of "maxing out reputation" (map A, 801090816 turn 74)
                from ark_nova.engine import bonuses as _bon
                if b["type"] == "reputation" and getattr(_normalise, "maxing", False) and p.reputation + 6 >= _bon.reputation_cap(p):          # (the project's own reputation may come first)
                    return Action(act.player, act.kind, {**act.args, "bonus": j})
            for j, b in notepad_bonuses(state, p):          # (the keyword space is a bonus with a visible effect on this map: the trace is the card taken)
                if b["type"] == "take-in-range-or-deck":
                    return Action(act.player, act.kind, {**act.args, "bonus": j})
            for j, b in notepad_bonuses(state, p):
                if j == want["slot"]:
                    return Action(act.player, act.kind, {**act.args, "bonus": j})
            return act
        for j, b in notepad_bonuses(state, p):
            if b["type"] == want["type"] and ("value" not in want or b["value"] == want["value"]):
                return Action(act.player, act.kind, {**act.args, "bonus": j})
        for j, b in notepad_bonuses(state, p):                  # the logged gain is capped by the track (X tokens 5, reputation 15): the bonus may be bigger
            if b["type"] == want["type"] and b["type"] in ("xtoken", "reputation", "money", "appeal") and b["value"] >= want.get("value", 0):
                return Action(act.player, act.kind, {**act.args, "bonus": j})
        if any(x.kind == "take_cards" and x.args.get("mode") == "snap" for x in _UPCOMING[0][:4]):
            for j, b in notepad_bonuses(state, p):              # the logged bonus came from elsewhere (a threshold of the conservation track): the notepad bonus is the Snapping that follows (877649220 turn 27)
                if b["type"] == "Snapping":
                    return Action(act.player, act.kind, {**act.args, "bonus": j})
        return act
    if act.kind == "choose_effect" and "continent" in act.args and "bonus_type" in act.args and state.prompt is not None and state.prompt.kind == "effects":
        from ark_nova.engine.map_rules import CONTINENT_BONUSES
        for cand in legal_actions(state):                       # map 9: the bonus that BGA names is one of the 5 depicted
            if cand.kind == "choose_effect" and cand.args.get("continent") == act.args["continent"] and "pick" in cand.args:
                bb = CONTINENT_BONUSES[cand.args["pick"]]
                if act.args["bonus_type"] in bb and bb[act.args["bonus_type"]] == act.args["n"]:
                    return cand
        return act
    if act.kind == "choose_effect" and "bonus_type" in act.args and state.prompt is not None and state.prompt.kind == "effects":
        for cand in legal_actions(state):
            if cand.kind == "choose_effect" and "rep_bonus" in cand.args:
                b = state.conservation_options["99"][cand.args["rep_bonus"]]
                if act.args["bonus_type"] in b and (b[act.args["bonus_type"]] or 0) == (act.args.get("n") or 0):
                    return cand
        for cand in legal_actions(state):
            if cand.kind == "choose_effect" and "option" in cand.args:
                e = state.prompt.args["pending"][cand.args["index"]]
                opts = state.conservation_options[str(e["t"])]
                j = cand.args["option"]
                if (({"money": 5} if j == len(opts) else opts[j]).get(act.args["bonus_type"]) or 0) == (act.args.get("n") or 0)                         and act.args["bonus_type"] in ({"money": 5} if j == len(opts) else opts[j]):
                    nxt = next((x for x in _UPCOMING[0] if x.kind == "choose_effect" and "bonus_type" in x.args and "continent" not in x.args), None)
                    others = [o for i, o in enumerate(state.prompt.args["pending"]) if i != cand.args["index"] and o["kind"] == "threshold_bonus"]
                    if nxt is not None and others and not any(_threshold_option_has(state, o, nxt.args["bonus_type"], nxt.args.get("n")) for o in others) and any(
                            _threshold_option_has(state, e, nxt.args["bonus_type"], nxt.args.get("n")) for _ in [0]):
                        continue                                        # the next choice only exists at this threshold: this one takes the other (shared) bonus
                    return cand
        return act
    if act.kind != "choose_effect" or "index" in act.args or state.prompt is None or state.prompt.kind != "effects":
        return act
    want = _plain(act).args
    found = [cand for cand in legal_actions(state) if cand.kind == "choose_effect" and {k: v for k, v in cand.args.items() if k != "index"} == want]
    if "type" in want:                                              # a Clever (slot 1): the effect of the player the log names (both players have one in the break: 814075010 turn 58)
        mine_ = [cand for cand in found if cand.player == act.player]
        found = mine_ or found
    if "trigger" in act.args and len(found) > 1:                      # the trigger of this sponsor
        src_ = [cand for cand in found if state.prompt.args["pending"][cand.args["index"]].get("source") == act.args["trigger"] and cand.player == act.player]
        found = src_ or found
    if "shown" in act.args and len(found) > 1:                      # the reveal effect that shows this many cards (a Scuba Dive 3 of the sponsor and the animal's own Scuba Dive X: 842580036 turn 57)
        same_ = [cand for cand in found if state.prompt.args["pending"][cand.args["index"]].get("x") == act.args["shown"]]
        found = same_ or found
    if "upgrade" in want and len(found) > 1:             # an upgrade of its own comes before the (more flexible) choice at conservation 2
        found.sort(key=lambda c: state.prompt.args["pending"][c.args["index"]]["kind"] != "upgrade")
    if str(want.get("card", "")).startswith("S") and len(found) > 1:             # a sponsor of the hand: Marketing (it can also be pouched, but the log then shows a pouch)
        found.sort(key=lambda c: state.prompt.args["pending"][c.args["index"]]["kind"] != "marketing")
    if found and "also" in act.args:
        return Action(found[0].player, found[0].kind, {**found[0].args, "also": act.args["also"]})
    return found[0] if found else act


def _fits(effect: dict, act) -> bool:
    if act is None:
        return False
    k = effect["kind"]
    if act.kind == "place_building":
        return k == "build" and act.args["type"] in effect.get("types", [effect["type"]])
    if act.kind == "take_cards":
        return k == "take"
    if act.kind == "choose_effect":
        a = act.args
        return (("waza" in a and k == "waza") or ("remove" in a and k == "reposition") or ("boost" in a and k == "boost")
                or ("keep" in a and k == "reveal") or ("cards" in a and k == "sell") or ("type" in a and k == "slot1")
                or ("card" in a and k in ("pouch", "search_discard", "assertion", "mark", "marketing") and (k == "mark" or not a.get("mark"))) or ("donate" in a and k == "donation")
                or (("hand" in a or "display" in a) and k == "digging") or ("keep" in a and k == "scavenge") or ("gain" in a and k == "glide_gain")
                or ("cards" in a and k in ("glide", "shark")) or ("trade" in a and k == "trade") or (("building" in a or "building_id" in a) and "x" not in a and k == "cut_down") or ("building" in a and "x" in a and k == "enlarge") or ("apply" in a and a["apply"] == "reef" and k == "reef") or (("send" in a or "scuba" in a or ("keep" in a and (a["keep"] is None or str(a["keep"]).startswith("S")))) and k == "expedition")
                or ("worker" in a and k == "extra_shift") or ("discard" in a and k == "adapt") or ("animal" in a and k == "symbiosis")
                or (("give" in a or "pay" in a) and k == "pilfer") or ("apply" in a and k in ("venom", "constrict", "gain"))
                or ("activate" in a and k == "ability") or (a.get("apply") == k and k in ("hypnosis", "pay_appeal")) or ("rep_bonus" in a and k == "rep_bonus") or ("move" in a and k == "move_in") or ("store" in a and k == "store") or ("continent" in a and k == "continent") or ("multiplier" in a and k == "multiplier"))
    return False


def _below_cap(state: GameState, e: dict) -> bool:
    from ark_nova.engine import bonuses as _b
    p = state.players[e.get("player", state.prompt.player)]
    return p.reputation < _b.reputation_cap(p)


def _kiosk_income_first(state: GameState, act):
    """A player without kiosk income in the log: BGA settled it (0) right after the appeal income, before the free buildings of the map bonus; the engine would pay it for a kiosk built
    meanwhile (832292660 turn 50)."""
    if act is None or act.kind in ("skip_effect",) or state.prompt is None or state.prompt.kind != "effects" or (act.kind == "choose_effect" and str(act.args.get("apply", "")).startswith("income")):
        return None
    if not any(x.kind == "place_building" and x.args.get("type") == "kiosk" and x.player == act.player for x in [act] + list(getattr(_skip_unneeded, "rest", []))):
        return None                                          # (only when a kiosk of the player is still to be built in this turn)
    pend = state.prompt.args["pending"]
    for i, e in enumerate(pend):
        if e["kind"] == "income_kiosk" and e.get("player") not in getattr(_skip_unneeded, "kiosk_logged", {e.get("player")})                 and not any(o["kind"] == "income_appeal" and o.get("player") == e.get("player") for o in pend[:i]) and e.get("player") == act.player and not any(b.type == "kiosk" for b in state.players[e["player"]].buildings):
            return Action(act.player, "choose_effect", {"index": i, "apply": "income_kiosk"})
    return None


def _rep_before_income(state: GameState, act):
    """The log pays the appeal of a reputation that overflows (the track's 15) before the appeal income, which counts it: resolve those effects first (806276023 turn 51)."""
    if act is None or act.kind != "choose_effect" or act.args.get("apply") != "income_appeal" or state.prompt is None or state.prompt.kind != "effects":
        return None
    order = getattr(_skip_unneeded, "order", None)
    if order is None or not any(o < order for o in getattr(_skip_unneeded, "maxing", [])):
        return None
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "gain" and e["res"] == "reputation" and e.get("player", act.player) == act.player and str(e.get("source", ""))[:1] == "S":
            return Action(act.player, "choose_effect", {"index": i, "apply": "gain", "res": "reputation"})
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "rep_bonus" and e.get("player", act.player) == act.player:
            return Action(act.player, "skip_effect", {"index": i})
    return None


def _skip_unneeded(state: GameState, act):
    """`skip_effect` for the first optional pending effect that the next logged action does not use."""
    pb = [i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "pbonus"]
    if pb:                                                    # several placement bonuses of one building: the log shows them in the order the player chose (the one after which the logged action is legal)
        def resolve(i_):
            e_ = state.prompt.args["pending"][i_]
            return Action(e_["player"], "choose_effect", {"index": i_, "apply": "pbonus", "bonus": e_["bonus"]["type"]})
        if act is not None:
            for i in pb:
                try:
                    trial = apply(state, resolve(i))
                    ok = trial.prompt is not None and _plain(_normalise(trial, act)) in legal_actions(trial)
                except Exception:
                    ok = False
                if ok:
                    return resolve(i)
        return resolve(pb[0])
    rest = []
    for x in ([] if act is not None and act.kind == "choose_action_card" else getattr(_skip_unneeded, "rest", [])):                     # (what follows in the same action: a Multiplier repetition starts another one)
        if x.kind == "choose_action_card":
            break
        rest.append(x)
    for i, e in enumerate(state.prompt.args["pending"]):
        if e.get("optional") and not _fits(e, act) and not (not (act is not None and act.kind == "play_animal") and (e["kind"] in ("build", "digging", "sell", "ability", "marketing", "pay_appeal", "take", "cut_down", "donation", "expedition", "venom", "constrict") or (e["kind"] == "pouch" and (e.get("source") == "map" or (act is not None and act.kind == "take_cards" and act.args.get("mode") == "snap")))
                                                              or (e["kind"] == "slot1" and act is not None and act.kind == "use_token")
                                                              or (e["kind"] == "extra_shift" and act is not None and act.kind in ("choose_effect", "take_cards", "place_building") and "worker" not in act.args)) and any(_fits(e, x) and x.player == e.get("player", x.player) for x in (rest if e["kind"] != "marketing" else [y for y in rest if y.kind == "choose_effect" and str(y.args.get("card", "")).startswith("S")]))):      # (a later action of the turn may still use it; Marketing: only the choice of a sponsor card)
            return Action(e.get("player", state.prompt.player), "skip_effect", {"index": i})
    legal = None
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "extra_shift":                                   # nothing left to take back (the second placement bonus of Excavation Site ...): the logs show nothing
            legal = legal if legal is not None else legal_actions(state)
            if not any(x.kind == "choose_effect" and x.args.get("index") == i for x in legal) and not (act is not None and act.kind == "choose_effect" and "worker" in act.args):
                return Action(e.get("player", state.prompt.player), "skip_effect", {"index": i})
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "break_discard" and act is not None and not (act.kind == "choose_effect" and "cards" in act.args):          # the hand is already within the limit
            sk = Action(e["player"], "skip_effect", {"index": i})
            if sk in legal_actions(state):
                return sk
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "take_tile" and not (act is not None and "university" in act.args):          # nothing left on the board to take (805030443 turn 74): the engine offers the skip
            sk = Action(e.get("player", state.prompt.player), "skip_effect", {"index": i})
            if sk in legal_actions(state):
                return sk
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "endgame_discard" and state.players[e["player"]].endgame_hand:      # the logs show the discards later, if at all
            hand = state.players[e["player"]].endgame_hand
            logged = [x.args["card"] for x in getattr(_skip_unneeded, "future", []) if x.player == e["player"] and x.args.get("card") in hand]      # (the card that the log discards later)
            return Action(e["player"], "choose_effect", {"index": i, "card": logged[0] if logged else hand[0]})
    for i, e in enumerate(state.prompt.args["pending"]):
        if (e["kind"] == "gain" and e["res"] == "reputation" and not (e.get("per") and _adds_icons(act)) and not (act is not None and act.args.get("res") == "reputation")
                and not (_below_cap(state, e) and str(e.get("source", ""))[:1] in ("A", "S") and any(x.kind == "choose_effect" and x.args.get("apply") == "gain" and x.args.get("res") == "reputation" and x.player == e.get("player", x.player)
                                                      for x in getattr(_skip_unneeded, "rest", [])))      # (the log gains it later: the plan has an action for it)
                and (act is not None and act.kind == "take_cards"
                     or not any(o["kind"] in ("upgrade", "threshold2", "threshold_bonus") and o.get("player", state.prompt.player) == e.get("player", state.prompt.player) for o in state.prompt.args["pending"])
                     or not any(x.kind == "choose_effect" and x.args.get("apply") == "gain" and x.args.get("res") == "reputation" for x in getattr(_skip_unneeded, "rest", [])))):      # (an upgrade of the Cards action may still lift the cap of 9)
            return Action(e.get("player", state.prompt.player), "choose_effect", {"index": i, "apply": "gain", "res": "reputation"})      # at the cap BGA logs nothing
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "gain" and e.get("per_pavilion") and not (act is not None and act.args.get("res") == "appeal") and not any(
                x.kind == "choose_effect" and x.args.get("apply") == "gain" and x.args.get("res") == "appeal" for x in getattr(_skip_unneeded, "rest", [])[:3]):
            return Action(e.get("player", state.prompt.player), "choose_effect", {"index": i, "apply": "gain", "res": "appeal"})      # (Landscape Gardener: no pavilion yet, BGA logs no gain)
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "gain" and e["res"] == "appeal" and not e.get("per_pavilion") and state.players[e.get("player", state.prompt.player)].appeal >= 113 and not (act is not None and act.args.get("res") == "appeal"):
            return Action(e.get("player", state.prompt.player), "choose_effect", {"index": i, "apply": "gain", "res": "appeal"})      # at the end of the appeal track BGA logs nothing
        if e["kind"] == "gain" and e["res"] == "xtoken" and state.players[e.get("player", state.prompt.player)].x_tokens >= 5 and not (act is not None and act.args.get("res") == "xtoken"):
            return Action(e.get("player", state.prompt.player), "choose_effect", {"index": i, "apply": "gain", "res": "xtoken"})      # at the cap of 5 BGA logs nothing
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "pilfer" and not __import__("ark_nova.engine.animal_abilities", fromlist=["x"]).pilfer_hits(state, e) and not (act is not None and ("give" in act.args or "pay" in act.args)):
            return Action(e["player"], "choose_effect", {"index": i, "nothing": True})        # the victim is not behind (any more): the log shows nothing
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "archaeologist" and not (act is not None and "cell" in act.args):
            return Action(e["player"], "skip_effect", {"index": i})                    # the pick leaves no trace in the log (a bonus without an effect)
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "search_sponsor" and not (act is not None and act.args.get("apply") == "search_sponsor") and not any(
                x.kind == "choose_effect" and x.args.get("apply") == "search_sponsor" for x in getattr(_skip_unneeded, "rest", [])):
            return Action(e["player"], "choose_effect", {"index": i, "apply": "search_sponsor"})          # (no draw is logged: nothing found)
        if e["kind"] == "search_category":
            return Action(e["player"], "choose_effect", {"index": i, "apply": "search_category"})          # (the log shows only the card that was found)
        if e["kind"] == "income_map" and not (act is not None and act.args.get("apply") == "income_map") and not any(x.kind == "choose_effect" and x.args.get("apply") == "income_map" and x.player == e.get("player", x.player) for x in getattr(_skip_unneeded, "rest", [])):
            return Action(e["player"], "choose_effect", {"index": i, "apply": "income_map"})        # (nothing is logged for an income of 0)
        if e["kind"] == "income_kiosk" and not (act is not None and act.args.get("apply") == "income_kiosk") and not any(x.kind == "choose_effect" and x.args.get("apply") == "income_kiosk" and x.player == e.get("player", x.player) for x in getattr(_skip_unneeded, "rest", [])):
            return Action(e["player"], "choose_effect", {"index": i, "apply": "income_kiosk"})
        if e["kind"] == "income_appeal" and not (act is not None and act.args.get("apply") == "income_appeal") and not any(x.kind == "choose_effect" and x.args.get("apply") == "income_appeal" and x.player == e.get("player", x.player) for x in getattr(_skip_unneeded, "rest", [])):
            return Action(e["player"], "choose_effect", {"index": i, "apply": "income_appeal"})       # (nothing is logged for an income of 0)
        if e["kind"] == "income_sponsor" and not (act is not None and act.args.get("apply") == "income_sponsor" and act.args.get("source") == e["source"])                 and not any(x.kind == "choose_effect" and x.args.get("apply") == "income_sponsor" and x.args.get("source") == e["source"] and x.player == e["player"]
                            for x in getattr(_skip_unneeded, "rest", [])):                          # (a sponsor income that the log names later keeps its place in the order)
            return Action(e["player"], "choose_effect", {"index": i, "apply": "income_sponsor", "source": e["source"]})
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "pilfer" and not (act is not None and ("give" in act.args or "pay" in act.args or "nothing" in act.args)):
            nothing = Action(e.get("player", state.prompt.player), "choose_effect", {"index": i, "nothing": True})
            if nothing in legal_actions(state):
                return nothing                                   # a Pilfering that hits nobody leaves no trace in the log (894764261 turn 82)
    return _project_effect(state, act)


def _dominance_without_project(events) -> bool:
    """A Dominance animal is played in this turn and the log shows no base project taken with it (814842703 turn 72, 820206282 turn 61)."""
    cards = data.cards_by_key()
    played = any(e.type == "buyAnimal" and isinstance(e.args, dict) and isinstance(e.args.get("card"), dict)
                 and any(((a.get("keyword") or {}).get("name") == "Dominance") for a in cards.get(data.parse_bga_card_id(e.args["card"]["id"])[0], {}).get("abilities", []))
                 for e in events)
    return played and not any(e.type == "pDrawCards" and "with Dominance" in e.log for e in events)


def _project_rep_before_sponsor(events) -> bool:
    """The log pays the reputation of a supported project (counted per icons) before it plays a sponsor: the sponsor's icons do not count for it (865382491 turn 66)."""
    skip = ("increasing card strength", "reputation track bonus", "maxing out reputation", "triggering break", "placement bonus", "map bonus space")
    rep = next((i for i, e in enumerate(events) if e.type == "getBonuses" and isinstance(e.args, dict) and set(e.args.get("bonuses") or {}) == {"reputation"}
                and not e.args.get("card_id") and e.args.get("source") and e.args.get("source") not in skip), None)
    spons = next((i for i, e in enumerate(events) if e.type == "playSponsor"), None)
    return rep is not None and spons is not None and rep < spons


def _adds_icons(act) -> bool:
    """The next logged action plays a sponsor (a Marketing choice, a token): the icons it adds count for an effect that is counted when it is resolved."""
    if getattr(_skip_unneeded, "rep_first", False):
        return False
    def one(a) -> bool:
        return a.kind in ("use_token", "play_sponsor") or (a.kind == "choose_effect" and "card" in a.args)
    if act is None:                                  # (the effects right after the choice of a project: look at what the turn still does)
        return any(one(x) for x in getattr(_skip_unneeded, "rest", []))
    return one(act)


def _project_effect(state: GameState, act=None):
    """The next effect of a supported project that the log only shows through its results (gains, the notepad bonus, a tutor search)."""
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "gain" and e["res"] == "reputation" and not (e.get("per") and _adds_icons(act)) and any(o["kind"] in ("project_bonus", "upgrade", "take_tile", "threshold2", "threshold_bonus") for o in state.prompt.args["pending"])                 and not (act is not None and act.kind == "take_cards"):
            continue                                       # (BGA pays the reputation of a new project last, after the upgrades the project's bonus brings)
        if e["kind"] == "gain" and e.get("per") and _adds_icons(act):
            continue                                       # (counted when resolved: a sponsor that the log plays first counts)
        if e["kind"] == "gain" and (e["source"][:1] == "P" or e["source"] == "S224"):
            return Action(state.prompt.player, "choose_effect", {"index": i, "apply": "gain", "res": e["res"]})
        if e["kind"] == "jumping":                                          # the log shows its results (the break token, the money) as lines of their own
            return Action(state.prompt.player, "choose_effect", {"index": i, "apply": "jumping"})
        if e["kind"] == "tutor" and any(x.kind == "choose_effect" and x.args.get("apply") == "tutor" for x in ([act] if act is not None else []) + list(getattr(_skip_unneeded, "rest", []))):
            continue                                       # (the log names it later: the display refills of the digging before it come first)
        if e["kind"] in ("project_bonus", "tutor"):
            return Action(state.prompt.player, "choose_effect", {"index": i, "apply": e["kind"]})
        if e["kind"] == "reef":
            from ark_nova.engine.project_effects import _reef_aquariums
            if _reef_aquariums(state, state.prompt.player):
                return Action(state.prompt.player, "choose_effect", {"index": i, "apply": "reef"})
    return None


def _symbiosis_for(state: GameState, act):
    """The Symbiosis choice after which the logged action is legal (the ability of another sea animal that the log shows being used)."""
    if not any(e["kind"] == "symbiosis" for e in state.prompt.args["pending"]):
        return None
    if act.kind == "play_animal":                                # the next animal can be played after skipping it: nothing in the log says it was used (819962687 turn 64)
        i_ = next(i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "symbiosis")
        skip_ = Action(state.prompt.args["pending"][i_].get("player", state.prompt.player), "skip_effect", {"index": i_})
        if skip_ in legal_actions(state) and _plain(_normalise(apply(state, skip_), act)) in legal_actions(apply(state, skip_)):
            return None
    cands = sorted(legal_actions(state), key=lambda c: c.args.get("ability") != "Marketing" if str(act.args.get("card", "")).startswith("S") else 0)      # (a sponsor of the hand: the copied ability is Marketing, not a Pouch)
    for cand in cands:
        if cand.kind == "choose_effect" and "animal" in cand.args and state.prompt.args["pending"][cand.args["index"]]["kind"] == "symbiosis":
            trial = apply(state, cand)
            for _ in range(4):                                  # (the effects of the ability that are declined: a pouch ...)
                if trial.prompt is None or trial.prompt.kind != "effects" or _plain(_normalise(trial, act)) in legal_actions(trial):
                    break
                nxt = next((i for i, e in enumerate(trial.prompt.args["pending"]) if e.get("optional") and e["kind"] != "symbiosis"), None)
                if nxt is None:
                    break
                trial = apply(trial, Action(trial.prompt.player, "skip_effect", {"index": nxt}))
            if _plain(_normalise(trial, act)) in legal_actions(trial):
                return cand
    return None


def _mark_extra_building(state: GameState, seat: int, acts: list, events: list) -> list:
    """Pavilion / Kiosk Build: when the buildings of the turn are more than the strength allows, the first pavilion / kiosk is the additional one."""
    from ark_nova.engine.game import EXTRA_TYPE
    ch = next((e for e in events if e.type == "chooseActionCard"), None)
    if ch is None or not acts or acts[0].kind != "choose_action_card" or acts[0].args["type"] != "build":
        return acts
    variant = parse_action_type(ch.args["actionCard"]["type"])[1]
    if variant not in EXTRA_TYPE:
        return acts
    from ark_nova.engine.build_action import SIZES
    placed_ = [x for x in acts if x.kind == "place_building" and not any(e.type == "buyBuilding" and isinstance(e.args, dict) and "for free" in __import__("ark_nova.replay.view", fromlist=["render_log"]).render_log(e.log, e.args)
                                                                           and (e.args["building"]["x"], e.args["building"]["y"], e.args["building"]["type"]) == (x.args.get("x"), x.args.get("y"), x.args.get("type")) for e in events)]
    fits_strength = False          # (the buildings of the turn fit the strength: none was the additional one: 823017370 turn 40)
    out, done = [], fits_strength
    for a in acts:
        free = any(e.type == "buyBuilding" and isinstance(e.args, dict) and "for free" in __import__("ark_nova.replay.view", fromlist=["render_log"]).render_log(e.log, e.args) and (e.args["building"]["x"], e.args["building"]["y"], e.args["building"]["type"])
                   == (a.args.get("x"), a.args.get("y"), a.args.get("type")) for e in events) if a.kind == "place_building" else False       # ("adds a Kiosk for free": a bonus building, not the additional one of the action)
        paid = next((e.args.get("amount_money") for e in events if e.type == "buyBuilding" and isinstance(e.args, dict) and e.args.get("building")
                     and (e.args["building"]["x"], e.args["building"]["y"], e.args["building"]["type"]) == (a.args.get("x"), a.args.get("y"), a.args.get("type"))), None) if a.kind == "place_building" else None
        level = ch.args["actionCard"].get("level", 1)
        priced_plain = level == 1 and paid is not None and paid != 3             # (at level I the additional kiosk / pavilion costs 3, the ordinary one 2: the price says which it was)
        if a.kind == "place_building" and not done and not free and a.args["type"] == EXTRA_TYPE[variant] and not a.args.get("extra") and not priced_plain:
            a, done = Action(a.player, a.kind, {**a.args, "extra": True}), True
        out.append(a)
    return out


def _bga_project_options(events: list, actor: str, before: int = None):
    """BGA's own list of the projects the player can support with the Association action and the slots of each (the private state of the move):
    the last list before the event of order `before` (the support move), else the first one of the turn."""
    found = None
    for e in events:
        if before is not None and e.order >= before:
            break
        if e.type == "gameStateChangePrivateArg" and isinstance(e.args, dict) and isinstance(e.args.get("slots"), list) and str(e.player) == actor:
            found = None                                    # (a later list without the projects: the last one is stale, the zoo changed since)
        if e.type == "gameStateChangePrivateArg" and isinstance(e.args, dict) and isinstance(e.args.get("slots"), dict) and str(e.player) == actor:
            opts = (e.args["slots"].get("5") or {}).get("options")
            if isinstance(opts, dict):
                found = {_card_key(k): sorted(x["id"] if isinstance(x, dict) else x for x in v) for k, v in opts.items()}      # (release: {id, animalIds})
                if before is None:
                    return found
    return found


def _card_key(bga_id: str) -> str:
    return bga_id[:4]


def _engine_project_options(state: GameState, seat: int) -> dict:
    """The same list from the engine: every project of the sources the player can use, with its free slots (without the icon tokens)."""
    from ark_nova.engine import association
    p = state.players[seat]
    level = max((c.level for c in p.action_cards if c.type == "association"), default=1)
    out = {}
    for act in association.conservation_actions(state, p, level):
        key = act.args["project"]
        card = association.project(key, state.config.marine_worlds)
        slots = {i for i, _, _ in association.slot_options(state, seat, key)}
        if association.extra_icon_sources(state, p, card):           # BGA's list counts a token of Breeding Cooperation / Program as an icon,
            slots |= {i for i, _, _ in association.slot_options(state, seat, key, extra=1)}       # not the bonus-icon token of the notepad
        slots = sorted(slots)
        if slots:
            out[key] = slots
    return out


def _is_repetition(events: list) -> bool:
    """The turn starts with a chooseActionCard that uses a Multiplier token."""
    first = next((e for e in events if e.type in ("chooseActionCard", "actionCardCleanup")), None)
    return first is not None and first.type == "chooseActionCard" and any(e.type == "discardTokens" and "multiplier" in e.log for e in events)


def _is_tail(prev: list, events: list) -> bool:
    """BGA re-enters the turn state in the middle of a turn: the next "turn" is just the cleanup of the card that the previous one chose."""
    chose = next((e for e in prev if e.type == "chooseActionCard"), None)
    real = [e for e in events if not e.type.startswith("gameStateChange")]
    if not real or any(e.type == "chooseActionCard" for e in real) or real[0].type != "actionCardCleanup":
        return False
    if chose is None:                                   # a skipped action: the X token comes in a "turn" of its own
        prev_real = [e for e in prev if not e.type.startswith("gameStateChange")]
        return (len(prev_real) == 1 and prev_real[0].type == "getBonuses" and prev_real[0].args.get("bonuses") == {"xtoken": 1}
                and str(prev_real[0].args.get("player_id")) == str(real[0].args.get("player_id")))
    return str(real[0].args.get("player_id")) == str(chose.args.get("player_id")) and not any(e.type == "actionCardCleanup" for e in prev)


def _future_mark(turns: list, k: int, actor: str, consumed: set):
    """BGA logs the mark of an action only after a later action of the player: the first markCard of `actor` after turn k that no earlier turn has used
    (the order of the event is added to `consumed`: that turn leaves it out)."""
    for j in range(k + 1, min(len(turns), k + 8)):
        for e in turns[j]:
            if e.type == "markCard" and e.order not in consumed and isinstance(e.args.get("cards"), dict) and str(e.args.get("player_id")) == actor:
                consumed.add(e.order)
                return next(iter(e.args["cards"]))[:4]
        if any(e.type == "chooseActionCard" and str(e.args.get("player_id")) == actor for e in turns[j]):
            break                                         # (after the player's next action: a mark logged later belongs to another effect)
    return None


def _next_mark(turns: list, k: int):
    """The card of a markCard event at the start of turn k+1 (before its chooseActionCard)."""
    if k + 1 >= len(turns):
        return None
    for e in turns[k + 1]:
        if e.type == "chooseActionCard":
            return None
        if e.type == "markCard":
            if any(x.type == "actionCardCleanup" for x in turns[k + 1][:turns[k + 1].index(e)]):         # (after the hypnotised action of the opponent: the replay state has it later)
                _next_mark.late = True
            return next(iter(e.args["cards"]))[:4] if isinstance(e.args.get("cards"), dict) else None
    return None


def _placement_diff(mine: dict, theirs: dict) -> str:
    out = []
    for t in sorted(set(mine) | set(theirs)):
        a, b = set(mine.get(t, [])), set(map(tuple, theirs.get(t, [])))
        if a != b:
            out.append(f"{t}: engine-only {sorted(a - b)[:3]} bga-only {sorted(b - a)[:3]}")
    return "; ".join(out[:2])


def _result(rep: DiffReport, counts: tuple, trace: list, last: int):
    """The outcome of the turn just run, read off what it added to the report (None: nothing happened, e.g. a repeated marker)."""
    if sum(rep.skipped.values()) > counts[0]:
        reason = next((r for r, n in rep.skipped.items() if n > counts[4][r]), "")
        return TurnResult("skipped", reason, [], last)
    if len(rep.illegal) > counts[1]:
        return TurnResult("illegal", rep.illegal[-1], list(trace), last)
    if len(rep.mismatches) > counts[2]:
        return TurnResult("mismatch", rep.mismatches[-1], list(trace), last)
    if rep.checked > counts[3]:
        return TurnResult("ok", "", list(trace), last)
    return None


def run_differential(parsed: ParsedLog, replay: Replay, seat_of: dict[str, int], chain: bool = False) -> DiffReport:
    """`chain`: a turn that the engine replayed and that matched the log starts the next turn from the engine's own state (instead of the
    log-built snapshot), so a good stretch of turns is played by the engine alone. `DiffReport.results` has one `TurnResult` per turn."""
    rep = DiffReport()
    inserted = [True]                            # False while a logged action is applied: the others (skips, automatic gains) are added by the test
    cur_move = [None, None]                      # (move index, event order) of the logged action being applied
    trace: list = []

    def ap(state: GameState, act: Action) -> GameState:
        new = apply(state, act)
        trace.append((cur_move[0], cur_move[1], new, inserted[0]))
        return new

    carry: tuple = (None, None)                  # (turn index, engine state at its start)
    turns = turn_events(parsed)
    markers = parsed.turn_markers
    snaps = replay.turn_snapshots
    move_of = {e.order: m.index for m in parsed.moves for e in m.events}
    build_checks: dict[int, list[dict]] = {}
    for m in parsed.moves:
        for c in m.checks:
            if "build" in c and c["player"] == c["active"]:
                build_checks.setdefault(m.index, []).append(c)
    consumed_marks: set = set()
    deferred_mark = [False]
    merged: set = set()                      # Multiplier: BGA logs every repetition as a turn of its own (no cleanup of the card before the last one)
    span: dict = {}
    for k in range(len(turns)):
        j = k
        if k not in merged and k + 1 < len(turns) and turns[k] and all(e.type == "pDiscardCards" and "Map T1 effect" in e.log for e in turns[k]):
            merged.add(k + 1)                # map T1: the discard for +1 strength is logged in a turn of its own, before the card is chosen
            j = k + 1
        while k not in merged:
            nj = j + 1                                      # (the next turn with events: BGA leaves empty markers between the parts of a turn)
            while nj < len(turns) and not any(not e.type.startswith("gameStateChange") for e in turns[nj]):
                nj += 1
            if nj >= len(turns) or not ((_is_repetition(turns[nj]) and not any(e.type == "actionCardCleanup" for e in turns[j])) or _is_tail(turns[j], turns[nj])):
                break
            merged.update(range(j + 1, nj + 1))
            j = nj
        span[k] = j
        if j > k:
            turns[k] = [e for i in range(k, j + 1) for e in turns[i]]
            for i in range(k + 1, j + 1):
                turns[i] = []
    for k, events in enumerate(turns):
        counts = (sum(rep.skipped.values()), len(rep.illegal), len(rep.mismatches), rep.checked, Counter(rep.skipped))
        trace.clear()
        cur_move[:] = [None, None]
        again = False
        deferred_mark[0] = False
        _actions_module.CONSUMED_MARKS = consumed_marks
        try:
            if k >= len(snaps):
                break
            last = span.get(k, k)
            endsnap = snaps[last + 1] if last + 1 < len(snaps) else replay.states[-1]
            if not events or all(e.type.startswith("gameStateChange") or e.type == "playerConcedeGame" for e in events):                       # a repeated state-20 marker (BGA re-enters the state without anything happening)
                continue
            rep.turns += 1
            actor = next((str(e.args["player_id"]) for e in events if e.type in ("chooseActionCard", "actionCardCleanup")), markers[k][1])
            if actor != markers[k][1]:           # e.g. a turn where BGA logs the other player's card (odd skipped turns)
                rep.skipped["actor differs from the turn marker"] += 1
                continue
            seat = seat_of[actor]
            nxt_events = next((turns[j] for j in range(last + 1, len(turns)) if any(not e.type.startswith("gameStateChange") for e in turns[j])), [])      # (the next turn with events: BGA leaves empty markers between)
            again = any(e.type == "chooseActionCard" and str(e.args["player_id"]) == actor for e in nxt_events[:6])       # the same player acts again right away
            queued = carry[0] == k and carry[1] is not None and carry[1].prompt is not None and (carry[1].prompt.args.get("carry") or {}).get("extra")      # (the next action is an extra action of another animal, not a notepad bonus)
            _normalise.cube_used = any(e_.type == "discardTokens" and any(str(m_.get("location", "")).startswith("S253") for m_ in (e_.args.get("meeples") or [])) for e_ in events)
            _normalise.maxing = any(e_.type == "getBonuses" and isinstance(e_.args, dict) and e_.args.get("source") == "maxing out reputation" for e_ in events)          # (the notepad bonus of reputation shows only as this appeal)
            plan = turn_actions(events, seat, seat_of, move_of, snaps[k].config.peaceful, again and not queued, extra_follows=again)
            if isinstance(plan, str):
                rep.skipped[plan] += 1
                continue
            acts = plan.actions
            state = copy.deepcopy(carry[1] if carry[0] == k else snaps[k])
            _fit_income_slots(state, events, seat_of)
            if any(a_.kind == "choose_action_card" and a_.args.get("t1") for a_ in acts) and state.players[seat].map_id == "T1":
                state.players[seat].flags["bonus_used"] = state.players[seat].flags.get("bonus_used", 0) | 1          # (the T1 discard needs the card space of the notepad)
            if any(a.kind == "choose_action_card" and a.args["type"] == "build" for a in acts) and not state.config.map_known[seat]:
                rep.skipped["build turn of a player whose map could not be inferred"] += 1
                continue
            if any(a.kind == "play_animal" for a in acts) and not state.config.map_known[seat]                 and any(data.cards_by_key()[a.args["card"]].get("rock") or data.cards_by_key()[a.args["card"]].get("water") for a in acts if a.kind == "play_animal"):
                rep.skipped["animal with a rock / water condition of a player whose map could not be inferred"] += 1
                continue
            if any(a.kind == "choose_action_card" and a.args["type"] == "association" for a in acts) \
                    and not state.config.map_known[seat]:      # (the map decides the zoo-map bonuses of the Association action too)
                rep.skipped["build turn of a player whose map could not be inferred"] += 1
                continue
            if any(a.kind == "choose_action_card" and a.args["type"] == "build" for a in acts) and                 any(not knows_shape(b.type) for b in state.players[seat].buildings):
                rep.skipped["build turn with sponsor buildings of unknown shape on the map"] += 1
                continue
            ch = next((e for e in events if e.type == "chooseActionCard"), None)
            if ch is not None:                   # the logged card strength includes Venom / Constriction / hypnosis modifiers: not supported yet
                owner = state.players[1 - seat if acts[0].args.get("hypnosis") else seat]
                slot = [c.type for c in owner.action_cards].index(acts[0].args["type"]) + 1
                if slot != int(ch.args["actionCard"]["strength"]):
                    rep.skipped["strength modifier (venom / constriction / hypnosis)"] += 1
                    continue
                unpaid = acts[0].args.pop("unpaid", 0)
                if unpaid != map_rules.strength_bonus(state.players[seat], slot):         # map 12: the concealed strength numbers
                    rep.skipped["strength above the slot that the engine does not explain"] += 1
                    continue
            acts = _mark_extra_building(state, seat, acts, turns[k])
            kept = {x: y for x, y in (state.prompt.args if state.prompt is not None and state.prompt.kind == "choose_action_card" else {}).items() if x == "carry"}      # (a Clever that waits for the end of the extra action)
            state.phase = Phase.TURN
            state.current_action = None
            state.active_player = seat
            state.prompt = Prompt(kind="choose_action_card", player=seat, args={**({"hypnosis": True, "optional": True} if acts[0].args.get("hypnosis") else {}), **kept})
            oracle_notes: list[str] = []
            _skip_unneeded.rest = []
            _skip_unneeded.rep_first = _project_rep_before_sponsor(turns[k])
            search_orders = [e.order for e in turns[k] if e.type == "pDrawCards" and "gaining a new university" in e.log]          # (the search of a category university is logged before the effect the harness is about to resolve: 846710292 turn 55)
            _skip_unneeded.maxing = [e.order for e in turns[k] if e.type == "getBonuses" and isinstance(e.args, dict) and e.args.get("source") == "maxing out reputation"]
            _skip_unneeded.order = None
            _skip_unneeded.kiosk_logged = {seat_of[str(e.args["player_id"])] for e in turns[k] if e.type == "getBonuses" and isinstance(e.args, dict) and e.args.get("source") == "kiosk income"
                                           and str(e.args.get("player_id")) in seat_of}
            if _dominance_without_project(turns[k]):                  # BGA gave no project: it was in play or somebody else had it (the log only lists what a player could support)
                state.base_projects_unused = [x for x in state.base_projects_unused if x != "P108"]
            _ARCH_TAKEN.clear()
            _skip_unneeded.future = [x for x in acts if x.kind == "choose_effect" and str(x.args.get("card", "")).startswith("F")]
            try:
                items = list(zip(acts, plan.moves, plan.orders))
                if "S228" in state.players[seat].sponsors:         # Waza Small Animal Program: its snap comes at the end of the action, after the Digging that BGA logs later
                    for j in range(len(items) - 1):
                        x, y = items[j][0], items[j + 1][0]
                        if x.kind == "take_cards" and x.args.get("mode") == "snap" and y.kind == "choose_effect" and ("hand" in y.args or "display" in y.args or ("card" in y.args and "mark" not in y.args) or (
                                y.args.get("apply") == "gain" and not any(z[0].kind in ("play_animal", "take_cards") for z in items[j + 2:]))):          # (the last animal's own gain is logged after the snap: 883300517 turn 40)
                            items[j], items[j + 1] = items[j + 1], items[j]
                    acts = [x[0] for x in items]
                for ai, (act, mv, order) in enumerate(items):
                    cur_move[:] = [mv, order]
                    if act.kind == "magnet_note":                 # the log shows a magnet ability being used: when it is a Symbiosis copy, choose it
                        sym = next((x for x in legal_actions(state) if state.prompt is not None and state.prompt.kind == "effects" and x.kind == "choose_effect" and x.args.get("ability") == act.args["ability"]
                                    and state.prompt.args["pending"][x.args["index"]]["kind"] == "symbiosis"), None)
                        if sym is not None:
                            state = ap(state, sym)
                        continue
                    _skip_unneeded.rest = acts[ai + 1:]
                    _skip_unneeded.order = order
                    if act.kind == "choose_action_card" and "unpaid" in act.args:         # (the repetition of a Multiplier action: the strength bonus of the map was checked for the first one)
                        act = Action(act.player, act.kind, {x: y for x, y in act.args.items() if x != "unpaid"})
                    if act.kind == "choose_effect" and act.args.get("apply") in ("tutor", "reef") and not (state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] == act.args["apply"] for e in state.prompt.args["pending"])):
                        continue                                 # (the search was resolved earlier with the effects around it)
                    if act.kind == "choose_effect" and "keep" in act.args and state.prompt is not None and state.prompt.kind == "effects"                             and (not any(e["kind"] == "reveal" for e in state.prompt.args["pending"]) or (act.args["keep"] is not None and not any(c.kind == "choose_effect" and c.args.get("keep") == act.args["keep"] for c in legal_actions(state)))
                                                                                                                                              or ("shown" in act.args and not any(e["kind"] == "reveal" and e.get("x") == act.args["shown"] for e in state.prompt.args["pending"]))) and any(e["kind"] == "expedition" for e in state.prompt.args["pending"]):
                        ei = next(j for j, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "expedition")
                        state = ap(state, Action(state.prompt.args["pending"][ei].get("player", act.player), "choose_effect", {"index": ei, "scuba": True}))      # the Scuba Dive of the expedition
                    if act.kind == "harbor_sell" and state.result is not None:
                        state = copy.deepcopy(state)             # a sale after the last turn of the game (no effect on the score): the engine is over, the card just goes
                        pl = state.players[act.player]
                        if act.args["card"] in pl.hand:
                            pl.hand.remove(act.args["card"])
                            state.main_discard.append(act.args["card"])
                            pl.money += 3
                        continue
                    if act.kind == "choose_effect" and str(act.args.get("card", "")).startswith("F") and not (state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] == "endgame_discard" and e["player"] == act.player for e in state.prompt.args["pending"])) and act.args["card"] not in state.players[act.player].endgame_hand:
                        continue                                 # the engine already discarded that card (the discards come early in the engine)
                    if act.kind == "choose_effect" and act.args.get("apply") == "income_map" and not (state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] == "income_map" for e in state.prompt.args["pending"])):
                        continue                                 # a map income that the engine pays itself (other maps)
                    if act.kind == "choose_effect" and "boost" in act.args and not (state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] == "boost" for e in state.prompt.args["pending"])) and (state.prompt is None or state.prompt.args.get("carry") or state.prompt.kind == "choose_action_card"):
                        continue                                 # the Boost waits for the end of the extra action / hypnosis that follows (the log shows it there)
                    if act.kind == "take_cards" and act.args.get("mode") == "deck" and state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] == "digging" and e.get("rescue") for e in state.prompt.args["pending"])                             and 1 + sum(1 for x in acts[ai + 1:] if x.kind == "take_cards" and x.args.get("mode") == "deck") > sum(
                                1 for e in state.prompt.args["pending"] if e["kind"] == "take" and not e.get("snap")):
                        continue                                 # map 10: the draw of the Digging is logged before the discard, the engine draws when the card is discarded
                    if (act.kind == "play_sponsor" or (act.kind == "choose_effect" and str(act.args.get("card", "")).startswith("S") and "mark" not in act.args)) and state.prompt is not None and state.prompt.kind == "effects"                             and not any(e["kind"] == "marketing" and not e.get("cube") for e in state.prompt.args["pending"]):
                        pbs = next((i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "pbonus" and e["bonus"]["type"] == "bonus-sponsor"), None)
                        if pbs is not None:                              # the Marketing of one of several placement bonuses of a building (not the Okapi Stable's cube): resolve that bonus first
                            e_ = state.prompt.args["pending"][pbs]
                            state = ap(state, Action(e_["player"], "choose_effect", {"index": pbs, "apply": "pbonus", "bonus": "bonus-sponsor"}))
                            if act.kind == "choose_effect" and "index" in act.args:
                                act = Action(act.player, act.kind, {k_: v_ for k_, v_ in act.args.items() if k_ != "index"})
                    if act.kind == "choose_effect" and "bonus_type" in act.args and "continent" not in act.args and (str(act.args["bonus_type"]), act.args.get("n")) in _ARCH_TAKEN:
                        _ARCH_TAKEN.remove((str(act.args["bonus_type"]), act.args.get("n")))
                        continue                                 # the Archaeologist's pick of this bonus was made by the harness already
                    if act.kind == "choose_effect" and "multiplier" in act.args and state.prompt is not None and state.prompt.kind == "effects" and not any(
                            e["kind"] == "multiplier" for e in state.prompt.args["pending"]):
                        pbm = next((i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "pbonus" and e["bonus"]["type"] == "Multiplier"), None)
                        if pbm is not None:                              # the Multiplier of one of several placement bonuses of a building: resolve that bonus first
                            e_ = state.prompt.args["pending"][pbm]
                            state = ap(state, Action(e_["player"], "choose_effect", {"index": pbm, "apply": "pbonus", "bonus": "Multiplier"}))
                    if act.kind == "choose_effect" and "multiplier" in act.args and not (state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] == "multiplier" for e in state.prompt.args["pending"])):
                        continue                                 # a Multiplier token that the engine put on the card itself (an animal ability)
                    if act.kind == "choose_effect" and "bonus_type" in act.args and "continent" not in act.args and state.conservation_options.get("99"):
                        while state.prompt is not None and state.prompt.kind == "effects" and not any(e["kind"] in ("threshold_bonus", "rep_bonus") for e in state.prompt.args["pending"]):
                            gi = next((i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "gain" and e["res"] == "reputation"), None)
                            if gi is None:
                                break                                   # (the point at 15 that BGA lets the player trade for the bonus on 16 is still unpaid)
                            state = ap(state, Action(state.prompt.args["pending"][gi].get("player", state.prompt.player), "choose_effect",
                                                     {"index": gi, "apply": "gain", "res": "reputation"}))
                    if act.kind == "choose_effect" and "bonus_type" in act.args and "continent" not in act.args and state.prompt is not None and state.prompt.kind == "effects" and state.conservation_options.get("99")                             and not any(e["kind"] in ("threshold_bonus", "rep_bonus") for e in state.prompt.args["pending"]) and state.players[act.player].reputation >= 15 and any(
                                (act.args["bonus_type"] in o and (o[act.args["bonus_type"]] or 0) == (act.args.get("n") or 0)) for o in state.conservation_options["99"]):
                        gr = next((x for x in legal_actions(state) if x.kind == "choose_effect" and x.args.get("gain") == "reputation"), None)
                        if gr is not None:                      # Glide at 15 reputation: the gain is the bonus on 16 (the log only shows the bonus)
                            state = ap(state, gr)
                    if act.kind == "choose_effect" and "bonus_type" in act.args and "continent" not in act.args and not (state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] in ("threshold_bonus", "rep_bonus") for e in state.prompt.args["pending"])) and not (
                            state.prompt is not None and state.prompt.kind != "effects" and any(
                                e["kind"] in ("threshold_bonus", "rep_bonus") for e in (state.current_action or {}).get("threshold", []))):
                        continue                                 # "gets <bonus>" of a card / the map / the Archeologist, not the choice at conservation 5 / 8 (the logs word them alike)
                    if state.prompt is not None and state.prompt.kind in ("sponsors_play", "build_place", "animals_play", "association_tasks")                         and act.kind == "choose_effect":                  # an end-of-action effect: the multi-card action stops here
                        state = ap(state, Action(seat, {"sponsors_play": "finish_sponsors", "build_place": "finish_build", "animals_play": "finish_animals",
                                                           "association_tasks": "finish_association"}[state.prompt.kind], {}))
                    if act.kind == "take_cards" and state.prompt is not None and state.prompt.kind == "association_tasks" \
                            and Action(seat, "take_instead", {}) in legal_actions(state):                   # Self-clever Association, level II: a card instead of the donation
                        state = ap(state, Action(seat, "take_instead", {}))
                    if act.kind == "choose_action_card" and state.prompt is not None and state.prompt.kind in (
                            "sponsors_play", "build_place", "animals_play", "association_tasks", "cards_take"):       # Multiplier: the same action again
                        fin = {"sponsors_play": "finish_sponsors", "build_place": "finish_build", "animals_play": "finish_animals",
                               "association_tasks": "finish_association"}.get(state.prompt.kind)
                        if fin is not None and Action(seat, fin, {}) in legal_actions(state):
                            state = ap(state, Action(seat, fin, {}))
                        while state.prompt is not None and state.prompt.kind == "effects":
                            skip = _skip_unneeded(state, None)
                            if skip is None:
                                break
                            state = ap(state, skip)
                    if act.kind == "choose_effect" and "bonus_type" in act.args and "continent" not in act.args and not (state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] in ("threshold_bonus", "rep_bonus") for e in state.prompt.args["pending"])):
                        continue                                 # "gets <bonus>" of a card / the map, not the choice at conservation 5 / 8 (the logs word them alike)
                    _UPCOMING[0] = acts[ai + 1:]
                    if act.kind == "choose_effect" and "upgrade" in act.args and state.prompt is not None and state.prompt.kind == "effects"                             and not any(x_.type == "getBonuses" and isinstance(x_.args, dict) and "reputation" in (x_.args.get("bonuses") or {}) for x_ in events):
                        for j_, e_ in enumerate(state.prompt.args["pending"]):          # a reputation gain at the cap that the log never shows: it came before the upgrade that lifts the cap (802787987 turn 39)
                            if e_["kind"] == "gain" and e_["res"] == "reputation" and str(e_.get("source", ""))[:1] == "S" and state.players[e_.get("player", state.prompt.player)].reputation >= __import__("ark_nova.engine.bonuses", fromlist=["x"]).reputation_cap(state.players[e_.get("player", state.prompt.player)]):
                                state = ap(state, Action(e_.get("player", state.prompt.player), "choose_effect", {"index": j_, "apply": "gain", "res": "reputation"}))
                                break
                    act = _normalise(state, act, endsnap)
                    if act.kind == "take_cards" and act.args.get("mode") in ("snap", "range") and state.prompt is not None and state.prompt.kind == "effects"                             and _plain(act) not in legal_actions(state):
                        rf = next((x for x in legal_actions(state) if x.kind == "choose_effect" and x.args.get("refill")), None)
                        if rf is not None:                       # Snapping 2: the player refilled the display before the second snap
                            state = ap(state, rf)
                            act = _normalise(state, act, endsnap)
                    while state.prompt is not None and state.prompt.kind == "effects" and not (("keep" in act.args and not any(o_ < order for o_ in search_orders)) or act.args.get("apply") == "search_category") and any(e["kind"] == "search_category" for e in state.prompt.args["pending"]):
                        j = next(j for j, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "search_category")          # the search of a category university comes right after its own trigger effects, before the other effects (720708815 turn 19, 796946880 turn 23)
                        state = ap(state, Action(state.prompt.args["pending"][j]["player"], "choose_effect", {"index": j, "apply": "search_category"}))
                        if act.kind == "choose_effect" and "index" in act.args:
                            act = Action(act.player, act.kind, {k_: v_ for k_, v_ in act.args.items() if k_ != "index"})          # (the pending indexes moved)
                    act = _normalise(state, act, endsnap)
                    for pre_fn in (_kiosk_income_first, _rep_before_income):
                        while (pre := pre_fn(state, act)) is not None:
                            state = ap(state, pre)
                            if act.kind == "choose_effect" and "index" in act.args:
                                act = Action(act.player, act.kind, {k_: v_ for k_, v_ in act.args.items() if k_ != "index"})          # (the pending indexes moved)
                            act = _normalise(state, act, endsnap)
                    if act.kind == "choose_effect" and act.args.get("refill") and "index" not in act.args:
                        continue                                 # (BGA refilled the display, the engine has no take effect that would: nothing to do)
                    while state.prompt is not None and state.prompt.kind == "effects" and _plain(act) not in legal_actions(state):
                        sym = _symbiosis_for(state, act)          # Symbiosis: BGA only logs the ability that was used
                        if sym is not None:
                            state = ap(state, sym)
                            act = _normalise(state, act, endsnap)
                            continue
                        skip = _skip_unneeded(state, act)         # a trigger the player declined: BGA logs nothing for it
                        if skip is None:
                            break
                        state = ap(state, skip)
                        act = _normalise(state, act, endsnap)      # the pending indexes moved
                    if act.kind == "take_cards" and act.args.get("card") and _plain(act) not in legal_actions(state):
                        act = _flip_take(state, act)
                    if state.prompt is not None and state.prompt.kind in ("sponsors_play", "build_place", "animals_play", "association_tasks")                         and act.kind == "choose_effect" and _plain(act) not in legal_actions(state):      # the skipped effects were the last ones of the action
                        state = ap(state, Action(seat, {"sponsors_play": "finish_sponsors", "build_place": "finish_build", "animals_play": "finish_animals",
                                                           "association_tasks": "finish_association"}[state.prompt.kind], {}))
                        act = _normalise(state, act, endsnap)
                    if act.kind == "choose_action_card" and state.prompt is not None and state.prompt.kind in ("sponsors_play", "build_place", "animals_play", "association_tasks")                             and _plain(act) not in legal_actions(state):                      # Multiplier: the same action again (the effects before it were only resolved by the loop above)
                        fin = {"sponsors_play": "finish_sponsors", "build_place": "finish_build", "animals_play": "finish_animals", "association_tasks": "finish_association"}[state.prompt.kind]
                        if Action(seat, fin, {}) in legal_actions(state):
                            state = ap(state, Action(seat, fin, {}))
                            while state.prompt is not None and state.prompt.kind == "effects":
                                skip = _skip_unneeded(state, None)
                                if skip is None:
                                    break
                                state = ap(state, skip)
                    if state.prompt is not None and state.prompt.kind == "sponsors_play" and act.kind in ("place_building", "take_cards", "skip_effect")                             and _plain(act) not in legal_actions(state) and Action(seat, "finish_sponsors", {}) in legal_actions(state):
                        state = ap(state, Action(seat, "finish_sponsors", {}))           # the effects of the sponsors (a break, a reputation bonus ...) come after the action's last card
                        act = _normalise(state, act, endsnap)
                        while state.prompt is not None and state.prompt.kind == "effects" and _plain(act) not in legal_actions(state):
                            skip = _skip_unneeded(state, act)             # (an optional effect of the sponsors that the log never uses: the Trade's bonus on 16 ...)
                            if skip is None:
                                break
                            state = ap(state, skip)
                            act = _normalise(state, act, endsnap)
                    if act.kind == "take_cards" and state.prompt is not None and state.prompt.kind == "association_tasks" \
                            and Action(seat, "take_instead", {}) in legal_actions(state):                   # (the effects before it were only resolved by the loop above)
                        state = ap(state, Action(seat, "take_instead", {}))
                        act = _normalise(state, act, endsnap)
                    if state.prompt is not None and state.prompt.kind == "choose_action_card" and state.prompt.args.get("repeat") and act.kind in ("choose_effect", "take_cards") and _plain(act) not in legal_actions(state)                             and Action(seat, "skip_extra", {}) in legal_actions(state):
                        state = ap(state, Action(seat, "skip_extra", {}))          # the Multiplier was not used: the effects that waited for the end of the action come now (826013800 turn 66)
                        act = _normalise(state, act, endsnap)
                    if state.prompt is not None and state.prompt.kind == "animals_play" and act.kind == "take_cards"                             and _plain(act) not in legal_actions(state) and Action(seat, "finish_animals", {}) in legal_actions(state):
                        state = ap(state, Action(seat, "finish_animals", {}))             # Waza Small Animal Program: the snap comes after the action's last animal
                        act = _normalise(state, act, endsnap)
                    if state.prompt is not None and state.prompt.kind == "choose_action_card" and state.prompt.args.get("repeat") and act.kind in ("choose_effect", "take_cards") and _plain(act) not in legal_actions(state)                             and Action(seat, "skip_extra", {}) in legal_actions(state):
                        state = ap(state, Action(seat, "skip_extra", {}))          # the Multiplier was not used: the effects that waited for the end of the action come now (826013800 turn 66)
                        act = _normalise(state, act, endsnap)
                    if act.kind == "place_building" and state.prompt is not None and state.prompt.kind == "effects" and _plain(act) not in legal_actions(state):
                        capped = state.players[act.player].reputation >= 15              # (a reputation gain at 15 is the bonus on 16: its builds are logged, not the gain)
                        gk = next((x for x in legal_actions(state) if x.kind == "choose_effect" and x.args.get("gain") == ("reputation" if capped else "kiosk")), None)
                        if gk is not None:                      # Glide: the free kiosk is one of the gains; the log shows only the building
                            state = ap(state, gk)
                            act = _normalise(state, act, endsnap)
                    if act.kind == "place_building" and _plain(act) not in legal_actions(state) and Action(act.player, act.kind, {**act.args, "engineer": True}) in legal_actions(state):
                        act = Action(act.player, act.kind, {**act.args, "engineer": True})           # Engineer: the building beyond the strength
                    if act.kind == "place_building" and _plain(act) not in legal_actions(state)                         and Action(act.player, act.kind, {**act.args, "extra": True}) in legal_actions(state):     # Pavilion / Kiosk Build: the additional building
                        act = Action(act.player, act.kind, {**act.args, "extra": True})
                    if act.kind == "place_building" and not act.args.get("extra") and not act.args.get("engineer") and build_checks.get(mv) and _plain(act) in legal_actions(state)                             and Action(act.player, act.kind, {**act.args, "engineer": True}) in legal_actions(state):
                        # Engineer: the first building of its kind or the one beyond the strength? BGA's list of what can still be built afterwards shows how much strength is left
                        want_e = {t_ for t_, v_ in build_checks[mv][0]["build"]["options"].items() if v_}
                        eng = Action(act.player, act.kind, {**act.args, "engineer": True})

                        def after_e(a_):
                            s2 = apply(state, a_)
                            return {t_ for t_ in engine_placements(s2)} if s2.prompt is not None and s2.prompt.kind == "build_place" else None
                        got_p, got_e = after_e(_plain(act)), after_e(eng)
                        if got_e is not None and got_e == want_e and got_p != want_e:
                            act = eng
                    if act.kind == "place_building" and act.args.get("extra") and build_checks.get(mv) and Action(act.player, act.kind, {k_: v_ for k_, v_ in act.args.items() if k_ != "extra"}) in legal_actions(state):
                        # the additional (free) kiosk / pavilion or the ordinary one? Both cost the same at level II and the log does not say: BGA's list of what can still be
                        # built afterwards shows how much strength is left
                        want = {t_ for t_, v_ in build_checks[mv][0]["build"]["options"].items() if v_}
                        plain = Action(act.player, act.kind, {k_: v_ for k_, v_ in act.args.items() if k_ != "extra"})

                        def after(a_):
                            s2 = apply(state, a_)
                            return {t_ for t_ in engine_placements(s2)} if s2.prompt is not None and s2.prompt.kind == "build_place" else None
                        got_extra, got_plain = after(act), after(plain)
                        from ark_nova.engine.build_action import SIZES as _SIZES

                        def top_(types):                      # the strength that is left: the largest enclosure that can still be built (the additional kiosk / pavilion uses none of it: 823017370 turn 40)
                            return max((_SIZES[t_] for t_ in types if t_ in _SIZES and t_ not in ("kiosk", "pavilion")), default=0)
                        if got_plain is not None and got_plain == want and (got_extra is None or got_extra != want):
                            act = plain
                        elif got_plain is not None and got_extra is not None and top_(got_plain) == top_(want) != top_(got_extra):
                            act = plain
                    if (act.kind == "play_animal" and state.prompt is not None and state.prompt.kind == "animals_play" and Action(seat, "animals_single", {}) in legal_actions(state)
                            and not any(e_.type == "discardTokens" and any(m_.get("type") == "bonus-ignore-conditions" for m_ in (e_.args.get("meeples") or [])) for e_ in events)
                            and _needs_a_token(state, act)):
                        state = ap(state, Action(seat, "animals_single", {}))            # Ignore Animals instead of the token (the log shows no token used)
                    if act.kind == "play_animal" and _plain(act) not in legal_actions(state) and Action(seat, "animals_single", {}) in legal_actions(state):
                        state = ap(state, Action(seat, "animals_single", {}))            # Ignore Animals: a single animal that ignores a condition
                    if act.args.get("mark") and not any(e["kind"] == "mark" for e in (state.prompt.args.get("pending") or [] if state.prompt is not None else []))                         and not (state.prompt is not None and state.prompt.kind == "effects" and _plain(act) in legal_actions(state)):
                        rep.skipped["mark from a source that is not implemented (action card variants)"] += 1
                        raise _Stop
                    follow = []
                    if act.kind == "association_task" and act.args.get("task") == "conservation" and "slot" in act.args:
                        # the log shows one "supports a project" event; the engine asks for the project, the slot and the notepad bonus in turn
                        follow = [Action(seat, "choose_slot", {"slot": int(act.args["slot"]), **({"icon": True} if act.args.get("icon") else {}),
                                                               **({"token": act.args["token"]} if act.args.get("token") else {})})]
                        if isinstance(act.args.get("bonus"), int):
                            follow.append(Action(seat, "choose_bonus", {"bonus": act.args["bonus"]}))
                        act = Action(act.player, act.kind, {x: y for x, y in act.args.items() if x in ("task", "project", "source", "extra")})
                    if act.kind == "place_building" and state.prompt is not None and state.prompt.kind == "effects" and state.current_action is not None                             and state.current_action.get("type") == "break":
                        im = next((j for j, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "income_map" and e.get("player", act.player) == act.player), None)
                        if im is not None and not any(x.kind == "choose_effect" and x.args.get("apply") == "income_map" and x.player == act.player for x in acts[ai:]):
                            state = ap(state, Action(act.player, "choose_effect", {"index": im, "apply": "income_map"}))      # (BGA logged no map income: it was counted before the building of this income)
                    while state.prompt is not None and state.prompt.kind == "effects" and state.current_action is not None and state.current_action.get("type") == "break":
                        done_with = next((j for j, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "pouch" and e.get("source") == "map" and e.get("player") not in (None, act.player)
                                          and not any(x.player == e["player"] and _fits(e, x) for x in acts[ai:])), None)
                        if done_with is None:
                            auto = next((j for j, e in enumerate(state.prompt.args["pending"]) if e["kind"] in ("income_kiosk", "income_map", "income_appeal", "income_sponsor") and e.get("player") not in (None, act.player)
                                         and not any(x.player == e["player"] and x.kind == "choose_effect" and x.args.get("apply") == e["kind"] and x.args.get("source") == e.get("source") for x in acts[ai:])), None)
                            if auto is None:
                                break
                            e = state.prompt.args["pending"][auto]                          # (nothing is logged for an income of 0: the first player's income is over when the other one's goes on)
                            state = ap(state, Action(e["player"], "choose_effect", {"index": auto, "apply": e["kind"], **({"source": e["source"]} if e["kind"] == "income_sponsor" else {})}))
                            if act.kind == "choose_effect" and "index" in act.args:
                                act = _normalise(state, Action(act.player, act.kind, {x: y for x, y in act.args.items() if x != "index"}), endsnap)
                            continue
                        state = ap(state, Action(state.prompt.args["pending"][done_with]["player"], "skip_effect", {"index": done_with}))      # (the other player's income goes on: the unused Pouch of the first one is over)
                        if act.kind == "choose_effect" and "index" in act.args:
                            act = _normalise(state, Action(act.player, act.kind, {x: y for x, y in act.args.items() if x != "index"}), endsnap)      # (the indexes moved)
                    if _plain(act) not in legal_actions(state) and state.current_action is not None and state.current_action.get("type") == "break" and act.kind in (
                            "choose_effect", "take_cards", "place_building"):
                        other = Action(1 - act.player, act.kind, act.args)                      # (the break: the effect of the other player's income; the log does not say whose)
                        alt = _normalise(state, other, endsnap)
                        if _plain(alt) in legal_actions(state):
                            act = alt
                    if _plain(act) not in legal_actions(state):
                        rep.illegal.append(f"turn {k}: {act.kind} {act.args} not in legal_actions")
                        raise _Stop
                    if act.kind == "association_task" and act.args.get("task") == "conservation" and state.prompt is not None                             and state.prompt.kind == "association_tasks" and order is not None and not state.prompt.args.get("hypnosis"):
                        theirs = _bga_project_options(events, actor, before=order)          # the list BGA gave just before the project was supported (earlier tasks may have changed the zoo)
                        if theirs is not None:
                            rep.project_lists += 1
                            mine = _engine_project_options(state, seat)
                            if mine != theirs and not any(t_ in ("partner", "university") for t_ in state.prompt.args.get("done", [])):          # (BGA's list is made before the partner zoo / university of the same action gives its icon: 653431606 turn 73)
                                oracle_notes.append(f"project slots before move {mv}: engine {mine} bga {theirs}")
                    arch_before = _placement_types(state, act) if act.kind == "place_building" and "S221" in state.players[act.player].sponsors else None
                    inserted[0] = False
                    state = ap(state, act)
                    inserted[0] = True
                    if act.kind == "choose_effect" and "option" in act.args and state.prompt is not None and state.prompt.kind == "effects" and (state.current_action or {}).get("type") == "break":
                        # the bonus of a conservation space (e.g. 2 reputation) is paid when it is chosen, before the effects around it (906045803 turn 57: the display is refilled when the player's effects are done)
                        gi = next((i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "gain" and e.get("source") == "bonus" and e.get("player", act.player) == act.player), None)
                        if gi is not None:
                            state = ap(state, Action(act.player, "choose_effect", {"index": gi, "apply": "gain", "res": state.prompt.args["pending"][gi]["res"]}))
                    if arch_before is not None:
                        state = _archaeologist(state, act, events, arch_before, ap)
                    for f in follow:
                        if f not in legal_actions(state):
                            rep.illegal.append(f"turn {k}: {f.kind} {f.args} not in legal_actions (project {act.args.get('project')})")
                            raise _Stop
                        inserted[0] = False
                        state = ap(state, f)
                        inserted[0] = True
                    while follow and state.prompt is not None and state.prompt.kind == "effects" and _project_effect(state) is not None:
                        state = ap(state, _project_effect(state))          # BGA shows the building of a size-2 bonus right after the choice
                    if state.prompt is not None and (state.prompt.kind == "build_place" or (state.prompt.kind == "effects" and any(
                            e["kind"] == "build" for e in state.prompt.args["pending"]))):          # (BGA's list is for the moment the player may place again)
                        for chk in build_checks.get(mv, []):
                            opts = chk["build"]["options"]
                            if all(knows_shape(t) for t in opts):
                                rep.placement_lists += 1
                                mine = engine_placements(state)
                                theirs = {t: sorted(map(tuple, v)) for t, v in opts.items() if v}
                                if state.prompt.kind == "effects":
                                    mine = {t: v for t, v in mine.items() if t in opts}
                                    if mine and set(mine) <= {"kiosk", "pavilion"}:          # (a free kiosk / pavilion: BGA's list also names the size-1 spaces)
                                        theirs.pop("size-1", None)
                                if mine != theirs:
                                    why = _placement_diff(mine, theirs)
                                    oracle_notes.append(f"placements after move {mv}: " + (why or f"(same cells, different shape of the lists) engine {mine} bga {theirs}"))
                            break
                cur_move[:] = [None, None]
                if again and state.prompt is not None and state.prompt.kind == "effects" and Action(seat, "go_extra", {}) in legal_actions(state):
                    state = ap(state, Action(seat, "go_extra", {}))                    # the extra action first: the mark / Clever / Boost come after it
                while state.prompt is not None and state.prompt.kind == "effects" and any(e["kind"] == "mark" for e in state.prompt.args["pending"]):
                    _next_mark.late = False
                    nxt = _next_mark(turns, k)                                            # the mark is logged at the start of the next turn
                    if nxt is not None and _next_mark.late:
                        deferred_mark[0] = True
                    if nxt is None:
                        nxt = _future_mark(turns, k, actor, consumed_marks)               # ... or after a later action of the player
                        if nxt is not None:
                            deferred_mark[0] = True
                    if nxt is None:
                        break
                    state = ap(state, Action(seat, "choose_effect", {"index": next(i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "mark"), "card": nxt}))
                while state.prompt is not None and state.prompt.kind == "effects":       # declined optional triggers at the end of the turn
                    if again and Action(seat, "go_extra", {}) in legal_actions(state):
                        state = ap(state, Action(seat, "go_extra", {}))                    # the extra action is next: the Clever / Boost of this action come after it
                        break
                    skip = _skip_unneeded(state, None)
                    if skip is None:
                        if all(e["kind"] == "mark" for e in state.prompt.args["pending"]):
                            rep.skipped["mark logged in a later turn (Animals4)"] += 1      # BGA logs it after the next action of the player
                            raise _Stop
                        if any(e_.type == "playerConcedeGame" for e_ in events):
                            raise _Stop
                        rep.illegal.append(f"turn {k}: a mandatory effect is still pending: {state.prompt.args['pending']}")
                        raise _Stop
                    state = ap(state, skip)
                if state.prompt is not None and state.prompt.kind == "final_window":
                    state = ap(state, Action(state.prompt.player, "finish_game", {}))
                if plan.chose and state.prompt is not None and state.prompt.kind == "cards_take" and Action(seat, "skip_snap", {}) in legal_actions(state):
                    state = ap(state, Action(seat, "skip_snap", {}))
                if plan.chose and state.prompt is not None and state.prompt.kind in ("build_place", "sponsors_play", "animals_play",
                                                                                      "association_tasks"):   # stopped early
                    fin = Action(seat, {"build_place": "finish_build", "sponsors_play": "finish_sponsors", "animals_play": "finish_animals",
                                        "association_tasks": "finish_association"}[state.prompt.kind], {})
                    if fin not in legal_actions(state):
                        rep.illegal.append(f"turn {k}: {fin.kind} not legal")
                        raise _Stop
                    state = ap(state, fin)
                    acts = acts + [fin]
                while state.prompt is not None and state.prompt.kind == "effects":       # end-of-action triggers that were declined
                    if again and Action(seat, "go_extra", {}) in legal_actions(state):
                        state = ap(state, Action(seat, "go_extra", {}))                    # the extra action is next: the Clever / Boost of this action come after it
                        break
                    skip = _skip_unneeded(state, None)
                    if skip is None:
                        if all(e["kind"] == "mark" for e in state.prompt.args["pending"]):
                            rep.skipped["mark logged in a later turn (Animals4)"] += 1      # BGA logs it after the next action of the player
                            raise _Stop
                        if any(e_.type == "playerConcedeGame" for e_ in events):
                            raise _Stop
                        rep.illegal.append(f"turn {k}: a mandatory effect is still pending: {state.prompt.args['pending']}")
                        raise _Stop
                    state = ap(state, skip)
                if state.prompt is not None and state.prompt.kind == "choose_action_card" and state.prompt.args.get("optional")                     and (snaps[last + 1] if last + 1 < len(snaps) else snaps[k]).active_player != seat:
                    state = ap(state, Action(seat, "skip_extra", {}))           # an optional second action (Multiplier, Action: X, Hypnosis) that was not taken
                elif (state.prompt is not None and state.prompt.kind == "choose_action_card" and state.prompt.args.get("repeat")
                      and not (last + 1 < len(turns) and _is_repetition(turns[last + 1])) and Action(seat, "skip_extra", {}) in legal_actions(state)):
                    state = ap(state, Action(seat, "skip_extra", {}))           # the Multiplier was not used: the card goes to slot 1 with its token, then the extra action (if any) follows
                end = endsnap
                from ark_nova.engine import game as _game
                state = copy.deepcopy(state)
                if state.prompt is not None and state.prompt.kind == "final_window":          # (the last turn was finished by the harness: nothing is left to do with a token)
                    state = ap(state, Action(state.prompt.player, "finish_game", {}))
                _game.flush_refill(state)
                mine, theirs = project(state), project(end)
                if deferred_mark[0]:                             # (the mark was placed from a later markCard of the log: the replay state has it later)
                    for d_ in (mine, theirs):
                        for pl_ in d_["players"]:
                            pl_["marks"] = []
                nxt = next((turns[j] for j in range(last + 1, len(turns)) if any(not e.type.startswith("gameStateChange") for e in turns[j])), [])
                prev = next((turns[j] for j in range(last - 1, -1, -1) if any(e.type == "chooseActionCard" for e in turns[j])), [])
                prev_actor = next((str(e.args["player_id"]) for e in prev if e.type == "chooseActionCard"), None)
                if any(e.type == "chooseActionCard" and str(e.args["player_id"]) == actor for e in nxt[:6]) or prev_actor == actor:
                    for d in (mine, theirs):              # the same player acts again (an extra action of an animal, Hypnosis ...): the engine's turn ended, the log's goes on
                        d.pop("active_player"), d.pop("turn")
                        for f in ("display", "main_deck", "main_discard"):          # (BGA refills the display, with its Wave cards, only when the whole turn is over)
                            d.pop(f, None)
                    if state.players[seat].flags.get("venom_paid"):       # BGA logs the Venom payment at the end of the whole turn, the engine pays before the first draw
                        mine["players"][seat]["money"] += 2 if mine["players"][seat]["money"] + 2 == theirs["players"][seat]["money"] else 0
                if state.result is not None:                   # the final scoring is added to the tracks by the engine; the log-built state keeps the tracks as played
                    for d in (mine, theirs):
                        for pl in d["players"]:
                            for f in ("appeal", "conservation", "x_tokens", "money"):
                                pl.pop(f, None)
                for e_ in events:
                    if e_.type == "playerConcedeGame" and str(e_.args.get("player_id")) in seat_of:        # the player left in the middle of the break: the rest of their income is not logged
                        for d in (mine, theirs):
                            for f in ("break_position", "active_player", "turn", "round", "display", "main_deck", "main_discard"):
                                d.pop(f, None)
                            for pl_ in d["players"]:                       # (the game ends in the middle of the break: neither player's remaining income is logged)
                                for f in ("appeal", "conservation", "x_tokens", "money", "hand", "marks", "tokens", "buildings"):
                                    pl_.pop(f, None)
                diffs = _diff(mine, theirs) + oracle_notes
                rep.checked += 1
                for act in acts:
                    rep.checked_kinds[act.kind] += 1
                if diffs:
                    rep.mismatches.append(f"turn {k}: " + "; ".join(diffs[:3]))
            except _Stop:
                pass
            except NotImplementedError as ex:
                rep.skipped[f"engine: {str(ex)[:50]}"] += 1
            except IllegalAction as ex:
                rep.illegal.append(f"turn {k}: {ex}")
        finally:
            res = _result(rep, counts, trace, span.get(k, k))
            if res is not None:
                rep.results[k] = res
                carry = (res.last_turn + 1, trace[-1][2]) if (chain or again) and res.status == "ok" and trace else (None, None)      # (an extra action goes on from the engine's own state: a Clever of the first action waits for its end)
    return rep
