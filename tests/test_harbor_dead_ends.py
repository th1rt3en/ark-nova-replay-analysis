"""The Commercial Harbor (maps 4 / 4a) sells a card as a free action beside any prompt. Two ways it stuck a game (found by playing random games, three seeds below):
- an action card was chosen although it left no move of its own (`_has_moves` counted the always-available sale as a move); once the sale was used, the prompt offered nothing;
- the sale was made while a card had to be discarded after a Cards action: the discard that was owed stayed, with no card left to give.
The games are played with two seeded random players and have to reach the end."""
import random

import pytest

from ark_nova.engine.game import apply, legal_actions, new_game
from ark_nova.engine.state import Phase


def _play(seed: int, max_steps: int = 3000):
    st = new_game({"game_mode": "random-mirrored", "marine_worlds_flag": True}, ["1", "2"], seed)
    rnd = [random.Random(seed), random.Random(seed + 1)]
    steps = 0
    while st.phase is not Phase.OVER and steps < max_steps:
        acts = [a for a in legal_actions(st) if a.kind not in ("undo_last", "restart_turn")]
        assert acts, f"seed {seed}: no legal action at {st.prompt.kind if st.prompt else None} after {steps} steps"
        seat = min(a.player for a in acts)
        mine = [a for a in acts if a.player == seat]
        st = apply(st, mine[0] if len(mine) == 1 else mine[rnd[seat].randrange(len(mine))])
        steps += 1
    return st


@pytest.mark.parametrize("seed", [200, 216, 227])
def test_a_game_with_a_harbor_sale_does_not_stick(seed):
    assert _play(seed).phase is Phase.OVER
