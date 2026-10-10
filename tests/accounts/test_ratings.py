"""The rating of rated games: the formula, and the stores that keep ratings, history, the board and deleted accounts."""
import pytest

from ark_nova.accounts.rating import FLOOR, K, K_NEW, MIN_LISTED_GAMES, NEW_GAMES, RatingChange, expected, k_for, updated
from ark_nova.accounts.store import Account, MemoryStore, SqliteStore


@pytest.fixture(params=["memory", "sqlite"])
def store(request):
    return MemoryStore() if request.param == "memory" else SqliteStore(":memory:")


def make(store, name, rating=0.0, bga=None):
    acc = Account("", "new", name, name.lower(), "h", "r", "2026-10-10T00:00:00+00:00", "", rating if bga else None, rating)
    return store.create_account(acc, bga)


def change(game, a, b, seat, result, before, after, at="2026-10-11T10:00:00+00:00"):
    return RatingChange(game, a, seat, b, result, before, after, at)


def test_k_is_40_for_a_new_account_and_20_after_20_rated_games():
    assert (K, K_NEW, NEW_GAMES, FLOOR) == (20, 40, 20, 100.0)
    assert [k_for(n) for n in (0, 1, 19, 20, 21, 500)] == [40, 40, 40, 20, 20, 20]


def test_the_formula_is_elo_on_the_400_point_scale():
    assert expected(1000, 1000) == 0.5 and round(expected(1200, 1000), 4) == 0.7597 and round(expected(1000, 1200), 4) == 0.2403
    assert updated(1000, 1000, 1) == (1010, 990) and updated(1000, 1000, 0) == (990, 1010) and updated(1000, 1000, 0.5) == (1000, 1000)          # two established players: K=20
    a, b = updated(1200, 1000, 1)
    assert round(a - 1200, 2) == 4.81 and round(b - 1000, 2) == -4.81                           # the favourite wins: a small gain
    a, b = updated(1200, 1000, 0)
    assert round(a - 1200, 2) == -15.19                                                           # the favourite loses: a big loss
    assert sum(updated(1337.5, 912.25, 0.5)) == pytest.approx(1337.5 + 912.25)                    # the points only move between the two (nobody is near the floor)


def test_a_new_account_moves_twice_as_far():
    assert updated(1000, 1000, 1, 0, 0) == (1020, 980)                                            # both new: K=40
    assert updated(1000, 1000, 1, 0, 30) == (1020, 990)                                           # each player has their own K
    assert updated(1000, 1000, 1, 19, 20) == (1020, 990) and updated(1000, 1000, 1, 20, 20) == (1010, 990)


def test_nobody_drops_below_100_and_a_player_below_it_loses_nothing():
    assert updated(0, 0, 1, 0, 0) == (20, 0)                                                      # a new account starts at 0: the loser keeps 0, the winner gains as usual
    a, b = updated(50, 500, 0, 20, 20)
    assert a == 50 and b == pytest.approx(500 + 20 * (1 - expected(500, 50)))                       # below the floor, a loss costs nothing; the winner gains the usual amount
    assert updated(100, 100, 0, 20, 20) == (100, 110)                                             # at the floor a loss would go below it: stays 100
    assert updated(105, 105, 0, 20, 20) == (100, 115)                                             # the loss is cut at 100 (-10 would give 95)
    assert updated(150, 150, 0, 20, 20) == (140, 160)                                             # above the floor: the usual
    assert updated(100, 100, 0.5, 20, 20) == (100, 100)                                           # a draw at equal ratings moves nobody
    a, b = updated(90, 400, 0.5, 20, 20)
    assert (round(a, 2), round(b, 2)) == (97.13, 392.87)                                          # a draw: the favourite gives a little to the underdog
    assert updated(0, 1000, 0.0, 0, 0)[0] == 0                                                   # whatever K: below the floor nothing is lost


def test_a_game_is_applied_once_and_moves_both_ratings(store):
    a, b = make(store, "Alice", 100.0, "11"), make(store, "Bob")
    ra, rb = updated(a.rating, b.rating, 1)
    out = store.commit_ratings("E1", [change("E1", a.id, b.id, 0, 1, a.rating, ra), change("E1", b.id, a.id, 1, 0, b.rating, rb)])
    assert out == "applied"
    assert store.ratings_of([a.id, b.id, "nope"]) == {a.id: (ra, 1, 1), b.id: (rb, 1, 0)}
    assert [(c.account_id, c.result, round(c.delta, 4)) for c in store.rating_changes("E1")] == [(a.id, 1, round(ra - 100, 4)), (b.id, 0, round(rb, 4))]
    again = store.commit_ratings("E1", [change("E1", a.id, b.id, 0, 1, ra, ra + 5), change("E1", b.id, a.id, 1, 0, rb, rb - 5)])
    assert again == "exists" and store.ratings_of([a.id])[a.id][0] == ra                       # a second try changes nothing


def test_a_rating_that_moved_in_between_is_refused(store):
    a, b, c = make(store, "Alice", 50.0, "21"), make(store, "Bob"), make(store, "Carol")
    ra, rb = updated(50.0, 0.0, 1)
    store.commit_ratings("E1", [change("E1", a.id, b.id, 0, 1, 50.0, ra), change("E1", b.id, a.id, 1, 0, 0.0, rb)])
    stale = [change("E2", a.id, c.id, 0, 1, 50.0, 60.0), change("E2", c.id, a.id, 1, 0, 0.0, -10.0)]           # read before E1 was applied
    assert store.commit_ratings("E2", stale) == "changed"
    assert store.rating_changes("E2") == [] and store.ratings_of([c.id])[c.id] == (0.0, 0, 0)               # nothing of it was written
    assert store.commit_ratings("E3", [change("E3", a.id, "ghost", 0, 1, ra, ra + 1), change("E3", "ghost", a.id, 1, 0, 0, -1)]) == "changed"


def test_history_newest_first_and_the_board(store):
    players = [make(store, n) for n in ("Ann", "Ben", "Cid")]
    ids = [p.id for p in players]
    ratings = {i: 0.0 for i in ids}
    for n in range(MIN_LISTED_GAMES):                                                          # Ann beats Ben five times
        ra, rb = updated(ratings[ids[0]], ratings[ids[1]], 1)
        assert store.commit_ratings(f"E{n}", [change(f"E{n}", ids[0], ids[1], 0, 1, ratings[ids[0]], ra, f"2026-10-1{n}T00:00:00+00:00"), change(f"E{n}", ids[1], ids[0], 1, 0, ratings[ids[1]], rb, f"2026-10-1{n}T00:00:00+00:00")]) == "applied"
        ratings[ids[0]], ratings[ids[1]] = ra, rb
    hist = store.rating_history(ids[0], limit=3)
    assert [h.game_id for h in hist] == ["E4", "E3", "E2"]
    board = store.ratings_board(MIN_LISTED_GAMES)
    assert [r["username"] for r in board] == ["Ann", "Ben"] and board[0]["rated_games"] == 5 and board[0]["rated_wins"] == 5 and board[1]["rated_wins"] == 0
    assert [r["username"] for r in store.ratings_board(0)] == ["Ann", "Ben", "Cid"]                  # (everybody with at least 0 games: best rating first; Ben and Cid are at 0, Ben has played more)
    assert [r["username"] for r in store.ratings_board(1, limit=1)] == ["Ann"]


def test_a_deleted_account_keeps_its_games_but_loses_its_name_and_passwords(store):
    a, b = make(store, "Alice"), make(store, "Bob")
    ra, rb = updated(0.0, 0.0, 1)
    store.commit_ratings("E1", [change("E1", a.id, b.id, 0, 1, 0.0, ra), change("E1", b.id, a.id, 1, 0, 0.0, rb)])
    from ark_nova.accounts.store import Session
    store.add_session(Session("t", a.id, "c", "e"))
    store.delete_account(a.id, "2026-10-12T00:00:00+00:00")
    gone = store.by_id(a.id)
    assert gone.username == "Deleted player" and gone.password_hash == "" and gone.recovery_hash == "" and gone.deleted_at and store.get_session("t") is None
    assert store.by_username("alice") is None and store.usernames([a.id]) == {a.id: "Deleted player"}
    assert len(store.rating_changes("E1")) == 2                                                  # the game and its rating stay
    assert make(store, "Alice").id != a.id                                                       # the name is free again
    assert a.id not in [r["id"] for r in store.ratings_board(0)]                                 # and the deleted account is not on the board
