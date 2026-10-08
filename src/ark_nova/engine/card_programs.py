"""What sponsor cards do when they are played and afterwards (data for `engine/effects.py`).

Sources: the card texts (vendor/Next-Ark-Nova-Cards/public/locales/en/common.json), the rulebook, and BGA's logs (the placement lists of
state 30 for sponsor buildings, checked by the differential test). Card keys are `S###`.
"""
# sponsor -> (building type placed for free when the card is played, extra placement rules). The rock / water requirement icons of
# the card are added as rules (`rock`, `water`: at least that many spaces of that terrain next to the building).
UNIQUE_BUILD = {
    "S243": ("meerkat", {}), "S244": ("penguin", {}), "S245": ("aquarium", {}), "S246": ("cable", {}), "S247": ("baboon", {}),
    "S248": ("monkey", {}), "S249": ("owl", {}), "S250": ("sea-turtle", {}), "S251": ("polar-bear", {}), "S252": ("hyena", {}),
    "S253": ("okapi", {}), "S254": ("zoo-school", {"border": 2}), "S255": ("adventure", {}), "S256": ("water-playground", {}),
    "S257": ("entrance", {"border": 2, "free_position": True}), "S265": ("kiosk", {}), "S263": ("size-5", {}),
    "S271": ("excavation", {}), "S272": ("size-3", {}), "S274": ("victory", {}), "S276": ("pavilion", {}),
    "S278": ("amazon", {}), "S279": ("underwater-tunnel", {"on_water": True}), "S281": ("arcade", {}),
}
OPTIONAL_BUILD = {"S265", "S263", "S272"}   # Franchise Business (kiosk), Waza Large Animal Program (size-5), Expansion Area (size-3): the building may be declined (user)
DOUBLE_PLACEMENT_BONUS = {"S271"}            # excavation site: placement bonuses are gained twice
TAKE_ONE_CARD = {"S201", "S254"}             # take 1 card from the deck or within the reputation range
PRINTED_ONLY = {"S236", "S237", "S238", "S239", "S240", "S266", "S216", "S273", "S205", "S226", "S277", "S217", "S202", "S243", "S244", "S245", "S246", "S247", "S248", "S249", "S250", "S251", "S252",
                "S253", "S275", "S201", "S254", "S255", "S256", "S257", "S263", "S265", "S271", "S272", "S274", "S276", "S278", "S279",
                "S281"}   # nothing beyond the printed values, the placement / cards below and the passive triggers (checked by the differential)
# gain on play = multiplier x number of icons of that kind in the zoo (the played card included): (resource, icon, multiplier)
GAIN_PER_ICON = {
    "S204": ("money", "Science", 2), "S210": ("appeal", "Americas", 1), "S211": ("appeal", "Europe", 1), "S212": ("appeal", "Australia", 1),
    "S213": ("appeal", "Asia", 1), "S214": ("appeal", "Africa", 1), "S231": ("appeal", "Primate", 1), "S232": ("appeal", "Reptile", 1),
    "S233": ("appeal", "Bird", 1), "S234": ("appeal", "Predator", 1), "S235": ("appeal", "Herbivore", 1),
    "S208": ("appeal", "Science", 1), "S241": ("appeal", "Water", 1), "S242": ("appeal", "Rock", 3, 2),      # (.., .., mult, per n icons)
}
# sponsors with their own code in effects.on_play: Basic Research, Release of Patents, Explorer, Waza Special Assignment, Waza Small Animal
# Program (passive, see animals_action), Reconstruction
SPECIAL_PROGRAMS = {"S207", "S222", "S262", "S227", "S228", "S280", "S229", "S230", "S203", "S206", "S219",
                    "S258", "S259", "S260", "S264", "S267", "S268", "S269"}
EXTRA_REQUIREMENTS = {}      # requirements the card data lacks (Reconstruction has none: user)
# printed gains where the card data is wrong or missing (read off the logs): sponsor -> {appeal, reputation, conservation}
PRINTED_OVERRIDE = {"S256": {"appeal": 4}, "S265": {}, "S278": {"appeal": 4, "reputation": 1, "conservation": 2}}
PER_PAVILION_APPEAL = {"S276"}               # Landscape Gardener: appeal = number of pavilions in the zoo, after its free pavilion
SEARCH_DISCARD_PET = {"S275"}                # take a Petting Zoo animal from the discard pile
SCUBA_DIVE = {"S270"}                        # reveal the 3 topmost cards, take 1 sponsor (the 'send a person away' option is not implemented)
UNSUPPORTED_PLAY = {}
HIRE_WORKER = {"S216"}                       # Talented Communicator: hire 1 association worker
DONATION = {"S273"}                          # Publications: you may make 1 donation
UNSUPPORTED_IN_BUILD: dict = {}

# passive triggers: sponsor -> [(icon, scope, effect)]. scope: 'self' = icons played into the owner's zoo, 'any' = into any zoo (the
# owner gains). effect: ('gain', {resource: n}) | ('build', type) | ('reveal', x, animals_only) | ('sell', max) | ('pouch',) |
# ('slot1',) | ('explorer',) | ('unsupported', text). Triggered once per icon instance.
# Triggers that pay at once (nothing to decide): the Science Library, the species experts (Primatologist, Herpetologist, Ornithologist, Expert in Predators / Herbivores, Marine
# Biologist), the Horse Whisperer, and the Polar Bear Exhibit for the opponent's icons. Every other gain of a trigger is an effect of its own that the owner resolves in the
# order they like (Meerkat Den, Penguin Pool, Aquarium, Cable Car, Baboon Rock, Rhesus Monkey Park, Science Museum, the Polar Bear Exhibit for the owner's own icons ...).
AUTOMATIC_TRIGGERS = {"S208", "S236", "S237", "S238", "S239", "S240", "S266", "S275"}


def trigger_is_automatic(sponsor: str, owner: int, seat: int) -> bool:
    return sponsor in AUTOMATIC_TRIGGERS or (sponsor == "S251" and owner != seat)


TRIGGERS = {
    "S202": [("Science", "self", ("gain", {"reputation": 1}))],
    "S204": [("Science", "self", ("gain", {"conservation": 1}))],
    "S208": [("Science", "any", ("gain", {"money": 2}))],
    "S210": [("Americas", "self", ("build", "kiosk"))],
    "S211": [("Europe", "self", ("build", "size-1"))],
    "S212": [("Australia", "self", ("pouch",))],
    "S213": [("Asia", "self", ("build", "pavilion"))],
    "S214": [("Africa", "self", ("slot1",))],
    "S243": [("Herbivore", "self", ("gain", {"appeal": 2}))],
    "S244": [("Bird", "self", ("gain", {"appeal": 2}))],
    "S245": [("Water", "self", ("gain", {"appeal": 2}))],
    "S246": [("Rock", "self", ("gain", {"appeal": 2}))],
    "S247": [("Primate", "self", ("gain", {"appeal": 2}))],
    "S248": [("Primate", "self", ("gain", {"xtoken": 1}))],
    "S249": [("Bird", "self", ("reveal", 2, False))],
    "S250": [("Reptile", "self", ("sell", 2))],
    "S236": [("Primate", "any", ("gain", {"money": 3}))],
    "S237": [("Reptile", "any", ("gain", {"money": 3}))],
    "S238": [("Bird", "any", ("gain", {"money": 3}))],
    "S239": [("Predator", "any", ("gain", {"money": 3}))],
    "S240": [("Herbivore", "any", ("gain", {"money": 3}))],
    "S266": [("SeaAnimal", "any", ("gain", {"money": 3}))],
    "S270": [("SeaAnimal", "self", ("expedition",))],                     # Marine Research Expedition: send a person away for 1 conservation or Scuba Dive 3, for every sea animal icon (its own too)
    "S251": [("Bear", "any", ("gain", {"appeal": 2}))],
    "S252": [("Predator", "self", ("hunter",))],
    "S253": [("Herbivore", "self", ("marketing_cube",))],                 # Okapi Stable: 3 cubes, a herbivore icon may remove one for a Marketing effect
    "S262": [("*new*", "self", ("explorer",))],
    "S268": [("Europe", "self", ("mark",))],
    "S269": [("Australia", "self", ("enlarge",))],
    "S275": [("Pet", "any", ("gain", {"money": 2}))],
}
def sell_price(n: int) -> int:
    """Sunbathing sells a card for 4 money (the 3 money seen in the logs is Commercial Harbor's own ability)."""
    return 4 * n



POUCH_APPEAL = 2
EXPLORER_ICONS = {"Bird", "Predator", "Herbivore", "Bear", "Reptile", "Pet", "Primate", "SeaAnimal", "Africa", "Europe", "Asia", "Americas",
                  "Australia"}
