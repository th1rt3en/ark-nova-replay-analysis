from ark_nova.replay.view import wave_labels


def _step(mid, label, pov=None, display=None):
    return {"move_id": mid, "label": label, "label_pov": pov, "state": {"display": display or []}}


def test_marked_card_is_counted_and_named():
    steps = [_step(211, "X marks American Bison from display"),
             _step(212, "Removing 0 cards of the display due to Wave icons reveal:"),
             _step(212, "Alpaca is not discarded and given to vinny_boy (Mark effect)"),
             _step(212, "The display is replenished with Emu")]
    wave_labels(steps)
    assert steps[1]["label"] == "Removing 1 card from the display due to Wave icons reveal: Alpaca"
    assert steps[2]["label"] == "Alpaca is not discarded and given to vinny_boy (Mark effect)"


def test_discarded_and_marked_together():
    steps = [_step(5, "Removing 1 cards of the display due to Wave icons reveal: Zooplankton"),
             _step(5, "Alpaca is not discarded and given to P (Mark effect)")]
    wave_labels(steps)
    assert steps[0]["label"] == "Removing 2 cards from the display due to Wave icons reveal: Zooplankton, Alpaca"


def test_plain_wave_says_1_card():
    steps = [_step(27, "Removing 1 cards of the display due to Wave icons reveal: Breeding Program", [None, "Removing 1 cards of the display due to Wave icons reveal: Breeding Program"]),
             _step(28, "Alpaca is not discarded and given to P (Mark effect)")]
    wave_labels(steps)
    assert steps[0]["label"] == "Removing 1 card from the display due to Wave icons reveal: Breeding Program"
    assert steps[0]["label_pov"][1] == steps[0]["label"]


def test_nothing_removed_is_worded_with_from():
    steps = [_step(9, "Removing 0 cards of the display due to Wave icons reveal:")]
    wave_labels(steps)
    assert steps[0]["label"] == "Removing 0 cards from the display due to Wave icons reveal:"


def test_break_removal_names_the_marked_card_too():
    steps = [_step(163, "Replenishing partner zoos and universities", display=["A527", "A441", "A526"]),
             _step(163, "Removing first two cards of the display: European Bison"),
             _step(163, "Coconut Lorikeet is not discarded and given to vinny_boy (Mark effect)"),
             _step(163, "The display is replenished with Waza Small Animal Program, Expert On Asia")]
    wave_labels(steps)
    assert steps[1]["label"] == "Removing first two cards from the display: Coconut Lorikeet, European Bison"


def test_break_removal_without_marks_says_from():
    steps = [_step(7, "Removing first two cards of the display: A, B")]
    wave_labels(steps)
    assert steps[0]["label"] == "Removing first two cards from the display: A, B"
