"""Actions: one `Action` = one replay move = one log move (one effect resolution / sub-decision).

`ACTION_SPECS` is the vocabulary. Each kind lists the arguments it takes and the BGA log event(s) it is parsed from, so the
parser and the engine agree on names. The vocabulary grows while the rules are implemented; `Action.kind` must be in it.
"""
from dataclasses import dataclass, field
from typing import Any

from ark_nova.engine.serialize import from_jsonable, to_jsonable


@dataclass(frozen=True)
class Action:
    player: int
    kind: str
    args: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return to_jsonable(self)

    @classmethod
    def from_dict(cls, data: dict) -> "Action":
        a = from_jsonable(cls, data)
        if a.kind not in ACTION_SPECS:
            raise ValueError(f"unknown action kind {a.kind!r}")
        return a


@dataclass(frozen=True)
class ActionSpec:
    kind: str
    summary: str
    args: tuple[str, ...]
    log_events: tuple[str, ...]


def _s(kind: str, summary: str, args: str, *log_events: str) -> tuple[str, ActionSpec]:
    return kind, ActionSpec(kind, summary, tuple(a for a in args.split() if a), log_events)


ACTION_SPECS: dict[str, ActionSpec] = dict([
    # setup
    _s("choose_map", "pick a map (only when the game lets players choose)", "map", "updateInitialMapSelection", "setupPlayer"),
    _s("draft_pick", "action card draft, rounds 1 and 2: pick one of the offered variants (both players at the same time; the rest goes to the opponent)", "variant",
       "updateInitialActionCardSelection"),
    _s("draft_keep", "action card draft, last round: keep 2 of the 3 variants, of 2 different action cards", "keep", "updateInitialActionCardsKeep", "setupActionCards"),
    _s("initial_discard", "discard 4 of the 8 dealt cards (the other 4 are kept; both endgame cards are kept until one is discarded later)",
       "cards", "updateInitialSelection", "pDiscardCards"),
    # turn
    _s("finish_game", "after the last turn: nothing is left to do with a token, the game is scored", "", "finalScoring"),
    _s("skip_snap", "Snap cards, level II, strength 5: give up the second snap, the action ends", "", "actionCardCleanup"),
    _s("choose_action_card", "choose one of the 5 action cards (optionally spending X tokens)", "type spend", "chooseActionCard"),
    _s("sponsor_side", "a side action of a Sponsors action card variant (trade, discard for money, snap a sponsor, play a sponsor for a card)", "op card take play", "getBonuses", "pDiscardCards"),
    _s("self_clever", "Self-clever Association (level I, strength 5): do nothing, perform another action", "", "actionCardCleanup"),
    _s("take_instead", "Self-clever Association (level II): a card from the deck or display instead of the donation", "", "pDrawCards", "snapCard"),
    _s("skip_extra", "decline the optional second action of an animal (Action: X)", "", "actionCardCleanup"),
    _s("skip_action", "put an action card on slot 1 without performing the action and gain 1 X token", "type", "actionCardCleanup"),
    # effects of the five actions
    _s("play_animal", "play an animal card into an enclosure", "card building_id from_display", "buyAnimal"),
    _s("place_building", "place a building on the map", "type x y rotation", "buyBuilding"),
    _s("finish_build", "stop building (level II Build action)", "", "actionCardCleanup"),
    _s("take_card", "take a card from the display or draw from the deck", "source card", "snapCard", "pDrawCards"),
    _s("discard_cards", "discard cards from hand (also sell, dig, pouch, break discard)", "cards mode",
       "pDiscardCards", "discardCards", "updateBreakDiscardSelection"),
    _s("play_sponsor", "play a sponsor card", "card from_display", "playSponsor"),
    _s("sponsor_break", "Sponsors action alternative: advance the Break by the strength and take that much money (twice at level II)", "",
       "advanceBreak"),
    _s("finish_sponsors", "stop playing sponsors (level II Sponsors action)", "", "actionCardCleanup"),
    _s("skip_effect", "decline an optional pending effect (sponsor triggers)", "index", "getBonuses"),
    _s("association_task", "perform one association task (reputation, partner zoo, university, conservation project)", "task detail",
       "slideMeeples", "addMeeples"),
    _s("finish_animals", "stop playing animals (level II Animals action)", "", "actionCardCleanup"),
    _s("finish_association", "stop performing association tasks (level II Association action)", "", "actionCardCleanup"),
    _s("donate", "make a donation", "", "donation"),
    _s("upgrade_action_card", "flip an action card to level II", "type", "upgradeCard"),
    # generic effect resolution (BGA state 91 / 93)
    _s("choose_effect", "resolve one of the pending effects", "index args", "getBonuses", "takeBonus"),
    _s("skip", "decline an optional effect", "", ),
])
