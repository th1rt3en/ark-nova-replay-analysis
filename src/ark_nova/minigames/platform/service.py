"""The mini game platform: daily rollover, puzzles, submissions, scores and leaderboards, for every game of the manifest and with no knowledge of any of them
(docs/accounts_plan.md, "Mini games and puzzles")."""
import logging
import random
from datetime import date, datetime, timezone
from typing import Callable, Optional

from ark_nova.minigames.platform import guard
from ark_nova.minigames.platform.contract import DAY, MONTH, Caller, GameLog, ManifestEntry, MiniGame, MiniGameError, Score, SubmissionError
from ark_nova.minigames.platform.sources import SourceIndex
from ark_nova.minigames.platform.store import MiniGameStore, PuzzleRow, SubmissionRow

log = logging.getLogger(__name__)
ReadLog = Callable[[int], GameLog]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MiniGameService:
    def __init__(self, store: MiniGameStore, sources: SourceIndex, read_log: ReadLog, games: dict[str, MiniGame], entries: list[ManifestEntry],
                 clock: Callable[[], datetime] = _utc_now, rng: Optional[random.Random] = None, tries: int = 5):
        self.store, self.sources, self.read_log, self.games = store, sources, read_log, games
        self.entries = {e.key: e for e in entries}
        self.clock, self.rng, self.tries = clock, rng or random.Random(), tries

    # ---- days
    def today(self) -> str:
        return self.clock().astimezone(timezone.utc).date().isoformat()

    def _entry(self, key: str) -> ManifestEntry:
        if key not in self.entries or key not in self.games:
            raise MiniGameError(404, "no_game", "No such mini game.")
        return self.entries[key]

    def _playable(self, key: str, day: str) -> PuzzleRow:
        """The puzzle of `day`, if that day may be played: today, or an earlier day of a game with `allow_past`."""
        entry = self._entry(key)
        if not DAY.match(day or ""):
            raise MiniGameError(422, "bad_day", "The day must look like 2026-10-09.")
        today = self.today()
        if day > today:
            raise MiniGameError(404, "no_puzzle", "That day has no puzzle yet.")
        if day < today and not entry.allow_past:
            raise MiniGameError(409, "closed", "Only today's puzzle can be played.")
        puzzle = self.store.get_puzzle(key, day)
        if puzzle is None and day == today:
            puzzle = self._create(self.games[key], day)                           # the cron missed: the first request creates it
        if puzzle is None:
            raise MiniGameError(404, "no_puzzle", "That day has no puzzle.")
        return puzzle

    # ---- rollover
    def rollover(self, day: Optional[str] = None) -> dict[str, str]:
        """Creates the puzzle of `day` (default today) for every game. One game failing never stops the others."""
        day = day or self.today()
        out = {}
        for key, game in self.games.items():
            try:
                if self.store.get_puzzle(key, day) is not None:
                    out[key] = "exists"
                else:
                    out[key] = "created" if self._create(game, day) is not None else "failed"
            except Exception:                                                       # noqa: BLE001
                log.exception("mini game %s: the rollover of %s failed", key, day)
                out[key] = "failed"
        return out

    def _create(self, game: MiniGame, day: str) -> Optional[PuzzleRow]:
        used = frozenset(self.store.used_sources(game.key))
        for source in self.sources.candidates(game.key, used, self.tries, self.rng):
            try:
                glog = self.read_log(source)
                moment = game.pick_moment(source, glog, self.rng)
                public = game.build_public(moment, glog)
                guard.check_public(public, glog)
                answer = game.answer(moment, glog)                                  # the table must also be able to answer: else try another
            except Exception as e:                                                  # noqa: BLE001
                log.warning("mini game %s: table %s does not make a puzzle (%s: %s)", game.key, source, type(e).__name__, e)
                continue
            row = PuzzleRow(game.key, day, source, moment, game.builder_version, public, self.clock().isoformat(), answer)
            if self.store.create_puzzle(row):
                return row
            return self.store.get_puzzle(game.key, day)                             # another request created it first
        log.error("mini game %s: no table made a puzzle for %s", game.key, day)
        return None

    # ---- what a puzzle shows
    def _public(self, game: MiniGame, puzzle: PuzzleRow) -> dict:
        if puzzle.public_cache is not None and puzzle.builder_version == game.builder_version:
            return puzzle.public_cache
        glog = self.read_log(puzzle.source_ref)
        public = game.build_public(puzzle.moment, glog)
        guard.check_public(public, glog)
        self.store.set_public_cache(game.key, puzzle.day, public, game.builder_version)
        return public

    def _answer(self, game: MiniGame, puzzle: PuzzleRow) -> dict:
        """The answer: stored with the puzzle at rollover (a cache, server side only, so a submission needs no log, GCS or BigQuery); read from the log when it is missing."""
        if puzzle.answer_cache is not None and puzzle.builder_version == game.builder_version:
            return puzzle.answer_cache
        ans = game.answer(puzzle.moment, self.read_log(puzzle.source_ref))
        if puzzle.builder_version == game.builder_version:
            self.store.set_answer_cache(game.key, puzzle.day, ans)
        return ans

    def _reveal(self, game: MiniGame, puzzle: PuzzleRow, public: dict, sub: SubmissionRow) -> dict:
        score = Score(sub.score, sub.detail)
        stats = game.day_stats([s.payload for s in self.store.submissions(game.key, day=puzzle.day)], public)
        out = dict(game.reveal(public, self._answer(game, puzzle), sub.payload, score, stats))
        out.update({"score": score.value, "score_detail": score.detail, "table_id": puzzle.source_ref,
                    "links": {"bga": f"https://boardgamearena.com/table?table={puzzle.source_ref}", "replay": f"/replay.html?table={puzzle.source_ref}"}})
        return out

    def puzzle(self, key: str, day: str, caller: Caller) -> dict:
        """The puzzle of a day for this player: the public payload, and the reveal when they have already played it. Nothing else is sent."""
        puzzle = self._playable(key, day)
        game = self.games[key]
        public = self._public(game, puzzle)
        sub = self.store.get_submission(key, day, caller.account_id, caller.anon_id) if caller.identity else None
        return {"game": key, "day": day, "public": public, "played": sub is not None, "allow_past": self.entries[key].allow_past,
                "result": self._reveal(game, puzzle, public, sub) if sub else None}

    def submit(self, key: str, day: str, payload, caller: Caller) -> dict:
        puzzle = self._playable(key, day)
        game = self.games[key]
        if caller.identity is None:
            raise MiniGameError(400, "no_player", "Anonymous plays need an anonymous id.")
        if self.store.get_submission(key, day, caller.account_id, caller.anon_id) is not None:
            raise MiniGameError(409, "already_played", "You have already played this puzzle.")
        public = self._public(game, puzzle)
        try:
            clean = game.validate(public, payload)
        except SubmissionError as e:
            raise MiniGameError(422, "invalid", str(e))
        score = game.score(self._answer(game, puzzle), clean)
        sub = SubmissionRow(key, day, caller.account_id, None if caller.account_id else caller.anon_id, clean, score.value, score.detail, self.clock().isoformat())
        if not self.store.add_submission(sub):
            raise MiniGameError(409, "already_played", "You have already played this puzzle.")
        return self._reveal(game, puzzle, public, sub)

    # ---- the hub, the calendar, the leaderboards
    def hub(self, caller: Caller) -> list[dict]:
        today = self.today()
        out = []
        for key, e in self.entries.items():
            sub = self.store.get_submission(key, today, caller.account_id, caller.anon_id) if caller.identity else None
            out.append({"key": key, "title": e.title, "blurb": e.blurb, "allow_past": e.allow_past, "available": key in self.games,
                        "today": {"day": today, "played": sub is not None, "score": sub.score if sub else None}})
        return out

    def days(self, key: str, month: str, caller: Caller) -> dict:
        entry = self._entry(key)
        if not entry.allow_past:
            raise MiniGameError(404, "no_calendar", "This game has no calendar.")
        if not MONTH.match(month or ""):
            raise MiniGameError(422, "bad_month", "The month must look like 2026-10.")
        out = []
        for d in self.store.puzzle_days(key, month):
            if d > self.today():
                continue
            sub = self.store.get_submission(key, d, caller.account_id, caller.anon_id) if caller.identity else None
            out.append({"day": d, "played": sub is not None, "score": sub.score if sub else None})
        return {"game": key, "month": month, "today": self.today(), "days": out}

    def leaderboard(self, key: str, period: str = "all", names: Optional[Callable[[str], str]] = None) -> dict:
        """`period`: "all", "month" (the current UTC month) or YYYY-MM. Only accounts are ranked; the month is the one of the submission."""
        self._entry(key)
        spec = self.games[key].leaderboard
        month = self.today()[:7] if period == "month" else (period if period != "all" else None)
        if month is not None and not MONTH.match(month):
            raise MiniGameError(422, "bad_period", "The period is all, month or YYYY-MM.")
        scores: dict[str, list[float]] = {}
        for s in self.store.submissions(key, month=month, ranked_only=True):
            scores.setdefault(s.account_id, []).append(s.score)
        need = spec.min_plays_all if month is None else spec.min_plays_month
        rows = []
        for account, values in scores.items():
            if len(values) < need:
                continue
            value = sum(values) if spec.metric == "sum" else sum(values) / len(values)
            rows.append({"account_id": account, "name": names(account) if names else account, "plays": len(values), "value": round(value, 4)})
        rows.sort(key=lambda r: (-r["value"] if spec.higher_is_better else r["value"], -r["plays"], r["account_id"]))
        rank, prev = 0, None
        for i, r in enumerate(rows, 1):
            if (r["value"], r["plays"]) != prev:
                rank, prev = i, (r["value"], r["plays"])
            r["rank"] = rank
        return {"game": key, "period": period, "month": month, "metric": spec.metric, "higher_is_better": spec.higher_is_better, "unit": spec.unit,
                "min_plays": need, "rows": rows}

    def purge(self, key: str) -> None:
        self.store.purge(key)
