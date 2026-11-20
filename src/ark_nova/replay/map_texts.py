"""The ability text of every map, as the viewer's map badge (`description` of `map_view`) and the map library (`ability` of web/wall_maps/index.json, written by
scripts/build_library_maps.py) show it: one short text per map. An icon is written between < >, see web/js/map_text.js. Kept out of `data/maps.json` (the card data of the
fan site) so that rewording a text does not change the data hash of the rules (`engine/version.py`)."""

_NONE = "No special ability."
_PROFIT = "Profitable area around the Lake."
_OBS = "Gain <APPEAL:2> every time you flip a standard enclosure next to <OBSERVATION-TOWER> to its occupied side."
_OUT = "Each standard enclosure next to <GATE> has +2 capacity."
_HARBOR = "Active if <HARBOR> is connected: Once during your turn, you may discard up to 1 card from hand for <MONEY-SMALL:3> at any time."
_REST = "Gain 1 extra income for each covered space next to <RESTAURANT>."
_INST = "Active if <INSTITUTE> is connected: Each time you play an animal card, you may ignore 1 condition of your choice."
_ICE = "Once all kiosk placement bonuses are covered: Gain 1 extra income for each kiosk."
_HOLLY = ("Each time you cover an <HOLLYWOOD>, add a random sponsor card from the deck to your hand.",
          "Once all <HOLLYWOOD> are covered, each sponsor card requires <NEG-STRENGTH:1> to play or market.")

TEXTS = {
    "0": _NONE,
    "A": "You start with a free size-3 enclosure and a kiosk in the bottom left corner.",
    "1": _OBS, "1a": _OBS,
    "2": _OUT, "2a": _OUT,
    "3": _PROFIT, "3a": _PROFIT,
    "4": _HARBOR, "4a": _HARBOR,
    "5": _REST, "5a": _REST,
    "6": _INST, "6a": _INST,
    "7": _ICE, "7a": _ICE,
    "8": _HOLLY, "8a": _HOLLY,
    "9": ("Once per continent: When you play an animal into an enclosure that lies in its continent’s area, remove its marker and take 1 bonus: "
          "<APPEAL:2> <REPUTATION:1> <MONEY:4> <CLEVER> <KIOSK-PAVILION>",
          "Gain <CONSERVATION:1> upon removing all 5 continent markers."),
    "10": ("When covering <RESCUE>: Dig 1 card from the display or from your hand.",
           "If the dug card is an animal (except <PETTING>), you may tuck it under your map (max. 3).",
           "It then counts as in your zoo with its icons and enclosure size, also triggering ongoing effects."),
    "11": ("When covering <STORE>, place 1 card from your hand under your notepad (max. 3). During each break, gain 2 extra income per stored card.",
           "Stored cards can be taken back into your hand at any time."),
    "12": ("For each <BINDER>, conceal the leftmost open action strength (but skip <STRENGTH:3>).", "Action strength is increased to the next highest visible number."),
    "13": "If you completely cover a quadrant on your map, gain the depicted bonus immediately and as break income.",
    "14": ("Draw a random person sponsor from the deck for each worker you unlock, including your first worker at the start of the game.",
           "Keep 5 instead of 4 cards from your starting hand."),
    "T1": "Active if the <T1-BONUS> bonus is unlocked: Once during your turn, you may discard a card from your hand to increase the strength of an action by <STRENGTH:1>.",
}


def description(map_id: str, card_data: list | None = None) -> list:
    """The lines of a map's ability text: ours, or (a map we have no text for, e.g. a custom map) the card data's, cleaned."""
    if str(map_id) in TEXTS:
        t = TEXTS[str(map_id)]
        return list(t) if isinstance(t, tuple) else [t]          # (a tuple = several lines, each one its own paragraph)
    return [t.strip() for t in (card_data or []) if t and t.strip()]
