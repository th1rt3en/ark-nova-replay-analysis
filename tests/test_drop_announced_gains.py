"""'A gets N x <bonus>' lines that only announce the next line (the bonus' own effect) are not steps of the replay; checked against 10 tables of log_examples."""
from ark_nova.replay.view import _drop_announced_gains


def steps(*labels):
    return [{"label": label, "move_id": i} for i, label in enumerate(labels)]


def kept(*labels):
    s = steps("start", *labels)
    k = _drop_announced_gains(s, [True] * len(s))
    return [s[i]["label"] for i, v in enumerate(k) if v][1:]


def test_gain_snap_build_and_pouch_lines_are_dropped():
    assert kept("A gets 5 x money (map bonus space)", "A gains 5 money (map bonus space)") == ["A gains 5 money (map bonus space)"]
    assert kept("A gets 1 x Snapping (map bonus space)", "A snaps Koala from the display") == ["A snaps Koala from the display"]
    assert kept("A gets 1 x size-2 (map bonus space)", "A adds a size-2 enclosure for free") == ["A adds a size-2 enclosure for free"]
    assert kept("A gets 3 x bonus-kiosk-pavilion", "A adds a Kiosk for free") == ["A adds a Kiosk for free"]
    assert kept("A gets 2 x Pouch (map bonus space)", "A pouches X, Y cards for 4 appeal") == ["A pouches X, Y cards for 4 appeal"]


def test_the_line_stays_when_its_effect_does_not_follow():
    assert len(kept("A gets 1 x xtoken (reputation track bonus)", "A gets 1 x conservation (reputation track bonus)", "A gains 1 conservation (reputation track bonus)")) == 2    # (X tokens at their limit: no gain)
    assert len(kept("A gets 1 x size-2 (map bonus space)", "A gains 21 money (appeal income)")) == 2                                          # (an optional enclosure that was not built)
    assert len(kept("A gets 1 x size-2 (map bonus space)", "B adds a size-2 enclosure for free")) == 2                                         # (another player)
    assert len(kept("A gets 1 x bonus-extra-shift", "A gains 2 appeal (Map 13 quarter bonus)")) == 2                                           # (a bonus that is not in the table)
