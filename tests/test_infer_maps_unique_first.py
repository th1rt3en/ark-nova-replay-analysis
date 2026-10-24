"""A first building that is a free unique building (sponsor) has no size-1 list: the map comes from the next build list (table 920319154)."""
from pathlib import Path

import pytest

from ark_nova.parser import parse_log
from ark_nova.replay.config import infer_maps

LOG = Path(__file__).resolve().parent.parent / "log_examples" / "920319154.json"


@pytest.mark.skipif(not LOG.exists(), reason="sample log not present")
def test_first_building_is_a_unique_building():
    assert infer_maps(parse_log(str(LOG)), ["96926419", "86346298"]) == ["T1", "T1"]
