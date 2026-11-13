"""The cubes of the marks follow the display's log timing in the engine steps of a replay (view.log_timed_marks)."""
from ark_nova.replay.view import log_timed_marks


def tok(i, kind, loc):
    return {"id": i, "type": kind, "location": loc}


def test_a_mark_the_engine_has_already_resolved_is_still_drawn():
    engine = [tok(5, "worker", "reserve_1"), tok(9014, "token", "A436_AmericanBison")]            # (only the later cube is left)
    logged = [tok(5, "worker", "reserve_1"), tok(71, "token", "A526_Alpaca"), tok(73, "token", "A436_AmericanBison")]
    out = log_timed_marks(engine, logged)
    assert [(t["id"], t["location"]) for t in out if t["type"] == "token"] == [(71, "A526_Alpaca"), (73, "A436_AmericanBison")]
    assert [t for t in out if t["type"] == "worker"] == [engine[0]]               # the other tokens stay the engine's


def test_a_mark_the_log_has_resolved_goes():
    engine = [tok(9014, "token", "A436_AmericanBison")]
    logged = []
    assert log_timed_marks(engine, logged) == []


def test_project_supports_are_not_marks():
    engine = [tok(57, "token", "P102_HabitatDiversity_0")]
    assert log_timed_marks(engine, [tok(1, "token", "P999_Other_0")]) == engine
