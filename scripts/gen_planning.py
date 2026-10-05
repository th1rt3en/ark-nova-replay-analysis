"""Generate the two planning sheets for the live game (docs/live_game_plan.md) into data_manual/planning/.

    visibility.json     what each viewer may see: every field of the game state and every event that moves hidden cards
    reversibility.json  which action / effect kinds the "Undo last step" and "Restart turn" buttons may take back

Every row has a `suggested` value (a starting point from reading the rules and the code, with the reason in `why`) and an empty `decision` for you to fill
in (in `web/planning.html`, or by hand in the file). Running the script again keeps every `decision` and `note` already entered, refreshes the texts and adds
rows for state fields / action kinds that are new in the code, so it is safe to re-run after the engine changes.

Usage: python scripts/gen_planning.py
"""
import dataclasses
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
OUT = ROOT / "data_manual" / "planning"

VISIBILITY_CHOICES = {
    "public": "Everyone sees it: both players and spectators.",
    "owner_count": "Only the owner sees the contents; the opponent and spectators see how many there are.",
    "owner_only": "Only the owner sees it; the opponent does not even see a count.",
    "server_only": "Never leaves the server: not even the owner sees it.",
    "until_revealed": "Secret until an event reveals it (name the event in the note).",
}
REVERSIBILITY_CHOICES = {
    "reversible": "Undo / Restart turn may take it back: nothing hidden was revealed and the opponent did not decide anything.",
    "irreversible": "Cannot be taken back: it reveals hidden information (a draw, a reveal, a search) or the opponent has to answer. Restart turn stops after it.",
    "depends": "Reversible in some cases only (say when in the note, e.g. display card vs deck card).",
    "not_applicable": "Not a player decision (an internal step of the engine): nothing to decide.",
}

# (id, label, description, suggested, why)
VISIBILITY = {
    "Game": [
        ("game.config", "Configuration", "Maps, Marine Worlds, player names, which base projects were drawn.", "public", "Everyone needs it to read the board."),
        ("game.seed", "Seed", "The random seed and the known deck prefix: they decide the deck order.", "server_only", "Whoever has the seed can compute every future draw."),
        ("game.rng", "Random generator state", "The 64 bit state of the engine's random generator.", "server_only", "Same reason as the seed."),
        ("game.counters", "Phase, turn, active player, round, break track", "Where the game is.", "public", ""),
        ("game.main_deck", "Draw pile: contents and order", "The cards still in the draw pile, top first.", "server_only", "The order is the secret."),
        ("game.main_deck_count", "Draw pile: number of cards", "How many cards are left.", "public", "Physical game: the pile is visible."),
        ("game.main_discard", "Discard pile", "All discarded cards and their order.", "public", "Face up in the physical game."),
        ("game.endgame_deck", "Endgame (final scoring) deck: contents", "The final scoring cards not yet dealt.", "server_only", ""),
        ("game.endgame_deck_count", "Endgame deck: number of cards", "", "public", ""),
        ("game.endgame_discard", "Discarded endgame cards", "Final scoring cards discarded at conservation 10 or at the start.", "until_revealed", "Face down in the physical game; may be revealed at the end."),
        ("game.display", "Display (the 6 folders)", "The cards in reach.", "public", ""),
        ("game.base_projects", "Base conservation projects in play", "The 3 base projects of the game.", "public", ""),
        ("game.base_projects_unused", "Base projects not in play", "The other base projects (Assertion fetches one of them).", "public", "Players can work them out anyway."),
        ("game.projects_in_play", "Conservation projects played during the game", "", "public", ""),
        ("game.board_tokens", "Association board", "Partner zoo and university tiles on offer.", "public", ""),
        ("game.conservation_options", "Conservation 5 / 8 reward options", "The random bonuses still on offer.", "public", ""),
        ("game.current_action", "Action in progress", "Which action card, strength and variant the active player is using.", "public", ""),
        ("game.pending", "Pending effects and the open decision", "What the active player still has to resolve (kinds, not the secret contents).", "public", "Opponents see 'X must resolve Perception 2'; the revealed cards follow the reveal rules below."),
        ("game.draft", "Action card draft", "The variants each player is offered and picks.", "until_revealed", "Both choose at the same time: nothing is shown until both have chosen, or until the draft is over."),
        ("game.result", "Result", "Final scores, winner, how the game ended.", "public", ""),
        ("game.end_state", "End of game trigger, final turns", "", "public", ""),
    ],
    "Each player": [
        ("player.counters", "Money, appeal, conservation, reputation, X tokens", "The tracks.", "public", ""),
        ("player.action_cards", "Action cards (order, variants, levels, tokens)", "", "public", ""),
        ("player.hand", "Hand (animals, sponsors, projects)", "", "owner_count", "The opponent knows how many."),
        ("player.endgame_hand", "Endgame cards in hand", "The player's final scoring cards.", "owner_count", ""),
        ("player.initial_offer", "Initial offer (the 8 dealt cards)", "Before the first discard.", "owner_only", ""),
        ("player.animals", "Animals in the zoo", "", "public", ""),
        ("player.sponsors", "Sponsors in the zoo", "", "public", ""),
        ("player.released", "Released animals", "", "public", ""),
        ("player.stored", "Cards stored (map 11 notepad)", "", "owner_count", "Face down."),
        ("player.pouched", "Cards pouched under an animal / cards under another card", "", "owner_count", "Face down in the physical game."),
        ("player.rescued", "Rescued animals", "", "public", ""),
        ("player.buildings", "Buildings and their animals", "", "public", ""),
        ("player.tokens", "Workers, partner zoos, universities, project tokens, marks", "", "public", ""),
        ("player.flags", "Internal flags (once per turn markers, map counters)", "Engine bookkeeping.", "public", "Check the individual flags before sending them."),
        ("player.icons", "Icon counters", "Derived from the zoo.", "public", ""),
    ],
    "Events that move hidden cards": [
        ("event.draw_deck", "Cards drawn from the draw pile", "Draw, Sprint, Cards action, income.", "owner_count", "The owner sees the cards, the opponent how many."),
        ("event.take_display", "Cards taken from the display", "Take in range, snap.", "public", ""),
        ("event.reveal", "Reveal the X topmost cards (Hunter, Perception, Scuba Dive)", "All the revealed cards.", "public", "'Reveal' means shown to everybody."),
        ("event.reveal_kept", "The card kept after a reveal", "Goes to the hand of the player.", "public", "It was shown to all."),
        ("event.digging", "Digging", "Discard one hand card, draw one.", "owner_count", "The discarded card is public (discard pile), the new one is not."),
        ("event.scavenging", "Scavenging", "Discard from the discard pile and draw.", "owner_count", ""),
        ("event.search", "Search effects (university, Assertion, Waza, management plans)", "The card found in the draw pile.", "public", "The found card is shown; the rest of the pile is not."),
        ("event.monkey_gang", "Monkey Gang", "Look at cards and tuck them under the draw pile.", "owner_only", "Contents and order of the tucked cards stay secret."),
        ("event.pilfering", "Pilfering", "A card moves between the hands.", "until_revealed", "Name who sees which card in the note."),
        ("event.discard_hand", "Discard from the hand (break limit, Cards action, effects)", "", "public", "It goes to the face up discard pile."),
        ("event.initial_discard", "Initial discard (4 of 8)", "", "public", "Goes to the discard pile."),
        ("event.endgame_discard", "Endgame card discarded (conservation 10)", "Which final scoring card was discarded.", "owner_only", ""),
        ("event.play_card", "Playing an animal / sponsor / project", "The card leaves the hand and becomes public.", "public", ""),
        ("event.final_scoring", "Final scoring cards at the end", "", "public", "Revealed to score them."),
        ("event.draft_pick", "Draft picks and offers", "", "until_revealed", "See game.draft."),
        ("event.display_refill", "Display refill", "New cards come from the draw pile onto the display.", "public", ""),
        ("event.log_text", "Move log text", "The sentence for each move ('X plays Y').", "owner_count", "Written per viewer: card names only where the viewer may see them."),
        ("event.legal_actions", "The opponent's legal actions", "", "server_only", "They would reveal the hand."),
        ("event.clocks", "Clocks, connection status", "", "public", ""),
    ],
}

# (id, label, description, suggested, why)
REVERSIBILITY = {
    "Player actions (ACTION_SPECS)": [
        ("action:choose_map", "choose_map", "Pick a map (setup).", "reversible", "Before the game."),
        ("action:draft_pick", "draft_pick", "Pick a variant in the action card draft (both players at once).", "depends", "Can be changed until the other player has chosen; final after."),
        ("action:draft_keep", "draft_keep", "Keep 2 of 3 variants.", "depends", "Same as draft_pick."),
        ("action:initial_discard", "initial_discard", "Discard 4 of the 8 dealt cards.", "depends", "Both choose at the same time: reversible until both have chosen."),
        ("action:choose_action_card", "choose_action_card", "Choose an action card (and spend X tokens).", "reversible", "Nothing hidden is revealed. If the break advance starts a break, see break_start."),
        ("action:sponsor_side", "sponsor_side", "Side action of a Sponsors card variant.", "reversible", "Cards involved are public (discard, snap from the display)."),
        ("action:self_clever", "self_clever", "Self-clever Association: do nothing and act again.", "reversible", ""),
        ("action:take_instead", "take_instead", "A card instead of the donation.", "depends", "From the deck: irreversible; from the display: reversible."),
        ("action:skip_extra", "skip_extra", "Decline the optional second action.", "reversible", ""),
        ("action:skip_action", "skip_action", "Put an action card on slot 1 and gain an X token.", "reversible", ""),
        ("action:play_animal", "play_animal", "Play an animal into an enclosure.", "reversible", "The card is public; its on-play effects have their own rows."),
        ("action:place_building", "place_building", "Place a building.", "reversible", "Placement bonuses have their own rows."),
        ("action:finish_build", "finish_build", "Stop building.", "reversible", ""),
        ("action:take_card", "take_card", "Take a card from the display or draw from the deck.", "depends", "Deck draw irreversible, display reversible."),
        ("action:discard_cards", "discard_cards", "Discard cards from the hand.", "reversible", "Public discard pile."),
        ("action:play_sponsor", "play_sponsor", "Play a sponsor card.", "reversible", "Effects have their own rows."),
        ("action:sponsor_break", "sponsor_break", "Sponsors action alternative: advance the break and take money.", "depends", "Irreversible if it triggers a break."),
        ("action:finish_sponsors", "finish_sponsors", "Stop playing sponsors.", "reversible", ""),
        ("action:skip_effect", "skip_effect", "Decline an optional pending effect.", "reversible", ""),
        ("action:association_task", "association_task", "Perform one association task.", "depends", "Tasks that draw (universities with a search) are irreversible."),
        ("action:finish_animals", "finish_animals", "Stop playing animals.", "reversible", ""),
        ("action:finish_association", "finish_association", "Stop performing association tasks.", "reversible", ""),
        ("action:donate", "donate", "Make a donation.", "reversible", ""),
        ("action:upgrade_action_card", "upgrade_action_card", "Flip an action card to level II.", "reversible", ""),
        ("action:choose_effect", "choose_effect", "Resolve one of the pending effects (see the effect rows below).", "depends", "As the effect it resolves."),
        ("action:skip", "skip", "Decline an optional effect.", "reversible", ""),
        ("action:confirm_turn", "confirm_turn (new)", "End the turn: the display is refilled, a break may start, the turn passes.", "irreversible", "The display refill reveals draw pile cards. Everything before it can be undone, nothing after."),
    ],
    "Pending effects (effect kinds)": [
        ("effect:build", "build", "Place a (free) building.", "reversible", ""),
        ("effect:take", "take", "Take a card: deck or display.", "depends", "Deck: irreversible. Display: reversible."),
        ("effect:gain", "gain", "Money, appeal, conservation, reputation, X tokens.", "reversible", "Reputation and conservation thresholds open their own rows."),
        ("effect:reveal", "reveal (Hunter, Perception, Scuba Dive)", "Reveal the X topmost cards and keep some.", "irreversible", "The cards were revealed to the opponent."),
        ("effect:sell", "sell", "Discard cards for money (Sun Bathing).", "reversible", "Public discard."),
        ("effect:mark", "mark", "Place a mark cube.", "reversible", ""),
        ("effect:marketing", "marketing", "Play a sponsor / bonus through Marketing.", "reversible", ""),
        ("effect:donation", "donation", "Donate.", "reversible", ""),
        ("effect:digging", "digging", "Discard a hand card, draw one (or discard a display card).", "depends", "Drawing from the deck: irreversible. Display part: reversible."),
        ("effect:scavenge", "scavenge", "Draw from the discard pile / deck and keep.", "irreversible", "Draws from the deck."),
        ("effect:glide", "glide / glide_gain", "Glide: discard cards for a gain.", "reversible", ""),
        ("effect:shark", "shark", "Shark Attack: discard sea animals of the display.", "depends", "The display refill comes at the end of the turn."),
        ("effect:symbiosis", "symbiosis", "Use the ability of another sea animal.", "depends", "As the copied ability."),
        ("effect:cut_down", "cut_down", "Remove a building.", "reversible", ""),
        ("effect:trade", "trade", "Trade X tokens and money.", "reversible", ""),
        ("effect:extra_shift", "extra_shift", "Take a worker back.", "reversible", ""),
        ("effect:assertion", "assertion", "Take an unused base conservation project.", "reversible", "The unused pool is public."),
        ("effect:pilfer", "pilfer", "Pilfering: the opponent gives a card or money.", "irreversible", "The opponent has to answer."),
        ("effect:venom", "venom / constrict", "Give Venom or Constriction tokens.", "depends", "Opponent's payment decisions are irreversible."),
        ("effect:hypnosis", "hypnosis", "Use an action card of the opponent.", "depends", "Irreversible once the opponent's card does something hidden."),
        ("effect:pay_appeal", "pay_appeal", "Pay appeal for an effect.", "reversible", ""),
        ("effect:jumping", "jumping", "Advance the break token and gain money.", "depends", "Irreversible if the break starts."),
        ("effect:upgrade", "upgrade / threshold2", "Upgrade an action card or hire a worker.", "reversible", ""),
        ("effect:threshold_bonus", "threshold_bonus", "Conservation 5 / 8: pick one of the bonuses.", "depends", "As the bonus picked (a draw is irreversible)."),
        ("effect:endgame_discard", "endgame_discard", "Conservation 10: discard an endgame card.", "depends", "Both players at once: reversible until both have chosen."),
        ("effect:adapt", "adapt", "Draw final scoring / base projects and discard.", "irreversible", "Draws from the endgame deck."),
        ("effect:break_discard", "break_discard", "Discard down to the hand limit in a break.", "depends", "Both at once; reversible until both have chosen."),
        ("effect:take_tile", "take_tile", "Take a partner zoo / university tile.", "reversible", "Replenishing is at the end of the break."),
        ("effect:archaeologist", "archaeologist", "Archaeologist.", "depends", "Check the rule."),
        ("effect:income", "income_appeal / income_kiosk / income_map / income_sponsor", "Choices of the break income.", "depends", "Money reversible, cards from the deck irreversible."),
        ("effect:rep_bonus", "rep_bonus", "Reputation track bonus.", "depends", "A card to take: see take."),
        ("effect:store", "store", "Store a card (map 11).", "reversible", "Nobody else learns anything but a count."),
        ("effect:move_in", "move_in / continent / multiplier", "Map specific moves (map 9, map 4).", "reversible", ""),
        ("effect:wave", "wave", "Remove the first display card and replenish.", "irreversible", "The replenish reveals a draw pile card."),
        ("effect:release", "release", "Release an animal for a project.", "reversible", ""),
        ("effect:project_bonus", "project_bonus / tutor / reef", "Conservation project rewards.", "depends", "Tutor (search) is irreversible."),
        ("effect:waza", "waza", "Take the first animal of a size from the deck.", "irreversible", "Search of the draw pile."),
        ("effect:reposition", "reposition", "Remove up to 3 buildings and place them again.", "reversible", ""),
        ("effect:boost", "boost / slot1", "Move an action card to slot 1 or 5.", "reversible", ""),
        ("effect:enlarge", "enlarge", "Enlarge an enclosure.", "reversible", ""),
        ("effect:expedition", "expedition", "Send a person away or Scuba Dive 3.", "depends", "Scuba Dive reveals cards: irreversible."),
        ("effect:ability_draw", "ability (Sprint, Monkey Gang, Scavenging, ...)", "Deferred abilities that draw.", "irreversible", "They draw from the deck."),
        ("effect:search_discard", "search_discard", "Take a card from the discard pile.", "reversible", "The pile is public."),
    ],
    "Engine steps (no decision)": [
        ("step:display_refill", "Display refill", "At the end of the turn.", "not_applicable", "Part of confirm_turn."),
        ("step:break_start", "Break starts", "The break token reaches the end: income, discards, refill.", "irreversible", "The game moves on for both players."),
        ("step:shuffle", "Shuffle / reshuffle", "A deck is shuffled.", "irreversible", "Reveals nothing but cannot be undone."),
        ("step:final_scoring", "Final scoring", "", "not_applicable", ""),
    ],
}


def state_fields() -> dict:
    """Fields of the game state that the sheet has to cover, to flag new ones."""
    from ark_nova.engine import state as S
    return {"GameState": [f.name for f in dataclasses.fields(S.GameState)], "PlayerState": [f.name for f in dataclasses.fields(S.PlayerState)]}


def action_kinds() -> list:
    from ark_nova.engine.actions import ACTION_SPECS
    return list(ACTION_SPECS)


def build(kind: str, groups: dict, choices: dict, previous: dict) -> dict:
    items = []
    for group, rows in groups.items():
        for rid, label, desc, suggested, why in rows:
            old = previous.get(rid, {})
            items.append({"id": rid, "group": group, "label": label, "description": desc, "suggested": suggested, "why": why,
                          "decision": old.get("decision"), "note": old.get("note", "")})
    known = {i["id"] for i in items}
    for rid, old in previous.items():                    # rows the script no longer knows (a hand added row): keep them
        if rid not in known:
            items.append(old)
    return {"sheet": kind, "choices": choices, "items": items}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, groups, choices in (("visibility", VISIBILITY, VISIBILITY_CHOICES), ("reversibility", REVERSIBILITY, REVERSIBILITY_CHOICES)):
        path = OUT / f"{name}.json"
        previous = {}
        if path.exists():
            previous = {i["id"]: i for i in json.loads(path.read_text(encoding="utf-8")).get("items", [])}
        sheet = build(name, groups, choices, previous)
        path.write_text(json.dumps(sheet, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
        done = sum(1 for i in sheet["items"] if i["decision"])
        print(f"{path.relative_to(ROOT)}: {len(sheet['items'])} rows, {done} decided")
    covered = " ".join(i[0] + " " + i[1] for rows in VISIBILITY.values() for i in rows).replace("_", "").replace(".", "")
    grouped = {"GameState": {"version": "game.config", "phase": "game.counters", "active_player": "game.counters", "break_position": "game.counters", "turn": "game.counters",
                             "endgame_discard_done": "game.endgame_discard", "prompt": "game.pending", "end_triggered_by": "game.end_state", "final_turns": "game.end_state"},
               "PlayerState": {"seat": "player.counters", "map_id": "player.counters", "money": "player.counters", "x_tokens": "player.counters", "appeal": "player.counters",
                               "conservation": "player.counters", "reputation": "player.counters"}}      # fields that share a row with others
    missing = [f"{cls}.{f}" for cls, fields in state_fields().items() for f in fields
               if f.replace("_", "") not in covered and f not in grouped[cls]]
    if missing:
        print("state fields the visibility sheet does not mention (check them):", ", ".join(missing))
    actions = {i[0].split(":", 1)[1] for rows in REVERSIBILITY.values() for i in rows if i[0].startswith("action:")}
    new = [a for a in action_kinds() if a not in actions]
    if new:
        print("action kinds the reversibility sheet does not list:", ", ".join(new))


if __name__ == "__main__":
    main()
