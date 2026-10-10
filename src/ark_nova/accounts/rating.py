"""The rating of rated live games: Elo with K=20, like BGA (docs/accounts_plan.md, "Rating formula")."""
from dataclasses import dataclass

K = 20
MIN_RATED_TURNS = 4                      # a game that is conceded before this many turns were played (all players together) is not rated
MIN_LISTED_GAMES = 5                     # a player is on the ratings board after this many rated games


def expected(rating: float, opponent: float) -> float:
    """The chance (0 to 1) that a player of `rating` beats one of `opponent`."""
    return 1.0 / (1.0 + 10 ** ((opponent - rating) / 400.0))


def updated(rating_a: float, rating_b: float, score_a: float) -> tuple[float, float]:
    """The ratings after a game: `score_a` is 1 when A won, 0 when A lost, 0.5 for a draw."""
    ea = expected(rating_a, rating_b)
    return rating_a + K * (score_a - ea), rating_b + K * ((1.0 - score_a) - (1.0 - ea))


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

    @property
    def delta(self) -> float:
        return self.after - self.before
