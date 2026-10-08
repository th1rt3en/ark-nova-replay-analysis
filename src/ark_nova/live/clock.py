"""The time control of a live game: one clock per seat, set when the table is made.

A clock starts at `start` seconds, which is also the most it can hold. At the start of each turn (after the opponent has confirmed theirs) the player whose turn it is gets
`increment` seconds, up to the maximum. While a player has something to decide their clock runs; when both have (the setup, the discards of a break or of the endgame) both
clocks run. A clock can go below zero and the increment brings it back up; while a player's clock is not above zero the opponent may end the game and win on overtime
(`LiveService.timeout`, a button of the game menu).

The state is a dict kept in the keeper's config (`clock`), in milliseconds, and is only ever changed by the functions here:
`{"mode", "speed", "start", "increment", "remaining": [ms, ms], "running": [bool, bool], "at": ms of the last change (None before the game starts), "turn_key": [turn, seat]}`.
"""
import copy

PRESETS = {"slow": (6 * 60, 118), "normal": (4 * 60, 74), "fast": (3 * 60, 46)}          # speed -> (starting clock, increment) in seconds
DEFAULT_SPEED = "normal"
START_RANGE = (3 * 60, 30 * 60)                                                             # the fine-grained settings, in seconds
INCREMENT_RANGE = (0, 120)


class ClockError(ValueError):
    pass


def options() -> dict:
    """What the lobby offers: the presets and the limits of the fine-grained control."""
    return {"default": DEFAULT_SPEED, "presets": [{"id": k, "start": s, "increment": i} for k, (s, i) in PRESETS.items()],
            "start_range": list(START_RANGE), "increment_range": list(INCREMENT_RANGE)}


def create(spec: dict | None) -> dict:
    """The clock for a time control: `None` = the default speed, `{"speed": "slow"}`, or `{"start": seconds, "increment": seconds}` for the fine-grained one."""
    spec = spec or {}
    if not isinstance(spec, dict):
        raise ClockError("the time control must be an object")
    if "start" in spec or "increment" in spec:
        try:
            start, inc = int(spec["start"]), int(spec["increment"])
        except (KeyError, TypeError, ValueError):
            raise ClockError("send both the starting clock and the increment, in seconds")
        if not START_RANGE[0] <= start <= START_RANGE[1]:
            raise ClockError(f"the starting clock must be {START_RANGE[0] // 60} to {START_RANGE[1] // 60} minutes")
        if not INCREMENT_RANGE[0] <= inc <= INCREMENT_RANGE[1]:
            raise ClockError(f"the increment must be {INCREMENT_RANGE[0]} to {INCREMENT_RANGE[1]} seconds")
        mode, speed = "custom", None
    else:
        speed = spec.get("speed") or DEFAULT_SPEED
        if speed not in PRESETS:
            raise ClockError(f"the speed must be one of {list(PRESETS)}")
        (start, inc), mode = PRESETS[speed], "simple"
    return {"mode": mode, "speed": speed, "start": start * 1000, "increment": inc * 1000, "remaining": [start * 1000, start * 1000], "running": [False, False], "at": None, "turn_key": None}


def settle(clock: dict, now: int) -> dict:
    """A copy of the clock with the time since the last change taken off the clocks that run (it can go below zero: that is how a flag is seen)."""
    c = copy.deepcopy(clock)
    if c.get("at") is not None:
        spent = max(0, now - c["at"])
        for seat in (0, 1):
            if c["running"][seat]:
                c["remaining"][seat] -= spent
    c["at"] = now
    return c


def advance(clock: dict, now: int, to_act: list, turn_key: list | None, over: bool) -> dict:
    """After a move (or the start of the game): settle the clocks, give the increment when a new turn has begun, and set who runs now."""
    c = settle(clock, now)
    if over:
        c["running"] = [False, False]
        return c
    if turn_key is not None and turn_key != c.get("turn_key"):
        seat = turn_key[1]
        c["remaining"][seat] = min(c["start"], c["remaining"][seat] + c["increment"])
        c["turn_key"] = list(turn_key)
    c["running"] = [s in to_act for s in (0, 1)]
    return c


def overtime(clock: dict, now: int, seat: int) -> bool:
    """Is the clock of `seat` at zero or below (it may be stopped: a negative clock stays negative until the increment)?"""
    return settle(clock, now)["remaining"][seat] <= 0


def view(clock: dict, now: int) -> dict:
    """What a page needs to draw the clocks: the time left at `at` and who runs, the server's `now` to correct the page's own clock."""
    return {"mode": clock["mode"], "speed": clock["speed"], "start": clock["start"], "increment": clock["increment"], "remaining": list(clock["remaining"]),
            "running": list(clock["running"]), "at": clock["at"] if clock["at"] is not None else now, "now": now}
