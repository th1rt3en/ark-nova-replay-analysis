"""Remaining sponsor requests: attribution, reward timing, optional choices and real-log totals."""
import copy
from types import SimpleNamespace

import pytest

from ark_nova.engine.state import Building, Token
from ark_nova.parser import parse_log
from ark_nova.replay.sponsor_sources import sponsor_event_gains
from ark_nova.replay.sponsor_stats import SponsorLogStats, sponsor_state_gains, tracked_sponsors
from test_sponsor_stats import event, played, totals, packet, state, logged_totals, replay, at_move


@pytest.mark.parametrize('key', [f'S{n}' for n in (231, 232, 233, 234, 235, 249, 253, 257, 258, 259, 260, 261, 264, 265,
                                                  267, 268, 269, 270, 271, 272, 273, 274, 279, 280, 281)])
def test_all_requested_remaining_sponsors_are_enabled(key):
    assert key in tracked_sponsors().values()


@pytest.mark.parametrize('key', [f'S{n}' for n in range(231, 236)])
def test_sponsorship_immediate_appeal_and_cumulative_income_share_the_confirmed_schema(key):
    got = totals([played(key), event('getBonuses', 2, card_id=key, bonuses={'appeal': 4}),
                  event('getBonuses', 3, card_id=key, bonuses={'money': 3}),
                  event('getBonuses', 4, card_id=key, bonuses={'money': 6})])
    assert got[key] == {'appeal': 4, 'money': 9}


@pytest.mark.parametrize('key', ['S258', 'S259', 'S260', 'S261', 'S264', 'S265', 'S267', 'S271', 'S272'])
def test_only_final_conservation_is_credited_to_requested_endgame_rows(key):
    got = totals([played(key), event('getBonuses', 2, card_id=key, bonuses={'conservation': 1}),
                  event('getBonuses', 1000, card_id=key, bonuses={'conservation': 2})])
    assert got[key]['conservation'] == 2


@pytest.mark.parametrize('key', ['S258', 'S259', 'S260', 'S264', 'S267'])
def test_native_and_similar_cards_retain_immediate_appeal(key):
    assert totals([played(key), event('getBonuses', 2, card_id=key, bonuses={'appeal': 6})])[key]['appeal'] == 6


def test_guided_school_tours_immediate_rewards_do_not_become_endgame_benefits():
    assert totals([played('S261'), event('getBonuses', 2, card_id='S261', bonuses={'appeal': 1, 'conservation': 1})]) == {}


@pytest.mark.parametrize('key', ['S257', 'S280', 'S281'])
def test_final_appeal_excludes_immediate_rewards(key):
    got = totals([played(key), event('getBonuses', 2, card_id=key, bonuses={'appeal': 2}),
                  event('getBonuses', 1000, card_id=key, bonuses={'appeal': 5})])
    assert got[key] == {'appeal_final': 5}


def test_australia_enlargement_and_tunnel_initial_appeal_are_separate_from_final_appeal():
    for key, row in [('S269', 'appeal_enlargement'), ('S279', 'appeal_initial')]:
        got = totals([played(key), event('getBonuses', 2, card_id=key, bonuses={'appeal': 2}),
                      event('getBonuses', 1000, card_id=key, bonuses={'appeal': 3})])
        assert got[key] == {row: 2, 'appeal_final': 3}


@pytest.mark.parametrize('play_phase', ['turn', 'break'])
@pytest.mark.parametrize('card_id', ['S274_MascotStatue', 'S274_VictoryColumn'])
def test_statue_income_excludes_the_initial_one_even_if_played_during_break(play_phase, card_id):
    timeline = SimpleNamespace(context=lambda o: {'phase': 'scoring' if o >= 1000 else play_phase if o <= 2 else 'break'})
    tr = SponsorLogStats(timeline, {'1': 0, '2': 1})
    got = totals([played('S274'), event('getBonuses', 2, card_id=card_id, bonuses={'appeal': 1}),
                  event('getBonuses', 3, card_id=card_id, bonuses={'appeal': 1}),
                  event('getBonuses', 4, card_id=card_id, bonuses={'appeal': 1}),
                  event('getBonuses', 1000, card_id=card_id, bonuses={'appeal': 4})], tr)
    assert got['S274'] == {'appeal_income': 2, 'appeal_final': 4}


def test_franchise_preserves_a_zero_money_total_without_claiming_a_free_kiosk():
    assert totals([played('S265')]) == {'S265': {'money': 0}}


def test_okapi_counts_identified_cubes_once_not_the_notification_n():
    cube = {'id': 73, 'location': 'S253_OkapiStable', 'type': 'token'}
    assert totals([played('S253'), event('discardTokens', 2, n=9, meeples=[cube]),
                   event('discardTokens', 3, meeples=[cube]),
                   event('discardTokens', 4, meeples=[{**cube, 'id': 74}])])['S253']['tokens_spent'] == 2


def raw_observations(packets, known_maps=None):
    raw = {'data': {'players': [{'id': '1'}, {'id': '2'}], 'logs': packets}}
    parsed = parse_log(raw)
    observations = sponsor_event_gains(raw, parsed, known_maps)
    tr = SponsorLogStats(parsed.normal_turns, {'1': 0, '2': 1}, event_gains=observations)
    out = {}
    for move in parsed.moves:
        for _, key, stat, n in tr.gains(move):
            out.setdefault(key, {})[stat] = out.get(key, {}).get(stat, 0) + n
    return out


def raw_state(sid, source=None, reason=None, player='1'):
    return {'type': 'gameStateChange', 'args': {'id': sid, 'active_player': player,
            'args': {'sourceId': source, 'source': reason}}}


def raw_play(key):
    return {'type': 'playSponsor', 'args': {'player_id': 1, 'card': {'id': key}}}


def test_europe_counts_only_animals_marked_in_its_source_state_and_ignores_private_state_advance():
    mark = {'type': 'markCard', 'uid': 'mark', 'args': {'player_id': 1, 'cards': {'A401': {}, 'A402': {}, 'S201': {}}}}
    got = raw_observations([
        packet(1, 1, [raw_play('S268'), raw_state(103, 'S268_ConferenceOnEurope')]),
        packet(2, 2, [raw_state(93)], '/player/p1'),
        packet(3, 2, [mark, mark, raw_state(103)]),
        packet(4, 3, [{**mark, 'uid': 'other-mark'}, raw_state(103, 'S268_ConferenceOnEurope')]),
        packet(5, 4, [raw_state(93)]),
    ])
    assert got['S268']['animals_marked'] == 2


def test_scuba_counts_actual_retained_draw_once_even_when_no_sponsor_is_found():
    draw = {'type': 'pDrawCards', 'uid': 'draw', 'args': {'player_id': 1, 'cards': [{'id': 'A401'}, {'id': 'A402'}, {'id': 'A403'}]}}
    got = raw_observations([
        packet(1, 1, [raw_play('S270'), raw_state(91, 'S270_MarineResearchExpedition')]),
        packet(2, 2, [raw_state(114, 'S270_MarineResearchExpedition')], '/player/p1'),
        packet(3, 2, [draw], '/player/p1'),
        packet(4, 2, [{'type': 'drawCards', 'args': {'player_id': 1, 'n': 3}}, raw_state(114, 'S270_MarineResearchExpedition')]),
        packet(5, 2, [{'type': 'discardCards', 'args': {'player_id': 1, 'n': 3}}, raw_state(91)]),
        packet(6, 3, [raw_state(91, 'S270_MarineResearchExpedition')]),
        packet(7, 4, [{**draw, 'uid': 'second'}], '/player/p1'),
    ])
    assert got['S270']['scuba3'] == 2
    assert 'expeditions' not in got['S270']


def test_reconstruction_counts_only_actual_new_buildings_with_its_source():
    buy = lambda typ: {'type': 'buyBuilding', 'args': {'player_id': 1, 'building': {'type': typ}}}
    got = raw_observations([
        packet(1, 1, [raw_play('S280'), raw_state(30, 'S280_Reconstruction')]),
        packet(2, 2, [buy('kiosk'), raw_state(30, 'S280_Reconstruction')]),
        packet(3, 3, [buy('pavilion'), raw_state(30)]),
        packet(4, 4, [buy('kiosk'), {'type': 'reconstructionPlaceBack', 'args': {'player_id': 1, 'building': {'type': 'pavilion'}}}]),
    ])
    assert got['S280'] == {'kiosk': 1, 'pavilion': 1}


def test_excavation_unknown_map_retains_two_real_identical_payments_but_not_nested_rewards():
    reward = lambda uid, source: {'type': 'getBonuses', 'uid': uid, 'args': {'player_id': 1, 'source': source, 'bonuses': {'money': 5}}}
    packets = [packet(1, 1, [raw_play('S271'), raw_state(30, 'S271_ExcavationSite')]),
               packet(2, 2, [{'type': 'buyBuilding', 'args': {'player_id': 1, 'building': {'type': 'excavation'}}},
                             reward('a', 'placement bonus'), reward('b', 'placement bonus'), reward('c', ' from university')])]
    assert raw_observations(packets)['S271'] == {'doubled:money': 5}          # only the extra copy: the first payment comes with any building
    assert 'S271' not in raw_observations(packets, {'1': True})


def state_totals(ev, s, action=None, source_hint=None):
    out = {}
    for _, key, stat, n in sponsor_state_gains(ev, s, {'1': 0, '2': 1}, action, source_hint):
        out.setdefault(key, {})[stat] = out.get(key, {}).get(stat, 0) + n
    return out


def test_publications_savings_are_capped_and_include_science_universities_without_mutating_state():
    s = state();p = s.players[0];p.sponsors = ['S273']
    p.tokens.append(Token(1, 'fac-science-science', 'university_1'))
    original = copy.deepcopy(s)
    assert state_totals(event('donation'), s)['S273'] == {'saved': 2, 'donations': 1}  # 3 science, only 2 payable
    assert s == original
    s.players[1].tokens.append(Token(2, 'token', 'association_0_0'))
    assert state_totals(event('donation'), s)['S273']['saved'] == 3  # next donation costs 5
    p.x_tokens = 4
    assert state_totals(event('donation'), s, ['association', 5, 3, False], 'association-donation')['S273']['saved'] == 1
    assert state_totals(event('donation'), s, ['association', 5, 3, False])['S273']['saved'] == 3  # sponsor's own donation, no X rebate
    p.sponsors = []
    assert state_totals(event('donation'), s) == {}


def test_excavation_known_geometry_awards_the_doubled_printed_bonus_types_only():
    s = state('6a-legacy');s.players[0].sponsors = ['S271'];s.config.map_known = [True, True]
    ev = event('buyBuilding', building={'type': 'excavation', 'x': 6, 'y': 3, 'rotation': 3})
    assert state_totals(ev, s)['S271'] == {'doubled:Clever': 1, 'doubled:Fac': 1}
    s.players[0].sponsors.append('S280')
    assert state_totals(ev, s) == {}
    s.players[0].sponsors.remove('S280');s.config.map_known[0] = False
    assert state_totals(ev, s) == {}
    s.config.map_known[0] = True
    s.players[0].buildings.append(Building(1, 'excavation', 6, 3, rotation=3))
    assert state_totals(ev, s) == {}


@pytest.mark.parametrize('gid,key,stat,expected', [
    ('798345117', 'S231', 'appeal', 1), ('798345117', 'S231', 'money', 3),
    ('800966139', 'S233', 'appeal', 5), ('800966139', 'S233', 'money', 9),
    ('930258897', 'S234', 'appeal', 4), ('930258897', 'S234', 'money', 12),
    ('937181556', 'S235', 'appeal', 1), ('937181556', 'S235', 'money', 3),
    ('853899676', 'S253', 'tokens_spent', 3), ('927726814', 'S253', 'tokens_spent', 2),
    ('800999064', 'S257', 'money', 32), ('800999064', 'S257', 'appeal_final', 5),
    ('798345117', 'S258', 'appeal', 6), ('927743770', 'S259', 'appeal', 5), ('927743770', 'S259', 'conservation', 1),
    ('927743770', 'S260', 'appeal', 6), ('927743770', 'S260', 'conservation', 2),
    ('770429314', 'S261', 'conservation', 1), ('791369985', 'S261', 'conservation', 1),
    ('833146203', 'S265', 'money', 0), ('833146203', 'S265', 'conservation', 1),
    ('760993552', 'S267', 'appeal', 3), ('927726814', 'S268', 'animals_marked', 3),
    ('927683584', 'S269', 'appeal_enlargement', 8), ('927683584', 'S269', 'appeal_final', 3),
    ('714192218', 'S270', 'scuba3', 2), ('795215166', 'S270', 'scuba3', 5), ('795215166', 'S270', 'conservation', 1),
    ('770429314', 'S271', 'doubled:money', 5), ('798345117', 'S271', 'doubled:Fac', 1), ('798345117', 'S271', 'doubled:Clever', 1),
    ('798345117', 'S272', 'conservation', 1), ('833146203', 'S274', 'appeal_income', 1), ('833146203', 'S274', 'appeal_final', 2),
    ('795215166', 'S279', 'appeal_initial', 2), ('795215166', 'S279', 'appeal_final', 5),
    ('798345117', 'S280', 'kiosk', 1), ('798345117', 'S280', 'pavilion', 1), ('760993552', 'S280', 'appeal_final', 5),
    ('902906029', 'S281', 'money', 12), ('902906029', 'S281', 'appeal_final', 2),
])
def test_frozen_remaining_sponsor_totals(gid, key, stat, expected):
    assert logged_totals(gid)[key][stat] == expected


def test_complete_replay_publications_franchise_zero_and_statue_timing():
    view = replay('833146203');final = view['steps'][-1]['state']['sponsor_stats']
    assert final['S273'] == {'saved': 17, 'donations': 4}
    assert final['S265'] == {'money': 0, 'conservation': 1}
    assert final['S274'] == {'appeal_income': 1, 'appeal_final': 2}
    assert at_move(view, 304)['S265']['money'] == 0
    assert 'appeal_income' not in at_move(view, 376).get('S274', {})
    assert at_move(view, 381)['S274']['appeal_income'] == 1


def test_complete_replay_geometry_and_source_observations_do_not_double_count():
    view = replay('798345117');final = view['steps'][-1]['state']['sponsor_stats']
    assert final['S271'] == {'doubled:Clever': 1, 'doubled:Fac': 1}
    assert final['S280'] == {'kiosk': 1, 'pavilion': 1}
    assert final['S273']['saved'] == 2
    assert 'S271' not in at_move(view, 242)
    assert at_move(view, 243)['S271'] == {'doubled:Clever': 1, 'doubled:Fac': 1}


def test_complete_replay_unknown_map_excavation_fallback_and_distinct_scuba_counter():
    unknown = replay('770429314')['steps'][-1]['state']['sponsor_stats']
    assert unknown['S271']['doubled:money'] == 5
    scuba = replay('714192218')['steps'][-1]['state']['sponsor_stats']
    assert scuba['S270'] == {'scuba3': 2}
    assert scuba['S279'] == {'appeal_initial': 2, 'appeal_final': 3}


def test_association_donation_source_is_not_assumed_for_a_nested_publications_donation():
    from ark_nova.replay.sponsor_stats import sponsor_source_hints
    raw = {'data': {'players': [{'id': '1'}, {'id': '2'}], 'logs': [
        packet(1, 1, [raw_state(33)]),
        packet(2, 2, [{'type': 'donation', 'args': {'player_id': 1}}, raw_state(91)]),
        packet(3, 3, [{'type': 'donation', 'args': {'player_id': 1}}]),
    ]}}
    parsed = parse_log(raw)
    hints = sponsor_source_hints(raw, parsed)
    donations = [e for m in parsed.moves for e in m.events if e.type == 'donation']
    assert hints[donations[0].order] == 'association-donation'
    assert donations[1].order not in hints
