"""Break notification reconciliation and graph metadata (real and synthetic)."""
from pathlib import Path
from types import SimpleNamespace
import copy
import json
import shutil
import subprocess

import pytest

from ark_nova.parser.log import parse_log
from ark_nova.parser.breaks import accepted_break_orders
from ark_nova.replay.builder import h_finish_break
from ark_nova.replay.view import _break_markers, build_replay_view
from ark_nova.storage.index import TableRecord

ROOT = Path(__file__).resolve().parents[1]
LOGS = ROOT / 'log_examples'
# Frozen from the independent breakpoint review appendix, never from the parser.
EXPECTED = {'714192218': ([(41, 42), (98, 99), (146, 153), (236, 247), (378, 387)], (408, '95544494'), 429),
 '770429314': ([(35, 39), (98, 101), (179, 184), (326, 337)], (408, '84076011'), 413),
 '791369985': ([(67, 68), (151, 158), (212, 221), (286, 307), (327, 344)], (388, '96137892'), 412),
 '798345117': ([(92, 94), (155, 156), (196, 196), (318, 322), (372, 382)], (448, '97053244'), 453),
 '800966139': ([(49, 51), (108, 113), (172, 176), (241, 249), (386, 398)], (451, '95556688'), 458),
 '800999064': ([(92, 100), (179, 183), (295, 303), (401, 408)], (517, '91932005'), 532),
 '833146203': ([(42, 42), (168, 176), (260, 268), (378, 386)], (421, '88982662'), 433),
 '853899676': ([(57, 58), (131, 139), (214, 225), (339, 352), (419, 430)], (460, '94936862'), 487),
 '902906029': ([(65, 67), (147, 153), (236, 244), (293, 301), (343, 354)], (391, '94936862'), 400),
 '920295323': ([(62, 64), (148, 154), (198, 207), (272, 287), (408, 424)], (401, '94936862'), 424),
 '920319154': ([(66, 67), (103, 107), (164, 173), (220, 233), (311, 324), (381, 394)],
               (399, '96926419'),
               425),
 '927683584': ([(87, 93), (193, 204), (323, 337), (449, 472)], (488, '86346298'), 538),
 '927726814': ([(47, 49), (151, 158), (271, 284), (369, 399)], (436, '86346298'), 445),
 '927743770': ([(61, 65), (163, 166), (258, 270), (319, 331), (380, 391)], (388, '86346298'), 404),
 '930258897': ([(79, 80), (143, 148), (195, 204), (291, 300), (379, 398), (447, 463)],
               (497, '86346298'),
               536),
 '930781276': ([(51, 55), (103, 108), (154, 170), (268, 283)], (406, '97616549'), 415),
 '931947993': ([(72, 73), (137, 143), (216, 223), (289, 298), (368, 391), (454, 465)],
               (471, '99885563'),
               487),
 '937181556': ([(41, 42), (69, 73), (120, 127), (174, 182), (229, 251), (326, 341)], None, 399)}


def event(kind, args=None, uid='reused', log=''):
    return {'type': kind, 'args': args if args is not None else [], 'uid': uid, 'log': log}


def state(sid, player=11, uid='state'):
    return event('gameStateChange', {'id': sid, 'active_player': player}, uid)


def packet(move, *events, channel='/table/t1', pid=None):
    return {'channel': channel, 'table_id': 1, 'move_id': move, 'packet_id': str(pid or move), 'time': '1', 'data': list(events)}


def raw(*packets):
    return {'data': {'players': [{'id': 11}, {'id': 22}], 'logs': list(packets)}}


def boundaries(parsed):
    return [(m.move_id, e.type) for m in parsed.moves for e in m.events if e.type in ('startBreak', 'finishBreak')]


@pytest.mark.parametrize('table,expected', EXPECTED.items())
def test_frozen_break_cross_and_tail_corpus(table, expected):
    path = LOGS / f'{table}.json'
    if not path.exists():
        pytest.skip('raw fixture unavailable')
    pairs, cross, tail = expected
    source = json.loads(path.read_text('utf-8'))
    parsed = parse_log(source)
    assert boundaries(parsed) == [(m, kind) for a, b in pairs for m, kind in [(a, 'startBreak'), (b, 'finishBreak')]]
    observed_cross = [(m.move_id, str(e.args['player_id'])) for m in parsed.moves for e in m.events if e.type == 'endOfGame']
    assert observed_cross == ([] if cross is None else [cross])
    assert max(int(p['move_id']) for p in source['data']['logs'] if p['move_id'] is not None) == tail
    seat_of = {p.id: i for i, p in enumerate(parsed.players)}
    markers = _break_markers(parsed, seat_of)
    assert [(b['start_move'], b['end_move']) for b in markers] == pairs
    trigger, trigger_seats = None, []
    for move in parsed.moves:
        for e in move.events:
            if e.type == 'getBonuses' and e.args.get('source') == 'triggering break':
                trigger = seat_of[str(e.args['player_id'])]
            elif e.type == 'startBreak':
                trigger_seats.append(trigger)
                trigger = None
    assert [b['seat'] for b in markers] == trigger_seats
    assert [t['move_id'] for t in parsed.normal_turns.transitions if t['reason'] == 'break'] == [a for a, _ in pairs]
    assert [t['move_id'] for t in parsed.normal_turns.transitions if t['reason'] == 'finish_break'] == [b for _, b in pairs]


@pytest.mark.parametrize('fresh_uid', [False, True])
def test_duplicate_completion_cannot_increment_round_twice(fresh_uid):
    end = packet('3', event('finishBreak', uid='end'))
    duplicate = copy.deepcopy(end)
    if fresh_uid:
        duplicate['packet_id'] = '100'
        duplicate['data'][0]['uid'] = 'resent-with-new-uid'
    parsed = parse_log(raw(packet('1', state(7)), packet('2', state(10), event('startBreak')), end, packet('4', state(7, 22)), duplicate))
    assert boundaries(parsed) == [(2, 'startBreak'), (3, 'finishBreak')]
    ctx = SimpleNamespace(state=SimpleNamespace(round=1, break_position=9))
    for move in parsed.moves:
        for e in move.events:
            if e.type == 'finishBreak':
                h_finish_break(ctx, e)
    assert ctx.state.round == 2 and ctx.state.break_position == 0
    assert parsed.normal_turns.context(parsed.normal_turns.last_order)['player'] == '22'


def test_same_move_start_end_and_reused_uid_on_later_break_survive():
    p = parse_log(raw(packet('1', state(7)), packet('2', state(10), event('startBreak'), event('finishBreak'), state(7, 22)),
                      packet('3', state(10), event('startBreak'), event('finishBreak'), state(99))))
    assert boundaries(p) == [(2, 'startBreak'), (2, 'finishBreak'), (3, 'startBreak'), (3, 'finishBreak')]
    assert [(b['start_move'], b['end_move']) for b in _break_markers(p, {'11': 0, '22': 1})] == [(2, 2), (3, 3)]


def test_public_order_wins_over_early_private_boundary_copies():
    p = parse_log(raw(packet('1', state(7)),
                      packet('2', event('finishBreak', uid='private-end'), channel='/player/p11', pid=2),
                      packet('2', event('startBreak', uid='private-start'), channel='/player/p22', pid=3),
                      packet('2', state(10), event('startBreak', uid='public-start'), event('finishBreak', uid='public-end'), state(7, 22), pid=4)))
    assert boundaries(p) == [(2, 'startBreak'), (2, 'finishBreak')]
    assert all(e.player is None for m in p.moves for e in m.events if e.type in ('startBreak', 'finishBreak'))
    assert p.normal_turns.context(p.normal_turns.last_order)['player'] == '22'


def test_private_only_boundary_fallback_uses_same_notifications_in_both_consumers():
    p = parse_log(raw(packet('1', state(7)), packet('2', event('startBreak'), channel='/player/p11'),
                      packet('3', event('finishBreak'), channel='/player/p22'), packet('4', state(7, 22))))
    assert boundaries(p) == [(2, 'startBreak'), (3, 'finishBreak')]
    assert [b['reason'] for b in p.normal_turns.transitions] == ['turn', 'break', 'finish_break', 'turn']
    assert any('private-only' in message for message in p.normal_turns.diagnostics)


def test_late_state10_copy_cannot_reopen_a_finished_break():
    p = parse_log(raw(packet('1', state(7)), packet('2', state(10, uid='old'), event('startBreak')),
                      packet('3', event('finishBreak')), packet('4', state(7, 22)), packet('2', state(10, uid='fresh-copy'), pid=99)))
    assert p.normal_turns.context(p.normal_turns.last_order)['phase'] == 'turn'
    assert p.normal_turns.context(p.normal_turns.last_order)['player'] == '22'


@pytest.mark.parametrize('terminal', [False, True])
def test_open_break_has_no_invented_completion(terminal):
    packets = [packet('1', state(7)), packet('2', event('getBonuses', {'source': 'triggering break', 'player_id': 11}), state(10), event('startBreak'))]
    if terminal:
        packets.append(packet('5', event('playerConcedeGame', {'player_id': 22}), state(99)))
    parsed = parse_log(raw(*packets))
    assert _break_markers(parsed, {'11': 0, '22': 1}) == [{'start_move': 2, 'end_move': None, 'turn': 1.5, 'seat': 0}]


def test_missing_move_uses_provenance_instead_of_collapsing_all_boundaries():
    p1 = packet(None, event('startBreak', uid='a'), pid=1)
    p2 = packet(None, event('finishBreak', uid='b'), pid=2)
    p3 = packet(None, event('startBreak', uid='a'), pid=3)  # same UID, distinct unknown-move provenance
    assert len(accepted_break_orders([p1, p2, p3, copy.deepcopy(p2)])) == 3


def test_graph_metadata_is_independent_of_human_wording():
    path = LOGS / '902906029.json'
    if not path.exists():
        pytest.skip('raw fixture unavailable')
    source = json.loads(path.read_text('utf-8'))
    for p in source['data']['logs']:
        for e in p['data']:
            if e['type'] in ('startBreak', 'finishBreak'):
                e['log'] = 'Different wording'
            if e['type'] == 'getBonuses' and isinstance(e['args'], dict) and e['args'].get('source') == 'triggering break':
                e['log'] = 'No player name or source in this label'
    parsed = parse_log(source)
    markers = _break_markers(parsed, {p.id: i for i, p in enumerate(parsed.players)})
    view = build_replay_view(source, TableRecord(902906029), first_moves=75)
    assert view['break_markers']
    assert view['break_markers'][0] == markers[0]
    assert (markers[0]['start_move'], markers[0]['end_move']) == (65, 67)
    assert markers[0]['seat'] in (0, 1)


def test_frontend_break_metadata_and_money_sampling_contract():
    node = shutil.which('node')
    if not node:
        pytest.skip('Node.js not available; run tests/test_break_markers.cjs separately')
    result = subprocess.run([node, str(ROOT / 'tests/test_break_markers.cjs')], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
