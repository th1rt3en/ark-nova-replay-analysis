"""The account tables (docs/accounts_plan.md, "Data model") behind one interface. `MemoryStore` (tests) and `SqliteStore` (a local file: the dev server) implement it;
the production store is the same tables in Cloudflare D1 reached through the Worker.

The account id is a BGA player id (digits) or `P{n}`; `create_account` allocates the `P{n}` in the same step as the insert, so two signups never get the same one.
"""
import sqlite3
import threading
from dataclasses import dataclass, replace
from typing import Optional, Protocol

from ark_nova.accounts.rating import RatingChange


class UsernameTaken(Exception):
    pass


class IdTaken(Exception):
    pass


@dataclass(frozen=True)
class Account:
    id: str                                  # "89107474" (a BGA player id) or "P12"
    id_source: str                           # "bga" or "new"
    username: str
    username_lower: str
    password_hash: str
    recovery_hash: str
    created_at: str
    last_login_at: str = ""
    bga_elo_seed: Optional[float] = None     # written once, never changed
    rating: float = 0.0
    rated_games: int = 0
    rated_wins: int = 0
    deleted_at: str = ""


@dataclass(frozen=True)
class Session:
    token_hash: str
    account_id: str
    created_at: str
    expires_at: str
    user_agent: str = ""


class AccountStore(Protocol):
    def create_account(self, account: Account, bga_id: Optional[str]) -> Account:
        """Inserts the account with the id `bga_id` (a BGA player id) or, when it is None, the next `P{n}`. Raises UsernameTaken or IdTaken; the `id` of `account` is ignored."""

    def by_id(self, account_id: str) -> Optional[Account]: ...

    def by_username(self, username_lower: str) -> Optional[Account]: ...

    def held_ids(self, ids: list[str]) -> set[str]:
        """Which of these ids already belong to an account."""

    def usernames(self, ids: list[str]) -> dict[str, str]:
        """The username of each of these ids that has an account (one call, for the leaderboards)."""

    def set_passwords(self, account_id: str, password_hash: str, recovery_hash: str) -> None: ...

    def touch_login(self, account_id: str, at: str) -> None: ...

    def add_session(self, session: Session) -> None: ...

    def get_session(self, token_hash: str) -> Optional[Session]: ...

    def extend_session(self, token_hash: str, expires_at: str) -> None: ...

    def delete_session(self, token_hash: str) -> None: ...

    def delete_sessions_of(self, account_id: str) -> None: ...

    # ---- ratings (rated live games), profiles, the ratings board, deleting an account
    def ratings_of(self, ids: list[str]) -> dict[str, tuple[float, int, int]]:
        """{account id: (rating, rated games, rated wins)} of the accounts that exist."""

    def commit_ratings(self, game_id: str, changes: list[RatingChange]) -> str:
        """Writes the rating changes of one game and moves the ratings, all or nothing: "applied", "exists" (that game was rated before: nothing changes) or "changed" (a rating is no longer
        the `before` of the change: read again and retry)."""

    def rating_changes(self, game_id: str) -> list[RatingChange]: ...

    def rating_history(self, account_id: str, limit: int = 20) -> list[RatingChange]:
        """The latest rated games of an account, newest first."""

    def add_table(self, account_id: str, game_id: str, seat: int, opponent_id: str, rated: bool, created_at: str) -> None:
        """Remembers that the account has a seat at a live table (a game between accounts), so the account can find it again without the link. Written again, it only fills in an opponent that was unknown."""

    def finish_table(self, game_id: str, status: str, ended_at: str, results: dict) -> None:
        """The table has ended: its status and, per account id, "win" / "loss" / "draw" or "" (no result)."""

    def tables_of(self, account_id: str, limit: int = 50) -> list[dict]:
        """The tables of an account, newest first: {game_id, seat, opponent_id, rated, status ("live" until it ends), result, created_at, ended_at}."""

    def ratings_board(self, min_games: int, limit: int = 100) -> list[dict]:
        """{id, username, rating, rated_games, rated_wins} of the accounts with at least `min_games` rated games, best first (not the deleted ones)."""

    def delete_account(self, account_id: str, at: str) -> None:
        """Anonymizes the account: it is called "Deleted player", has no password and no sessions; its ratings and results stay."""

    # ---- saved maps (maps made in the map editor, `accounts/maps.py`): at most MAX_MAPS per account, each with a name and an id `M{n}`
    def maps_of(self, account_id: str) -> list[dict]:
        """The saved maps of an account, newest first: {id, account_id, name, data (the editor's JSON as text), created_at, updated_at}."""

    def map_by_id(self, map_id: str) -> Optional[dict]: ...

    def create_map(self, account_id: str, name: str, data: str, at: str, limit: int) -> Optional[dict]:
        """Saves a new map under the next `M{n}`; None when the account already has `limit` maps (counted in the same step as the insert)."""

    def update_map(self, account_id: str, map_id: str, name: str, data: str, at: str) -> Optional[dict]:
        """Replaces the name and the map of `map_id` when it is the account's; None otherwise."""

    def delete_map(self, account_id: str, map_id: str) -> bool: ...


class MemoryStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._accounts: dict[str, Account] = {}
        self._by_name: dict[str, str] = {}
        self._sessions: dict[str, Session] = {}
        self._p = 0
        self._history: list[RatingChange] = []
        self._tables: dict[tuple, dict] = {}
        self._maps: dict[str, dict] = {}
        self._m = 0

    def create_account(self, account, bga_id):
        with self._lock:
            if account.username_lower in self._by_name:
                raise UsernameTaken(account.username)
            if bga_id is not None and bga_id in self._accounts:
                raise IdTaken(bga_id)
            if bga_id is None:
                self._p += 1
                new_id = f"P{self._p}"
            else:
                new_id = bga_id
            acc = replace(account, id=new_id, id_source="bga" if bga_id is not None else "new")
            self._accounts[new_id] = acc
            self._by_name[acc.username_lower] = new_id
            return acc

    def by_id(self, account_id):
        return self._accounts.get(account_id)

    def by_username(self, username_lower):
        i = self._by_name.get(username_lower)
        return self._accounts.get(i) if i else None

    def held_ids(self, ids):
        return {i for i in ids if i in self._accounts}

    def usernames(self, ids):
        return {i: self._accounts[i].username for i in ids if i in self._accounts}

    def set_passwords(self, account_id, password_hash, recovery_hash):
        with self._lock:
            self._accounts[account_id] = replace(self._accounts[account_id], password_hash=password_hash, recovery_hash=recovery_hash)

    def touch_login(self, account_id, at):
        with self._lock:
            self._accounts[account_id] = replace(self._accounts[account_id], last_login_at=at)

    def add_session(self, session):
        self._sessions[session.token_hash] = session

    def get_session(self, token_hash):
        return self._sessions.get(token_hash)

    def extend_session(self, token_hash, expires_at):
        with self._lock:
            if token_hash in self._sessions:
                self._sessions[token_hash] = replace(self._sessions[token_hash], expires_at=expires_at)

    def delete_session(self, token_hash):
        self._sessions.pop(token_hash, None)

    def delete_sessions_of(self, account_id):
        with self._lock:
            self._sessions = {k: v for k, v in self._sessions.items() if v.account_id != account_id}

    def ratings_of(self, ids):
        return {i: (a.rating, a.rated_games, a.rated_wins) for i in ids if (a := self._accounts.get(i))}

    def commit_ratings(self, game_id, changes):
        with self._lock:
            if any(h.game_id == game_id for h in self._history):
                return "exists"
            if any(c.account_id not in self._accounts or self._accounts[c.account_id].rating != c.before for c in changes):
                return "changed"
            for c in changes:
                acc = self._accounts[c.account_id]
                self._accounts[c.account_id] = replace(acc, rating=c.after, rated_games=acc.rated_games + 1, rated_wins=acc.rated_wins + (1 if c.result == 1 else 0))
                self._history.append(c)
            return "applied"

    def rating_changes(self, game_id):
        return sorted((h for h in self._history if h.game_id == game_id), key=lambda h: h.seat)

    def rating_history(self, account_id, limit=20):
        return sorted((h for h in self._history if h.account_id == account_id), key=lambda h: h.at, reverse=True)[:limit]

    def add_table(self, account_id, game_id, seat, opponent_id, rated, created_at):
        with self._lock:
            row = self._tables.get((account_id, game_id))
            if row is None:
                self._tables[(account_id, game_id)] = {"game_id": game_id, "seat": seat, "opponent_id": opponent_id or "", "rated": 1 if rated else 0, "status": "live", "result": "", "created_at": created_at, "ended_at": ""}
            elif opponent_id:
                row["opponent_id"] = opponent_id

    def finish_table(self, game_id, status, ended_at, results):
        with self._lock:
            for (account_id, g), row in self._tables.items():
                if g == game_id:
                    row.update(status=status, ended_at=ended_at, result=results.get(account_id, ""))

    def tables_of(self, account_id, limit=50):
        with self._lock:
            return [dict(r) for (a, _), r in sorted(((k, r) for k, r in self._tables.items() if k[0] == account_id), key=lambda kr: kr[1]["created_at"], reverse=True)[:limit]]

    def ratings_board(self, min_games, limit=100):
        rows = [a for a in self._accounts.values() if a.rated_games >= min_games and not a.deleted_at]
        rows.sort(key=lambda a: (-a.rating, -a.rated_games, a.id))
        return [{"id": a.id, "username": a.username, "rating": a.rating, "rated_games": a.rated_games, "rated_wins": a.rated_wins} for a in rows[:limit]]

    def delete_account(self, account_id, at):
        with self._lock:
            acc = self._accounts.get(account_id)
            if acc is None:
                return
            self._by_name.pop(acc.username_lower, None)
            self._by_name["deleted:" + account_id] = account_id
            self._accounts[account_id] = replace(acc, username="Deleted player", username_lower="deleted:" + account_id, password_hash="", recovery_hash="", deleted_at=at)
            self._sessions = {k: v for k, v in self._sessions.items() if v.account_id != account_id}

    def maps_of(self, account_id):
        with self._lock:
            return sorted((dict(m) for m in self._maps.values() if m["account_id"] == account_id), key=lambda m: (m["created_at"], int(m["id"][1:])), reverse=True)

    def map_by_id(self, map_id):
        with self._lock:
            m = self._maps.get(map_id)
            return dict(m) if m else None

    def create_map(self, account_id, name, data, at, limit):
        with self._lock:
            if sum(1 for m in self._maps.values() if m["account_id"] == account_id) >= limit:
                return None
            self._m += 1
            m = {"id": f"M{self._m}", "account_id": account_id, "name": name, "data": data, "created_at": at, "updated_at": at}
            self._maps[m["id"]] = m
            return dict(m)

    def update_map(self, account_id, map_id, name, data, at):
        with self._lock:
            m = self._maps.get(map_id)
            if m is None or m["account_id"] != account_id:
                return None
            m.update(name=name, data=data, updated_at=at)
            return dict(m)

    def delete_map(self, account_id, map_id):
        with self._lock:
            m = self._maps.get(map_id)
            if m is None or m["account_id"] != account_id:
                return False
            del self._maps[map_id]
            return True


SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, id_source TEXT NOT NULL, username TEXT NOT NULL, username_lower TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    recovery_hash TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL DEFAULT '', bga_elo_seed REAL, rating REAL NOT NULL DEFAULT 0,
    rated_games INTEGER NOT NULL DEFAULT 0, rated_wins INTEGER NOT NULL DEFAULT 0, deleted_at TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, user_agent TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS rating_history (game_id TEXT NOT NULL, account_id TEXT NOT NULL, seat INTEGER NOT NULL, opponent_id TEXT NOT NULL, result REAL NOT NULL, rating_before REAL NOT NULL,
    rating_after REAL NOT NULL, delta REAL NOT NULL, k INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (game_id, account_id));
CREATE TABLE IF NOT EXISTS custom_maps (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS custom_maps_by_account ON custom_maps (account_id);
CREATE TABLE IF NOT EXISTS account_tables (account_id TEXT NOT NULL, game_id TEXT NOT NULL, seat INTEGER NOT NULL, opponent_id TEXT NOT NULL DEFAULT '', rated INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'live', result TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, ended_at TEXT NOT NULL DEFAULT '', PRIMARY KEY (account_id, game_id));
CREATE INDEX IF NOT EXISTS account_tables_by_account ON account_tables (account_id, created_at);
"""
FIELDS = ("id", "id_source", "username", "username_lower", "password_hash", "recovery_hash", "created_at", "last_login_at", "bga_elo_seed", "rating", "rated_games", "rated_wins", "deleted_at")


class SqliteStore:
    def __init__(self, path: str = ":memory:"):
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)
            try:                                                  # a file made before the accounts could be deleted
                self._db.execute("ALTER TABLE accounts ADD COLUMN deleted_at TEXT NOT NULL DEFAULT ''")
            except sqlite3.OperationalError:
                pass

    @staticmethod
    def _acc(r) -> Account:
        return Account(**{f: r[f] for f in FIELDS})

    def create_account(self, account, bga_id):
        with self._lock:
            try:
                with self._db:                                     # one transaction: the counter and the insert go together
                    if bga_id is None:
                        self._db.execute("INSERT INTO counters (name, value) VALUES ('account_p', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1")
                        new_id = "P%d" % self._db.execute("SELECT value FROM counters WHERE name = 'account_p'").fetchone()[0]
                    else:
                        new_id = bga_id
                        if self._db.execute("SELECT 1 FROM accounts WHERE id = ?", (bga_id,)).fetchone():
                            raise IdTaken(bga_id)
                    acc = replace(account, id=new_id, id_source="bga" if bga_id is not None else "new")
                    self._db.execute(f"INSERT INTO accounts ({', '.join(FIELDS)}) VALUES ({', '.join('?' * len(FIELDS))})", tuple(getattr(acc, f) for f in FIELDS))
                    return acc
            except sqlite3.IntegrityError:
                raise UsernameTaken(account.username)

    def by_id(self, account_id):
        with self._lock:
            r = self._db.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        return self._acc(r) if r else None

    def by_username(self, username_lower):
        with self._lock:
            r = self._db.execute("SELECT * FROM accounts WHERE username_lower = ?", (username_lower,)).fetchone()
        return self._acc(r) if r else None

    def held_ids(self, ids):
        if not ids:
            return set()
        with self._lock:
            return {r[0] for r in self._db.execute(f"SELECT id FROM accounts WHERE id IN ({', '.join('?' * len(ids))})", list(ids))}

    def usernames(self, ids):
        if not ids:
            return {}
        with self._lock:
            return {r[0]: r[1] for r in self._db.execute(f"SELECT id, username FROM accounts WHERE id IN ({', '.join('?' * len(ids))})", list(ids))}

    def set_passwords(self, account_id, password_hash, recovery_hash):
        with self._lock, self._db:
            self._db.execute("UPDATE accounts SET password_hash = ?, recovery_hash = ? WHERE id = ?", (password_hash, recovery_hash, account_id))

    def touch_login(self, account_id, at):
        with self._lock, self._db:
            self._db.execute("UPDATE accounts SET last_login_at = ? WHERE id = ?", (at, account_id))

    def add_session(self, s):
        with self._lock, self._db:
            self._db.execute("INSERT OR REPLACE INTO sessions (token_hash, account_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)", (s.token_hash, s.account_id, s.created_at, s.expires_at, s.user_agent))

    def get_session(self, token_hash):
        with self._lock:
            r = self._db.execute("SELECT * FROM sessions WHERE token_hash = ?", (token_hash,)).fetchone()
        return Session(r["token_hash"], r["account_id"], r["created_at"], r["expires_at"], r["user_agent"]) if r else None

    def extend_session(self, token_hash, expires_at):
        with self._lock, self._db:
            self._db.execute("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", (expires_at, token_hash))

    def delete_session(self, token_hash):
        with self._lock, self._db:
            self._db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def delete_sessions_of(self, account_id):
        with self._lock, self._db:
            self._db.execute("DELETE FROM sessions WHERE account_id = ?", (account_id,))

    def ratings_of(self, ids):
        if not ids:
            return {}
        with self._lock:
            return {r[0]: (r[1], r[2], r[3]) for r in self._db.execute(f"SELECT id, rating, rated_games, rated_wins FROM accounts WHERE id IN ({', '.join('?' * len(ids))})", list(ids))}

    def commit_ratings(self, game_id, changes):
        with self._lock, self._db:
            if self._db.execute("SELECT 1 FROM rating_history WHERE game_id = ?", (game_id,)).fetchone():
                return "exists"
            for c in changes:
                r = self._db.execute("SELECT rating FROM accounts WHERE id = ?", (c.account_id,)).fetchone()
                if r is None or r[0] != c.before:
                    return "changed"
            for c in changes:
                self._db.execute("INSERT INTO rating_history (game_id, account_id, seat, opponent_id, result, rating_before, rating_after, delta, k, at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                                 (game_id, c.account_id, c.seat, c.opponent_id, c.result, c.before, c.after, c.after - c.before, c.k, c.at))
                self._db.execute("UPDATE accounts SET rating = ?, rated_games = rated_games + 1, rated_wins = rated_wins + ? WHERE id = ?", (c.after, 1 if c.result == 1 else 0, c.account_id))
            return "applied"

    @staticmethod
    def _change(r) -> RatingChange:
        return RatingChange(r["game_id"], r["account_id"], r["seat"], r["opponent_id"], r["result"], r["rating_before"], r["rating_after"], r["at"], r["k"])

    def rating_changes(self, game_id):
        with self._lock:
            return [self._change(r) for r in self._db.execute("SELECT * FROM rating_history WHERE game_id = ? ORDER BY seat", (game_id,))]

    def rating_history(self, account_id, limit=20):
        with self._lock:
            return [self._change(r) for r in self._db.execute("SELECT * FROM rating_history WHERE account_id = ? ORDER BY at DESC LIMIT ?", (account_id, limit))]

    def add_table(self, account_id, game_id, seat, opponent_id, rated, created_at):
        with self._lock:
            self._db.execute("INSERT INTO account_tables (account_id, game_id, seat, opponent_id, rated, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (account_id, game_id) DO UPDATE SET "
                             "opponent_id = CASE WHEN excluded.opponent_id != '' THEN excluded.opponent_id ELSE opponent_id END", (account_id, game_id, seat, opponent_id or "", 1 if rated else 0, created_at))
            self._db.commit()

    def finish_table(self, game_id, status, ended_at, results):
        with self._lock:
            for (account_id,) in self._db.execute("SELECT account_id FROM account_tables WHERE game_id = ?", (game_id,)).fetchall():
                self._db.execute("UPDATE account_tables SET status = ?, ended_at = ?, result = ? WHERE account_id = ? AND game_id = ?", (status, ended_at, results.get(account_id, ""), account_id, game_id))
            self._db.commit()

    def tables_of(self, account_id, limit=50):
        with self._lock:
            return [dict(r) for r in self._db.execute("SELECT game_id, seat, opponent_id, rated, status, result, created_at, ended_at FROM account_tables WHERE account_id = ? ORDER BY created_at DESC LIMIT ?", (account_id, limit))]

    def ratings_board(self, min_games, limit=100):
        with self._lock:
            rows = self._db.execute("SELECT id, username, rating, rated_games, rated_wins FROM accounts WHERE rated_games >= ? AND deleted_at = '' ORDER BY rating DESC, rated_games DESC, id LIMIT ?", (min_games, limit))
            return [dict(r) for r in rows]

    def delete_account(self, account_id, at):
        with self._lock, self._db:
            self._db.execute("UPDATE accounts SET username = 'Deleted player', username_lower = ?, password_hash = '', recovery_hash = '', deleted_at = ? WHERE id = ?", ("deleted:" + account_id, at, account_id))
            self._db.execute("DELETE FROM sessions WHERE account_id = ?", (account_id,))

    def maps_of(self, account_id):
        with self._lock:
            return [dict(r) for r in self._db.execute("SELECT * FROM custom_maps WHERE account_id = ? ORDER BY created_at DESC, rowid DESC", (account_id,))]

    def map_by_id(self, map_id):
        with self._lock:
            r = self._db.execute("SELECT * FROM custom_maps WHERE id = ?", (map_id,)).fetchone()
        return dict(r) if r else None

    def create_map(self, account_id, name, data, at, limit):
        with self._lock, self._db:                                  # one transaction: the count, the counter and the insert go together
            if self._db.execute("SELECT COUNT(*) FROM custom_maps WHERE account_id = ?", (account_id,)).fetchone()[0] >= limit:
                return None
            self._db.execute("INSERT INTO counters (name, value) VALUES ('custom_map', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1")
            map_id = "M%d" % self._db.execute("SELECT value FROM counters WHERE name = 'custom_map'").fetchone()[0]
            self._db.execute("INSERT INTO custom_maps (id, account_id, name, data, created_at, updated_at) VALUES (?,?,?,?,?,?)", (map_id, account_id, name, data, at, at))
            return {"id": map_id, "account_id": account_id, "name": name, "data": data, "created_at": at, "updated_at": at}

    def update_map(self, account_id, map_id, name, data, at):
        with self._lock, self._db:
            cur = self._db.execute("UPDATE custom_maps SET name = ?, data = ?, updated_at = ? WHERE id = ? AND account_id = ?", (name, data, at, map_id, account_id))
            if cur.rowcount == 0:
                return None
            return dict(self._db.execute("SELECT * FROM custom_maps WHERE id = ?", (map_id,)).fetchone())

    def delete_map(self, account_id, map_id):
        with self._lock, self._db:
            return self._db.execute("DELETE FROM custom_maps WHERE id = ? AND account_id = ?", (map_id, account_id)).rowcount > 0
