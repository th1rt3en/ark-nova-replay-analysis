"""Map inference from a log (no BigQuery index): the first building of a player can be a sponsor's free Victory Column."""
from pathlib import Path

import pytest

from ark_nova.parser.log import parse_log
from ark_nova.parser.setup import extract_setup
from ark_nova.replay.config import infer_maps

LOG = Path(__file__).resolve().parents[1] / "log_examples" / "920295323.json"


@pytest.mark.skipif(not LOG.exists(), reason="log_examples/920295323.json not present")
def test_victory_column_first_building_tells_the_map():
    parsed = parse_log(LOG)
    seats = extract_setup(parsed).seats
    assert infer_maps(parsed, seats) == ["T1", "T1"]          # (Propaganda Panda's first build list is the S274 Victory Column's: the border cells)
