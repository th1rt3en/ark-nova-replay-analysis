"""Turn the events of one turn of a log into engine `Action`s (only what the engine implements so far).

A turn is the run of events between two turn markers (BGA state 20 = "choose an action card", see `ParsedLog.turn_markers`);
it includes the automatic display refill at its end. `turn_actions` returns the actions (each with the index of the move it
comes from, used to line up BGA's own list of legal placements), or a string saying why the turn is not supported yet
(unknown event, unexplained X-token change, ...).
"""
from dataclasses import dataclass, field
from typing import Optional, Union

from ark_nova import data
from ark_nova.engine.actions import Action
from ark_nova.engine import card_programs as prog
from ark_nova.engine.build_action import SIZES, knows_shape
from ark_nova.parser.model import Event, ParsedLog
from ark_nova.parser.setup import parse_action_type

_PASSIVE = {"advanceBreak", "fillPool", "gameStateChangePrivateArg", "endOfGame"}          # automatic consequences the engine reproduces itself
_SPONSOR_SOURCES = {None, "Map 13 quarter bonus", "Animals3 ability", "increasing card strength", "triggering break", "buying sponsor card", "playing sponsor from reputation range",
                    "maxing out reputation", "reputation track bonus", "placement bonus", "building a pavilion", "filling the map", "max strength Animals", "playing animal from reputation range",
                    "last worker bonus", "Petting Zoo Animal action", "Jumping action", "Pack action", "Iconic animal", "Inventive", "Glide effect",
                    "Shark Attack", "Sponsors2 effect", "Sponsors3", "Build4", "Animals4 bonus"}
_RESOURCE_BONUSES = {"xtoken", "money", "appeal", "reputation", "conservation"}   # plain gains the engine applies itself (pavilion, placement bonuses, X token payment)


@dataclass
class TurnPlan:
    actions: list[Action]
    moves: list[int]                 # move index of each action
    chose: bool
    level_ii_build_open: bool = False
    orders: list[int] = field(default_factory=list)     # `order` of the event each action comes from


def turn_events(parsed: ParsedLog) -> list[list[Event]]:
    """Events of every turn, cut at the turn markers (events before the first marker are the setup)."""
    marks = [o for o, _ in parsed.turn_markers]
    turns: list[list[Event]] = [[] for _ in marks]
    k = -1
    for m in parsed.moves:
        for e in m.events:
            while k + 1 < len(marks) and marks[k + 1] < e.order:
                k += 1
            if k >= 0:
                turns[k].append(e)
    return turns


def _key(card_id: str) -> str:
    return data.parse_bga_card_id(card_id)[0]


def _ability_names(key: str) -> list:
    return [ab["keyword"]["name"] for ab in data.cards_by_key()[key].get("abilities") or []]


def _sponsor_cards(e: Event, seat: int, seat_of: dict, add, revealed: list, st: dict = None):
    """Card events of the effects of a sponsor (see `engine.effects`). Returns a reason when the event is not supported."""
    a, t, log = e.args, e.type, e.log
    cards = [_key(c["id"]) for c in a.get("cards", [])]
    st = st if st is not None else {}
    after_dig, st["dig"] = st.get("dig"), False
    if t == "pDrawCards" and after_dig and log == "You draw ${card_names} from the deck":
        return None                                                # the card drawn after a dig: the engine does it itself
    if t == "pDrawCards" and "monkey gang effect" in log:
        return "monkey gang (the cards tucked under the deck are not in the log)"
    if t == "pDrawCards" and "sprint effect" in log:
        add(Action(seat, "choose_effect", {"activate": True}), e)
        return None
    if t == "pDrawCards" and any(w in log for w in ("with Dominance", "for adapt effect", "for resistance effect")):
        return None                                                # the engine draws these itself
    if t == "pDrawCards" and "for scavenging effect" in log:
        st["scav"] = cards
        add(Action(seat, "choose_effect", {"activate": True}), e)
        return None
    if t == "pDiscardCards" and "for scavenging effect" in log:
        add(Action(seat, "choose_effect", {"keep": _key(a["card"]["id"]), "drawn": st.pop("scav", []) or [_key(a["card"]["id"])] + cards}), e)
        return None
    if t == "pDiscardCards" and ("for adapt effect" in log or "for resistance effect" in log):
        add(Action(seat, "choose_effect", {"discard": sorted(cards)}), e)
        return None
    if t == "pDrawCards" and "with Assertion" in log:
        add(Action(seat, "choose_effect", {"card": cards[0]}), e)
        return None
    if t == "pDiscardCards" and "Sponsors3 effect" in log:
        add(Action(seat, "sponsor_side", {"op": "discard_strength" if "to increase" in log else "discard_money", "card": cards[0]}), e)
        return None
    if t == "pDiscardCards" and "Sponsors4 effect" in log and "snap" in log:
        st["s4snap"] = cards[0]                                   # the snapped sponsor follows
        return None
    if t == "pDiscardCards" and "Sponsors4 effect" in log:
        st["s4"] = cards[0]                                       # the sponsor played for it follows
        return None
    if t == "pDiscardCards" and "Pilfering effect" in log and log.startswith("You give"):
        add(Action(seat_of[str(e.player or a.get("player_id"))], "choose_effect", {"give": cards[0]}), e)
        return None
    if t == "pDrawCards" and "Pilfering effect" in log:
        return None
    if t == "pDiscardCards" and log.startswith("You dig"):
        st["dig"] = True
        add(Action(seat, "choose_effect", {"hand": cards[0]}), e)
        return None
    if t == "pDiscardCards" and "Glide effect" in log:
        add(Action(seat, "choose_effect", {"cards": sorted(cards)}), e)
        return None
    if t == "snapCard" and "reputation range" in log:
        add(Action(seat, "take_cards", {"mode": "range", "card": cards[0]}), e)
    elif t == "snapCard" and "snaps" in log and st.get("s4snap"):
        add(Action(seat, "sponsor_side", {"op": "discard_snap", "card": st.pop("s4snap"), "take": cards[0]}), e)
    elif t == "snapCard" and "snaps" in log:
        add(Action(seat, "take_cards", {"mode": "snap", "card": cards[0]}), e)
    elif t == "pDrawCards" and log == "You draw ${card_names} from the deck":
        add(Action(seat, "take_cards", {"mode": "deck", "count": 1}), e)
    elif t == "pDrawCards" and any(w in log for w in ("perception effect", "hunter effect", "scuba dive effect")):
        revealed[:] = cards                                       # the choice is made by the discard that follows
    elif t == "pDiscardCards" and revealed and ("keep" in log or "(no animal)" in log or "(no sponsor)" in log):
        kept = [c for c in revealed if c not in cards]
        if len(kept) > 1 or (kept and "(no" in log):
            return "unsupported reveal"
        add(Action(seat, "choose_effect", {"keep": kept[0] if kept else None}), e)
        revealed.clear()
    elif t == "wazaSpecial":
        add(Action(seat, "choose_effect", {"waza": a["type"]}), e)
    elif t == "pDiscardCards" and log.startswith("You sell") and (a.get("bonuses") or {}).get("money") == 3 and len(cards) == 1:
        add(Action(seat_of[str(e.player or a.get("player_id"))], "harbor_sell", {"card": cards[0]}), e)           # map 4 Commercial Harbor
    elif t == "pDiscardCards" and log.startswith("You sell"):
        if (a.get("bonuses") or {}).get("money") != 4 * len(cards):       # Sunbathing pays 4 a card, other abilities differ (Commercial Harbor)
            return "sell for another reason than Sunbathing"
        add(Action(seat, "choose_effect", {"cards": sorted(cards)}), e)
    elif t == "pDiscardCards" and log.startswith("You pouch") and len(cards) == 1:
        add(Action(seat, "choose_effect", {"card": cards[0]}), e)
    elif t == "pDiscardCards" and "(scoring card)" in log:
        add(Action(seat_of[str(e.player or a.get("player_id"))], "choose_effect", {"card": cards[0]}), e)
    elif t == "pDrawCards" and "Waza Special" in log:
        pass                                                           # the first animal of the chosen kind: the engine takes it itself
    elif t == "pDrawCards" and "Horse Whisperer" in log and cards[0].startswith("A"):
        add(Action(seat, "choose_effect", {"card": cards[0]}), e)
    else:
        return f"unsupported sponsor card event: {t} {log[:40]}"
    return None


_NOT_HANDLED = object()


def nxt_event(events: list, e):
    """The next event of the turn that is not noise."""
    i = events.index(e) + 1
    while i < len(events) and events[i].type in ("gameStateChangePrivateArg", "fillPool"):
        i += 1
    return events[i] if i < len(events) else None


def _bonus_tile(seat: int, m: dict):
    """A partner zoo / university tile that moved to the player's board without a task (conservation bonus): the choice of the tile."""
    if m["type"].startswith("partner-") and m["location"].startswith("partner_"):
        return Action(seat, "choose_effect", {"partner": m["type"].split("-", 1)[1]})
    if m["type"].startswith("fac-") and m["location"].startswith("university_"):
        generic = m["type"] not in ("fac-rep-hand", "fac-science-rep", "fac-science-science")
        return Action(seat, "choose_effect", {"university": "fac-generic" if generic else m["type"], **({"category": m["type"].split("-", 2)[2]} if generic else {})})
    return None


class _AssocMap:
    """Association turns: BGA logs a task as a worker move (with a log text) followed by the move of the tile / token, and the map
    bonus of a supported project only through its consequences. Returns actions through `add`; `support` is the last conservation
    task, whose notepad bonus is filled in by a later event."""

    def __init__(self, seat: int, add) -> None:
        self.seat, self.add = seat, add
        self.expect = None
        self.support_card = None
        self.support = None
        self.auto_hire = False
        self.bonus_type = None         # what the last takeBonus offered
        self.tile_bonus = None         # a conservation bonus (Partner Zoo / University) whose tile has not moved yet
        self.threshold_snaps = 0       # snaps that belong to a conservation bonus (the extra hand size comes with one), not to the notepad
        self.icon_used = False         # a bonus-icon token was spent before the project move
        self.token_used = None         # a sponsor token (S215 / S218) was spent before the project move
        self.variant, self.level = 0, 1  # of the Association card in use
        self.workers = 0               # workers moved by the task that is being logged
        self.extra = {}

    def bonus(self, descriptor: dict) -> bool:
        if self.support is not None and self.support.args.get("bonus") is None:
            self.support.args["bonus"] = descriptor
            return True
        return False

    def handle(self, e: Event):
        a, t = e.args, e.type
        seat = self.seat
        if t == "slideMeeples":
            log = e.log
            self.workers = sum(1 for m in a.get("meeples") or [] if m["type"] == "worker")
            extra = {"workers": self.workers} if self.variant == 2 and self.level >= 2 else {}      # Hire Association: extra workers (the harness counts them)
            if log.endswith("increases reputation"):
                self.add(Action(seat, "association_task", {"task": "reputation", **extra}), e)
            elif log.endswith("(Association2 effect)"):                  # hires a new worker instead of supporting a project
                self.add(Action(seat, "association_task", {"task": "hire"}), e)
            elif log.startswith("${player_name} takes a new Partner"):
                self.expect = "partner"
                self.extra = extra
            elif log.startswith("${player_name} takes a new university"):
                self.expect = "univ"
                self.extra = extra
            elif log.startswith("${player_name} supports a conservation project"):
                self.expect, self.support_card = "support", a["card"]
                self.extra = extra
            elif log == "" and self.expect:
                m = a["meeples"][0]
                if self.expect == "partner" and m["type"].startswith("partner-"):
                    self.add(Action(seat, "association_task", {"task": "partner", "continent": m["type"].split("-", 1)[1],
                                                               **({"supply": True} if self.variant == 1 else {}), **self.extra}), e)
                    self.auto_hire = m["location"] == "partner_3"
                elif self.expect == "univ" and m["type"].startswith("fac-"):
                    generic = m["type"] not in ("fac-rep-hand", "fac-science-rep", "fac-science-science")
                    args = {"task": "university", "kind": "fac-generic" if generic else m["type"], **self.extra}
                    if self.variant == 1 and self.level >= 2:
                        args["supply"] = True
                    if generic:
                        args["category"] = m["type"].split("-", 2)[2]
                    self.add(Action(seat, "association_task", args), e)
                elif self.expect == "support" and m["type"] == "token":
                    card, loc = self.support_card, m["location"]
                    src = "hand" if card["location"] == "hand" else "display" if card["location"].startswith("pool") else "play"
                    self.support = Action(seat, "association_task", {"task": "conservation", "project": _key(card["id"]), "source": src,
                                                                     "slot": int(loc.rsplit("_", 1)[1]), "bonus": None, **self.extra})
                    if self.icon_used:
                        self.support.args["icon"] = True
                        self.icon_used = False
                    if self.token_used:
                        self.support.args["token"] = self.token_used
                        self.token_used = None
                    self.add(self.support, e)
                else:
                    return f"unsupported association move {self.expect}"
                self.expect = None
            elif log.endswith("gains a new Association worker"):
                if self.bonus_type == "add-worker":                       # the choice at conservation 2 (upgrade or hire): announced by its takeBonus
                    self.bonus_type = None
                    self.add(Action(seat, "choose_effect", {"hire": True}), e)
                elif self.auto_hire or self.bonus({"type": "Worker"}):
                    self.auto_hire = False
                else:
                    self.add(Action(seat, "choose_effect", {"hire": True}), e)
            elif log == "" and _bonus_tile(seat, a["meeples"][0]) is not None:
                m = a["meeples"][0]
                if m["location"] == "partner_3":
                    self.auto_hire = True                                  # the 3rd partner zoo hires a worker by itself
                if self.tile_bonus is None:
                    self.bonus({"type": "Partner-Zoo" if m["type"].startswith("partner-") else "Fac"})       # (the notepad bonus of the zoo map, when none was named yet)
                self.tile_bonus = None
                self.add(_bonus_tile(seat, m), e)
            elif log == "":
                return "unexplained token move"
            else:
                return f"unsupported association event: {log[:40]}"
            return None
        if t == "discardTokens" and any(m["location"][:4] in ("S215", "S218") for m in a.get("meeples") or []):
            token = next(m["location"][:4] for m in a["meeples"] if m["location"][:4] in ("S215", "S218"))      # a token of Breeding Cooperation / Program as an icon
            if self.support is not None:
                self.support.args["token"] = token
            else:
                self.token_used = token
            return None
        if t == "discardTokens" and any(m["type"] == "bonus-icon" for m in a.get("meeples") or []):
            if self.support is not None:
                self.support.args["icon"] = True
            else:
                self.icon_used = True
            return None
        if t in ("discardTokens", "moveProjects"):
            return None
        if t == "donation":
            self.add(Action(seat, "donate", {}), e)
            return None
        if t == "takeBonus" and a.get("source") == "Association4":      # Self-clever Association: nothing is done, another action follows
            self.add(Action(seat, "self_clever", {}), e)
            return None
        if t == "takeBonus":
            bd = (a.get("bonus_desc") or {}).get("args") or {}
            bt = bd.get("bonus_type")
            if bt in ("Fac", "Partner-Zoo") and bd.get("bonus_source_type") == "bonus":
                self.tile_bonus = bt
            if bt == "bonus-increased-hand" and bd.get("bonus_source_type") == "bonus":
                self.threshold_snaps += 1
            if bt == "add-worker" and a.get("source") == "reputation track bonus":
                self.auto_hire = True                                # the worker of reputation 8: the engine hires it itself
            elif bt in ("upgrade-card", "add-worker"):
                self.bonus_type = bt
            elif bt and bd.get("bonus_source_type") == "bonus" and bt != "DISCARD_SCORING":
                self.add(Action(seat, "choose_effect", {"bonus_type": bt, "n": bd.get("bonus_n")}), e)     # the choice at conservation 5 / 8
            # else: a tile of the reputation track / a notepad bonus (both automatic), the endgame card discard at 10: no decision
            return None
        if t == "upgradeCard":
            self.add(Action(seat, "choose_effect", {"upgrade": parse_action_type(a["actionCard"]["type"])[0]}), e)
            return None
        if t == "getBonuses" and isinstance(a, dict) and a.get("source") == "map bonus space":
            b = a["bonuses"]
            if len(b) != 1 or not self.bonus({"type": next(iter(b)), "value": next(iter(b.values()))}):
                return "unexpected map bonus"
            return None
        if t == "pDrawCards" and "gaining a new university" in e.log:
            return None                                              # the search of a category university: the engine does it itself
        if t == "snapCard" and "snaps" in e.log and self.threshold_snaps:
            self.threshold_snaps -= 1
        elif t == "snapCard" and "snaps" in e.log and self.support is not None and self.support.args.get("bonus") is None:
            self.bonus({"type": "Snapping"})
        if t == "buyBuilding" and "adds" in e.log and a["building"]["type"] == "size-2" and self.support is not None \
                and self.support.args.get("bonus") is None:
            self.bonus({"type": "size-2"})
        if t == "buyBuilding" and "adds" in e.log and a["building"]["type"] in ("large-bird-aviary", "reptile-house", "large-aquarium") and self.support is not None                 and self.support.args.get("bonus") is None:
            self.bonus({"type": "special-enclosure"})                  # map 5 / 5a: the free special enclosure of the notepad
        return _NOT_HANDLED


def turn_actions(events: list[Event], seat: int, seat_of: dict[str, int], move_of: dict[int, int], peaceful: bool = False, again: bool = False) -> Union[TurnPlan, str]:
    """`move_of` maps an event's `order` to its move index."""
    actions: list[Action] = []
    moves: list[int] = []
    orders: list[int] = []
    chose = False
    cleanup_type = None
    xdelta = 0
    spend = 0
    built = False
    chosen = None
    variant_of_chosen = 0
    played: set[str] = set()
    in_break = False
    boosts: list = []
    revealed: list = []
    flags: dict = {}
    venomous: set = set()                                # animals played with Venom / Constriction
    marketing_open = False                               # a bonus-sponsor / sponsor token announced a Marketing effect: the next sponsor played is its choice
    gained: set = set()
    assoc = _AssocMap(seat, lambda act, ev: add(act, ev))
    if any(x.type == "discardTokens" and "multiplier" in x.log for x in events) and sum(1 for x in events if x.type == "chooseActionCard") < 2:
        return "multiplier token used without a second action in the log (ISSUES.md)"       # the repetition is not visible in the log

    def add(act: Action, e: Event) -> None:
        actions.append(act)
        moves.append(move_of[e.order])
        orders.append(e.order)

    for e in events:
        a = e.args
        t = e.type
        if t == "startBreak":
            in_break = True
            continue
        if t == "getBonuses" and isinstance(a, dict) and a.get("source") == "Map 13 quarter bonus":      # a covered area pays (when it is covered and in every break): an effect to resolve
            for res in a["bonuses"]:
                add(Action(seat_of[str(a["player_id"])], "choose_effect", {"apply": "gain", "res": res}), e)
            continue
        if in_break and t == "getBonuses" and isinstance(a, dict) and a.get("source") == "appeal income":     # the appeal income is an effect: appeal gained before it counts
            add(Action(seat_of[str(a["player_id"])], "choose_effect", {"apply": "income_appeal"}), e)
            continue
        if in_break:                                   # the break (engine.breaks): only the hand limit discard is a decision
            if t == "pDiscardCards" and "You discard" in e.log and "scoring" not in e.log and "(" not in e.log.split("${card_names}")[-1]:
                add(Action(seat_of[str(e.player or a.get("player_id"))], "choose_effect",
                           {"cards": sorted(_key(c["id"]) for c in a["cards"])}), e)
                continue
            if t in ("getBonuses", "discardTokens", "slideMeeples", "addMeeples", "discardCardsOnDisplay", "fillPool", "finishBreak",
                     "updateBreakDiscardSelection", "markAssign", "gainMarked"):
                continue
            if t == "buyBuilding" and "adds" in e.log:                  # the free enclosure of a map bonus space (size 2)
                b = a["building"]
                add(Action(seat_of[str(a["player_id"])], "place_building", {"type": b["type"], "x": b["x"], "y": b["y"], "rotation": b.get("rotation", 0)}), e)
                continue
            if t == "snapCard" or (t == "pDrawCards" and e.log == "You draw ${card_names} from the deck"):         # a card taken as income (map bonus space, Science Lab): either player
                who = seat_of[str(a.get("player_id") or e.player)]
                if t == "pDrawCards":
                    add(Action(who, "take_cards", {"mode": "deck", "count": 1}), e)
                else:
                    for c in a["cards"]:
                        add(Action(who, "take_cards", {"mode": "range" if "reputation range" in e.log else "snap", "card": _key(c["id"])}), e)
                continue
        if chosen == "association" and cleanup_type is None and t not in ("chooseActionCard", "actionCardCleanup"):
            r = assoc.handle(e)
            if isinstance(r, str):
                return r
            if r is not _NOT_HANDLED:
                continue
        if t == "chooseActionCard":
            chose = True
            chosen, variant_of_chosen = parse_action_type(a["actionCard"]["type"])
            hypnotised = str(a["actionCard"].get("pId")) != str(a.get("player_id"))       # an action card of the other player (Hypnosis)
            assoc.variant, assoc.level = variant_of_chosen, int(a["actionCard"]["level"])
            spend = int(a["strength"]) - int(a["actionCard"]["strength"])
            if spend < 0:                                  # Constriction tokens: -2 strength each (the engine knows the tokens)
                spend += 2 * (-spend + 1) // 2
            paid = -sum((x.args.get("bonuses") or {}).get("xtoken", 0) for x in events[:events.index(e)]
                        if x.type == "getBonuses" and isinstance(x.args, dict) and x.args.get("source") == "increasing card strength")
            unpaid = max(0, spend - paid)                  # strength the log shows without X tokens: map 12 (AI) conceals low strengths, the harness checks it
            add(Action(seat, "choose_action_card", {"type": chosen, "spend": spend - unpaid, **({"unpaid": unpaid} if unpaid else {}),
                                                    **({"hypnosis": True} if hypnotised else {})}), e)
        elif t == "getBonuses" and isinstance(a, dict):
            b = a.get("bonuses") or {}
            if a.get("source") == "Animals3 ability" and chosen == "animals":              # Discount Animals, level II: 2 money for 1 appeal
                add(Action(seat, "choose_effect", {"apply": "pay_appeal"}), e)
            if "(Trade ef" in e.log and chosen == "sponsors":                       # Money Sponsors (1): trade an X token or money for money, an X token, a reputation
                op = ("rep_x" if b.get("xtoken", 0) < 0 else "rep_money") if "reputation" in b else ("trade_money" if b.get("xtoken", 0) < 0 else "trade_x")
                add(Action(seat, "sponsor_side", {"op": op}), e)
            if peaceful and chosen == "animals" and not a.get("card_id") and not a.get("source") and set(b) == {"money"} \
                    and any(n == "Pilfering 1" for k in played for n in _ability_names(k)):
                add(Action(seat, "choose_effect", {"apply": "gain", "res": "money"}), e)                   # peaceful Pilfering 1: 3 money
            if peaceful and chosen == "animals" and a.get("source") == "Inventive" and set(b) == {"xtoken"} \
                    and any(n == "Venom" for k in played for n in _ability_names(k)):
                add(Action(seat, "choose_effect", {"apply": "gain", "res": "xtoken"}), e)                  # peaceful Venom: X tokens
            if chosen == "animals" and a.get("card_id") and _key(a["card_id"]) in played and set(b) <= {"appeal", "reputation", "conservation", "money"}:
                for res in b:                                      # printed gains and Reef Dweller gains: effects of their own
                    add(Action(seat, "choose_effect", {"apply": "gain", "res": res}), e)
            if chosen in ("sponsors", "association", "animals"):
                if a.get("card_id"):
                    if _key(a["card_id"]) not in played and _key(a["card_id"]) not in prog.TRIGGERS:
                        return "triggered effect of another card"
                else:
                    if seat_of.get(str(a.get("player_id"))) != seat:
                        return "effect for the other player"
                    if a.get("source") in ("Hypnosis", "Pilfering"):
                        return "ability of an animal of the other player (Venom / Constriction / ...)"
                    if a.get("source") not in _SPONSOR_SOURCES and chosen != "association":      # (association: universities, partners, project names)
                        return f"unsupported sponsors source {a.get('source')}"
            if a.get("source") == "Venom":                       # the 2 money of a Venom token that was not removed this turn
                xdelta += 0
            elif not set(b) <= _RESOURCE_BONUSES or (set(b) != {"xtoken"} and not built and chosen not in ("sponsors", "association", "animals")):
                return f"unsupported bonus {sorted(b)}"
            xdelta += b.get("xtoken", 0)
            if chosen == "animals" and not a.get("card_id") and "trades" in e.log:
                add(Action(seat, "choose_effect", {"trade": "money" if b.get("xtoken", 0) < 0 else "xtoken"}), e)
            elif chosen == "animals" and a.get("source") == "Glide effect":
                add(Action(seat, "choose_effect", {"gain": "appeal" if "appeal" in b else "reputation"}), e)
        elif t == "pDrawCards" and e.log == "You draw ${card_names} from the deck" and chosen == "build"                 and (nxt_event(events, e) is not None and nxt_event(events, e).type == "buyAnimal" and nxt_event(events, e).args["card"].get("location") == "rescueStation"):
            pass                                                     # the card drawn for a rescued hand card: the engine draws it itself
        elif chosen in ("sponsors", "association", "animals", "build") and t in ("pDrawCards", "snapCard", "pDiscardCards"):
            why = _sponsor_cards(e, seat, seat_of, add, revealed, flags)
            if why:
                return why
        elif t in ("pDrawCards", "snapCard", "pDiscardCards") and chosen != "cards":
            return f"card effect ({t}) outside the Cards action"       # e.g. a card from a placement bonus: not implemented yet
        elif t == "pDrawCards":
            if "from the deck" not in e.log or a.get("scoringCard"):
                return f"unsupported draw: {e.log[:40]}"
            add(Action(seat, "take_cards", {"mode": "deck", "count": len(a["cards"])}), e)
        elif t == "snapCard":
            mode = "range" if "reputation range" in e.log else "snap"
            for c in a["cards"]:
                add(Action(seat, "take_cards", {"mode": mode, "card": _key(c["id"])}), e)
        elif t == "pDiscardCards" and e.log.startswith("You sell") and (a.get("bonuses") or {}).get("money") == 3 and len(a["cards"]) == 1:
            add(Action(seat_of[str(e.player or a.get("player_id"))], "harbor_sell", {"card": _key(a["cards"][0]["id"])}), e)      # map 4 Commercial Harbor
        elif t == "pDiscardCards":
            if e.log != "You discard ${card_names}":            # selling / pouching / keep-and-discard effects are not the Cards discard
                return f"unsupported discard: {e.log[:30]}"
            add(Action(seat, "discard_cards", {"cards": sorted(_key(c["id"]) for c in a["cards"])}), e)
        elif t == "buyAnimal" and a["card"].get("location") == "rescueStation":
            add(Action(seat, "choose_effect", {"display" if a.get("fromDisplay") else "hand": _key(a["card"]["id"]), "rescue": True}), e)       # map 10 Rescue Station
        elif t == "buyAnimal":
            bs = a.get("buildings") or []
            if len(bs) > 1:
                return "animal played with an unusual enclosure list"
            played.add(_key(a["card"]["id"]))
            for ab in data.cards_by_key()[_key(a["card"]["id"])].get("abilities") or []:
                if ab["keyword"]["name"] in ("Venom", "Constriction"):
                    venomous.add(_key(a["card"]["id"]))
                if ab["keyword"]["name"].startswith("Boost: "):
                    boosts.append({"Association": "association", "Sponsors": "sponsors", "Animal": "animals", "Card": "cards",
                                   "Building": "build"}[ab["keyword"]["name"][7:]])
            add(Action(seat, "play_animal", {"card": _key(a["card"]["id"]), "from_display": bool(a.get("fromDisplay")),
                                             **({"x": bs[0]["x"], "y": bs[0]["y"]} if bs else {"flock": True})}), e)
        elif t == "releaseAnimal":
            bl = a.get("buildings") or []
            add(Action(seat, "choose_effect", {"release": _key(a["card"]["id"]), **({"building": [bl[0]["x"], bl[0]["y"]]} if bl else {})}), e)    # Release projects
        elif t == "wazaSpecial":
            add(Action(seat, "choose_effect", {"waza": a["type"]}), e)
        elif t == "reconstructionRemove":
            add(Action(seat, "choose_effect", {"remove": sorted([b["x"], b["y"]] for b in a["buildings"])}), e)
        elif t == "reconstructionPlaceBack":
            b = a["building"]
            add(Action(seat, "place_building", {"type": b["type"], "x": b["x"], "y": b["y"], "rotation": b.get("rotation", 0)}), e)
        elif t == "playSponsor" and (chosen != "sponsors" or marketing_open):       # Marketing (animal ability, bonus-sponsor token): a sponsor of the hand for money
            played.add(_key(a["card"]["id"]))
            add(Action(seat, "choose_effect", {"card": _key(a["card"]["id"])}), e)
        elif t == "playSponsor" and flags.get("s4"):                   # Snap Sponsors (4), level II: a card discarded to play a sponsor for money
            played.add(_key(a["card"]["id"]))
            add(Action(seat, "sponsor_side", {"op": "discard_play", "card": flags.pop("s4"), "play": _key(a["card"]["id"])}), e)
        elif t == "playSponsor":
            played.add(_key(a["card"]["id"]))
            add(Action(seat, "play_sponsor", {"card": _key(a["card"]["id"]), "from_display": bool(a.get("fromDisplay"))}), e)
        elif chosen in ("sponsors", "animals") and t == "slideMeeples" and e.log.endswith("gains a new Association worker"):
            pass                                                     # Talented Communicator, Full-throated: the worker is hired by the engine itself
        elif t == "slideMeeples" and "worker(s) back" in e.log:
            add(Action(seat, "choose_effect", {"worker": int(a["meeples"][0]["id"])}), e)          # Extra Shift
        elif t == "discardCardsOnDisplay" and "Wave" in e.log:
            pass                                                     # the Wave icons of a played card / the refill: the engine moves the cards itself (to the discard or a mark owner's hand)
        elif t == "discardCardsOnDisplay" and "rightmost project card" in e.log:
            pass                                                     # the project slots are refilled by the engine
        elif chosen == "animals" and t == "discardCardsOnDisplay" and "Shark Attack" in e.log and not a.get("cards")                 and any(x.type == "markAssign" for x in events[events.index(e):events.index(e) + 3]):
            mk = next(x for x in events[events.index(e):events.index(e) + 3] if x.type == "markAssign")        # the marked card was hit: it goes to the mark's owner, not to the discard
            add(Action(seat, "choose_effect", {"cards": sorted(_key(c["id"]) for c in mk.args["cards"])}), e)
        elif chosen in ("animals", "cards") and t == "discardCardsOnDisplay" and not a.get("cards"):
            pass                                                     # nothing discarded: the optional effect is declined
        elif chosen in ("animals", "cards", "build") and t == "discardCardsOnDisplay" and " digs " in e.log:
            add(Action(seat, "choose_effect", {"display": _key(a["cards"][0]["id"])}), e)
        elif chosen == "animals" and t == "discardCardsOnDisplay" and "Shark Attack" in e.log:
            add(Action(seat, "choose_effect", {"cards": sorted(_key(c["id"]) for c in a["cards"])}), e)
        elif chosen == "animals" and t == "cutDown":
            add(Action(seat, "choose_effect", {"building_id": int(a["buildingId"])}), e)
        elif chosen == "animals" and t == "pilferingMoney":
            add(Action(seat_of[str(a["player_id"])], "choose_effect", {"pay": True}), e)
        elif chosen == "animals" and t in ("pilfering", "pilferingCard"):
            pass
        elif t == "markCard" and not chose:
            pass                                                     # the mark of the previous turn, logged after the turn marker (the harness takes it from here)
        elif t == "markCard":
            add(Action(seat, "choose_effect", {"card": next(iter(a["cards"]))[:4] if isinstance(a.get("cards"), dict) else _key(a["meeples"][0]["location"]),
                                               "mark": True}), e)
        elif t in ("gainMarked", "markAssign"):
            pass                                                     # the engine pays / hands over the marked card itself
        elif t == "hypnosis":
            add(Action(seat, "choose_effect", {"apply": "hypnosis"}), e)
        elif t == "discardTokens" and "multiplier" in e.log:
            pass                                                     # a Multiplier token used up by the repetition (the engine removes it)
        elif chosen == "animals" and t == "addMeeples" and ("Venom effect" in e.log or "Constriction effect" in e.log):
            add(Action(seat, "choose_effect", {"apply": "venom" if "Venom" in e.log else "constrict"}), e)
        elif chosen == "animals" and t == "sponsorMagnet":
            pass                                                     # Sponsor Magnet / Sea Animal Magnet: the engine takes the cards itself
        elif chosen == "sponsors" and t == "donation":
            add(Action(seat, "choose_effect", {"donate": True}), e)
        elif t == "advanceBreak" and chosen == "sponsors":
            add(Action(seat, "sponsor_break", {}), e)
        elif t == "buyBuilding":
            b = a["building"]
            if chosen in ("sponsors", "association", "animals") and "adds" in e.log and knows_shape(b["type"]):
                pass
            elif "adds" in e.log or b["type"] not in SIZES:
                return f"unsupported building: {b['type']}"
            built = True
            add(Action(seat, "place_building", {"type": b["type"], "x": b["x"], "y": b["y"], "rotation": b.get("rotation", 0)}), e)
        elif t == "actionCardCleanup" and cleanup_type is not None and "action card" not in e.log and chosen == "cards" and variant_of_chosen != 4:
            return "a card put on slot 1 in a Cards action without Clever (map effect?)"
        elif t == "actionCardCleanup" and cleanup_type is not None and "action card" not in e.log:
            if parse_action_type(a["actionCard"]["type"])[0] not in boosts:          # (a Boost to slot 1 is decided by the boost action)
                add(Action(seat, "choose_effect", {"type": parse_action_type(a["actionCard"]["type"])[0]}), e)
        elif t == "actionCardCleanup":
            cleanup_type, _ = parse_action_type(a["actionCard"]["type"])
        elif t == "slideMeeples" and e.log == "" and _bonus_tile(seat, a["meeples"][0]) is not None:
            add(_bonus_tile(seat, a["meeples"][0]), e)
        elif t == "takeBonus" and ((a.get("bonus_desc") or {}).get("args") or {}).get("bonus_type") == "bonus-sponsor":
            marketing_open = True                                    # (the choose_effect of the conservation choice follows through the generic takeBonus branch below)
            bd = (a.get("bonus_desc") or {}).get("args") or {}
            if bd.get("bonus_source_type") == "bonus":
                add(Action(seat, "choose_effect", {"bonus_type": "bonus-sponsor", "n": bd.get("bonus_n")}), e)
        elif t == "discardTokens" and any(m["type"] in ("bonus-sponsor-gray", "bonus-extra-shift") for m in a.get("meeples") or []):
            marketing_open = marketing_open or any(m["type"] == "bonus-sponsor-gray" for m in a["meeples"])
            add(Action(seat, "use_token", {"token": next(m["type"] for m in a["meeples"] if m["type"] in ("bonus-sponsor-gray", "bonus-extra-shift"))}), e)
        elif t == "discardTokens" and any(str(m.get("location", "")).startswith("S253") for m in a.get("meeples") or []):
            marketing_open = True                                    # Okapi Stable: a cube pays for a Marketing effect (the engine removes the cube)
        elif t == "discardTokens" and any(m["type"] == "bonus-ignore-conditions" for m in a.get("meeples") or []):
            pass                                                     # used up by the animal that ignores its conditions (the engine does it)
        elif t == "takeBonus":
            bd = (a.get("bonus_desc") or {}).get("args") or {}
            bt = bd.get("bonus_type")
            if bt and bd.get("bonus_source_type") == "bonus" and bt not in ("DISCARD_SCORING", "upgrade-card", "add-worker"):
                add(Action(seat, "choose_effect", {"bonus_type": bt, "n": bd.get("bonus_n")}), e)     # the choice at conservation 5 / 8
            # else: "gets <bonus>" of the reputation track, a map bonus space, ... (the engine grants it, a decision shows up as the events that follow)
        elif t == "upgradeCard":
            add(Action(seat, "choose_effect", {"upgrade": parse_action_type(a["actionCard"]["type"])[0]}), e)
        elif t not in _PASSIVE:
            return f"unsupported event {t}"
    if cleanup_type is None:
        return "no cleanup"
    if chose and chosen == "association" and variant_of_chosen == 4 and not any(x.kind in ("association_task", "self_clever") for x in actions):
        actions.append(Action(seat, "self_clever", {}))                  # Self-clever Association: nothing is done, another action follows
        moves.append(moves[-1])
        orders.append(orders[-1])
    if not chose:                                       # the action was skipped: the card goes to slot 1 and gives an X token
        if xdelta not in (0, 1):
            return "unexplained X token change"
        cleanup_order = next(e for e in events if e.type == "actionCardCleanup").order
        return TurnPlan([Action(seat, "skip_action", {"type": cleanup_type})], [move_of[cleanup_order]], False, orders=[cleanup_order])
    if chosen == "association" and assoc.support is not None and assoc.support.args.get("bonus") is None:
        if not again:
            return "association bonus unknown"
        assoc.support.args["bonus"] = {"type": "Determination"}              # the notepad bonus leaves no trace in the log but the same player acting again
    cleanup_event = next(e for e in events if e.type == "actionCardCleanup")
    for t in boosts:                                       # Boost: X, resolved after the action: slot 1 or 5 is read off the final order
        add(Action(seat, "choose_effect", {"boost": t}), cleanup_event)
    if not built and chosen not in ("sponsors", "association", "animals") and xdelta != -spend:
        return "unexplained X token change"
    return TurnPlan(actions, moves, True, orders=orders)
