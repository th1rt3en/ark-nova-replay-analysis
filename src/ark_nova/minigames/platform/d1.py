"""The mini game store in Cloudflare D1, through the Worker (`cloudflare/src/store.ts`, operations `mg.*`). Same interface as `MemoryStore` / `SqliteStore`."""
import json

from ark_nova.minigames.platform.store import PuzzleRow, SubmissionRow
from ark_nova.storeclient import StoreClient


def _puzzle(r) -> PuzzleRow:
    return PuzzleRow(r["game_key"], r["day"], r["source_ref"], json.loads(r["moment"]), r["builder_version"], json.loads(r["public_cache"]) if r["public_cache"] else None, r["created_at"],
                     json.loads(r["answer_cache"]) if r.get("answer_cache") else None)


def _sub(r) -> SubmissionRow:
    return SubmissionRow(r["game_key"], r["day"], r["account_id"], r["anon_id"], json.loads(r["payload"]), r["score"], json.loads(r["detail"]), r["submitted_at"])


class D1MiniGameStore:
    def __init__(self, client: StoreClient):
        self.c = client

    def get_puzzle(self, game_key, day):
        r = self.c.call("mg.get_puzzle", {"game_key": game_key, "day": day}, retry=True)
        return _puzzle(r) if r else None

    def create_puzzle(self, row):
        return bool(self.c.call("mg.create_puzzle", {"puzzle": {"game_key": row.game_key, "day": row.day, "source_ref": row.source_ref, "moment": json.dumps(row.moment), "builder_version": row.builder_version,
                                                               "public_cache": json.dumps(row.public_cache) if row.public_cache is not None else None, "created_at": row.created_at,
                                                               "answer_cache": json.dumps(row.answer_cache) if row.answer_cache is not None else None}}))

    def used_sources(self, game_key):
        return set(self.c.call("mg.used_sources", {"game_key": game_key}, retry=True))

    def set_public_cache(self, game_key, day, public, builder_version):
        self.c.call("mg.set_public_cache", {"game_key": game_key, "day": day, "public_cache": json.dumps(public), "builder_version": builder_version}, retry=True)

    def set_answer_cache(self, game_key, day, answer):
        self.c.call("mg.set_answer_cache", {"game_key": game_key, "day": day, "answer_cache": json.dumps(answer)}, retry=True)

    def puzzle_days(self, game_key, month):
        return list(self.c.call("mg.puzzle_days", {"game_key": game_key, "month": month}, retry=True))

    def get_submission(self, game_key, day, account_id, anon_id):
        r = self.c.call("mg.get_submission", {"game_key": game_key, "day": day, "account_id": account_id, "anon_id": anon_id}, retry=True)
        return _sub(r) if r else None

    def add_submission(self, row):
        return bool(self.c.call("mg.add_submission", {"submission": {"game_key": row.game_key, "day": row.day, "account_id": row.account_id, "anon_id": row.anon_id, "payload": json.dumps(row.payload),
                                                                    "score": row.score, "detail": json.dumps(row.detail), "submitted_at": row.submitted_at}}))

    def submissions(self, game_key, day=None, month=None, ranked_only=False):
        rows = self.c.call("mg.submissions", {"game_key": game_key, "day": day, "month": month, "ranked_only": ranked_only}, retry=True)
        return [_sub(r) for r in rows]

    def purge(self, game_key):
        self.c.call("mg.purge", {"game_key": game_key}, retry=True)
