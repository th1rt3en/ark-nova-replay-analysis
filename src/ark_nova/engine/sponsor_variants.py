"""Sponsors action card variants 1-4 (texts of the cards, `data/action_cards.json`).

Side actions (`sponsor_side`, one per action, before or after the sponsors are played; the break option keeps the action open for them):
- variant 1 (Money): trade 1 X token for 5 money or 5 money for 1 X token; level II also pay 1 X token or 5 money for 1 reputation;
- variant 2 (Money): the first money the player gains in the action (the break option, a sponsor, an effect of a sponsor) comes with 3 more
  money at level I, 5 at level II (`game._gain` does it, source "Sponsors2 effect" in the logs);
- variant 3 (Sunbathing): discard 1 sponsor from the hand for 4 money; level II: any card, or instead discard any card to play a sponsor
  increase the action strength by 2;
- variant 4 (Snap): discard 1 sponsor from the hand to take any sponsor of the display; level II: after the break option discard any card to
  play a sponsor of the hand and pay money equal to its level.
"""
from ark_nova import data
from ark_nova.engine import sponsors_action
from ark_nova.engine.actions import Action

SIDE_VARIANTS = (1, 3, 4)
TRADE_MONEY = 5
SUNBATHING_MONEY = 4
STRENGTH_BONUS = 2
S2_BONUS = {1: 3, 2: 5}


def _g():
    from ark_nova.engine import game
    return game


def has_side(a) -> bool:
    return a.get("variant", 0) in SIDE_VARIANTS


def legal(state, p) -> list:
    """The side actions that are possible now."""
    a = state.prompt.args
    if not has_side(a) or a.get("side_used"):
        return []
    v, level = a["variant"], a["level"]
    out = []
    hand = sorted(set(p.hand))
    if v == 1:
        if p.x_tokens >= 1:
            out.append(Action(p.seat, "sponsor_side", {"op": "trade_money"}))
        if p.money >= TRADE_MONEY and p.x_tokens < 5:
            out.append(Action(p.seat, "sponsor_side", {"op": "trade_x"}))
        if level >= 2:
            if p.x_tokens >= 1:
                out.append(Action(p.seat, "sponsor_side", {"op": "rep_x"}))
            if p.money >= TRADE_MONEY:
                out.append(Action(p.seat, "sponsor_side", {"op": "rep_money"}))
    elif v == 3:
        for c in hand:
            if level >= 2 or c.startswith("S"):
                out.append(Action(p.seat, "sponsor_side", {"op": "discard_money", "card": c}))
            if level >= 2:
                out.append(Action(p.seat, "sponsor_side", {"op": "discard_strength", "card": c}))
    elif v == 4:
        if level == 1:
            shown = [c for c in dict.fromkeys(state.display) if c and c.startswith("S")]
            for c in hand:
                if c.startswith("S"):
                    out += [Action(p.seat, "sponsor_side", {"op": "discard_snap", "card": c, "take": t}) for t in shown]
        elif a.get("broke"):
            out += [Action(p.seat, "sponsor_side", {"op": "discard_play", "card": c, "play": None}) for c in dict.fromkeys(hand)]       # (BGA lets the card go without a sponsor played)
            for c in hand:
                for k in hand:
                    if k.startswith("S") and (k != c or p.hand.count(k) > 1) and _playable(state, p, k, a):
                        out.append(Action(p.seat, "sponsor_side", {"op": "discard_play", "card": c, "play": k}))
    return out


def _playable(state, p, k: str, a) -> bool:
    from ark_nova.engine import effects
    return (sponsors_action.level_for(state, p.seat, k) <= p.money and sponsors_action.requirements_met(state, p.seat, k, a["level"])
            and effects.can_play(state, p.seat, k) and not sponsors_action.has_unimplemented_effect(k))


def apply(state, action: Action) -> None:
    from ark_nova.engine.game import IllegalAction
    g = _g()
    p = state.players[action.player]
    a = state.prompt.args
    if action not in legal(state, p):
        raise IllegalAction(f"that side action is not possible now: {action.args}")
    op, args = action.args["op"], action.args
    a["side_used"] = True
    if op == "trade_money":
        g._gain(state, p.seat, x_tokens=-1, money=TRADE_MONEY)
    elif op == "trade_x":
        g._gain(state, p.seat, money=-TRADE_MONEY, x_tokens=1)
    elif op == "rep_x":
        g._gain(state, p.seat, x_tokens=-1, reputation=1)
    elif op == "rep_money":
        g._gain(state, p.seat, money=-TRADE_MONEY, reputation=1)
    elif op in ("discard_money", "discard_strength", "discard_snap", "discard_play"):
        p.hand.remove(args["card"])
        state.main_discard.append(args["card"])
        if op == "discard_money":
            g._gain(state, p.seat, money=SUNBATHING_MONEY)
        elif op == "discard_strength":
            a["left"] += STRENGTH_BONUS
        elif op == "discard_snap":
            i = state.display.index(args["take"])
            state.display[i] = None
            p.hand.append(args["take"])
        elif args["play"] is None:
            pass
        else:
            g._gain(state, p.seat, money=-sponsors_action.level_for(state, p.seat, args["play"]))
            pending = g.play_sponsor_outside_action(state, p.seat, args["play"])
            if g._open_effects(state, p.seat, pending, {"kind": "sponsors_play", "args": a}):
                return
