"""The state travels through JavaScript (the Worker keeps the snapshot of a live table, the browser keeps a fork): its 64-bit RNG state must survive that."""
import json

from ark_nova.engine.game import new_game
from ark_nova.engine.state import GameState


def test_the_rng_state_survives_a_javascript_round_trip():
    state = new_game({"game_mode": "ark360", "marine_worlds_flag": False}, ["1", "2"], 123456789)
    state.rng = 16279607148436791123                                            # (more than 53 bits: a double cannot hold it)
    data = state.to_dict()
    assert isinstance(data["rng"], str)
    again = json.loads(json.dumps(data))                                        # (a JavaScript JSON.parse / JSON.stringify keeps a string as it is, a big number it rounds)
    assert GameState.from_dict(again).rng == 16279607148436791123
    old = dict(data, rng=state.rng)                                             # (a state saved before: a number)
    assert GameState.from_dict(old).rng == 16279607148436791123
