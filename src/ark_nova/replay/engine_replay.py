"""The replay as played by the rules engine.

`run_differential(..., chain=True)` plays every supported turn of the log with the engine (a turn that matched the log starts the next
one from the engine's own state). This module turns its per-turn results into the states the viewer shows: wherever the engine played
a move and agreed with the log, the step shows the engine's state; where it could not (unsupported rule, illegal logged action,
different outcome) the step keeps the log-built state and says why, so every flag is a to-do for the rules.
"""
from collections import Counter
from dataclasses import dataclass

from ark_nova.engine.state import GameState
from ark_nova.parser.model import ParsedLog
from ark_nova.replay.actions import turn_events
from ark_nova.replay.builder import Replay
from ark_nova.replay.differential import DiffReport, TurnResult, run_differential


@dataclass
class MoveEngine:
    status: str                        # ok | mismatch | illegal | skipped | log (not part of a turn: setup, final scoring)
    detail: str = ""
    end: GameState | None = None       # engine state after the move (status ok only)
    trace: list | None = None          # (event order, engine state after the action, added by the test) of the turn, for the sub-steps of the move

    def state_before(self, order: int) -> GameState | None:
        """The engine state just before the log event `order`: after the last engine action that comes from an earlier event."""
        best = None
        for o, st, added in self.trace or []:
            if o is not None and (o < order or (o == order and added)):        # (an action added before the logged one of that event resolves what the log shows earlier)
                best = st
        return best


@dataclass
class EngineReplay:
    moves: dict[int, MoveEngine]
    report: DiffReport

    def summary(self) -> dict:
        c = Counter(r.status for r in self.report.results.values())
        return {"turns": sum(c.values()), "ok": c["ok"], "mismatch": c["mismatch"], "illegal": c["illegal"], "skipped": c["skipped"],
                "reasons": Counter(r.detail for r in self.report.results.values() if r.status == "skipped").most_common(8)}


def build_engine_replay(parsed: ParsedLog, replay: Replay, seat_of: dict[str, int]) -> EngineReplay:
    diff = run_differential(parsed, replay, seat_of, chain=True)
    turns = turn_events(parsed)
    owner: dict[int, tuple[int, TurnResult]] = {}              # turn marker -> (first turn of the result, result)
    for k, res in diff.results.items():
        for t in range(k, res.last_turn + 1):
            owner[t] = (k, res)
    turn_of = {e.order: k for k, evs in enumerate(turns) for e in evs}
    last_move: dict[int, int] = {}                             # first turn of a result -> its last move
    move_turn: dict[int, int] = {}                             # move index -> turn marker of its last event
    for m in parsed.moves:
        ks = [turn_of[e.order] for e in m.events if e.order in turn_of]
        if ks:
            move_turn[m.index] = ks[-1]
            first = owner.get(ks[-1], (None, None))[0]
            if first is not None:
                last_move[first] = max(last_move.get(first, -1), m.index)
    out: dict[int, MoveEngine] = {}
    for m in parsed.moves:
        k = move_turn.get(m.index)
        first, res = owner.get(k, (None, None))
        if res is None:
            out[m.index] = MoveEngine("log")
            continue
        if res.status != "ok":
            out[m.index] = MoveEngine(res.status, res.detail)
            continue
        trace = [(o, st, added) for _, o, st, added in res.trace]
        if m.index == last_move[first]:
            out[m.index] = MoveEngine("ok", end=res.trace[-1][2], trace=trace)
            continue
        done = [s for mv, _, s, _ in res.trace if mv is not None and mv <= m.index]
        out[m.index] = MoveEngine("ok", end=done[-1], trace=trace) if done else MoveEngine("log", "before the first engine action of the turn")
    return EngineReplay(out, diff)

