"""The rating of rated live games: Elo on BGA's scale (400 points), with a bigger K for a new account and a floor (docs/accounts_plan.md, "Rating formula").

- K is 40 for a player's first 20 rated games and 20 after that (BGA's own K is 20).
- A rating never drops below FLOOR (100). A player who is below it (a new account starts at 0) loses nothing in a lost game; the winner gains as usual.
"""
from dataclasses import dataclass

K = 20                                   # the K of an established player
K_NEW = 40                               # the K of a player in their first NEW_GAMES rated games
NEW_GAMES = 20
FLOOR = 100.0
MIN_RATED_TURNS = 4                      # a game that is conceded before this many turns were played (all players together) is not rated
MIN_LISTED_GAMES = 5                     # a player is on the ratings board after this many rated games


def k_for(rated_games: int) -> int:
    """The K of a player who has already played `rated_games` rated games."""
    return K_NEW if rated_games < NEW_GAMES else K


def expected(rating: float, opponent: float) -> float:
    """The chance (0 to 1) that a player of `rating` beats one of `opponent`."""
    return 1.0 / (1.0 + 10 ** ((opponent - rating) / 400.0))


def _move(rating: float, k: int, score: float, expect: float) -> float:
    after = rating + k * (score - expect)
    if after >= rating:
        return after
    return rating if rating < FLOOR else max(FLOOR, after)           # a loss: nothing below the floor, and never under it


def updated(rating_a: float, rating_b: float, score_a: float, games_a: int = NEW_GAMES, games_b: int = NEW_GAMES) -> tuple[float, float]:
    """The ratings after a game: `score_a` is 1 when A won, 0 when A lost, 0.5 for a draw; `games_*` the rated games each player has played so far (they set K).
    The default is an established player (K=20)."""
    ea = expected(rating_a, rating_b)
    return _move(rating_a, k_for(games_a), score_a, ea), _move(rating_b, k_for(games_b), 1.0 - score_a, 1.0 - ea)


@dataclass(frozen=True)
class RatingChange:
    game_id: str
    account_id: str
    seat: int
    opponent_id: str
    result: float                        # 1 win, 0.5 draw, 0 loss
    before: float
    after: float
    at: str = ""
    k: int = K

    @property
    def delta(self) -> float:
        return self.after - self.before
