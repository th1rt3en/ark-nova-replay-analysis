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
