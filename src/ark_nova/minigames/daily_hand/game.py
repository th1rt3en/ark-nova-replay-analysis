"""Daily starting hand: the viewer shows the moment just before one player's initial selection (their dealt hand and endgame cards, their map, everything public), with both
players' names hidden and their Elo shown; the player picks the cards to keep (hand size minus the 4 discards: 4, or 5 on Map 14) and scores one point per card the original kept.

The moment stored is only `{"seat": 0|1}`: the step is found in the log (the last step whose prompt is the initial discard) and the answer is the hand of the next step.
"""
import random

from ark_nova.minigames.platform.contract import GameLog, LeaderboardSpec, Score, SubmissionError
from ark_nova.replay.view import _card_keys, build_replay_view, card_catalog
from ark_nova.storage.index import TableRecord

HIDDEN = "?"
PRIVATE_LISTS = ("hand", "endgame_hand", "initial_offer", "stored", "pouched")
_VIEWS: dict[int, dict] = {}                           # table id -> {"steps": the first steps of the replay view, "view": the view without steps}: building one takes seconds


def _early_view(log: GameLog) -> dict:
    """The replay view of the table cut after the initial selection: only the first steps are kept (they are all this game needs)."""
    hit = _VIEWS.get(log.table_id)
    if hit is None:
        view = build_replay_view(log.raw, log.record or TableRecord(log.table_id, "x"), first_moves=60)       # (the engine does not play it: only the first steps are needed)
        steps = view.pop("steps")
        dealt = [i for i, s in enumerate(steps) if isinstance(s["state"].get("prompt"), dict) and s["state"]["prompt"].get("kind") == "initial_discard" and any(p["hand"] for p in s["state"]["players"])]
        if not dealt or dealt[-1] + 1 >= len(steps):
            raise ValueError("the log has no initial selection to guess")
        j = dealt[-1]
        if len(_VIEWS) > 8:
            _VIEWS.clear()
        hit = _VIEWS[log.table_id] = {"view": view, "dealt": steps[j], "after": steps[j + 1]}
    return hit


def _redact(state: dict, pov: int) -> dict:
    """The state as the player of seat `pov` saw it: the other player's cards are card backs, no deck, no discard, no prompt, no stats."""
    out = dict(state)
    for k in ("main_deck", "endgame_deck", "main_discard", "endgame_discard"):
        out[k] = []
    out.update({"main_deck_known": 0, "draft": None, "prompt": None, "pending": [], "stats": {}, "result": None, "end_triggered_by": None, "map_select": None})
    players = []
    for i, p in enumerate(state["players"]):
        q = dict(p)
        if i != pov:
            for k in PRIVATE_LISTS:
                q[k] = [HIDDEN] * len(p.get(k) or [])
            q["under"] = {k: [HIDDEN] * len(v) for k, v in (p.get("under") or {}).items()}
        players.append(q)
    out["players"] = players
    return out


class DailyHand:
    key = "daily_hand"
    builder_version = "2"
    allow_past = False
    leaderboard = LeaderboardSpec(metric="sum", higher_is_better=True, unit="points")

    def pick_moment(self, source, log, rng):
        return {"seat": rng.randrange(2)}

    def build_public(self, moment, log):
        seat = moment["seat"]
        hit = _early_view(log)
        view, step = hit["view"], hit["dealt"]
        state = _redact(step["state"], seat)
        # the order of the log (the order the cards were drawn in) is not shown: the hand is sorted, so its order tells nothing about what was kept
        for k in ("hand", "initial_offer"):
            state["players"][seat][k] = sorted(state["players"][seat][k])
        hand = list(state["players"][seat]["hand"])
        keep = len(hand) - step["state"]["prompt"]["args"]["count"]
        if keep < 1:
            raise ValueError("nothing to keep")
        elo = [log.elos.get(p["id"]) for p in view["players"]]
        names = [f"Player {i + 1}" + (f" (Elo {e})" if e is not None else "") for i, e in enumerate(elo)]
        players = [{"seat": p["seat"], "id": f"seat{p['seat']}", "name": names[p["seat"]], "color": p.get("color")} for p in view["players"]]
        keys: set = set()
        _card_keys([state], keys)
        _card_keys(view["base_projects"], keys)
        replay = {"table_id": None, "marine_worlds": view["marine_worlds"], "players": players, "maps": view["maps"], "base_projects": view["base_projects"], "result": [],
                  "setup_steps": 0, "cards": card_catalog(keys, bool(view["marine_worlds"])), "engine": {},
                  "steps": [{"move_id": 0, "label": "", "state": state, "engine": {"source": "log", "status": "", "detail": ""}, "options": None, "actor": None, "label_pov": None, "index": 0, "fork": False}]}
        return {"pov": seat, "hand": hand, "keep": keep, "elo": elo, "replay": replay}

    def answer(self, moment, log):
        hit = _early_view(log)
        seat = moment["seat"]
        dealt = hit["dealt"]["state"]["players"][seat]["hand"]
        kept = [c for c in dealt if c in set(hit["after"]["state"]["players"][seat]["hand"])]
        if not kept or len(kept) >= len(dealt):
            raise ValueError("the selection cannot be read from the log")
        return {"keep": kept}

    def validate(self, public, payload):
        picks = payload.get("picks") if isinstance(payload, dict) else None
        if not isinstance(picks, list) or not all(isinstance(c, str) for c in picks):
            raise SubmissionError(f"Pick {public['keep']} cards to keep.")
        if len(picks) != public["keep"] or len(set(picks)) != len(picks):
            raise SubmissionError(f"Pick exactly {public['keep']} different cards to keep.")
        if any(c not in public["hand"] for c in picks):
            raise SubmissionError("You can only keep cards of the starting hand.")
        return {"picks": [c for c in public["hand"] if c in set(picks)]}

    def score(self, answer, payload):
        hits = [c for c in payload["picks"] if c in set(answer["keep"])]
        return Score(float(len(hits)), {"matches": hits, "of": len(answer["keep"])})

    def day_stats(self, payloads, public):
        counts = {c: 0 for c in public["hand"]}
        for p in payloads:
            for c in p["picks"]:
                if c in counts:
                    counts[c] += 1
        return {"players": len(payloads), "pick_counts": counts, "pick_rates": {c: (n / len(payloads) if payloads else 0.0) for c, n in counts.items()}}

    def reveal(self, public, answer, payload, score, stats):
        return {"original": answer["keep"], "picks": payload["picks"], "matches": score.detail["matches"], "of": score.detail["of"], "stats": stats}


GAME = DailyHand()
