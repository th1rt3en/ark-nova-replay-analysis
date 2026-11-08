"""The statistics count a partner zoo / university that comes free (conservation bonus, reputation track, placement bonus of the map), not only the ones of an Association task."""
from ark_nova.engine import association
from ark_nova.engine.state import Token
from test_partner_zoo_bonuses import in_action


def test_a_free_tile_counts_as_taken_but_free_reputation_does_not():
    s = in_action()
    s.board_tokens += [Token(701, "partner-Europe", "association_3"), Token(702, "fac-science-bird", "association_4")]
    association.take_tile(s, s.players[0], {"partner": "Europe"})
    association.take_tile(s, s.players[0], {"university": "fac-science-bird"})
    st = s.stats[0]["assoc"]
    assert (st["partner"], st["university"], st["reputation"], st["conservation"]) == (1, 1, 0, 0)
    assert s.stats[1]["assoc"]["partner"] == 0
