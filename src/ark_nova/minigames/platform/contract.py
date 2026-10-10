"""What a mini game must provide, and the small types the platform and the games share (docs/accounts_plan.md, "Isolation rules")."""
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Protocol


class MiniGameError(Exception):
    """An error with an HTTP status and a code the page can act on."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class SubmissionError(ValueError):
    """A game's `validate` raises this for a submission that is not acceptable (the message is shown to the player)."""


@dataclass(frozen=True)
class LeaderboardSpec:
    """How a game turns the scores of one account into a rank: `metric` "sum" or "mean" of the scores, `higher_is_better`, and the number of plays needed to be listed."""
    metric: str = "sum"
    higher_is_better: bool = True
    min_plays_month: int = 1
    min_plays_all: int = 1
    unit: str = "points"


@dataclass(frozen=True)
class Score:
    value: float
    detail: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Caller:
    """Who plays: a logged-in account, or an anonymous browser (`anon_id` from a cookie). Anonymous plays are scored but never ranked."""
    account_id: Optional[str] = None
    anon_id: Optional[str] = None

    @property
    def identity(self) -> Optional[tuple]:
        if self.account_id:
            return ("a", self.account_id)
        return ("n", self.anon_id) if self.anon_id else None


class GameLog:
    """A raw BGA log with what the games and the leak guard need from it: parsed lazily; the players' names and ids and the table id."""

    def __init__(self, raw: dict, table_id: int, players: Optional[list[tuple[str, str]]] = None):
        self.raw, self.table_id = raw, table_id
        self._players = players
        self._parsed = None

    @property
    def parsed(self):
        if self._parsed is None:
            from ark_nova.parser import parse_log
            self._parsed = parse_log(self.raw)
        return self._parsed

    @property
    def players(self) -> list[tuple[str, str]]:
        """(id, name) of every player."""
        if self._players is None:
            self._players = [(p.id, p.name) for p in self.parsed.players]
        return self._players


class MiniGame(Protocol):
    """One mini game. Attributes: `key`, `builder_version` (bump it when `build_public` changes what it returns), `allow_past` (false unless the game
    lets players play earlier days), `leaderboard` (a LeaderboardSpec). Methods below; none of them may keep state between calls."""
    key: str
    builder_version: str
    allow_past: bool
    leaderboard: LeaderboardSpec

    def pick_moment(self, source: int, log: GameLog, rng) -> dict:
        """The moment of the table the puzzle is about, as a small JSON pointer (stored). Nothing derived from the log is stored."""

    def build_public(self, moment: dict, log: GameLog) -> dict:
        """What the browser may see (redacted). Deterministic for one moment and one `builder_version`."""

    def answer(self, moment: dict, log: GameLog) -> dict:
        """The answer, derived from the log. Never stored, never sent before the player has submitted."""

    def validate(self, public: dict, payload: Any) -> dict:
        """The clean submission, or SubmissionError."""

    def score(self, answer: dict, payload: dict) -> Score: ...

    def day_stats(self, payloads: list[dict], public: dict) -> dict:
        """The community numbers of one puzzle (pick rates, average prediction) from every submission to it."""

    def reveal(self, public: dict, answer: dict, payload: dict, score: Score, stats: dict) -> dict:
        """What the player sees after submitting. The platform adds the table id."""


@dataclass(frozen=True)
class ManifestEntry:
    key: str
    enabled: bool = True
    module: str = ""                   # dotted path of the game's package; it defines `GAME`, a MiniGame
    title: str = ""
    blurb: str = ""
    allow_past: bool = False


DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH = re.compile(r"^\d{4}-\d{2}$")
GameFactory = Callable[[], MiniGame]
