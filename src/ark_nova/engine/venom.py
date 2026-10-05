"""Venom and Constriction tokens on action cards (rules given by the user).

Venom X (animal): if the other player has more appeal than the player who activates it, they get a Venom token on their action cards at
strength 1 (and 2 for Venom 2). A player who performs an action with a Venom card (or puts it back for an X token) loses that token; if they
removed a token this turn they owe nothing, otherwise they pay 2 money before the turn ends when any Venom token is left on any of their cards
(at any time of the turn; before an irreversible action, drawing cards from the deck, they have to have paid: with less than 2 money that action
is not allowed). Constriction: if the other player is ahead in appeal and in conservation points, their cards at strength 5 and 4 get a token, if
only in one of them the card at strength 5; a card with a token has 2 less strength, the token goes when the action is performed (or put back)
and at the break. Putting a card back with Clever does not remove tokens. `ActionCardState.tokens` holds the tokens.
"""
VENOM_COST = 2
CONSTRICTION_PENALTY = 2


def _tracks():
    from ark_nova.engine import tracks
    return tracks


def _g():
    from ark_nova.engine import game
    return game


def count(p, kind: str) -> int:
    return sum(c.tokens.count(kind) for c in p.action_cards)


def due(p) -> bool:
    """The player still has to pay for Venom this turn."""
    return not p.flags.get("venom_removed") and not p.flags.get("venom_paid") and count(p, "Venom") > 0


def blocked(state, seat: int) -> bool:
    """Irreversible actions (drawing cards from the deck) are not allowed while Venom is due and cannot be paid."""
    p = state.players[seat]
    return due(p) and p.money < VENOM_COST


def settle(state, seat: int) -> None:
    """Pay for Venom before an irreversible action."""
    p = state.players[seat]
    if due(p):
        if p.money < VENOM_COST:
            from ark_nova.engine.effects import IllegalEffect
            raise IllegalEffect("pay for Venom first: not enough money")
        _g()._gain(state, seat, money=-VENOM_COST)
        p.flags["venom_paid"] = 1


def remove_tokens(p, card, owner_paid: bool = True) -> None:
    """The action of this card is performed (or put back for an X token): its Venom and Constriction tokens go. At the end of a Hypnosis the
    tokens of the opponent's card go too, without counting as the owner's Venom removal (`owner_paid` False)."""
    if "Venom" in card.tokens and owner_paid:
        p.flags["venom_removed"] = 1
    card.tokens = [t for t in card.tokens if t not in ("Venom", "Constriction")]


def strength_penalty(card) -> int:
    return CONSTRICTION_PENALTY * card.tokens.count("Constriction")


def end_of_action(state, seat: int) -> None:
    """The action is over: Venom that is still due is paid now (BGA does not wait for an extra action that follows)."""
    p = state.players[seat]
    if due(p):
        _g()._gain(state, seat, money=-min(VENOM_COST, p.money))
        p.flags["venom_paid"] = 1


def finish_turn(state, seat: int) -> None:
    """End of the player's turn: pay for Venom that is still due."""
    p = state.players[seat]
    if due(p):
        _g()._gain(state, seat, money=-min(VENOM_COST, p.money))
    p.flags.pop("venom_removed", None)
    p.flags.pop("venom_paid", None)


def give_venom(state, seat: int, n: int) -> None:
    """Venom n by `seat`: the other player gets a token on their cards at strength 1 (and 2) when they are ahead on appeal."""
    me, other = state.players[seat], state.players[1 - seat]
    if other.appeal > me.appeal and not _tracks().is_protected(other.appeal) and "S225" not in other.sponsors:
        for card in other.action_cards[:n]:
            card.tokens.append("Venom")


def give_constriction(state, seat: int) -> None:
    me, other = state.players[seat], state.players[1 - seat]
    if _tracks().is_protected(other.appeal) or "S225" in other.sponsors:                            # below 5 appeal a player is protected
        return
    ahead = (other.appeal > me.appeal) + (other.conservation > me.conservation)
    for card in other.action_cards[::-1][:ahead]:                       # the cards at strength 5, then 4
        card.tokens.append("Constriction")


def clear_at_break(state) -> None:
    """Every token on the action cards goes at the break (BGA: 'All tokens are removed from player cards'), Multiplier tokens too."""
    for p in state.players:
        p.tokens = [t for t in p.tokens if not t.location.startswith("actionCard_")]
        for c in p.action_cards:
            c.tokens = []
