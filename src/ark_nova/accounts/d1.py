"""The account store in Cloudflare D1, through the Worker (`cloudflare/src/store.ts`, operations `acct.*`). Same interface as `MemoryStore` / `SqliteStore`."""
from dataclasses import asdict
from typing import Optional

from ark_nova.accounts.rating import K, RatingChange
from ark_nova.accounts.store import Account, IdTaken, Session, UsernameTaken
from ark_nova.storeclient import StoreClient, StoreConflict

FIELDS = ("id", "id_source", "username", "username_lower", "password_hash", "recovery_hash", "created_at", "last_login_at", "bga_elo_seed", "rating", "rated_games", "rated_wins", "deleted_at")


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

    def ratings_of(self, ids):
        return {r["id"]: (r["rating"], r["rated_games"], r["rated_wins"]) for r in self.c.call("rating.of", {"ids": list(ids)}, retry=True)} if ids else {}

    def commit_ratings(self, game_id, changes):
        payload = [{"account_id": c.account_id, "seat": c.seat, "opponent_id": c.opponent_id, "result": c.result, "before": c.before, "after": c.after, "at": c.at} for c in changes]
        return self.c.call("rating.commit", {"game_id": game_id, "changes": payload, "k": K})

    @staticmethod
    def _change(r) -> RatingChange:
        return RatingChange(r["game_id"], r["account_id"], r["seat"], r["opponent_id"], r["result"], r["rating_before"], r["rating_after"], r["at"])

    def rating_changes(self, game_id):
        return [self._change(r) for r in self.c.call("rating.changes", {"game_id": game_id}, retry=True)]

    def rating_history(self, account_id, limit=20):
        return [self._change(r) for r in self.c.call("rating.history", {"account_id": account_id, "limit": limit}, retry=True)]

    def ratings_board(self, min_games, limit=100):
        return list(self.c.call("rating.board", {"min_games": min_games, "limit": limit}, retry=True))

    def delete_account(self, account_id, at):
        self.c.call("acct.delete", {"id": account_id, "at": at}, retry=True)
