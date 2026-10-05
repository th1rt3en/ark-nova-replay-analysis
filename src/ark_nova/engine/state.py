"""Game state model (pure data, JSON serializable). See docs/engine_design.md for the reasoning.

Conventions
- Cards are referenced by their key (`A414`, `S231`, `P127`, `F003`); every card exists once. Marine Worlds variants are
  selected by `GameConfig.marine_worlds`, never stored per card.
- Seats are 0/1 (`GameConfig.player_ids[seat]` is the BGA player id). Seat 0 is the first player.
- Meeples/tokens mirror the BGA model (`Token.location` uses the BGA location strings) so the log parser needs no translation:
  `bonus_N` (map bonus slots), `supply_N`/`reserve` (workers), `association_N` / `association_N_N`, `partner_N`,
  `university_N`, `actionCard_N`, `notepad`, card locations such as `PN_SpeciesDiversity_N`, `SN_OkapiStable`, `AN_Koala`.
- Derived values (icons, sizes, income, score, hand limit, reputation range) are NOT stored; they are computed from the
  state (engine/derive.py, later) and checked against the log's `args.infos`.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from ark_nova.engine.serialize import from_jsonable, to_jsonable

STATE_VERSION = 1
DISPLAY_SIZE = 6


class Phase(str, Enum):
    SETUP = "setup"                # initial selections (map, action cards, keep 4 of 8, keep 1 endgame card)
    TURN = "turn"                  # a player's turn: choose an action card, resolve its effects
    BREAK = "break"                # break resolution (discard down to hand limit, income, refill)
    FINAL_TURNS = "final_turns"    # end of game triggered, the others get a last turn
    SCORING = "scoring"            # final scoring (endgame cards)
    OVER = "over"


@dataclass
class ActionCardChoice:
    """One of a player's 5 action cards as chosen before the game: BGA type name + variant (0 = standard, 1-4 = alternative side)."""
    type: str            # animals | association | build | cards | sponsors
    variant: int = 0


@dataclass
class GameConfig:
    """Everything that is fixed for the whole game and given by the user / the log index."""
    marine_worlds: bool
    player_ids: list[str]                 # BGA ids, index = seat
    maps: list[str]                       # map id per seat ('1'..'14', '1a'..'8a', 'T1')
    base_projects: list[str]              # the 3 base conservation projects in play (entered by the user)
    player_names: list[str] = field(default_factory=list)
    # per seat: the 5 action cards in initial strength-slot order (slot 1 first); None = standard cards in the standard order
    action_cards: Optional[list[list[ActionCardChoice]]] = None
    # the 2 random bonuses drawn at the start for the 5 and 8 conservation thresholds ({"5": [b, b], "8": [b, b]}, bonus = {type: n});
    # from the log (parser/conservation.py) or entered by the user; the 5-money option is always there
    conservation_bonuses: Optional[dict[str, list[dict[str, Any]]]] = None
    map_known: list[bool] = field(default_factory=lambda: [True, True])    # False when a test had to guess the map of a seat
    table_id: int = 0                     # the BGA table (0 = unknown): a few rules were implemented differently by BGA in older tables (data/map_quirks.py)
    peaceful: bool = False                # the game variant where the hostile effects (Venom, Constriction, Pilfering, Hypnosis) are replaced


@dataclass
class SeedSpec:
    """Deck order: known prefix (from the log) + random rest (see engine/rng.py `build_deck`)."""
    tail_seed: int = 0
    main_order: list[str] = field(default_factory=list)       # main deck, top first
    endgame_order: list[str] = field(default_factory=list)    # endgame deck, top first


@dataclass
class Token:
    id: int
    type: str            # worker, token, partner-Asia, fac-science-rep, Multiplier, Venom, bonus-icon, ...
    location: str        # BGA location string


@dataclass
class ActionCardState:
    type: str            # animals | association | build | cards | sponsors
    variant: int = 0     # 0 standard, 1-4 alternative card (see ActionCardChoice)
    level: int = 1       # 1 or 2 (upgraded)
    tokens: list[str] = field(default_factory=list)   # Multiplier / Venom / Constriction ... sitting on the card


@dataclass
class Building:
    id: int
    type: str            # size-1..size-5, kiosk, pavilion, petting-zoo, small-aquarium, large-aquarium, reptile-house, ...
    x: int
    y: int
    rotation: int = 0    # 0..5, footprint anchor + rotation as in the BGA log
    animal: Optional[str] = None      # card key of the animal living here (standard enclosures)
    animals: list[str] = field(default_factory=list)   # animals living here (special enclosures: petting zoo, reptile house, aviary, aquariums)


@dataclass
class PlayerState:
    seat: int
    map_id: str
    money: int = 25
    appeal: int = 0
    conservation: int = 0
    reputation: int = 0
    x_tokens: int = 0
    action_cards: list[ActionCardState] = field(default_factory=list)   # strength slot order: index 0 = slot 1 ... index 4 = slot 5
    hand: list[str] = field(default_factory=list)
    endgame_hand: list[str] = field(default_factory=list)
    animals: list[str] = field(default_factory=list)            # played animal cards
    sponsors: list[str] = field(default_factory=list)           # played sponsor cards
    released: list[str] = field(default_factory=list)           # animals released into the wild
    stored: list[str] = field(default_factory=list)             # cards stored under the notepad (Caves)
    pouched: list[str] = field(default_factory=list)            # cards slid under the map (pouch)
    rescued: list[str] = field(default_factory=list)            # animals in the Rescued zone of map 10 (Rescue Station): not played, but their icons and size count
    under: dict[str, list[str]] = field(default_factory=dict)   # cards pouched under a card in play (Expert on Australia, some animals)
    buildings: list[Building] = field(default_factory=list)
    tokens: list[Token] = field(default_factory=list)
    flags: dict[str, int] = field(default_factory=dict)         # once-per-turn/break markers, map- and card-specific counters
    initial_offer: list[str] = field(default_factory=list)      # the 8 dealt cards while the initial discard is pending
    icons: dict[str, int] = field(default_factory=dict)         # icon counters (icons.TRACKED), kept in step with the zoo by icons.sync_icons


@dataclass
class Effect:
    """A pending effect waiting to be resolved (BGA state 91/93: the engine's effect list)."""
    kind: str                                   # gain, build_free, draw, upgrade_card, add_worker, ...
    args: dict[str, Any] = field(default_factory=dict)
    source: Optional[str] = None                # card key / 'placement bonus' / 'break' ... for display and validation
    optional: bool = False


@dataclass
class Prompt:
    """The decision the active player has to make right now."""
    kind: str                                   # choose_action_card, choose_effect, choose_cards, place_building, ...
    player: int
    args: dict[str, Any] = field(default_factory=dict)


@dataclass
class Result:
    scores: list[int]
    winner: Optional[int] = None                # None = tie
    conceded: Optional[int] = None


@dataclass
class GameState:
    version: int
    config: GameConfig
    seed: SeedSpec
    rng: int                                    # Rng state (engine/rng.py)
    phase: Phase = Phase.SETUP
    turn: int = 0                               # completed turns
    active_player: int = 0
    break_position: int = 0                     # break track marker (max 9 in a 2-player game)
    main_deck: list[str] = field(default_factory=list)          # top first
    main_discard: list[str] = field(default_factory=list)       # any card, incl. base projects discarded after an Assertion
    endgame_deck: list[str] = field(default_factory=list)
    endgame_discard: list[str] = field(default_factory=list)
    display: list[Optional[str]] = field(default_factory=lambda: [None] * DISPLAY_SIZE)   # slot 0 = pool-1
    base_projects: list[str] = field(default_factory=list)      # the 3 in play (locations base_0..base_2)
    base_projects_unused: list[str] = field(default_factory=list)   # reachable only through Assertion
    projects_in_play: list[str] = field(default_factory=list)   # non-base projects played by players
    board_tokens: list[Token] = field(default_factory=list)     # tokens that belong to no player (partner zoos / universities on offer)
    conservation_options: dict[str, list[dict[str, Any]]] = field(default_factory=dict)   # remaining random bonuses per threshold
    endgame_discard_done: bool = False                          # the one-time endgame card discard at 10 conservation (or before final scoring)
    players: list[PlayerState] = field(default_factory=list)
    pending: list[Effect] = field(default_factory=list)
    prompt: Optional[Prompt] = None
    current_action: Optional[dict[str, Any]] = None             # the action card chosen this turn: seat, id, slot, strength
    end_triggered_by: Optional[int] = None
    final_turns: list[int] = field(default_factory=list)       # seats that still have a last turn after the end of the game was triggered
    result: Optional[Result] = None

    def to_dict(self) -> dict:
        return to_jsonable(self)

    @classmethod
    def from_dict(cls, data: dict) -> "GameState":
        return from_jsonable(cls, data)

    def other(self, seat: int) -> int:
        return 1 - seat
