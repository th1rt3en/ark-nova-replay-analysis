"""Normalized log model produced by the parser (see docs/log_format.md)."""
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Event:
    type: str                      # BGA event type; the private twins pDrawCards/pDiscardCards/... are kept, public twins dropped
    args: Any                      # args as in the log (dict, or [] for empty)
    log: str = ""                  # BGA log template (distinguishes effects that share an event type)
    player: Optional[str] = None   # BGA player id for events from a private channel, None for public events
    packet_id: int = 0
    order: int = 0                 # global position in the log (chronological)


@dataclass
class Move:
    index: int                     # 0-based position among the kept moves (the replay step)
    move_id: Optional[int]         # BGA move id (None only for packets before the first move id)
    time: int                      # unix time of the first packet
    events: list[Event] = field(default_factory=list)
    # oracle snapshots taken from noise events (not replay steps). State 20: {"player": pid, "hand_and_display": [card keys], ...}
    # from the private `statuses` (BGA lists every card the player could play: hand + display). State 30 (build):
    # {"player": pid, "active": pid, "build": {lvl, max_size, free, can_pass, types, options: {type: [(x, y, rotation)]}}}
    # = BGA's legal placements after the events of this move.
    checks: list[dict] = field(default_factory=list)


@dataclass
class PlayerInfo:
    id: str
    name: str = ""


@dataclass
class ParsedLog:
    table_id: int
    players: list[PlayerInfo]
    moves: list[Move]
    total_move_ids: int            # move ids in the raw log, including state-only ones that were dropped
    result: Optional[list[dict]] = None     # rows of the final result (state 99): id, score, rank, concede
    conceded: Optional[str] = None          # player id that conceded, if any
    final_scores: dict[str, int] = field(default_factory=dict)   # from finalScoring events (absent when conceded)
    # a player's turn starts where BGA enters state 20 (choose an action card): (event order, active player id), public channel
    turn_markers: list[tuple[int, str]] = field(default_factory=list)
