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
from ark_nova.replay.actions import parse_action_type, turn_actions, turn_events
from ark_nova.replay.builder import Replay


@dataclass
class TurnResult:
    """What the engine did with one turn: `ok` (replayed and equal to the log), `mismatch` (replayed, state differs), `illegal` (a logged
    action is not legal for the engine) or `skipped` (not supported yet). `trace` = (move index or None, event order or None, engine state after the action)
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
        "break_position": state.break_position, "active_player": state.active_player, "turn": state.turn,
    }


def _tracked_token(t) -> bool:
    """Tokens the engine implements: workers, partner zoos, universities, tokens on projects and on the donation spaces."""
    return (t.type in ("worker", "bonus-icon", "bonus-increased-hand", "bonus-sponsor-gray", "bonus-extra-shift", "bonus-ignore-conditions") or t.type.startswith(("partner-", "fac-"))
            or (t.type == "token" and (t.location.startswith("association_0_") or re.match(r"P\d+_.*\d$", t.location) is not None
                                   or t.location.startswith(("S215_", "S218_", "S253_")))))


def _diff(a, b, path="") -> list[str]:
    if isinstance(a, dict):
        return [d for k in a for d in _diff(a[k], b[k], f"{path}.{k}")]
    if isinstance(a, list) and a and isinstance(a[0], dict):
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in _diff(x, y, f"{path}[{i}]")]
    return [] if a == b else [f"{path}: engine {a!r} != replay {b!r}"]


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
            bt = ((a.get("bonus_desc") or {}).get("args") or {}).get("bonus_type")
            if bt:
                extra[bt] += 1
    bd = board(state.players[seat].map_id)
    for typ, n in extra.items():
        for _ in range(n):
            if state.prompt is None or state.prompt.kind != "effects":
                return state
            i = next((i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "archaeologist"), None)
            if i is None:
                return state
            cell = next((c for c in bon.archaeologist_cells(state, state.players[seat]) if any(b and b["type"] == typ for b in bd.bonuses[c])), None)
            if cell is None:
                return state
            state = ap(state, Action(seat, "choose_effect", {"index": i, "cell": list(cell)}))
    return state


def _plain(act: Action) -> Action:
    """The action as `legal_actions` lists it: the category of a category university is a chance outcome, not a choice."""
    if act.args.get("mark"):
        return Action(act.player, act.kind, {k: v for k, v in act.args.items() if k != "mark"})
    if act.kind in ("association_task", "choose_effect") and "category" in act.args:
        return Action(act.player, act.kind, {k: v for k, v in act.args.items() if k != "category"})
    return act


def _normalise(state: GameState, act: Action, end=None) -> Action:
    """The log does not say which pending effect a choice belongs to (or which notepad bonus a project took): find it among the legal
    actions."""
    if act.kind == "play_sponsor" and state.prompt is not None and state.prompt.kind == "effects" and _plain(act) not in legal_actions(state):
        alt = Action(act.player, "choose_effect", {"index": next((i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "marketing"), -1), "card": act.args["card"]})
        if alt in legal_actions(state):                     # a Marketing effect (placement bonus / bonus token): the log shows an ordinary sponsor play
            return alt
    if act.kind == "take_cards" and act.args.get("card") and _plain(act) not in legal_actions(state):
        for mode in ("snap", "range"):                    # BGA words a snap and a take within the reputation range alike: the card is what counts
            alt = Action(act.player, act.kind, {"mode": mode, "card": act.args["card"]})
            if alt in legal_actions(state):
                return alt
    if act.kind == "choose_effect" and "boost" in act.args and end is not None:          # Boost: slot 1 or 5, read off the final order
        order = [c.type for c in end.players[act.player].action_cards]
        where = order.index(act.args["boost"])
        if 0 < where < len(order) - 1:                                                      # neither on slot 1 nor on slot 5: the Boost was declined
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
        for j, b in notepad_bonuses(state, p):
            if b["type"] == want["type"] and ("value" not in want or b["value"] == want["value"]):
                return Action(act.player, act.kind, {**act.args, "bonus": j})
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
                    return cand
        return act
    if act.kind != "choose_effect" or "index" in act.args or state.prompt is None or state.prompt.kind != "effects":
        return act
    want = _plain(act).args
    for cand in legal_actions(state):
        if cand.kind == "choose_effect" and {k: v for k, v in cand.args.items() if k != "index"} == want:
            return cand
    return act


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
                or ("card" in a and k in ("pouch", "search_discard", "assertion", "mark", "marketing")) or ("donate" in a and k == "donation")
                or (("hand" in a or "display" in a) and k == "digging") or ("keep" in a and k == "scavenge") or ("gain" in a and k == "glide_gain")
                or ("cards" in a and k in ("glide", "shark")) or ("trade" in a and k == "trade") or ("building" in a and k == "cut_down")
                or ("worker" in a and k == "extra_shift") or ("discard" in a and k == "adapt") or ("animal" in a and k == "symbiosis")
                or (("give" in a or "pay" in a) and k == "pilfer") or ("apply" in a and k in ("venom", "constrict", "gain"))
                or ("activate" in a and k == "ability") or ("apply" in a and k in ("hypnosis", "pay_appeal")) or ("rep_bonus" in a and k == "rep_bonus"))
    return False


def _skip_unneeded(state: GameState, act):
    """`skip_effect` for the first optional pending effect that the next logged action does not use."""
    for i, e in enumerate(state.prompt.args["pending"]):
        if e.get("optional") and not _fits(e, act):
            return Action(e.get("player", state.prompt.player), "skip_effect", {"index": i})
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "endgame_discard" and state.players[e["player"]].endgame_hand:      # the logs show the discards later, if at all
            return Action(e["player"], "choose_effect", {"index": i, "card": state.players[e["player"]].endgame_hand[0]})
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "gain" and e["res"] == "reputation" and not (act is not None and act.args.get("res") == "reputation"):
            return Action(e.get("player", state.prompt.player), "choose_effect", {"index": i, "apply": "gain", "res": "reputation"})      # at the cap BGA logs nothing
    return _project_effect(state)


def _project_effect(state: GameState):
    """The next effect of a supported project that the log only shows through its results (gains, the notepad bonus, a tutor search)."""
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == "gain" and (e["source"][:1] == "P" or e["source"] == "S224"):
            return Action(state.prompt.player, "choose_effect", {"index": i, "apply": "gain", "res": e["res"]})
        if e["kind"] in ("project_bonus", "tutor"):
            return Action(state.prompt.player, "choose_effect", {"index": i, "apply": e["kind"]})
        if e["kind"] == "reef":
            from ark_nova.engine.project_effects import _reef_aquariums
            aq = _reef_aquariums(state, state.prompt.player)
            if aq:
                return Action(state.prompt.player, "choose_effect", {"index": i, "building": [aq[0].x, aq[0].y]})
    return None


def _symbiosis_for(state: GameState, act):
    """The Symbiosis choice after which the logged action is legal (the ability of another sea animal that the log shows being used)."""
    if not any(e["kind"] == "symbiosis" for e in state.prompt.args["pending"]):
        return None
    for cand in legal_actions(state):
        if cand.kind == "choose_effect" and "animal" in cand.args and state.prompt.args["pending"][cand.args["index"]]["kind"] == "symbiosis":
            trial = apply(state, cand)
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
    budget = int(ch.args["strength"])
    placed = [a for a in acts if a.kind == "place_building"]
    if sum(SIZES[a.args["type"]] for a in placed) <= budget and (int(ch.args["actionCard"]["level"]) >= 2 or len(placed) <= 1):
        return acts
    out, done = [], False
    for a in acts:
        if a.kind == "place_building" and not done and a.args["type"] == EXTRA_TYPE[variant] and not a.args.get("extra"):
            a, done = Action(a.player, a.kind, {**a.args, "extra": True}), True
        out.append(a)
    return out


def _bga_project_options(events: list, actor: str):
    """BGA's own list of the projects the player can support with the Association action and the slots of each (the private state of the move)."""
    for e in events:
        if e.type == "gameStateChangePrivateArg" and isinstance(e.args, dict) and isinstance(e.args.get("slots"), dict) and str(e.player) == actor:
            opts = (e.args["slots"].get("5") or {}).get("options")
            if isinstance(opts, dict):
                return {_card_key(k): sorted(x["id"] if isinstance(x, dict) else x for x in v) for k, v in opts.items()}      # (release: {id, animalIds})
    return None


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
        slots = sorted(i for i, _, _ in association.slot_options(state, seat, key))          # (BGA's list does not count a token as an icon)
        if slots:
            out[key] = slots
    return out


def _is_repetition(events: list) -> bool:
    """The turn starts with a chooseActionCard that uses a Multiplier token."""
    first = next((e for e in events if e.type in ("chooseActionCard", "actionCardCleanup")), None)
    return first is not None and first.type == "chooseActionCard" and any(e.type == "discardTokens" and "multiplier" in e.log for e in events)


def _next_mark(turns: list, k: int):
    """The card of a markCard event at the start of turn k+1 (before its chooseActionCard)."""
    if k + 1 >= len(turns):
        return None
    for e in turns[k + 1]:
        if e.type == "chooseActionCard":
            return None
        if e.type == "markCard":
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
    cur_move = [None, None]                      # (move index, event order) of the logged action being applied
    trace: list = []

    def ap(state: GameState, act: Action) -> GameState:
        new = apply(state, act)
        trace.append((cur_move[0], cur_move[1], new))
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
    merged: set = set()                      # Multiplier: BGA logs every repetition as a turn of its own (no cleanup of the card before the last one)
    span: dict = {}
    for k in range(len(turns)):
        j = k
        while j + 1 < len(turns) and k not in merged and _is_repetition(turns[j + 1]) and not any(e.type == "actionCardCleanup" for e in turns[j]):
            merged.add(j + 1)
            j += 1
        span[k] = j
        if j > k:
            turns[k] = [e for i in range(k, j + 1) for e in turns[i]]
            for i in range(k + 1, j + 1):
                turns[i] = []
    for k, events in enumerate(turns):
        counts = (sum(rep.skipped.values()), len(rep.illegal), len(rep.mismatches), rep.checked, Counter(rep.skipped))
        trace.clear()
        cur_move[:] = [None, None]
        try:
            if k >= len(snaps):
                break
            last = span.get(k, k)
            endsnap = snaps[last + 1] if last + 1 < len(snaps) else replay.states[-1]
            if not events:                       # a repeated state-20 marker (BGA re-enters the state without anything happening)
                continue
            rep.turns += 1
            actor = next((str(e.args["player_id"]) for e in events if e.type in ("chooseActionCard", "actionCardCleanup")), markers[k][1])
            if actor != markers[k][1]:           # e.g. a turn where BGA logs the other player's card (odd skipped turns)
                rep.skipped["actor differs from the turn marker"] += 1
                continue
            seat = seat_of[actor]
            nxt_events = turns[last + 1] if last + 1 < len(turns) else []
            again = any(e.type == "chooseActionCard" and str(e.args["player_id"]) == actor for e in nxt_events[:6])       # the same player acts again right away
            plan = turn_actions(events, seat, seat_of, move_of, snaps[k].config.peaceful, again)
            if isinstance(plan, str):
                rep.skipped[plan] += 1
                continue
            acts = plan.actions
            state = copy.deepcopy(carry[1] if carry[0] == k else snaps[k])
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
            state.phase = Phase.TURN
            state.current_action = None
            state.active_player = seat
            state.prompt = Prompt(kind="choose_action_card", player=seat, args={"hypnosis": True, "optional": True} if acts[0].args.get("hypnosis") else {})
            oracle_notes: list[str] = []
            try:
                for act, mv, order in zip(acts, plan.moves, plan.orders):
                    cur_move[:] = [mv, order]
                    if act.kind == "choose_effect" and "bonus_type" in act.args and not (state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] in ("threshold_bonus", "rep_bonus") for e in state.prompt.args["pending"])):
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
                    if act.kind == "choose_effect" and "bonus_type" in act.args and not (state.prompt is not None and state.prompt.kind == "effects" and any(
                            e["kind"] in ("threshold_bonus", "rep_bonus") for e in state.prompt.args["pending"])):
                        continue                                 # "gets <bonus>" of a card / the map, not the choice at conservation 5 / 8 (the logs word them alike)
                    act = _normalise(state, act, endsnap)
                    if act.kind == "take_cards" and act.args.get("mode") == "snap" and state.prompt is not None and state.prompt.kind == "effects"                             and _plain(act) not in legal_actions(state):
                        rf = next((x for x in legal_actions(state) if x.kind == "choose_effect" and x.args.get("refill")), None)
                        if rf is not None:                       # Snapping 2: the player refilled the display before the second snap
                            state = ap(state, rf)
                            act = _normalise(state, act, endsnap)
                    act = _normalise(state, act, endsnap)
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
                    if state.prompt is not None and state.prompt.kind in ("sponsors_play", "build_place", "animals_play", "association_tasks")                         and act.kind == "choose_effect" and _plain(act) not in legal_actions(state):      # the skipped effects were the last ones of the action
                        state = ap(state, Action(seat, {"sponsors_play": "finish_sponsors", "build_place": "finish_build", "animals_play": "finish_animals",
                                                           "association_tasks": "finish_association"}[state.prompt.kind], {}))
                        act = _normalise(state, act, endsnap)
                    if state.prompt is not None and state.prompt.kind == "sponsors_play" and act.kind in ("place_building", "take_cards", "skip_effect")                             and _plain(act) not in legal_actions(state) and Action(seat, "finish_sponsors", {}) in legal_actions(state):
                        state = ap(state, Action(seat, "finish_sponsors", {}))           # the effects of the sponsors (a break, a reputation bonus ...) come after the action's last card
                        act = _normalise(state, act, endsnap)
                    if state.prompt is not None and state.prompt.kind == "animals_play" and act.kind == "take_cards"                             and _plain(act) not in legal_actions(state) and Action(seat, "finish_animals", {}) in legal_actions(state):
                        state = ap(state, Action(seat, "finish_animals", {}))             # Waza Small Animal Program: the snap comes after the action's last animal
                        act = _normalise(state, act, endsnap)
                    if act.kind == "place_building" and state.prompt is not None and state.prompt.kind == "effects" and _plain(act) not in legal_actions(state):
                        gk = next((x for x in legal_actions(state) if x.kind == "choose_effect" and x.args.get("gain") == "kiosk"), None)
                        if gk is not None:                      # Glide: the free kiosk is one of the gains; the log shows only the building
                            state = ap(state, gk)
                            act = _normalise(state, act, endsnap)
                    if act.kind == "place_building" and _plain(act) not in legal_actions(state)                         and Action(act.player, act.kind, {**act.args, "extra": True}) in legal_actions(state):     # Pavilion / Kiosk Build: the additional building
                        act = Action(act.player, act.kind, {**act.args, "extra": True})
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
                    if _plain(act) not in legal_actions(state):
                        rep.illegal.append(f"turn {k}: {act.kind} {act.args} not in legal_actions")
                        raise _Stop
                    arch_before = _placement_types(state, act) if act.kind == "place_building" and "S221" in state.players[act.player].sponsors else None
                    state = ap(state, act)
                    if arch_before is not None:
                        state = _archaeologist(state, act, events, arch_before, ap)
                    if act.kind == "choose_action_card" and act.args["type"] == "association" and state.prompt is not None                         and state.prompt.kind == "association_tasks" and not act.args.get("hypnosis"):
                        theirs = _bga_project_options(events, actor)
                        if theirs is not None:
                            rep.project_lists += 1
                            mine = _engine_project_options(state, seat)
                            if mine != theirs:
                                oracle_notes.append(f"project slots after move {mv}: engine {mine} bga {theirs}")
                    for f in follow:
                        if f not in legal_actions(state):
                            rep.illegal.append(f"turn {k}: {f.kind} {f.args} not in legal_actions (project {act.args.get('project')})")
                            raise _Stop
                        state = ap(state, f)
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
                                if mine != theirs:
                                    why = _placement_diff(mine, opts)
                                    oracle_notes.append(f"placements after move {mv}: " + (why or f"(same cells, different shape of the lists) engine {mine} bga {theirs}"))
                            break
                cur_move[:] = [None, None]
                while state.prompt is not None and state.prompt.kind == "effects" and any(e["kind"] == "mark" for e in state.prompt.args["pending"]):
                    nxt = _next_mark(turns, k)                                            # the mark is logged at the start of the next turn
                    if nxt is None:
                        break
                    state = ap(state, Action(seat, "choose_effect", {"index": next(i for i, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "mark"), "card": nxt}))
                while state.prompt is not None and state.prompt.kind == "effects":       # declined optional triggers at the end of the turn
                    skip = _skip_unneeded(state, None)
                    if skip is None:
                        if all(e["kind"] == "mark" for e in state.prompt.args["pending"]):
                            rep.skipped["mark logged in a later turn (Animals4)"] += 1      # BGA logs it after the next action of the player
                            raise _Stop
                        rep.illegal.append(f"turn {k}: a mandatory effect is still pending: {state.prompt.args['pending']}")
                        raise _Stop
                    state = ap(state, skip)
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
                    skip = _skip_unneeded(state, None)
                    if skip is None:
                        if all(e["kind"] == "mark" for e in state.prompt.args["pending"]):
                            rep.skipped["mark logged in a later turn (Animals4)"] += 1      # BGA logs it after the next action of the player
                            raise _Stop
                        rep.illegal.append(f"turn {k}: a mandatory effect is still pending: {state.prompt.args['pending']}")
                        raise _Stop
                    state = ap(state, skip)
                if state.prompt is not None and state.prompt.kind == "choose_action_card" and state.prompt.args.get("optional")                     and (snaps[last + 1] if last + 1 < len(snaps) else snaps[k]).active_player != seat:
                    state = ap(state, Action(seat, "skip_extra", {}))           # an optional second action (Multiplier, Action: X, Hypnosis) that was not taken
                end = endsnap
                mine, theirs = project(state), project(end)
                nxt = turns[last + 1] if last + 1 < len(turns) else []
                if any(e.type == "chooseActionCard" and str(e.args["player_id"]) == actor for e in nxt[:6]):
                    for d in (mine, theirs):              # the same player acts again (an extra action of an animal, Hypnosis ...): the engine's turn ended, the log's goes on
                        d.pop("active_player"), d.pop("turn")
                if state.result is not None:                   # the final scoring is added to the tracks by the engine; the log-built state keeps the tracks as played
                    for d in (mine, theirs):
                        for pl in d["players"]:
                            for f in ("appeal", "conservation", "x_tokens", "money"):
                                pl.pop(f, None)
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
                carry = (res.last_turn + 1, trace[-1][2]) if chain and res.status == "ok" and trace else (None, None)
    return rep
