"""Log-driven replay states.

Every replay step is built by applying the *log events* to the state (not by running the rules engine), so the replay works
for every card and effect the log contains, and the engine can be tested transition by transition against these states
(state_i -> engine.apply(action_i) must equal state_{i+1}). Events the builder does not know yet are counted in
`Replay.unhandled` and the state is left as it was; `Replay.mismatches` lists disagreements with the log's own oracles
(state-20 hand/display snapshots, deck order).

Handlers only exist for the events listed in HANDLERS; adding one is the way to extend fidelity.
"""
import copy
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable

from ark_nova import data
from ark_nova.engine.actions import Action
from ark_nova.engine.game import apply, start_game
from ark_nova.engine import icons, tracks
from ark_nova.engine.state import Building, GameConfig, GameState, Phase, SeedSpec, Token
from ark_nova.parser.deck import classify_draw
from ark_nova.parser.model import Event, Move, ParsedLog
from ark_nova.parser.setup import SetupInfo


@dataclass
class Replay:
    states: list[GameState]                     # states[i] = state after moves[i] (setup steps: nothing dealt, then the dealt hands, then the finished setup; see _setup_state)
    moves: list[Move]
    setup_moves: int                            # moves before the first turn
    unhandled: Counter = field(default_factory=Counter)
    first_unhandled: dict[str, int] = field(default_factory=dict)      # event type -> first move index
    mismatches: list[tuple[int, str]] = field(default_factory=list)    # (move index, description)
    substates: dict = field(default_factory=dict)        # move index -> states after each sub-step but the last (see build_replay)
    turn_snapshots: list[GameState] = field(default_factory=list)      # state at each turn marker (start of every player turn)
    notes: list[tuple[int, str]] = field(default_factory=list)         # known-imprecise oracles (strength modifiers of Venom/Constriction/hypnosis)


def _key(card_id: str) -> str:
    return data.parse_bga_card_id(card_id)[0]


class _Ctx:
    def __init__(self, state: GameState, setup: SetupInfo):
        self.state = state
        self.seat_of = {pid: i for i, pid in enumerate(setup.seats)}
        self.card_of_id: dict[int, tuple[int, str, int]] = {}      # action card id -> (seat, type, variant)
        for pid, ids in setup.action_card_ids.items():
            by_slot = {slot: cid for cid, slot in ids.items()}
            for slot in range(1, 6):
                t, v = setup.action_cards[pid][slot - 1]
                self.card_of_id[by_slot[slot]] = (self.seat_of[pid], t, v)
        self.threshold_snaps = 0                                  # snaps that belong to a conservation bonus (extra hand size), not to the notepad
        self.support = None                                        # player id whose supported project is still waiting for its notepad bonus
        self.rep_task = False                                      # a reputation task was counted at its worker move; newer logs add a getBonuses for it
        self.markers: list = []                                    # (order, player id) of every turn marker
        self.mismatches: list[str] = []
        self.money_checks: dict[int, tuple[int, int, int]] = {}

    def seat(self, pid) -> int:
        return self.seat_of[str(pid)]

    def player(self, pid):
        return self.state.players[self.seat(pid)]


# ---- helpers -------------------------------------------------------------------------------------------------------

def _remove_from_display(state: GameState, key: str) -> None:
    if key in state.display:
        state.display[state.display.index(key)] = None


def _take_from_source(state: GameState, p, key: str, from_display: bool) -> None:
    """A played card comes from the display, the hand or (Map 11) the cards stored under the notepad."""
    if from_display and key in state.display:
        _remove_from_display(state, key)
    elif key in p.hand:
        p.hand.remove(key)
    elif key in p.stored:
        p.stored.remove(key)
    elif key in state.display:
        _remove_from_display(state, key)


def _apply_bonuses(p, bonuses) -> None:
    for k, v in (bonuses or {}).items():
        if k == "money":
            p.money += v
        elif k == "appeal":
            p.appeal += v
        elif k == "reputation":
            p.reputation += v
        elif k == "conservation":
            p.conservation += v
        elif k == "xtoken":
            p.x_tokens += v


def _place_meeples(ctx: _Ctx, meeples) -> None:
    """Move (or create) tokens: BGA meeples carry their new `location` and the owner `pId` (None = the board)."""
    s = ctx.state
    for m in meeples or []:
        mid = int(m["id"])
        known = any(t.id == mid for holder in [s.board_tokens] + [q.tokens for q in s.players] for t in holder)
        owned = m.get("pId") not in (None, 0, "0")
        if m["type"] == "worker" and owned and not known:
            _swap_placeholder_worker(s.players[ctx.seat(m["pId"])], m["location"])      # the engine's own worker stands for this one
        for holder in [s.board_tokens] + [q.tokens for q in s.players]:
            for t in holder:
                if t.id == mid:
                    holder.remove(t)
                    break
        (s.players[ctx.seat(m["pId"])].tokens if owned else s.board_tokens).append(Token(mid, m["type"], m["location"]))


def _swap_placeholder_worker(p, destination: str) -> None:
    """A worker id seen for the first time: drop one of the engine's placeholder workers (a worker going to the notepad comes from the
    supply, any other move starts on the notepad)."""
    from ark_nova.engine.game import PLACEHOLDER_ID
    source = "supply_" if destination == "reserve" else "reserve"
    mine = sorted((t for t in p.tokens if t.type == "worker" and t.id >= PLACEHOLDER_ID and t.location.startswith(source)),
                  key=lambda t: t.location)
    if not mine:
        mine = [t for t in p.tokens if t.type == "worker" and t.id >= PLACEHOLDER_ID]
    if mine:
        p.tokens.remove(mine[0])


# ---- turn flow -----------------------------------------------------------------------------------------------------

def h_choose_action_card(ctx: _Ctx, e: Event) -> None:
    ctx.support = None
    a = e.args
    ac = a["actionCard"]
    ctx.state.current_action = {"seat": ctx.seat(a["player_id"]), "id": int(ac["id"]), "slot": int(ac["strength"]),
                                "strength": int(a["strength"])}


def h_action_card_cleanup(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    a = e.args
    if "Clever effect" in e.log:                             # a Clever notepad bonus of a supported project: its slot is used up (an income slot gives it again at every break)
        _support_bonus(ctx, e, "Clever")
    seat = ctx.seat(a["player_id"])
    p = s.players[seat]
    by_id = {cid: (t, v) for cid, (sd, t, v) in ctx.card_of_id.items() if sd == seat}
    levels = {(c.type, c.variant): c.level for c in p.action_cards}
    levels[by_id[int(a["actionCard"]["id"])]] = int(a["actionCard"]["level"])
    slots = sorted((int(slot), int(cid)) for cid, slot in a["actionCards"].items())    # actionCards maps card id -> slot
    old = {(c.type, c.variant): c for c in p.action_cards}
    p.action_cards = []
    for _, cid in slots:
        c = old[by_id[cid]]
        c.level = levels[by_id[cid]]
        p.action_cards.append(c)
    if "action card" not in e.log and s.current_action is None:      # a card placed on slot 1 by an effect (Expert on Africa), not a turn end
        return
    actor = (s.current_action or {}).get("seat", seat)           # (Hypnosis: the card that is placed belongs to the other player)
    s.current_action = None
    nxt = next((pid for order, pid in ctx.markers if order > e.order), None)
    if nxt is not None and ctx.seat(nxt) == actor:               # a second action of the same player (Determination, Action: X)
        return
    s.turn += 1
    s.active_player = 1 - actor


def h_increase_size(ctx: _Ctx, e: Event) -> None:
    """An enclosure grows by one space: BGA replaces it by a bigger building (new id, type and rotation; the animal stays)."""
    a = e.args
    p = ctx.player(a["player_id"])
    old, new = a["building"], a["newBuilding"]
    for i, b in enumerate(p.buildings):
        if b.id == old["id"] or (b.x, b.y) == (old["x"], old["y"]):
            p.buildings[i] = Building(id=int(new["id"]), type=new["type"], x=new["x"], y=new["y"], rotation=new.get("rotation", 0),
                                      animal=b.animal, animals=list(b.animals))
            return
    p.buildings.append(Building(id=int(new["id"]), type=new["type"], x=new["x"], y=new["y"], rotation=new.get("rotation", 0)))


def h_upgrade_card(ctx: _Ctx, e: Event) -> None:
    a = e.args
    seat = ctx.seat(a["player_id"])
    _, t, v = ctx.card_of_id[int(a["actionCard"]["id"])]
    for c in ctx.state.players[seat].action_cards:
        if (c.type, c.variant) == (t, v):
            c.level = int(a["actionCard"]["level"])


def h_advance_break(ctx: _Ctx, e: Event) -> None:
    ctx.state.break_position = int(e.args["break"])


def h_end_of_game(ctx: _Ctx, e: Event) -> None:
    ctx.state.end_triggered_by = ctx.seat(e.args["player_id"])
    ctx.state.phase = Phase.FINAL_TURNS


def h_final_scoring(ctx: _Ctx, e: Event) -> None:
    ctx.state.phase = Phase.SCORING


# ---- resources -----------------------------------------------------------------------------------------------------

def _mark_income_slot(p, kind: str, value) -> bool:
    """The player has used a notepad token of the map (its bonus is gained again in every break when it is an income slot)."""
    slots = data.map_by_id(p.map_id)["geometry"]["bonus_slots"]
    used = p.flags.get("bonus_used", 0)
    for s in slots:
        b = s.get("bonus")
        if b and not used >> s["index"] & 1 and b["type"].lower() == str(kind).lower() and (value is None or b["value"] == value):
            p.flags["bonus_used"] = used | (1 << s["index"])
            return True
    return False


def _support_bonus(ctx: _Ctx, e: Event, kind: str) -> None:
    """The notepad bonus of a supported project that BGA only logs through its consequence (a snap, a free building, a card): the slot is used up."""
    pid = str(e.args.get("player_id"))
    if ctx.support == pid and _mark_income_slot(ctx.player(pid), kind, None):
        ctx.support = None                                   # (an event that is no notepad bonus, e.g. a card of the reputation track, leaves the project waiting)


def h_get_bonuses(ctx: _Ctx, e: Event) -> None:
    p = ctx.player(e.args["player_id"])
    if e.args.get("source") == "association board" and ctx.rep_task:      # the reputation task was already counted by its worker move
        ctx.rep_task = False
        return
    _apply_bonuses(p, e.args.get("bonuses"))
    if e.args.get("source") == "map bonus space":
        for kind, value in (e.args.get("bonuses") or {}).items():
            _mark_income_slot(p, kind, value)


def h_take_bonus(ctx: _Ctx, e: Event) -> None:
    bd = (e.args.get("bonus_desc") or {}).get("args") or {}
    if bd.get("bonus_type") == "bonus-increased-hand" and bd.get("bonus_source_type") == "bonus":
        ctx.threshold_snaps += 1
    if bd.get("bonus_source_type") == "incomeBonusSpace" and e.args.get("player_id") is not None:
        _mark_income_slot(ctx.player(e.args["player_id"]), bd.get("bonus_type"), bd.get("bonus_n"))
    h_meeples(ctx, e)


def h_waza(ctx: _Ctx, e: Event) -> None:
    ctx.player(e.args["player_id"]).flags["waza"] = 1 if e.args["type"] == "small" else 2


def h_finish_break(ctx: _Ctx, e: Event) -> None:
    ctx.state.break_position = 0


def h_donation(ctx: _Ctx, e: Event) -> None:
    a = e.args
    p = ctx.player(a["player_id"])
    _apply_bonuses(p, a.get("bonuses"))
    _apply_bonuses(p, a.get("bonuses2"))
    h_meeples(ctx, e)


def h_meeples(ctx: _Ctx, e: Event) -> None:
    a = e.args
    if e.type == "slideMeeples" and e.log.endswith("increases reputation"):        # the reputation task: +2, only the worker move is logged
        p = ctx.player(a["player_id"])
        p.reputation = min(15, p.reputation + 2)
        ctx.rep_task = True
    if e.type == "discardTokens":                    # tokens leave the game (the hidden university tile that a player turns over, action card tokens)
        gone = {int(m["id"]) for m in a.get("meeples") or []}
        if e.log.startswith("All tokens are removed"):               # the break: every token on the action cards goes
            for q in ctx.state.players:
                gone |= {t.id for t in q.tokens if t.location.startswith("actionCard_")}
        for holder in [ctx.state.board_tokens] + [q.tokens for q in ctx.state.players]:
            holder[:] = [t for t in holder if t.id not in gone]
        return
    if e.type == "slideMeeples":
        for m in a.get("meeples") or []:
            if m["type"] == "token" and re.match(r"^P\d{3}_.*_\d$", m["location"]) and m.get("pId") not in (None, 0, "0"):
                ctx.support = str(m["pId"])
    _place_meeples(ctx, a.get("meeples"))
    if isinstance(a.get("meeple"), dict):
        _place_meeples(ctx, [a["meeple"]])


def h_pilfering_money(ctx: _Ctx, e: Event) -> None:
    a = e.args
    amount = (a.get("bonuses") or {}).get("money", 0)
    ctx.player(a["player_id"]).money -= amount
    ctx.player(a["player_id2"]).money += amount


# ---- cards ---------------------------------------------------------------------------------------------------------

def h_draw_cards(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    seat = ctx.seat(e.player)
    p = s.players[seat]
    kind, _ = classify_draw(e)
    keys = [_key(c["id"]) for c in e.args.get("cards", [])]
    for k in keys:
        if kind == "top":
            if s.main_deck and s.main_deck[0] == k:
                s.main_deck.pop(0)
            elif k in s.main_deck:
                ctx.mismatches.append(f"top draw {k} was not on top of the deck")
                s.main_deck.remove(k)
        elif kind == "search":
            if k in s.main_deck:
                s.main_deck.remove(k)
        elif kind == "scoring":
            if k in s.endgame_deck:
                s.endgame_deck.remove(k)
        elif kind == "discard":
            if k in s.main_discard:
                s.main_discard.remove(k)
        elif kind == "opponent":
            q = s.players[1 - seat]
            if k in q.hand:
                q.hand.remove(k)
        elif kind == "unused_project":
            if k in s.base_projects_unused:
                s.base_projects_unused.remove(k)
    (p.endgame_hand if kind == "scoring" else p.hand).extend(keys)


def h_discard_cards(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    a = e.args
    p = s.players[ctx.seat(e.player)]
    _apply_bonuses(p, a.get("bonuses"))             # selling / pouching cards pays money
    for c in a.get("cards", []):
        k = _key(c["id"])
        if "Pilfering" in e.log:                    # given to the opponent, not discarded
            if k in p.hand:
                p.hand.remove(k)
            continue
        if a.get("scoringCard") or k in p.endgame_hand:
            if k in p.endgame_hand:
                p.endgame_hand.remove(k)
            s.endgame_discard.append(k)
            continue
        if k in p.hand:
            p.hand.remove(k)
        loc = c.get("location")
        if loc == "mapPouched":
            p.pouched.append(k)
        elif loc == "stored":
            p.stored.append(k)
        elif loc and loc[0] in "AS" and loc[1:4].isdigit():        # pouched under a card in play
            p.under.setdefault(_key(loc), []).append(k)
        else:
            s.main_discard.append(k)


def h_snap_card(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    p = ctx.player(e.args["player_id"])
    for c in e.args["cards"]:
        k = _key(c["id"])
        _remove_from_display(s, k)
        p.hand.append(k)
    if e.type == "snapCard" and ctx.threshold_snaps and "snaps" in e.log:
        ctx.threshold_snaps -= 1
    elif e.type == "snapCard":
        _support_bonus(ctx, e, "take-in-range-or-deck" if "reputation range" in e.log else "Snapping")


def h_fill_pool(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    for c in e.args.get("cards", []):
        k = _key(c["id"])
        if s.main_deck and s.main_deck[0] == k:
            s.main_deck.pop(0)
        elif k in s.main_deck:
            ctx.mismatches.append(f"display card {k} was not on top of the deck")
            s.main_deck.remove(k)
    display = [None] * len(s.display)
    for c in e.args["pool"]:
        display[int(c["location"].split("-")[1]) - 1] = _key(c["id"])
    s.display = display


def h_discard_display(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    for c in e.args.get("cards", []):
        k = _key(c["id"])
        if k in s.projects_in_play:                                        # "The rightmost project card is discarded": its tokens go with it
            s.projects_in_play.remove(k)
            gone = {int(i) for i in e.args.get("tokenIds") or []}
            for q in s.players:
                mine = [t for t in q.tokens if t.id in gone or (t.type == "token" and t.location.startswith(k + "_"))]
                q.flags["supports_gone"] = q.flags.get("supports_gone", 0) + len(mine)         # the supports still count at the end of the game
                q.tokens = [t for t in q.tokens if t not in mine]
            s.main_discard.append(k)
            continue
        _remove_from_display(s, k)
        s.main_discard.append(k)


def _remove_marks(ctx: _Ctx, key: str) -> None:
    for q in ctx.state.players:
        q.tokens = [t for t in q.tokens if not (t.type == "token" and t.location[:4] == key and t.location[4:5] == "_")]


def h_gain_marked(ctx: _Ctx, e: Event) -> None:
    """The owner of a mark gets 2 money when somebody takes the marked card; the cube goes back."""
    h_get_bonuses(ctx, e)
    if e.args.get("card_id"):
        _remove_marks(ctx, _key(e.args["card_id"]))


def h_mark_assign(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    p = ctx.player(e.args["player_id"])
    for c in e.args["cards"]:
        k = _key(c["id"])
        _remove_marks(ctx, k)
        _remove_from_display(s, k)
        p.hand.append(k)


def h_store_card(ctx: _Ctx, e: Event) -> None:
    p = ctx.state.players[ctx.seat(e.player)]
    for c in e.args["cards"]:
        k = _key(c["id"])
        if k in p.hand:
            p.hand.remove(k)
        p.stored.append(k)


def h_unstore_card(ctx: _Ctx, e: Event) -> None:
    p = ctx.state.players[ctx.seat(e.player)]
    for c in e.args["cards"]:
        k = _key(c["id"])
        if k in p.stored:
            p.stored.remove(k)
        p.hand.append(k)


# ---- zoo -----------------------------------------------------------------------------------------------------------

def h_buy_animal(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    a = e.args
    p = ctx.player(a["player_id"])
    k = _key(a["card"]["id"])
    if a["card"].get("location") == "rescueStation":         # map 10: the animal is tucked into the Rescued zone, nothing is played or paid
        _take_from_source(s, p, k, bool(a.get("fromDisplay")))
        p.rescued.append(k)
        return
    _take_from_source(s, p, k, bool(a.get("fromDisplay")))
    p.animals.append(k)
    p.money = int(a["total"])
    for b in a.get("buildings") or []:
        for mine in p.buildings:
            if mine.id == b["id"] or (mine.x, mine.y) == (b["x"], b["y"]):
                if mine.type.startswith("size-"):
                    mine.animal = k
                else:                                    # special enclosures hold several animals
                    mine.animals.append(k)


def h_play_sponsor(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    a = e.args
    p = ctx.player(a["player_id"])
    k = _key(a["card"]["id"])
    _take_from_source(s, p, k, bool(a.get("fromDisplay")))
    p.sponsors.append(k)
    _place_meeples(ctx, a.get("meeples"))                                   # the 2 tokens of Breeding Cooperation / Breeding Program


def h_buy_building(ctx: _Ctx, e: Event) -> None:
    a = e.args
    p = ctx.player(a["player_id"])
    b = a["building"]
    p.buildings.append(Building(id=b["id"], type=b["type"], x=b["x"], y=b["y"], rotation=b.get("rotation", 0)))
    p.money = int(a["total"])
    if "adds" in e.log and b["type"] == "size-2":
        _support_bonus(ctx, e, "size-2")
    elif "adds" in e.log and b["type"] in ("large-bird-aviary", "reptile-house", "large-aquarium"):
        _support_bonus(ctx, e, "special-enclosure")


def h_move_projects(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    a = e.args
    p = ctx.player(a["player_id"])
    for c in a["cards"]:
        k = _key(c["id"])
        _take_from_source(s, p, k, bool(a.get("fromDisplay")))
        if k not in s.projects_in_play:
            s.projects_in_play.insert(0, k)                          # BGA: the new card is `projects_0`, the others move one place to the right


def h_release_animal(ctx: _Ctx, e: Event) -> None:
    s = ctx.state
    a = e.args
    p = ctx.player(a["player_id"])
    k = _key(a["card"]["id"])
    if k in p.animals:
        p.animals.remove(k)
    p.released.append(k)
    s.main_discard.append(k)
    for b in a.get("buildings") or []:                       # the enclosure that was emptied (an animal is not tied to an enclosure)
        for mine in p.buildings:
            if mine.id == b["id"]:
                if mine.type.startswith("size-"):
                    mine.animal = None
                elif k in mine.animals:
                    mine.animals.remove(k)
                elif mine.animals:
                    mine.animals.pop(0)
    p.appeal -= (a.get("bonuses") or {}).get("appeal", 0)


def h_cut_down(ctx: _Ctx, e: Event) -> None:
    a = e.args
    p = ctx.player(a["player_id"])
    p.buildings = [b for b in p.buildings if b.id != int(a["buildingId"])]
    _apply_bonuses(p, a.get("bonuses"))


def h_move_animal(ctx: _Ctx, e: Event) -> None:
    a = e.args
    p = ctx.player(a["player_id"])
    k = _key(a["card"]["id"])
    freed = {x["id"] for x in a.get("buildings") or []}
    for b in p.buildings:
        if b.id in freed:
            b.animal = None
        if b.id == a["building"]["id"]:
            if b.type.startswith("size-"):
                b.animal = k
            else:                                       # moved into a new special enclosure (reptile house / aviary)
                b.animals.append(k)


def h_reconstruction_remove(ctx: _Ctx, e: Event) -> None:
    p = ctx.player(e.args["player_id"])
    ids = {b["id"] for b in e.args["buildings"]}
    p.buildings = [b for b in p.buildings if b.id not in ids]     # re-placed by the following reconstructionPlaceBack events


def h_reconstruction_place_back(ctx: _Ctx, e: Event) -> None:
    b = e.args["building"]
    ctx.player(e.args["player_id"]).buildings.append(
        Building(id=b["id"], type=b["type"], x=b["x"], y=b["y"], rotation=b.get("rotation", 0)))


HANDLERS: dict[str, Callable[[_Ctx, Event], None]] = {
    "chooseActionCard": h_choose_action_card, "actionCardCleanup": h_action_card_cleanup, "upgradeCard": h_upgrade_card,
    "advanceBreak": h_advance_break, "endOfGame": h_end_of_game, "finalScoring": h_final_scoring,
    "getBonuses": h_get_bonuses, "gainMarked": h_gain_marked, "donation": h_donation, "pilferingMoney": h_pilfering_money,
    "increaseSize": h_increase_size, "takeBonus": h_take_bonus, "finishBreak": h_finish_break, "wazaSpecial": h_waza, "markCard": h_meeples, "slideMeeples": h_meeples, "addMeeples": h_meeples, "discardTokens": h_meeples,
    "pDrawCards": h_draw_cards, "pDiscardCards": h_discard_cards, "snapCard": h_snap_card, "sponsorMagnet": h_snap_card,
    "fillPool": h_fill_pool, "discardCardsOnDisplay": h_discard_display, "markAssign": h_mark_assign,
    "pStoreCard": h_store_card, "pUnstoreCard": h_unstore_card,
    "buyAnimal": h_buy_animal, "playSponsor": h_play_sponsor, "buyBuilding": h_buy_building, "moveProjects": h_move_projects,
    "releaseAnimal": h_release_animal, "cutDown": h_cut_down, "increaseSize": h_increase_size, "moveAnimal": h_move_animal,
    "reconstructionRemove": h_reconstruction_remove, "reconstructionPlaceBack": h_reconstruction_place_back,
}
# events that carry no state change the builder needs
IGNORED = {"startBreak", "updateBreakDiscardSelection", "enableMultiplier",
           "hypnosis", "pilfering", "pilferingCard", "playerConcedeGame", "gameStateChangePrivateArg"}


def _sync(ctx: _Ctx) -> None:
    """Icon counters and the tokens on the action cards (`ActionCardState.tokens`, from the tokens that sit on `actionCard_<id>`)."""
    icons.sync_all(ctx.state)
    for p in ctx.state.players:
        for c in p.action_cards:
            c.tokens = []
        for t in p.tokens:
            if t.location.startswith("actionCard_"):
                seat, typ, variant = ctx.card_of_id[int(t.location.split("_", 1)[1])]
                if seat == p.seat:
                    next(c for c in p.action_cards if (c.type, c.variant) == (typ, variant)).tokens.append(t.type)
        for c in p.action_cards:
            c.tokens.sort()


def _setup_state(parsed: ParsedLog, first_turn: int, index: int, dealt: GameState, final: GameState) -> GameState:
    """The state at setup step `index`, as the log tells it: nothing before the deal (the cards are put back on top of their decks, in dealing order; a Map 14 sponsor goes on top too), the dealt hands until the initial
    discard, and the display only once the first `fillPool` has happened. Logs without these events fall back to the finished setup."""
    def first(pred) -> int:
        return next((m.index for m in parsed.moves[:first_turn] if any(pred(e) for e in m.events)), 0)

    deal_at = first(lambda e: e.type == "pDrawCards" and "from the deck" in e.log)
    discard_at = first(lambda e: e.type == "pDiscardCards")
    fill_at = first(lambda e: e.type == "fillPool")
    st = copy.deepcopy(dealt if index < discard_at else final)
    if index < deal_at:                                                  # nothing dealt yet: back on the top of the decks
        st.main_deck = [c for p in st.players for c in p.hand] + st.main_deck
        st.endgame_deck = [c for p in st.players for c in p.endgame_hand] + st.endgame_deck
        for p in st.players:
            p.hand, p.endgame_hand, p.initial_offer = [], [], []
    if index < fill_at:                                                  # the display is filled at the end of the setup
        shown = [c for c in st.display if c]
        st.main_deck = shown + st.main_deck
        st.display = [None] * len(st.display)
    return st


def build_replay(parsed: ParsedLog, setup: SetupInfo, config: GameConfig, seed: SeedSpec, split_before: frozenset = frozenset()) -> Replay:
    """`split_before`: `order`s of events that start a new sub-step of their move (the viewer shows one step per effect);
    `Replay.substates[move index]` then holds the state before each of them, i.e. the states of all sub-steps but the last."""
    state = start_game(config, seed)
    dealt = copy.deepcopy(state)                                         # the hands as dealt (8 cards, 9 with Map 14's sponsor), before the initial discard
    for pid in setup.seats:
        state = apply(state, Action(setup.seats.index(pid), "initial_discard", {"cards": setup.discarded[pid]}))
    ctx = _Ctx(state, setup)
    ctx.markers = parsed.turn_markers
    markers = parsed.turn_markers
    first_order = markers[0][0] if markers else 10 ** 12
    first_turn = next((m.index for m in parsed.moves if any(e.order > first_order for e in m.events)), len(parsed.moves))
    rep = Replay(states=[], moves=parsed.moves, setup_moves=first_turn)
    rep.substates = {}
    next_marker = 0
    for m in parsed.moves:
        if m.index >= first_turn:
            for e in m.events:
                while next_marker < len(markers) and markers[next_marker][0] < e.order:
                    _sync(ctx)
                    rep.turn_snapshots.append(copy.deepcopy(ctx.state))     # the state when this turn started
                    next_marker += 1
                if e.order in split_before:
                    _sync(ctx)
                    rep.substates.setdefault(m.index, []).append(copy.deepcopy(ctx.state))
                _pre_oracles(ctx, e, m, rep)
                h = HANDLERS.get(e.type)
                if h is not None:
                    h(ctx, e)
                    _post_oracles(ctx, e, m, rep)
                elif e.type not in IGNORED:
                    rep.unhandled[e.type] += 1
                    rep.first_unhandled.setdefault(e.type, m.index)
            _sync(ctx)
            for msg in ctx.mismatches:
                rep.mismatches.append((m.index, msg))
            ctx.mismatches = []
            _check_oracles(ctx, m, rep)
        rep.states.append(_setup_state(parsed, first_turn, m.index, dealt, ctx.state) if m.index < first_turn else copy.deepcopy(ctx.state))
    _sync(ctx)
    while next_marker < len(markers):                                   # markers after the last event: the final state
        rep.turn_snapshots.append(copy.deepcopy(ctx.state))
        next_marker += 1
    return rep


def _pre_oracles(ctx: _Ctx, e: Event, m: Move, rep: Replay) -> None:
    """Purchases carry `total` = money after paying: our money before, minus the price, must give it."""
    a = e.args
    if e.type == "chooseActionCard":                # the logged slot of the chosen card must be where our state has it
        p = ctx.player(a["player_id"])
        _, t, _ = ctx.card_of_id[int(a["actionCard"]["id"])]
        slot = [c.type for c in p.action_cards].index(t) + 1
        if slot != int(a["actionCard"]["strength"]):
            # the logged card strength includes modifiers from Venom / Constriction / hypnosis tokens, so this is only a note
            rep.notes.append((m.index, f"action card slot: state {slot}, log {a['actionCard']['strength']} (seat {ctx.seat(a['player_id'])}, {t})"))
    if e.type in ("buyAnimal", "buyBuilding") and isinstance(a, dict) and "total" in a and "amount_money" in a:
        p = ctx.player(a["player_id"])
        ctx.money_checks[e.order] = (p.money - int(a["amount_money"]), int(a["total"]), ctx.seat(a["player_id"]))
        if p.money - int(a["amount_money"]) != int(a["total"]):
            rep.mismatches.append((m.index, f"money after {e.type}: state {p.money - int(a['amount_money'])}, log {a['total']} (seat {ctx.seat(a['player_id'])})"))


def _post_oracles(ctx: _Ctx, e: Event, m: Move, rep: Replay) -> None:
    """`score` on getBonuses/releaseAnimal/donation (and `infos.score`) is the running score of the acting player."""
    a = e.args
    if not isinstance(a, dict):
        return
    if "score" in a and isinstance(a["score"], int) and "player_id" in a:
        p = ctx.player(a["player_id"])
        if tracks.score(p.appeal, p.conservation) != a["score"]:
            rep.mismatches.append((m.index, f"score after {e.type}: state {tracks.score(p.appeal, p.conservation)}, log {a['score']} "
                                            f"(seat {ctx.seat(a['player_id'])}, appeal {p.appeal}, conservation {p.conservation})"))


def _check_oracles(ctx: _Ctx, m: Move, rep: Replay) -> None:
    """The private state-20 `statuses` list every animal the player could play (hand + display) and the endgame cards
    (sponsors and projects are not listed); cards stored under the notepad (Map 11) count as playable too."""
    s = ctx.state
    for chk in m.checks:
        if "hand_and_display" not in chk:
            continue
        seat = ctx.seat(chk["player"])
        p = s.players[seat]
        mine = sorted(k for k in set(p.hand) | {c for c in s.display if c} | set(p.endgame_hand) | set(p.stored) if k[0] in "AF")
        if chk.get("xtokens") is not None and chk.get("active") in ctx.seat_of:      # the X token count is the active player's
            act = s.players[ctx.seat_of[chk["active"]]]
            if int(chk["xtokens"]) != act.x_tokens:
                rep.mismatches.append((m.index, f"x tokens of seat {ctx.seat_of[chk['active']]}: log {chk['xtokens']}, state {act.x_tokens}"))
        theirs = [k for k in chk["hand_and_display"] if k[0] in "AF"]
        if mine != theirs:
            rep.mismatches.append((m.index, f"hand+display+endgame of seat {seat}: log has {sorted(set(theirs) - set(mine))} more, "
                                            f"state has {sorted(set(mine) - set(theirs))} more"))
