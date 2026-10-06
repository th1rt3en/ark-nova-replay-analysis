"""Everything the replay viewer needs for one table, as JSON: static facts (players, maps, card catalog) + one view per replay step.

A step is one kept `move_id` of the log; its state is the replay builder's state after that move (`Replay.states`), without the
decks (only their sizes) and with the cells every building covers, so the browser needs no board geometry code.
"""
import os
import re
from pathlib import Path
from typing import Any

from ark_nova import data
from ark_nova.data import map_quirks
from ark_nova.engine import association, tracks
from ark_nova.engine.breaks import hand_limit, map_ability_income
from ark_nova.engine.board import footprint_cells
from ark_nova.engine.build_action import knows_shape, shape_of
from ark_nova.engine.state import GameState
from ark_nova.parser.log import parse_log
from ark_nova.parser.model import Move, ParsedLog
from ark_nova.replay.builder import Replay, build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.engine_replay import build_engine_replay
from ark_nova.replay.options import step_options
from ark_nova.storage.index import TableRecord

_PLACEHOLDER = re.compile(r"\$\{(\w+)\}")
IMAGE_DIR = {"animal": "animals", "sponsor": "sponsors"}       # fallback art from the vendored upstream repo (/img)
WEB_DIR = Path(os.environ.get("WEB_DIR") or Path(__file__).resolve().parents[3] / "web")      # the Docker image sets WEB_DIR (the package lives in site-packages there)
LARGE_DIR = WEB_DIR / "cards_large"      # full size sponsor cards for the hover preview (scripts/build_large_art.py)
CARD_DIR = WEB_DIR / "cards"    # full card images cut by scripts/build_card_images.py
TIMED_BY_LOG = ("break_position", "round", "display", "main_deck_size", "main_deck", "main_discard_size", "main_discard", "endgame_deck", "endgame_deck_size", "current_action", "active_player", "turn")      # shown as the log has them at each step (the refill comes later than the engine's); likewise the order of the action cards
GAIN_FIELDS = ("reputation", "appeal", "conservation")
LOG_TIMED_PLAYER_FIELDS = ("action_cards", "hand", "money", "reputation", "x_tokens", "appeal", "conservation", "score", "income", "hand_limit")      # per player, same reason
PICTURE_OF = {"6a": "6"}              # map 6a has the same board as map 6; its own picture has the placement bonuses baked in (bugged)
STATE_DROP = ("endgame_discard", "seed", "config", "rng", "base_projects_unused", "version")


def render_log(template: str, args: Any, depth: int = 0) -> str:
    """BGA log template + args -> plain text. Icon placeholders and unknown arguments disappear."""
    if not isinstance(args, dict) or depth > 4:
        return _PLACEHOLDER.sub("", template or "").strip()

    def sub(m: re.Match) -> str:
        v = args.get(m.group(1))
        if isinstance(v, dict) and "log" in v:
            return render_log(v["log"], v.get("args"), depth + 1)
        if isinstance(v, (str, int, float)) and not isinstance(v, bool):
            return str(v)
        return ""

    return re.sub(r"\s+", " ", _PLACEHOLDER.sub(sub, template or "")).strip()


def _draft_text(e, names: dict[str, str]) -> str:
    """The private action card draft events have no log text: say what the player picked / kept (and from what)."""
    def pretty(v) -> str:
        v = str(v)
        return f"{v[:-1].capitalize()} {v[-1]}" if v[-1:].isdigit() else v
    a = e.args if isinstance(e.args, dict) else {}
    pv = (a.get("args") or {}).get("_private") or a
    who = names.get(str(e.player), "A player")
    cards = [f"{str(c.get('actionType')).lower()}{c.get('number')}" for c in pv.get("cards") or []]
    if e.type == "updateInitialActionCardSelection" and pv.get("selection"):
        rnd = "first" if not pv.get("previous") else "second"
        return f"{who} picks {pretty(pv['selection'])} from {', '.join(pretty(c) for c in cards)} (action card draft, {rnd} pick)"
    if e.type == "updateInitialActionCardsKeep" and pv.get("selection"):
        return f"{who} keeps {' and '.join(pretty(v) for v in pv['selection'])} of {', '.join(pretty(c) for c in cards)} (action card draft)"
    return ""


# What an opponent does not see in the physical game: the cards drawn from the deck (and the scoring cards), cards stored or pouched face down. The cards that are revealed
# (Hunter, Perception, Scuba Dive, a search of the deck, the discard pile) and everything that goes to the open discard pile are public (planning sheet "visibility").
_PUBLIC_DRAW = re.compile(r"hunter effect|perception effect|scuba dive effect|resistance effect|for gaining a new university|from discard|Assertion|Dominance|Pilfering|with <")
_SECRET_DISCARD = re.compile(r"scoring card|adapt effect|pouch")


def _secret(e) -> bool:
    """Is this private event (written for one player) something that the other player must not read?"""
    if e.player is None:
        return False
    log = e.log or ""
    if e.type == "pDrawCards":
        return not _PUBLIC_DRAW.search(log)
    if e.type == "pDiscardCards":
        return bool(_SECRET_DISCARD.search(log))
    return e.type in ("pStoreCard", "pUnstoreCard")


def _hidden_text(e) -> str:
    """The log line of a secret event with the cards replaced by their number."""
    a = e.args if isinstance(e.args, dict) else {}
    cards = a.get("cards")
    n = len(cards) if isinstance(cards, list) and cards else 1
    word = f"{n} card" + ("" if n == 1 else "s")
    if "${card_names} cards" in (e.log or ""):                         # ("You pouch ${card_names} cards for ...": the word is already there)
        word = str(n)
    hidden = {**a, "card_names": word, "card_name": word, "card_names2": word}
    return render_log(e.log, hidden)


def _event_text_pov(e, names: dict[str, str], pov) -> str:
    """The line of an event as the viewer at `pov` (a player id, None = sees everything) reads it."""
    t = _hidden_text(e) if pov is not None and str(e.player) != str(pov) and _secret(e) else render_log(e.log, e.args)
    if e.player and names.get(e.player):          # private events are written for the player: "You draw ..."
        t = re.sub(r"^You", names[e.player], t)
    return t


def step_label(move: Move, names: dict[str, str], pov=None) -> str:
    texts = []
    for e in move.events:
        if e.type in ("updateInitialActionCardSelection", "updateInitialActionCardsKeep"):
            t = _draft_text(e, names)
            if pov is not None and e.player is not None and str(e.player) != str(pov):          # the other player's choices stay hidden
                t = f"{names.get(str(e.player), 'A player')} chooses action cards (action card draft)" if t else ""
        else:
            t = _event_text_pov(e, names, pov)
        if t and t not in texts:
            texts.append(t)
    return " · ".join(texts[:3])


def _event_text(e, names: dict[str, str]) -> str:
    t = render_log(e.log, e.args)
    if e.player and names.get(e.player):
        t = re.sub(r"^You", names[e.player], t)
    return t


def group_labels(move: Move, names: dict[str, str], pov) -> list[str]:
    """`move_groups` labels as the viewer at `pov` reads them (the same groups: they are cut by the unredacted text)."""
    groups: list[list] = []
    for e in move.events:
        t = _event_text(e, names)
        if not t:
            continue
        if not groups or t != groups[-1][0]:
            groups.append([t, _event_text_pov(e, names, pov)])
    return [g[1] for g in groups]


def move_groups(move: Move, names: dict[str, str]) -> list[tuple[str, int]]:
    """The effects of a move, one per log line: [(label, order of the event that starts it)]. Events without a log line (token moves, state
    updates) belong to the effect before them; a private and a public version of one line count once."""
    groups: list[list] = []
    for e in move.events:
        t = _event_text(e, names)
        if not t:
            continue
        if not groups:
            groups.append([[t], None])                      # the first effect starts with the move
        elif t not in groups[-1][0]:
            groups.append([[t], e.order])
    return [(" · ".join(texts), start) for texts, start in groups]


def group_actors(move: Move, groups: list, seat_of: dict[str, int]) -> list:
    """The seat of the player who does each effect of the move (from the `player_id` of its first event that has one), None when the log does not say."""
    starts = [start for _, start in groups]
    out = []
    for gi in range(len(groups)):
        lo = starts[gi] if starts[gi] is not None else -1
        hi = starts[gi + 1] if gi + 1 < len(groups) else 10 ** 12
        actor = None
        for e in move.events:
            if lo <= e.order < hi or (gi == 0 and e.order < hi):
                pid = e.args.get("player_id") if isinstance(e.args, dict) else None
                pid = pid if pid is not None else e.player
                if pid is not None and str(pid) in seat_of:
                    actor = seat_of[str(pid)]
                    break
        out.append(actor)
    return out


DRAFT_ROUND_TEXT = {"pick1": "Action card draft, first pick: every player is offered action cards",
                    "pick2": "Action card draft, second pick: every player is offered the action cards the other one passed",
                    "keep": "Action card draft, last round: every player has 3 action cards and keeps 2 of them, of two different action cards"}


def _draft_option_steps(steps: list, rounds: dict) -> tuple[list, int]:
    """Before the step where a round of the action card draft starts (the first log event of that round) a step that shows the options of both players and no choice
    yet; the choices then appear one log event at a time. Returns the new steps and how many were added."""
    out, added, prev_stage = [], 0, None
    for st in steps:
        d = st["state"].get("draft")
        stage = d["stage"] if d else None
        if stage in DRAFT_ROUND_TEXT and stage != prev_stage:
            pre_d = {**d, "choice": [None, None], "kept": [[], []], "picked": [p[:1] if stage == "pick2" else ([] if stage == "pick1" else p) for p in d["picked"]]}
            out.append({**st, "state": {**st["state"], "draft": pre_d}, "label": DRAFT_ROUND_TEXT[stage], "label_pov": None, "options": None, "actor": None, "_obj": rounds.get(stage)})
            added += 1
        prev_stage = stage
        out.append(st)
    return out, added


def building_cells(state_building: dict) -> list[list[int]]:
    t = state_building["type"]
    if not knows_shape(t):
        return []
    return [list(c) for c in footprint_cells(shape_of(t), (state_building["x"], state_building["y"]), state_building["rotation"])]


def state_view(state: GameState) -> dict:
    s = state.to_dict()
    s["main_deck_size"], s["endgame_deck_size"] = len(s["main_deck"]), len(s["endgame_deck"])
    s["main_discard_size"] = len(s["main_discard"])
    for k in STATE_DROP:
        s.pop(k, None)
    for p, ps in zip(s["players"], state.players):
        p["score"] = tracks.score(ps.appeal, ps.conservation)
        p["hand_limit"] = hand_limit(ps)
        p["income"] = tracks.income_from_appeal(ps.appeal) + (map_ability_income(state, ps) if ps.map_id in ("5", "5a") else 0)       # the money at a break: the appeal track, and Park Restaurant's 1 per covered space next to the restaurant
        for b in p["buildings"]:
            b["cells"] = building_cells(b)
    return s


def card_catalog(keys: set[str], marine_worlds: bool = False) -> dict[str, dict]:
    cards = data.cards_by_key()
    out = {}
    for k in sorted(keys):
        c = cards.get(k)
        if not c:
            out[k] = {"name": k, "type": "unknown"}
            continue
        entry = {"name": c.get("name", k), "type": c["card_type"], "bga_id": c.get("bga_id")}
        mw = f"{k}_MW" if marine_worlds and (CARD_DIR / f"{k}_MW.webp").exists() else k          # (a card whose icons changed in Marine Worlds: scripts/build_mw_card_images.py)
        if (LARGE_DIR / f"{mw}.webp").exists():
            entry["large"] = f"/cards_large/{mw}.webp"
        if (CARD_DIR / f"{mw}.webp").exists():
            entry["image"] = f"/cards/{mw}.webp"
        elif c["card_type"] in IMAGE_DIR and c.get("bga_id"):
            entry["image"] = f"/img/{IMAGE_DIR[c['card_type']]}/{c['bga_id']}.jpg"
        if c["card_type"] == "animal":
            entry.update(size=c.get("size"), price=c.get("price"), appeal=c.get("appeal"))
        out[k] = entry
    return out


def _card_keys(obj: Any, out: set[str]) -> None:
    if isinstance(obj, str):
        if re.fullmatch(r"[ASPF]\d{3}", obj):
            out.add(obj)
    elif isinstance(obj, list):
        for x in obj:
            _card_keys(x, out)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _card_keys(k, out)
            _card_keys(v, out)


def map_view(map_id: str) -> dict:
    m = data.map_by_id(map_id)
    geo = m["geometry"] or {}
    base = map_quirks.base_map_id(map_id)
    return {"id": base, "name": m["name"], "image": f"/maps/map-{PICTURE_OF.get(base, base)}.jpg",
            "hexes": geo.get("hexes", []), "placement_bonuses": geo.get("placement_bonuses", []),
            "special_hexes": geo.get("special_hexes", []), "bonus_slots": geo.get("bonus_slots", []),
            "association_bonuses": association.map_bonuses(base)}


def build_replay_view(raw_log: dict, record: TableRecord, with_states: bool = False):
    """The replay of one table as JSON. With `with_states` it returns (view, states): the engine state of every step (None where the engine did not play it), for forking."""
    parsed: ParsedLog = parse_log(raw_log)
    seats = [str(p.id) for p in parsed.players]
    maps = None
    if record.player_maps and all(pid in record.player_maps for pid in seats):
        maps = [record.player_maps[pid] for pid in seats]
    setup, config, seed = game_from_log(parsed, maps=maps, marine_worlds=record.marine_worlds if record.player_maps else None)
    if maps is None:
        maps = config.maps
    names = {str(p.id): p.name for p in parsed.players}
    groups = [move_groups(mv, names) for mv in parsed.moves]
    split = frozenset(order for g in groups for _, order in g[1:])         # every effect (log line) of a move is a step of its own
    rep: Replay = build_replay(parsed, setup, config, seed, split)
    colors = {str(p["id"]): p.get("color") for p in raw_log["data"].get("players") or [] if isinstance(p, dict)}
    eng = build_engine_replay(parsed, rep, {pid: i for i, pid in enumerate(config.player_ids)})
    known_prefix = len(seed.main_order)                                       # the cards of the draw pile whose order the log tells; the rest is a random guess
    full_deck = len(rep.states[0].main_deck) if rep.states else 0
    steps = []
    for mv, final, g in zip(rep.moves, rep.states, groups):
        me = eng.moves[mv.index]
        views = [state_view(s) for s in rep.substates.get(mv.index, [])] + [state_view(final)]
        labels = [label for label, _ in g]
        labels_pov = [group_labels(mv, names, pid) for pid in config.player_ids]
        if len(labels) != len(views):                                       # setup moves, or a move without effects: one step
            views, labels = views[-1:], [step_label(mv, names)]
            labels_pov = [[step_label(mv, names, pid)] for pid in config.player_ids]
        source = ["log"] * len(views)
        objs: list = [None] * len(views)                                   # the engine state of each step (forking starts from it)
        if mv.index in rep.draft_engine:                                    # the action card draft, played by the engine with the choices of the log
            objs[-1] = rep.draft_engine[mv.index]
        if me.end is not None:                                              # the engine played this move and agrees with the log
            logged = views[:]
            engine_vals: dict = {}
            engine_break: dict = {}
            for i, (_, start) in enumerate(g[1:]):                            # sub-step i ends where the next effect starts
                before = me.state_before(start) if len(g) == len(views) else None
                if before is not None:
                    views[i], source[i] = state_view(before), "engine"
            views[-1], source[-1] = state_view(me.end), "engine"
            objs[-1] = me.end
            for i, (_, start) in enumerate(g[1:]):
                if len(g) == len(views) and source[i] == "engine":
                    objs[i] = me.state_before(start)
            for i, src in enumerate(source):                                  # the engine refills the display when the action ends, the log at its fillPool event
                if src == "engine":
                    engine_vals[i] = [{f: p[f] for f in GAIN_FIELDS} for p in views[i]["players"]]
                    engine_break[i] = views[i]["break_position"]
                    for k in TIMED_BY_LOG:
                        views[i][k] = logged[i][k]
                    for mine, theirs in zip(views[i]["players"], logged[i]["players"]):          # the engine applies some effects earlier than the log shows them
                        for f in LOG_TIMED_PLAYER_FIELDS:
                            mine[f] = theirs[f]
                        mine["flags"]["m9_removed"] = theirs["flags"].get("m9_removed", 0)           # map 9: the marker goes at the logged line
        options = [None] * len(views)
        if me.end is not None:                                              # what the engine lets the player do next, at each engine step
            for i, src in enumerate(source):
                if src == "engine":
                    options[i] = step_options(me.end if i == len(views) - 1 else me.state_before(g[i + 1][1]))
        for i, o in enumerate(options):
            v = views[i]
            if o is not None and o.get("effects") and i in engine_vals:
                # a gain the log already shows (the engine resolves it a step later) is not offered any more
                seat = o["seat"]
                shown = [e for e in o["effects"] if not (e.get("kind") == "gain" and e.get("res") in GAIN_FIELDS
                                                         and v["players"][seat][e["res"]] - engine_vals[i][seat][e["res"]] >= e.get("n", 1))]
                # the same for a Jumping effect: the log already moved the break token, the engine does it when the effect is resolved
                shown = [e for e in shown if not (e.get("kind") == "jumping" and v["break_position"] - engine_break[i] >= e.get("n", 1))]
                if len(shown) != len(o["effects"]):
                    options[i] = o = {**o, "effects": shown}
            if o is not None and o["prompt"] == "choose_action_card" and (v["current_action"] or v["active_player"] != o["seat"]):
                options[i] = None                                          # the engine is a step ahead of the log here (it ends the turn inside the last action)
        actors = group_actors(mv, g, {pid: i for i, pid in enumerate(config.player_ids)}) if len(g) == len(views) else [None] * len(views)
        steps += [{"move_id": mv.move_id, "label": lb, "state": v, "engine": {"source": src, "status": me.status, "detail": me.detail[:300]}, "options": o, "actor": ac,
                   "label_pov": [lp[i] if lp[i] != lb else None for lp in labels_pov] if any(lp[i] != lb for lp in labels_pov) else None,
                   "_obj": objs[i]}
                  for i, (lb, v, src, o, ac) in enumerate(zip(labels, views, source, options, actors))]
    # a step without any text (a state update the log does not word) is not shown: its changes are in the state of the next step. The first step stays.
    keep = [i == 0 or bool(st["label"].strip()) for i, st in enumerate(steps)]
    setup_steps = rep.setup_moves - sum(1 for i in range(min(rep.setup_moves, len(steps))) if not keep[i])
    steps = [st for st, k in zip(steps, keep) if k]
    for st in steps:
        st["state"]["main_deck_known"] = max(0, min(len(st["state"]["main_deck"]), known_prefix - (full_deck - len(st["state"]["main_deck"]))))
    steps, extra = _draft_option_steps(steps, rep.draft_engine and rep.draft_rounds or {})
    setup_steps += extra
    objs_by_step = [st.pop("_obj", None) for st in steps]
    for i, st in enumerate(steps):
        st["index"] = i
        o = objs_by_step[i]                                                  # a step can be forked where the engine played it and a decision is waiting
        st["fork"] = o is not None and o.prompt is not None and (o.prompt.kind == "draft" or o.phase.value not in ("setup", "over", "scoring"))
    states = [st["state"] for st in steps]
    keys: set[str] = set()
    _card_keys(states, keys)
    _card_keys(config.base_projects, keys)
    view = {
        "table_id": parsed.table_id,
        "marine_worlds": config.marine_worlds,
        "players": [{"seat": i, "id": pid, "name": names.get(pid, pid), "color": colors.get(pid)} for i, pid in enumerate(config.player_ids)],
        "maps": [map_view(m) for m in config.maps],
        "base_projects": config.base_projects,
        "result": [{k: r.get(k) for k in ("id", "name", "score", "rank")} for r in parsed.result or []],
        "setup_steps": setup_steps,
        "cards": card_catalog(keys, bool(config.marine_worlds)),
        "engine": eng.summary(),
        "steps": steps,
    }
    return (view, objs_by_step) if with_states else view
