"""The base projects an Assertion offers are in the log (the private `cardIds` of the choice state) and reach the parsed moves."""
from pathlib import Path

from ark_nova.parser.log import parse_log

LOG = Path(__file__).resolve().parents[1] / "log_examples" / "760993552.json"


def test_assertion_offer_is_parsed():
    parsed = parse_log(LOG)
    kept = [m for m in parsed.moves if any(e.type == "pDrawCards" and "with Assertion" in (e.log or "") for e in m.events)]
    assert len(kept) == 1
    offers = [o for m in parsed.moves[max(0, kept[0].index - 3): kept[0].index + 1] for o in m.offers]
    assert offers and len(offers[-1]["cards"]) == 10
    assert "P101_SpeciesDiversity" in offers[-1]["cards"] and "P108" not in "".join(offers[-1]["cards"])
