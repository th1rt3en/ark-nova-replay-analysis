"""What the engine says the active player can do at a replay step: the decision (prompt) and a summary of `legal_actions`.

The viewer builds the bar at the top of the page from this (instead of guessing from the log-built state). Only a summary is sent: the kinds
of action with their counts, and for the choice of an action card the cards and the X tokens that can be spent on each.
"""
from ark_nova.engine.game import legal_actions
from ark_nova.engine.state import GameState, Phase

FREE = {"use_token", "harbor_sell"}            # free actions of the notepad / zoo map: possible at any time, not the decision of the prompt


def step_options(state: GameState) -> dict | None:
    pr = state.prompt
    if pr is None or state.phase in (Phase.SETUP, Phase.SCORING, Phase.OVER):
        return None
    try:
        acts = [a for a in legal_actions(state) if a.kind not in FREE]
    except NotImplementedError:
        return None
    kinds: dict[str, int] = {}
    for a in acts:
        kinds[a.kind] = kinds.get(a.kind, 0) + 1
    out: dict = {"prompt": pr.kind, "seat": pr.player, "kinds": kinds}
    pieces = []
    for a in acts:                                                      # the building pieces that can be placed (the additional kiosk / pavilion of a Build variant first)
        if a.kind != "place_building":
            continue
        piece = {"type": a.args["type"], **({"extra": True} if a.args.get("extra") else {})}
        if piece not in pieces:
            pieces.append(piece)
    if pieces:
        out["pieces"] = sorted(pieces, key=lambda q: not q.get("extra"))
        if pr.kind == "build_place":
            out["build"] = {"variant": pr.args.get("variant", 0), "level": pr.args.get("level", 1)}
    if pr.kind == "sponsors_play":                                      # the Sponsors action: the sponsors that can be played (the other cards of the hand are greyed out)
        sa = pr.args
        out["sponsors"] = {"hand": [a.args["card"] for a in acts if a.kind == "play_sponsor" and not a.args.get("from_display")],
                           "display": [a.args["card"] for a in acts if a.kind == "play_sponsor" and a.args.get("from_display")],
                           "strength": sa.get("strength"), "gain": sa.get("strength", 0) * (2 if sa.get("level", 1) >= 2 else 1),
                           "level": sa.get("level", 1), "played": bool(sa.get("played")), "can_break": any(a.kind == "sponsor_break" for a in acts)}
    if pr.kind == "association_tasks":                                  # the tasks of the Association action that can be done (one entry per kind of task)
        tasks: dict[str, int] = {}
        for a in acts:
            if a.kind == "association_task":
                tasks[a.args["task"]] = tasks.get(a.args["task"], 0) + 1
        out["association"] = {"tasks": tasks, "strength": pr.args.get("strength"), "left": pr.args.get("left")}
    if pr.kind == "cards_discard":                                      # discarding: the bar only says how many (the player picks the cards in the hand)
        out["discard"] = {"count": pr.args.get("count", 1), "what": "card"}
    elif pr.kind == "effects":
        mine = [e for e in pr.args.get("pending", []) if e.get("player", pr.player) == pr.player]
        d = next((e for e in mine if e.get("kind") in ("break_discard", "endgame_discard")), None)
        if d is not None:
            out["discard"] = {"count": d.get("n", 1), "what": "card" if d["kind"] == "break_discard" else "endgame card"}
    takes = [a for a in acts if a.kind == "take_cards"]
    if takes:                                                           # taking cards: the deck and/or the display cards the player may take (the others are greyed out)
        take: dict = {"deck": max([a.args.get("count", 1) for a in takes if a.args["mode"] == "deck"], default=0),
                      "range": [a.args["card"] for a in takes if a.args["mode"] == "range"],
                      "snap": [a.args["card"] for a in takes if a.args["mode"] == "snap"]}
        if pr.kind == "cards_take":
            take.update(remaining=pr.args.get("remaining"), snapping=bool(pr.args.get("snap")), taken=pr.args.get("taken", 0), discard=pr.args.get("discard", 0),
                        snaps_left=pr.args.get("snaps_left", 1))
        elif pr.kind == "effects":
            e = next((e for e in pr.args.get("pending", []) if e.get("kind") == "take" and e.get("player", pr.player) == pr.player
                      and bool(e.get("snap")) == bool(take["snap"])), None)
            if e is not None:
                take.update(source=e.get("source"), is_snap=bool(e.get("snap")), small=bool(e.get("small")), range_only=bool(e.get("range_only")))
        out["take"] = take
    if pr.kind == "choose_action_card":
        cards: dict[str, list[int]] = {}
        for a in acts:
            if a.kind == "choose_action_card":
                cards.setdefault(a.args["type"], []).append(a.args.get("spend", 0))
        out["cards"] = {t: sorted(set(v)) for t, v in cards.items()}
        out["skip"] = sorted({a.args["type"] for a in acts if a.kind == "skip_action"})
        if pr.args.get("only"):
            out["only"] = list(pr.args["only"])
        if pr.args.get("hypnosis"):
            out["hypnosis"] = True
    elif pr.kind == "effects":
        pending = pr.args.get("pending", [])
        out["pending"] = [e.get("kind") for e in pending][:12]
        out["effects"] = [{k: e[k] for k in ("kind", "res", "n", "source", "optional", "type") if k in e and isinstance(e[k], (str, int, bool))}
                          for e in pending if e.get("player", pr.player) == pr.player][:12]               # what the player can resolve, in any order
    return out
