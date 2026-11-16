"""BGA's index labels the T1 layout "Map 0" in some tables: where the log's first-building list fingerprints T1, `game_from_log` plays T1 (790873577: 35 turns disagreed with Map 0)."""
from pathlib import Path

import pytest

from ark_nova.parser import parse_log
from ark_nova.replay.config import game_from_log

LOGS = Path(__file__).resolve().parents[1] / "log_examples"


@pytest.mark.skipif(not (LOGS / "790873577.json").exists(), reason="log not available")
def test_a_map_0_label_with_a_t1_log_plays_t1():
    parsed = parse_log(str(LOGS / "790873577.json"))
    _, cfg, _ = game_from_log(parsed, maps=["0", "0"], marine_worlds=True)
    assert cfg.maps == ["T1", "T1"]


@pytest.mark.skipif(not (LOGS / "607674960.json").exists(), reason="log not available")
def test_other_labels_are_left_alone():
    parsed = parse_log(str(LOGS / "607674960.json"))
    _, cfg, _ = game_from_log(parsed, maps=["3a", "3a"], marine_worlds=True)
    assert cfg.maps == ["3a", "3a"]
