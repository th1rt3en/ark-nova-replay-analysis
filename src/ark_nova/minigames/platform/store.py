"""The three shared tables of the mini games (docs/accounts_plan.md, "Shared stores"), behind one interface. `MemoryStore` (tests, dev server) and `SqliteStore`
(a local file) implement it; the production store is the same tables in Cloudflare D1, reached through the Worker (written with the accounts).

Every row carries `game_key`; the games' own data is JSON, so a new game needs no migration.
"""
import json
import sqlite3
import threading
from dataclasses import dataclass, field, replace
from typing import Optional, Protocol


@dataclass(frozen=True)
class PuzzleRow:
    game_key: str
    day: str                          # YYYY-MM-DD (UTC)
    source_ref: int                   # the BGA table id (sent to a browser only in the reveal)
    moment: dict                      # the game's pointer into the table, e.g. {"seat": 1}
    builder_version: str = ""
    public_cache: Optional[dict] = None   # a cache of the built payload: the pointer is the truth
    created_at: str = ""
    answer_cache: Optional[dict] = None   # a cache of the answer read from the log (server side only, never sent to a browser): rebuilt from the log when missing or out of date


@dataclass(frozen=True)
class SubmissionRow:
    game_key: str
    day: str
    account_id: Optional[str]
    anon_id: Optional[str]
    payload: dict
    score: float
    detail: dict = field(default_factory=dict)
    submitted_at: str = ""            # ISO UTC; its month is the month of the leaderboard


class MiniGameStore(Protocol):
    def get_puzzle(self, game_key: str, day: str) -> Optional[PuzzleRow]: ...

    def create_puzzle(self, row: PuzzleRow) -> bool:
        """Also remembers the source as used. False (and nothing changes) when the game already has a puzzle for the day."""

    def used_sources(self, game_key: str) -> set[int]: ...

    def set_public_cache(self, game_key: str, day: str, public: dict, builder_version: str) -> None:
        """Also clears the answer cache: a new builder version means both are rebuilt."""

    def set_answer_cache(self, game_key: str, day: str, answer: dict) -> None: ...

    def puzzle_days(self, game_key: str, month: str) -> list[str]: ...

    def get_submission(self, game_key: str, day: str, account_id: Optional[str], anon_id: Optional[str]) -> Optional[SubmissionRow]: ...

    def player_scores(self, game_key: str, month: str, account_id: Optional[str], anon_id: Optional[str]) -> dict[str, float]:
        """The score of every puzzle of the month (by the puzzle's day) that this player has played, in one call: the calendar."""

    def add_submission(self, row: SubmissionRow) -> bool:
        """False when that player has already played that puzzle."""

    def submissions(self, game_key: str, day: Optional[str] = None, month: Optional[str] = None, ranked_only: bool = False) -> list[SubmissionRow]: ...

    def purge(self, game_key: str) -> None: ...


class MemoryStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._puzzles: dict[tuple, PuzzleRow] = {}
        self._used: dict[str, set] = {}
        self._subs: list[SubmissionRow] = []

    def get_puzzle(self, game_key, day):
        return self._puzzles.get((game_key, day))

    def create_puzzle(self, row):
        with self._lock:
            if (row.game_key, row.day) in self._puzzles:
                return False
            self._puzzles[(row.game_key, row.day)] = row
            self._used.setdefault(row.game_key, set()).add(row.source_ref)
            return True

    def used_sources(self, game_key):
        return set(self._used.get(game_key, ()))

    def set_public_cache(self, game_key, day, public, builder_version):
        with self._lock:
            row = self._puzzles.get((game_key, day))
            if row is not None:
                self._puzzles[(game_key, day)] = replace(row, public_cache=public, builder_version=builder_version, answer_cache=None)

    def set_answer_cache(self, game_key, day, answer):
        with self._lock:
            row = self._puzzles.get((game_key, day))
            if row is not None:
                self._puzzles[(game_key, day)] = replace(row, answer_cache=answer)

    def puzzle_days(self, game_key, month):
        return sorted(d for (k, d) in self._puzzles if k == game_key and d.startswith(month))

    @staticmethod
    def _same_player(s, account_id, anon_id):
        if account_id is not None:
            return s.account_id == account_id
        return anon_id is not None and s.account_id is None and s.anon_id == anon_id

    def get_submission(self, game_key, day, account_id, anon_id):
        return next((s for s in self._subs if s.game_key == game_key and s.day == day and self._same_player(s, account_id, anon_id)), None)

    def player_scores(self, game_key, month, account_id, anon_id):
        return {s.day: s.score for s in self._subs if s.game_key == game_key and s.day.startswith(month) and self._same_player(s, account_id, anon_id)}

    def add_submission(self, row):
        with self._lock:
            if self.get_submission(row.game_key, row.day, row.account_id, row.anon_id) is not None:
                return False
            self._subs.append(row)
            return True

    def submissions(self, game_key, day=None, month=None, ranked_only=False):
        return [s for s in self._subs if s.game_key == game_key and (day is None or s.day == day) and (month is None or s.submitted_at.startswith(month))
                and (not ranked_only or s.account_id is not None)]

    def purge(self, game_key):
        with self._lock:
            self._puzzles = {k: v for k, v in self._puzzles.items() if k[0] != game_key}
            self._used.pop(game_key, None)
            self._subs = [s for s in self._subs if s.game_key != game_key]


SCHEMA = """
CREATE TABLE IF NOT EXISTS minigame_puzzles (game_key TEXT NOT NULL, day TEXT NOT NULL, source_ref INTEGER NOT NULL, moment TEXT NOT NULL,
    builder_version TEXT NOT NULL DEFAULT '', public_cache TEXT, created_at TEXT NOT NULL DEFAULT '', answer_cache TEXT, PRIMARY KEY (game_key, day));
CREATE TABLE IF NOT EXISTS minigame_used_sources (game_key TEXT NOT NULL, source_ref INTEGER NOT NULL, PRIMARY KEY (game_key, source_ref));
CREATE TABLE IF NOT EXISTS minigame_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, game_key TEXT NOT NULL, day TEXT NOT NULL, account_id TEXT, anon_id TEXT,
    payload TEXT NOT NULL, score REAL NOT NULL, detail TEXT NOT NULL DEFAULT '{}', submitted_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS minigame_sub_account ON minigame_submissions (game_key, day, account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS minigame_sub_anon ON minigame_submissions (game_key, day, anon_id) WHERE account_id IS NULL;
"""


class SqliteStore:
    def __init__(self, path: str = ":memory:"):
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)
            try:                                                  # a file made before the answer cache existed
                self._db.execute("ALTER TABLE minigame_puzzles ADD COLUMN answer_cache TEXT")
            except sqlite3.OperationalError:
                pass

    @staticmethod
    def _puzzle(r) -> PuzzleRow:
        return PuzzleRow(r["game_key"], r["day"], r["source_ref"], json.loads(r["moment"]), r["builder_version"], json.loads(r["public_cache"]) if r["public_cache"] else None, r["created_at"], json.loads(r["answer_cache"]) if r["answer_cache"] else None)

    def get_puzzle(self, game_key, day):
        with self._lock:
            r = self._db.execute("SELECT * FROM minigame_puzzles WHERE game_key = ? AND day = ?", (game_key, day)).fetchone()
        return self._puzzle(r) if r else None

    def create_puzzle(self, row):
        with self._lock, self._db:
            cur = self._db.execute("INSERT OR IGNORE INTO minigame_puzzles (game_key, day, source_ref, moment, builder_version, public_cache, created_at, answer_cache) VALUES (?,?,?,?,?,?,?,?)",
                                   (row.game_key, row.day, row.source_ref, json.dumps(row.moment), row.builder_version, json.dumps(row.public_cache) if row.public_cache is not None else None, row.created_at,
                                    json.dumps(row.answer_cache) if row.answer_cache is not None else None))
            if cur.rowcount == 0:
                return False
            self._db.execute("INSERT OR IGNORE INTO minigame_used_sources (game_key, source_ref) VALUES (?,?)", (row.game_key, row.source_ref))
            return True

    def used_sources(self, game_key):
        with self._lock:
            return {r[0] for r in self._db.execute("SELECT source_ref FROM minigame_used_sources WHERE game_key = ?", (game_key,))}

    def set_public_cache(self, game_key, day, public, builder_version):
        with self._lock, self._db:
            self._db.execute("UPDATE minigame_puzzles SET public_cache = ?, builder_version = ?, answer_cache = NULL WHERE game_key = ? AND day = ?", (json.dumps(public), builder_version, game_key, day))

    def set_answer_cache(self, game_key, day, answer):
        with self._lock, self._db:
            self._db.execute("UPDATE minigame_puzzles SET answer_cache = ? WHERE game_key = ? AND day = ?", (json.dumps(answer), game_key, day))

    def puzzle_days(self, game_key, month):
        with self._lock:
            return [r[0] for r in self._db.execute("SELECT day FROM minigame_puzzles WHERE game_key = ? AND day LIKE ? ORDER BY day", (game_key, month + "-%"))]

    @staticmethod
    def _sub(r) -> SubmissionRow:
        return SubmissionRow(r["game_key"], r["day"], r["account_id"], r["anon_id"], json.loads(r["payload"]), r["score"], json.loads(r["detail"]), r["submitted_at"])

    def get_submission(self, game_key, day, account_id, anon_id):
        with self._lock:
            if account_id is not None:
                r = self._db.execute("SELECT * FROM minigame_submissions WHERE game_key = ? AND day = ? AND account_id = ?", (game_key, day, account_id)).fetchone()
            elif anon_id is not None:
                r = self._db.execute("SELECT * FROM minigame_submissions WHERE game_key = ? AND day = ? AND account_id IS NULL AND anon_id = ?", (game_key, day, anon_id)).fetchone()
            else:
                r = None
        return self._sub(r) if r else None

    def player_scores(self, game_key, month, account_id, anon_id):
        with self._lock:
            if account_id is not None:
                rows = self._db.execute("SELECT day, score FROM minigame_submissions WHERE game_key = ? AND day LIKE ? AND account_id = ?", (game_key, month + "-%", account_id))
            elif anon_id is not None:
                rows = self._db.execute("SELECT day, score FROM minigame_submissions WHERE game_key = ? AND day LIKE ? AND account_id IS NULL AND anon_id = ?", (game_key, month + "-%", anon_id))
            else:
                return {}
            return {r[0]: r[1] for r in rows}

    def add_submission(self, row):
        try:
            with self._lock, self._db:
                self._db.execute("INSERT INTO minigame_submissions (game_key, day, account_id, anon_id, payload, score, detail, submitted_at) VALUES (?,?,?,?,?,?,?,?)",
                                 (row.game_key, row.day, row.account_id, row.anon_id, json.dumps(row.payload), row.score, json.dumps(row.detail), row.submitted_at))
            return True
        except sqlite3.IntegrityError:
            return False

    def submissions(self, game_key, day=None, month=None, ranked_only=False):
        sql, args = "SELECT * FROM minigame_submissions WHERE game_key = ?", [game_key]
        if day is not None:
            sql, args = sql + " AND day = ?", args + [day]
        if month is not None:
            sql, args = sql + " AND submitted_at LIKE ?", args + [month + "%"]
        if ranked_only:
            sql += " AND account_id IS NOT NULL"
        with self._lock:
            return [self._sub(r) for r in self._db.execute(sql + " ORDER BY id", args)]

    def purge(self, game_key):
        with self._lock, self._db:
            for t in ("minigame_puzzles", "minigame_used_sources", "minigame_submissions"):
                self._db.execute(f"DELETE FROM {t} WHERE game_key = ?", (game_key,))
