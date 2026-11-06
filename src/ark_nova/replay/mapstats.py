"""Map-specific statistics of the "Game results" table, counted from the raw BGA log (the event signatures are those of the history specs of the
statistics pipeline: ignore, pouch, sunbathing / Commercial Harbor, marketing, shark attack, T1, quadrant triggers).

`map_stats(raw_log, player_ids, maps, steps)` returns one dict per seat: {"map": id, <key>: number, ...}. Only the keys of the seat's own map are present.
The web table (`web/js/results.js`, `MAP_ROWS`) names and places the keys. Everything is counted once per logical event (event uid), on the public table
channel where a public copy exists, and the private channels only for what is private (the statuses of the cards in hand, the T1 discard).

Keys by map (base ids, "a" variants share their map's keys):
  1  tower_appeal, tower_marketed, tower_marketed_points      the Observation Tower: appeal, sponsors marketed with the map bonus, what they scored in the whole game
  4  harbor_money                                              Commercial Harbor: money of the sales
  5  income_map                                                Park Restaurant: money of the "map income"
  6  ignore_animals, clever_map                                Research Institute: animals played with it, Clever from the map's bonus space
  7  income_map, pouched                                       Ice Cream Parlors: income, cards pouched ("mapPouched")
  9  cubes                                                     continent markers removed
  11 income_map                                                stored cards income
  13 quad_reputation, quad_appeal, quad_money, quad_hunters    Drawing Board quadrant triggers (instant and income)
  14 shark_points, person_free                                 Lagoon: appeal of the Shark Attacks of a placement bonus / the Archaeologist, person sponsors played free
  T1 t1_discards                                               cards discarded for the T1 effect
"""
from __future__ import annotations

from collections import defaultdict

QUADRANT = ("money", "appeal", "reputation", "hunters")      # mapStatus / MAP_13_INCOME index 0..3
QUARTER_PAYS = {"money": 3, "appeal": 2, "reputation": 1}
POINT_KEYS = ("appeal", "appeal_initial", "appeal_final", "appeal_income", "appeal_enlargement", "conservation")
RESEARCH_CELL = (0, 11)


def _base_map(map_id) -> str:
    """'6a-legacy' -> '6', '1a' -> '1'; 'T1' stays."""
    m = str(map_id)
    for suffix in ("-legacy", "_legacy"):
        if m.endswith(suffix):
            m = m[: -len(suffix)]
    return m.rstrip("a")


def _events(raw_log: dict):
    """(move_id, channel, event, args, order) in log order, a resent event (same uid) only once. `order` counts every event of every channel, the numbering of
    `sponsor_source_hints` and of the parser's `event.order`."""
    data = raw_log.get("data", raw_log)
    seen: set = set()
    order = 0
    for packet in data.get("logs") or []:
        channel = str(packet.get("channel") or "")
        move = packet.get("move_id")
        for event in packet.get("data") or []:
            order += 1
            args = event.get("args") if isinstance(event.get("args"), dict) else {}
            uid = event.get("uid")
            if uid:
                key = (channel, uid)
                if key in seen:
                    continue
                seen.add(key)
            yield move, channel, event, args, order


def _research_moves(steps: list, seat: int, map_id: str):
    """The move id from which the Research Institute's hex (0, 11) is covered by a building of the seat (None: never)."""
    if map_id != "6":
        return None
    for step in steps:
        st = step.get("state") or {}
        players = st.get("players") or []
        if seat >= len(players):
            continue
        for b in players[seat].get("buildings") or []:
            if any(tuple(c) == RESEARCH_CELL for c in b.get("cells") or []):
                return int(step.get("move_id") or 0)
    return None


def _large_played(before: dict | None, after: dict | None) -> bool:
    """A played animal is large when only the large counter grew, by one."""
    if not before or not after:
        return False
    d = {k: (after.get(k) or 0) - (before.get(k) or 0) for k in ("small", "medium", "large")}
    return d["large"] == 1 and d["medium"] == 0 and d["small"] == 0


def sponsor_points(stat: dict | None) -> int:
    return sum(int(v) for k, v in (stat or {}).items() if k in POINT_KEYS and isinstance(v, (int, float)))


def map_stats(raw_log: dict, player_ids: list, maps: list, steps: list | None = None, sponsor_stats: dict | None = None) -> list:
    return _scan(raw_log, player_ids, maps, steps, sponsor_stats)[0]


def waza_large_events(raw_log: dict, player_ids: list, maps: list) -> list:
    """[(event order, seat)] of every use of the WAZA Large Animals Program: a large animal played with it while the animal needed an ignored condition (a played ignore token is never one)."""
    return _scan(raw_log, player_ids, maps, None, None)[1]


def _scan(raw_log: dict, player_ids: list, maps: list, steps: list | None, sponsor_stats: dict | None):
    pids = [str(p) for p in player_ids]
    base = [_base_map(m) for m in maps]            # (1a -> 1: a map and its variant share the statistics; '6a-legacy' is map 6a as BGA played it earlier, the same statistics)
    steps = steps or []
    seats = range(len(pids))
    out = [{"map": str(maps[i])} for i in seats]
    seat_of = {p: i for i, p in enumerate(pids)}

    def seat(a, key="player_id"):
        return seat_of.get(str(a.get(key)))

    # state of the scan
    status = [dict() for _ in seats]                       # latest private statuses of the cards of the seat: card id -> conditions.ignored
    token = [False for _ in seats]                         # an ignore token was just discarded
    camouflage = [False for _ in seats]
    waza_large = [False for _ in seats]
    sizes = [None for _ in seats]
    research_from = [_research_moves(steps, i, base[i]) for i in seats]
    pending_market = [None for _ in seats]                 # id=82 source of the seat's next sponsor
    pending_clever = [None for _ in seats]                 # id=65 source of the seat's next Clever
    pending_person = [False for _ in seats]                # id=125 "map bonus space": the next sponsor is a person played for free
    pending_harbor = [False for _ in seats]                # id=84: the next sale is the Commercial Harbor's
    shark_source = [None for _ in seats]                   # source of the seat's Shark Attack selector
    arch_shark = [False for _ in seats]                    # the Archaeologist's Shark Attack was taken
    map_status = [[False] * 4 for _ in seats]
    quad_seen: set = set()                                 # (seat, move, quadrant): instant triggers seen once
    marketed = [[] for _ in seats]
    totals = [defaultdict(int) for _ in seats]
    waza_events: list = []

    def put(i, key, n=1):
        totals[i][key] += n

    for move, channel, e, a, order in _events(raw_log):
        ty = e.get("type")
        table = channel.startswith("/table/")
        # ---- private statuses: pre-play conditions.ignored of each card (from the seat's own channel)
        if channel.startswith("/player/"):
            owner = seat_of.get(channel[len("/player/p"):])
            if ty == "gameStateChange" and owner is not None:
                inner = a.get("args") if isinstance(a.get("args"), dict) else {}
                private = inner.get("_private") if isinstance(inner.get("_private"), dict) else {}
                for card_id, st in (private.get("statuses") or {}).items():
                    status[owner][card_id] = ((st or {}).get("conditions") or {}).get("ignored") or 0
            continue
        if not table:
            continue
        s = seat(a)
        # ---- state changes of the table channel: the pending causes
        if ty == "gameStateChange":
            actor = seat(a, "active_player")
            gid = a.get("id")
            inner = a.get("args") if isinstance(a.get("args"), dict) else {}
            if actor is not None:
                if gid == 82:
                    pending_market[actor] = inner.get("source") or "?"
                elif gid == 65:
                    pending_clever[actor] = inner.get("source") or "?"
                elif gid == 125 and inner.get("source") == "map bonus space":
                    pending_person[actor] = True
                elif gid == 84:
                    pending_harbor[actor] = True
                elif gid == 111:
                    src = inner.get("source")
                    shark_source[actor] = src if src else ("Archaeologist" if arch_shark[actor] else None)
                    arch_shark[actor] = False
                elif gid == 20:                                       # a new turn of the seat: stale causes expire
                    pending_harbor[actor] = False
                    pending_person[actor] = False
                    pending_market[actor] = None
                    pending_clever[actor] = None
            continue
        infos = a.get("infos") if isinstance(a.get("infos"), dict) else {}
        # ---- size and Drawing Board snapshots (any event)
        for pid, snap in (infos.get("mapStatus") or {}).items():
            i = seat_of.get(str(pid))
            if i is None or not isinstance(snap, list):
                continue
            for q, filled in enumerate(snap[:4]):
                if filled and not map_status[i][q] and base[i] == "13":
                    if (i, move, q) not in quad_seen:
                        quad_seen.add((i, move, q))
                        put(i, "quad_" + QUADRANT[q])
                map_status[i][q] = bool(filled)
        if s is None:
            if ty == "discardTokens" and a.get("continent") is None:
                pass
            continue
        # ---- events of a seat
        if ty == "getBonuses":
            src = a.get("source") or ""
            bonuses = a.get("bonuses") if isinstance(a.get("bonuses"), dict) else {}
            if base[s] in ("1",) and src.startswith("Map ") and src.endswith(" bonus"):
                put(s, "tower_appeal", int(bonuses.get("appeal") or 0))
            if src == "map income" and base[s] in ("5", "7", "11"):
                put(s, "income_map", int(bonuses.get("money") or 0))
            if src == "Map 13 quarter bonus" and base[s] == "13":
                for q, name in enumerate(QUADRANT[:3]):
                    if bonuses.get(name if name != "reputation" else "reputation"):
                        if (s, move, q) not in quad_seen:
                            quad_seen.add((s, move, q))
                            put(s, "quad_" + name)
            if src == "Shark Attack" and base[s] == "14":
                if shark_source[s] in ("placement bonus", "Archaeologist"):
                    put(s, "shark_points", int(bonuses.get("appeal") or 0))
        elif ty == "takeBonus":
            bd = (a.get("bonus_desc") or {}).get("args") or {}
            btype = bd.get("bonus_type")
            if btype == "MAP_13_INCOME" and base[s] == "13":
                put(s, "quad_" + QUADRANT[int(bd.get("bonus_n") or 0) % 4])
            if btype == "SharkAttack" and (a.get("source") == "Archaeologist" or "S221" in str(a.get("sourceId") or a.get("source") or "")):
                arch_shark[s] = True
        elif ty == "discardCards":
            log = e.get("log") or ""
            if pending_harbor[s] and "sells" in log and base[s] == "4":
                put(s, "harbor_money", int((a.get("bonuses") or {}).get("money") or 0))
                pending_harbor[s] = False
            elif "sells" in log:
                pending_harbor[s] = False
            if "Map T1 effect" in log and base[s] == "T1":
                put(s, "t1_discards", int(a.get("n") or 1))
            if a.get("pouch") == "mapPouched" and base[s] == "7":
                put(s, "pouched", int(a.get("n") or 0))
        elif ty == "discardTokens":
            if a.get("continent") and base[s] == "9":
                put(s, "cubes")
            if any((m or {}).get("type") == "bonus-ignore-conditions" for m in a.get("meeples") or []):
                token[s] = True
        elif ty == "playSponsor":
            card_id = str(a.get("card_id") or (a.get("card") or {}).get("id") or "")
            if card_id == "S263_WazaLargeAnimalProgram":
                waza_large[s] = True
            if pending_market[s] == "map bonus space" and base[s] == "1":
                put(s, "tower_marketed")
                marketed[s].append(card_id[:4])
            pending_market[s] = None
            if pending_person[s] and base[s] == "14":
                put(s, "person_free")
            pending_person[s] = False
        elif ty == "actionCardCleanup":
            if "(Clever effect)" in (e.get("log") or ""):
                if pending_clever[s] == "map bonus space" and base[s] == "6":
                    put(s, "clever_map")
                pending_clever[s] = None
            elif "finishing action" in (e.get("log") or ""):
                token[s] = False
                camouflage[s] = False
        elif ty == "buyAnimal":
            card_id = str(a.get("card_id") or "")
            req = status[s].get(card_id) or 0
            snap = (infos.get("sizes") or {}).get(str(pids[s]))
            large = _large_played(sizes[s], snap) if snap is not None else False
            if snap is not None:
                sizes[s] = dict(snap)
            if req > 0 and not token[s]:
                if base[s] == "6" and research_from[s] is not None and int(move or 0) > research_from[s]:
                    put(s, "ignore_animals")
                if waza_large[s] and large:
                    put(s, "waza_large_used")
                    waza_events.append((order, s))
            token[s] = False
    for i in seats:
        d = out[i]
        d.update({k: v for k, v in totals[i].items() if v and k != "waza_large_used"})
        wanted = {"1": ("tower_appeal", "tower_marketed"), "4": ("harbor_money",), "5": ("income_map",), "6": ("ignore_animals", "clever_map"),
                  "7": ("income_map", "pouched"), "9": ("cubes",), "11": ("income_map",),
                  "13": ("quad_money", "quad_appeal", "quad_reputation", "quad_hunters"), "14": ("shark_points", "person_free"), "T1": ("t1_discards",)}.get(base[i], ())
        for k in wanted:
            d.setdefault(k, 0)
        if base[i] == "1":
            d["tower_marketed_points"] = sum(sponsor_points((sponsor_stats or {}).get(key)) for key in marketed[i])
    return out, waza_events
