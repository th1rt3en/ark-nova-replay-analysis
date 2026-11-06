"""Source attribution and temporal regressions for replay sponsor hover statistics."""
import copy
import functools
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from ark_nova.engine import endgame
from ark_nova.engine.board import board, neighbours
from ark_nova.engine.game import start_game
from ark_nova.engine.state import Building, GameConfig, Phase, Prompt, SeedSpec
from ark_nova.parser import parse_log
from ark_nova.parser.model import Event, Move
from ark_nova.parser.sponsor_messages import accepted_protection_orders
from ark_nova.replay.sponsor_sources import sponsor_event_gains
from ark_nova.replay.sponsor_stats import SponsorLogStats, diversity_gains, sponsor_source_hints, tracked_sponsors
from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

LOGS = Path(__file__).resolve().parents[1] / 'log_examples'


def event(kind, order=1, pid='1', log='', **args):
    return Event(kind, {'player_id': pid, **args}, log=log, order=order)


def played(key, order=1, pid='1'):
    return event('playSponsor', order, pid, card={'id': key + '_Sponsor'})


def tracker(scoring_at=1000):
    timeline = SimpleNamespace(context=lambda order: {'phase': 'scoring' if order >= scoring_at else 'turn'})
    return SponsorLogStats(timeline, {'1': 0, '2': 1})


def totals(events, tr=None):
    tr = tr or tracker()
    out = {}
    for _, key, stat, n in tr.gains(Move(0, 1, 0, events)):
        out.setdefault(key, {})[stat] = out.get(key, {}).get(stat, 0) + n
    return out


def state(map_id='1'):
    s = start_game(GameConfig(False, ['1', '2'], [map_id, map_id], ['P101', 'P102', 'P103']), SeedSpec())
    s.phase = Phase.TURN
    s.current_action = {'seat': 0, 'type': 'sponsors'}
    return s


def test_requested_cards_are_tracked_without_enabling_unrequested_cards():
    keys = set(tracked_sponsors().values())
    assert {'S201', 'S206', 'S207', 'S209', 'S215', 'S216', 'S218', 'S220', 'S222', 'S225', 'S226'} <= keys
    assert {'S231', 'S232', 'S257', 'S272', 'S281'} <= keys
    assert not {'S254', 'S255', 'S256', 'S277'} & keys


@pytest.mark.parametrize('base,paid,effective,expected', [(4, 0, 4, 1), (3, 1, 4, 1), (4, 1, 5, 0), (5, 0, 5, 0)])
def test_veterinarian_uses_effective_strength_not_worker_space_or_double_counted_tokens(base, paid, effective, expected):
    events = [played('S203')]
    if paid:
        events.append(event('getBonuses', 2, source='increasing card strength', bonuses={'xtoken': -paid}))
    events += [event('chooseActionCard', 3, actionCard={'type': 'Association', 'strength': base}, strength=str(effective)),
               event('slideMeeples', 4, log='${player_name} supports a conservation project on ${slot} : ${card_name}', strength=5)]
    assert totals(events).get('S203', {}).get('effect_used', 0) == expected


def test_veterinarian_does_not_use_other_player_or_finished_action_strength():
    support = '${player_name} supports a conservation project on ${slot} : ${card_name}'
    events = [played('S203'), event('chooseActionCard', 2, actionCard={'type': 'Association', 'strength': 4}, strength=4),
              event('slideMeeples', 3, pid='2', log=support), event('actionCardCleanup', 4, log='finishing action'), event('slideMeeples', 5, log=support)]
    assert totals(events) == {}


def test_rewards_use_card_identity_owner_and_scoring_phase():
    events = [played('S207'), played('S214', 2), played('S225', 3), played('S229', 4),
              event('getBonuses', 5, card_id='S207_BasicResearch', card_name='Localized name', bonuses={'conservation': 4}),
              event('getBonuses', 6, pid='2', card_id='S207_BasicResearch', bonuses={'money': 8}),
              event('getBonuses', 7, card_id='S214_ExpertOnAfrica', bonuses={'appeal': 2}),
              event('getBonuses', 8, card_id='S225_QuarantineLab', bonuses={'xtoken': 1, 'conservation': 1}),
              event('getBonuses', 9, card_id='S229_ExpertInSmallAnimals', bonuses={'appeal': 6}),
              event('getBonuses', 1000, source='Expert On Africa', bonuses={'appeal': 3}),
              event('getBonuses', 1001, card_id='S225_QuarantineLab', bonuses={'conservation': 1})]
    got = totals(events)
    assert got == {'S207': {'conservation': 4}, 'S214': {'appeal_initial': 2, 'appeal_final': 3},
                   'S225': {'conservation': 1}, 'S229': {'appeal': 6}}


def test_breeding_counts_matching_tokens_not_whole_notification_and_not_twice():
    token = {'id': 68, 'type': 'token', 'location': 'S218_BreedingProgram'}
    events = [played('S218'), event('discardTokens', 2, n=3, meeples=[token, {'id': 9, 'type': 'bonus-icon', 'location': 'notepad'}]),
              event('discardTokens', 3, meeples=[token]), event('discardTokens', 4, meeples=[{**token, 'id': 69}])]
    assert totals(events)['S218']['tokens_spent'] == 2


def test_discount_stops_when_expert_is_sent_on_an_expedition():
    events = [played('S229'), event('buyAnimal', 2, card={'id': 'A409_SunBear', 'location': 'inPlay'}),
              event('discardCardsOnDisplay', 3, cards=[{'id': 'S229_ExpertInSmallAnimals'}]),
              event('buyAnimal', 4, card={'id': 'A409_SunBear', 'location': 'inPlay'})]
    assert totals(events)['S229']['saved'] == 3


@pytest.mark.parametrize('ability', ['Venom', 'Constriction', 'Hypnosis', 'Pilfering'])
def test_explicit_protection_requires_opposing_ability_owner(ability):
    text = '${player_name} is not affected by ' + ability + ' thanks to their Quarantine Lab sponsor card'
    events = [played('S225'), event('buyAnimal', 2, card={'id': 'A456_BarbaryMacaque'}), event('midmessage', 3, log=text),
              event('buyAnimal', 4, pid='2', card={'id': 'A483_BoaConstrictor'}),
              event('buyBuilding', 5, pid='2', card_id='S210_ExpertOnTheAmericas'), event('midmessage', 6, log=text)]
    assert totals(events)['S225']['attacks_prevented'] == 1


def packet(number, mid, events, channel='/table/t1'):
    return {'packet_id': number, 'move_id': mid, 'table_id': 1, 'time': '10', 'channel': channel, 'data': events}


def test_parser_preserves_only_protection_messages_and_prefers_public_duplicate():
    msg = {'type': 'midmessage', 'uid': 'protection', 'log': '${player_name} is not affected by Venom thanks to their Quarantine Lab sponsor card', 'args': {'player_id': '1'}}
    other = {'type': 'midmessage', 'uid': 'other', 'log': 'Unrelated information', 'args': {}}
    packets = [packet(1, 2, [msg], '/player/p1'), packet(2, 2, [other, msg]), packet(3, 2, [msg]),
               packet(4, 2, [{**msg, 'uid': 'second'}]), packet(5, 3, [msg])]
    assert accepted_protection_orders(packets) == frozenset({3, 5, 6})
    raw = {'data': {'players': [{'id': '1'}, {'id': '2'}], 'logs': packets}}
    parsed = parse_log(raw)
    assert [(m.move_id, len(m.events)) for m in parsed.moves] == [(2, 2), (3, 1)]
    assert all(e.type == 'midmessage' for m in parsed.moves for e in m.events)


def test_explicit_source_context_counts_science_lab_draws_without_engine_or_public_private_twins():
    raw = {'data': {'players': [{'id': '1'}, {'id': '2'}], 'logs': [
        packet(1, 1, [{'type': 'playSponsor', 'args': {'player_id': 1, 'card': {'id': 'S201_ScienceLab'}}}]),
        packet(2, 2, [{'type': 'gameStateChange', 'args': {'id': 27, 'active_player': '1', 'args': {'sourceId': 'S201_ScienceLab'}}}]),
        packet(20, 3, [{'type': 'gameStateChange', 'args': {'id': 35, 'active_player': '1', 'args': {}}}], '/player/p1'),
        packet(3, 3, [{'type': 'drawCards', 'uid': 'public', 'args': {'player_id': 1, 'n': 1}}]),
        packet(4, 3, [{'type': 'pDrawCards', 'uid': 'private', 'args': {'player_id': 1, 'cards': [{'id': 'A401_Cheetah'}]}}], '/player/p1'),
        packet(5, 4, [{'type': 'pDrawCards', 'uid': 'unrelated', 'args': {'player_id': 1, 'cards': [{'id': 'A402_Lion'}]}}], '/player/p1'),
        packet(6, 5, [{'type': 'gameStateChange', 'args': {'id': 27, 'active_player': '1', 'args': {'sourceId': 'S201_ScienceLab'}}}]),
        packet(7, 6, [{'type': 'snapCard', 'uid': 'range', 'args': {'player_id': 1, 'cards': [{'id': 'A403_Leopard'}]}}]),
    ]}}
    parsed = parse_log(raw)
    hints = sponsor_source_hints(raw, parsed)
    assert len(hints) == 2
    tr = SponsorLogStats(parsed.normal_turns, {'1': 0, '2': 1}, hints)
    got = [g for move in parsed.moves for g in tr.gains(move)]
    assert [(key, stat, n) for _, key, stat, n in got] == [('S201', 'cards_gained', 1), ('S201', 'cards_gained', 1)]


def test_archaeologist_source_context_dates_bonus_and_excludes_track_choices_and_duplicates():
    bonus = {'type': 'takeBonus', 'uid': 'extra', 'args': {'player_id': 1, 'bonus_desc': {'args': {'bonus_type': 'money', 'bonus_n': 5}}}}
    # a bonus of the same chain that the Archaeologist never offered (no source printed, like a bonus of a 5-conservation project) is not its gain
    unoffered = {'type': 'takeBonus', 'uid': 'unoffered', 'args': {'player_id': 1, 'bonus_desc': {'args': {'bonus_type': 'xtoken', 'bonus_n': 2}}}}
    offer = lambda typ, n: {'0': {'description': {'args': {'bonus_type': typ, 'bonus_n': n}}, 'args': {'sourceId': 'S221_Archeologist'}}, '1': {'description': 'Pass'}}
    raw = {'data': {'players': [{'id': '1'}, {'id': '2'}], 'logs': [
        packet(1, 1, [{'type': 'playSponsor', 'args': {'player_id': 1, 'card': {'id': 'S221_Archeologist'}}}]),
        packet(2, 2, [{'type': 'gameStateChange', 'args': {'id': 91, 'active_player': '1', 'args': {'sourceId': 'S221_Archeologist', 'choices': offer('money', 5)}}}]),
        packet(20, 3, [{'type': 'gameStateChange', 'args': {'id': 111, 'active_player': '1', 'args': {}}}], '/player/p1'),
        packet(3, 3, [{**bonus, 'uid': 'track', 'args': {**bonus['args'], 'remove': '5-2'}}, unoffered, bonus]),
        packet(4, 3, [copy.deepcopy(bonus)]),
        packet(5, 4, [{'type': 'gameStateChange', 'args': {'id': 91, 'active_player': '1', 'args': {'sourceId': 'S221_Archeologist', 'choices': offer('Scavenging', 3)}}}]),
        packet(6, 5, [{**bonus, 'uid': 'scav', 'args': {'player_id': 1, 'bonus_desc': {'args': {'bonus_type': 'Scavenging', 'bonus_n': 3}}}}]),
    ]}}
    parsed = parse_log(raw)
    hints = sponsor_source_hints(raw, parsed)
    tr = SponsorLogStats(parsed.normal_turns, {'1': 0, '2': 1}, hints)
    got = [(m.move_id, key, stat, n) for m in parsed.moves for _, key, stat, n in tr.gains(m)]
    assert got == [(3, 'S221', 'placement:money', 5), (5, 'S221', 'placement:Scavenging:3', 1)]


def test_diversity_counts_new_terrain_and_respects_other_permission_and_unknown_map():
    s = state();s.players[0].sponsors.append('S219')
    water = next(c for c, terrain in board('1').terrain.items() if terrain == 'water')
    e = event('buyBuilding', 4, building={'type': 'size-1', 'x': water[0], 'y': water[1], 'rotation': 0})
    assert diversity_gains(e, s, {'1': 0}) == [(4, 'S219', 'water_covered', 1)]
    action = ['build', 5, 4, False]
    assert diversity_gains(e, s, {'1': 0}, action) == []
    assert diversity_gains(e, s, {'1': 0}, action) == [(4, 'S219', 'water_covered', 1)]
    s.players[0].buildings.append(Building(3, 'size-1', *water))
    assert diversity_gains(e, s, {'1': 0}) == []
    s.config.map_known[0] = False
    assert diversity_gains(e, s, {'1': 0}) == []


def test_diversity_ignores_only_actual_unmet_requirements_and_not_flock_or_tunnel_permission():
    s = state();s.players[0].sponsors.append('S219')
    s.players[0].buildings = [Building(7, 'size-5', 0, 0)]
    e = event('buyAnimal', 3, card={'id': 'A446_AustralianSeaLion', 'location': 'inPlay'}, buildings=[{'id': 7, 'x': 0, 'y': 0}])
    assert (3, 'S219', 'water_ignored', 1) in diversity_gains(e, s, {'1': 0})
    e.args['buildings'] = []
    assert diversity_gains(e, s, {'1': 0}) == []
    tunnel = event('buyBuilding', 4, building={'type': 'underwater-tunnel', 'x': 0, 'y': 0})
    assert diversity_gains(tunnel, s, {'1': 0}) == []


def test_europe_scoring_excludes_gate_enhanced_size_one_enclosure():
    s = state('2');p = s.players[0];bd = board('2')
    from ark_nova import data
    gates = [(x['x'], x['y']) for x in data.map_by_id('2')['geometry']['special_hexes'] if x['kind'] == 'gate']
    next_gate = next(c for c in bd.cells if any(g in neighbours(c) for g in gates))
    normal = [c for c in bd.cells if not any(g in neighbours(c) for g in gates)][:5]
    p.buildings = [Building(i, 'size-1', *c, animal='A401') for i, c in enumerate(normal[:4] + [next_gate])]
    assert endgame.sponsor_points(s, 0, 'S211')['conservation'] == 0
    p.buildings.append(Building(9, 'size-1', *normal[4], animal='A401'))
    assert endgame.sponsor_points(s, 0, 'S211')['conservation'] == 1


@functools.lru_cache(maxsize=None)
def replay(gid):
    path = LOGS / (gid + '.json')
    if not path.exists():
        pytest.skip('raw example unavailable')
    return build_replay_view(json.loads(path.read_text('utf-8')), TableRecord(int(gid)))


def at_move(view, move):
    # One backend move can contain several displayed effects; other moves are folded forward.
    exact = [st for st in view['steps'] if st['move_id'] == move]
    step = exact[-1] if exact else next(st for st in view['steps'] if st['move_id'] is not None and st['move_id'] > move)
    return step['state']['sponsor_stats']


def test_real_breeding_program_and_explicit_quarantine_notification():
    view = replay('760993552')
    assert at_move(view, 262)['S218']['tokens_spent'] == 1
    assert at_move(view, 377)['S218']['tokens_spent'] == 2
    assert at_move(view, 462)['S218']['conservation'] == 1
    assert 'attacks_prevented' not in at_move(view, 414).get('S225', {})
    assert at_move(view, 415)['S225']['attacks_prevented'] == 1


def test_real_veterinarian_and_archaeologist():
    view = replay('927683584')
    assert at_move(view, 474)['S203']['effect_used'] == 3
    assert at_move(view, 538)['S209']['conservation'] == 1
    final = view['steps'][-1]['state']['sponsor_stats']
    assert final['S201']['cards_gained'] == 4
    before_bonus = [st for st in view['steps'] if st['move_id'] is not None and st['move_id'] < 300][-1]
    assert 'placement:shark-attack' not in before_bonus['state']['sponsor_stats'].get('S221', {})
    assert at_move(view, 300)['S221']['placement:shark-attack'] == 1
    assert final['S221']['placement:shark-attack'] == 3


def test_real_science_lab_and_initial_vs_final_africa_rewards():
    lab = replay('902906029')
    assert at_move(lab, 117)['S201']['cards_gained'] == 1
    assert lab['steps'][-1]['state']['sponsor_stats']['S201'] == {'cards_gained': 5, 'conservation': 2}
    africa = replay('795215166')['steps'][-1]['state']['sponsor_stats']
    assert africa['S214']['appeal_initial'] == 1 and africa['S214']['appeal_final'] == 3
    assert africa['S229']['appeal'] == 6
    assert africa['S224']['xtoken'] == 1


def test_real_diversity_bypass_and_terrain_count():
    view = replay('930258897')
    assert at_move(view, 403)['S219']['water_covered'] >= 3
    assert at_move(view, 466)['S219']['water_ignored'] >= 1


def test_attached_bga_self_protection_bug_is_filtered_in_raw_context():
    path = LOGS.parent.parent / '800983534.txt'
    if not path.exists():
        pytest.skip('optional user-supplied bug example unavailable')
    parsed = parse_log(json.loads(path.read_text('utf-8-sig')))
    tr = SponsorLogStats(parsed.normal_turns, {p.id: i for i, p in enumerate(parsed.players)})
    protections = [(m.move_id, g) for m in parsed.moves for g in tr.gains(m) if g[1:3] == ('S225', 'attacks_prevented')]
    assert [(move, g[-1]) for move, g in protections] == [(520, 1)]

@functools.lru_cache(maxsize=None)
def logged_totals(gid):
    path = LOGS / (gid + '.json')
    if not path.exists():
        pytest.skip('raw example unavailable')
    raw = json.loads(path.read_text('utf-8'))
    parsed = parse_log(raw)
    tr = SponsorLogStats(parsed.normal_turns, {p.id: i for i, p in enumerate(parsed.players)}, sponsor_source_hints(raw, parsed),
                         event_gains=sponsor_event_gains(raw, parsed))
    out = {}
    for move in parsed.moves:
        for _, key, stat, n in tr.gains(move):
            out.setdefault(key, {})[stat] = out.get(key, {}).get(stat, 0) + n
    return out


@pytest.mark.parametrize('gid,key,stat,expected', [
    ('902906029', 'S201', 'conservation', 2),
    ('770429314', 'S201', 'cards_gained', 3), ('902906029', 'S201', 'cards_gained', 5),
    ('920295323', 'S201', 'cards_gained', 5), ('927683584', 'S201', 'cards_gained', 4),
    ('927683584', 'S221', 'placement:shark-attack', 3),
    ('930781276', 'S221', 'placement:Clever', 2), ('930781276', 'S221', 'placement:money', 5),
    ('927726814', 'S206', 'appeal', 6), ('927726814', 'S206', 'conservation', 1),
    ('853899676', 'S207', 'conservation', 4),
    ('714192218', 'S209', 'conservation', 1), ('714192218', 'S209', 'xtoken', 3),
    ('800966139', 'S210', 'appeal', 3), ('800966139', 'S210', 'conservation', 1),
    ('927683584', 'S211', 'appeal', 2), ('795215166', 'S212', 'appeal', 5), ('791369985', 'S213', 'appeal', 2),
    ('795215166', 'S214', 'appeal_initial', 1), ('795215166', 'S214', 'appeal_final', 3),
    ('853899676', 'S215', 'tokens_spent', 2), ('853899676', 'S215', 'conservation', 1),
    ('714192218', 'S216', 'conservation', 1),
    ('760993552', 'S218', 'tokens_spent', 2), ('760993552', 'S218', 'conservation', 1),
    ('791369985', 'S220', 'money', 15), ('791369985', 'S222', 'conservation', 3),
    ('927726814', 'S224', 'xtoken', 1), ('927726814', 'S224', 'conservation', 2),
    ('833146203', 'S225', 'conservation', 1), ('833146203', 'S226', 'conservation', 1),
    ('795215166', 'S229', 'appeal', 6), ('800999064', 'S230', 'appeal', 4),
])
def test_frozen_resource_and_token_totals_from_supplied_logs(gid, key, stat, expected):
    assert logged_totals(gid)[key][stat] == expected


def test_frontend_sponsor_rows_contract():
    import shutil
    import subprocess
    node = shutil.which('node')
    if not node:
        pytest.skip('Node not on PATH; run tests/test_sponsor_stats.cjs separately')
    run = subprocess.run([node, str(Path(__file__).with_suffix('.cjs'))], capture_output=True, text=True, timeout=20)
    assert run.returncode == 0, run.stdout + run.stderr

def test_breeding_tokens_without_ids_are_not_conflated():
    tokens = [{'type': 'token', 'location': 'S218_BreedingProgram'} for _ in range(2)]
    assert totals([played('S218'), event('discardTokens', 2, meeples=tokens)])['S218']['tokens_spent'] == 2
