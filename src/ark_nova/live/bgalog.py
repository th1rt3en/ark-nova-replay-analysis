"""The game log of a live game, worded like BGA's own log, one text per viewer (what each of them may read).

`texts(old, act, new, names)` -> `{"0": ..., "1": ..., "spectator": ..., "full": ...}`: the lines of one step joined by newlines. "full" is for the record (the replay of a
finished game): everything, in the third person. A seat reads "You draw A, B from the deck" where BGA's private channel does; the opponent and spectators read what BGA's public
channel says ("X draws 2 card(s) from the deck"). Which information is secret follows the visibility sheet (`data_manual/planning/visibility.json`, decisions of the project):
cards drawn from the draw pile, discarded from the hand, dug from the hand, revealed by Hunter / Scuba Dive / Perception, stored or pouched are known by their owner only
(the opponent reads a count); cards played, taken from the display, found by a search, pilfered or kept after a Hunter / Scuba Dive reveal are public.

The wording of the sentences is that of the BGA templates (docs/log_events.md): "X chooses action card Animals with strength 3", "X plays Giant Panda for 27 and places it
in a size-3 enclosure", "The display is replenished with ...". A move whose kind has no sentence here keeps the engine's own sentence (`fork.narrate`), with the cards of a hidden
choice left out for the viewers who may not see them (`stepdata.labels_for`).
"""
import re
from collections import Counter

from ark_nova import data
from ark_nova.engine.actions import Action
from ark_nova.engine.state import GameState, Phase
from ark_nova.replay import fork

ROLES = ("0", "1", "spectator")
ACTION_NAMES = {"animals": "Animals", "association": "Association", "build": "Build", "cards": "Cards", "sponsors": "Sponsors"}
LEVEL = {1: "I", 2: "II"}


def card(key: str) -> str:
    """The name of a card as BGA writes it ("Giant Panda")."""
    c = data.cards_by_key().get(key)
    name = (c or {}).get("name", key) if isinstance(c, dict) else key
    return re.sub(r"(^|[\s-])(\w)", lambda m: m.group(1) + m.group(2).upper(), str(name).lower())


def names_of(keys) -> str:
    return ", ".join(card(k) for k in keys)


def n_cards(n: int) -> str:
    return f"{n} card(s)"


def enclosure(t: str) -> str:
    t = t.replace("-", " ") if not t.startswith("size-") else t
    return ("an " if t[:1] in "aeiou" else "a ") + (f"{t} enclosure" if t.startswith("size-") else t)


class Lines:
    """The lines of a step; each is `(public, actor, full)`: what the opponent and spectators read, what the acting seat reads, what the record keeps."""

    def __init__(self, seat: int, who: str):
        self.seat, self.who, self.items, self.quiet = seat, who, [], False

    def add(self, text: str, public: str | None = None, actor: str | None = None) -> None:
        """`text`: the sentence everybody may read; `public`/`actor`: another wording for the opponent / for the acting player (None = the same)."""
        self.items.append((text if public is None else public, text if actor is None else actor, text))

    def secret(self, full: str, public: str, actor: str | None = None) -> None:
        self.items.append((public, full if actor is None else actor, full))

    def fallback(self, old, act, new) -> None:
        """The engine's own sentence, with the cards of a hidden choice left out for the viewers who may not read them."""
        from ark_nova.live import stepdata
        full = fork.narrate(old, act, new, self.who)
        by_role = stepdata.labels_for(act, full, self.who)
        public = by_role[str(1 - self.seat)]
        if act.kind == "choose_effect" and public == f"{self.who} resolved an effect":          # (a hidden choice of an effect: say which effect, not the cards)
            e = _effect(old, act)
            from ark_nova.replay.options import effect_name
            nm = effect_name(e) or str(e.get("kind", "")).replace("_", " ")
            public = f"{self.who} resolved the {nm} effect" if nm else public
        self.items.append((public, by_role[str(self.seat)], full))

    def render(self) -> dict:
        def join(i: int, only_actor: bool = False):
            return "\n".join(x[i] for x in self.items if x[i])
        out = {"full": join(2), str(self.seat): join(1), str(1 - self.seat): join(0), "spectator": join(0)}
        return out


def _gain_words(delta: dict) -> list:
    words = []
    for key, word in (("money", "money"), ("reputation", "reputation"), ("appeal", "appeal"), ("conservation", "conservation"), ("x_tokens", "xtoken")):
        if delta.get(key, 0) > 0:
            words.append(f"{delta[key]} {word}")
    return words


def _placement_gains(old: GameState, seat: int, a: dict) -> dict:
    """The money / X tokens / reputation that the placement bonuses under a new building pay at once ({} with several bonuses: each is an effect of its own, or none)."""
    from ark_nova.engine import build_action
    from ark_nova.engine.board import board_of
    p = old.players[seat]
    if "S280" in p.sponsors or "x" not in a:
        return {}
    try:
        cells = build_action.footprint(a["type"], a["x"], a["y"], a.get("rotation", 0))
        gains = build_action.placement_bonuses(board_of(p), cells)
    except Exception:                                                     # (a custom map or a piece that is not known here: no line rather than a wrong one)
        return {}
    pending = (old.prompt.args.get("pending") if old.prompt is not None else None) or []
    mult = 2 if any(e.get("kind") == "build" and e.get("double") and a["type"] in e.get("types", [e.get("type")]) for e in pending) else 1
    gains = gains * mult
    if len(gains) != 1:
        return {}
    b = gains[0]
    key = {"money": "money", "xtoken": "x_tokens", "reputation": "reputation"}.get((b or {}).get("type"))
    return {key: int(b.get("value") or 1)} if key else {}


def _delta(old: GameState, new: GameState, seat: int) -> dict:
    p0, p1 = old.players[seat], new.players[seat]
    return {k: getattr(p1, k) - getattr(p0, k) for k in ("money", "appeal", "reputation", "conservation", "x_tokens")}


def _source(old: GameState, act: Action) -> str:
    """The `(source)` of a gain: the card behind the effect or the kind of effect."""
    pending = (old.prompt.args.get("pending") if old.prompt is not None else None) or []
    i = act.args.get("index", -1)
    e = pending[i] if isinstance(i, int) and 0 <= i < len(pending) else {}
    src = e.get("source")
    if isinstance(src, str) and re.match(r"^[ASPF]\d{3}$", src):
        return card(src)
    return str(src or "").replace("_", " ")


def _effect(old: GameState, act: Action) -> dict:
    pending = (old.prompt.args.get("pending") if old.prompt is not None else None) or []
    i = act.args.get("index", -1)
    return pending[i] if isinstance(i, int) and 0 <= i < len(pending) else {}


def _hand_change(old: GameState, new: GameState, seat: int) -> tuple:
    h0, h1 = Counter(old.players[seat].hand), Counter(new.players[seat].hand)
    return list((h1 - h0).elements()), list((h0 - h1).elements())


def _display_refill(old: GameState, new: GameState, L: Lines, start=None) -> None:
    """The display is replenished; every Wave card among the new ones removes the leftmost card and the display is replenished again: one line for each of those
    steps (replayed from the old deck, which the engine draws from in order). `start`: the cards left in the display when the replenishing begins."""
    from ark_nova.engine.game import DISPLAY_SIZE, is_wave
    cards = [c for c in old.display if c] if start is None else list(start)
    deck, used, lines = old.main_deck, 0, []
    while True:
        missing = DISPLAY_SIZE - len(cards)
        if missing <= 0 or used + missing > len(deck):
            break
        fresh = deck[used:used + missing]
        used += missing
        cards += fresh
        lines.append(f"The display is replenished with {names_of(fresh)}")
        waves = [c for c in fresh if is_wave(c)]
        if not waves:
            break
        lines += [f"{card(c)} has a Wave icon and triggers another wave" for c in waves]
        lines += [f"{card(c)} is removed from the display by the wave" for c in cards[:len(waves)]]
        cards = cards[len(waves):]
    if lines and cards == [c for c in new.display if c]:
        for line in lines:
            L.add(line)
        return
    c0, c1 = Counter(c for c in old.display if c), Counter(c for c in new.display if c)       # (the deck was reshuffled or extended: the plain line)
    added = list((c1 - c0).elements())
    removed = list((c0 - c1).elements())
    if added and (removed or any(c is None for c in old.display)):
        L.add(f"The display is replenished with {names_of(added)}")


def _enclosure_at(old: GameState, new: GameState, seat: int, x, y) -> str:
    for src in (old, new):
        for b in src.players[seat].buildings:
            if (b.x, b.y) == (x, y):
                return enclosure(b.type)
    return "an enclosure"


def _break_lines(old: GameState, new: GameState, L: Lines) -> None:
    """What BGA announces around a break: it starts when the break phase begins and ends (with the clean-up) when the round counter moves on."""
    if old.phase is not Phase.BREAK and new.phase is Phase.BREAK:
        L.add("Starting a new break")
    if new.round > old.round:
        first_two = [c for c in old.display[:2] if c]
        if first_two:
            L.add(f"Removing first two cards of the display: {names_of(first_two)}")
        L.add("All tokens are removed from player cards")
        L.add("Replenishing partner zoos and universities")
        _display_refill(old, new, L)
        L.add("End of the break")


def texts(old: GameState, act: Action, new: GameState, names: list) -> dict:
    seat, who = act.player, names[act.player] if 0 <= act.player < len(names) else f"Player {act.player + 1}"
    L = Lines(seat, who)
    L.names = names
    try:
        _fill(old, act, new, names, L, who)
    except Exception:                                                       # noqa: BLE001 (a log line must never stop a game: fall back to the engine's sentence)
        from ark_nova.live import stepdata
        full = fork.narrate(old, act, new, who)
        return {**stepdata.labels_for(act, full, who), "full": full}
    if old.display != new.display and not any("display" in item[2] for item in L.items):          # the display is replenished as part of a break (an income, the end of the break): what went and what came
        c0, c1 = Counter(c for c in old.display if c), Counter(c for c in new.display if c)
        gone, came = list((c0 - c1).elements()), list((c1 - c0).elements())
        if gone or came:
            L.add(f"The display is replenished" + (f": {names_of(gone)} discarded" if gone else "") + (f"{',' if gone else ':'} {names_of(came)} revealed" if came else ""))
    moved = new.break_position - old.break_position
    if moved > 0 and not any("advances the break" in item[2] for item in L.items):          # any effect that moves the break token says so (an action card, a sponsor, a sponsor's effect)
        L.add(f"{who} advances the break by {moved}, now ({new.break_position}/9)")
    if not L.items and not L.quiet:
        L.fallback(old, act, new)
    return L.render()


def _fill(old: GameState, act: Action, new: GameState, names: list, L: Lines, who: str) -> None:
    k, a = act.kind, act.args
    seat = act.player
    delta = _delta(old, new, seat)
    p0 = old.players[seat]
    other = names[1 - seat] if len(names) > 1 else "the other player"
    if k == "concede":
        L.add(f"{who} conceded the game")
        return
    if k in ("undo_last", "restart_turn", "confirm_turn"):
        L.add({"undo_last": f"{who} took back the last step", "restart_turn": f"{who} restarted the turn", "confirm_turn": f"{who} confirmed the turn"}[k])
        _break_lines(old, new, L)
        return
    if k == "choose_map":
        L.add(f"{who} confirms their map pick")                              # (the map itself stays hidden until both have picked)
        if old.map_select and old.map_select.get("stage") != "done" and new.map_select and new.map_select.get("stage") == "done":
            for i, p in enumerate(new.players):
                L.add(f"{names[i] if i < len(names) else 'Player ' + str(i + 1)} will play on map {p.map_id}")
        return
    if k in ("study_ready", "study_unready"):
        L.add(f"{who} is ready to start" if k == "study_ready" else f"{who} is not ready yet")
        return
    if k == "draft_pick":
        L.secret(f"{who} picks {a.get('variant')} (action card draft)", f"{who} chooses action cards (action card draft)")
        return
    if k == "draft_keep":
        L.secret(f"{who} keeps {' and '.join(map(str, a.get('keep', [])))} (action card draft)", f"{who} chooses action cards (action card draft)")
        return
    if k == "initial_discard":
        cards = list(a.get("cards", []))
        L.add(f"{who} discards {len(cards)} card{'' if len(cards) == 1 else 's'}")          # (short for everyone, like the replay: the cards are no use to the reader)
        return
    if k == "choose_release":                                                  # a Release project: the animal leaves the zoo before the bonus is chosen
        L.add(f"{who} releases {card(a['release'])}" + (f" ({delta['appeal']} appeal)" if delta["appeal"] else ""))
        return
    if k == "sponsor_side" and a.get("op") == "discard_snap":                  # Sponsors, variant 4: the discarded sponsor is secret, the one snapped from the display is public
        text = f"{who} discards {card(a['card'])} to snap {card(a['take'])}"
        L.secret(text, f"{who} discards a sponsors to snap {card(a['take'])}", text)
        return
    if k == "sponsor_side" and a.get("op") in ("discard_money", "discard_strength"):          # Sponsors, variant 3 (Sunbathing): the discarded card is secret
        what = "4 money" if a["op"] == "discard_money" else "2 strength"
        upgraded = (old.prompt.args.get("level", 1) if old.prompt is not None else 1) >= 2
        text = f"{who} discards {card(a['card'])} for {what} (Sunbathing Sponsors effect)"
        L.secret(text, f"{who} discards a {'card' if upgraded else 'sponsors'} for {what} (Sunbathing Sponsors effect)", text)
        return
    if k == "choose_action_card" and a.get("hypnosis"):                         # Hypnosis: one of the first 3 action cards of the other player is used
        other = old.players[1 - seat]
        slot = next((i for i, c in enumerate(other.action_cards) if c.type == a.get("type")), 0)
        oname = names[1 - seat] if 0 <= 1 - seat < len(names) else "the opponent"
        L.add(f"{who} hypnotize {oname} and use {ACTION_NAMES.get(a.get('type'), a.get('type'))} action at strength {slot + 1}", None,
              f"You hypnotize {oname} and use {ACTION_NAMES.get(a.get('type'), a.get('type'))} action at strength {slot + 1}")
        return
    if k == "choose_action_card":
        slot = next((i for i, c in enumerate(p0.action_cards) if c.type == a.get("type")), 0)
        x = int(a.get("spend", 0) or 0)
        c = p0.action_cards[slot]
        if x:
            L.add(f"{who} pays {x} xtoken for increasing card strength")
        L.add(f"{who} chooses action card {ACTION_NAMES.get(c.type, c.type)}{LEVEL.get(c.level, '')} with strength {slot + 1 + x}")
        return
    if k == "skip_action" and a.get("hypnosis"):
        t = ACTION_NAMES.get(a.get("type"), str(a.get("type")))
        L.add(f"{who} gains 1 xtoken (skipping a turn)")
        L.add(f"{who} places action card {t} of the opponent at position 1 (finishing action)")
        return
    if k == "skip_action":
        t = ACTION_NAMES.get(a.get("type"), str(a.get("type")))
        L.add(f"{who} gains 1 xtoken (skipping a turn)")
        L.add(f"{who} places action card {t} at position 1 (finishing action)")
        return
    if k == "place_building":
        t = a.get("type", "?")
        what = f"an additional {t}" if a.get("extra") else enclosure(t) if t.startswith("size-") else ("an " if t[:1] in "aeiou" else "a ") + t.replace("-", " ")
        pending = (old.prompt.args.get("pending") if old.prompt is not None else None) or []
        if any(e.get("placeback") and e.get("type") == t for e in pending):         # Reconstruction: a building that was picked up goes back on the map
            L.add(f"{who} reposition {what}", None, f"You reposition {what}")
        else:
            bonus_gain = _placement_gains(old, seat, a)                       # what the covered placement bonuses pay at once (several under one building are effects of their own, logged when chosen)
            spent = -delta["money"] + bonus_gain.get("money", 0)
            L.add(f"{who} pays {spent} for building {what}" if spent > 0 else f"{who} adds {what} for free")
            for res, n in bonus_gain.items():
                L.add(f"{who} gains {n} {'xtoken' if res == 'x_tokens' else res} (placement bonus)")
            if t == "pavilion":
                L.add(f"{who} gains 1 appeal (pavilion)")
    elif k == "play_animal":
        c = a.get("card", "?")
        spent = -delta["money"]
        src = " from display" if a.get("from_display") else ""
        where = _enclosure_at(old, new, seat, a.get("x"), a.get("y")) if "x" in a else "its enclosure"
        L.add(f"{who} {'buys' if a.get('from_display') else 'plays'} {card(c)}{src} for {max(spent, 0)} and places it in {where}")
        got = _gain_words({kk: delta[kk] + (spent if kk == 'money' else 0) for kk in delta})
        if got:
            L.add(f"{who} gains {' and '.join(got)} ({card(c)})")
        _display_refill(old, new, L)
    elif k == "play_sponsor":
        c = a.get("card", "?")
        spent = old.display.index(c) + 1 if a.get("from_display") and c in old.display else 0            # (money paid for a card of the display: the position; a sponsor's own money gain must not be netted against it)
        if a.get("from_display") and spent > 0:
            L.add(f"{who} pays {spent} to buy {card(c)} from display")
        else:
            L.add(f"{who} {'buys' if a.get('from_display') else 'plays'} {card(c)}{' from display' if a.get('from_display') else ''}")
        got = _gain_words({kk: delta[kk] + (spent if kk == 'money' else 0) for kk in delta})
        if got:
            L.add(f"{who} gains {' and '.join(got)} ({card(c)})")
        _display_refill(old, new, L)
    elif k == "take_cards":
        mode = a.get("mode")
        if mode == "deck":
            drawn, _ = _hand_change(old, new, seat)
            L.secret(f"{who} draws {names_of(drawn)} from the deck", f"{who} draws {n_cards(len(drawn))} from the deck", f"You draw {names_of(drawn)} from the deck")
        else:
            c = a.get("card", "?")
            L.add(f"{who} snaps {card(c)} from the display" if mode == "snap" else f"{who} takes {card(c)} in reputation range from the display")
            _display_refill(old, new, L)
    elif k == "discard_cards":
        cards = list(a.get("cards", []))
        phase = "during break" if a.get("mode") == "break" else ""
        L.secret(f"{who} discards {names_of(cards)} {phase}".strip(), f"{who} discards {n_cards(len(cards))} {phase}".strip(), f"You discard {names_of(cards)} {phase}".strip())
    elif k == "sponsor_break":
        moved = new.break_position - old.break_position
        sp = f"{moved} space" + ("" if moved == 1 else "s")
        L.add(f"{who} advances the break token {sp} (now at {new.break_position}/9)" if new.break_position < 9 else f"{who} advances the break token {sp} to the last space of the Break track")
        if delta["money"] > 0:
            L.add(f"{who} gains {delta['money']} money (break)")
        if delta["x_tokens"] > 0:
            L.add(f"{who} gains {delta['x_tokens']} xtoken (causing the break)")
    elif k == "association_task":
        _association(old, act, new, L, who, delta)
    elif k == "skip_effect":
        e = _effect(old, act)
        if e.get("kind") == "search_discard" and not e.get("optional"):          # Horse Whisperer with no Petting Zoo animal in the discard pile
            L.secret(f"{who} couldn't take a petting zoo animal from the discard because there weren't any", f"{who} couldn't take a petting zoo animal from the discard because there weren't any",
                     "You didn't keep a petting zoo from the discard because there weren't any")
        else:
            L.quiet = True                                                   # (BGA logs nothing when a player passes on an effect)
    elif k == "donate":
        got = _gain_words({kk: delta[kk] for kk in delta if kk != "money"})
        spent = -delta["money"]
        L.add(f"{who} donates {spent} money to get {' and '.join(got)}" if spent > 0 else f"{who} donates for free to get {' and '.join(got)}")
    elif k == "choose_effect":
        _effect_line(old, act, new, L, who, delta)
    elif k == "finish_build" or k in ("finish_sponsors", "finish_animals", "finish_association"):
        pass
    else:
        L.fallback(old, act, new)
        _display_refill(old, new, L)
    # the end of an action: BGA moves the action card to the first slot
    ca = old.current_action
    if ca and new.current_action is None and k not in ("undo_last", "restart_turn") and ca.get("seat") == seat and not ca.get("skipped") and ca.get("type") in ACTION_NAMES:
        t = ACTION_NAMES.get(ca.get("type"), str(ca.get("type")))
        L.add(f"{who} places action card {t} at position 1 (finishing action)")
    _break_lines(old, new, L)


def _association(old: GameState, act: Action, new: GameState, L: Lines, who: str, delta: dict) -> None:
    a = act.args
    task = a.get("task")
    got = _gain_words(delta)
    if task == "partner":
        L.add(f"{who} takes a new partner zoo" + (f" ({a['continent']})" if a.get("continent") else ""))
    elif task == "university":
        seat = act.player
        before = Counter(t.type for t in old.players[seat].tokens if t.location.startswith("university_"))
        added = [t.type for t in new.players[seat].tokens if t.location.startswith("university_") and not before.get(t.type)]
        L.add(f"{who} takes <UNI:{added[0]}>" if added else f"{who} takes a new university")                 # (the tile that was taken, drawn by the page)
        if got:
            L.add(f"{who} gains {' and '.join(got)} (from university)")
    elif task == "hire":
        L.add(f"{who} gains a new Association worker")
    elif task == "conservation":
        L.add(f"{who} supports a conservation project : {card(a['project'])}" if a.get("project") else f"{who} supports a conservation project")
    elif task == "reputation":
        L.add(f"{who} gains {' and '.join(got) or '2 reputation'} (association)")
    else:
        L.fallback(old, act, new)


def _effect_line(old: GameState, act: Action, new: GameState, L: Lines, who: str, delta: dict) -> None:
    a = act.args
    e = _effect(old, act)
    kind = e.get("kind")
    src = _source(old, act)
    if kind == "gain" and e.get("label"):
        src = str(e["label"]).capitalize()                                  # an ability's gain: "(Pack)", not the card that has it
    sfx = f" ({src})" if src else ""
    seat = act.player
    if kind == "pay_appeal":
        L.add(f"{who} spend 2 money to gain 1 appeal", None, "You spend 2 money to gain 1 appeal")
    elif kind == "waza" and a.get("waza"):
        size = "small" if a["waza"] == "small" else "large"
        L.add(f"{who} focuses on {size} animals and can no longer play the other type", None, f"You focus on {size} animals and can no longer play the other type")
    elif kind == "ability" and e.get("name"):
        L.add(f"{who} activated {e['name']}" + (f" {e['value']}" if e.get("value") and str(e["value"]) not in str(e["name"]) else ""), None,
              f"You activated {e['name']}" + (f" {e['value']}" if e.get("value") and str(e["value"]) not in str(e["name"]) else ""))
    elif kind in ("venom", "constrict"):                                    # the tokens that went on the other player's action cards
        token = "Venom" if kind == "venom" else "Constriction"
        other = 1 - seat
        cards = [ACTION_NAMES.get(n.type, n.type) for o, n in zip(old.players[other].action_cards, new.players[other].action_cards) if n.tokens.count(token) > o.tokens.count(token)]
        oname = L.names[other] if 0 <= other < len(L.names) else "the opponent"
        word = token.lower() + (" token" if len(cards) <= 1 else " tokens")
        if cards:
            tail = f" (and {cards[1]})" if len(cards) > 1 else ""
            L.add(f"{who} placed {word} on {oname} {cards[0]}{tail}", None, f"You placed {word} on {oname} {cards[0]}{tail}")
        else:
            L.add(f"{who} used {token}, but no token was placed", None, f"You used {token}, but no token was placed")
    elif kind == "continent" and a.get("continent"):
        L.add(f"{who} removed a marker from the <{str(a['continent']).upper()}> continent", None, f"You removed a marker from the <{str(a['continent']).upper()}> continent")
        if _gain_words(delta):
            L.add(f"{who} gains {' and '.join(_gain_words(delta))} (continent marker)")
    elif kind == "pilfer" and not a.get("nothing"):
        what = "5 money" if a.get("pay") else "1 card"
        paid = max(-delta["money"], 0)
        if a.get("pay") and paid != 5:
            what = f"{paid} money"
        L.add(f"{who} gave {what} for the Pilfering effect", None, f"You gave {what} for the Pilfering effect")
    elif kind == "extra_shift" and a.get("worker") is not None:
        zones = {"association_2": "reputation", "association_3": "partner zoo", "association_4": "university", "association_5": "project"}
        t = next((t for t in old.players[seat].tokens if t.id == a["worker"]), None)
        zone = zones.get(t.location, "association") if t is not None else "association"
        L.add(f"{who} take back a worker from the {zone} zone", None, f"You take back a worker from the {zone} zone")
    elif kind == "symbiosis" and a.get("ability"):
        L.add(f"{who} activated {a['ability']} (Symbiosis effect)", None, f"You activated {a['ability']} (Symbiosis effect)")
    elif kind == "gain":
        got = _gain_words(delta)
        if got:
            L.add(f"{who} gains {' and '.join(got)}{sfx}")
        else:
            L.fallback(old, act, new)
    elif a.get("apply", "").startswith("income_") or kind == "income":
        name = {"income_kiosk": "kiosk income", "income_appeal": "appeal income"}.get(a.get("apply", ""), "map income")
        if delta["money"] > 0:
            L.add(f"{who} gains {delta['money']} money ({name})")
        else:
            L.quiet = True                                                 # (nothing to collect: BGA logs nothing)
    elif kind == "break_discard":
        cards = list(a.get("cards", []))
        L.secret(f"{who} discards {names_of(cards)} during break", f"{who} discards {n_cards(len(cards))} during break", f"You discard {names_of(cards)} during break")
    elif kind == "expedition":                                              # Marine Research Expedition: a person sponsor goes away, or Scuba Dive 3 is taken instead
        if a.get("scuba"):
            L.add(f"{who} chooses Scuba Dive 3 (Marine Research Expedition)")
        elif a.get("send"):
            L.add(f"{who} sends {card(a['send'])} away on an expedition (Marine Research Expedition)")
            if delta["conservation"] > 0:
                L.add(f"{who} gains {delta['conservation']} conservation (Marine Research Expedition)")
        else:
            L.fallback(old, act, new)
    elif kind == "reveal":
        x = int(e.get("x", 0) or 0)
        top = list(old.main_deck[:x])
        kept = _hand_change(old, new, seat)[0]
        rest = list((Counter(top) - Counter(kept)).elements())
        pname = {"animal": "hunter", "any": "perception", "sponsor": "scuba dive"}.get(e.get("filter", "any"), "reveal")
        if not (e.get("revealed") and not a.get("reveal")):                       # (the draw is told when the effect is activated, the choice when it is made)
            L.secret(f"{who} draws {names_of(top)} for {pname} effect", f"{who} draws {n_cards(len(top))} for {pname} effect", f"You draw {names_of(top)} for {pname} effect")
        if a.get("reveal"):
            return
        if pname == "perception":                                              # (the sheet: the opponent sees nothing of a Perception)
            L.secret(f"{who} keeps {names_of(kept)} and discards {names_of(rest)}", f"{who} keeps {n_cards(len(kept))}", f"You keep {names_of(kept)} and discard {names_of(rest)}")
        else:                                                                  # Hunter / Scuba Dive: the kept card is public
            L.secret(f"{who} keeps {names_of(kept)} and discards {names_of(rest)}", f"{who} keeps {names_of(kept)}", f"You keep {names_of(kept)} and discard {names_of(rest)}")
    elif kind in ("upgrade", "threshold2") and isinstance(a.get("upgrade"), str):
        c = next((c for c in new.players[seat].action_cards if c.type == a["upgrade"]), None)
        L.add(f"{who} upgrades {ACTION_NAMES.get(a['upgrade'], a['upgrade'])}{LEVEL.get(c.level, 'II') if c else 'II'}")
    elif kind == "threshold2" and a.get("hire"):
        L.add(f"{who} gains a new Association worker (reputation track bonus)")
    elif kind == "slot1":
        L.add(f"{who} places action card {ACTION_NAMES.get(a.get('type'), a.get('type'))} at position 1 (Clever)")
    elif kind == "wave" or (kind == "pbonus" and (e.get("bonus") or {}).get("type") == "wave"):
        shown = [c for c in old.display if c]
        L.add(f"{who} placement bonus: wave" if kind == "pbonus" else f"{who} wave")
        if shown:
            L.add(f"{card(shown[0])} is removed from the display by the wave")
        _display_refill(old, new, L, start=shown[1:])
    elif kind in ("pbonus", "project_bonus", "threshold_bonus", "take_tile", "rep_bonus") and _gain_words(delta):
        label = {"pbonus": "placement bonus", "project_bonus": "project bonus", "threshold_bonus": "conservation bonus", "take_tile": "association", "rep_bonus": "reputation bonus"}[kind]
        L.add(f"{who} gains {' and '.join(_gain_words(delta))} ({label})")
    elif kind == "endgame_discard":
        c = a.get("card")
        L.secret(f"{who} discards {card(c) if c else 'a scoring card'} (scoring card)", f"{who} discards 1 scoring card(s)", f"You discard {card(c) if c else 'a scoring card'} (scoring card)")
    elif kind == "pouch":
        c = a.get("card")
        L.secret(f"{who} discards {card(c) if c else 'a card'} for the pouch ability", f"{who} discards 1 card for the pouch ability", f"You discard {card(c) if c else 'a card'} for the pouch ability")
    elif kind == "adapt":
        drawn = list((Counter(new.players[seat].endgame_hand) - Counter(old.players[seat].endgame_hand)).elements())
        gone = list(a.get("discard") or [])
        if drawn:
            L.secret(f"{who} draws {names_of(drawn)} for the adapt ability", f"{who} draws {len(drawn)} scoring cards for the adapt ability", f"You draw {names_of(drawn)} for the adapt ability")
        L.secret(f"{who} discards {names_of(gone)} for the adapt ability", f"{who} discards {len(gone)} scoring cards for the adapt ability", f"You discard {names_of(gone)} for the adapt ability")
    elif kind == "scavenge":
        c = a.get("keep")
        L.secret(f"{who} takes {card(c) if c else 'a card'} from the discard pile for the scavenging ability", f"{who} takes a card from the discard pile for the scavenging ability",
                 f"You take {card(c) if c else 'a card'} from the discard pile for the scavenging ability")
    elif kind == "mark" and isinstance(a.get("card"), str):
        L.add(f"{who} marks {card(a['card'])} from display")
    elif kind == "shark" and a.get("cards"):
        L.add(f"{who} removes {names_of(a['cards'])} from the display (shark attack)")
        if delta["appeal"] > 0:
            L.add(f"{who} gains {delta['appeal']} appeal (shark attack)")
        _display_refill(old, new, L)
    elif kind == "glide" and a.get("cards") is not None:
        from ark_nova.engine.icons import card_icons
        cards = list(a.get("cards", []))
        n = sum(card_icons(c, old.config.marine_worlds)["SeaAnimal"] for c in cards)
        icons = f"{n} sea animal icon" + ("" if n == 1 else "s")
        L.secret(f"{who} glided {names_of(cards)} for {icons}", f"{who} glided {n_cards(len(cards))} for {icons}", f"You glided {names_of(cards)} for {icons}")
    elif kind == "glide_gain":
        words = {"reputation": "gained 1 reputation", "appeal": "gained 2 appeal", "kiosk": "will place a kiosk for free"}
        L.add(f"{who} {words.get(a.get('gain'), 'gained a bonus')} (Glide effect)")
    elif kind == "cut_down" and a.get("building") is not None:
        b = next((b for b in old.players[seat].buildings if [b.x, b.y] == list(a["building"])), None)
        size = b.type.replace("size-", "") if b is not None else "?"
        gained = max(delta["money"], 0)
        L.add(f"{who} used cutdown on an empty size {size} enclosure and gained {gained} money", None, f"You used cutdown on an empty size {size} enclosure and gained {gained} money")
    elif kind == "enlarge" and a.get("building") is not None:
        b = next((b for b in old.players[seat].buildings if [b.x, b.y] == list(a["building"])), None)
        n = int(b.type.replace("size-", "")) if b is not None and b.type.startswith("size-") else 0
        tail = " and gained 2 appeal" if b is not None and b.animal else ""
        L.add(f"{who} enlarged an enclosure ({n} -> {n + 1}){tail}", None, f"You enlarged an enclosure ({n} -> {n + 1}){tail}")
    elif kind == "move_in" and a.get("move"):
        dest = next((b for b in old.players[seat].buildings if [b.x, b.y] == list(e.get("building") or [])), None)
        src = next((b for b in old.players[seat].buildings if [b.x, b.y] == list(a.get("from") or [])), None)
        into = dest.type.replace("-", " ") if dest is not None else "special enclosure"
        freed = f" and free up a {src.type if src.type.startswith('size-') else src.type.replace('-', ' ')} enclosure" if src is not None and src.type.startswith("size-") else (f" and free up space in the {src.type.replace('-', ' ')}" if src is not None else "")
        L.add(f"{who} moved {card(a['move'])} into the {into}{freed}", None, f"You moved {card(a['move'])} into the {into}{freed}")
    elif kind == "reposition" and a.get("remove") is not None:
        L.quiet = True                                                      # (picking the buildings up says nothing: each one is logged when it is put back)
    elif kind == "boost" and a.get("slot") is not None:
        name = ACTION_NAMES.get(e.get("type"), str(e.get("type")))
        L.add(f"{who} put the {name} action at {int(a['slot'])} (Boost effect)", None, f"You put the {name} action at {int(a['slot'])} (Boost effect)")
    elif kind == "multiplier" and a.get("multiplier"):
        name = ACTION_NAMES.get(a["multiplier"], str(a["multiplier"]))
        L.add(f"{who} put a multiplier token on the {name} action", None, f"You put a multiplier token on the {name} action")
    elif kind == "marketing" and isinstance(a.get("card"), str):                  # the sponsor and its price are public
        spent = max(-delta["money"], 0)
        L.add(f"{who} marketed {card(a['card'])} for {spent} money", None, f"You marketed {card(a['card'])} for {spent} money")
    elif kind == "store":
        c = a.get("store")
        L.secret(f"{who} stored {card(c) if c else 'a card'}", f"{who} stored a card", f"You stored {card(c) if c else 'a card'}")
    elif kind == "search_discard" and a.get("card"):
        c = a["card"]
        L.secret(f"{who} keeps {card(c)} from the discard", f"{who} keeps 1 petting zoo animal from the discard", f"You keep {card(c)} from the discard")
    elif kind == "assertion" and a.get("card"):
        c = a["card"]
        L.secret(f"{who} kept {card(c)} with the assertion effect", f"{who} kept a card with the assertion effect", f"You kept {card(c)} with the assertion effect")
    elif kind == "dominance":
        if "P108" in old.base_projects_unused:
            L.add(f"{who} put the Primates project into their hand", None, f"You put the Primates project into your hand")
        else:
            L.add(f"{who} couldn't take Primates project because it's not available", None, "You couldn't take Primates project because it's not available")
    elif kind == "sell":
        cards = list(a.get("cards", []))
        m = max(delta["money"], 0)
        L.secret(f"{who} discards {names_of(cards)} for the sunbathing ability and gained {m} money", f"{who} discards {len(cards)} cards for the sunbathing ability and gained {m} money",
                 f"You discard {names_of(cards)} for the sunbathing ability and gained {m} money")
    elif kind == "digging":
        drawn, gone = _hand_change(old, new, seat)
        if a.get("rescue"):                                                    # Map 10: the animal goes to the Rescued zone, which everybody sees: also a card of the hand is named
            key = a.get("display") or a.get("hand") or (gone[0] if gone else "?")
            L.add(f"{who} rescues {card(key)} (Map 10 effect)")
            if "display" in a:
                _display_refill(old, new, L)
            if drawn:
                L.secret(f"{who} draws {names_of(drawn)} from the deck", f"{who} draws {n_cards(len(drawn))} from the deck", f"You draw {names_of(drawn)} from the deck")
        elif "display" in a:
            L.add(f"{who} digs {card(a['display'])} from the display")
            _display_refill(old, new, L)
        else:
            L.secret(f"{who} digs {names_of(gone)} from their hand", f"{who} digs a card from their hand", f"You dig {names_of(gone)} from your hand")
            if drawn:
                L.secret(f"{who} draws {names_of(drawn)} from the deck", f"{who} draws {n_cards(len(drawn))} from the deck", f"You draw {names_of(drawn)} from the deck")
    elif kind == "search_category":
        got = _hand_change(old, new, seat)[0]
        cat = str(e.get("category", ""))
        icon = "<SEARCH-" + ("SEAANIMAL" if cat == "marine" else cat.upper()) + ">"
        L.add(f"{who} draws {names_of(got) if got else 'no card'} with the {icon} effect")
    else:
        L.fallback(old, act, new)
        _display_refill(old, new, L)
