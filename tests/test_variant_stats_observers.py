"""Action-card statistics observed on actual engine transitions, including action completion and source isolation."""
import copy
import json
from pathlib import Path
import shutil
import subprocess

import pytest

from ark_nova import data
from ark_nova.engine.actions import Action
from ark_nova.engine.game import apply, legal_actions
from ark_nova.engine.state import Token
from ark_nova.replay.variant_stats import observe_variants
from tests.test_engine_turn import _started
from tests.test_animal_abilities import _zoo


def selected(typ, variant, level=1, strength=5):
    s = _started();p = s.players[0]
    card = next(c for c in p.action_cards if c.type == typ)
    card.variant, card.level = variant, level
    p.action_cards.remove(card);p.action_cards.insert(min(strength, 5) - 1, card)
    p.x_tokens = max(0, strength - 5);p.money = 100
    return apply(s, Action(0, 'choose_action_card', {'type': typ, 'spend': max(0, strength - 5)}))


def observed(before, action):
    after = apply(before, action)
    return after, observe_variants(before, action, after)


@pytest.mark.parametrize('level,expected', [(1, [1, 0, 1, 0, 1, 1, 1]), (2, [0, 1, 0, 1, 1, 1, 1])])
def test_keep_cards_extra_kept_matches_both_strength_tables_on_completed_draws(level, expected):
    for strength, n in enumerate(expected, 1):
        before = selected('cards', 1, level, strength)
        count = before.prompt.args['remaining']
        after, observations = observed(before, Action(0, 'take_cards', {'mode': 'deck', 'count': count}))
        assert len(after.players[0].hand) == len(before.players[0].hand) + count
        assert observations == ([('0:cards', 'extra_kept', 1)] if n else [])


def test_keep_cards_mixed_draws_credit_only_the_last_acquisition():
    s = selected('cards', 1, 2, 5)
    s.players[0].reputation = 15
    s, first = observed(s, Action(0, 'take_cards', {'mode': 'range', 'card': s.display[0]}))
    assert first == []
    s, second = observed(s, Action(0, 'take_cards', {'mode': 'deck', 'count': 1}))
    assert second == []
    s, final = observed(s, Action(0, 'take_cards', {'mode': 'deck', 'count': 2}))
    assert final == [('0:cards', 'extra_kept', 1)]


@pytest.mark.parametrize('level', [1, 2])
def test_keep_cards_snap_is_not_an_extra_card_kept(level):
    s = selected('cards', 1, level, 5)
    _, out = observed(s, Action(0, 'take_cards', {'mode': 'snap', 'card': s.display[0]}))
    assert out == []


def test_standard_cards_does_not_claim_keep_cards_benefit():
    s = selected('cards', 0, 1, 5)
    _, out = observed(s, Action(0, 'take_cards', {'mode': 'deck', 'count': 3}))
    assert out == []


def test_plus_one_build_counts_extra_copies_per_size_and_independently_counts_extra_strength():
    s = selected('build', 3, 2, 5)
    all_observations = []
    for typ in ['size-2', 'size-2', 'size-1', 'size-1']:
        act = next(a for a in legal_actions(s) if a.kind == 'place_building' and a.args.get('type') == typ)
        s, out = observed(s, act)
        all_observations.extend(out)
    assert sum(n for _, stat, n in all_observations if stat == 'identical') == 2
    assert sum(n for _, stat, n in all_observations if stat == 'extra_strength') == 1
    assert [b.type for b in s.players[0].buildings] == ['size-2', 'size-2', 'size-1', 'size-1']


def test_plus_one_build_does_not_count_a_same_size_enclosure_from_an_earlier_action():
    s = selected('build', 3, 2, 5)
    act = next(a for a in legal_actions(s) if a.kind == 'place_building' and a.args.get('type') == 'size-1')
    s, out = observed(s, act)
    assert not any(stat == 'identical' for _, stat, _ in out)
    s = apply(s, Action(0, 'finish_build', {}))
    s = apply(s, Action(1, 'skip_action', {'type': 'animals'}))
    s = apply(s, Action(0, 'choose_action_card', {'type': 'build', 'spend': 0}))
    # A real subsequent action starts a fresh count even though the old enclosure remains in the zoo.
    act = next(a for a in legal_actions(s) if a.kind == 'place_building' and a.args.get('type') == 'size-1')
    _, out = observed(s, act)
    assert not any(stat == 'identical' for _, stat, _ in out)


def ignore_animal(single, satisfied=False, token=False):
    s = _zoo('A409', level=1, slot=5)
    next(c for c in s.players[0].action_cards if c.type == 'animals').variant = 1
    if not satisfied:
        s.players[0].tokens = []
    if token:
        s.players[0].tokens.append(Token(999, 'bonus-ignore-conditions', 'notepad'))
    s = apply(s, Action(0, 'choose_action_card', {'type': 'animals', 'spend': 0}))
    if single:
        s, out = observed(s, Action(0, 'animals_single', {}))
        assert out == []
    act = next(a for a in legal_actions(s) if a.kind == 'play_animal' and a.args['card'] == 'A409')
    return observed(s, act)


def test_ignore_animals_engine_choice_does_not_itself_credit_the_raw_log_counter():
    _, out = ignore_animal(True)
    assert out == []  # The UI counter is now supplied only by confirmed raw-log evidence.
    _, out = ignore_animal(True, satisfied=True)
    assert out == []


def test_ignore_animals_does_not_claim_a_condition_bypassed_by_a_bonus_token():
    _, out = ignore_animal(False, token=True)
    assert out == []


def clever_ready(level):
    s = selected('cards', 4, level, 4)
    s = apply(s, Action(0, 'take_cards', {'mode': 'deck', 'count': s.prompt.args['remaining']}))
    if s.prompt.kind == 'cards_discard':
        s = apply(s, next(a for a in legal_actions(s) if a.kind == 'discard_cards'))
    assert s.prompt.kind == 'effects' and s.prompt.args['pending'][0]['source'] == 'cards4'
    return s


@pytest.mark.parametrize('level,stat,cost', [(1, 'clever_paid', 2), (2, 'clever_free', 0)])
def test_clever_cards_counts_only_its_resolved_source_and_separates_actual_cost(level, stat, cost):
    s = clever_ready(level);money = s.players[0].money
    after, out = observed(s, Action(0, 'choose_effect', {'index': 0, 'type': 'animals'}))
    assert out == [('0:cards', stat, 1)]
    assert after.players[0].money == money - cost
    _, skipped = observed(s, Action(0, 'skip_effect', {'index': 0}))
    assert skipped == []
    other = copy.deepcopy(s);other.prompt.args['pending'][0]['source'] = 'S214'
    _, out = observed(other, Action(0, 'choose_effect', {'index': 0, 'type': 'animals'}))
    assert out == []


def test_marketing_counts_an_actual_sponsor_play_not_a_discard_without_a_play():
    s = selected('sponsors', 4, 2, 5)
    s.prompt.args['broke'] = True  # state after taking this action's break-for-money option
    s.players[0].hand = ['A409', 'S229']
    actual = next(a for a in legal_actions(s) if a.kind == 'sponsor_side' and a.args.get('card') == 'A409' and a.args.get('play') == 'S229')
    after, out = observed(s, actual)
    assert 'S229' in after.players[0].sponsors
    assert out == [('0:sponsors', 'play', 1)]
    decline = Action(0, 'sponsor_side', {'op': 'discard_play', 'card': 'A409', 'play': None})
    after, out = observed(s, decline)
    assert 'A409' not in after.players[0].hand and 'S229' not in after.players[0].sponsors
    assert out == []


def test_action_card_catalog_uses_the_requested_names_and_preserves_money_variant_two():
    cards = {(c['category'], c['variant']): c for c in json.loads((data.DATA_DIR / 'action_cards.json').read_text('utf-8'))}
    assert cards['sponsors', 1]['name'] == 'Trade Sponsors'
    assert cards['sponsors', 2]['name'] == 'Money Sponsors'
    assert cards['sponsors', 4]['name'] == 'Marketing Sponsor'
    english = json.loads((Path(__file__).resolve().parents[1] / 'scripts/cardgen/site/locales/en/common.json').read_text('utf-8'))
    assert english['actions']['sponsors_1_name'] == 'Trade Sponsors'
    assert english['actions']['sponsors_4_name'] == 'Marketing Sponsor'


def test_action_variant_hover_rendering():
    node = shutil.which('node')
    if not node:
        pytest.skip('Node not on PATH; run tests/test_variant_stats.cjs separately')
    run = subprocess.run([node, str(Path(__file__).with_name('test_variant_stats.cjs'))], capture_output=True, text=True, timeout=20)
    assert run.returncode == 0, run.stdout + run.stderr


def test_plus_one_build_does_not_claim_an_engineer_repeat():
    s = selected('build', 3, 2, 5)
    s.players[0].sponsors.append('S217')
    first = next(a for a in legal_actions(s) if a.kind == 'place_building' and a.args.get('type') == 'size-2')
    s = apply(s, first)
    engineer = next(a for a in legal_actions(s) if a.kind == 'place_building' and a.args.get('engineer') and a.args.get('type') == 'size-2')
    _, out = observed(s, engineer)
    assert out == []


def test_plus_one_build_does_not_claim_a_free_building_from_another_effect():
    from ark_nova.engine import effects
    s = selected('build', 3, 2, 5)
    first = next(a for a in legal_actions(s) if a.kind == 'place_building' and a.args.get('type') == 'size-1')
    s = apply(s, first)
    effects.open_prompt(s, 0, [{'kind': 'build', 'source': 'bonus', 'type': 'size-1', 'rules': {}, 'optional': True, 'double': False}],
                        {'kind': 'prompt', 'prompt_kind': 'build_place', 'args': copy.deepcopy(s.prompt.args)})
    free = next(a for a in legal_actions(s) if a.kind == 'place_building')
    _, out = observed(s, free)
    assert out == []
