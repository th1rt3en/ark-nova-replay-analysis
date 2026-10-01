"""Replay the setup of every log through the engine and compare with what the log shows."""
import glob
from pathlib import Path

import pytest

from ark_nova import data
from ark_nova.engine.actions import Action
from ark_nova.engine.game import apply, deck_cards, legal_actions, start_game
from ark_nova.engine.state import ActionCardChoice, GameConfig, Phase, SeedSpec
from ark_nova.parser import parse_log
from ark_nova.parser.deck import extract_exits, known_order
from ark_nova.parser.setup import extract_setup

LOGS = sorted(glob.glob(str(Path(__file__).resolve().parents[1] / "log_examples" / "*.json")))
pytestmark = pytest.mark.skipif(not LOGS, reason="log_examples not available")


def _game_from_log(path):
    parsed = parse_log(path)
    setup = extract_setup(parsed)
    exits = extract_exits(parsed)
    main, endgame = known_order(exits, "main"), known_order(exits, "endgame")
    mw = any(data.cards_by_key()[k]["source"] == "marine_worlds" for k in main + endgame)
    # maps are not in the log (BigQuery has them); infer map 14 from its start-of-game search, everything else is irrelevant here
    maps = ["14" if any("Map 14" in str(e.args.get("source", "")) for m in parsed.moves[:12] for e in m.events
                        if e.type == "pDrawCards" and e.player == pid and isinstance(e.args, dict)) else "1"
            for pid in setup.seats]
    base = deck_cards("base_project", mw)[:3]
    cfg = GameConfig(marine_worlds=mw, player_ids=setup.seats, maps=maps, base_projects=base,
                     action_cards=[[ActionCardChoice(t, v) for t, v in setup.action_cards[p]] for p in setup.seats])
    return parsed, setup, cfg, SeedSpec(tail_seed=1, main_order=main, endgame_order=endgame)


@pytest.mark.parametrize("path", [p for p in LOGS if "800035115" not in p])   # 800035115 is aborted before the deal
def test_setup_matches_log(path):
    parsed, setup, cfg, seed = _game_from_log(path)
    state = start_game(cfg, seed)
    a, b = setup.seats
    # deal: 8 dealt cards each, 2 endgame cards each
    assert state.players[0].hand[:8] == setup.dealt[a] and state.players[1].hand[:8] == setup.dealt[b]
    assert state.players[0].endgame_hand == setup.endgame[a] and state.players[1].endgame_hand == setup.endgame[b]
    # the initial discards (second player first, as some logs show; any order is legal)
    for pid in (b, a):
        state = apply(state, Action(setup.seats.index(pid), "initial_discard", {"cards": setup.discarded[pid]}))
    assert state.phase is Phase.TURN and state.active_player == 0
    for seat, pid in enumerate(setup.seats):
        expected = [k for k in setup.dealt[pid] + setup.start_extra.get(pid, []) if k not in setup.discarded[pid]]
        assert state.players[seat].hand == expected          # 4 cards (5 with a Map 14 person sponsor)
    assert state.display == setup.display
    for seat, pid in enumerate(setup.seats):
        assert [(c.type, c.variant) for c in state.players[seat].action_cards] == setup.action_cards[pid]


def test_legal_actions_in_setup():
    _, setup, cfg, seed = _game_from_log(LOGS[0])
    state = start_game(cfg, seed)
    acts = legal_actions(state)
    assert len(acts) == 140 and all(a.kind == "initial_discard" for a in acts)     # C(8,4) per player
