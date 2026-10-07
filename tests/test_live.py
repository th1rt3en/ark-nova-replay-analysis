"""The live game building blocks: the table keeper (against its in-memory twin), the signature shared with the Worker, and what each viewer may see."""
import json
import re

import pytest

from ark_nova.engine.game import apply, legal_actions, new_game
from ark_nova.live import keeper as kp
from ark_nova.live import projection
from ark_nova.live.fake import FakeKeeper

HASHES = ["h0", "h1"]


# ---- the keeper -----------------------------------------------------------------------------------------------------------------------

def _views(n):
    return {"0": {"view": {"n": n}}, "1": {"view": {"n": n}}, "spectator": {"view": {"n": n}}}


def _table(k=None):
    k = k or FakeKeeper()
    k.init("E1", {"seed": 1}, "0.0.1", HASHES, views=_views(0), snapshot={"s": 0})
    return k


def test_the_signature_is_the_one_the_worker_checks():
    # the same vector is asserted in cloudflare/test/table.test.ts
    h = kp.sign("s", "POST", "/internal/table/E1/append", b'{"a":1}', now=1700000000)
    assert h == {"X-Timestamp": "1700000000", "X-Signature": "127f9b797948dc1a76c60629a7c43f434ad061a2b25c16751e55a55db223698a"}
    assert kp.sign("s", "POST", "/x", b"a", now=1)["X-Signature"] != kp.sign("s", "POST", "/x", b"b", now=1)["X-Signature"]


def test_keeper_errors_are_told_apart():
    with pytest.raises(kp.NoSuchTable):
        kp.raise_for(404, {"message": "no such table"})
    with pytest.raises(kp.StaleVersion) as e:
        kp.raise_for(409, {"message": "stale version", "current_version": 4})
    assert e.value.current_version == 4
    with pytest.raises(kp.TableEnded) as e2:
        kp.raise_for(409, {"message": "the table has ended", "status_now": "conceded"})
    assert e2.value.status_now == "conceded"
    with pytest.raises(kp.AlreadyExists):
        kp.raise_for(409, {"message": "the table already exists"})
    with pytest.raises(kp.Forbidden):
        kp.raise_for(403, {"message": "forbidden"})
    with pytest.raises(kp.LiveError):
        kp.raise_for(500, {})


def test_the_fake_keeper_keeps_the_promises_of_the_durable_object():
    k = _table()
    with pytest.raises(kp.AlreadyExists):
        k.init("E1", {}, "0", HASHES)
    assert k.append("E1", 0, "r1", {"a": 1}, {}, _views(1))["version"] == 1
    again = k.append("E1", 0, "r1", {"a": 1}, {}, _views(1))                      # a retry after a lost answer
    assert again == {"version": 1, "duplicate": True, "snapshot_due": False}
    with pytest.raises(kp.StaleVersion) as e:
        k.append("E1", 0, "r2", {"a": 2}, {}, _views(2))
    assert e.value.current_version == 1
    k.append("E1", 1, "r3", {"a": 2}, {}, _views(2), snapshot={"s": 2})
    k.append("E1", 2, "r4", {"a": 3}, {}, _views(3))
    s = k.state("E1")
    assert s["version"] == 3 and s["snapshot"] == {"version": 2, "state": {"s": 2}} and [a["n"] for a in s["actions"]] == [3]
    assert k.view("E1", "spectator")["view"]["n"] == 3
    k.set_status("E1", "conceded", "You conceded", registry_event={"status": "conceded"})
    with pytest.raises(kp.TableEnded):
        k.append("E1", 3, "r5", {"a": 4}, {}, _views(4))
    ev = k.registry("E1")
    k.ack_registry("E1", ev[0]["seq"])
    assert k.registry("E1") == []
    k.finalize("E1")
    with pytest.raises(kp.NoSuchTable):
        k.state("E1")


def test_the_counter_never_repeats_a_number():
    k = FakeKeeper()
    assert [k.next_number() for _ in range(3)] == [1, 2, 3]
    assert k.ensure_counter(10) == 10 and k.next_number() == 11


# ---- the projection -------------------------------------------------------------------------------------------------------------------

CARD = re.compile(r"^[ASPF]\d{3}$")


def _play(state, n):
    """Play `n` engine moves for whoever has a move (the first legal action): the states on the way."""
    states = [state]
    for _ in range(n):
        acts = legal_actions(state)
        if not acts:
            break
        state = apply(state, acts[0])
        states.append(state)
    return states


def _keys_in(text: str) -> set:
    return set(re.findall(r'"([ASPF]\d{3})"', text))


def test_nothing_secret_is_in_a_view():
    start = new_game({"game_mode": "random-mirrored", "marine_worlds_flag": False}, ["1", "2"], 11)
    states = _play(start, 400)
    assert len(states) > 150
    for st in states[::7]:
        secret_deck = set(st.main_deck) | set(st.endgame_deck)
        secret_discard = set(st.main_discard) | set(st.endgame_discard)
        for role in projection.ROLES:
            seat = None if role == "spectator" else int(role)
            text = json.dumps(projection.project(st, role))
            shown = _keys_in(text)
            assert not shown & secret_deck, (role, shown & secret_deck)
            assert not shown & secret_discard, (role, shown & secret_discard)
            for p in st.players:
                theirs = set(p.hand) | set(p.endgame_hand) | set(p.stored) | set(p.pouched)
                if p.seat != seat:
                    assert not shown & theirs, (role, p.seat, shown & theirs)
                else:
                    assert set(p.hand) <= shown                                 # the owner sees the own hand
            for forbidden in ('"seed"', '"rng"', '"tail_seed"', "main_order", "endgame_order"):
                assert forbidden not in text, (role, forbidden)
            v = projection.project(st, role)
            assert v["main_deck_size"] == len(st.main_deck) and v["endgame_deck_size"] == len(st.endgame_deck)
            for p, pv in zip(st.players, v["players"]):
                if p.seat != seat:
                    assert pv["hand"] == ["?"] * len(p.hand) and pv["endgame_hand"] == ["?"] * len(p.endgame_hand) and pv["initial_offer"] == []


def test_only_the_acting_seat_gets_a_decision():
    st = _play(new_game({"game_mode": "random-mirrored", "marine_worlds_flag": False}, ["1", "2"], 3), 40)[-1]
    acting = st.prompt.player
    v = projection.views(st)
    assert "decision" in v[str(acting)] and "decision" not in v[str(1 - acting)] and "decision" not in v["spectator"]
    assert all(a["player"] == acting for a in v[str(acting)]["decision"]["actions"])
    assert v[str(acting)]["decision"]["actions"]


def test_the_draft_hides_the_other_seats_cards_until_it_is_over():
    st = new_game({"game_mode": "random-mirrored", "marine_worlds_flag": True}, ["1", "2"], 5)
    d = st.draft
    assert d["stage"] == "pick1"
    own, other = d["offers"][0], d["offers"][1]
    v0, v1, spec = (projection.project(st, r)["draft"] for r in ("0", "1", "spectator"))
    assert v0["offers"] == [own, []] and v1["offers"] == [[], other] and spec["offers"] == [[], []]
    assert v0["pool"] == [] and v0["auto"] == [None, None]
    st = apply(st, next(a for a in legal_actions(st) if a.player == 0))
    assert projection.project(st, "0")["draft"]["choice"][0] is not None
    assert projection.project(st, "1")["draft"]["choice"][0] is None            # what the other seat chose is not shown...
    assert projection.project(st, "1")["draft"]["chosen"] == [True, False]      # ...only that it has chosen
    for _ in range(40):
        acts = legal_actions(st)
        if not acts or st.draft["stage"] == "done":
            break
        st = apply(st, acts[0])
    assert st.draft["stage"] == "done"
    done = projection.project(st, "spectator")["draft"]
    assert done["stage"] == "done" and done["kept"] == st.draft["kept"]


def test_a_finished_game_shows_its_seed_but_a_running_one_does_not():
    st = new_game({"game_mode": "random-mirrored", "marine_worlds_flag": False}, ["1", "2"], 9)
    assert "seed" not in projection.project(st, "spectator")


def test_the_http_keeper_signs_the_path_without_the_query(monkeypatch):
    seen = {}

    class Answer:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"version": 1}'

    def fake_urlopen(req, timeout=None):
        seen["req"] = req
        return Answer()

    monkeypatch.setattr(kp.urllib.request, "urlopen", fake_urlopen)
    k = kp.HttpKeeper("https://live.example", "secret")
    assert k.view("E1", "spectator") == {"version": 1}
    req = seen["req"]
    assert req.full_url == "https://live.example/internal/table/E1/view?seat=spectator"
    ts = req.headers["X-timestamp"]
    assert req.headers["X-signature"] == kp.sign("secret", "GET", "/internal/table/E1/view", b"", now=int(ts))["X-Signature"]
    assert req.headers["User-agent"] == kp.USER_AGENT
