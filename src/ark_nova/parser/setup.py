"""Setup facts extracted from a parsed log: seats, the initial deal, discards, display and action cards.

Evidence and rules (docs/log_format.md, docs/engine_design.md):
- the two players are dealt in seat order: the first player gets the top 8 main-deck cards and the top 2 endgame cards; the
  card `state` field is a global deal counter (1-8 / 1-2 for the first player, 9-16 / 3-4 for the second) and gives the order;
- each player discards 4 of the 8 (`pDiscardCards` in the setup moves), the display is then filled with 6 cards (`fillPool`);
- both endgame cards are kept until one is discarded later in the game;
- action cards: `setupActionCards` gives the strength slots when the log has it; otherwise they are rebuilt from the first
  `chooseActionCard` (slot) and the following `actionCardCleanup` (`actionCards` maps card id -> new slot; the used card moves
  to slot 1 and the cards below it move up by one). Card ids -> type come from `chooseActionCard`/`actionCardCleanup`/`upgradeCard`.
"""
import re
from dataclasses import dataclass, field

from ark_nova import data
from ark_nova.parser.model import ParsedLog


@dataclass
class SetupInfo:
    seats: list[str]                                   # player ids, first player first
    dealt: dict[str, list[str]]                        # 8 main-deck keys per player, in deal order
    endgame: dict[str, list[str]]                      # 2 endgame keys per player
    discarded: dict[str, list[str]]                    # the 4 keys each player discarded
    display: list[str]                                 # 6 keys, slot 0 = pool-1
    action_cards: dict[str, list[tuple[str, int]]]     # per player: (type, variant) in strength-slot order 1..5
    start_extra: dict[str, list[str]] = field(default_factory=dict)   # cards found at the start (Map 14 person sponsor)
    action_card_ids: dict[str, dict[int, int]] = field(default_factory=dict)   # per player: card id -> initial slot


def parse_action_type(t: str) -> tuple[str, int]:
    """'Cards1' -> ('cards', 1); 'Build' -> ('build', 0)."""
    m = re.match(r"^([A-Za-z]+?)(\d*)$", t)
    if not m:
        raise ValueError(t)
    return m.group(1).lower(), int(m.group(2) or 0)


def _key(card_id: str) -> str:
    return data.parse_bga_card_id(card_id)[0]


def extract_setup(parsed: ParsedLog) -> SetupInfo:
    idtype: dict[int, str] = {}
    setup_slots: dict[str, dict[int, int]] = {}
    first_choice: dict[str, tuple[int, int]] = {}      # pid -> (card id, its slot)
    first_cleanup: dict[str, dict[int, int]] = {}
    dealt: dict[str, list[dict]] = {}
    extra: dict[str, list[str]] = {}
    endgame: dict[str, list[dict]] = {}
    discarded: dict[str, list[str]] = {}
    display: list[str] = []
    in_setup = True
    for mv in parsed.moves:
        for e in mv.events:
            a = e.args
            if not isinstance(a, dict):
                continue
            if e.type == "chooseActionCard":
                in_setup = False
            if e.type == "setupActionCards":
                setup_slots[str(a["player_id"])] = {int(c["id"]): int(c["strength"]) for c in a["action_cards"]}
                for c in a["action_cards"]:
                    idtype[int(c["id"])] = c["type"]
            ac = a.get("actionCard") if e.type in ("chooseActionCard", "actionCardCleanup", "upgradeCard") else None
            if ac:
                idtype[int(ac["id"])] = ac["type"]
            pid = str(a.get("player_id")) if "player_id" in a else None
            if e.type == "chooseActionCard" and pid not in first_choice:
                first_choice[pid] = (int(ac["id"]), int(ac["strength"]))
            if (e.type == "actionCardCleanup" and pid in first_choice and pid not in first_cleanup
                    and int(ac["id"]) == first_choice[pid][0]):
                first_cleanup[pid] = {int(k): int(v) for k, v in a["actionCards"].items()}
            if not in_setup:
                continue
            if e.type == "pDrawCards" and a.get("cards"):
                if a.get("scoringCard"):
                    endgame.setdefault(e.player, []).extend(a["cards"])
                elif "from the deck" in e.log:
                    dealt.setdefault(e.player, []).extend(a["cards"])
                else:       # e.g. Map 14: a person sponsor is found at the start of the game
                    extra.setdefault(e.player, []).extend(_key(c["id"]) for c in a["cards"])
            elif e.type == "pDiscardCards" and not a.get("scoringCard") and e.log.startswith("You discard"):
                discarded.setdefault(e.player, []).extend(_key(c["id"]) for c in a.get("cards", []))
            elif e.type == "fillPool" and not display:
                display = [_key(c["id"]) for c in a["cards"]]

    seats = sorted(dealt, key=lambda p: dealt[p][0]["state"])
    action_cards: dict[str, list[tuple[str, int]]] = {}
    ids: dict[str, dict[int, int]] = {}
    for pid in seats:
        if pid in setup_slots:
            slots = setup_slots[pid]
        else:
            cid, s = first_choice[pid]
            after = first_cleanup[pid]
            slots = {i: (s if i == cid else (pos - 1 if pos <= s else pos)) for i, pos in after.items()}
        if sorted(slots.values()) != [1, 2, 3, 4, 5]:
            raise ValueError(f"cannot rebuild the action card order for player {pid}: {slots}")
        ids[pid] = slots
        by_slot = {slot: cid for cid, slot in slots.items()}
        action_cards[pid] = [parse_action_type(idtype[by_slot[s]]) for s in range(1, 6)]
    return SetupInfo(
        seats=seats,
        dealt={p: [_key(c["id"]) for c in sorted(dealt[p], key=lambda c: c["state"])] for p in seats},
        endgame={p: [_key(c["id"]) for c in sorted(endgame[p], key=lambda c: c["state"])] for p in seats},
        discarded=discarded,
        display=display,
        action_cards=action_cards,
        action_card_ids=ids,
        start_extra=extra,
    )
