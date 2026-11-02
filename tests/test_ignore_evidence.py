"""Direct Ignore Animals evidence, overlapping bypasses, and next-animal Camouflage consumption."""
import copy
import json
from pathlib import Path

import pytest

from ark_nova.engine import animals_action as aa
from ark_nova.engine.actions import Action
from ark_nova.engine.game import apply, legal_actions
from ark_nova.engine.state import Building, Token
from ark_nova.parser import parse_log
from ark_nova.replay.differential import _needs_a_token, _use_ignore_branch
from ark_nova.replay.variant_stats import logged_variant_gains, observe_variants
from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord
from tests.test_animal_abilities import _zoo, _start, _play

LOGS = Path(__file__).resolve().parents[1] / 'log_examples'


def packet(number, move, events, player=None):
    return {'packet_id': number, 'move_id': move, 'table_id': 1, 'time': '10',
            'channel': '/player/p' + player if player else '/table/t1', 'data': events}


def chosen(kind='Animals1', pid=1):
    return {'type': 'chooseActionCard', 'args': {'player_id': pid, 'actionCard': {'type': kind}}}


def status(ignored=1, valid=False, playable=False, card='A409_SunBear'):
    return {'type': 'gameStateChangePrivateArg', 'args': {'statuses': {card: {
        'conditions': {'Partner-Zoo': False, 'ignored': ignored, 'valid': valid}, 'playable': playable}}}}


def flow(ignore=1, maximum=1, level=2, strength=5, number=1, pid=1):
    a = {'max': maximum, 'lvl': level, 'strength': strength, 'number': number}
    if ignore is not None:
        a['ignore'] = ignore
    return {'type': 'gameStateChange', 'args': {'id': 91, 'active_player': str(pid), 'args': a}}


def animal(uid='animal', pid=1, card='A409_SunBear'):
    e = {'type': 'buyAnimal', 'args': {'player_id': pid, 'card_id': card, 'card': {'id': card, 'location': 'inPlay'}}}
    if uid is not None:
        e['uid'] = uid
    return e


def token(pid=1):
    return {'type': 'discardTokens', 'args': {'player_id': pid, 'meeples': [{'id': 1, 'type': 'bonus-ignore-conditions'}]}}


def parse(packets):
    return parse_log({'data': {'players': [{'id': '1'}, {'id': '2'}], 'logs': packets}})


def gains(parsed):
    return [g for move in parsed.moves for g in logged_variant_gains(parsed, move, {'1': 0, '2': 1})]


def sample(*events, ignored=1, kind='Animals1', player='1'):
    return parse([packet(1, 1, [chosen(kind)]), packet(2, 2, [status(ignored)], player),
                  packet(3, 3, list(events) if events else [animal(), flow()])])


def test_actual_play_with_false_valid_and_playable_still_counts_using_weighted_ignored_units():
    parsed = sample(ignored='3')
    record = next(iter(parsed.animal_ignores.values()))
    assert record['requirements'] == 3  # one false named key is not a count of missing units
    assert record['branch'] is True
    assert gains(parsed) == [(3, '0:animals', 'ignored', 1)]
    assert record['status_order'] < 3 < record['flow_order']


@pytest.mark.parametrize('ignored', [0, None, 'bad', -1])
def test_no_counter_for_zero_or_missing_requirements(ignored):
    assert gains(sample(ignored=ignored)) == []


@pytest.mark.parametrize('kind', ['Animals', 'Animals2', 'Cards1'])
def test_the_confirmed_ignore_flow_is_not_enough_without_animals_variant_one(kind):
    assert gains(sample(kind=kind)) == []


@pytest.mark.parametrize('f,expected', [
    (flow(level=1, strength=4), 0), (flow(level=1, strength='5'), 1), (flow(level=1, strength=6), 1),
    (flow(level=2, strength=2), 0), (flow(level='2', strength='3'), 1),
    (flow(maximum=2), 0), (flow(ignore=None, maximum=2), 0),
])
def test_flow_guards_and_numeric_strings(f, expected):
    assert len(gains(sample(animal(), f))) == expected


def test_a_preplay_branch_is_consumed_once_and_repeated_postplay_snapshots_do_not_add_uses():
    parsed = parse([packet(1, 1, [chosen(), flow(number=0)]), packet(2, 2, [status()], '1'),
                    packet(3, 3, [animal(), flow(), flow()]),
                    packet(4, 4, [chosen(), animal(uid='next')])])
    assert len(gains(parsed)) == 1


def test_same_move_following_packet_can_confirm_the_play_but_later_move_cannot():
    packets = [packet(1, 1, [chosen()]), packet(2, 2, [status()], '1'), packet(3, 3, [animal()]), packet(4, 3, [flow()])]
    assert len(gains(parse(packets))) == 1
    packets[-1]['move_id'] = 4
    assert gains(parse(packets)) == []


def test_opponent_private_status_and_postplay_status_cannot_replace_the_preplay_status():
    assert gains(sample(player='2')) == []
    packets = [packet(1, 1, [chosen()]), packet(2, 2, [status(0)], '1'),
               packet(3, 3, [animal(), flow()]), packet(4, 3, [status(3)], '1')]
    parsed = parse(packets)
    assert next(iter(parsed.animal_ignores.values()))['requirements'] == 0
    assert gains(parsed) == []
    packets.insert(2, packet(20, 2, [status(2)], '1'))
    assert len(gains(parse(packets))) == 1  # latest chronological status, not packet ID sorting


def test_private_full_state_status_is_supported_but_private_advance_does_not_replace_public_flow():
    private_status = {'type': 'gameStateChange', 'args': {'id': 32, 'active_player': '1', 'args': {
        '_private': {'statuses': {'A409_SunBear': {'conditions': {'ignored': 1}}}}}}}
    parsed = parse([packet(1, 1, [chosen(), flow(number=0)]), packet(2, 2, [private_status, flow(ignore=None, maximum=2)], '1'),
                    packet(3, 3, [animal(), flow()])])
    assert len(gains(parsed)) == 1


def test_token_is_paired_to_this_animal_not_to_other_animal_plays_in_the_action_group():
    parsed = parse([packet(1, 1, [chosen()]), packet(2, 2, [status()], '1'),
                    packet(3, 3, [animal('first'), flow()]),
                    packet(4, 4, [chosen()]), packet(5, 5, [status()], '1'),
                    packet(6, 6, [token(), animal('second'), flow()])])
    records = list(parsed.animal_ignores.values())
    assert [r['token'] for r in records] == [False, True]
    assert len(gains(parsed)) == 1


def test_token_precedence_requires_same_player_and_direct_public_pair_but_ignores_private_snapshots():
    assert gains(sample(token(), animal(), flow())) == []
    assert len(gains(sample(token(pid=2), animal(), flow()))) == 1
    assert len(gains(sample(token(), {'type': 'midmessage', 'args': {}, 'log': 'Unrelated event'}, animal(), flow()))) == 1
    parsed = parse([packet(1, 1, [chosen()]), packet(2, 2, [status()], '1'), packet(3, 3, [token()]),
                    packet(4, 3, [status()], '1'), packet(5, 3, [animal(), flow()])])
    assert gains(parsed) == []


def test_token_possession_is_not_token_consumption():
    possession = {'type': 'addMeeples', 'args': {'player_id': 1, 'meeples': [{'type': 'bonus-ignore-conditions'}]}}
    assert len(gains(sample(possession, animal(), flow()))) == 1


def test_identified_duplicate_plays_count_once_but_reused_uid_on_a_later_move_is_distinct():
    parsed = parse([packet(1, 1, [chosen()]), packet(2, 2, [status()], '1'),
                    packet(3, 3, [animal(), animal(), flow()]), packet(4, 4, [chosen()]),
                    packet(5, 5, [status()], '1'), packet(6, 6, [animal(), flow()])])
    assert len(gains(parsed)) == 2
    assert sum(bool(r['duplicate']) for r in parsed.animal_ignores.values()) == 1


def test_no_future_flow_is_borrowed_across_an_action_boundary():
    parsed = sample(animal(), chosen(), flow())
    assert gains(parsed) == []


def overlapping_zoo():
    s = _zoo('A442', level=2, slot=5);p = s.players[0]
    p.map_id = '6';s.config.maps[0] = '6'
    p.sponsors.append('S263');p.buildings.append(Building(99, 'size-1', 0, 11))
    next(c for c in p.action_cards if c.type == 'animals').variant = 1
    s = _start(s)
    act = next(a for a in legal_actions(s) if a.kind == 'play_animal' and a.args.get('card') == 'A442')
    return s, act


def test_replay_inference_adds_overlapping_non_animals1_capacity_instead_of_inventing_single_mode():
    s, act = overlapping_zoo()
    assert aa.failed_conditions(s, 0, 'A442', 2) == ['herbivore', 'herbivore']
    assert aa.credits(s, 0, 'A442') == ['institute', 'waza']
    assert not _needs_a_token(s, act)
    assert not _use_ignore_branch(s, act)
    assert not _use_ignore_branch(s, act, {'branch': False, 'token': False})
    assert _use_ignore_branch(s, act, {'branch': True, 'token': False})
    assert not _use_ignore_branch(s, act, {'branch': True, 'token': True})
    forced = apply(s, Action(0, 'animals_single', {}))
    after = apply(forced, act)
    assert observe_variants(forced, act, after) == []  # engine priority does not supply the hover counter


def test_camouflage_is_consumed_by_the_next_animal_even_when_its_requirements_are_met():
    s = _zoo('A548', hand=['A409']);s.players[0].tokens.append(Token(998, 'partner-Asia', 'partner_2'))
    s.players[0].buildings.append(Building(3, 'small-aquarium', 6, 5));s = _start(s);s = _play(s, 'A548', 6, 5)
    while s.prompt.kind == 'effects':
        s = apply(s, Action(0, 'skip_effect', {'index': 0}))
    assert s.current_action['camouflage'] is True
    assert aa.failed_conditions(s, 0, 'A409', 2) == []
    act = next(a for a in legal_actions(s) if a.kind == 'play_animal' and a.args.get('card') == 'A409')
    after = apply(s, act)
    assert not after.current_action.get('camouflage')
    assert s.current_action['camouflage'] is True  # apply remains pure


def test_camouflage_is_consumed_when_other_credits_cover_the_play_and_a_new_activation_survives():
    s, act = overlapping_zoo();s.current_action['camouflage'] = True
    assert not apply(s, act).current_action.get('camouflage')
    s = _zoo('A548');s.players[0].buildings.append(Building(3, 'small-aquarium', 6, 5));s = _start(s)
    s.current_action['camouflage'] = True
    after = _play(s, 'A548', 6, 5)
    assert after.current_action['camouflage'] is True  # the played seahorse activates a fresh Camouflage


@pytest.mark.parametrize('gid,pid,move,card,requirements', [
    ('770429314', '84076011', 200, 'A433', 1), ('853899676', '94936862', 202, 'A456', 1),
    ('930781276', '86346298', 75, 'A504', 1),
])
def test_real_private_status_and_postplay_confirmation_produce_one_counter(gid, pid, move, card, requirements):
    parsed = parse_log(LOGS / (gid + '.json'))
    matches = [(m, e) for m in parsed.moves for e in m.events if m.move_id == move and e.type == 'buyAnimal']
    m, e = matches[0];r = parsed.animal_ignores[e.order]
    assert r['player'] == pid and r['card'] == card and r['requirements'] == requirements
    assert r['branch'] is True and r['token'] is False and r['flow_order'] > e.order
    assert sum(g[-1] for mv in parsed.moves for g in logged_variant_gains(parsed, mv, {pid: 0})) == 1


def test_complete_replay_counts_without_engine_coverage_and_never_before_the_actual_play():
    raw = json.loads((LOGS / '770429314.json').read_text('utf-8'))
    parsed = parse_log(raw)
    view = build_replay_view(raw, TableRecord(770429314), first_moves=len(parsed.moves))
    assert all(step['engine']['status'] == 'log' for step in view['steps'])
    final = view['steps'][-1]['state']['variant_stats']
    assert final['0']['animals']['ignored'] == 1
    first = next(i for i, step in enumerate(view['steps']) if 'A433' in step['state']['players'][0]['animals'])
    assert view['steps'][first]['state']['variant_stats']['0']['animals']['ignored'] == 1
    assert all(not step['state']['variant_stats'].get('0', {}).get('animals', {}).get('ignored') for step in view['steps'][:first])
