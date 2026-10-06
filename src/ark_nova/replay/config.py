"""Turn a parsed log into an engine `GameConfig` + `SeedSpec` (+ the setup facts)."""
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

from ark_nova import data
from ark_nova.data import map_quirks
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


def infer_base_projects(parsed: ParsedLog, marine_worlds: bool, fill: bool = True, info: dict = None) -> list[str]:
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
            if e.type == "gameStateChangePrivateArg" and isinstance(e.args, dict) and isinstance(e.args.get("slots"), dict):
                opts = (e.args["slots"].get("5") or {}).get("options")      # BGA's own list of the projects the player can support: a base project in it is in play
                for k in (opts if isinstance(opts, dict) else {}):
                    if k[:4] in deck and k[:4] not in seen and k[:4] not in fetched:
                        seen.append(k[:4])
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
    if info is not None:                   # (the caller places the projects that were seen but whose position is unknown)
        info["seen"] = [k for k in seen if k not in slots]
        info["fetched"] = fetched
        info["explicit"] = list(slots)
        return slots
    for key in seen:
        if key not in slots and None in slots:
            slots[slots.index(None)] = key
    for key in deck:
        if fill and None in slots and key not in slots and key not in fetched:
            slots[slots.index(None)] = key
    return slots


def refine_base_projects(parsed: ParsedLog, setup, cfg, seed) -> list[str]:
    """The base projects whose position the log never shows (only BGA's lists offered them, or nobody supported them) are a guess; assign the
    candidates to the unknown positions so that the engine's list of the supportable slots (which depends on the position: the slot of the card's
    own position is covered) agrees with BGA's own list at every Association action. Projects BGA offered are in play, so they must be placed."""
    import copy as _copy
    import itertools
    from ark_nova.replay import differential as df
    from ark_nova.replay.actions import turn_events
    from ark_nova.replay.builder import build_replay
    info: dict = {}
    explicit = infer_base_projects(parsed, cfg.marine_worlds, info=info)
    unknown = [i for i, k in enumerate(explicit) if k is None]
    filled = infer_base_projects(parsed, cfg.marine_worlds)
    if not unknown:
        return filled
    required = info["seen"]
    pool = required + [k for k in deck_cards("base_project", cfg.marine_worlds) if k not in explicit and k not in required and k not in info["fetched"]]
    rep = build_replay(parsed, setup, cfg, seed)
    turns = turn_events(parsed)
    oracle = []
    for k, evs in enumerate(turns):
        if k >= len(rep.turn_snapshots):
            break
        ch = next((e for e in evs if e.type == "chooseActionCard"), None)
        if ch is None or "association" not in str(ch.args.get("actionCard", {}).get("type", "")).lower():
            continue
        actor = str(ch.args["player_id"])
        theirs = df._bga_project_options(evs, actor)
        if theirs is not None:
            oracle.append((k, setup.seats.index(actor), theirs))
    cost: dict = {}

    def bad(pos: int, cand: str) -> int:
        if (pos, cand) not in cost:
            n = 0
            for k, seat, theirs in oracle:
                st = _copy.deepcopy(rep.turn_snapshots[k])
                spare = iter(k for k in pool if k != cand and k not in explicit)          # (the other unknown positions only need some other project)
                st.base_projects = [cand if i == pos else (x or next(spare)) for i, x in enumerate(explicit)]
                try:
                    n += df._engine_project_options(st, seat).get(cand, []) != theirs.get(cand, [])
                except Exception:
                    n += 1
            cost[(pos, cand)] = n
        return cost[(pos, cand)]

    best = None
    for combo in itertools.permutations(pool, len(unknown)):
        if any(r not in combo for r in required):
            continue
        total = sum(bad(pos, c) for pos, c in zip(unknown, combo))
        if best is None or total < best[0]:
            best = (total, combo)
    if best is None:
        return filled
    result = list(explicit)
    for pos, c in zip(unknown, best[1]):
        result[pos] = c
    return result


HOSTILE = {"Venom", "Constriction", "Pilfering 1", "Pilfering 2", "Hypnosis"}


def infer_peaceful(parsed: ParsedLog) -> bool:
    """The peaceful variant (hostile effects replaced): an animal with a hostile ability was played and no hostile event ever shows in the log."""
    played = hostile = peaceful = 0
    names: set = set()
    for m in parsed.moves:
        for e in m.events:
            a = e.args if isinstance(e.args, dict) else {}
            if e.type == "chooseActionCard":
                names = set()                              # (the effects of a turn are logged in several moves)
            if e.type in ("pilfering", "pilferingMoney", "pilferingCard", "hypnosis") or (e.type == "addMeeples" and ("Venom effect" in e.log or "Constriction effect" in e.log)):
                hostile += 1
            if e.type == "buyAnimal" and isinstance(a.get("card"), dict):
                card = data.cards_by_key()[data.parse_bga_card_id(a["card"]["id"])[0]]
                own = {ab["keyword"]["name"] for ab in card.get("abilities") or []} | {ab["keyword"]["name"] for ab in card.get("reefDwellerEffect") or []}
                if own & HOSTILE:
                    played += 1
                    names |= own
            elif names:                                    # what BGA logs instead of a hostile ability
                b = a.get("bonuses") or {}
                if (e.type == "getBonuses" and "Venom" in names and "Inventive" not in names and a.get("source") == "Inventive" and set(b) == {"xtoken"})                         or (e.type == "getBonuses" and "Pilfering 1" in names and set(b) == {"money"} and b["money"] == 3 and not a.get("card_id") and not a.get("source"))                         or (e.type == "actionCardCleanup" and "Constriction" in names and "Clever effect" in e.log)                         or (e.type == "pDrawCards" and "Pilfering 2" in names and "sprint" in e.log)                         or (e.type == "markCard" and "Hypnosis" in names):
                    peaceful += 1
    return bool(played) and not hostile and bool(peaceful)


@lru_cache(maxsize=None)
def _sample_maps() -> dict:
    """data_manual/sample_maps.json: the index's maps of the tables in log_examples/ (scripts/fetch_sample_maps.py); offline stand-in for BigQuery."""
    path = Path(__file__).resolve().parents[3] / "data_manual" / "sample_maps.json"
    return json.loads(path.read_text()) if path.exists() else {}


def game_from_log(parsed: ParsedLog, maps: Optional[list[str]] = None, base_projects: Optional[list[str]] = None,
                  marine_worlds: Optional[bool] = None, from_seq: int = 0) -> tuple[SetupInfo, GameConfig, SeedSpec]:
    """`maps`, `base_projects` and `marine_worlds` come from the BigQuery index / the user in production. When they are not
    given (tests) they are inferred: Marine Worlds if any known card is a Marine Worlds card, Map 14 if the log shows its
    start-of-game sponsor search, map 1 otherwise, and the first 3 base projects."""
    setup = extract_setup(parsed)
    sample = _sample_maps().get(str(parsed.table_id))
    if sample and maps is None and all(pid in sample["maps"] for pid in setup.seats):
        mapped = [sample["maps"][pid] for pid in setup.seats]
        if all(data.map_by_id(m)["geometry"] for m in mapped):         # (maps without a geometry file cannot be played: infer as before)
            maps = mapped
        if marine_worlds is None:
            marine_worlds = sample["marine_worlds"]
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
    maps = [map_quirks.played_map_id(m or "1", parsed.table_id) for m in maps]
    infer_bp = base_projects is None
    if base_projects is None:
        base_projects = infer_base_projects(parsed, marine_worlds)
    cb = extract_conservation_bonuses(parsed)
    options = {th: cb.random.get(th, []) for th in ("5", "8")}
    if marine_worlds and cb.random.get("99"):
        options["99"] = cb.random["99"][:1]                  # the bonus on 16 reputation (Marine Worlds)
    cfg = GameConfig(marine_worlds=marine_worlds, player_ids=setup.seats, maps=maps, base_projects=base_projects,
                     action_cards=[[ActionCardChoice(t, v) for t, v in setup.action_cards[p]] for p in setup.seats],
                     conservation_bonuses=options, map_known=known, peaceful=infer_peaceful(parsed), table_id=int(parsed.table_id or 0))
    seed = SeedSpec(tail_seed=1, main_order=main, endgame_order=endgame)
    if infer_bp and cfg.marine_worlds is not None:
        cfg.base_projects = refine_base_projects(parsed, setup, cfg, seed)
    return setup, cfg, seed
