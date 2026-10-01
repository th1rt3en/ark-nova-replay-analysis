"""Turn a parsed log into an engine `GameConfig` + `SeedSpec` (+ the setup facts)."""
from typing import Optional

from ark_nova import data
from ark_nova.engine.board import board
from ark_nova.engine.build_action import SIZES, valid_placements
from ark_nova.engine.game import deck_cards
from ark_nova.engine.state import ActionCardChoice, GameConfig, SeedSpec
from ark_nova.parser.conservation import extract_conservation_bonuses
from ark_nova.parser.deck import extract_exits, known_order
from ark_nova.parser.model import ParsedLog
from ark_nova.parser.setup import SetupInfo, extract_setup


def infer_maps(parsed: ParsedLog, seats: list[str]) -> list[Optional[str]]:
    """The map of each player (BigQuery has it in production). Fingerprint: BGA's list of size-1 placements before a player's
    first building equals the border cells of exactly one map (or the centre cells of map 13). '1' when it cannot be told."""
    maps = {}
    for m in parsed.moves:                       # setupPlayer names the map in a few logs
        for e in m.events:
            if e.type == "setupPlayer" and isinstance(e.args, dict):
                maps[str(e.args["player_id"])] = str(e.args["mapId"])
    built = set()
    candidates = [m["id"] for m in data.maps() if m["geometry"]]
    for mv in parsed.moves:
        for e in mv.events:
            if e.type == "buyBuilding" and isinstance(e.args, dict):
                built.add(str(e.args["player_id"]))
        for chk in mv.checks:
            pid = chk.get("player")
            if "build" not in chk or pid != chk["active"] or pid in maps or pid in built:
                continue
            opts = {t: sorted(map(tuple, v)) for t, v in chk["build"]["options"].items() if t in SIZES and v}
            if not opts:
                continue
            lvl = chk["build"]["lvl"] or 1
            match = [c for c in candidates if all(sorted(valid_placements(board(c), [], t, lvl)) == v for t, v in opts.items())]
            if len(match) == 1:
                maps[pid] = match[0]
    return [maps.get(pid) for pid in seats]


def infer_base_projects(parsed: ParsedLog, marine_worlds: bool) -> list[str]:
    """The 3 base conservation projects (the user enters them in production): those the log shows as supported in slot base_0..2 or by a
    player token, the rest filled with the first unused base projects."""
    deck = deck_cards("base_project", marine_worlds)
    slots: list = [None, None, None]
    seen: list = []
    fetched: set = set()                   # base projects taken with Assertion / Dominance were not in play
    for m in parsed.moves:
        for e in m.events:
            if e.type == "pDrawCards" and isinstance(e.args, dict) and ("with Assertion" in e.log or "with Dominance" in e.log):
                fetched |= {data.parse_bga_card_id(c["id"])[0] for c in e.args.get("cards", [])}
            if e.type != "slideMeeples" or not isinstance(e.args, dict):
                continue
            card = e.args.get("card")
            if isinstance(card, dict) and str(card.get("location", "")).startswith("base_"):
                key = data.parse_bga_card_id(card["id"])[0]
                slots[int(card["location"][5:])] = key
            for mp in e.args.get("meeples") or []:
                head = str(mp["location"]).split("_")[0]
                if mp["type"] == "token" and head[:1] == "P" and head[1:4].isdigit() and head[:4] in deck and head[:4] not in seen and head[:4] not in fetched:
                    seen.append(head[:4])
    for key in seen:
        if key not in slots and None in slots:
            slots[slots.index(None)] = key
    for key in deck:
        if None in slots and key not in slots and key not in fetched:
            slots[slots.index(None)] = key
    return slots


HOSTILE = {"Venom", "Constriction", "Pilfering 1", "Pilfering 2", "Hypnosis"}


def infer_peaceful(parsed: ParsedLog) -> bool:
    """The peaceful variant (hostile effects replaced): an animal with a hostile ability was played and no hostile event ever shows in the log."""
    played = hostile = 0
    for m in parsed.moves:
        for e in m.events:
            a = e.args if isinstance(e.args, dict) else {}
            if e.type in ("pilfering", "hypnosis") or (e.type == "addMeeples" and ("Venom effect" in e.log or "Constriction effect" in e.log)):
                hostile += 1
            if e.type == "buyAnimal" and isinstance(a.get("card"), dict):
                card = data.cards_by_key()[data.parse_bga_card_id(a["card"]["id"])[0]]
                if any(ab["keyword"]["name"] in HOSTILE for ab in card.get("abilities") or []):
                    played += 1
    return bool(played) and not hostile


def game_from_log(parsed: ParsedLog, maps: Optional[list[str]] = None, base_projects: Optional[list[str]] = None,
                  marine_worlds: Optional[bool] = None, from_seq: int = 0) -> tuple[SetupInfo, GameConfig, SeedSpec]:
    """`maps`, `base_projects` and `marine_worlds` come from the BigQuery index / the user in production. When they are not
    given (tests) they are inferred: Marine Worlds if any known card is a Marine Worlds card, Map 14 if the log shows its
    start-of-game sponsor search, map 1 otherwise, and the first 3 base projects."""
    setup = extract_setup(parsed)
    exits = extract_exits(parsed)
    main, endgame = known_order(exits, "main", from_seq), known_order(exits, "endgame", from_seq)
    if marine_worlds is None:       # Marine Worlds cards in the log, or BGA offering aquariums (a Marine Worlds building) to build
        marine_worlds = any(data.cards_by_key()[k]["source"] == "marine_worlds" for k in main + endgame) or any(
            "build" in c and any("aquarium" in t and v for t, v in c["build"]["options"].items()) for m in parsed.moves for c in m.checks)
    if maps is None:
        maps = infer_maps(parsed, setup.seats)
        for i, pid in enumerate(setup.seats):        # Map 14 is also recognisable from its start-of-game sponsor search
            if any("Map 14" in str(e.args.get("source", "")) for m in parsed.moves[:12] for e in m.events
                   if e.type == "pDrawCards" and e.player == pid and isinstance(e.args, dict)):
                maps[i] = "14"
    known = [m is not None for m in maps]
    maps = [m or "1" for m in maps]
    if base_projects is None:
        base_projects = infer_base_projects(parsed, marine_worlds)
    cb = extract_conservation_bonuses(parsed)
    options = {th: cb.random.get(th, []) for th in ("5", "8")}
    cfg = GameConfig(marine_worlds=marine_worlds, player_ids=setup.seats, maps=maps, base_projects=base_projects,
                     action_cards=[[ActionCardChoice(t, v) for t, v in setup.action_cards[p]] for p in setup.seats],
                     conservation_bonuses=options, map_known=known, peaceful=infer_peaceful(parsed))
    return setup, cfg, SeedSpec(tail_seed=1, main_order=main, endgame_order=endgame)
