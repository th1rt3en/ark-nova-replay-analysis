"""A tiny mini game used to test the platform alone (no real log, no engine): keep 2 of 6 cards and score the overlap with what the original player kept."""
from ark_nova.minigames.platform.contract import GameLog, LeaderboardSpec, Score, SubmissionError

NAMES = [("101", "Alice"), ("202", "Bob")]


def fake_log(table_id: int = 555000, keep=(("c1", "c2"), ("c3", "c4"))) -> GameLog:
    raw = {"table_id": table_id, "cards": ["c1", "c2", "c3", "c4", "c5", "c6"], "keep": [list(k) for k in keep]}
    return GameLog(raw, table_id, players=list(NAMES))


class Example:
    key = "example"
    builder_version = "1"
    allow_past = False
    leaderboard = LeaderboardSpec(metric="sum", higher_is_better=True)

    def pick_moment(self, source, log, rng):
        return {"seat": rng.randrange(2)}

    def build_public(self, moment, log):
        return {"cards": log.raw["cards"], "keep": 2, "label": "Player %d" % (moment["seat"] + 1)}

    def answer(self, moment, log):
        return {"keep": log.raw["keep"][moment["seat"]]}

    def validate(self, public, payload):
        picks = payload.get("picks") if isinstance(payload, dict) else None
        if not isinstance(picks, list) or len(set(picks)) != public["keep"] or any(p not in public["cards"] for p in picks):
            raise SubmissionError("pick 2 different cards of the hand")
        return {"picks": sorted(picks)}

    def score(self, answer, payload):
        hits = sorted(set(payload["picks"]) & set(answer["keep"]))
        return Score(float(len(hits)), {"hits": hits})

    def day_stats(self, payloads, public):
        counts = {c: 0 for c in public["cards"]}
        for p in payloads:
            for c in p["picks"]:
                counts[c] += 1
        return {"players": len(payloads), "pick_counts": counts}

    def reveal(self, public, answer, payload, score, stats):
        return {"original": answer["keep"], "stats": stats}


class Brier(Example):
    """The same game, ranked the other way round (lower is better, mean): to test both kinds of leaderboard."""
    key = "brier"
    allow_past = True
    leaderboard = LeaderboardSpec(metric="mean", higher_is_better=False, min_plays_month=2, min_plays_all=2, unit="brier")


GAME = Example()
