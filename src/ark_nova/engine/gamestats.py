"""The statistics of a game, kept by the engine while it is played (`GameState.stats`, one dict per player), for the end page of a live game.

They are part of the state, so a move that is taken back takes its numbers back with it, and a game that is played again gives the same numbers. What is counted:

- `turns`, `actions` (per kind of action card chosen), `passes` (an action card put back on slot 1 for an X token);
- `money_gained` / `money_spent` and `x_gained` / `x_used`, counted where the resource changes (every gain goes through `game._gain`, every payment through `spent`);
- `assoc`: the tasks of the Association action (2 reputation, partner zoo, university, project), `animals_played`, `animals_released`, `sponsors_played`, `breaks` (triggered);
- `points`: the points of the score (appeal + conservation points) by where they were scored: Animals / Sponsors / Association (= projects) while that kind of action
  is running, the final scoring of the sponsors under `sponsors`, and everything else (build, cards, the break's income, the endgame cards) under `others`. The score at the start
  of the game (-14 and what the map gives at once) is not counted: it is kept apart as `start`, and the sources add up to the score minus `start`.
"""
import copy

from ark_nova.engine import tracks

ACTION_TYPES = ("build", "animals", "association", "sponsors", "cards")
ASSOCIATION_TASKS = ("reputation", "partner", "university", "conservation")
POINT_SOURCES = ("animals", "sponsors", "projects", "others")
_FROM_ACTION = {"animals": "animals", "sponsors": "sponsors", "association": "projects"}


def blank() -> dict:
    return {"turns": 0, "actions": {t: 0 for t in ACTION_TYPES}, "passes": 0, "money_gained": 0, "money_spent": 0, "x_gained": 0, "x_used": 0,
            "assoc": {t: 0 for t in ASSOCIATION_TASKS}, "animals_played": 0, "animals_released": 0, "sponsors_played": 0, "breaks": 0,
            "points": {s: 0 for s in POINT_SOURCES}, "booked": 0, "start": 0}


def ensure(state) -> list:
    """The stats of the state (made on first use: a state from before the stats existed has none)."""
    if len(state.stats) != len(state.players):
        state.stats = [blank() for _ in state.players]
        for st, p in zip(state.stats, state.players):
            st["start"] = tracks.score(p.appeal, p.conservation)      # (the score the game starts with: not part of the sources)
    return state.stats


def final(state) -> list[dict]:
    """The stats with the icon counts of each zoo (what the end screen shows)."""
    out = copy.deepcopy(ensure(state))
    for st, p in zip(out, state.players):
        st["icons"] = {k: v for k, v in sorted(p.icons.items()) if v}
    return out


def count(state, seat: int, key: str, n: int = 1, sub: str | None = None) -> None:
    st = ensure(state)[seat]
    if sub is None:
        st[key] += n
    else:
        st[key][sub] += n


def spent(state, seat: int, n: int) -> None:
    """`n` money was paid."""
    if n > 0:
        ensure(state)[seat]["money_spent"] += n


def money(state, seat: int, delta: int) -> None:
    st = ensure(state)[seat]
    st["money_gained" if delta > 0 else "money_spent"] += abs(delta)


def xtokens(state, seat: int, delta: int) -> None:
    if delta:
        st = ensure(state)[seat]
        st["x_gained" if delta > 0 else "x_used"] += abs(delta)


def source_of(current_action) -> str:
    ca = current_action
    return _FROM_ACTION.get(ca.get("type") if ca else None, "others")


def scores(state) -> list[int]:
    return [tracks.score(p.appeal, p.conservation) for p in state.players]


def book(state, seat: int, source: str, points: int) -> None:
    """Points that were scored at once under `source` (the final scoring): the step's own accounting leaves them out."""
    st = ensure(state)[seat]
    st["points"][source] += points
    st["booked"] += points


def account_points(state, before: list[int], booked_before: list[int], running) -> None:
    """After a step: the change of each score (less what `book` has booked in it) goes to the kind of action that was running (`running`: the action before the step,
    or the one it started)."""
    source = source_of(running or state.current_action)
    for s, st in enumerate(ensure(state)):
        delta = tracks.score(state.players[s].appeal, state.players[s].conservation) - before[s] - (st["booked"] - booked_before[s])
        if delta:
            st["points"][source] += delta
