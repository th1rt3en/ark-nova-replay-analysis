"""The leak guard: a puzzle's public payload must not name the table or its players (docs/accounts_plan.md, "What the browser may receive").

The game redacts; the platform checks the result before it is stored or sent, so a redaction bug makes the rollover try another table instead of leaking.
"""
import json
import re

from ark_nova.minigames.platform.contract import GameLog


class Leak(Exception):
    pass


def check_public(public: dict, log: GameLog) -> None:
    """Raises Leak when the payload contains the table id, a player id or a player name (as a whole word, ignoring case)."""
    text = json.dumps(public, ensure_ascii=False)
    needles = [str(log.table_id)] + [pid for pid, _ in log.players]
    for needle in needles:
        if needle and re.search(rf"(?<!\d){re.escape(needle)}(?!\d)", text):
            raise Leak(f"the public payload contains the number {needle}")
    for _, name in log.players:
        if name and re.search(rf"(?<!\w){re.escape(name)}(?!\w)", text, re.IGNORECASE):
            raise Leak("the public payload contains a player name")
