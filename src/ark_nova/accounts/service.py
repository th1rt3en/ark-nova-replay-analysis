"""Accounts: check a name, register, log in and out, recover (docs/accounts_plan.md). No HTTP here (`api/accounts.py`) and no storage (`store.py`)."""
import hashlib
import hmac
import re
import secrets
import threading
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional, Protocol

from ark_nova.accounts.seeds import BgaPlayer, BgaSeedIndex, NoSeeds
from ark_nova.accounts.store import Account, AccountStore, IdTaken, Session, UsernameTaken

SESSION_DAYS = 30
SLIDE_AFTER = timedelta(days=1)                       # a session that is used is pushed forward at most once a day
RESERVED = {"admin", "administrator", "system", "moderator", "mod", "root", "support", "bot", "ark nova", "anonymous", "guest", "deleted player", "emu", "staff"}
USERNAME = re.compile(r"^[^\W_](?:[\w .\-]{1,22})[^\W_]$")        # letters and digits (any script) at both ends; letters, digits, space, _ . - inside
MIN_PASSWORD, MAX_PASSWORD = 10, 128
COMMON = {"password12", "password123", "1234567890", "12345678910", "qwertyuiop", "qwerty1234", "iloveyou12", "abcdefghij", "0123456789", "password1234", "letmein1234", "welcome123", "1q2w3e4r5t"}


class AccountError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class Hasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, hashed: str, password: str) -> bool: ...

    def needs_rehash(self, hashed: str) -> bool: ...


class Argon2Hasher:
    """argon2id with the OWASP minimum settings (19 MiB, 2 passes, 1 lane)."""

    def __init__(self):
        from argon2 import PasswordHasher
        self._ph = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)

    def hash(self, password):
        return self._ph.hash(password)

    def verify(self, hashed, password):
        from argon2.exceptions import InvalidHashError, VerificationError
        try:
            return self._ph.verify(hashed, password)
        except (VerificationError, InvalidHashError):
            return False

    def needs_rehash(self, hashed):
        return self._ph.check_needs_rehash(hashed)


class AttemptLimiter:
    """Too many failures of one name or one address in a window: 429 (the per-minute limiter of the middleware does not cover `/api/auth`)."""

    def __init__(self, clock, limit_user: int = 8, limit_ip: int = 40, window: int = 900):
        self.clock, self.limit_user, self.limit_ip, self.window = clock, limit_user, limit_ip, window
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key):
        now = self.clock().timestamp()
        hits = [t for t in self._hits.get(key, []) if now - t < self.window]
        self._hits[key] = hits
        return hits

    def check(self, user: str, ip: str) -> None:
        with self._lock:
            if len(self._recent("u:" + user)) >= self.limit_user or (ip and len(self._recent("i:" + ip)) >= self.limit_ip):
                raise AccountError(429, "too_many_attempts", "Too many failed attempts. Wait a few minutes and try again.")

    def fail(self, user: str, ip: str) -> None:
        with self._lock:
            now = self.clock().timestamp()
            self._recent("u:" + user).append(now)
            if ip:
                self._recent("i:" + ip).append(now)

    def reset(self, user: str) -> None:
        with self._lock:
            self._hits.pop("u:" + user, None)


@dataclass(frozen=True)
class Registered:
    account: Account
    token: str                  # the session token, put in the cookie; only its hash is stored
    recovery_code: str          # shown once


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalise_username(raw) -> tuple[str, str]:
    """(the name as typed, cleaned; its case-folded form). AccountError when it is not allowed."""
    if not isinstance(raw, str):
        raise AccountError(422, "bad_username", "Type a username.")
    name = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", raw).strip())
    if not 3 <= len(name) <= 24 or not USERNAME.match(name):
        raise AccountError(422, "bad_username", "A username has 3 to 24 letters, digits, spaces, dots, dashes or underscores, and starts and ends with a letter or digit.")
    if name.casefold() in RESERVED:
        raise AccountError(422, "reserved_username", "That username is reserved.")
    return name, name.casefold()


def check_password(password, username: str = "") -> None:
    if not isinstance(password, str) or not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        raise AccountError(422, "bad_password", f"A password has {MIN_PASSWORD} to {MAX_PASSWORD} characters.")
    if password.casefold() in COMMON or len(set(password)) < 4 or (username and password.casefold() == username.casefold()):
        raise AccountError(422, "weak_password", "That password is too easy to guess.")


def new_recovery_code() -> str:
    h = secrets.token_hex(10)
    return "-".join(h[i:i + 4] for i in range(0, 20, 4))


def recovery_hash(code: str) -> str:
    return hashlib.sha256(re.sub(r"[^0-9a-f]", "", str(code).lower()).encode()).hexdigest()


class AccountService:
    def __init__(self, store: AccountStore, seeds: Optional[BgaSeedIndex] = None, hasher: Optional[Hasher] = None, clock: Optional[Callable[[], datetime]] = None):
        self.store, self.seeds = store, seeds or NoSeeds()
        self.hasher = hasher or Argon2Hasher()
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.limiter = AttemptLimiter(self.clock)
        self._dummy = self.hasher.hash("not-a-real-password")          # verified when the name is unknown, so a miss takes as long as a hit

    # ---- signup
    def check(self, username) -> dict:
        """What the signup form needs before the account exists: is the name free, and which BGA players have used it."""
        name, lower = normalise_username(username)
        if self.store.by_username(lower) is not None:
            return {"username": name, "available": False, "reason": "taken", "matches": []}
        players = self.seeds.lookup(lower)
        held = self.store.held_ids([p.bga_player_id for p in players])
        matches = [{"bga_player_id": p.bga_player_id, "name": p.name, "elo": round(p.elo), "games": p.games, "last_game_at": p.last_game_at, "available": p.bga_player_id not in held}
                   for p in players]
        return {"username": name, "available": True, "reason": "", "matches": matches}

    def register(self, username, password, bga_player_id: Optional[str] = None, user_agent: str = "") -> Registered:
        name, lower = normalise_username(username)
        check_password(password, name)
        chosen: Optional[BgaPlayer] = None
        if bga_player_id is not None:
            chosen = next((p for p in self.seeds.lookup(lower) if p.bga_player_id == str(bga_player_id)), None)
            if chosen is None:
                raise AccountError(422, "bga_id_not_listed", "That BGA player does not have this username.")
        code = new_recovery_code()
        now = self.clock().isoformat()
        draft = Account("", "new", name, lower, self.hasher.hash(password), recovery_hash(code), now, now,
                        bga_elo_seed=chosen.elo if chosen else None, rating=chosen.elo if chosen else 0.0)
        try:
            acc = self.store.create_account(draft, chosen.bga_player_id if chosen else None)
        except UsernameTaken:
            raise AccountError(409, "username_taken", "That username is taken.")
        except IdTaken:
            raise AccountError(409, "bga_id_taken", "An account already uses that BGA player id.")
        return Registered(acc, self._new_session(acc.id, user_agent), code)

    # ---- sessions
    def _new_session(self, account_id: str, user_agent: str) -> str:
        token = secrets.token_urlsafe(32)
        now = self.clock()
        self.store.add_session(Session(token_hash(token), account_id, now.isoformat(), (now + timedelta(days=SESSION_DAYS)).isoformat(), user_agent[:200]))
        return token

    def login(self, username, password, ip: str = "", user_agent: str = "") -> tuple[Account, str]:
        lower = str(username or "").strip().casefold()
        self.limiter.check(lower, ip)
        acc = self.store.by_username(lower) if lower else None
        ok = self.hasher.verify(acc.password_hash if acc else self._dummy, password if isinstance(password, str) else "")
        if acc is None or not ok:
            self.limiter.fail(lower, ip)
            raise AccountError(401, "bad_login", "The username or the password is wrong.")
        self.limiter.reset(lower)
        if self.hasher.needs_rehash(acc.password_hash):
            self.store.set_passwords(acc.id, self.hasher.hash(password), acc.recovery_hash)
        self.store.touch_login(acc.id, self.clock().isoformat())
        return acc, self._new_session(acc.id, user_agent)

    def account_for(self, token: Optional[str]) -> Optional[Account]:
        """The account of a session cookie, or None (no cookie, unknown, expired). A session that is used slides forward."""
        if not token:
            return None
        h = token_hash(token)
        s = self.store.get_session(h)
        now = self.clock()
        if s is None or datetime.fromisoformat(s.expires_at) <= now:
            if s is not None:
                self.store.delete_session(h)
            return None
        if datetime.fromisoformat(s.expires_at) - now < timedelta(days=SESSION_DAYS) - SLIDE_AFTER:
            self.store.extend_session(h, (now + timedelta(days=SESSION_DAYS)).isoformat())
        return self.store.by_id(s.account_id)

    def logout(self, token: Optional[str]) -> None:
        if token:
            self.store.delete_session(token_hash(token))

    def recover(self, username, code, new_password, user_agent: str = "", ip: str = "") -> Registered:
        """A new password with the recovery code; the code is replaced, every session is closed, and the player is logged in."""
        lower = str(username or "").strip().casefold()
        self.limiter.check(lower, ip)
        acc = self.store.by_username(lower) if lower else None
        if acc is None or not hmac.compare_digest(acc.recovery_hash, recovery_hash(code or "")):
            self.limiter.fail(lower, ip)
            raise AccountError(401, "bad_recovery", "The username or the recovery code is wrong.")
        check_password(new_password, acc.username)
        new_code = new_recovery_code()
        self.store.set_passwords(acc.id, self.hasher.hash(new_password), recovery_hash(new_code))
        self.store.delete_sessions_of(acc.id)
        self.limiter.reset(lower)
        return Registered(acc, self._new_session(acc.id, user_agent), new_code)

    @staticmethod
    def public(acc: Account) -> dict:
        """What the page may know about an account: never a hash."""
        return {"id": acc.id, "username": acc.username, "rating": round(acc.rating), "seeded_from_bga": acc.bga_elo_seed is not None, "id_source": acc.id_source,
                "rated_games": acc.rated_games}
