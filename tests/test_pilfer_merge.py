"""The three steps of a pilfered card are one step ("A gives B X from the Pilfering effect")."""
from ark_nova.replay.view import _merge_pilfer


def _step(label, ctx=1):
    return {"label": label, "label_pov": None, "move_id": 1, "state": {"turn_context": ctx}}


def test_pilfer_steps_are_merged_into_the_last_one():
    steps = [_step("start"), _step("A gives Savanna from the Pilfering effect"), _step("B gets Savanna from the Pilfering effect"),
             _step("A gives 1 card to B from Pilfering effect"), _step("B gains 7 appeal (Japanese Macaque)")]
    keep = _merge_pilfer(steps, [True] * len(steps))
    assert keep == [True, False, False, True, True]
    assert steps[3]["label"].endswith("A gives B Savanna from the Pilfering effect")


def test_without_the_summary_the_gets_step_stays():
    steps = [_step("start"), _step("A gives Arcade from the Pilfering effect"), _step("B gets Arcade from the Pilfering effect"), _step("B gains 7 appeal (x)")]
    assert _merge_pilfer(steps, [True] * 4) == [True, False, True, True]
    assert steps[2]["label"].endswith("A gives B Arcade from the Pilfering effect")
