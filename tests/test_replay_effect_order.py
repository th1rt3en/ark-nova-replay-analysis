"""The player chooses the order in which the effects of one action are resolved (the gains of a university, the bonus of a conservation threshold, the pouch of an animal ...); the engine offers every
pending effect, and the replay harness (`replay/differential.py`) has to resolve them in the order the log shows. Seven turns of real games that it got wrong, found by replaying a random sample of
games; each is checked as a whole game with the maps of its players (the harness skips association and build turns of a player whose map it cannot infer, so the plain fixed-logs test would pass them
without looking). The logs are the local ones (`log_examples/`, not in git)."""
from pathlib import Path

import pytest

from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential

LOGS = Path(__file__).resolve().parents[1] / "log_examples"
# table -> (map of both players, Marine Worlds, turn, what the log does)
CASES = {
    "613850149": (("8", "8"), True, 46, "a university: the 2 reputation come first, its track bonus upgrades a card, then the conservation 2 choice hires a worker"),
    "634830005": (("1a", "1a"), False, 54, "a university: the reputation gain lifts the conservation to 8 (track bonus), the player then chooses 2 reputation at 8"),
    "646886236": (("7a", "7a"), False, 58, "an animal: the conservation 8 choice, the card of the reputation track, the appeal, and only then the pouch under the animal"),
    "719833428": (("7a", "7a"), False, 37, "the choice at conservation 5 that comes after a reputation gain"),
    "752201952": (("1a", "1a"), True, 32, "the choice at conservation 2 (hire) after the reputation gain and its track bonus"),
    "800395439": (("T1", "T1"), True, 49, "a snap that follows the effects the player chose to resolve first"),
    "800604420": (("1a", "1a"), True, 11, "the choice at conservation 2 (hire) after the reputation gain and its track bonus"),
}


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table", sorted(CASES))
def test_effects_are_resolved_in_the_order_of_the_log(table):
    path = LOGS / f"{table}.json"
    if not path.exists():
        pytest.skip("log not available")
    maps, mw, turn, why = CASES[table]
    parsed = parse_log(str(path))
    setup, cfg, seed = game_from_log(parsed, maps=list(maps), marine_worlds=mw)
    rep = build_replay(parsed, setup, cfg, seed)
    diff = run_differential(parsed, rep, {pid: i for i, pid in enumerate(setup.seats)}, chain=True)
    assert diff.results[turn].status == "ok", (why, diff.results[turn].status, diff.results[turn].detail)
