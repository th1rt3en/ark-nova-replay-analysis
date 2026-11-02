"""Normal BGA turns, independent of state-20 action-selection segments."""
from bisect import bisect_right
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from ark_nova.parser.breaks import BREAK_EVENTS, accepted_break_orders


@dataclass
class NormalTurn:
    index: int
    player: str
    number: int
    start_order: int
    start_move: int | None
    end_order: int
    end_move: int | None
    close_order: int | None = None


@dataclass
class TurnTimeline:
    turns: list[NormalTurn] = field(default_factory=list)
    transitions: list[dict] = field(default_factory=list)
    diagnostics: list[str] = field(default_factory=list)
    canonical_orders: dict[int, int] = field(default_factory=dict)
    _orders: list[int] = field(default_factory=list)
    last_order: int = 0

    def context(self, order: int) -> dict:
        i = bisect_right(self._orders, order) - 1
        if i < 0:
            return {"phase": "setup", "index": None, "player": None, "number": None, "display": 0, "counts": {}}
        return self.transitions[i]["context"]

    def order_of(self, event) -> int:
        return self.canonical_orders.get(event.order, event.order)


def extract_turns(packets: list[dict], break_orders: frozenset[int] | None = None) -> TurnTimeline:
    """Read parse_log's packet/event order before lifecycle noise is dropped.

    Public backend ordering wins over earlier private copies. Private-only
    lifecycle evidence is retained with a diagnostic. UID alone, player alone
    and state ID alone are never dedupe keys. Undo checkpoints are not invented
    rollback commands: this consumes the surviving events present in the log.
    """
    out = TurnTimeline()
    if break_orders is None:
        break_orders = accepted_break_orders(packets)
    stream, private = [], []
    public_states, twins = set(), defaultdict(list)
    current_move, order = None, 0
    for packet in packets:
        if packet["move_id"] is not None:
            current_move = int(packet["move_id"])
        public = str(packet.get("channel", "")).startswith("/table/")
        for pos, event in enumerate(packet.get("data", [])):
            order += 1
            args = event.get("args")
            args = args if isinstance(args, dict) else {}
            ty = event["type"]
            sid = int(args["id"]) if ty == "gameStateChange" and str(args.get("id", "")).isdigit() else None
            player = str(args.get("active_player")) if sid is not None else None
            item = (order, current_move, event, args, sid, player, packet, pos)
            if public:
                stream.append(item)
                if sid is not None:
                    public_states.add((current_move, sid, player))
                twins[(current_move, ty, str(args.get("player_id")))].append(order)
            else:
                private.append(item)
    pair_types = {"pDrawCards": "drawCards", "pDiscardCards": "discardCards", "pStoreCard": "storeCard", "pUnstoreCard": "unstoreCard"}
    used = Counter()
    private_states = set()
    for item in private:
        o, move, event, args, sid, player, packet, _ = item
        state_key = (move, sid, player)
        if event["type"] in BREAK_EVENTS and o in break_orders:
            stream.append(item)
            out.diagnostics.append(f"private-only {event['type']} at move {move}")
        if sid in (7, 10, 98, 99) and state_key not in public_states and state_key not in private_states:
            private_states.add(state_key)
            stream.append(item)
            out.diagnostics.append(f"private-only lifecycle state {sid} at move {move}")
        if event["type"] in pair_types:
            owner = str(args.get("player_id", str(packet.get("channel", "")).removeprefix("/player/p")))
            key = (move, pair_types[event["type"]], owner)
            matches = twins.get(key, [])
            if used[key] < len(matches):
                out.canonical_orders[o] = matches[used[key]]
                used[key] += 1
    out.last_order = order
    stream.sort(key=lambda item: item[0])
    phase, opened, display = "setup", None, 0
    counts, seen, start_keys = Counter(), set(), set()
    break_entries = set()

    def transition(o, move, new_phase, reason):
        nonlocal phase, opened
        previous = opened
        if opened is not None:
            opened.close_order = o
            opened = None
        phase = new_phase
        ctx = {"phase": phase, "index": None, "player": None, "number": None, "display": display, "counts": dict(counts)}
        out.transitions.append({"order": o, "move_id": move, "reason": reason, "closed": previous.index if previous else None, "context": ctx})
        return ctx

    for o, move, event, args, sid, player, packet, pos in stream:
        ty = event["type"]
        if ty in BREAK_EVENTS and o not in break_orders:
            continue
        identity = (move, ty, sid, player, str(event.get("uid", "")), str(packet.get("packet_id")), pos)
        logical = (move, ty, sid, player, str(event.get("uid"))) if event.get("uid") else identity
        if logical in seen:
            continue
        seen.add(logical)
        if phase == "terminal":
            if sid == 7:
                out.diagnostics.append(f"ignored turn start after terminal at move {move}")
            continue
        if ty == "playerConcedeGame":
            transition(o, move, "terminal", "concession")
        elif sid == 99:
            transition(o, move, "terminal", "terminal")
        elif sid == 98:
            transition(o, move, "scoring", "scoring")
        elif sid == 10 or ty == "startBreak":
            if sid == 10 and move is not None and move in break_entries:
                continue  # late corroborating state copy of an already resolved Break
            if move is not None:
                break_entries.add(move)
            if phase != "break":
                transition(o, move, "break", "break")
        elif ty == "finishBreak":
            if phase == "break":
                transition(o, move, "between_turns", "finish_break")
        elif sid == 7:
            # State-7 public resends may have a fresh UID/packet. A backend move
            # identifies one normal-start transition for this owner; a later
            # move by the same owner remains a distinct, countable start.
            start_key = (move, player)
            if move is not None and start_key in start_keys:
                continue
            if phase in ("break", "scoring") or player in (None, "None"):
                out.diagnostics.append(f"ignored turn start in {phase} at move {move}")
                continue
            start_keys.add(start_key)
            counts[player] += 1
            display = counts[player]
            ctx = transition(o, move, "turn", "turn")
            opened = NormalTurn(len(out.turns) + 1, player, counts[player], o, move, o, move)
            out.turns.append(opened)
            ctx.update(index=opened.index, player=player, number=opened.number)
        elif opened is not None:
            opened.end_order, opened.end_move = o, move
    if opened is not None:
        out.diagnostics.append(f"incomplete turn {opened.index}: log ends without a closing boundary")
    out._orders = [t["order"] for t in out.transitions]
    return out
