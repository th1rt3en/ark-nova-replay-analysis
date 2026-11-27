"""The cubes on the spaces of the special enclosures (engine/cubes.py): a COUNT per enclosure, no card keys (owner, 2026-11-25: no animal is tied to an
enclosure). An animal covers as many spaces as its special enclosure size; an aquarium animal's cubes may be spread over several aquariums."""
from ark_nova.engine import cubes
from ark_nova.engine.state import Building, GameState, PlayerState, upgrade_building


def _zoo(*buildings) -> PlayerState:
    return PlayerState(seat=0, map_id="1", buildings=list(buildings))


def test_an_animal_covers_as_many_spaces_as_its_special_enclosure_size():
    small = Building(id=1, type="small-aquarium", x=7, y=0)
    p = _zoo(small)
    cubes.place(p, small, "A542")                            # Humphead Wrasse, Aquarium 2 (944055156 move 37: BGA shows 2 cubes)
    assert small.cubes == 2
    large = Building(id=2, type="large-aquarium", x=3, y=2)
    p = _zoo(large)
    cubes.place(p, large, "A532")                            # Zooplankton, Aquarium 0: no cube
    cubes.place(p, large, "A530")                            # Orange Clownfish, Aquarium 1
    assert large.cubes == 1


def test_without_the_log_the_chosen_aquarium_is_filled_first_then_the_others():
    large, tunnel = Building(id=1, type="large-aquarium", x=3, y=2), Building(id=2, type="underwater-tunnel", x=7, y=0)
    p = _zoo(large, tunnel)
    cubes.place(p, large, "A544")                            # Caribbean Reef Shark, Aquarium 3
    cubes.place(p, large, "A530")                            # Orange Clownfish, Aquarium 1
    cubes.place(p, large, "A554")                            # African Penguin, Aquarium 2: 1 space left in the large aquarium, the other cube goes to the tunnel
    assert (large.cubes, tunnel.cubes) == (5, 1)


def test_the_log_decides_where_the_cubes_go():
    large, small = Building(id=5, type="large-aquarium", x=4, y=9), Building(id=13, type="small-aquarium", x=7, y=12)
    p = _zoo(large, small)
    cubes.place(p, large, "A554", totals=[[4, 9, 1], [7, 12, 1]])    # 853899676 move 465: BGA puts 1 cube in each aquarium although the large one has room for both
    assert (large.cubes, small.cubes) == (1, 1)


def test_releasing_an_aquarium_animal_takes_its_cubes_from_the_chosen_aquarium_then_the_others():
    small, large = Building(id=1, type="small-aquarium", x=8, y=1), Building(id=2, type="large-aquarium", x=2, y=3)
    p = _zoo(small, large)
    small.cubes, large.cubes = 2, 2                         # a clownfish's cube and a shark's three cubes, say: the cubes belong to no animal
    cubes.release(p, "A544", b=small)                        # the shark (Aquarium 3) leaves from the small aquarium the player chose: 2 there, 1 from the large one
    assert (small.cubes, large.cubes) == (0, 1)


def test_a_release_the_log_shows_sets_the_counts():
    large, small = Building(id=1, type="large-aquarium", x=0, y=0), Building(id=2, type="small-aquarium", x=5, y=5)
    p = _zoo(large, small)
    large.cubes, small.cubes = 1, 1
    cubes.release(p, "A535", totals=[[0, 0, 0]])             # BGA empties the large aquarium: the counts are BGA's
    assert (large.cubes, small.cubes) == (0, 1)


def test_a_moved_animal_takes_its_cubes_along():
    aviary_old, aviary_new = Building(id=1, type="large-bird-aviary", x=0, y=0), Building(id=2, type="large-bird-aviary", x=4, y=4)
    p = _zoo(aviary_old, aviary_new)
    cubes.place(p, aviary_old, "A408") if cubes.spec_size("A408", "large-bird-aviary") else None
    aviary_old.cubes = 2
    cubes.move(p, "A426", aviary_old, aviary_new)           # (any animal: the cubes of its special size move; 1 when it has no special size)
    moved = cubes.spec_size("A426", "large-bird-aviary") or cubes.size_of("A426")
    assert aviary_old.cubes == max(0, 2 - moved) and aviary_new.cubes == moved


def test_a_state_saved_before_the_change_still_loads():
    old = {"id": 3, "type": "small-aquarium", "x": 1, "y": 1, "rotation": 0, "animal": None, "animals": ["A542"], "cubes": {}}
    assert upgrade_building(old)["cubes"] == 2 and upgrade_building(old)["occupied"] is False          # (an animal listed without recorded cubes: its size)
    std = {"id": 4, "type": "size-3", "x": 2, "y": 2, "rotation": 0, "animal": "A401", "animals": [], "cubes": {}}
    assert upgrade_building(std)["occupied"] is True and "animal" not in upgrade_building(std)
    per_card = {"id": 5, "type": "large-aquarium", "x": 3, "y": 3, "rotation": 0, "animal": None, "animals": ["A544"], "cubes": {"A544": 2, "A530": 1}}
    assert upgrade_building(per_card)["cubes"] == 3


def test_the_counts_survive_a_round_trip_through_json():
    from ark_nova.engine.game import new_game
    st = new_game({"game_mode": "random-mirrored", "marine_worlds_flag": True}, ["1", "2"], 4)
    st.players[0].buildings.append(Building(id=99, type="large-aquarium", x=0, y=0, cubes=4))
    st.players[0].buildings.append(Building(id=98, type="size-2", x=3, y=3, occupied=True))
    back = GameState.from_dict(st.to_dict())
    got = {b.id: (b.occupied, b.cubes) for b in back.players[0].buildings if b.id in (98, 99)}
    assert got == {99: (False, 4), 98: (True, 0)}
