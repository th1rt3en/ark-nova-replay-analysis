"""The cubes on the spaces of the special enclosures (engine/cubes.py): one per space an animal covers, an aquarium animal possibly spread over several aquariums."""
from ark_nova.engine import cubes
from ark_nova.engine.state import Building, GameState, PlayerState


def _zoo(*buildings) -> PlayerState:
    return PlayerState(seat=0, map_id="1", buildings=list(buildings))


def _in(p, b, key, totals=None):
    b.animals.append(key)
    cubes.place(p, b, key, totals)


def test_an_animal_covers_as_many_spaces_as_its_special_enclosure_size():
    small = Building(id=1, type="small-aquarium", x=7, y=0)
    p = _zoo(small)
    _in(p, small, "A542")                                    # Humphead Wrasse, Aquarium 2 (944055156 move 37: BGA shows 2 cubes)
    assert cubes.view(p, small) == [["A542", 2]]
    large = Building(id=2, type="large-aquarium", x=3, y=2)
    p = _zoo(large)
    _in(p, large, "A532")                                    # Zooplankton, Aquarium 0: no cube
    _in(p, large, "A530")                                    # Orange Clownfish, Aquarium 1
    assert cubes.view(p, large) == [["A530", 1]]


def test_without_the_log_the_chosen_aquarium_is_filled_first_then_the_others():
    large, tunnel = Building(id=1, type="large-aquarium", x=3, y=2), Building(id=2, type="underwater-tunnel", x=7, y=0)
    p = _zoo(large, tunnel)
    _in(p, large, "A544")                                    # Caribbean Reef Shark, Aquarium 3
    _in(p, large, "A530")
    _in(p, large, "A554")                                    # African Penguin, Aquarium 2: 1 space left in the large aquarium, the other cube goes to the tunnel
    assert cubes.view(p, large) == [["A544", 3], ["A530", 1], ["A554", 1]]
    assert cubes.view(p, tunnel) == [["A554", 1]]
    assert tunnel.animals == []                              # (the penguin lives in the large aquarium)


def test_the_log_decides_where_the_cubes_go():
    large, small = Building(id=5, type="large-aquarium", x=4, y=9), Building(id=13, type="small-aquarium", x=7, y=12)
    p = _zoo(large, small)
    _in(p, large, "A554", totals=[[4, 9, 1], [7, 12, 1]])    # 853899676 move 465: BGA puts 1 cube in each aquarium although the large one has room for both
    assert cubes.view(p, large) == [["A554", 1]] and cubes.view(p, small) == [["A554", 1]]


def test_releasing_a_spread_animal_frees_all_of_its_cubes():
    large, small = Building(id=5, type="large-aquarium", x=4, y=9), Building(id=13, type="small-aquarium", x=7, y=12)
    p = _zoo(large, small)
    _in(p, large, "A554", totals=[[4, 9, 1], [7, 12, 1]])
    large.animals.remove("A554")
    cubes.release(p, "A554")
    assert cubes.view(p, large) == [] and cubes.view(p, small) == []


def test_a_release_the_log_shows_in_another_aquarium_moves_the_cubes_of_the_others():
    large, small = Building(id=1, type="large-aquarium", x=0, y=0), Building(id=2, type="small-aquarium", x=5, y=5)
    p = _zoo(large, small)
    _in(p, large, "A530")                                    # 1 cube in the large aquarium
    _in(p, small, "A535", totals=[[5, 5, 1]])                # Sharknose Goby, 1 cube in the small one
    small.animals.remove("A535")
    cubes.release(p, "A535", totals=[[0, 0, 0]])             # BGA empties the large aquarium (its cubes belong to no animal): the clownfish's cube is now in the small one
    assert cubes.view(p, large) == [] and cubes.view(p, small) == [["A530", 1]]


def test_a_moved_animal_takes_its_cubes_along():
    old, new = Building(id=1, type="large-bird-aviary", x=0, y=0), Building(id=2, type="large-bird-aviary", x=5, y=4)
    p = _zoo(old, new)
    _in(p, old, "A509")
    old.animals.remove("A509")
    new.animals.append("A509")
    cubes.move(p, "A509", new, totals=[[0, 0, 0], [5, 4, 1]])
    assert cubes.view(p, old) == [] and cubes.view(p, new) == [["A509", 1]]


def test_a_state_saved_before_the_cubes_were_recorded_still_shows_them():
    large = Building(id=1, type="large-aquarium", x=3, y=2, animals=["A544", "A554"])
    assert cubes.view(_zoo(large), large) == [["A544", 3], ["A554", 2]]


def test_the_cubes_survive_a_round_trip_through_json():
    from ark_nova.engine.game import start_game
    from ark_nova.engine.state import GameConfig, SeedSpec
    st = start_game(GameConfig(marine_worlds=True, player_ids=["1", "2"], maps=["1", "1"], base_projects=["P101", "P102", "P103"]), SeedSpec(tail_seed=1))
    st.players[0].buildings.append(Building(id=99, type="large-aquarium", x=3, y=2, animals=["A554"], cubes={"A554": 1}))
    assert GameState.from_dict(st.to_dict()).players[0].buildings[-1].cubes == {"A554": 1}
