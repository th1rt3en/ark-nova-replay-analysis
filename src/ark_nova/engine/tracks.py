"""Appeal / conservation track rules (rules given by the user, verified against the logs in tests/test_tracks.py).

Appeal: 0..113. Conservation: 0..41. Gains above a limit are lost. Score = appeal + conservation points, where the
conservation track gives 2 points per step up to 10 conservation (starting at -14 for 0) and 3 points per step after that.
The game end is triggered when a player's score reaches 100 (the appeal and conservation markers meet on the shared track).
"""

MAX_APPEAL = 113
MAX_CONSERVATION = 41
END_TRIGGER_SCORE = 100
PROTECTED_BELOW_APPEAL = 5          # below 5 appeal a player is protected from venom, pilfer, constrict, hypnosis

# (appeal at which the segment ends, appeal needed per income step); income is 5 at appeal 0
_INCOME_SEGMENTS = [(5, 1), (17, 2), (32, 3), (56, 4), (96, 5), (MAX_APPEAL, 6)]


def clamp_appeal(a: int) -> int:
    return max(0, min(MAX_APPEAL, a))


def clamp_conservation(c: int) -> int:
    return max(0, min(MAX_CONSERVATION, c))


def income_from_appeal(appeal: int) -> int:
    """Break money income given by the appeal track: 5 at 0, +1 per appeal up to 5 appeal (10), then +1 per 2 appeal up to 17
    (16), per 3 up to 32 (21), per 4 up to 56 (27), per 5 up to 96 (35), then per 6 (37 at 113)."""
    appeal = clamp_appeal(appeal)
    income, start = 5, 0
    for end, step in _INCOME_SEGMENTS:
        if appeal <= end:
            return income + (appeal - start) // step
        income += (end - start) // step
        start = end
    return income


def conservation_points(c: int) -> int:
    """Score given by the conservation track: -14 at 0, +2 per step up to 10 conservation (6), then +3 per step (99 at 41)."""
    c = clamp_conservation(c)
    return 2 * c - 14 if c <= 10 else 3 * c - 24


def score(appeal: int, conservation: int) -> int:
    return clamp_appeal(appeal) + conservation_points(conservation)


def is_protected(appeal: int) -> bool:
    return appeal < PROTECTED_BELOW_APPEAL


def end_triggered(appeal: int, conservation: int) -> bool:
    return score(appeal, conservation) >= END_TRIGGER_SCORE


MAX_REPUTATION = 15
# reputation track bonuses, gained when a step is reached (verified on the logs: single-step gains fire exactly these)
REPUTATION_BONUSES = {5: {"upgrade": 1}, 10: {"conservation": 1}, 11: {"xtoken": 1}, 13: {"conservation": 1}, 14: {"xtoken": 1}}
# gaining reputation beyond 15 is lost but pays 1 appeal per point lost (rulebook p.13, confirmed)

# Conservation thresholds (see docs/engine_design.md): 2 -> worker or action card upgrade; 5 and 8 -> one of 2 random bonuses
# (removed once taken) or 5 money (always available); 10 -> both players discard one endgame card, once.
BONUS_THRESHOLDS = (2, 5, 8, 10)
