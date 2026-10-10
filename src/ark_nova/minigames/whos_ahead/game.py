"""Who's ahead: the viewer shows a position at the start of a turn, between 35% and 85% of the turns of the game, with everything of both players visible (hands, endgame
cards, boards, tracks) except the draw piles and the discard (only their sizes), both names hidden and their Elo before the table shown. The player gives the chance that each
player wins, and optionally of a tie, as whole percentages that add up to 100. The score is the Brier score of the three outcomes (0 is perfect, lower is better).

The moment stored is `{"turn": k, "moves": n}`: the k-th turn of the log, and how many moves of the log come before it. The answer (the winner and the scores) is read from the log.
"""
import dataclasses  # noqa: F401  (kept for the dataclass-based log objects the viewer returns)

from ark_nova.minigames.platform.contract import LeaderboardSpec, Score, SubmissionError
from ark_nova.replay.view import _card_keys, build_replay_view, card_catalog
from ark_nova.storage.index import TableRecord

SPAN = (0.35, 0.85)                                    # the part of the game (by turns) the position comes from
_VIEWS: dict[tuple, dict] = {}


def _view(log, moves: int) -> dict:
    """The replay view of the first `moves` moves (log-built states, the engine does not play them), kept for the next call on the same table."""
    k = (log.table_id, moves)
    if k not in _VIEWS:
        if len(_VIEWS) > 6:
            _VIEWS.clear()
        _VIEWS[k] = build_replay_view(log.raw, log.record or TableRecord(log.table_id, "x"), first_moves=moves)
    return _VIEWS[k]


def _outcome(log, view: dict) -> dict:
    """The real result by seat: the winner (0, 1 or None for a tie) and the final scores."""
    parsed = log.parsed
    if parsed.conceded or not parsed.result or len(parsed.result) != 2:
        raise ValueError("the game was conceded or has no result")
    rows = {str(r["id"]): r for r in parsed.result}
    seats = [rows[p["id"]] for p in view["players"]]
    scores = [int(r["score"]) for r in seats]
    if any(r.get("tie") for r in seats) or scores[0] == scores[1] and seats[0]["rank"] == seats[1]["rank"]:
        return {"winner": None, "scores": scores}
    return {"winner": min((0, 1), key=lambda i: int(seats[i]["rank"])), "scores": scores}


class WhosAhead:
    key = "whos_ahead"
    builder_version = "1"
    allow_past = True
    leaderboard = LeaderboardSpec(metric="mean", higher_is_better=False, min_plays_month=3, min_plays_all=10, unit="Brier score")

    def pick_moment(self, source, log, rng):
        parsed = log.parsed
        markers = parsed.turn_markers
        if parsed.conceded or not parsed.result or len(markers) < 20:
            raise ValueError("the game was conceded or is too short")
        k = rng.randrange(int(len(markers) * SPAN[0]), int(len(markers) * SPAN[1]) + 1)
        order = markers[k][0]
        moves = next(i for i, m in enumerate(parsed.moves) if m.events and min(e.order for e in m.events) > order)      # the moves before the turn starts
        return {"turn": k, "moves": moves}

    def build_public(self, moment, log):
        view = _view(log, moment["moves"])
        state = dict(view["steps"][-1]["state"])
        for k in ("main_deck", "endgame_deck", "main_discard", "endgame_discard"):
            state[k] = []
        state.update({"main_deck_known": 0, "draft": None, "prompt": None, "pending": [], "stats": {}, "result": None, "end_triggered_by": None, "map_select": None})
        elo = [log.elos.get(p["id"]) for p in view["players"]]
        names = [f"Player {i + 1}" + (f" (Elo {e})" if e is not None else "") for i, e in enumerate(elo)]
        players = [{"seat": p["seat"], "id": f"seat{p['seat']}", "name": names[p["seat"]], "color": p.get("color")} for p in view["players"]]
        keys: set = set()
        _card_keys([state], keys)
        _card_keys(view["base_projects"], keys)
        replay = {"table_id": None, "marine_worlds": view["marine_worlds"], "players": players, "maps": view["maps"], "base_projects": view["base_projects"], "result": [],
                  "setup_steps": 0, "cards": card_catalog(keys, bool(view["marine_worlds"])), "engine": {},
                  "steps": [{"move_id": 0, "label": "", "state": state, "engine": {"source": "log", "status": "", "detail": ""}, "options": None, "actor": None, "label_pov": None, "index": 0, "fork": False}]}
        return {"pov": None, "elo": elo, "to_act": state.get("active_player"), "replay": replay}

    def answer(self, moment, log):
        return _outcome(log, _view(log, moment["moves"]))

    def validate(self, public, payload):
        if not isinstance(payload, dict):
            raise SubmissionError("Enter the chances of the three outcomes.")
        vals = []
        for k, default in (("p1", None), ("p2", None), ("tie", 0)):
            v = payload.get(k, default)
            if isinstance(v, bool) or not isinstance(v, (int, float)) or v != int(v) or not 0 <= v <= 100:
                raise SubmissionError("Each chance is a whole number from 0 to 100.")
            vals.append(int(v))
        if sum(vals) != 100:
            raise SubmissionError(f"The chances must add up to 100 (they add up to {sum(vals)}).")
        return {"p1": vals[0], "p2": vals[1], "tie": vals[2]}

    def score(self, answer, payload):
        win = answer["winner"]
        outcome = "tie" if win is None else ("p1" if win == 0 else "p2")
        brier = sum((payload[k] / 100 - (1.0 if k == outcome else 0.0)) ** 2 for k in ("p1", "p2", "tie"))
        return Score(round(brier, 4), {"outcome": outcome})

    def day_stats(self, payloads, public):
        n = len(payloads)
        return {"players": n, **{f"mean_{k}": (round(sum(p[k] for p in payloads) / n, 1) if n else None) for k in ("p1", "p2", "tie")}}

    def reveal(self, public, answer, payload, score, stats):
        return {"winner": answer["winner"], "scores": answer["scores"], "picks": payload, "outcome": score.detail["outcome"], "baseline": 0.5, "stats": stats}


GAME = WhosAhead()
