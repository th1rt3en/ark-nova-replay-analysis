"""Releases and moves into a new special enclosure follow the cubes, not the engine's per-card lists (2026-11-22, owner: Ark Nova has no concept of which animal
lives in which enclosure; a release takes the animal's cubes off the special enclosures first, an aquarium animal's from an aquarium of the player's choice that
satisfies its rock requirement).

Fixtures: plain self-play game seed 210000579, seat 0, map 5a (fixtures/release_cubes_210000579_*.json, GameState.to_dict):
  release: Serengeti National Park releases the African Penguin (Aquarium 2, rock 1); the zoo's Large Aquarium (2,5) holds 5 cubes and touches rock, the
           Underwater Tunnel (1,4) is empty. The old bookkeeping took nothing off the Large Aquarium and dropped the Loggerhead Sea Turtle from its list.
  movein:  the Reptile House (2,11) was just built (state made by the old engine: the Large Aquarium still shows 5 cubes); the move-in crashed (the Loggerhead
           Sea Turtle was offered "from the Large Aquarium" and was not on its list).
"""
import json
from pathlib import Path

from ark_nova.engine import cubes, game
from ark_nova.engine.state import GameState

FIX = Path(__file__).parent / "fixtures"
TURTLE, PENGUIN = "A551", "A554"


def _load(name):
    return GameState.from_dict(json.loads((FIX / f"release_cubes_210000579_{name}.json").read_text(encoding="utf-8")))


def _at(p, x, y):
    return next(b for b in p.buildings if (b.x, b.y) == (x, y))


def test_release_takes_the_animals_cubes_off_the_chosen_aquarium():
    st = _load("release")
    p = st.players[0]
    aq = _at(p, 2, 5)
    assert cubes.used(p, aq) == 5
    rel = [a for a in game.legal_actions(st) if a.player == 0 and a.args.get("release") == PENGUIN]
    assert [a.args["building"] for a in rel] == [[2, 5]]            # the only aquarium that holds cubes and meets the Penguin's rock need
    st = game.apply(st, rel[0])
    p = st.players[0]
    assert PENGUIN not in p.animals and TURTLE in p.animals
    assert cubes.used(p, _at(p, 2, 5)) == 3                          # 5 - the Penguin's 2
    assert cubes.used(p, _at(p, 1, 4)) == 0


def test_move_in_takes_cubes_from_a_special_enclosure_that_holds_them():
    st = _load("movein")
    p = st.players[0]
    moves = [a for a in game.legal_actions(st) if a.player == 0 and a.kind == "choose_effect" and a.args.get("move") == TURTLE]
    assert [a.args["from"] for a in moves] == [[2, 5]]               # the Loggerhead Sea Turtle (Aquarium 3 / Reptile House 3, never in a standard enclosure)
    st = game.apply(st, moves[0])
    p = st.players[0]
    assert cubes.used(p, _at(p, 2, 11)) == 3                         # the Reptile House
    assert cubes.used(p, _at(p, 2, 5)) == 2                          # the Large Aquarium: 5 - 3
    assert TURTLE in p.animals
