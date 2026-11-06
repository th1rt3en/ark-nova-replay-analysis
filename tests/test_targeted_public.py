"""Every targeted draw is public: the card found in the deck is named for the viewer who follows the other player too (label_pov), the starting person sponsor of map 14 included."""
import re

from ark_nova.replay.view import _PUBLIC_DRAW


def test_targeted_draw_templates_are_public():
    for log in ("You draw ${card_names} from the deck (Map 8 effect)", "You draw ${card_names} from the deck (Waza Special Assignement effect)",
                "You draw ${card_names} for monkey gang effect", "You draw ${card_names} with <${type}> (${source})",
                "You draw ${card_names} for gaining a new university with <SEARCH-${type}>"):
        assert _PUBLIC_DRAW.search(log), log


def test_random_draws_stay_hidden():
    for log in ("You draw ${card_names} from the deck", "You draw ${card_names} for sprint effect", "You draw ${card_names} for hunter effect",
                "You draw ${card_names} for perception effect", "You draw ${card_names} for adapt effect", "You draw ${card_names} for scuba dive effect"):
        assert not _PUBLIC_DRAW.search(log), log
