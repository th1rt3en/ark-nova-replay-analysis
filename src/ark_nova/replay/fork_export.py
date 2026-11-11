"""Exporting a fork as a replay of its own (the engine's format, not BGA's).

A fork is played in the browser: the start position (an engine state) and every move. When the player stops, the page posts both and the server plays the moves again, one
after the other, with the engine (a move that is not legal is refused, so nothing but a game of the engine can be stored). The record has the same layout as the record of a
live game (`live/archive.py`): the viewer header, one step per move with the log text, the decision and the view as a patch, and the statistics of the engine. It is read
without the engine by `replay/from_record.py`, which also makes the numbers of the results table out of the statistics.

A fork may stop anywhere. Its result is then the score at that point, as if the player who is behind had quit: the leader wins, equal scores are a tie.
"""
import dataclasses
import datetime
import json

from ark_nova.engine import gamestats
from ark_nova.engine.actions import Action
from ark_nova.engine.game import IllegalAction, apply, legal_actions
from ark_nova.engine.state import GameState, Phase
from ark_nova.engine.version import ENGINE_VERSION
from ark_nova.live import stepdata
from ark_nova.replay import fork as forking
from ark_nova.replay.options import step_options

RECORD_FORMAT = 1
MAX_ACTIONS = 3000
MAX_BODY = 6_000_000


class ForkExportError(ValueError):
    pass


def _canon(a: Action) -> str:
    return forking._canon(a)


def build_record(table_id, start: GameState, actions: list, players: list, origin: dict) -> dict:
    """The record of the fork that begins at `start` and plays `actions` (dicts {player, kind, args}); `players` = [{id, name, color}] of the two seats."""
    if len(players) != 2:
        raise ForkExportError("two players are needed")
    if len(actions) > MAX_ACTIONS:
        raise ForkExportError("that fork is too long to export")
    names = [str(p.get("name") or f"Player {i + 1}") for i, p in enumerate(players)]
    viewer = stepdata.viewer_header(start)
    viewer["colors"] = [p.get("color") for p in players]
    base = f"fork #{origin['parent_fork']} of table #{table_id}" if origin.get("parent_fork") else f"table #{table_id}"       # (a fork of an exported fork says so)
    viewer["initial_label"] = f"Fork of {base} after step {origin.get('step')}" + (f": {origin['label']}" if origin.get("label") else "")
    viewer["initial_options"] = step_options(start)
    state, eff, steps, kept = start, [], [], []
    for n, item in enumerate(actions, 1):
        act = Action(int(item["player"]), str(item["kind"]), dict(item.get("args") or {}))
        if _canon(act) not in {_canon(a) for a in legal_actions(state)}:
            raise ForkExportError(f"move {n} is not legal in its position")
        try:
            new = apply(state, act)
        except (IllegalAction, NotImplementedError) as e:
            raise ForkExportError(f"move {n} could not be played: {e}") from e
        step = stepdata.step_for(state, act, new, n, eff, names[act.player])
        step["label"] = forking.bga_label(state, act, new, names, names[act.player])          # (the log of the step in BGA's words, as the fork page shows it)
        if new.phase is Phase.OVER:
            step["label"] += "\n" + stepdata.announcement(new, names)
        steps.append({"n": n, "step": step})
        kept.append({"n": n, "action": {"player": act.player, "kind": act.kind, "args": act.args}})
        state = new
    over = state.phase is Phase.OVER
    return {
        "format": RECORD_FORMAT, "kind": "fork", "table_id": str(table_id), "engine_version": ENGINE_VERSION, "status": "finished" if over else "stopped",
        "end_reason": "the game was played to the end" if over else "the fork was stopped before the end", "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "origin": {k: origin.get(k) for k in ("table_id", "step", "seed", "label", "parent_fork")}, "player_ids": [str(p.get("id", i + 1)) for i, p in enumerate(players)], "names": names,
        "start_state": start.to_dict(), "viewer": viewer, "viewer_schema_version": viewer["viewer_schema_version"], "actions": kept, "n_actions": len(kept), "steps": steps,
        "result": result_of(state), "stats": gamestats.final(state), "end": end_info(state),
    }


def position_at(record: dict, step: int) -> GameState:
    """The engine state of an exported fork after `step` of its moves (0 = where it began): the start state with the moves played again."""
    actions = record.get("actions") or []
    if not 0 <= step <= len(actions):
        raise ForkExportError("this fork has no such step")
    state = GameState.from_dict(record["start_state"])
    for item in actions[:step]:
        a = item["action"]
        state = apply(state, Action(int(a["player"]), a["kind"], dict(a.get("args") or {})))
    if state.prompt is None or state.phase in (Phase.SETUP, Phase.OVER, Phase.SCORING):
        raise ForkExportError("no decision is waiting at this step, so it cannot be forked")
    return state


def result_of(state: GameState) -> dict:
    """The result of the game, or, where it was stopped, who leads at that point (the player who is behind counts as having quit)."""
    if state.result is not None:
        return {**dataclasses.asdict(state.result), "stopped": False}
    scores = gamestats.scores(state)
    winner = None if scores[0] == scores[1] else (0 if scores[0] > scores[1] else 1)
    return {"scores": scores, "winner": winner, "conceded": None if winner is None else 1 - winner, "stopped": True}


def end_info(state: GameState) -> dict:
    return {"phase": state.phase.value, "round": state.round, "turn": state.turn, "end_triggered_by": state.end_triggered_by}


def dumps(record: dict) -> str:
    return json.dumps(record, separators=(",", ":"), ensure_ascii=False)
