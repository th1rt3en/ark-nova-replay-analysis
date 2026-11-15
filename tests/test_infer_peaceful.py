"""`infer_peaceful` (the fallback until the index carries BGA's "Peaceful mode" option) on real logs: the signs it accepts must never occur in a game with a hostile event."""
from pathlib import Path

import pytest

from ark_nova.parser import parse_log
from ark_nova.replay.config import infer_peaceful

LOGS = Path(__file__).resolve().parents[1] / "log_examples"
# table -> (peaceful?, why)
CASES = {
    "619074436": (True, "a Venom animal pays an X token and no hostile event shows"),
    "819914551": (True, "a Pilfering 2 animal draws with Sprint"),
    "783434284": (False, "a Clever effect after a Constriction animal comes from another animal: not a sign (it was taken for one)"),
    "662422143": (False, "Constriction and a Clever effect, but hostile events show"),
    "657367963": (False, "the victim was immune: a hostile effect was played"),
}


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table", sorted(CASES))
def test_peaceful_is_inferred_only_from_signs_that_never_show_in_a_normal_game(table):
    path = LOGS / f"{table}.json"
    if not path.exists():
        pytest.skip("log not available")
    expected, why = CASES[table]
    assert infer_peaceful(parse_log(str(path))) is expected, why


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("arena, peaceful", [(True, False), (False, True), (None, True)])
def test_a_game_with_an_arena_rating_is_never_peaceful(arena, peaceful):
    """The index's arena rating decides first (619074436 shows the signs of a peaceful game); without it the log is inferred."""
    from ark_nova.replay.config import game_from_log

    path = LOGS / "619074436.json"
    if not path.exists():
        pytest.skip("log not available")
    _, cfg, _ = game_from_log(parse_log(str(path)), marine_worlds=True, arena=arena)
    assert cfg.peaceful is peaceful


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("arena, option, peaceful", [(True, True, True), (None, False, False), (False, False, False), (None, None, True), (True, None, False)])
def test_bgas_option_beats_the_arena_rating_and_the_log(arena, option, peaceful):
    """The option (103) of the table info / index decides; without it the arena rating (never peaceful), then the log (619074436 shows the signs of a peaceful game)."""
    from ark_nova.replay.config import game_from_log

    path = LOGS / "619074436.json"
    if not path.exists():
        pytest.skip("log not available")
    _, cfg, _ = game_from_log(parse_log(str(path)), marine_worlds=True, arena=arena, peaceful=option)
    assert cfg.peaceful is peaceful


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table, peaceful", [("691447217", True), ("801244007", False)])
def test_a_venom_reef_animal_pays_one_x_token_more_in_a_peaceful_game(table, peaceful):
    """Devil Firefish (Venom + Reef Dweller Inventive): the Inventive X token is paid in any game, the peaceful Venom adds a second one (691447217 turn 17, peaceful);
    a single one (801244007 turn 24) is no sign."""
    from ark_nova.replay.config import infer_peaceful

    path = LOGS / f"{table}.json"
    if not path.exists():
        pytest.skip("log not available")
    assert infer_peaceful(parse_log(str(path))) is peaceful
