"""The account tables (docs/accounts_plan.md, "Data model") behind one interface. `MemoryStore` (tests) and `SqliteStore` (a local file: the dev server) implement it;
the production store is the same tables in Cloudflare D1 reached through the Worker.

The account id is a BGA player id (digits) or `P{n}`; `create_account` allocates the `P{n}` in the same step as the insert, so two signups never get the same one.
"""
import sqlite3
import threading
from dataclasses import dataclass, replace
from typing import Optional, Protocol


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


class MemoryStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._accounts: dict[str, Account] = {}
        self._by_name: dict[str, str] = {}
        self._sessions: dict[str, Session] = {}
        self._p = 0

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


SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, id_source TEXT NOT NULL, username TEXT NOT NULL, username_lower TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    recovery_hash TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL DEFAULT '', bga_elo_seed REAL, rating REAL NOT NULL DEFAULT 0,
    rated_games INTEGER NOT NULL DEFAULT 0, rated_wins INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, user_agent TEXT NOT NULL DEFAULT '');
"""
FIELDS = ("id", "id_source", "username", "username_lower", "password_hash", "recovery_hash", "created_at", "last_login_at", "bga_elo_seed", "rating", "rated_games", "rated_wins")


class SqliteStore:
    def __init__(self, path: str = ":memory:"):
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)

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
