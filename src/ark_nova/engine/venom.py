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
    """Drawing cards from the deck is never blocked by an unpaid Venom: BGA let a player with 1 money draw (839471673 turn 57, 820888770 turn 35) and took the
    2 money only at the end of the turn, after the card was sold for money."""
    return False


def settle(state, seat: int) -> None:
    """Commit the payment of Venom before an irreversible action (the money is taken at the end of the action; with less money the player pays what is left)."""
    p = state.players[seat]
    if due(p):
        p.flags["venom_paid"] = 1                              # (the payment is committed; BGA takes the money when the action is over)
        p.flags["venom_owed"] = 1


def remove_tokens(p, card, owner_paid: bool = True, state=None) -> None:
    """The action of this card is performed (or put back for an X token): its Venom and Constriction tokens go. At the end of a Hypnosis the
    tokens of the opponent's card go too, without counting as the owner's Venom removal (`owner_paid` False)."""
    if "Venom" in card.tokens and owner_paid:
        if p.flags.pop("venom_early", None) and state is not None:
            _g()._gain(state, p.seat, money=VENOM_COST)           # the payment of the first action was early: the turn removed a token after all, nothing is owed
            p.flags.pop("venom_paid", None)
        p.flags["venom_removed"] = 1
    card.tokens = [t for t in card.tokens if t not in ("Venom", "Constriction")]


def strength_penalty(card) -> int:
    return CONSTRICTION_PENALTY * card.tokens.count("Constriction")


def end_of_action(state, seat: int) -> None:
    """The action is over: Venom that is still due is paid now when the player can (BGA does not wait for an extra action that follows); with less than
    2 money the payment waits for the end of the turn, after the player has sold cards for money (839471673 turn 57)."""
    p = state.players[seat]
    if (p.flags.get("venom_owed") or due(p)) and p.money >= VENOM_COST:
        p.flags.pop("venom_owed", None)
        p.flags["venom_early"] = 1                               # (an extra action of this turn that removes a Venom token takes the payment back: 844027463 turn 34)
        _g()._gain(state, seat, money=-VENOM_COST)
        p.flags["venom_paid"] = 1


def finish_turn(state, seat: int) -> None:
    """End of the player's turn: pay for Venom that is still due. A player with less than 2 money who can still sell cards at the Commercial Harbor
    (map 4) pays after the sale (`pay_late`, 839471673 turn 57)."""
    p = state.players[seat]
    if p.flags.pop("venom_owed", None) or due(p):
        if p.money < VENOM_COST and p.map_id in ("4", "4a") and p.hand:
            p.flags["venom_late"] = 1
        else:
            _g()._gain(state, seat, money=-min(VENOM_COST, p.money))
    p.flags.pop("venom_removed", None)
    p.flags.pop("venom_paid", None)
    p.flags.pop("venom_early", None)


def pay_late(state, seat: int) -> None:
    p = state.players[seat]
    if p.flags.pop("venom_late", None):
        _g()._gain(state, seat, money=-min(VENOM_COST, p.money))


def give_venom(state, seat: int, n: int) -> None:
    """Venom n by `seat`: the other player gets a token on their cards at strength 1 (and 2) when they are ahead on appeal."""
    me, other = state.players[seat], state.players[1 - seat]
    start = (state.current_action or {}).get("appeal_start")            # the appeal when the action began: what the animal gains itself does not count (105 logged Venoms)
    mine, theirs = (start[seat], start[1 - seat]) if start else (me.appeal, other.appeal)
    if theirs > mine and not _tracks().is_protected(other.appeal) and "S225" not in other.sponsors:
        for card in other.action_cards[:n]:
            card.tokens.append("Venom")


def give_constriction(state, seat: int) -> None:
    me, other = state.players[seat], state.players[1 - seat]
    if _tracks().is_protected(other.appeal) or "S225" in other.sponsors:                            # below 5 appeal a player is protected
        return
    ahead = (other.appeal > me.appeal) + (other.conservation > me.conservation)          # (the appeal now: the animal's own appeal and the sponsors' triggers are effects of their own that the player may resolve first)
    for card in other.action_cards[::-1][:ahead]:                       # the cards at strength 5, then 4
        card.tokens.append("Constriction")


def clear_at_break(state) -> None:
    """Every token on the action cards goes at the break (BGA: 'All tokens are removed from player cards'), Multiplier tokens too."""
    for p in state.players:
        p.tokens = [t for t in p.tokens if not t.location.startswith("actionCard_")]
        for c in p.action_cards:
            c.tokens = []
