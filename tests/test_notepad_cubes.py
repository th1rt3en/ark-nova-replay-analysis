"""The cubes of the player board's notepad: one cube leaves it for every conservation project the player supports, and the replay shows which space it was.

BGA's association prompt lists the spaces whose cube is still on the notepad, so the prompt before and after a support pin down its space exactly (`_lookahead_slots`).
A support with no such pair (a player's last one) is told by explicit events: the extra action after the cleanup (Determination, maps 3 / 3a), a sponsor played in the
turn (marketing of 1 / 1a, the person sponsor of 14), a draw for the adapt effect (map 13), the continent marker (map 9), a cut-down (13), the animal magnet (12) ...
and, for the spaces whose bonus can be skipped (Fac 4 / 4a, Clever 6 / 6a, Pouch 7 / 7a, Partner-Zoo 8 / 8a), by elimination. Nothing is ever guessed: a support that
nothing identifies marks no cube (`Replay.cube_unresolved`). The logs are the local ones (`log_examples/`, not in git).
"""
from pathlib import Path

import pytest

from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log

LOGS = Path(__file__).resolve().parents[1] / "log_examples"
# table -> what it shows
GAMES = {
    "793386740": "map 11: a project's own upgrade reward is not the notepad's upgrade space; the prompt says which space the support took",
    "687891813": "map 3a: the extra action after the cleanup is the Determination space",
    "692356020": "map 1a: a sponsor played in the supporting turn is the marketing space",
    "684804822": "map 4a: the last support of the game took the Fac space (nothing else was identified)",
    "800634913": "map 14: a sponsor played in the supporting turn is the person sponsor space",
    "729260343": "map 6a: a snap that reads 'snaps ... from the display' after a free building of the project's reward is the Snapping space",
    "798300935": "map 11: three supports, every space marked at the support itself",
}


def _supports(parsed) -> dict:
    sup: dict = {}
    for m in parsed.moves:
        for e in m.events:
            if e.type == "slideMeeples" and "supports a conservation project" in str(e.log):
                pid = str(e.args["meeples"][0]["pId"])
                sup[pid] = sup.get(pid, 0) + 1
    return sup


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table", sorted(GAMES))
def test_every_support_unlocks_exactly_its_notepad_space(table):
    path = LOGS / f"{table}.json"
    if not path.exists():
        pytest.skip("log not available")
    parsed = parse_log(str(path))
    setup, cfg, seed = game_from_log(parsed)
    rep = build_replay(parsed, setup, cfg, seed)
    supports = _supports(parsed)
    final = rep.states[-1].players
    for pid, pl in zip(cfg.player_ids, final):
        used = bin(pl.flags.get("bonus_used", 0)).count("1")
        assert used == supports.get(str(pid), 0), (GAMES[table], pid, used, supports)
    assert rep.cube_checks == [], (GAMES[table], rep.cube_checks)         # BGA's prompts never disagree with what the replay marked
    assert rep.cube_unresolved == [], (GAMES[table], rep.cube_unresolved)


@pytest.mark.skipif(not (LOGS / "793386740.json").exists(), reason="log not available")
def test_the_slot_of_a_support_is_marked_at_the_support_step():
    # 793386740, player 97371917's 1st support (move 59) took the size-2 space (1): the prompt after it says so, the cube is gone from that step on
    parsed = parse_log(str(LOGS / "793386740.json"))
    setup, cfg, seed = game_from_log(parsed)
    rep = build_replay(parsed, setup, cfg, seed)
    seat = [str(p) for p in cfg.player_ids].index("97371917")
    by_move = {m.index: st for m, st in zip(rep.moves, rep.states)}
    assert not by_move[58].players[seat].flags.get("bonus_used", 0) & 0b10
    assert by_move[59].players[seat].flags.get("bonus_used", 0) & 0b10
