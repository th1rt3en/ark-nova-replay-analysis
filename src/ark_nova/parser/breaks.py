"""Logical identities for BGA's dedicated Break boundary notifications."""

BREAK_EVENTS = frozenset(("startBreak", "finishBreak"))


def accepted_break_orders(packets: list[dict]) -> frozenset[int]:
    """Return canonical raw event orders, shared by parser and turn timeline.

    One boundary kind at one backend move is one logical notification. Prefer
    its public representation over earlier private copies. Start and finish are
    distinct even on the same move; genuine later Breaks remain distinct even
    if BGA reuses a UID or sends the same empty args. With no usable move, use
    event/provenance identity rather than collapsing all unknown endpoints.
    The raw order counter includes every event, including discarded copies.
    """
    chosen = {}
    order, move = 0, None
    for packet_index, packet in enumerate(packets):
        if packet["move_id"] is not None:
            move = int(packet["move_id"])
        public = str(packet.get("channel", "")).startswith("/table/")
        table = str(packet.get("table_id", ""))
        for position, event in enumerate(packet.get("data", [])):
            order += 1
            kind = event["type"]
            if kind not in BREAK_EVENTS:
                continue
            identity = (table, move, kind)
            if move is None:
                provenance = ("packet", str(packet["packet_id"])) if packet.get("packet_id") is not None else ("position", packet_index)
                identity += (provenance, position, str(event.get("uid", "")))
            previous = chosen.get(identity)
            if previous is None or (public and not previous[1]):
                chosen[identity] = (order, public)
    return frozenset(order for order, _ in chosen.values())
