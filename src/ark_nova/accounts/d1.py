"""The account store in Cloudflare D1, through the Worker (`cloudflare/src/store.ts`, operations `acct.*`). Same interface as `MemoryStore` / `SqliteStore`."""
from dataclasses import asdict
from typing import Optional

from ark_nova.accounts.store import Account, IdTaken, Session, UsernameTaken
from ark_nova.storeclient import StoreClient, StoreConflict

FIELDS = ("id", "id_source", "username", "username_lower", "password_hash", "recovery_hash", "created_at", "last_login_at", "bga_elo_seed", "rating", "rated_games", "rated_wins")


def _account(row: Optional[dict]) -> Optional[Account]:
    return Account(**{f: row[f] for f in FIELDS}) if row else None


class D1AccountStore:
    def __init__(self, client: StoreClient):
        self.c = client

    def create_account(self, account, bga_id):
        try:
            return _account(self.c.call("acct.create", {"account": asdict(account), "bga_id": bga_id}))
        except StoreConflict as e:
            raise UsernameTaken(account.username) if e.code == "username_taken" else IdTaken(bga_id)

    def by_id(self, account_id):
        return _account(self.c.call("acct.by_id", {"id": account_id}, retry=True))

    def by_username(self, username_lower):
        return _account(self.c.call("acct.by_username", {"username_lower": username_lower}, retry=True))

    def held_ids(self, ids):
        return set(self.c.call("acct.held_ids", {"ids": list(ids)}, retry=True)) if ids else set()

    def usernames(self, ids):
        return {r["id"]: r["username"] for r in self.c.call("acct.usernames", {"ids": list(ids)}, retry=True)} if ids else {}

    def set_passwords(self, account_id, password_hash, recovery_hash):
        self.c.call("acct.set_passwords", {"id": account_id, "password_hash": password_hash, "recovery_hash": recovery_hash}, retry=True)

    def touch_login(self, account_id, at):
        self.c.call("acct.touch_login", {"id": account_id, "at": at}, retry=True)

    def add_session(self, session):
        self.c.call("acct.add_session", {"session": asdict(session)}, retry=True)             # (INSERT OR REPLACE: safe to repeat)

    def get_session(self, token_hash):
        r = self.c.call("acct.get_session", {"token_hash": token_hash}, retry=True)
        return Session(r["token_hash"], r["account_id"], r["created_at"], r["expires_at"], r["user_agent"]) if r else None

    def extend_session(self, token_hash, expires_at):
        self.c.call("acct.extend_session", {"token_hash": token_hash, "expires_at": expires_at}, retry=True)

    def delete_session(self, token_hash):
        self.c.call("acct.delete_session", {"token_hash": token_hash}, retry=True)

    def delete_sessions_of(self, account_id):
        self.c.call("acct.delete_sessions_of", {"account_id": account_id}, retry=True)
