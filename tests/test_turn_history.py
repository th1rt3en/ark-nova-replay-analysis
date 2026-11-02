"""Normal-turn lifecycle regressions: real corpus counts plus synthetic boundaries."""
from collections import Counter
from pathlib import Path
import json

import pytest

from ark_nova.parser.log import parse_log
from ark_nova.parser.turns import extract_turns

LOGS = Path(__file__).resolve().parents[1] / 'log_examples'
# Immutable independent post-game counts from the Oct 25 review specification.
EXPECTED = {
    '714192218': {'95179890': 32, '95544494': 31},
    '770429314': {'84076011': 33, '91658657': 33},
    '791369985': {'95812007': 30, '96137892': 29},
    '798345117': {'97053244': 34, '92166550': 34},
    '800999064': {'94705731': 32, '91932005': 31},
    '833146203': {'94936862': 32, '88982662': 32},
    '853899676': {'94936862': 32, '88982662': 33},
    '902906029': {'99346607': 31, '94936862': 30},
    '920295323': {'94936862': 29, '98175359': 29},
    '920319154': {'96926419': 26, '86346298': 26},
    '927683584': {'99346607': 36, '86346298': 36},
    '927726814': {'93599262': 31, '86346298': 30},
    '927743770': {'98142396': 29, '86346298': 29},
    '930258897': {'94401618': 33, '86346298': 32},
    '930781276': {'97616549': 28, '86346298': 28},
    '931947993': {'99885563': 30, '99206606': 31},
    '937181556': {'98793632': 30, '83927465': 30},
}


def event(ty, args=None, uid=None):
    e = {'type': ty, 'args': args or {}}
    if uid is not None:
        e['uid'] = uid
    return e


def state(sid, player=11, uid=None):
    return event('gameStateChange', {'id': sid, 'active_player': player}, uid)


def packet(move, *events, channel='/table/t1', pid=None):
    return {'move_id': str(move), 'channel': channel, 'packet_id': str(pid or move), 'data': list(events)}


@pytest.mark.parametrize('table,expected', EXPECTED.items())
def test_all_independent_player_counts(table, expected):
    path = LOGS / f'{table}.json'
    if not path.exists():
        pytest.skip('raw fixture unavailable')
    timeline = parse_log(path).normal_turns
    assert dict(Counter(t.player for t in timeline.turns)) == expected
    assert not timeline.diagnostics
    for player, count in expected.items():
        assert [t.number for t in timeline.turns if t.player == player] == list(range(1, count + 1))


@pytest.mark.parametrize('table,start,end', [
    ('902906029', 275, 287), ('927726814', 399, 408),
    ('930258897', 493, 523), ('714192218', 36, 40),
    ('920295323', 402, 408), ('937181556', 395, 398),
])
def test_real_boundary_projection(table, start, end):
    if not (LOGS / f'{table}.json').exists():
        pytest.skip('raw fixture unavailable')
    timeline = parse_log(LOGS / f'{table}.json').normal_turns
    turn = next(t for t in timeline.turns if t.start_move == start)
    assert turn.end_move == end
    assert turn.end_order < turn.close_order
    assert timeline.context(turn.end_order)['index'] == turn.index
    assert timeline.context(turn.close_order)['index'] != turn.index


def test_extra_actions_temporary_actor_and_borrowed_owner_do_not_split():
    t = extract_turns([
        packet(1, state(20), state(7, '11')),
        packet(2, event('chooseActionCard', {'player_id': 11})),
        packet(3, state(79, 22), state(94, 22), state(20, 11)),
        packet(4, event('actionCardCleanup', {'player_id': 11}), state(20, 11)),
        packet(5, event('actionCardCleanup', {'player_id': 11}), state(20, 11)),
        packet(6, event('hypnosis'), state(20, 11)),
        packet(7, event('actionCardCleanup', {'player_id': 22}), state(93, 11)),
        packet(8, event('fillPool'), state(7, 22)),
        packet(9, state(98), state(99)),
    ])
    assert [(r.player, r.number, r.start_move, r.end_move) for r in t.turns] == [('11', 1, 1, 8), ('22', 1, 8, 8)]
    assert t.context(4)['player'] == '11'


@pytest.mark.parametrize('conceder', [11, 22])
def test_concession_preserves_start_and_excludes_administration(conceder):
    t = extract_turns([
        packet(1, state(7, 11, 'start')),
        packet(5, event('getBonuses', {'player_id': 11}), event('playerConcedeGame', {'player_id': conceder}), state(99, 11)),
        packet(1, state(7, 11, 'start'), pid=88),
        packet(6, state(7, 22, 'late')),
    ])
    assert len(t.turns) == 1
    assert t.turns[0].end_move == 5
    assert t.context(4)['phase'] == 'terminal'


def test_concession_immediately_after_start_and_during_break():
    t = extract_turns([packet(1, state(7)), packet(3, event('playerConcedeGame'))])
    assert (t.turns[0].start_move, t.turns[0].end_move) == (1, 1)
    t = extract_turns([packet(1, state(7)), packet(2, state(10), event('startBreak')), packet(8, state(20, 22), event('playerConcedeGame'))])
    assert len(t.turns) == 1 and t.turns[0].end_move == 1


def test_break_and_scoring_are_neutral_and_late_copies_cannot_reopen():
    start = state(7, 11, 'start')
    t = extract_turns([
        packet(1, start), packet(2, event('fillPool'), state(10), event('startBreak')),
        packet(1, start, pid=100), packet(3, state(7, 22), state(20, 22), state(93, 22)),
        packet(4, event('finishBreak'), state(98), event('finalScoring'), state(99)),
    ])
    assert len(t.turns) == 1 and t.turns[0].end_move == 2
    assert sum(b['reason'] == 'break' for b in t.transitions) == 1
    assert t.context(t.turns[0].close_order)['player'] is None
    assert t.transitions[-1]['context']['phase'] == 'terminal'


def test_end_trigger_is_not_terminal_and_same_player_later_start_survives():
    t = extract_turns([packet(1, state(7)), packet(2, event('endOfGame'), state(93)), packet(3, state(7)), packet(4, state(98))])
    assert [r.number for r in t.turns] == [1, 2]


def test_private_representations_do_not_override_public_order():
    t = extract_turns([
        packet(2, state(7, '22'), channel='/player/p22', pid=1),
        packet(1, state(7, 11), pid=2),
        packet(2, event('fillPool'), state(7, 22), pid=3),
        packet(3, state(99), pid=4),
    ])
    assert [r.player for r in t.turns] == ['11', '22']
    assert t.turns[0].end_move == 2


def test_incomplete_or_mid_action_log_does_not_invent_starts():
    assert not extract_turns([packet(1, state(20), event('chooseActionCard'), state(93))]).turns
    t = extract_turns([packet(1, state(7)), packet(2, state(20))])
    assert len(t.turns) == 1 and t.turns[0].close_order is None
    assert t.diagnostics


def test_hypnosis_x_back_keeps_normal_turn_owner_in_builder():
    from ark_nova.replay.config import game_from_log
    from ark_nova.replay.builder import build_replay
    if not (LOGS / '930258897.json').exists():
        pytest.skip('raw fixture unavailable')
    parsed = parse_log(LOGS / '930258897.json')
    setup, config, seed = game_from_log(parsed)
    rep = build_replay(parsed, setup, config, seed)
    assert rep.states[-1].turn == 65
    assert len(parsed.turn_markers) > 65  # engine's action-selection segmentation remains separate


def test_view_has_explicit_starts_and_correct_second_turn_university():
    from ark_nova.replay.view import build_replay_view
    from ark_nova.storage.index import TableRecord
    if not (LOGS / '902906029.json').exists():
        pytest.skip('raw fixture unavailable')
    view = build_replay_view(json.loads((LOGS / '902906029.json').read_text('utf-8')), TableRecord(902906029), first_moves=45)
    university = next(s for s in view['steps'] if s['move_id'] == 19 and 'takes a new university' in s['label'])
    assert university['state']['turn_context']['number'] == 2
    assert not [s for s in view['steps'] if ' starts turn ' in s['label']]  # (the boundary is not a step of its own)
    first = next(s for s in view['steps'] if s['state']['turn_context']['display'] == 1)
    assert first['move_id'] <= 10  # turn 1 begins with choosing the Build card at move 10
    assert all(s['state']['turn_context']['display'] == 0 for s in view['steps'][:view['steps'].index(first)])
    assert view['normal_turns'][0]['end_move'] == 14


def test_private_only_start_is_reconciled_and_diagnosed():
    t = extract_turns([
        packet(1, state(7, 11, 'a'), channel='/player/p11', pid=1),
        packet(1, state(7, 11, 'b'), channel='/player/p22', pid=2),
        packet(2, state(99), pid=3),
    ])
    assert len(t.turns) == 1
    assert any('private-only' in d for d in t.diagnostics)


def test_public_start_resend_with_new_uid_and_later_genuine_start():
    t = extract_turns([
        packet(1, state(7, 11, 'a'), state(20)),
        packet(1, state(7, '11', 'b'), pid=88),
        packet(2, state(7, 11, 'c')),
        packet(3, state(99)),
    ])
    assert [(r.player, r.number) for r in t.turns] == [('11', 1), ('11', 2)]


def test_early_private_selector_args_cannot_make_break_look_like_a_turn():
    from ark_nova.replay.view import build_replay_view
    from ark_nova.storage.index import TableRecord
    if not (LOGS / '714192218.json').exists():
        pytest.skip('raw fixture unavailable')
    view = build_replay_view(json.loads((LOGS / '714192218.json').read_text('utf-8')), TableRecord(714192218), first_moves=60)
    entry = next(s for s in view['steps'] if s['move_id'] == 41 and 'Starting a new break' in s['label'])
    assert entry['state']['turn_context']['phase'] == 'break'
    assert entry['state']['turn_context']['seat'] is None


@pytest.mark.parametrize('game,seat', [('daily_hand', 0), ('daily_hand', 1), ('whos_ahead', None)])
def test_mini_games_do_not_publish_turn_history_or_future_samples(game, seat):
    from ark_nova.minigames.platform.contract import GameLog
    from ark_nova.minigames.platform.guard import check_public
    if not (LOGS / '902906029.json').exists():
        pytest.skip('raw fixture unavailable')
    log = GameLog(json.loads((LOGS / '902906029.json').read_text('utf-8')), 902906029, elos={})
    if game == 'daily_hand':
        from ark_nova.minigames.daily_hand import GAME
        moment = {'seat': seat}
    else:
        from ark_nova.minigames.whos_ahead import GAME
        # Exercise redaction at a real mid-game position independently of the
        # picker's separate final-result-format requirements.
        moment = {"moves": len(log.parsed.moves) // 2, "turn": len(log.parsed.turn_markers) // 2}
    public = GAME.build_public(moment, log)
    check_public(public, log)
    assert 'normal_turns' not in public['replay']
    assert 'turn_start' not in public['replay']
    assert 'break_markers' not in public['replay']
    context = public['replay']['steps'][0]['state']['turn_context']
    assert set(context) == {'phase', 'index', 'seat', 'number', 'display', 'counts'}
    if seat is not None:
        assert context['display'] == 0
        answer = GAME.answer(moment, log)
        assert len(answer['keep']) == public['keep']
        assert set(answer['keep']) <= set(public['hand'])


def test_setup_only_view_does_not_publish_internal_order_or_future_counts():
    from ark_nova.replay.view import build_replay_view
    from ark_nova.storage.index import TableRecord
    if not (LOGS / '902906029.json').exists():
        pytest.skip('raw fixture unavailable')
    view = build_replay_view(json.loads((LOGS / '902906029.json').read_text('utf-8')), TableRecord(902906029), first_moves=1)
    assert all('_history_order' not in s for s in view['steps'])
    assert all(s['state']['turn_context']['counts'] == [0, 0] for s in view['steps'])
    assert not view.get('normal_turns')
