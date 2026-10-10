// [module] The action bar at the top (replay: current action; fork / sandbox: the playable controls), prompts and draft marks.
import { $, el, seatColor, seatText } from './util.js';
import { FORK, PLAY, S } from './state.js';
import { curState, seatOrder } from './pov.js';
import { bindPreview, cardMarks, cardName, orderedKeys } from './cards.js';
import { ACTION_ICON, ACTION_NAMES, ICON_IDS, iconUrl, pic } from './icons.js';
import { renderDock } from './dock.js';
import { forkBar, keepSel, playFork } from './fork.js';
import { render } from './main.js';
import { go } from './playback.js';
import { frameKind } from './frames.js';


// the bar above the boards, like BGA's: what the active player can do now. Before an action card is chosen: the five action cards (the number is the
// strength of its space) and the X tokens that could raise it
// The decision comes from the rules engine (`step.options`: its prompt and a summary of legal_actions) on the steps the engine played; on the other
// steps the bar is guessed from the log-built state (only the choice of an action card).
export const PROMPT_TEXT = {
  build_place: 'must place a building', cards_take: 'must take cards', cards_discard: 'must discard cards', sponsors_play: 'may play a sponsor',
  animals_play: 'may play an animal', association_tasks: 'may perform an association task', effects: 'must resolve an effect',
};
const KIND_LABEL = {
  draft_pick: 'Pick an action card', draft_keep: 'Keep two action cards', initial_discard: 'Initial discard',
  place_building: 'Place a building', finish_build: 'Done building', take_cards: 'Take a card', play_animal: 'Play an animal', finish_animals: 'Done with animals',
  play_sponsor: 'Play a sponsor', sponsor_break: 'Advance the break', finish_sponsors: 'Done with sponsors', association_task: 'Association task', donate: 'Donate',
  finish_association: 'Done with association', discard_cards: 'Discard', choose_effect: 'Resolve an effect', skip_effect: 'Skip the effect', take_instead: 'Take a card instead',
  self_clever: 'Do nothing (Self-clever)', skip_extra: 'No second action', sponsor_side: 'Sponsors side action', animals_single: 'Play a single animal', choose_slot: 'Choose a slot',
  choose_bonus: 'Choose a bonus', upgrade_action_card: 'Upgrade an action card',
};
// The action card draft: each player is offered variants of the action cards (full card pictures) and selects the ones to keep; the replay shows what the
// players were offered and what they chose (a green frame with a check mark). Both players choose at the same time, so both groups are shown.
function draftCardUrl(v) { const m = /^([a-z]+)(\d)$/.exec(v); return m ? '/action_cards/' + m[1] + '_' + m[2] + '_1.webp' : ''; }
export const forkActs = (pred) => (FORK && S.replay.steps[S.step].actions || []).filter(pred || (() => true));
// a control of the bar plays the legal action it stands for (with several: a row of buttons for them appears)
export function bindActs(node, acts) {
  if (!FORK || !acts.length) return node;
  for (const a of acts) S.forkClaimed.add(a);
  node.classList.add('choosable');
  node.onclick = () => {
    if (S.forkBusy) return;
    if (acts.length === 1) playFork(acts[0]);
    else { S.forkMenu = { label: node.title || '', acts }; refreshBar(); }
  };
  return node;
}
// a card is chosen to be played (an animal, a sponsor, a Marketing sponsor...): only one can be selected at a time
// an effect that takes one card of the hand or of the display (digging, ...): the card is selected with a click, then confirmed (see forkBar)
export const effectKindOf = (a) => { const e = (((S.replay.steps[S.step].options || {}).effects) || []).find((x) => x.index === a.args.index); return e ? e.kind : ''; };
export const pickCardOf = (a) => (typeof a.args.display === 'string' ? a.args.display : typeof a.args.hand === 'string' ? a.args.hand : null);
export const cardPickAct = (a) => a.kind === 'choose_effect' && typeof a.args.index === 'number' && !Array.isArray(a.args.cards) && !!pickCardOf(a) && effectKindOf(a) !== 'marketing';
export function animalSelection() {                                       // the animal selected in the hand / display with the enclosures it can go to
  if (!FORK) return null;
  const acts = forkActs((a) => a.kind === 'play_animal' && 'x' in a.args && !a.args.stored);
  if (!acts.length) return null;
  const st = curState(), seat = acts[0].player, picked = [];
  orderedKeys(seat + ':hand', st.players[seat].hand).forEach((k, i) => { if (cardMarks.has(seat + ':hand#' + i)) picked.push(k); });
  st.display.forEach((k, i) => { if (k && cardMarks.has('display#' + i)) picked.push(k); });
  const card = picked.find((k) => acts.some((a) => a.args.card === k));
  return card ? { seat, card, acts: acts.filter((a) => a.args.card === card) } : null;
}
export const forkSingleSelect = () => S.marketMode !== null || forkActs(cardPickAct).length > 0 || forkActs((a) => a.args && a.args.card && !a.args.from_display && ['play_animal', 'play_sponsor', 'sponsor_side'].includes(a.kind)).length > 0;
export function afterMark() {                                             // a card was (de)selected: an animal's selection also changes the enclosures of the zoo
  if (forkActs((a) => a.kind === 'play_animal' && 'x' in a.args).length) render(); else refreshBar();
}
export function refreshBar() { actionBar(curState()); if (FORK) forkBar(); }
// Undo / Restart turn of the fork: undo goes back one step, restart to the choice of the action card at the start of the turn; neither goes back over a step that
// cannot be taken back (cards drawn, a search / pilfer choice: `irreversible` from the server)
function turnTargets(turn, active) {
  const same = (k) => k >= 0 && S.replay.steps[k].state.turn === turn && S.replay.steps[k].state.active_player === active;
  const irrev = (k) => !!S.replay.steps[k].irreversible;
  if (S.step <= 0 || irrev(S.step) || !same(S.step - 1)) return { undo: null, restart: null };
  let j = S.step - 1;
  for (let k = S.step - 1; same(k); k--) {
    const sk = S.replay.steps[k];
    if (sk.options && sk.options.prompt === 'choose_action_card' && !sk.options.only) j = k;
    if (irrev(k)) { j = k; break; }
  }
  return { undo: S.step - 1, restart: j };
}
export function turnButtons(bar, turn, active, confirm) {
  const t = turnTargets(turn, active);
  for (const [cls, label, tip, target] of [...(confirm ? [['confirm', 'Confirm', 'Confirm the turn and pass to the next player', 0]] : []),
                                           ['undo', 'Undo last step', 'Take back the last step (not possible after cards were drawn or a search / pilfer choice)', t.undo],
                                           ['restart', 'Restart turn', 'Take back the steps of the turn, to the choice of the action card (no further back than a step that cannot be taken back)', t.restart]]) {
    const b = el('button', 'turnbtn ' + cls, label);
    b.type = 'button'; b.title = tip;
    b.disabled = cls !== 'confirm' && target === null;
    b.onclick = () => { if (cls === 'confirm') { S.forkConfirmed = S.step; refreshBar(); } else go(target); };
    bar.append(b);
  }
}
// the lightbox of the action card draft in the replay (a layer of its own under the sidebar's side of the page: the sidebar with the playback buttons stays usable)
function draftPopup() {
  let box = $('draftbox');
  if (!box) { box = el('div', 'draftbox'); box.id = 'draftbox'; box.hidden = true; document.body.append(box); }
  return box;
}
export const draftMarks = new Set();                                          // the cards the viewer highlighted with a click: cleared at every step
function draftBar(bar, d) {
  const groups = [], choosers = [];
  for (const seat of seatOrder()) {
    const offers = d.offers[seat] || [];
    if (!offers.length) continue;
    const keeping = d.stage === 'keep' || d.stage === 'done';
    const chosen = keeping ? (d.kept[seat] || []) : (d.picked[seat] || []).slice(d.stage === 'pick2' ? 1 : 0);          // (the choices of this round only)
    const need = keeping ? 2 : 1;
    const group = el('div', 'draftgroup');
    const mine = FORK ? (S.replay.steps[S.step].actions || []).filter((a) => a.player === seat && (a.kind === 'draft_pick' || a.kind === 'draft_keep')) : [];       // the fork lets the viewer choose
    const sel = mine.length ? (keepSel.get('d' + seat) || []) : [];
    if (mine.length) keepSel.set('d' + seat, sel);
    const who = el('span', 'who', S.replay.players[seat].name);
    who.style.color = seatText(seat);
    const head = el('div', 'drafthead');
    const done = !FORK && chosen.length >= need;                              // (the replay shows the draft as it goes: a player who has chosen no longer "must" choose)
    head.append(who, el('b', '', done ? (need === 1 ? ' selected this action card' : ' selected these 2 action cards')
      : need === 1 ? ' must select the action card you want to keep' : ' must select the 2 action cards you want to keep'));
    const row = el('div', 'draftcards');
    if (d.stage === 'pick2' && (d.picked[seat] || []).length) {          // the second pick: the card picked in the first round stays in a green zone to the left
      const zone = el('div', 'draftkept');
      zone.title = 'Picked in the first round';
      const v = d.picked[seat][0];
      const card = el('div', 'draftcard picked');
      const img = el('img'); img.src = draftCardUrl(v); img.alt = v;
      card.append(img, el('span', 'draftcheck', '✓'));
      bindPreview(card, () => draftCardUrl(v));
      zone.append(card);
      row.append(zone);
    }
    for (const v of offers) {
      const mark = seat + ':' + v;
      const card = el('div', 'draftcard' + (chosen.includes(v) ? ' picked' : chosen.length ? ' passed' : '') + (draftMarks.has(mark) ? ' marked' : ''));
      card.title = 'Click to highlight this card (the highlight goes away at the next step)';
      card.addEventListener('click', () => { if (draftMarks.has(mark)) draftMarks.delete(mark); else draftMarks.add(mark); card.classList.toggle('marked'); });
      if (mine.length && mine.some((a) => (a.kind === 'draft_keep' ? a.args.keep.includes(v) : a.args.variant === v))) {
        card.title = 'Click to choose this card; click another to change the choice';
        card.classList.add('choosable');
        card.classList.toggle('marked', sel.includes(v));
        choosers.push([card, v]);
      }
      const img = el('img'); img.src = draftCardUrl(v); img.alt = v; img.loading = 'lazy';
      card.append(img);
      if (chosen.includes(v)) card.append(el('span', 'draftcheck', '✓'));
      if (d.auto && d.auto[seat] === v) card.title = 'Added at random: the three variants were of one action card';
      bindPreview(card, () => draftCardUrl(v));
      row.append(card);
    }
    group.append(head, row);
    if (mine.length) {
      const keepRound = mine[0].kind === 'draft_keep';
      const confirm = el('button', 'forkmove forkconfirm');
      confirm.type = 'button';
      confirm.style.setProperty('--pc', seatColor(seat));
      const match = () => mine.find((a) => (keepRound ? [...a.args.keep].sort().join() === [...sel].sort().join() : a.args.variant === sel[0]));
      const refresh = () => { confirm.textContent = 'Confirm (' + sel.length + '/' + (keepRound ? 2 : 1) + ')'; confirm.disabled = S.forkBusy || !match(); };
      for (const [card, v] of choosers.splice(0)) {
        card.addEventListener('click', (ev) => {
          ev.stopImmediatePropagation();
          const i = sel.indexOf(v);
          if (i >= 0) sel.splice(i, 1); else { if (sel.length >= (keepRound ? 2 : 1)) sel.shift(); sel.push(v); }
          for (const n of row.querySelectorAll('.choosable')) n.classList.toggle('marked', sel.includes(n.firstChild.alt));
          refresh();
        }, true);
      }
      confirm.onclick = () => { const act = match(); if (act) playFork(act); };
      refresh();
      group.append(confirm);
    }
    groups.push(group);
  }
  if (!groups.length) return false;
  bar.hidden = false;
  bar.classList.add('draftbar');
  bar.append(...groups);
  return true;
}
// Simultaneous decisions: the replay shows one of them at a time, the point of view's player first, else the player whose zoo is on the left (seat 0)
export function prioritySeat(seats) {
  if (!seats.length) return null;
  return S.pov !== null && seats.includes(S.pov) ? S.pov : Math.min(...seats);
}
// the step that puts the action card back on slot 1 ends the turn: the state already passes it on to the other player
export function turnEnds(i) {
  const steps = S.replay.steps, st = steps[i].state, before = i > 0 ? steps[i - 1].state : null;
  return !!before && st.turn > before.turn && st.active_player !== before.active_player && (before.phase === 'turn' || before.phase === 'final_turns');
}
// Draws the bar of the frame `kind` (frames.js) into `bar`: 'text' (replay: the step text is on show, no bar), 'draft' (the action card draft), 'gate' (the turn-end confirmation), 'decision' (what the
// engine says is pending after the step) or 'both' (fork / sandbox, and the action card draft: the bar is shown with the step text). Other bars than the #actionbar
// can be drawn into (frames.js asks whether a decision frame has anything to show).
export function actionBar(st, kind = frameKind(), bar = $('actionbar')) {
  S.forkClaimed = new Set();
  S.forkGate = false;
  bar.replaceChildren();
  bar.classList.remove('draftbar');
  const popup = bar === $('actionbar') && !FORK ? draftPopup() : null;       // replay: the action card draft is not drawn into the move bar (the cards are far too high for it) but into a lightbox over the boards
  if (popup) { popup.hidden = true; popup.replaceChildren(); }
  const cur = S.replay.steps[S.step], o = cur.options;
  if (kind === 'text') { bar.hidden = true; return; }
  // The action card draft (a Marine Worlds mechanism) has its own frame in the replay, 'draft': the bar alone, without step text, with the cards on offer and what each
  // player picked / kept so far (point of view: only the viewer's own offers). The fork shows it together with the step text, like every bar.
  if (popup && kind === 'draft' && st.phase === 'setup' && st.draft && st.draft.stage !== 'done') {
    const pop = el('div', 'draftpop');
    if (draftBar(pop, st.draft)) {
      pop.style.setProperty('--cn', String(Math.max(3, ...[0, 1].map((i) => (st.draft.offers[i] || []).length + (st.draft.stage === 'pick2' ? 1 : 0)))));
      popup.append(pop); popup.hidden = false; bar.hidden = true;
      return;
    }
  }
  if (st.phase === 'setup' && st.draft && st.draft.stage !== 'done' && (FORK || kind === 'draft') && draftBar(bar, st.draft)) return;
  if (!FORK && st.phase === 'setup') {                                          // the starting hand: 8 cards drawn, 4 to discard (initial selection)
    const seat = prioritySeat([0, 1].filter((i) => S.replay.steps[S.step].state.players[i].hand.length > 4));
    if (seat !== null) {
      const who = el('span', 'who', S.replay.players[seat].name);
      who.style.color = seatText(seat);
      bar.hidden = false;
      bar.append(who, el('b', '', ' must discard ' + (S.replay.steps[S.step].state.players[seat].hand.length - 4) + ' cards (initial selection)'));
      return;
    }
  }
  // the step that puts the action card back on slot 1 ends the turn (the state already passes it on): the player has to confirm it. In the replay the buttons
  // are only shown, greyed out; in the game Confirm passes the turn, Undo takes back the last effect that can be taken back, Restart turn all of them
  const before = S.step > 0 ? S.replay.steps[S.step - 1].state : null;
  if (turnEnds(S.step) && kind !== 'decision' && !(FORK && S.forkConfirmed === S.step) && !PLAY) {
    bar.hidden = false;
    S.forkGate = FORK;
    const who = el('span', 'who', S.replay.players[before.active_player].name);
    who.style.color = seatText(before.active_player);
    bar.append(who, el('b', '', ' must confirm or restart your turn'));
    if (FORK) turnButtons(bar, before.turn, before.active_player, true);
    else for (const [cls, label, tip] of [['confirm', 'Confirm', 'Confirm the turn and pass to the next player'],
                                          ['undo', 'Undo last step', 'Take back the last effect (only if it can be taken back)'],
                                          ['restart', 'Restart turn', 'Take back all the steps of the turn (to its start or the last effect that cannot be taken back)']]) {
      const b = el('button', 'turnbtn ' + cls, label);
      b.type = 'button'; b.disabled = true; b.title = tip + ' - not available in the replay';
      bar.append(b);
    }
    return;
  }
  const fromEngine = cur.engine && cur.engine.source === 'engine';
  const seat = o ? o.seat : st.active_player;
  const choosing = o ? true : !fromEngine && (st.phase === 'turn' || st.phase === 'final_turns') && !st.current_action && st.players[seat] && st.players[seat].action_cards;
  bar.hidden = !choosing;
  if (!choosing) return;
  if (o && o.prompt !== 'choose_action_card') { genericBar(bar, st, o, seat); return; }
  const p = st.players[seat];
  // X tokens already paid for this action ("pays 1 xtoken for increasing card strength" comes before the card is chosen): they raise every strength
  let spent = 0;
  for (let j = S.step; j >= 0; j--) {
    const m = /pays (\d+) xtoken for increasing card strength/.exec(S.replay.steps[j].label || '');
    if (!m) break;
    spent += +m[1];
  }
  const fa = FORK ? (cur.actions || []) : [];                           // the fork: the bar is the way to play (the engine's legal actions are compiled from the clicks)
  const mayChoose = (type) => fa.some((x) => x.kind === 'choose_action_card' && x.args.spend === S.forkSpend && x.args.type === type);
  const maySkip = (type) => fa.some((x) => x.kind === 'skip_action' && x.args.type === type);
  if (FORK) spent += S.forkSpend;
  const who = el('span', 'who', S.replay.players[seat].name);
  who.style.color = seatText(seat);
  bar.append(who, el('b', '', o && o.only ? ' must choose the second action' : ' must choose an action card'));
  p.action_cards.forEach((a, i) => {
    const b = el('span', 'abtn' + (a.level === 2 ? ' lvl2' : '') + (o && !o.cards[a.type] ? ' off' : ''));       // (greyed out: the engine does not offer it)
    b.title = ACTION_NAMES[a.type] + (a.level === 2 ? ' II' : '') + ', strength ' + (i + 1 + spent) + ' (up to ' + (i + 1 + spent + p.x_tokens) + ' with X tokens)';
    b.append(pic(ACTION_ICON[a.type], 26), el('b', '', i + 1 + spent));
    if (FORK && (S.skipMode ? maySkip(a.type) : mayChoose(a.type))) {
      b.classList.add('choosable');
      b.title = S.skipMode ? 'Put ' + ACTION_NAMES[a.type] + ' back to slot 1 and gain an X token' : 'Choose ' + ACTION_NAMES[a.type] + (S.forkSpend ? ', spending ' + S.forkSpend + ' X token' + (S.forkSpend === 1 ? '' : 's') : '');
      b.onclick = () => {
        const pool = fa.filter((x) => (S.skipMode ? x.kind === 'skip_action' && x.args.type === a.type && !x.args.repeat
                                                : x.kind === 'choose_action_card' && x.args.type === a.type && x.args.spend === S.forkSpend && !x.args.hypnosis && !x.args.t1));
        if (pool.length && !S.forkBusy) playFork(pool[0]);
      };
    } else if (FORK) b.classList.add('off');
    if (S.replay.marine_worlds && a.variant) {          // the variant's silver effect badge, like on the action card in the tracker
      const v = el('img', 'variant');
      v.src = '/action_icons/' + a.type + '_' + a.variant + '_' + (a.level === 2 ? 2 : 1) + '.webp'; v.alt = 'Variant ' + a.variant;
      b.append(v);
    }
    bar.append(b);
  });
  if (!FORK) return;                                                    // the replay shows no X token controls (the log already tells what was spent); fork / sandbox / live keep them
  // spending X tokens raises the strength of the chosen card: - (nothing spent yet, so greyed out) | X tokens | + (greyed out without tokens)
  const xs = (sign, label, off) => {
    const btn = el('button', 'xstep', sign);
    btn.type = 'button'; btn.title = label; btn.disabled = off; btn.setAttribute('aria-label', label);
    return btn;
  };
  const maxSpend = o ? Math.max(0, ...Object.values(o.cards).flat()) : p.x_tokens;       // the most X tokens the engine lets the player spend
  const x = el('span', 'abtn xbtn');
  x.title = 'X tokens that can raise the strength of the chosen card';
  x.append(el('b', '', p.x_tokens), pic('xtoken', 26));
  const minus = xs('−', 'Spend one X token less', FORK ? S.forkSpend === 0 : spent === 0);
  const plus = xs('+', 'Spend one more X token to raise the strength', FORK ? !fa.some((x) => x.kind === 'choose_action_card' && x.args.spend > S.forkSpend) : o ? maxSpend - spent <= 0 : p.x_tokens === 0);
  if (FORK) {
    minus.onclick = () => { S.forkSpend--; refreshBar(); };
    plus.onclick = () => { S.forkSpend++; refreshBar(); };
  }
  bar.append(minus, x, plus);
  // or put one of the action cards back to slot 1 and gain an X token (not possible at the maximum of 5)
  const canGain = FORK ? fa.some((x) => x.kind === 'skip_action') : o ? o.skip.length > 0 : p.x_tokens < 5;
  const gain = el('span', 'abtn gainx' + (canGain ? '' : ' off') + (FORK && S.skipMode ? ' on' : ''));
  if (FORK && canGain) {
    gain.classList.add('choosable');
    gain.onclick = () => { S.skipMode = !S.skipMode; refreshBar(); };
  }
  gain.title = !canGain ? 'Not possible now (the maximum is 5 X tokens)' : 'Instead of an action: put one action card back to slot 1 and gain an X token';
  const rawIcon = (id, h) => { const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = ''; i.height = h; return i; };
  gain.append(rawIcon('r6c6', 30), el('b', '', ':'), rawIcon('r5c6', 26));
  bar.append(gain);
}

// taking cards: what it is for, and the button to draw from the deck; the display cards that can be taken are the ones not greyed out
const SOURCE_TEXT = { bonus: 'placement bonus', 'reputation track': 'reputation track', association4: 'association', map13: 'map bonus' };
// the action card of the running action with its strength, as in front of BGA's prompt
function actionBadge(st) {
  const ca = st.current_action || {};
  const card = (st.players[ca.seat] && st.players[ca.seat].action_cards[ca.slot - 1]) || {};      // (the log-built state only knows the slot of the card)
  const type = ca.type || card.type, level = ca.level || card.level;
  const b = el('span', 'abtn' + (level === 2 ? ' lvl2' : ''));
  b.title = (ACTION_NAMES[type] || '') + (level === 2 ? ' II' : '') + ', strength ' + ca.strength;
  if (type) b.append(pic(ACTION_ICON[type], 26), el('b', '', ca.strength));
  return b;
}
// the Association action: one button per kind of task that can be done now (not one per partner zoo / university)
const TASK_TEXT = { partner: 'Take a partner zoo', university: 'Take a university', conservation: 'Support a conservation project', hire: 'Hire a worker' };
function associationBar(bar, o) {
  const chosen = FORK && S.assocMode && forkActs((a) => a.kind === 'association_task' && a.args.task === S.assocMode);
  const species = FORK && S.assocMode === 'university' && S.assocSpecies !== null && chosen && chosen.filter((a) => a.args.category && (a.args.kind + (a.args.supply ? ':supply' : '')) === S.assocSpecies);
  if (species && species.length) {                                // a blank university: the species that nobody has taken yet, and only those
    bar.append(el('b', '', ' must choose the species of the university'));
    for (const a of species) {
      const b = el('span', 'abtn deckbtn tilebtn');
      const i = el('img', 'icon'); i.src = iconUrl(ICON_IDS['fac-science-' + a.args.category] || ICON_IDS['bonus:Fac']); i.alt = a.args.category; i.height = 44;
      b.append(i);
      b.title = 'University: ' + a.args.category;
      bindActs(b, [a]);
      bar.append(b);
    }
    const back = el('button', 'forkmove', 'Back');
    back.type = 'button';
    back.onclick = () => { S.assocSpecies = null; refreshBar(); };
    bar.append(back);
    return;
  }
  if (chosen && chosen.length) {                                  // the fork: the tiles that can be taken, as buttons (the tiles of the board can be clicked too)
    bar.append(el('b', '', ' must choose a ' + (S.assocMode === 'partner' ? 'partner zoo' : 'university')));
    const groups = new Map();
    for (const a of chosen) {
      const key = (a.args.continent || a.args.kind) + (a.args.supply ? ':supply' : '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    }
    for (const [key, list] of groups) {
      const name = list[0].args.continent || list[0].args.kind;
      const b = el('span', 'abtn deckbtn tilebtn' + (list[0].args.supply ? ' supply' : ''));
      const i = el('img', 'icon'); i.src = iconUrl(ICON_IDS[name] || ICON_IDS['bonus:Fac']); i.alt = name; i.height = 44;
      b.append(i);
      b.title = (S.assocMode === 'partner' ? 'Partner zoo: ' : 'University: ') + name.replace(/^fac-/, '').replace(/-/g, ' ') + (list[0].args.supply ? ' (from the supply)' : '');
      if (list.some((a) => a.args.category)) { b.classList.add('choosable'); b.onclick = () => { S.assocSpecies = key; refreshBar(); }; for (const a of list) S.forkClaimed.add(a); }
      else bindActs(b, list);
      bar.append(b);
    }
    const back = el('button', 'forkmove', 'Back');
    back.type = 'button';
    back.onclick = () => { S.assocMode = null; refreshBar(); };
    bar.append(back);
    return;
  }
  bar.append(el('b', '', ' must perform an association task'));
  for (const [task, n] of Object.entries(o.association.tasks)) {
    const b = el('span', 'abtn deckbtn');
    b.title = task + ': ' + n + (n === 1 ? ' possibility' : ' possibilities');
    const tile = (id, tip) => { const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = tip; i.height = 34; return i; };
    if (task === 'reputation') b.append(el('b', '', 'Take 2'), pic('reputation', 26));
    else if (FORK && task === 'partner') { b.append(tile(ICON_IDS['bonus:Partner-Zoo'], TASK_TEXT.partner)); b.title = TASK_TEXT.partner + ': choose the partner zoo'; }
    else if (FORK && task === 'university') { b.append(tile(ICON_IDS['bonus:Fac'], TASK_TEXT.university)); b.title = TASK_TEXT.university + ': choose the university'; }
    else b.append(el('b', '', TASK_TEXT[task] || task));
    if (FORK && (task === 'partner' || task === 'university')) {
      b.classList.add('choosable');
      b.onclick = () => { S.assocMode = task; refreshBar(); };
    } else bindActs(b, forkActs((a) => a.kind === 'association_task' && a.args.task === task));
    bar.append(b);
  }
  for (const [kind, n] of Object.entries(o.kinds)) {
    if (kind === 'association_task') continue;
    const b = el('span', 'abtn gen');
    b.title = kind + ': ' + n + (n === 1 ? ' option' : ' options');
    b.append(el('b', '', KIND_LABEL[kind] || kind.replace(/_/g, ' ')));
    bar.append(b);
  }
}
// the Sponsors action: play a sponsor (click it in the hand; the cards that cannot be played are greyed out) or break for money
function sponsorsBar(bar, o) {
  const sp = o.sponsors;
  const text = sp.played ? ' may play another sponsor card' : sp.level >= 2 ? ' must play sponsor cards from hand or display or break for money' : ' must play one sponsor card from hand or break for money';
  bar.append(el('b', '', text));
  if (sp.can_break) {
    const b = el('span', 'abtn deckbtn');
    b.title = 'Instead of playing a sponsor: advance the break token by the strength and gain money';
    b.append(el('b', '', 'Break ' + sp.strength + ', Gain ' + sp.gain));
    bindActs(b, forkActs((a) => a.kind === 'sponsor_break'));
    bar.append(b);
  }
  for (const [kind, n] of Object.entries(o.kinds)) {
    if (kind === 'play_sponsor' || kind === 'sponsor_break') continue;
    const b = el('span', 'abtn gen');
    b.title = kind + ': ' + n + (n === 1 ? ' option' : ' options');
    b.append(el('b', '', KIND_LABEL[kind] || kind.replace(/_/g, ' ')));
    bar.append(b);
  }
}
function takeBar(bar, o, seat) {
  const t = o.take;
  let text;
  if (t.remaining !== undefined) {                      // the Cards action: draw (and discard) or snap
    const n = t.remaining, s = n === 1 ? ' card' : ' cards';
    text = ' must ' + (t.all_at_once && n > 1 ? 'draw all ' + n + (t.taken ? ' more' : '') + s + ' from the deck at once' : 'take ' + n + (t.taken ? ' more' : '') + s + (t.range.length ? ' from deck or display in reputation range' : ' from deck')) + (t.discard ? ' (and discard ' + t.discard + ')' : '')
      + (t.snapping && !t.taken ? ' or snap ' + t.snaps_left + ' card(s)' : '');
  }
  else {
    const src = t.source ? (SOURCE_TEXT[t.source] || (/^[ASPF]\d{3}$/.test(t.source) ? cardName(t.source) : t.source)) : '';
    text = ' must ' + (t.is_snap ? 'snap 1 card from the display' + (t.small ? ' (a small animal)' : '') : 'take 1 card from display in reputation range') + (src ? ' (' + src + ')' : '');
  }
  bar.append(el('b', '', text));
  if (t.deck && !t.range_only) {
    const b = el('span', 'abtn deckbtn');
    b.title = 'Draw from the deck';
    b.append(el('b', '', t.all_at_once && t.deck > 1 ? 'Draw all ' + t.deck + ' cards from deck' : t.deck > 1 ? 'Draw 1 to ' + t.deck + ' cards from deck' : 'Draw one card from deck'));
    bindActs(b, forkActs((a) => a.kind === 'take_cards' && a.args.mode === 'deck'));
    bar.append(b);
  }
}

// the buttons of the pending effects. Reputation, appeal and conservation gains, project rewards, placement bonuses and animal abilities are choices of the
// player; money and X token gains happen by themselves (no button).
const EFFECT_TEXT = {
  build: 'Build', take: 'Take a card', reveal: 'Reveal cards', sell: 'Sell cards', mark: 'Mark an animal', marketing: 'Marketing', donation: 'Donate', digging: 'Dig',
  scavenge: 'Scavenge', glide: 'Glide', glide_gain: 'Glide', shark: 'Shark attack', symbiosis: 'Symbiosis', cut_down: 'Cut down', trade: 'Trade', extra_shift: 'Extra shift',
  assertion: 'Assertion', pilfer: 'Pilfer', venom: 'Venom', constrict: 'Constriction', hypnosis: 'Hypnosis', pay_appeal: 'Pay appeal', slot1: 'Card to slot 1', boost: 'Boost',
  waza: 'Waza', reposition: 'Reposition', pouch: 'Pouch a card', search_discard: 'Search the discard pile', upgrade: 'Upgrade an action card', threshold2: 'Upgrade or worker',
  threshold_bonus: 'Choose a bonus', endgame_discard: 'Discard an endgame card', adapt: 'Adapt', break_discard: 'Discard to the hand limit', take_tile: 'Take a tile',
  archaeologist: 'Archaeologist', income_appeal: 'Income', project_bonus: 'Project bonus', tutor: 'Search for a card', reef: 'Reef', ability: 'Animal ability',
};
const AUTOMATIC_GAINS = new Set(['money', 'xtoken']);
function effectButton(e) {
  if (e.kind === 'gain' && AUTOMATIC_GAINS.has(e.res)) return null;
  if (e.kind === 'take' || e.kind === 'build') return null;                      // shown as the deck button / the pieces
  if (/^income_/.test(e.kind)) return null;                                       // the incomes of a break are paid by themselves (BGA shows them as log lines, not as a choice)
  if (FORK && forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index && Array.isArray(a.args.cards)).length) return null;       // (the cards are chosen in the hand: see forkBar)
  const b = el('span', 'abtn deckbtn');
  const src = e.source && /^[ASPF]\d{3}$/.test(e.source) ? cardName(e.source) : '';
  b.title = (e.name || EFFECT_TEXT[e.kind] || e.kind) + (src ? ' (' + src + ')' : '') + (e.optional ? ' - optional' : '');
  const SEARCH_ICON = { bird: ['Bird', 'r2c3'], herbivore: ['Herbivore', 'r2c4'], predator: ['Predator', 'r2c5'], primate: ['Primate', 'r2c6'], reptile: ['Reptile', 'r2c7'], marine: ['Sea animal', 'r2c8'] };
  if (e.kind === 'gain') {
    b.append(el('b', '', 'Gain ' + (e.n || 1)), pic(e.res, 26));
  } else if (e.kind === 'search_category' && SEARCH_ICON[e.category]) {        // a targeted search: "Find a {species}" with the species' search icon
    const [label, id] = SEARCH_ICON[e.category];
    const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = ''; i.height = 28;
    b.append(el('b', '', 'Find a ' + label.toLowerCase()), i);
    b.title = 'Search the deck for the first ' + label.toLowerCase() + ' card';
  } else {
    b.append(el('b', '', e.name || EFFECT_TEXT[e.kind] || e.kind.replace(/_/g, ' ')));
  }
  if (FORK && (e.kind === 'threshold2' || e.kind === 'upgrade') && forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index && (a.args.upgrade || a.args.hire)).length) {
    b.classList.add('choosable');                                      // (click it: gain a worker or an upgrade, see forkBar)
    b.onclick = () => { S.thresholdMode = { index: e.index, stage: e.kind === 'upgrade' ? 'upgrade' : 'choose' }; refreshBar(); };
  } else if (FORK && e.kind === 'marketing' && forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index && typeof a.args.card === 'string').length) {
    b.classList.add('choosable');                                      // (click it, then choose the sponsor in the hand: see forkBar)
    b.onclick = () => { S.marketMode = e.index; S.forkDockStep = -1; refreshBar(); renderDock(curState()); };
  } else if (FORK && forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index).length && forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index).every(cardPickAct)) {
    b.classList.add('choosable');                                      // (select the card in the hand / display, then confirm: see forkBar)
  } else bindActs(b, forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index));
  return b;
}

// any other decision of the engine: who must do what, and the kinds of action it offers (with how many options each)
function genericBar(bar, st, o, seat) {
  const who = el('span', 'who', S.replay.players[seat].name);
  who.style.color = seatText(seat);
  // The building pieces are not shown in the replay (they take a lot of space and say little): only the prompt, with the largest size that can be built, like BGA.
  if (!FORK && o.pieces && o.pieces.length) {
    const max = Math.max(0, ...o.pieces.map((p) => +((/^size-(\d)$/.exec(p.type) || [])[1] || 0)));
    bar.append(actionBadge(st), who, el('b', '', ' must build a building' + (max ? ' of size at most ' + max : '')));
    return;
  }
  if (o.discard) {                                            // no buttons: in the game the player clicks the cards of the hand, then a Confirm button appears
    let who2 = who, count = o.discard.count;
    if (o.prompt === 'effects' && o.discard.what === 'card') {
      // the hand limit at a break: the engine has the discard pending from the moment the break is triggered, the log only from "Starting a new break" on, and it
      // is the player over the limit (by the log's hand) who has to discard
      let inBreak = false;
      for (let j = S.step; j >= 0; j--) {
        const label = S.replay.steps[j].label || '';
        if (/^End of the break/m.test(label)) break;
        if (/^Starting a new break/m.test(label)) { inBreak = true; break; }
      }
      const over = st.players.map((q, i) => ({ i, n: q.hand.length - q.hand_limit })).filter((q) => q.n > 0);
      if (!inBreak || !over.length) { bar.hidden = true; return; }
      who2 = el('span', 'who', S.replay.players[over[0].i].name);
      who2.style.color = seatText(over[0].i);
      count = over[0].n;
    }
    bar.append(who2, el('b', '', ' must discard ' + count + ' ' + o.discard.what + '(s)'));
    return;
  }
  if (o.association) {
    bar.append(actionBadge(st), who);
    associationBar(bar, o);
    return;
  }
  if (o.sponsors) {
    bar.append(actionBadge(st), who);
    sponsorsBar(bar, o);
    return;
  }
  if (o.take) {
    if (o.prompt === 'cards_take') bar.append(actionBadge(st));
    bar.append(who);
    takeBar(bar, o, seat);
    return;
  }
  const effectsOnly = o.prompt === 'effects' && !o.take && !(o.pieces && o.pieces.length);       // (the effect buttons say it all)
  if (effectsOnly) bar.append(who);
  else bar.append(who, el('b', '', ' ' + (PROMPT_TEXT[o.prompt] || 'must decide (' + o.prompt + ')')));
  let shown = 0;
  const label = S.replay.steps[S.step].label || '';
  const drawn = /draw .* for (perception|hunter|scuba dive) effect/i.test(label);          // the cards of a reveal-and-keep effect have been drawn: the player now chooses
  for (const e of o.effects || []) {                          // every effect the player can resolve has its own button (in any order); automatic gains have none
    if (e.kind === 'reveal' && drawn) {
      const n = e.n || 1;
      bar.append(el('b', '', ' must choose ' + n + ' card' + (n === 1 ? '' : 's') + ' to keep'));
      shown++;
      continue;
    }
    const b = effectButton(e);
    if (b) { bar.append(b); shown++; }
  }
  for (const [kind, n] of Object.entries(o.kinds)) {
    if (kind === 'place_building' && o.pieces && o.pieces.length) continue;       // shown as the pieces themselves
    if (!FORK && kind === 'skip_effect') continue;                                  // (an option of the engine; BGA has no such button)
    if (kind === 'choose_effect' || kind === 'take_cards' || (o.prompt === 'effects' && kind === 'place_building')) continue;      // shown as the effect buttons / cards
    const b = el('span', 'abtn gen');
    b.title = kind + ': ' + n + (n === 1 ? ' option' : ' options');
    b.append(el('b', '', KIND_LABEL[kind] || kind.replace(/_/g, ' ')));
    if (n > 1) b.append(el('i', '', '×' + n));
    bar.append(b);
  }
  if (!Object.keys(o.kinds).length) bar.append(el('span', 'abtn gen off', 'nothing to choose'));
  if (effectsOnly && bar.querySelector('.abtn')) who.after(el('b', '', ' must choose an effect to resolve'));       // (an effect without a prompt of its own, or several waiting)
  if (effectsOnly && !bar.querySelector('.abtn') && !shown) bar.hidden = true;                // only automatic gains are pending: nothing for the player to do
}
