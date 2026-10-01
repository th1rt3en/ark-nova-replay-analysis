"""The Cards action (variants 0 and 1 so far).

Rules (upstream action card texts + verified against the logs, see docs/engine_design.md):
- choosing the card advances the break token by 2;
- strength -> number of cards to take (strengths above 5 count as 5):
    level I : 1, 1, 2, 2, 3        level II: 1, 2, 2, 3, 4
- then discard 1 card, at strength 1 / 3 / 5+ (level I) and 2 / 4 / 5+ (level II); variant 1 ("Keep cards") never discards;
- level I takes only from the deck; level II may take each card from the deck or from the display within reputation range;
- snap instead: take exactly 1 display card (ANY display card, the reputation range does not apply; verified on the logs, the
  upstream card text says "within range") and no discard, at strength 5+ (level I) / 3+ (level II).
Reputation range (display slots from the left): reputation 0: 1, 1-2: 2, 3-5: 3, 6-8: 4, 9-11: 5, 12+: 6.
"""
SUPPORTED_VARIANTS = (0, 1, 2, 3, 4)
# variant 2 (Digging cards): Digging X before drawing (X = 1 at level I, 2 at level II); variant 3 (Snap cards): snapping from strength 3 (level I)
# / 2 (level II), 2 cards at strength 5 at level II; variant 4 (Clever cards): after the action place any action card on slot 1, for 2 money at
# level I and free at level II. The draw and discard tables are those of the standard card.
BREAK_ADVANCE = 2

_DRAW = {1: (1, 1, 2, 2, 3), 2: (1, 2, 2, 3, 4)}
_DISCARD_AT = {1: (1, 3, 5), 2: (2, 4, 5)}
_SNAP_FROM = {1: 5, 2: 3}
_SNAP_FROM_VARIANT_3 = {1: 3, 2: 2}
CLEVER_COST = {1: 2, 2: 0}


def _g():
    from ark_nova.engine import game
    return game


def reputation_range(reputation: int) -> int:
    """Number of display slots (counted from slot 1) a player can take cards from."""
    if reputation <= 0:
        return 1
    if reputation <= 2:
        return 2
    if reputation <= 5:
        return 3
    if reputation <= 8:
        return 4
    if reputation <= 11:
        return 5
    return 6


def draw_count(level: int, strength: int) -> int:
    return _DRAW[level][min(strength, 5) - 1]


def discard_count(level: int, variant: int, strength: int) -> int:
    if variant == 1:
        return 0
    s = min(strength, 5)
    return 1 if s in _DISCARD_AT[level] else 0


def snap_allowed(level: int, strength: int, variant: int = 0) -> bool:
    return strength >= (_SNAP_FROM_VARIANT_3 if variant == 3 else _SNAP_FROM)[level]


def snap_count(level: int, strength: int, variant: int = 0) -> int:
    if not snap_allowed(level, strength, variant):
        return 0
    return 2 if variant == 3 and level == 2 and strength >= 5 else 1


def open_action(state, p, card, strength: int) -> None:
    """The Cards action of any variant: the break token moves, the digging of variant 2 comes first, then drawing or snapping."""
    from ark_nova.engine import effects
    from ark_nova.engine.state import Prompt
    _g().advance_break(state, p.seat, BREAK_ADVANCE)
    snaps = snap_count(card.level, strength, card.variant)
    args = {"remaining": draw_count(card.level, strength), "discard": discard_count(card.level, card.variant, strength),
            "snap": snaps > 0, "snaps_left": snaps, "snapped": 0, "level": card.level, "taken": 0}
    if card.variant == 4:                                      # Clever: any action card to slot 1 after the action
        state.current_action.setdefault("after", []).append({"kind": "slot1", "source": "cards4", "optional": True, "cost": CLEVER_COST[card.level]})
    if card.variant == 2:                                      # Digging X before drawing
        effects.open_prompt(state, p.seat, [{"kind": "digging", "source": "cards2", "n": 1 if card.level == 1 else 2, "optional": True}],
                            {"kind": "prompt", "prompt_kind": "cards_take", "args": args})
        return
    state.prompt = Prompt(kind="cards_take", player=p.seat, args=args)


def deck_only(level: int) -> bool:
    return level == 1
