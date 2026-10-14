"""The buttons of the placement bonuses name what they give (the bar of the viewer), not "pbonus"."""
from ark_nova.replay.options import effect_name


def test_a_placement_bonus_is_named_after_what_it_gives():
    assert effect_name({"kind": "pbonus", "bonus": {"type": "money", "value": 5}}) == "Placement bonus: 5 money"
    assert effect_name({"kind": "pbonus", "bonus": {"type": "kiosk", "value": 1}}) == "Placement bonus: kiosk"
    assert effect_name({"kind": "pbonus", "bonus": {"type": "upgrade-card", "value": 1}}) == "Placement bonus: upgrade"
    assert effect_name({"kind": "pbonus", "bonus": {"type": "bonus-sponsor", "value": 1}}) == "Placement bonus: marketing token"
    assert effect_name({"kind": "pbonus", "bonus": {"type": "size-2", "value": 1}}) == "Placement bonus: size-2 enclosure"
