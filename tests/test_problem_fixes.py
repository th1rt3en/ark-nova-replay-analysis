"""The problems of docs/problem_report.md that were fixed stay fixed: each log below was a mismatch or an illegal move of the differential test (the engine against BGA's log)."""
from pathlib import Path

import pytest

from ark_nova.engine import animal_abilities
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential

LOGS = Path(__file__).resolve().parents[1] / "log_examples"
# table -> what was wrong
FIXED = {
    "865382491": "per-icon reputation of a project counted the sponsor that the log plays later",
    "814842703": "Dominance gave a base project that BGA did not give",
    "820206282": "Dominance (same)",
    "811076698": "a sponsor played before the break started was paid its income twice",
    "806276023": "the appeal of an overflowing reputation comes before the appeal income",
    "832292660": "kiosk income of a player without kiosks, and the Sea Animal Magnet takes sponsors with the sea animal icon",
    "804988782": "Sea Animal Magnet takes the Marine Biologist",
    "886820039": "Sea Animal Magnet takes the Sea Turtle Tank (Marine Worlds)",
    "888792457": "a take-in-range bonus closes the gap in the display but adds no new card",
    "906045803": "the display is refilled when the first player's effects are done",
    "837033009": "tokens of two Breeding sponsors used as icons",
    "844027463": "Venom: an extra action that removes a token takes the early payment back",
    "854263310": "Diversity Researcher builds over water without the Terrain Build price",
    "874269610": "enlarging an enclosure that fills the map pays the 7 appeal",
    "826568675": "the replay's appeal track ends at 113",
    "814075010": "a Clever of the other player in the break",
    "858199959": "Constriction counts the appeal before the animal's own gains",
    "820534913": "a release names an empty enclosure",
    "846710292": "a category university's search comes before the hunter effect it follows in the log",
    "842580036": "Scuba Dive 3 of the sponsor and the animal's own Scuba Dive X",
    "881630407": "the display was refilled between two snaps",
    "877649220": "a project supported in this turn covers the income slot that the break pays",
    "819962687": "a Symbiosis that nothing in the log uses is skipped",
    "894764261": "peaceful Pilfering 1: 3 money or a card",
    "805339373": "a Constriction ignores the appeal that the triggers of the animal gave",
}


def test_the_card_icons_that_a_magnet_looks_for():
    assert animal_abilities._sea_animal("S266", False, any_card=True)               # the Marine Biologist
    assert animal_abilities._sea_animal("S250", True, any_card=True)                # the Sea Turtle Tank has the icon in Marine Worlds only
    assert not animal_abilities._sea_animal("S250", False, any_card=True)
    assert animal_abilities._sea_animal("S278", False, any_card=True)               # the Amazon House
    assert not animal_abilities._sea_animal("S266", False)                          # (an animal is what the symbiosis looks for)


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table", sorted(FIXED))
def test_a_fixed_problem_stays_fixed(table):
    path = LOGS / f"{table}.json"
    if not path.exists():
        pytest.skip("log not available")
    parsed = parse_log(str(path))
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    assert not rep.illegal and not rep.mismatches, (FIXED[table], rep.illegal + rep.mismatches)
