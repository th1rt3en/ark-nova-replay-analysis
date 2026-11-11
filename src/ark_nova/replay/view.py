"""Everything the replay viewer needs for one table, as JSON: static facts (players, maps, card catalog) + one view per replay step.

A step is one kept `move_id` of the log; its state is the replay builder's state after that move (`Replay.states`), without the
decks (only their sizes) and with the cells every building covers, so the browser needs no board geometry code.
"""
import json
import os
import copy
import dataclasses
import functools
import re
from pathlib import Path
from typing import Any

from ark_nova import data
from ark_nova.data import map_quirks
from ark_nova.replay.merge import mark_merges
from ark_nova.engine import association, endgame, tracks
from ark_nova.engine.breaks import hand_limit, kiosk_income, map_ability_income, map_income, sponsor_income
from ark_nova.engine.game import deck_cards
from ark_nova.engine.board import footprint_cells
from ark_nova.engine import cubes as cube_rules
from ark_nova.engine.build_action import knows_shape, shape_of
from ark_nova.engine.state import GameState, Phase
from ark_nova.parser.log import parse_log
from ark_nova.parser.model import Move, ParsedLog
from ark_nova.replay.builder import Replay, build_replay
from ark_nova.engine import map_rules
from ark_nova.replay.config import game_from_log, infer_maps
from ark_nova.replay.engine_replay import build_engine_replay
from ark_nova.replay.options import step_options
from ark_nova.replay.variant_stats import logged_variant_gains
from ark_nova.replay.sponsor_sources import sponsor_event_gains
from ark_nova.replay.mapstats import map_stats, waza_large_events
from ark_nova.replay.sponsor_stats import SponsorLogStats, diversity_gains, sponsor_source_hints, sponsor_state_gains, tracked_sponsors as _tracked_sponsors
from ark_nova.storage.index import TableRecord

_PLACEHOLDER = re.compile(r"\$\{(\w+)\}")
QUICK_MIN_MOVES = 20                                        # a quick view holds at least this many moves (the draft, the starting hands and the first turns), so the player can step around before the full replay arrives
QUICK_MOVES = 60                                           # moves of a quick view when the log never deals the starting hand
IMAGE_DIR = {"animal": "animals", "sponsor": "sponsors"}       # fallback art from the vendored upstream repo (/img)
WEB_DIR = Path(os.environ.get("WEB_DIR") or Path(__file__).resolve().parents[3] / "web")      # the Docker image sets WEB_DIR (the package lives in site-packages there)
LARGE_DIR = WEB_DIR / "cards_large"      # full size cards (745 x 1040) for the hover preview (scripts/build_cards.py)
CARD_DIR = WEB_DIR / "cards"    # card images (360 x 503) made by scripts/build_cards.py
PRICE_BOXES = WEB_DIR / "price_badges" / "geometry.json"      # {animal key: [x, y, w, h]}: the price badge of the card image as fractions of the card (cardgen/shoot.mjs, the viewer draws the discounted price over it)
TIMED_BY_LOG = ("break_position", "round", "display", "main_deck_size", "main_deck", "main_discard_size", "main_discard", "endgame_deck", "endgame_deck_size", "current_action", "active_player", "turn")      # shown as the log has them at each step (the refill comes later than the engine's); likewise the order of the action cards
GAIN_FIELDS = ("reputation", "appeal", "conservation")
LOG_TIMED_PLAYER_FIELDS = ("action_cards", "hand", "money", "reputation", "x_tokens", "appeal", "conservation", "score", "income", "income_total", "income_parts", "income_lines", "hand_limit")      # per player, same reason
PICTURE_OF = {"6a": "6"}              # map 6a has the same board as map 6; its own picture has the placement bonuses baked in (bugged)
STATE_DROP = ("endgame_discard", "seed", "config", "rng", "base_projects_unused", "version", "checkpoint")


def render_log(template: str, args: Any, depth: int = 0) -> str:
    """BGA log template + args -> plain text. Icon placeholders and unknown arguments disappear."""
    if not isinstance(args, dict) or depth > 4:
        return _PLACEHOLDER.sub("", template or "").strip()

    def sub(m: re.Match) -> str:
        v = args.get(m.group(1))
        if isinstance(v, dict) and "log" in v:
            return render_log(v["log"], v.get("args"), depth + 1)
        if isinstance(v, (str, int, float)) and not isinstance(v, bool):
            return str(v)
        return ""

    text = re.sub(r"\s+", " ", _PLACEHOLDER.sub(sub, template or "")).strip()
    return _BREAK_SENTENCE.sub("", text)


_BREAK_SENTENCE = re.compile(r"\.? ?At the end of the turn, all players must take a break\.?$")          # (BGA adds it to the line that moves the break token onto the last space: redundant, the break starts by itself)


@functools.lru_cache(maxsize=1)
def _action_card_names() -> dict:
    """The name of each action card variant, "sponsors2" -> "Money Sponsors" (the names of the viewer: web/js/cards.js VARIANT_NAME)."""
    return {f"{c['category']}{c['variant']}": str(c["name"]).replace("Pavillion", "Pavilion") for c in data._load("action_cards")}


def _draft_text(e, names: dict[str, str]) -> str:
    """The private action card draft events have no log text: say what the player picked / kept (a keep: "X keeps Money Sponsors and Terrain Build")."""
    def pretty(v) -> str:
        v = str(v)
        return _action_card_names().get(v.lower()) or (f"{v[:-1].capitalize()} {v[-1]}" if v[-1:].isdigit() else v)
    a = e.args if isinstance(e.args, dict) else {}
    pv = (a.get("args") or {}).get("_private") or a
    who = names.get(str(e.player), "A player")
    cards = [f"{str(c.get('actionType')).lower()}{c.get('number')}" for c in pv.get("cards") or []]
    if e.type == "updateInitialActionCardSelection" and pv.get("selection"):
        rnd = "first" if not pv.get("previous") else "second"
        return f"{who} picks {pretty(pv['selection'])} from {', '.join(pretty(c) for c in cards)} (action card draft, {rnd} pick)"
    if e.type == "updateInitialActionCardsKeep" and pv.get("selection"):
        return f"{who} keeps {' and '.join(pretty(v) for v in pv['selection'])}"
    return ""


# What an opponent does not see in the physical game: the cards drawn from the deck (and the scoring cards), cards stored or pouched face down. The cards that are revealed
# (Hunter, Perception, Scuba Dive, a search of the deck, the discard pile) and everything that goes to the open discard pile are public (planning sheet "visibility").
# A targeted draw is always public: the card found in the deck is shown to everybody (search effects, Map 8, Map 14, Waza Special Assignment, Monkey Gang, worker bonuses, the university search).
_PUBLIC_DRAW = re.compile(r"resistance effect|for gaining a new university|from discard|Dominance|Pilfering|with <|Map 8 effect|Map 14 effect|Waza Special|monkey gang effect")
# (hidden from the other player: the scoring cards, Adapt, pouched cards, sunbathed (sold) cards, the discards of Hunter / Scuba Dive without a pick, Glide, a card dug from the hand;
# the break discards (see `_break_move`) and the keep / discard line of Perception (no suffix) are too)
_SECRET_DISCARD = re.compile(r"scoring card|adapt effect|pouch|\bsell\b|\(no animal\)|\(no sponsor\)|Glide effect|dig .* from your hand")
_PLAIN_DISCARD = re.compile(r"^You discard \$\{card_names\}$")                    # (the discard of the Cards action: the other player does not read the card)
_PERCEPTION_KEEP = re.compile(r"^You keep \$\{card_names2\} and discard \$\{card_names\}$")


def _card_key(card_id: str) -> str:
    return data.parse_bga_card_id(card_id)[0]


@functools.lru_cache(maxsize=1)
def _endgame_has_appeal() -> bool:
    """True once any endgame card in the data scores appeal (none does today). The info box shows a "hidden endgame card" line under the
    appeal chip of a hidden hand only then; the check follows the data, so adding such a card needs no frontend change."""
    return any("appeal" in key.lower() for c in data.endgames() for s in c.get("scoreArray", []) for key in s)


def _card_live(state: GameState, seat: int, key: str) -> dict:
    """What an endgame card would score for the seat if the game ended now, by kind: {"conservation": n, "appeal": n}. The endgame cards of today only give conservation points; the
    appeal slot is there so that a card that scores appeal needs no change in the viewer (the lightbox shows each kind that is not 0, conservation always)."""
    try:
        return {"conservation": endgame.card_points(state, seat, key), "appeal": 0}
    except Exception:                                      # a position the rules cannot read: no count
        return {}


def _resistance_reveal(events: list, seat_of_pid: dict) -> dict | None:
    """The endgame cards of a Resistance effect, for the lightbox of the viewer: {seat, cards} on the step that draws them (the state does not hold them yet: they are not in the
    hand until one is kept), {seat, cards, kept} on the step that keeps one of them (the discarded card is in no state at all)."""
    for e in events:
        if e.type not in ("pDrawCards", "pDiscardCards") or "for resistance effect" not in (e.log or "") or not isinstance(e.args, dict):
            continue
        a = e.args
        seat = seat_of_pid.get(str(a.get("player_id") or e.player))
        if seat is None:
            continue
        try:
            if e.type == "pDrawCards":
                return {"seat": seat, "cards": [_card_key(c["id"]) for c in a.get("cards") or []]}
            kept = _card_key(a["card"]["id"])
            return {"seat": seat, "cards": [kept] + [_card_key(c["id"]) for c in a.get("cards") or []], "kept": [kept]}
        except (KeyError, TypeError):
            continue
    return None


_HW_PLAY = re.compile(r"^(.+?) plays Horse Whisperer\b")
_HW_DRAW = re.compile(r"^(.+?) draws .* from discard for Horse Whisperer effect$")


def _is_pet(key: str) -> bool:
    c = data.cards_by_key().get(key)
    return bool(c) and key.startswith("A") and "pet" in c.get("tags", [])


def _adapt_reveal(events: list, seat_of_pid: dict) -> dict | None:
    """The cards of an Adapt effect, for the lightbox of the viewer: {seat, drawn} on the step that draws the endgame cards, {seat, discarded} on the step that discards some (the log words
    both as "for adapt effect"; only the player's own version of the line has the card ids). `_adapt_pools` completes them."""
    for e in events:
        if e.type not in ("pDrawCards", "pDiscardCards") or "for adapt effect" not in (e.log or "") or not isinstance(e.args, dict):
            continue
        a = e.args
        seat = seat_of_pid.get(str(a.get("player_id") or e.player))
        if seat is None:
            continue
        try:
            keys = [_card_key(c["id"]) for c in a.get("cards") or []]
        except (KeyError, TypeError):
            continue
        return {"seat": seat, "drawn" if e.type == "pDrawCards" else "discarded": keys}
    return None


def _adapt_pools(steps: list) -> None:
    """Adds the whole pool to the `adapt` of the steps: `cards` = the endgame cards held before (in the hand's order) + the ones just drawn. The discard step gets the pool of the draw step
    before it (`from` = its index): the lightbox shows the same cards, with the discarded ones marked."""
    for i, st in enumerate(steps):
        ad = st.get("adapt")
        if not ad:
            continue
        seat = ad["seat"]
        if "drawn" in ad and "discarded" not in ad:
            hand = steps[i]["state"]["players"][seat].get("endgame_hand") or []
            held = [k for k in hand if k not in ad["drawn"]]
            ad["cards"] = held + ad["drawn"]
            continue
        k = next((j for j in range(i - 1, max(-1, i - 4), -1) if "drawn" in (steps[j].get("adapt") or {}) and "discarded" not in steps[j]["adapt"] and steps[j]["adapt"]["seat"] == seat), None)
        if k is None:
            del st["adapt"]
            continue
        ad["cards"], ad["drawn"], ad["from"] = steps[k]["adapt"]["cards"], steps[k]["adapt"]["drawn"], k
        ad["points"] = {**ad.get("points", {}), **steps[k]["adapt"].get("points", {})}            # (the same numbers as on the draw frame)


def _horse_whisperer(steps: list, player_names: list) -> None:
    """Sets `step["horse"] = {seat, pile, pets, kept}` for the lightbox of Horse Whisperer (the whole discard pile, the Petting Zoo animals on top, replay/reveal.js). The step that draws the animal
    carries it (the pile before the draw, `kept` = the card taken); a play with no Petting Zoo animal in the pile has no draw line, its lightbox is on the step of the Horse Whisperer's money (or on the play)."""
    for i, st in enumerate(steps):
        m = _HW_PLAY.match(st["label"] or "")
        if not m or m.group(1) not in player_names:
            continue
        seat = player_names.index(m.group(1))
        end = min(len(steps), i + 8)
        draw = next((j for j in range(i + 1, end) if (d := _HW_DRAW.match(steps[j]["label"] or "")) and d.group(1) == m.group(1)), None)
        if draw is not None:
            before, after = steps[draw - 1]["state"]["main_discard"], steps[draw]["state"]["main_discard"]
            gone = [k for k in before if k not in after]
            steps[draw]["horse"] = {"seat": seat, "pile": list(before), "pets": [k for k in before if _is_pet(k)], "kept": gone[0] if gone else None}
            continue
        at = next((j for j in range(i, min(len(steps), i + 4)) if "(Horse Whisperer)" in (steps[j]["label"] or "")), i)
        pile = steps[at]["state"]["main_discard"]
        steps[at]["horse"] = {"seat": seat, "pile": list(pile), "pets": [k for k in pile if _is_pet(k)], "kept": None}


def _assertion_reveal(events: list, seat_of_pid: dict, moves: list, mv, config) -> dict | None:
    """The Assertion of a step, for the lightbox of the viewer: {seat, cards (the base projects on offer), kept}. The offer is BGA's list of the choice (the private `cardIds` the log
    holds just before the keep line, `Move.offers`); a log without it falls back to every base project that is not in play."""
    for e in events:
        if e.type != "pDrawCards" or "with Assertion" not in (e.log or "") or not isinstance(e.args, dict):
            continue
        a = e.args
        seat = seat_of_pid.get(str(a.get("player_id") or e.player))
        if seat is None or not a.get("cards"):
            continue
        try:
            kept = _card_key(a["cards"][0]["id"])
        except (KeyError, TypeError, IndexError):
            continue
        pid = str(a.get("player_id") or e.player)
        offer: list = []
        for m in moves[max(0, mv.index - 3): mv.index + 1][::-1]:
            mine = [o for o in m.offers if str(o["player"]) == pid]
            if mine:
                offer = [_card_key(c) for c in mine[-1]["cards"]]
                break
        if kept not in offer:
            offer = [k for k in deck_cards("base_project", config.marine_worlds) if k not in config.base_projects]
            if kept not in offer:
                offer.append(kept)
        return {"seat": seat, "cards": offer, "kept": [kept]}
    return None


def _break_move(move) -> bool:
    """Is this move a break (its discards down to the hand limit are made face down: the other player does not read the cards)?"""
    return any(e.type == "updateBreakDiscardSelection" for e in move.events)


# the reveals (Hunter, Scuba Dive, Scavenging, Perception): what the player draws and keeps is not named for the other player
REVEAL_EFFECT = re.compile(r"for (hunter|scuba dive|scavenging|perception|resistance) effect")


def _reveal(e) -> str | None:
    """The reveal that a draw or keep line of an event belongs to ("hunter", "scuba dive", ...), None for any other event."""
    if e.type not in ("pDrawCards", "pDiscardCards"):
        return None
    m = REVEAL_EFFECT.search(e.log or "")
    if m:
        return None if m.group(1) == "resistance" and e.type == "pDrawCards" else m.group(1)          # (the endgame cards drawn by Resistance are public, the keep / discard line is not)
    return "perception" if e.type == "pDiscardCards" and _PERCEPTION_KEEP.search(e.log or "") else None


def _reveal_hidden(e, effect: str) -> str:
    """The line of a reveal for the other player: the number of cards drawn; the card kept for Hunter / Scuba Dive, the number kept for the others."""
    a = e.args if isinstance(e.args, dict) else {}
    if e.type == "pDrawCards":
        n = len(a.get("cards") or []) or 1
        return f"You draws {n} card{'' if n == 1 else 's'} for the {effect} effect"
    if effect in ("hunter", "scuba dive") and "card" in a:
        try:
            text = render_log(re.sub(r" and discard \$\{card_names\}", "", e.log), a)
        except Exception:                                    # noqa: BLE001 (a line that does not match the template: the count)
            text = None
        if text:
            return text.replace("You keep ", "You keeps ", 1).replace(f" for {effect} effect", f" for the {effect} effect")
    n = len(a.get("cards2") or []) or 1
    return f"You keeps {n} card{'' if n == 1 else 's'} for the {effect} effect"


def _secret(e, brk: bool = False) -> bool:
    """Is this private event (written for one player) something that the other player must not read? `brk`: the event is in a break move."""
    if e.player is None:
        return False
    if _reveal(e):
        return True
    log = e.log or ""
    if brk and e.type == "pDiscardCards":
        return True
    if e.type == "pDrawCards":
        return not _PUBLIC_DRAW.search(log)
    if e.type == "pDiscardCards":
        return bool(_SECRET_DISCARD.search(log) or _PLAIN_DISCARD.search(log))
    return e.type in ("pStoreCard", "pUnstoreCard")


def _hidden_text(e) -> str:
    """The log line of a secret event with the cards replaced by their number."""
    if _reveal(e):
        return _reveal_hidden(e, _reveal(e))
    a = e.args if isinstance(e.args, dict) else {}
    cards = a.get("cards")
    n = len(cards) if isinstance(cards, list) and cards else 1
    word = f"{n} card" + ("" if n == 1 else "s")
    if "${card_names} cards" in (e.log or ""):                         # ("You pouch ${card_names} cards for ...": the word is already there)
        word = str(n)
        if n == 1:
            return render_log(e.log.replace("${card_names} cards", "${card_names} card"), {**a, "card_names": "1"}).replace(" from your hand", " from their hand")
    hidden = {**a, "card_names": word, "card_name": word, "card_names2": word}
    return render_log(e.log, hidden).replace(" from your hand", " from their hand")


def _fix_grammar(t: str) -> str:
    """BGA's public template "${player_name} increase the size of a ${building_name}" has no -s and the building name already starts with "a"."""
    return re.sub(r"^(.+?) increase the size of (?:a )?(an? )", r"\1 increases the size of \2", t)


_ANNOUNCES_TAKE = re.compile(r"^[^\n]* gets \d+ x (?:take-in-range-or-deck|upgrade-card|bonus-scoring-cards|MAP_13_INCOME)(?: \([^)]*\))?$")      # (the Drawing Board's "X gets 1 x MAP_13_INCOME (map bonus space)" (the number is the quadrant: 0 money, 1 appeal, 2 reputation, 3 hunters) only announces the quarter bonus that the next lines give; the upgrade-card line only announces the "X upgrades <card>" that follows; its state is the one of the step before; the bonus-scoring-cards line of Adapt 3 (5 / 8 conservation, 16 reputation) comes between the draw and the discard of the 3 scoring cards and says nothing the two lines do not)


def _you_to_name(t: str, name: str) -> str:
    """"You draw A" (the private line of the log) as the other players read it: "X draws A" (the verb takes the 3rd person singular -s)."""
    m = re.match(r"^You (\w+)", t)
    if not m:
        return t
    verb = m.group(1)
    if not verb.endswith("s"):                                  # (BGA wrote "You takes" once: already right)
        verb += "es" if re.search(r"(sh|ch|x|z|o)$", verb) else "s"
    return f"{name} {verb}" + t[m.end():]


def _event_text_pov(e, names: dict[str, str], pov, initial_discard: bool = False, brk: bool = False) -> str:
    """The line of an event as the viewer at `pov` (a player id, None = sees everything) reads it. `initial_discard`: the event is in the move of the initial discards,
    which the other player does not see (the cards go to the pile face down)."""
    if initial_discard and e.type == "pDiscardCards" and e.player:         # the opening discard is short for everyone: "X discards 4 cards" (the cards are no use to the reader)
        cards = (e.args or {}).get("cards") if isinstance(e.args, dict) else None
        n = len(cards) if isinstance(cards, list) and cards else 1
        return f"{names.get(e.player) or 'A player'} discards {n} card{'' if n == 1 else 's'}"
    secret = e.player is not None and (_secret(e, brk) or (initial_discard and e.type == "pDiscardCards"))
    t = _hidden_text(e) if pov is not None and str(e.player) != str(pov) and secret else render_log(e.log, e.args)
    if e.player and names.get(e.player):          # private events are written for the player: "You draw ..."
        t = _you_to_name(t, names[e.player])
    if initial_discard:                           # (the first display is not named either)
        t = re.sub(r"^(The display is replenished) with .*$", r"\1", t)
    return _fix_grammar(t)


def step_label(move: Move, names: dict[str, str], pov=None, initial_discard: bool = False) -> str:
    texts = []
    brk = _break_move(move)
    for e in move.events:
        if e.type in ("updateInitialActionCardSelection", "updateInitialActionCardsKeep"):
            t = _draft_text(e, names)
            if pov is not None and e.player is not None and str(e.player) != str(pov):          # the other player's choices stay hidden
                t = f"{names.get(str(e.player), 'A player')} chooses action cards (action card draft)" if t else ""
        else:
            t = _event_text_pov(e, names, pov, initial_discard, brk)
        if t and t not in texts:
            texts.append(t)
    return " · ".join(texts[:3])


def _split_discards(mv: Move, before: GameState, final_view: dict, pids: list) -> list[dict]:
    """The move of the starting discards has three groups of lines ("A discards 4 cards", "B discards 4 cards", "The display is replenished") but no sub-states: the views of the first two steps
    are made from the state before the move and the one after it. Step 1: the first player to discard has discarded; step 2: both have, the display is still as before; step 3: the move's end."""
    first = next((e.player for e in mv.events if e.type == "pDiscardCards" and e.player), None)
    seat = next((i for i, pid in enumerate(pids) if str(pid) == str(first)), None)
    if seat is None:
        return [final_view]
    was = state_view(before)
    one = copy.deepcopy(was)
    one["players"][seat] = copy.deepcopy(final_view["players"][seat])
    two = {k: copy.deepcopy(was[k]) for k in was}
    two["players"] = copy.deepcopy(final_view["players"])
    return [one, two, final_view]


def _split_keep_and_draw(mv: Move, step: dict, before: dict | None, names: dict[str, str], pids: list) -> list | None:
    """The last keep of the action card draft and the starting hands are three steps: "X keeps Money Sponsors and Terrain Build", then one step per player, in seat order:
    "X draws 8 cards and 2 endgame cards" (9 cards with the map of Lagoon, counted from the log). The first step has the state of the step before with the draft finished;
    the step of the first player to draw has the second player's hand, endgame cards and the cards of the decks still as before.
    Lagoon (map 14): each player also gets a person sponsor searched out of the deck ("X draws Spokesperson with <SPONSOR-PERSON> (Map 14 effect)"). It is not part of the deal:
    the two draws of 8 + 2 come first (without the sponsor, so the viewer's merged deal step reads "A and B draw 8 cards and 2 endgame cards"), then one step per player in seat
    order with the sponsor (`merge_group` "person<seat>", never merged with the deal; the replay plays them on by itself after the deal, playback.js `personChain`)."""
    keeps = [e for e in mv.events if e.type == "updateInitialActionCardsKeep"]
    draws = [e for e in mv.events if e.type == "pDrawCards" and e.player]
    if len(keeps) != 1 or not draws or before is None or "draft" not in step["state"] or len(pids) != 2:
        return None
    cards = {str(pid): [0, 0] for pid in pids}                       # per player: [starting cards, endgame cards]
    for e in draws:
        if str(e.player) in cards and isinstance(e.args, dict):
            cards[str(e.player)][1 if "(scoring cards)" in (e.log or "") else 0] += len(e.args.get("cards") or [])
    if not all(sum(c) for c in cards.values()):
        return None

    def keep_label(pov) -> str:
        t = _draft_text(keeps[0], names)
        if pov is not None and str(keeps[0].player) != str(pov):
            t = f"{names.get(str(keeps[0].player), 'A player')} chooses action cards (action card draft)"
        return t

    targeted = {str(pid): [e for e in draws if str(e.player) == str(pid) and isinstance(e.args, dict) and e.args.get("cards") and _PUBLIC_DRAW.search(e.log or "") and "(scoring cards)" not in (e.log or "")] for pid in pids}

    found_keys = {pid: [_key_of(c) for e in found for c in e.args["cards"]] for pid, found in targeted.items()}

    def draw_label(pid) -> str:
        n, m = cards[str(pid)]
        n -= len(found_keys[str(pid)])                                 # (a card found by a search - Map 14's person sponsor - is a step of its own: it is public)
        return f"{names.get(str(pid), 'A player')} draws {n} card{'' if n == 1 else 's'}" + (f" and {m} endgame card{'' if m == 1 else 's'}" if m else "")

    keep_text = keep_label(None)
    lp = [keep_label(pid) for pid in pids]
    first = {**step, "label": keep_text, "label_pov": [t if t != keep_text else None for t in lp] if any(t != keep_text for t in lp) else None,
             "state": {**copy.deepcopy(before), "draft": step["state"]["draft"]}, "options": None, "actor": None, "_obj": None}

    def without(st: dict, seats: list) -> dict:                       # the final state with the hands of `seats` still as before, and the person sponsors of the others not drawn yet
        out = copy.deepcopy(st)
        deck = list(out["main_deck"])
        for seat, pid in enumerate(pids):
            if seat in seats:
                for k in ("hand", "endgame_hand", "initial_offer"):
                    out["players"][seat][k] = copy.deepcopy(before["players"][seat][k])
        drawn = [k for seat, pid in enumerate(pids) if seat not in seats for k in out["players"][seat]["hand"]]
        gone = list(before["main_deck"])
        for k in drawn:                                               # (the deck: the one before the deal without the cards dealt so far, in its order)
            if k in gone:
                gone.remove(k)
        out["main_deck"] = gone if len(gone) >= len(deck) else deck
        eg = list(before["endgame_deck"])
        for seat in range(len(pids)):
            if seat not in seats:
                for k in out["players"][seat].get("endgame_hand") or []:
                    if k in eg:
                        eg.remove(k)
        out["endgame_deck"] = eg
        out["main_deck_size"], out["endgame_deck_size"] = len(out["main_deck"]), len(out["endgame_deck"])
        return out

    def strip(st: dict, seats: list) -> dict:                         # the person sponsors of `seats` not drawn yet: out of the hand, back in the deck (where the deck had them)
        out = copy.deepcopy(st)
        back = []
        for seat in seats:
            for k in found_keys[str(pids[seat])]:
                for z in ("hand", "initial_offer"):
                    if k in out["players"][seat][z]:
                        out["players"][seat][z].remove(k)
                back.append(k)
        if back:
            order = {k: i for i, k in enumerate(before["main_deck"])}
            out["main_deck"] = sorted(set(out["main_deck"]) | set(back), key=lambda k: order.get(k, len(order))) if all(k in order for k in back) else back + list(out["main_deck"])
            out["main_deck_size"] = len(out["main_deck"])
        return out

    persons = [seat for seat, pid in enumerate(pids) if found_keys[str(pid)]]
    final = step["state"]
    mid_state = strip(without(final, [1]), persons)                   # after the first player's deal only
    deal_state = strip(final, persons)                                 # both deals, no person sponsor yet
    middle = {**step, "label": draw_label(pids[0]), "label_pov": None, "state": mid_state, "options": None, "actor": None, "_obj": None, "log_only": True, "merge_group": "deal"}
    last = {**step, "label": draw_label(pids[1]), "label_pov": None, "state": deal_state if persons else final, "log_only": True, "merge_group": "deal"}
    out = [first, middle, last]
    if persons:
        last.update(options=None, actor=None, _obj=None)
    for i, seat in enumerate(persons):                                 # Lagoon: the person sponsors, one step per player, the last one has the step's own state
        st = final if i == len(persons) - 1 else strip(final, persons[i + 1:])
        text = " · ".join(_event_text(e, names) for e in targeted[str(pids[seat])])
        out.append({**step, "label": text, "label_pov": None, "state": st, "log_only": True, "merge_group": f"person{seat}",
                    **({} if i == len(persons) - 1 else {"options": None, "actor": None, "_obj": None})})
    return out


def _key_of(card) -> str:
    """The card key of a card of a log event ({"id": "S202_Spokesperson", ...} -> S202)."""
    return data.parse_bga_card_id(str(card.get("id") if isinstance(card, dict) else card))[0]


def _event_text(e, names: dict[str, str]) -> str:
    t = render_log(e.log, e.args)
    if e.player and names.get(e.player):
        t = _you_to_name(t, names[e.player])
    return _fix_grammar(t)


def group_labels(move: Move, names: dict[str, str], pov, initial_discard: bool = False) -> list[str]:
    """`move_groups` labels as the viewer at `pov` reads them (the same groups: they are cut by the unredacted text)."""
    groups: list[list] = []
    brk = _break_move(move)
    for e in move.events:
        t = _event_text(e, names)
        if not t:
            continue
        if not groups or t != groups[-1][0]:
            groups.append([t, _event_text_pov(e, names, pov, initial_discard, brk)])
    return [g[1] for g in groups]


def move_groups(move: Move, names: dict[str, str]) -> list[tuple[str, int]]:
    """The effects of a move, one per log line: [(label, order of the event that starts it)]. Events without a log line (token moves, state
    updates) belong to the effect before them; a private and a public version of one line count once."""
    groups: list[list] = []
    for e in move.events:
        t = _event_text(e, names)
        if not t:
            continue
        if not groups:
            groups.append([[t], None])                      # the first effect starts with the move
        elif t not in groups[-1][0]:
            groups.append([[t], e.order])
    return [(" · ".join(texts), start) for texts, start in groups]


def group_actors(move: Move, groups: list, seat_of: dict[str, int]) -> list:
    """The seat of the player who does each effect of the move (from the `player_id` of its first event that has one), None when the log does not say."""
    starts = [start for _, start in groups]
    out = []
    for gi in range(len(groups)):
        lo = starts[gi] if starts[gi] is not None else -1
        hi = starts[gi + 1] if gi + 1 < len(groups) else 10 ** 12
        actor = None
        for e in move.events:
            if lo <= e.order < hi or (gi == 0 and e.order < hi):
                pid = e.args.get("player_id") if isinstance(e.args, dict) else None
                pid = pid if pid is not None else e.player
                if pid is not None and str(pid) in seat_of:
                    actor = seat_of[str(pid)]
                    break
        out.append(actor)
    return out


DRAFT_ROUND_TEXT = {"pick1": "Action card draft, first pick: every player is offered action cards",
                    "pick2": "Action card draft, second pick: every player is offered the action cards the other one passed",
                    "keep": "Action card draft, last round: every player has 3 action cards and keeps 2 of them, of two different action cards"}


def _draft_option_steps(steps: list, rounds: dict) -> tuple[list, int]:
    """Before the step where a round of the action card draft starts (the first log event of that round) a step that shows the options of both players and no choice
    yet; the choices then appear one log event at a time. Returns the new steps and how many were added."""
    out, added, prev_stage = [], 0, None
    for st in steps:
        d = st["state"].get("draft")
        stage = d["stage"] if d else None
        if stage in DRAFT_ROUND_TEXT and stage != prev_stage:
            pre_d = {**d, "choice": [None, None], "kept": [[], []], "picked": [p[:1] if stage == "pick2" else ([] if stage == "pick1" else p) for p in d["picked"]]}
            out.append({**st, "state": {**st["state"], "draft": pre_d}, "label": DRAFT_ROUND_TEXT[stage], "label_pov": None, "options": None, "actor": None, "_obj": rounds.get(stage)})
            added += 1
        prev_stage = stage
        out.append(st)
    return out, added


def building_cells(state_building: dict) -> list[list[int]]:
    t = state_building["type"]
    if not knows_shape(t):
        return []
    return [list(c) for c in footprint_cells(shape_of(t), (state_building["x"], state_building["y"]), state_building["rotation"])]


def income_parts(state: GameState, ps) -> dict:
    """The money of the next break by source (view only): appeal track, kiosks, the map's printed ability, sponsors, income bonuses of the map already activated."""
    parts = {"appeal": tracks.income_from_appeal(ps.appeal)}
    try:
        parts["kiosks"] = kiosk_income(ps)
        parts["map"] = map_ability_income(state, ps)
        parts["sponsors"] = sponsor_income(state, ps)["money"]
        parts["map_bonuses"] = sum(b["value"] for b in map_income(state, ps) if b.get("type") == "money")
    except Exception:                                      # a position the helpers cannot read: show the appeal income alone
        parts = {"appeal": parts["appeal"]}
    return {k: v for k, v in parts.items() if v or k == "appeal"}


def income_lines(state: GameState, ps) -> list:
    """The same money by single source for the income pop-up: [category, label, amount, card key or None]; category 0 appeal track, 1 zoo (kiosks, map ability), 2 one line per sponsor, 3 map bonuses."""
    lines = [[0, "Appeal track", tracks.income_from_appeal(ps.appeal), None]]
    try:
        lines.append([1, "Kiosks", kiosk_income(ps), None])
        lines.append([1, data.map_by_id(ps.map_id)["name"], map_ability_income(state, ps), None])
        for k in ps.sponsors:
            lines.append([2, k, sponsor_income(state, ps, only=[k])["money"], k])
        lines.append([3, "Map bonuses", sum(b["value"] for b in map_income(state, ps) if b.get("type") == "money"), None])
    except Exception:
        lines = lines[:1]
    return [l for l in lines if l[2] or l[0] == 0]


def endgame_lines(state: GameState, ps) -> tuple:
    """The conservation points of the endgame for the pop-up: ([[sponsor key, n]], [[endgame card key, n]]), biggest first. The cards are private (the live projection takes them out)."""
    try:
        if state.phase in (Phase.OVER, Phase.SCORING):
            return [], []
        sp = [[k, endgame.sponsor_points(state, ps.seat, k)["conservation"]] for k in ps.sponsors]
        cd = [[c, endgame.card_points(state, ps.seat, c)] for c in endgame.kept_endgame_cards(state, ps.seat)]
        key = lambda x: (-x[1], x[0])
        return sorted([x for x in sp if x[1]], key=key), sorted([x for x in cd if x[1]], key=key)
    except Exception:
        return [], []


def endgame_appeal_lines(state: GameState) -> list:
    """Per seat the appeal points of the endgame for the pop-up, [[sponsor key, n]] biggest first: the same sums as `endgame.live_scoring` (Arcade first, Mascot Statue last)."""
    seats = range(len(state.players))
    try:
        if state.phase in (Phase.OVER, Phase.SCORING):
            return [[] for _ in seats]
        base = {s: state.players[s].appeal for s in seats}
        out = {s: [] for s in seats}
        for s in seats:
            if "S281" in state.players[s].sponsors:
                out[s].append(["S281", 2 * sum(base[o] < base[s] for o in seats if o != s)])
            for k in state.players[s].sponsors:
                out[s].append([k, endgame.sponsor_points(state, s, k)["appeal"]])
        final = {s: base[s] + sum(n for _, n in out[s]) for s in seats}
        for s in seats:
            if "S274" in state.players[s].sponsors:
                out[s].append(["S274", 2 * sum(final[o] > final[s] for o in seats if o != s)])
        return [sorted([x for x in out[s] if x[1]], key=lambda x: (-x[1], x[0])) for s in seats]
    except Exception:
        return [[] for _ in seats]


def state_view(state: GameState) -> dict:
    s = state.to_dict()
    s["main_deck_size"], s["endgame_deck_size"] = len(s["main_deck"]), len(s["endgame_deck"])
    s["main_discard_size"] = len(s["main_discard"])
    for k in STATE_DROP:
        s.pop(k, None)
    appeal_lines = endgame_appeal_lines(state)
    live = endgame.live_scoring(state)                          # what the final scoring would add now (the viewers' "Endgame live count")
    for p, ps, lv, al in zip(s["players"], state.players, live, appeal_lines):
        p["endgame_live"] = {"appeal": lv["appeal"], "conservation": lv["conservation"]} if lv else None      # (public: sponsors in the zoo)
        p["endgame_sponsor_lines"], p["endgame_card_lines"] = endgame_lines(state, ps)       # (conservation by sponsor / by endgame card; the card lines are private like endgame_cards)
        p["eg_appeal"] = _endgame_has_appeal()
        p["endgame_unscored"] = 0 if state.phase == Phase.OVER else len(ps.endgame_hand)       # (the endgame cards not scored yet: the engine scores them all in the one step that ends the game; a replay overrides it per card, `_endgame_unscored`)
        p["endgame_card_pts"] = {k: _card_live(state, ps.seat, k) for k in ps.endgame_hand}       # (what each card of the hand would score now, the one that is discarded too, and after the scoring what it scored; private like the lines)
        p["endgame_appeal_lines"] = al                          # (appeal by sponsor; the endgame cards give no appeal yet, a future card would come as endgame_card_appeal_lines)
        p["endgame_cards"] = lv["cards"] if lv else None        # (private: the endgame cards of the seat; the live projection takes it out for the other viewers)
        p["score"] = tracks.score(ps.appeal, ps.conservation)
        p["hand_limit"] = hand_limit(ps)
        p["income"] = tracks.income_from_appeal(ps.appeal) + (map_ability_income(state, ps) if ps.map_id in ("5", "5a") else 0)       # the money at a break: the appeal track, and Park Restaurant's 1 per covered space next to the restaurant
        try:
            p["slot_numbers"] = [slot + map_rules.strength_bonus(ps, slot) for slot in range(1, 6)]      # (the strength number of each action slot: 1-5, except on map 12 where the black squares conceal numbers; the clips of the action cards under the board show them)
        except Exception:
            p["slot_numbers"] = [1, 2, 3, 4, 5]
        p["income_parts"] = income_parts(state, ps)
        p["income_total"] = sum(p["income_parts"].values())
        p["income_lines"] = income_lines(state, ps)
        for j, b in enumerate(p["buildings"]):
            b["cells"] = building_cells(b)
            b["cubes"] = cube_rules.view(ps, ps.buildings[j]) if j < len(ps.buildings) else []          # [[card key, cubes], ...] of a special enclosure: the browser draws one cube per space (engine/cubes.py)
    return s


def _price_boxes() -> dict:
    try:
        return json.loads(PRICE_BOXES.read_text(encoding="utf8"))
    except (OSError, ValueError):
        return {}


def card_catalog(keys: set[str], marine_worlds: bool = False) -> dict[str, dict]:
    cards = data.cards_by_key()
    boxes = _price_boxes()
    out = {}
    for k in sorted(keys):
        c = cards.get(k)
        if not c:
            out[k] = {"name": k, "type": "unknown"}
            continue
        entry = {"name": c.get("name", k), "type": c["card_type"], "bga_id": c.get("bga_id")}
        mw = f"{k}_MW" if marine_worlds and (CARD_DIR / f"{k}_MW.webp").exists() else k          # (a card whose icons changed in Marine Worlds: scripts/build_mw_card_images.py)
        if (LARGE_DIR / f"{mw}.webp").exists():
            entry["large"] = f"/cards_large/{mw}.webp"
        if (CARD_DIR / f"{mw}.webp").exists():
            entry["image"] = f"/cards/{mw}.webp"
        elif c["card_type"] in IMAGE_DIR and c.get("bga_id"):
            entry["image"] = f"/img/{IMAGE_DIR[c['card_type']]}/{c['bga_id']}.jpg"
        if c["card_type"] == "animal":
            entry.update(size=c.get("size"), price=c.get("price"), appeal=c.get("appeal"), tags=c.get("tags") or [])
            if k in boxes:
                entry["pbox"] = boxes[k]
        out[k] = entry
    return out


def _card_keys(obj: Any, out: set[str]) -> None:
    if isinstance(obj, str):
        if re.fullmatch(r"[ASPF]\d{3}", obj):
            out.add(obj)
    elif isinstance(obj, list):
        for x in obj:
            _card_keys(x, out)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _card_keys(k, out)
            _card_keys(v, out)


def map_view(map_id: str, layout: list | None = None) -> dict:
    """The map as the viewer draws it. `layout`: the placement bonuses of a player's own layout (Ark360, `engine/ark360.py`) in place of the printed ones."""
    m = data.map_by_id(map_id)
    geo = m["geometry"] or {}
    base = map_quirks.base_map_id(map_id)
    special = geo.get("special_hexes", [])
    if layout:                                                                  # (an Ark360 layout carries the H hexes of maps 8 / 8a too: they are special hexes of the picture)
        special = [s for s in special if s["kind"] != "hollywood_h"] + [{"x": e["x"], "y": e["y"], "kind": "hollywood_h", "off_board": False, "note": e.get("note", "")}
                                                                         for e in layout if e["bonus"]["type"] == "hollywood_h"]
        layout = [e for e in layout if e["bonus"]["type"] != "hollywood_h"]
    out = {"id": base, "name": m["name"], "image": f"/maps/map-{PICTURE_OF.get(base, base)}.jpg",
           "description": [t.strip() for t in (m.get("description") or []) if t and t.strip()],
           "hexes": geo.get("hexes", []), "placement_bonuses": layout or geo.get("placement_bonuses", []),
           "special_hexes": special, "bonus_slots": geo.get("bonus_slots", []),
           "association_bonuses": association.map_bonuses(base)}
    if data.is_custom_map(base):                                                  # a map made in the map editor: the blank board, the rock / water hexes drawn on it, its association spaces
        out.update(image="/map_editor/blank_map.png", custom_terrain=[h for h in geo.get("hexes", []) if h["terrain"] != "plain"], custom_association=m["association"],
                   **({"upgrade_sets": m["association"]["upgrade"]["sets"]} if m["association"]["upgrade"]["mode"] == "pairs" else {}))
    elif data.is_bdw_map(base):                                                   # a Board Design Workshop map: its own picture, the association spaces of its record, the appeal for covering the map
        out.update(custom_association=m["association"], full_map_appeal=m.get("full_map_appeal", 7), bdw=True)
    return out


# What the viewer does not draw: the order of the piles (their sizes are `*_size`), the prompt of the engine, the pending effects, the statistics, the number of completed turns.
INVISIBLE = ("main_deck", "endgame_deck", "main_deck_known", "prompt", "pending", "stats", "turn")


def _visible(state: dict) -> dict:
    return {k: v for k, v in state.items() if k not in INVISIBLE}


def _must_choose(step: dict) -> bool:
    """The step where the player has to choose an action card: it is always shown."""
    prompt = step["state"].get("prompt")
    return isinstance(prompt, dict) and prompt.get("kind") == "choose_action_card"


def _join_labels(step: dict, folded: list) -> None:
    """The texts of the folded steps go in front of the text of the step that stays (for every point of view)."""
    group = folded + [step]
    label = " · ".join(x["label"] for x in group)
    texts = [[(x["label_pov"] or [None, None])[seat] or x["label"] for x in group] for seat in (0, 1)]       # (before the label of `step` is replaced: it is one of the group)
    joined = [" · ".join(t) for t in texts]
    step["label"] = label
    step["label_pov"] = [j if j != label else None for j in joined] if any(j != label for j in joined) else None
    step["move_from"] = min(x.get("move_from", x["move_id"]) for x in group)       # (BGA's first move of the group: the number the move list shows)


_BARE_XTOKEN = re.compile(r"^.+ gains \d+ xtoken$")
_PLACES_CARD = re.compile(r"^.+ places action card \w+ at position \d+ \(finishing action\)")
_GAIN = re.compile(r"^.+ gains \d+ (?:appeal|reputation|conservation(?: points?)?) \((.+)\)$")


@functools.lru_cache(maxsize=1)
def _animal_names() -> frozenset:
    return frozenset(str(c.get("name", "")).lower() for c in data.cards_by_key().values() if c.get("card_type") == "animal")


def _parts(step: dict) -> list:
    return [p.strip() for p in step["label"].split(" · ") if p.strip()]


def _animal_gain(step: dict) -> bool:
    """A step that only says that an animal gave its player appeal / reputation / conservation (nothing to decide: the gain of the animal's own text, an iconic animal, the Petting Zoo)."""
    parts = _parts(step)
    if not parts:
        return False
    for part in parts:
        m = _GAIN.match(part)
        if not m or not (m.group(1).lower() in _animal_names() or m.group(1) in ("Iconic animal", "Petting Zoo Animal action")):
            return False
    return True


def _without_unstore(options: dict | None) -> dict | None:
    """Map 11 (Caves): putting a stored card back into the hand is a free action at any time, not the decision of the step: the replay does not offer it."""
    if options and "unstore" in options.get("kinds", {}):
        options = {**options, "kinds": {k: v for k, v in options["kinds"].items() if k != "unstore"}}
    return options


_HEAD = re.compile(r"^.+ (?:buys .+ from display|plays .+ for \d+|pays \d+ for building )")
_FOLLOW = (re.compile(r"^.+ pays \d+ (?:money )?for playing sponsor"),
           re.compile(r"^.+ gains \d+ \w+(?: points?)? \(.+\)$"),
           re.compile(r"^.+ adds an? .+(?: for free| \(.+\))$"))
_NOT_FOLLOW = re.compile(r"triggering break|income|max strength|reputation track bonus")


def _follows(step: dict) -> bool:
    """A step that only says what the play, the purchase or the building just before it brought: the price of a sponsor from the reputation range, a gain with its reason (the
    animal's appeal, a placement bonus), a building the card adds. Choices of the player ("pays 2 to gain ...") are not among them."""
    parts = _parts(step)
    return bool(parts) and all(any(f.match(p) for f in _FOLLOW) and not _NOT_FOLLOW.search(p) for p in parts)


_TAKES_UNIVERSITY = re.compile(r"takes a new university")


def _university_tiles(steps: list) -> None:
    """"X takes a new university" shows the tile that was taken: the university token that is new on the board in this step (or the next, where the log moves it), as `<UNI:type>`."""
    def tiles(st):
        return [t["type"] for p in st["players"] for t in p.get("tokens") or [] if str(t.get("location", "")).startswith("university_")]

    def fresh(a, b):
        left = list(tiles(a))
        for t in tiles(b):
            if t in left:
                left.remove(t)
            else:
                return t
        return None
    for i, step in enumerate(steps):
        texts = [step.get("label") or ""] + [t or "" for t in step.get("label_pov") or []]
        if not any(_TAKES_UNIVERSITY.search(t) for t in texts):
            continue
        cur = step["state"]
        tile = (fresh(steps[i - 1]["state"], cur) if i else None) or (fresh(cur, steps[i + 1]["state"]) if i + 1 < len(steps) else None)
        if not tile:
            continue
        sub = lambda t: _TAKES_UNIVERSITY.sub(f"takes <UNI:{tile}>", t) if t else t
        step["label"] = sub(step.get("label"))
        if step.get("label_pov"):
            step["label_pov"] = [sub(t) for t in step["label_pov"]]


def _combine_action(steps: list, keep: list) -> list:
    """A sponsor bought / an animal played / a building built and everything that comes with it is one step (the text of the whole run in the order of the log). The step
    "X chooses action card ..." before it and the step "places action card ..." after it stay."""
    out = list(keep)
    run: list = []

    def flush() -> None:
        if len(run) > 1 and run[0] != 0:
            _join_labels(steps[run[-1]], [steps[i] for i in run[:-1]])
            for i in run[:-1]:
                out[i] = False
        run.clear()

    for i in (i for i, k in enumerate(keep) if k):
        parts = _parts(steps[i])
        if run and steps[run[-1]]["state"].get("turn_context") == steps[i]["state"].get("turn_context") and _follows(steps[i]):
            run.append(i)
            continue
        flush()
        if any(_HEAD.match(p) for p in parts) and not any("chooses action card" in p for p in parts):
            run.append(i)
    flush()
    return out


def _combine_runs(steps: list, keep: list) -> list:
    """Steps that belong together are one step: everything of a Wave (the cards removed from the display, a Mark that keeps one, the refill) and the gains that animals give without
    asking. The text of the whole run goes in front of the last step (the state after it), in the order of the log. The last step of the run keeps its state and its prompt, so a "must choose an action card" frame at the end of a run still shows."""
    out = list(keep)
    order = [i for i, k in enumerate(keep) if k]

    def merge(run: list) -> None:
        if run and any(steps[i]["state"].get("turn_context") != steps[run[0]]["state"].get("turn_context") for i in run):
            return
        if len(run) < 2 or run[0] == 0:
            return
        _join_labels(steps[run[-1]], [steps[i] for i in run[:-1]])
        for i in run[:-1]:
            out[i] = False

    wave: list = []                                              # the steps of the Wave on its way
    gains: list = []
    passed = None                                                # the step "X gains 1 xtoken": an action card put back on slot 1, joined to the line that places it
    for i in order:
        parts = _parts(steps[i])
        if passed is not None:
            if parts and _PLACES_CARD.match(parts[0]):
                merge([passed, i])
                passed = None
                continue
            passed = None
        if len(parts) == 1 and _BARE_XTOKEN.match(parts[0]) and not wave:
            merge(gains); gains = []
            passed = i
            continue
        if wave:
            wave.append(i)
            if any(p.startswith("The display is replenished") for p in parts):
                merge(wave)
                wave = []
            elif any("chooses action card" in p for p in parts):
                wave = []                                        # (the Wave ended without a refill step: nothing to join)
            continue
        if any(p.startswith("Removing") and "Wave icons reveal" in p for p in parts):
            merge(gains); gains = []
            wave = [i]
            if any(p.startswith("The display is replenished") for p in parts):
                wave = []
            continue
        merge(gains); gains = []                                 # (the gains of an animal are steps of their own: see `_combine_action`)
    merge(gains)
    return out


_WORKER_BONUS = re.compile(r"^(.+) gets 1 x add-worker \((.+)\)$")
_WORKER_GAIN = re.compile(r"^(.+) gains a new Association worker$")
_SPONSOR_BUY = re.compile(r"^(.+) buys (.+) from display$")
_SPONSOR_PAY = re.compile(r"^(.+) pays (\d+) (?:money )?for playing sponsor from reputation range$")


def _merge_pairs(steps: list, keep: list) -> list:
    """Two steps that say one thing are one step, with one text: "X gets 1 x add-worker (reputation track bonus)" + "X gains a new Association worker" -> "X gains a new Association
    worker (reputation track bonus)"; "X buys A from display" + "X pays 5 money for playing sponsor from reputation range" -> "X pays 5 to buy A from display". The step that stays is the
    second one (its state)."""
    out = list(keep)
    order = [i for i, k in enumerate(keep) if k]
    for i, j in zip(order, order[1:]):
        if i == 0 or steps[i].get("label_pov") or steps[j].get("label_pov") or steps[i]["state"].get("turn_context") != steps[j]["state"].get("turn_context"):
            continue
        a, b = steps[i]["label"].strip(), steps[j]["label"].strip()
        label = None
        m, n = _WORKER_BONUS.match(a), _WORKER_GAIN.match(b)
        if m and n and m.group(1) == n.group(1):
            label = f"{m.group(1)} gains a new Association worker ({m.group(2)})"
        m, n = _SPONSOR_BUY.match(a), _SPONSOR_PAY.match(b)
        if m and n and m.group(1) == n.group(1):
            label = f"{m.group(1)} pays {n.group(2)} to buy {m.group(2)} from display"
        if label:
            _join_labels(steps[j], [steps[i]])
            steps[j]["label"], steps[j]["label_pov"] = label, None
            out[i] = False
    return out


_PILFER_GIVES = re.compile(r"^(.+?) gives (?!\d+ (?:money|cards?) to )(.+) from the Pilfering effect$")
_PILFER_GETS = re.compile(r"^(.+?) gets (.+) from the Pilfering effect$")
_PILFER_SUMMARY = re.compile(r"^(.+?) gives \d+ cards? to (.+?) from Pilfering effect$")


def _merge_pilfer(steps: list, keep: list) -> list:
    """The three steps of a pilfered card are one step: "A gives X from the Pilfering effect" + "B gets X from the Pilfering effect" + "A gives 1 card to B from Pilfering effect" (the
    summary, it changes nothing) -> "A gives B X from the Pilfering effect". The step that stays is the last one (its state); without the summary line the "gets" step stays."""
    out = list(keep)
    order = [i for i, k in enumerate(keep) if k]
    p = 0
    while p < len(order) - 1:
        i, j = order[p], order[p + 1]
        a, b = steps[i]["label"].strip(), steps[j]["label"].strip()
        m, n = _PILFER_GIVES.match(a), _PILFER_GETS.match(b)
        if i == 0 or not (m and n and m.group(2) == n.group(2)) or steps[i]["state"].get("turn_context") != steps[j]["state"].get("turn_context"):
            p += 1
            continue
        group, last = [i, j], j
        if p + 2 < len(order):
            k = order[p + 2]
            c = _PILFER_SUMMARY.match(steps[k]["label"].strip())
            if c and c.group(1) == m.group(1) and c.group(2) == n.group(1) and steps[k]["state"].get("turn_context") == steps[j]["state"].get("turn_context"):
                group.append(k)
                last = k
        label = f"{m.group(1)} gives {n.group(1)} {m.group(2)} from the Pilfering effect"
        _join_labels(steps[last], [steps[x] for x in group[:-1]])
        steps[last]["label"], steps[last]["label_pov"] = label, None
        for x in group[:-1]:
            out[x] = False
        p += len(group)
    return out


_GETS = re.compile(r"^(.+?) gets (\d+) x (\S+)(?: \([^)]*\))?$")
_RESOURCES = ("money", "xtoken", "appeal", "reputation", "conservation")
# what the line after "A gets N x <bonus>" says when it is the bonus' own effect ({name} / {n} / {bonus} are filled in; matched without case). Every entry has been checked against the
# logs of 10 tables (log_examples): in all of them the line that follows is the effect. Not in the table, so their lines stay: Extra Shift, "ignore conditions", increased hand,
# Clever, Fac, Partner Zoo, the grey sponsor bonus (the line after them is a different effect or none).
_EFFECT_AFTER_GETS = {
    **{r: r"{name} gains {n} {bonus}(?: \([^)]*\))?$" for r in _RESOURCES},          # the plain gains: "A gets 5 x money (map bonus space)" / "A gains 5 money (map bonus space)"
    "Snapping": r"{name} snaps .+ from the display$",
    "bonus-kiosk-pavilion": r"{name} adds an? (?:pavilion|kiosk)\b",
    "size-2": r"{name} adds a size-2 enclosure for free$",
    "size-3": r"{name} adds a size-3 enclosure for free$",
    "Pouch": r"{name} pouches .+ cards? for \d+ appeal$",
    "sponsor-person-card": r"{name} plays .+",
    "Multiplier": r"{name} adds a multiplier token on action card \w+$",
    "SharkAttack": r"{name} discards .+ for the Shark Attack effect$",
    "add-worker": r"{name} gains a new Association worker",
}


def _drop_announced_gains(steps: list, keep: list) -> list:
    """BGA words a bonus twice: "A gets N x <bonus> (<source>)" (the bonus is taken) and, as the next step, what it does ("A gains N money", "A snaps X from the
    display", "A adds a size-2 enclosure for free"). The first only announces the second and is not a step. It stays when the effect line does not follow (a bonus that cannot be taken:
    BGA logs no gain when the X tokens are at their limit; a Snapping that is not used) and for every bonus that is not in `_EFFECT_AFTER_GETS`."""
    out = list(keep)
    order = [i for i, k in enumerate(keep) if k]
    for p in range(len(order) - 1):
        i, j = order[p], order[p + 1]
        m = _GETS.match(steps[i]["label"].strip())
        pattern = m and _EFFECT_AFTER_GETS.get(m.group(3))
        if i > 0 and pattern and re.match(
                pattern.format(name=re.escape(m.group(1)), n=m.group(2), bonus=re.escape(m.group(3))), steps[j]["label"].strip(), re.I):
            out[i] = False
    return out


def _fold_unchanged(steps: list, keep: list) -> list:
    """A step that changes nothing the viewer shows is joined to the next one: its text goes in front of the text of the next step (which keeps its state), so every step forward
    changes something. Always shown: the first step, the last step and the steps where a player must choose an action card. `keep` (the steps with a text) comes in and goes out."""
    out = list(keep)
    shown = None                                                # the last step that is shown
    folded: list = []                                           # the steps joined to the next one that is shown
    last = len(steps) - 1
    for i, st in enumerate(steps):
        if not keep[i]:
            continue
        if shown is not None and i != last and not _must_choose(st) and _visible(st["state"]) == _visible(shown["state"]):
            folded.append(st)
            out[i] = False
            continue
        if folded:
            _join_labels(st, folded)
            folded = []
        shown = st
    return out


def _cp_bonuses(parsed: ParsedLog, seat_of: dict) -> list:
    """The bonuses taken for 5 or 8 conservation points (a `takeBonus` without a source whose `remove` is "5-n" / "8-n"): [{move_id, seat, threshold, type}].
    The text of the step ("X gets 1 x Fac") does not say which threshold it was, the viewer's Key events graph marks the gifts with it."""
    out = []
    for mv in parsed.moves:
        for e in mv.events:
            try:
                a = e.args
                if e.type != "takeBonus" or not isinstance(a, dict) or a.get("source"):
                    continue
                m = re.match(r"^(5|8)-\d+$", str(a.get("remove") or ""))
                seat = seat_of.get(str(a.get("player_id", e.player)))
                if not m or seat is None:
                    continue
                bd = a.get("bonus_desc")
                ba = bd.get("args") if isinstance(bd, dict) else None
                out.append({"move_id": mv.move_id, "seat": seat, "threshold": int(m.group(1)), "type": ba.get("bonus_type") if isinstance(ba, dict) else None})
            except Exception:                                                  # (a log line of an unexpected shape never breaks the replay)
                continue
    return out




def _break_markers(parsed: ParsedLog, seat_of: dict[str, int]) -> list[dict]:
    """Graph markers from accepted notifications, independent of display wording.

    `seat` identifies the player awarded the structured triggering-break bonus,
    solely for the marker colour. The Break itself is a neutral game phase.
    Missing completion stays null; no terminal event manufactures a finish.
    """
    markers, opened, trigger = [], None, None
    for move in parsed.moves:
        for event in move.events:
            args = event.args if isinstance(event.args, dict) else {}
            if event.type == "getBonuses" and args.get("source") == "triggering break":
                trigger = seat_of.get(str(args.get("player_id")))
            elif event.type == "startBreak":
                context = parsed.normal_turns.context(event.order)
                opened = {"start_move": move.move_id, "end_move": None,
                          "turn": context["display"] + .5, "seat": trigger}
                markers.append(opened)
                trigger = None
            elif event.type == "finishBreak" and opened is not None:
                opened["end_move"] = move.move_id
                opened = None
    return markers


def _normal_history(parsed, replay, steps, seat_of, names):
    """Decorate display steps and expose samples at actual lifecycle boundaries.

    The engine's `turn`/action markers retain their existing meaning. A normal
    start gets a small explicit replay step, including starts in state-only moves.
    Graph samples are captured before neutral phases, never from a later bucket.
    """
    timeline = parsed.normal_turns
    if not timeline.turns:
        for step in steps:
            step.pop("_history_order", None)
        return {}

    def context(raw):
        return {"phase": raw["phase"], "index": raw["index"], "seat": seat_of.get(raw["player"]),
                "number": raw["number"], "display": raw["display"],
                "counts": [raw["counts"].get(pid, 0) for pid in seat_of]}

    def metrics(state):
        # state_view computes the same score (appeal + conservation) as the board.
        return [{k: p[k] for k in ("score", "appeal", "conservation", "reputation", "money", "x_tokens")} for p in state_view(state)["players"]]

    endpoints, opening, starts = {}, None, []
    for boundary, state in replay.history_frames:
        if boundary["closed"] is not None:
            endpoints[boundary["closed"]] = metrics(state)
        if boundary["reason"] != "turn":
            continue
        if opening is None:
            opening = metrics(state)
        raw = boundary["context"]
        view = state_view(state)
        view["current_action"] = None
        view["active_player"] = seat_of[raw["player"]]
        view["turn_context"] = context(raw)
        starts.append({"move_id": boundary["move_id"], "label": f'{names.get(raw["player"], raw["player"])} starts turn {raw["number"]}',
                      "state": view, "engine": {"source": "log", "status": "log", "detail": "Normal turn starts (backend state 7)"},
                      "options": None, "actor": seat_of[raw["player"]], "label_pov": None, "_obj": None,
                      "_history_order": boundary["order"]})
    # (the "X starts turn N" boundaries are not shown as steps of their own: the turn number rides on the steps through `turn_context`, and `normal_turns` keeps the turn rows)
    inherited = {}
    for step in steps:
        for key in ("sponsor_stats", "variant_stats", "initial_discard"):
            if key in step["state"]:
                inherited[key] = step["state"][key]
            elif key in inherited:
                step["state"][key] = inherited[key]
        step.pop("_history_order", None)
    rows = []
    for turn in timeline.turns:
        endpoint = endpoints.get(turn.index)
        if endpoint is None and turn.close_order is None and replay.states:
            endpoint = metrics(replay.states[-1])
        if endpoint is not None:
            rows.append({"index": turn.index, "seat": seat_of[turn.player], "number": turn.number,
                         "start_move": turn.start_move, "end_move": turn.end_move, "players": endpoint})
    return {"normal_turns": rows, "turn_start": opening}


def _cp_bonuses(parsed: ParsedLog, seat_of: dict) -> list:
    """The bonuses taken for 5 or 8 conservation points (a `takeBonus` without a source whose `remove` is "5-n" / "8-n"): [{move_id, seat, threshold, type}].
    The text of the step ("X gets 1 x Fac") does not say which threshold it was, the viewer's Key events graph marks the gifts with it."""
    out = []
    for mv in parsed.moves:
        for e in mv.events:
            try:
                a = e.args
                if e.type != "takeBonus" or not isinstance(a, dict) or a.get("source"):
                    continue
                m = re.match(r"^(5|8)-\d+$", str(a.get("remove") or ""))
                seat = seat_of.get(str(a.get("player_id", e.player)))
                if not m or seat is None:
                    continue
                bd = a.get("bonus_desc")
                ba = bd.get("args") if isinstance(bd, dict) else None
                out.append({"move_id": mv.move_id, "seat": seat, "threshold": int(m.group(1)), "type": ba.get("bonus_type") if isinstance(ba, dict) else None})
            except Exception:                                                  # (a log line of an unexpected shape never breaks the replay)
                continue
    return out


_SCORES_CARD = re.compile(r"^(.+?) gains .+ \((.+)\)\s*$")


def _endgame_unscored(steps: list, player_names: list, marine_worlds: bool) -> None:
    """`players[i].endgame_unscored` in every step: how many of the player's endgame cards are not scored yet. The log scores a card in its own step ("X gains 2 conservation (Climbing Park)"),
    so the count goes down in that step; from the final scoring on it is 0 (a card worth 0 points has no line of its own). The viewer draws it as the little card next to the shield."""
    hands = {k for st in steps for p in st["state"]["players"] for k in p.get("endgame_hand") or []}
    if not hands:
        return
    cat = card_catalog(hands, marine_worlds)
    name_of = {k: (cat.get(k) or {}).get("name", "").lower() for k in hands}
    scored: list[set] = [set() for _ in player_names]
    for st in steps:
        m = _SCORES_CARD.match(st.get("label") or "")
        if m and m.group(1) in player_names:
            seat = player_names.index(m.group(1))
            for k in st["state"]["players"][seat].get("endgame_hand") or []:
                if name_of.get(k) == m.group(2).strip().lower():
                    scored[seat].add(k)
        over = st["state"].get("phase") in ("scoring", "over")
        for seat, p in enumerate(st["state"]["players"]):
            p["endgame_unscored"] = 0 if over else sum(1 for k in p.get("endgame_hand") or [] if k not in scored[seat])


def thinking_times_from_log(raw_log: dict) -> dict:
    """Each player's thinking time in seconds, estimated from the packet times: BGA sends `updateReflexionTime` for a player when their turn ends, so the time since the
    previous such event (the end of the other player's turn, or the start of the game) is spent by that player. {player id as text: seconds}; {} when the log has no events."""
    try:
        packets = raw_log["data"]["logs"]
        events = sorted((int(p["time"]), str(e["args"]["player_id"])) for p in packets for e in p.get("data") or [] if e.get("type") == "updateReflexionTime")
        last = int(packets[0]["time"])
    except (KeyError, TypeError, ValueError, IndexError):
        return {}
    total: dict = {}
    for t, pid in events:
        total[pid] = total.get(pid, 0) + max(0, t - last)
        last = t
    return total


def build_replay_view(raw_log: dict, record: TableRecord, with_states: bool = False, first_moves: int | None = None, quick: bool = False):
    """The replay of one table as JSON. With `with_states` it returns (view, states): the engine state of every step (None where the engine did not play it), for forking.
    With `first_moves` only that many moves are replayed and the engine does not play them (the mini games need the first steps only; the table's setup is read from the whole log).
    With `quick` the same for the moves up to the starting hand (the action card draft and the dealt cards): a fraction of a second instead of the engine's replay of the whole game,
    so the viewer can open at once and swap in the full replay when it arrives (the view then has `partial: true`; its steps are the first steps of the full one)."""
    parsed: ParsedLog = parse_log(raw_log)
    if quick:
        dealt = next((i for i, m in enumerate(parsed.moves) if any(e.type == "pDiscardCards" for e in m.events)), None)
        first_moves = QUICK_MOVES if dealt is None else max(dealt + 2, QUICK_MIN_MOVES)
    seats = [str(p.id) for p in parsed.players]
    maps = None
    if record.player_maps and all(pid in record.player_maps for pid in seats):
        maps = [record.player_maps[pid] for pid in seats]
    elif record.same_map:                                    # one map for both players: the log tells it from either of them
        known = next((m for m in infer_maps(parsed, seats) if m), None)
        if known:
            maps = [known, known]
    setup, config, seed = game_from_log(parsed, maps=maps, marine_worlds=record.marine_worlds if record.player_maps else None,
                                        base_projects=list(record.base_projects) or None)       # (the extension reads them off BGA's replay when the log never shows all three)
    if maps is None:
        maps = config.maps
    names = {str(p.id): p.name for p in parsed.players}
    if first_moves is not None:
        selected = parsed.moves[:first_moves]
        cap = max((e.order for m in selected for e in m.events), default=0)
        timeline = copy.deepcopy(parsed.normal_turns)
        timeline.transitions = [t for t in timeline.transitions if t["order"] <= cap]
        timeline._orders = [t["order"] for t in timeline.transitions]
        timeline.turns = [t for t in timeline.turns if t.start_order <= cap]
        timeline.last_order = cap
        parsed = dataclasses.replace(parsed, moves=selected, normal_turns=timeline)
    groups = [move_groups(mv, names) for mv in parsed.moves]
    split = frozenset(order for g in groups for _, order in g[1:])         # every effect (log line) of a move is a step of its own
    rep: Replay = build_replay(parsed, setup, config, seed, split)
    colors = {str(p["id"]): p.get("color") for p in raw_log["data"].get("players") or [] if isinstance(p, dict)}
    if first_moves is not None:
        from ark_nova.replay.differential import DiffReport
        from ark_nova.replay.engine_replay import EngineReplay, MoveEngine
        eng = EngineReplay({m.index: MoveEngine("log") for m in parsed.moves}, DiffReport())
    else:
        eng = build_engine_replay(parsed, rep, {pid: i for i, pid in enumerate(config.player_ids)})
    known_prefix = len(seed.main_order)                                       # the cards of the draw pile whose order the log tells; the rest is a random guess
    full_deck = len(rep.states[0].main_deck) if rep.states else 0
    steps = []
    sponsor_stats: dict = {}                                                  # sponsor key -> {statistic: amount} so far
    waza_uses = waza_large_events(raw_log, list(config.player_ids), list(config.maps)) if first_moves is None else []
    variant_stats: dict = {}                                                  # seat -> action -> {statistic: amount} so far (the action card variants)
    seat_of_pid = {str(pid): i for i, pid in enumerate(config.player_ids)}
    known_maps = {str(pid): config.map_known[i] for i, pid in enumerate(config.player_ids)}
    sponsor_log = SponsorLogStats(parsed.normal_turns, seat_of_pid, sponsor_source_hints(raw_log, parsed), config.maps,
                                  sponsor_event_gains(raw_log, parsed, known_maps))
    first_discard = next((m.index for m in parsed.moves if any(e.type == "pDiscardCards" for e in m.events)), None)       # the move of the initial discards
    initial_discard = [list(setup.discarded.get(pid, [])) for pid in config.player_ids]
    split_extra = 0                                                          # (steps added by splitting a move in two, they count as setup steps)
    for mv, final, g in zip(rep.moves, rep.states, groups):
        me = eng.moves[mv.index]
        hide_discard = mv.index == first_discard
        views = [state_view(s) for s in rep.substates.get(mv.index, [])] + [state_view(final)]
        labels = [label for label, _ in g] if not hide_discard else group_labels(mv, names, None, True)
        labels_pov = [group_labels(mv, names, pid, hide_discard) for pid in config.player_ids]
        if hide_discard and len(labels) == 3 and len(views) == 1 and mv.index:
            views = _split_discards(mv, rep.states[mv.index - 1], views[0], config.player_ids)       # the starting discards: one step per player, then the display's first replenish (as the starting draws)
        if len(labels) != len(views):                                       # setup moves, or a move without effects: one step
            views, labels = views[-1:], [step_label(mv, names, None, hide_discard)]
            labels_pov = [[step_label(mv, names, pid, hide_discard)] for pid in config.player_ids]
        source = ["log"] * len(views)
        objs: list = [None] * len(views)                                   # the engine state of each step (forking starts from it)
        if mv.index in rep.draft_engine:                                    # the action card draft, played by the engine with the choices of the log
            objs[-1] = rep.draft_engine[mv.index]
        if me.end is not None:                                              # the engine played this move and agrees with the log
            logged = views[:]
            engine_vals: dict = {}
            engine_break: dict = {}
            for i, (_, start) in enumerate(g[1:]):                            # sub-step i ends where the next effect starts
                before = me.state_before(start) if len(g) == len(views) else None
                if before is not None:
                    views[i], source[i] = state_view(before), "engine"
            views[-1], source[-1] = state_view(me.end), "engine"
            objs[-1] = me.end
            for i, (_, start) in enumerate(g[1:]):
                if len(g) == len(views) and source[i] == "engine":
                    objs[i] = me.state_before(start)
            for i, src in enumerate(source):                                  # the engine refills the display when the action ends, the log at its fillPool event
                if src == "engine":
                    engine_vals[i] = [{f: p[f] for f in GAIN_FIELDS} for p in views[i]["players"]]
                    engine_break[i] = views[i]["break_position"]
                    for k in TIMED_BY_LOG:
                        views[i][k] = logged[i][k]
                    for mine, theirs in zip(views[i]["players"], logged[i]["players"]):          # the engine applies some effects earlier than the log shows them
                        for f in LOG_TIMED_PLAYER_FIELDS:
                            mine[f] = theirs[f]
                        mine["flags"]["m9_removed"] = theirs["flags"].get("m9_removed", 0)           # map 9: the marker goes at the logged line
        options = [None] * len(views)
        if me.end is not None:                                              # what the engine lets the player do next, at each engine step
            for i, src in enumerate(source):
                if src == "engine":
                    options[i] = _without_unstore(step_options(me.end if i == len(views) - 1 else me.state_before(g[i + 1][1])))
        for i, o in enumerate(options):
            v = views[i]
            if o is not None and o.get("effects") and i in engine_vals:
                # a gain the log already shows (the engine resolves it a step later) is not offered any more
                seat = o["seat"]
                shown = [e for e in o["effects"] if not (e.get("kind") == "gain" and e.get("res") in GAIN_FIELDS
                                                         and v["players"][seat][e["res"]] - engine_vals[i][seat][e["res"]] >= e.get("n", 1))]
                # the same for a Jumping effect: the log already moved the break token, the engine does it when the effect is resolved
                shown = [e for e in shown if not (e.get("kind") == "jumping" and v["break_position"] - engine_break[i] >= e.get("n", 1))]
                if len(shown) != len(o["effects"]):
                    options[i] = o = {**o, "effects": shown}
            if o is not None and o.get("take") and o.get("in_break") and (v.get("turn_context") or {}).get("phase") != "break":
                options[i] = o = {k: x for k, x in o.items() if k != "take"}          # (the engine starts the break inside the last action: the take it offers is an income take of the break, e.g. Science Lab's, from the display as it is after the break; the log shows the break later)
            if o is not None and o["prompt"] == "choose_action_card" and (v["current_action"] or v["active_player"] != o["seat"]):
                options[i] = None                                          # the engine is a step ahead of the log here (it ends the turn inside the last action)
        actors = group_actors(mv, g, {pid: i for i, pid in enumerate(config.player_ids)}) if len(g) == len(views) else [None] * len(views)
        ends = [start for _, start in g[1:]] + [10 ** 12] if len(g) == len(views) else [10 ** 12] * len(views)
        logged_gains = sponsor_log.gains(mv) + logged_variant_gains(parsed, mv, seat_of_pid)
        move_orders = {e.order for e in mv.events}
        logged_gains += [(o, "S263", "ignores", 1) for o, _seat in waza_uses if o in move_orders]          # WAZA Large Animals Program: a large animal played with an ignored condition
        before_move = rep.states[mv.index - 1] if mv.index else rep.states[0]
        before_groups = [before_move] + rep.substates.get(mv.index, [])
        for event in mv.events:
            if event.type not in ("buyBuilding", "buyAnimal", "donation"):
                continue
            gi = sum(1 for _, start in g if start is not None and start <= event.order)
            before_event = before_groups[gi] if len(before_groups) == len(g) else before_move
            action = sponsor_log.geometry_actions.get(event.order)
            logged_gains += diversity_gains(event, before_event, seat_of_pid, action)
            logged_gains += sponsor_state_gains(event, before_event, seat_of_pid, action, sponsor_log.source_hints.get(event.order))
        pending = sorted(logged_gains + [(o, key, stat, n) for o, key, stat, n in me.obs])
        for i, v in enumerate(views):                                           # the totals after each step of the move
            while pending and pending[0][0] < ends[i]:
                _, key, res, n = pending.pop(0)
                if ":" in key:                                                  # an action card variant: "<seat>:<action>"
                    seat_key, typ = key.split(":")
                    mine = variant_stats.setdefault(seat_key, {}).setdefault(typ, {})
                    mine[res] = mine.get(res, 0) + n
                else:
                    sponsor_stats.setdefault(key, {})[res] = sponsor_stats.get(key, {}).get(res, 0) + n
            v["sponsor_stats"] = {k: dict(d) for k, d in sponsor_stats.items()}
            v["variant_stats"] = {s_: {t_: dict(d) for t_, d in typs.items()} for s_, typs in variant_stats.items()}
        if first_discard is not None and mv.index >= first_discard:
            for v in views:
                v["initial_discard"] = initial_discard                          # (the viewer hides the other player's cards in the discard pile, pov.js)
        move_steps = [{"move_id": mv.move_id, "label": lb, "state": v, "engine": {"source": src, "status": me.status, "detail": me.detail[:300]}, "options": o, "actor": ac,
                   "label_pov": [lp[i] if lp[i] != lb else None for lp in labels_pov] if any(lp[i] != lb for lp in labels_pov) else None,
                   "_obj": objs[i]}
                  for i, (lb, v, src, o, ac) in enumerate(zip(labels, views, source, options, actors))]
        if hide_discard and len(move_steps) == 3:                            # (the starting discards: the three steps are one for the viewer, like the two starting draws, playback.js `dealMerged`)
            for step in move_steps:
                step["log_only"], step["merge_group"] = True, "discard"
        for i, step in enumerate(move_steps):
            lo = g[i][1] if i and len(g) == len(move_steps) else -1
            hi = g[i + 1][1] if i + 1 < len(g) and len(g) == len(move_steps) else 10 ** 12
            events = [e for e in mv.events if lo <= e.order < hi]
            orders = [parsed.normal_turns.order_of(e) for e in events]
            # Private selector arguments may precede the public Break entry.
            # They do not own the following, public "Starting a new break" line.
            owned = [parsed.normal_turns.order_of(e) for e in events if e.type != "gameStateChangePrivateArg"]
            raw_context = parsed.normal_turns.context(min(owned or orders, default=0))
            step["state"]["turn_context"] = {"phase": raw_context["phase"], "index": raw_context["index"],
                "seat": seat_of_pid.get(raw_context["player"]), "number": raw_context["number"], "display": raw_context["display"],
                "counts": [raw_context["counts"].get(pid, 0) for pid in seat_of_pid]}
            step["_history_order"] = max(orders, default=0)
            resist = _resistance_reveal(events, seat_of_pid)
            if resist:
                subs = rep.substates.get(mv.index, []) + [final]
                gs = objs[i] if objs[i] is not None else subs[i] if len(subs) == len(move_steps) else final
                resist["points"] = {k: _card_live(gs, resist["seat"], k) for k in resist["cards"]}
                step["resistance"] = resist                                     # (the endgame cards of a Resistance effect: the viewer shows them in the reveal lightbox, replay/reveal.js)
            adapt = _adapt_reveal(events, seat_of_pid)
            if adapt:
                subs = rep.substates.get(mv.index, []) + [final]
                gs = objs[i] if objs[i] is not None else subs[i] if len(subs) == len(move_steps) else final
                held = step["state"]["players"][adapt["seat"]].get("endgame_hand") or []
                adapt["points"] = {k: _card_live(gs, adapt["seat"], k) for k in dict.fromkeys(held + adapt.get("drawn", []) + adapt.get("discarded", []))}      # (what each card scores now, like Resistance)
                step["adapt"] = adapt                                           # (the endgame cards an Adapt draws and discards: the viewer shows them in the reveal lightbox, `_adapt_pools` and replay/reveal.js)
            assertion = _assertion_reveal(events, seat_of_pid, parsed.moves, mv, config)
            if assertion:
                step["assertion"] = assertion                                   # (the base projects an Assertion offers and the one kept: the viewer shows them in the reveal lightbox, replay/reveal.js)
        if len(move_steps) == 1:
            halves = _split_keep_and_draw(mv, move_steps[0], steps[-1]["state"] if steps else None, names, config.player_ids)
            if halves is not None:
                move_steps = halves
                split_extra += len(halves) - 1
        steps.extend(move_steps)
    normal_history = _normal_history(parsed, rep, steps, seat_of_pid, names)
    # a step without any text (a state update the log does not word) is not shown: its changes are in the state of the next step. The first step stays.
    keep = [i == 0 or bool(st["label"].strip()) for i, st in enumerate(steps)]
    keep = [k and not (i > 0 and _ANNOUNCES_TAKE.search(st["label"] or "")) for i, (st, k) in enumerate(zip(steps, keep))]       # ("X gets 1 x take-in-range-or-deck": the announcement of the card the next step takes)
    # (what a play / purchase / building brings is NOT joined to it any more: the cost, every gain and every placement bonus is its own step, as when the engine plays it; `_combine_action`)
    keep = _merge_pairs(steps, keep)
    keep = _merge_pilfer(steps, keep)
    keep = _drop_announced_gains(steps, keep)
    # (no step is joined to another any more: every effect / log line is a step of its own, like when the engine plays it; `_combine_runs` and `_fold_unchanged` are not called)
    setup_steps = rep.setup_moves - sum(1 for i in range(min(rep.setup_moves, len(steps))) if not keep[i])
    steps = [st for st, k in zip(steps, keep) if k]
    for st in steps:
        st["state"]["main_deck_known"] = max(0, min(len(st["state"]["main_deck"]), known_prefix - (full_deck - len(st["state"]["main_deck"]))))
    steps, extra = _draft_option_steps(steps, rep.draft_engine and rep.draft_rounds or {})
    setup_steps += extra + split_extra
    objs_by_step = [st.pop("_obj", None) for st in steps]
    for i, st in enumerate(steps):
        st["index"] = i
        o = objs_by_step[i]                                                  # a step can be forked where the engine played it and a decision is waiting
        st["fork"] = o is not None and o.prompt is not None and (o.prompt.kind == "draft" or o.phase.value not in ("setup", "over", "scoring"))
    _adapt_pools(steps)
    _horse_whisperer(steps, [names.get(pid, pid) for pid in config.player_ids])           # (the lightbox of Horse Whisperer: the whole discard pile, the Petting Zoo animals on top)
    mark_merges(steps, [names.get(pid, pid) for pid in config.player_ids])               # (runs of draws / digs / snaps of one player: one step for the viewer who follows the other one, replay/merge.py)
    _endgame_unscored(steps, [names.get(pid, pid) for pid in config.player_ids], bool(config.marine_worlds))
    _university_tiles(steps)
    states = [st["state"] for st in steps]
    keys: set[str] = set()
    _card_keys(states, keys)
    _card_keys(config.base_projects, keys)
    _card_keys([st.get("assertion") for st in steps], keys)
    _card_keys([st.get("horse") for st in steps], keys)
    _card_keys([st.get("adapt") for st in steps], keys)
    _card_keys([st.get("resistance") for st in steps], keys)                     # (the card a Resistance effect discards is in no state)
    elos_after, elo_changes = dict(getattr(record, "elos_after", None) or {}), dict(getattr(record, "elo_changes", None) or {})
    thinking_from_log = thinking_times_from_log(raw_log)                                # (used when the stats table has no row for the table)
    view = {
        "table_id": parsed.table_id,
        "marine_worlds": config.marine_worlds,
        "tracked_sponsors": sorted(_tracked_sponsors().values()),                      # (the sponsors whose gains `state.sponsor_stats` adds up)
        "players": [{"seat": i, "id": pid, "name": names.get(pid, pid), "color": colors.get(pid), "elo": (record.elos or {}).get(str(pid)), "elo_after": elos_after.get(str(pid)), "elo_change": elo_changes.get(str(pid)),
                     "thinking_time": (getattr(record, "thinking_times", None) or {}).get(str(pid), thinking_from_log.get(str(pid)))} for i, pid in enumerate(config.player_ids)],
        "maps": [map_view(m) for m in config.maps],
        "base_projects": config.base_projects,
        "result": [{k: r.get(k) for k in ("id", "name", "score", "rank")} for r in parsed.result or []],
        "setup_steps": setup_steps,
        "cards": card_catalog(keys, bool(config.marine_worlds)),
        "engine": eng.summary(),
        "steps": steps,
        "map_stats": map_stats(raw_log, list(config.player_ids), list(config.maps), steps, sponsor_stats) if first_moves is None else None,        # (the map-specific rows of the results table)
        "cp_bonuses": _cp_bonuses(parsed, seat_of_pid),
        "break_markers": _break_markers(parsed, seat_of_pid),
        **normal_history,
        **({"partial": True} if quick else {}),
    }
    return (view, objs_by_step) if with_states else view
