// [module] Fork mode: starts from a replay step, posts moves with their state to the server, placement controls, move flow.
import { stageBreaks } from './break-stages.js';
import { $, el, seatColor, seatName, seatText } from './util.js';
import { PLAY, S, SANDBOX, params } from './state.js';
import { legalPlacement, placementCells, spriteOf, zooBoard } from './board.js';
import { associationStrip, bonusPanel } from './association.js';
import { curState, orientParam, povParam } from './pov.js';
import { cardMarks, cardName, orderedKeys } from './cards.js';
import { ACTION_ICON, ACTION_NAMES, ICON_IDS, iconUrl, pic } from './icons.js';
import { GATED_PICKS, MAP_PICKS, PROMPT_TEXT, bpickInfo, cardPickAct, pickCardOf, refreshBar, turnButtons } from './action-bar.js';
import { placementBonusName } from './bonus-names.js';
import { firstPlayerText, playLive, playTurnButtons, playWaitingBar, studyBar } from './play.js';
import { renderDock } from './dock.js';
import { render, renderZoos } from './main.js';
import { amountIcon, labelNode } from './log-labels.js';
import { sbMeta, sbReady, sbSetupBar } from './sandbox.js';
import { buildMoveList, go } from './playback.js';
import { expandLagoonDeal } from './lagoon-deal.js';


export function initFork() {
  document.title = 'Fork - Ark Nova Park';
  const box = $('forkinfo');
  box.hidden = false;
  box.replaceChildren();
  const back = el('a', '', 'replay of table #' + S.replay.table_id);
  back.href = '/replay.html?table=' + encodeURIComponent(S.replay.table_id) + '#' + (params.get('at') || S.forkInfo.step);
  const seedIn = el('input', 'seedinput');
  seedIn.type = 'number'; seedIn.min = 0; seedIn.value = S.forkInfo.seed; seedIn.setAttribute('aria-label', 'Seed');
  const use = el('button', '', 'Fork again with this seed');
  use.type = 'button';
  use.title = 'Reload the fork from the same position with this seed (the moves made so far are lost)';
  use.onclick = () => {
    const v = String(seedIn.value).trim();
    if (!/^\d+$/.test(v)) { seedIn.focus(); return; }
    if (S.replay.steps.length > 1 && !confirm('Start the fork again? The moves you made are lost.')) return;
    const q = new URLSearchParams(location.search);
    q.set('seed', v);
    location.search = q.toString();
  };
  const copy = el('button', '', 'Copy link');
  copy.type = 'button';
  copy.title = 'The link of this fork position with its seed: opening it gives the same position and deck order';
  copy.onclick = async () => {
    const q = new URLSearchParams({ table: String(S.replay.table_id), step: String(S.forkInfo.step), seed: String(S.forkInfo.seed), pov: povParam(), orient: orientParam() });
    if (params.get('at')) q.set('at', params.get('at'));
    if (params.get('source') === 'upload') q.set('source', 'upload');            // (a log kept in this browser: the link opens here only)
    const link = location.origin + '/fork.html?' + q.toString();
    try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied'; } catch (e) { window.prompt('Link of this fork', link); }
    setTimeout(() => { copy.textContent = 'Copy link'; }, 1500);
  };
  const note = el('span', 'muted', S.forkInfo.seed === S.forkInfo.default_seed
    ? 'Seed ' + S.forkInfo.seed + ' is the order of the replay: the cards that were drawn in the game come up as they did; the rest was shuffled with this seed.'
    : 'Seed ' + S.forkInfo.seed + ': the cards never seen in the game are in the order of this seed (seed ' + S.forkInfo.default_seed + ' is the replay).');
  box.append(el('b', '', 'Fork of the '), back, document.createTextNode(' after step ' + S.forkInfo.step + ' · Draw pile order seed: '), seedIn, use, copy, el('div', 'forknote', ''));
  box.lastChild.append(note, document.createTextNode(' You play both seats; the same seed always gives the same deck order. Going back a step and playing another move replaces what came after.'));
  document.body.classList.add('forkpage');
}

// the buildings that can be placed: a button per piece; once one is chosen the zoo map takes the clicks (see zooBoard)
function renderPlacementControls(box, placeActs) {
  const wrap = el('div', 'placectl');
  const seat = placeActs[0].player;
  const pieces = [];
  for (const a of placeActs) {
    const key = a.args.type + (a.args.extra ? '*' : '') + (a.args.move ? '^' : '');
    let p = pieces.find((q) => q.key === key);
    if (!p) { p = { key, type: a.args.type, extra: !!a.args.extra, move: !!a.args.move, n: 0 }; pieces.push(p); }
    p.n += 1;
  }
  if (!S.placement && pieces.length === 1) {                                         // a single piece (a sponsor's building: Expert Americas' kiosk...): its own button, no menu
    const p = pieces[0];
    const name = p.type.replace(/-/g, ' ');
    const b = el('button', 'forkmove placeone');
    b.type = 'button'; b.disabled = S.forkBusy;
    b.style.setProperty('--pc', seatColor(seat));
    b.title = 'Click a hex of the zoo for its anchor';
    const sp = spriteOf({ type: p.type });
    if (sp) { const img = el('img'); img.src = '/enclosures/' + sp.image; img.alt = ''; const k = Math.min(0.12, 28 / sp.size[1]); img.style.width = (sp.size[0] * k) + 'px'; img.style.height = (sp.size[1] * k) + 'px'; b.append(img); }
    b.append(el('span', '', (p.move ? 'Reposition the ' : 'Place ' + (/^[aeiou]/.test(name) ? 'an ' : 'a ')) + name + (p.extra ? ' (additional)' : '') + (p.move ? ' (crane)' : '')));
    b.onclick = () => {
      S.placement = { seat, type: p.type, extra: p.extra, move: p.move, x: null, y: null, rot: 0 };
      render();
      const board = document.querySelectorAll('.zoo')[seat];
      if (board) board.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    wrap.append(b);
  } else if (!S.placement) {
    // one "Place building" button; its menu lists the pieces (a row of pieces would make the move bar tall)
    const row = el('div', 'forkrow placepick');
    const toggle = el('button', 'forkmove placetoggle', 'Place a building \u25BE');
    toggle.type = 'button'; toggle.disabled = S.forkBusy;
    toggle.title = 'Choose a piece, then click a hex of the zoo for its anchor';
    const menu = el('div', 'placemenu');
    menu.hidden = true;
    toggle.onclick = (ev) => {
      ev.stopPropagation();
      menu.hidden = !menu.hidden;
      if (!menu.hidden) {
        const close = (e) => { if (!menu.contains(e.target)) { menu.hidden = true; document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
      }
    };
    for (const p of pieces) {
      const b = el('button', 'forkmove piece');
      b.type = 'button'; b.disabled = S.forkBusy;
      b.style.setProperty('--pc', seatColor(seat));
      const sp = spriteOf({ type: p.type });
      if (sp) { const img = el('img'); img.src = '/enclosures/' + sp.image; img.alt = ''; const k = Math.min(0.12, 70 / sp.size[1]); img.style.width = (sp.size[0] * k) + 'px'; img.style.height = (sp.size[1] * k) + 'px'; b.append(img); }
      b.append(el('span', '', (p.move ? 'Reposition the ' : '') + p.type.replace(/-/g, ' ') + (p.extra ? ' (additional)' : '') + (p.move ? ' (crane)' : '') + ' - ' + p.n + ' spots'));
      b.onclick = () => {
        S.placement = { seat, type: p.type, extra: p.extra, move: p.move, x: null, y: null, rot: 0 };
        render();
        const board = document.querySelectorAll('.zoo')[seat];
        if (board) board.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      menu.append(b);
    }
    row.append(toggle, menu);
    wrap.append(row);
  } else {
    const legal = legalPlacement(S.placement);
    const head = el('div', 'placehead');
    head.append(el('b', '', (S.placement.move ? 'Reposition the ' : '') + S.placement.type.replace(/-/g, ' ') + (S.placement.extra ? ' (additional)' : '') + (S.placement.move ? ' (crane)' : '')));
    wrap.append(head);
    const row = el('div', 'forkrow');
    const ok = el('button', 'forkmove');
    ok.type = 'button'; ok.textContent = S.placement.move ? 'Move the enclosure' : 'Place the building'; ok.disabled = !legal || S.forkBusy;
    ok.onclick = () => playFork(legal);
    const cancel = el('button', 'forkmove');
    cancel.type = 'button'; cancel.textContent = 'Choose another piece';
    cancel.onclick = () => { S.placement = null; render(); };
    row.append(ok, cancel);
    wrap.append(row);
  }
  box.append(wrap);
}

// the warning before a move that cannot be taken back: Undo and Restart turn stop at it
export function warnIrreversible(reason) {
  return new Promise((resolve) => {
    const back = el('div', 'modalback');
    const box = el('div', 'modalbox');
    box.setAttribute('role', 'alertdialog');
    const done = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const cancel = el('button', 'turnbtn undo', 'Cancel'), go = el('button', 'turnbtn confirm', 'Confirm');
    cancel.type = go.type = 'button';
    cancel.onclick = () => done(false);
    go.onclick = () => done(true);
    const row = el('div', 'modalrow');
    row.append(go, cancel);
    box.append(el('p', '', "You are about to do a move that's impossible to undo. Are you sure?"), row);
    back.append(box);
    back.addEventListener('click', (e) => { if (e.target === back) done(false); });
    document.addEventListener('keydown', onKey);
    document.body.append(back);
    go.focus();
  });
}

// the steps a move made after going back replaces the old future with
export function commitSteps(steps) {
  S.placement = null;
  const all = expandLagoonDeal(S.replay.steps[S.step].state, steps);          // (Map 14: the person sponsors are steps of their own, as in the replay)
  S.replay.steps.length = S.step + 1;
  const first = S.replay.steps.length;
  for (const st of all) { st.index = S.replay.steps.length; S.replay.steps.push(st); }
  stageBreaks(S.replay);
  buildMoveList();
  S.forkBusy = false;
  go(all.length > steps.length ? first : S.replay.steps.length - 1, 0, true);          // (a split deal is entered at its first step: playback.js `personChain` plays the sponsors on)
}

export async function playFork(action) {
  if (PLAY) return playLive(action);
  if (S.forkBusy) return;
  S.forkBusy = true;
  renderForkMoves();
  try {
    const move = { player: action.player, kind: action.kind, args: action.args };
    const res = SANDBOX
      ? await fetch('/api/sandbox/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: S.replay.steps[S.step].engine_state, meta: sbMeta(), action: move }) })
      : await fetch('/api/fork/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: S.replay.steps[S.step].engine_state, action: move, names: S.replay.players.map((p) => p.name) }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'the move could not be played');
    const steps = SANDBOX ? body.steps : [body];
    const first = steps[0];
    if (first.irreversible && ['turn', 'final_turns'].includes(S.replay.steps[S.step].state.phase)) {          // (a fork changes nothing until the step is added: the move was only computed)
      S.forkBusy = false;
      const ok = await warnIrreversible(first.irreversible_reason);
      if (!ok) { refreshBar(); return; }
      S.forkBusy = true;
    }
    commitSteps(steps);
  } catch (err) {
    S.forkBusy = false;
    renderForkMoves(err.message);
  }
}

export const keepSel = new Map();                                              // seat -> the cards the viewer keeps at the initial discard: cleared at every step
// The fork is played from the bar at the top: the controls the bar already has (action cards, break, tasks, effects, deck) play their legal action, the pieces
// of a Build are placed with the controls that follow them, a card clicked in the hand / display shows the moves of that card (a confirm button when there is
// one), and the legal moves that no control stands for are listed at the end of the bar.
export function forkBar() {
  const bar = $('actionbar'), cur = S.replay.steps[S.step], acts = cur.actions || [];
  const DISCARDING = new Set(['sell', 'pouch', 'endgame_discard', 'adapt', 'break_discard', 'digging']);          // effects that send the selected cards away: the selection is drawn as a trash mask, not as a check mark
  const effKinds = new Map((((cur.options && cur.options.effects) || [])).map((e) => [e.index, e.kind]));
  document.body.classList.toggle('discarding', S.snapMode === 'sun_money' || S.snapMode === 'sun_strength' || acts.some((a) => a.kind === 'discard_cards' || (a.kind === 'choose_effect' && DISCARDING.has(effKinds.get(a.args.index)))));
  if (SANDBOX && S.replay.setup) { if (bar) sbSetupBar(bar); return; }          // the seat and the maps first
  if (SANDBOX && !sbReady()) {                                             // the empty spaces first
    if (bar) { bar.hidden = false; bar.replaceChildren(el('b', '', 'Set the base projects and the conservation bonuses (the empty spaces of the board) to start playing.')); }
    return;
  }
  if (SANDBOX && bar) for (const a of acts) if (['confirm_turn', 'undo_last', 'restart_turn'].includes(a.kind)) S.forkClaimed.add(a);          // (the sandbox plays turns like a live game: confirm / undo / restart are moves of the engine)
  if (PLAY && bar) {                                                       // a live game: the confirm / undo / restart are legal actions of their own
    for (const a of acts) if (['confirm_turn', 'undo_last', 'restart_turn'].includes(a.kind)) S.forkClaimed.add(a);
    if (!acts.length || S.play.status === 'waiting') { playWaitingBar(bar); return; }                 // (nothing is offered until both players have joined)
    const study = acts.find((a) => a.kind === 'study_ready' || a.kind === 'study_unready');
    if (study) { S.forkClaimed.add(study); studyBar(bar, study); return; }                  // (Ark360: the viewer studies the map before the draft)
    const picks = acts.filter((a) => a.kind === 'choose_map');
    if (picks.length) {                                                    // the maps are chosen in the bar: click a map to see it, then confirm
      for (const a of picks) S.forkClaimed.add(a);
      bar.hidden = false;
      if (!picks.some((a) => a.args.map === S.play.mapPick)) S.play.mapPick = picks.length === 1 ? picks[0].args.map : null;
      bar.replaceChildren(el('b', '', firstPlayerText() + 'Choose the map of your zoo: click a map to see its layout, then confirm'));
      const list = el('div', 'sbmaps');
      for (const a of picks) {
        const b = el('button', 'forkmove sbmapbtn' + (a.args.map === S.play.mapPick ? ' on' : ''), 'Map ' + a.args.map + ((S.replay.map_names || {})[a.args.map] ? ': ' + S.replay.map_names[a.args.map] : ''));
        b.type = 'button'; b.disabled = S.forkBusy; b.onclick = () => { S.play.mapPick = a.args.map; render(); };          // (the board below shows the map)
        list.append(b);
      }
      bar.append(list);
      const chosenMap = picks.find((a) => a.args.map === S.play.mapPick);
      if (chosenMap) {
        const ok = el('button', 'forkmove forkconfirm', 'Confirm map ' + chosenMap.args.map);
        ok.type = 'button'; ok.disabled = S.forkBusy; ok.onclick = () => playFork(chosenMap);
        bar.append(ok);
      }
      return;
    }
  }
  if (!bar || S.forkGate || (!acts.length && !S.forkError)) return;
  if (acts.some((a) => a.kind === 'draft_pick' || a.kind === 'draft_keep')) return;      // (the draft is played in the bar itself)
  for (const a of acts) {                                                          // the action cards of the bar
    if (a.kind === 'choose_action_card' && !a.args.hypnosis && !a.args.t1) S.forkClaimed.add(a);
    if (a.kind === 'skip_action' && !a.args.repeat) S.forkClaimed.add(a);
  }
  for (const a of acts) {                                                          // the tiles of the association board that are clicked there
    if (a.kind === 'association_task' && ((a.args.task === 'partner' && a.args.continent) || (a.args.task === 'university' && a.args.kind))) S.forkClaimed.add(a);
  }
  if (S.assocMode) for (const a of acts) if (a.kind === 'association_task') S.forkClaimed.add(a);      // (while a partner zoo / university is chosen, the other tasks are not offered)
  bar.querySelectorAll('.abtn.gen').forEach((n) => n.remove());                    // (the kinds of action are listed as buttons of their own below)
  bar.hidden = false;
  const st = cur.state, seat = cur.options ? cur.options.seat : acts.length ? acts[0].player : 0;
  const releaseActs = acts.filter((a) => a.kind === 'choose_release');
  if (releaseActs.length) {                                                          // a Release project: the animal to release, then the enclosure that is emptied when there are several
    for (const a of releaseActs) S.forkClaimed.add(a);
    bar.replaceChildren();
    const whoR = el('span', 'who', seatName(releaseActs[0].player));
    whoR.style.color = seatText(releaseActs[0].player);
    bar.append(whoR, el('b', '', ' must choose an animal to release'));
    const byAnimal = new Map();
    for (const a of releaseActs) { if (!byAnimal.has(a.args.release)) byAnimal.set(a.args.release, []); byAnimal.get(a.args.release).push(a); }
    for (const [key, list] of byAnimal) {
      const b = el('button', 'forkmove', 'Release ' + cardName(key));
      b.type = 'button'; b.disabled = S.forkBusy;
      b.onclick = () => { if (list.length === 1) playFork(list[0]); else { S.forkMenu = { label: 'Release ' + cardName(key) + ': the enclosure to empty', acts: list }; refreshBar(); } };
      bar.append(b);
    }
  }
  const bonusActs = acts.filter((a) => a.kind === 'choose_bonus');
  if (bonusActs.length) {                                                          // the bonus of a supported project: click a bonus slot of the player board, then confirm
    for (const a of bonusActs) S.forkClaimed.add(a);
    bar.replaceChildren();
    const who0 = el('span', 'who', seatName(bonusActs[0].player));
    who0.style.color = seatText(bonusActs[0].player);
    const match = bonusActs.find((a) => a.args.bonus === S.forkBonus);
    const ok = el('button', 'forkmove forkconfirm', 'Confirm');
    ok.type = 'button'; ok.disabled = !match || S.forkBusy;
    ok.onclick = () => { if (match) playFork(match); };
    bar.append(who0, el('b', '', ' must choose a bonus to unlock'), ok);
  }
  if (!bar.children.length && !acts.some((x) => x.kind === 'initial_discard')) {
    const who = el('span', 'who', seatName(seat));
    who.style.color = seatText(seat);
    bar.append(who, el('b', '', ' ' + ((cur.options && PROMPT_TEXT[cur.options.prompt]) || 'must decide')));
  }
  const marked = (zone, keys) => orderedKeys(zone, keys).filter((k, i) => cardMarks.has(zone + '#' + i));        // (the marks count in the order shown, which the viewer may have changed)
  const btn = (a, text, confirm) => {
    const b = el('button', 'forkmove' + (confirm ? ' forkconfirm' : ''));
    b.type = 'button'; b.disabled = S.forkBusy;
    b.style.setProperty('--pc', seatColor(a.player));
    b.textContent = text;
    b.title = JSON.stringify(a.args);
    b.onclick = () => playFork(a);
    return b;
  };
  const TRADES = [['trade_money', ['xtoken', 1], ['money', 5]], ['trade_x', ['money', 5], ['xtoken', 1]], ['rep_x', ['xtoken', 1], ['reputation', 1]], ['rep_money', ['money', 5], ['reputation', 1]]];       // (Sponsors variant 1: what is paid, what is gained)
  const tradeActs = acts.filter((a) => a.kind === 'sponsor_side' && TRADES.some((t) => t[0] === a.args.op));
  const sideOpen = (cur.options && cur.options.sponsors) || {};
  if (sideOpen.variant === 1 && !sideOpen.side_used) {                                  // one button "Trade"; its click shows the trades, the ones the player cannot afford greyed out
    for (const a of tradeActs) S.forkClaimed.add(a);
    const icon = ([k, n]) => amountIcon(k, n) || document.createTextNode(n + ' ' + k);
    if (S.tradeMode) {
      bar.replaceChildren();
      const who4 = el('span', 'who', seatName(seat));
      who4.style.color = seatText(seat);
      bar.append(who4, el('b', '', ' must choose a trade'));
      for (const [op, give, get] of TRADES.slice(0, sideOpen.level >= 2 ? 4 : 2)) {
        const a = tradeActs.find((x) => x.args.op === op);
        const b = el('button', 'forkmove');
        b.type = 'button'; b.disabled = !a || S.forkBusy;
        b.style.setProperty('--pc', seatColor(seat));
        b.append('Trade ', icon(give), ' for ', icon(get));
        if (a) b.onclick = () => playFork(a);
        bar.append(b);
      }
      const back = el('button', 'forkmove', 'Back');
      back.type = 'button';
      back.onclick = () => { S.tradeMode = false; refreshBar(); };
      bar.append(back);
    } else {
      const tb = el('button', 'forkmove', 'Trade');
      tb.type = 'button'; tb.disabled = !tradeActs.length || S.forkBusy;
      tb.style.setProperty('--pc', seatColor(seat));
      tb.title = tradeActs.length ? 'Trade money, X tokens' + (sideOpen.level >= 2 ? ' and reputation' : '') : 'You cannot afford any trade';
      tb.onclick = () => { S.tradeMode = true; refreshBar(); };
      bar.append(tb);
    }
  }
  const snapActs = acts.filter((a) => a.kind === 'sponsor_side' && a.args.op === 'discard_snap');
  if (sideOpen.variant === 4 && sideOpen.level < 2 && !sideOpen.side_used) {              // Sponsors variant 4 (level I): discard a sponsor of the hand to snap one of the display; before or after the sponsors are played
    for (const a of snapActs) S.forkClaimed.add(a);
    const who5 = el('span', 'who', seatName(seat));
    who5.style.color = seatText(seat);
    const back = (label) => { const b = el('button', 'forkmove', label); b.type = 'button'; b.onclick = () => { S.snapMode = null; S.snapCard = null; for (const m of [...cardMarks]) if (/:hand#|^display#/.test(m)) cardMarks.delete(m); render(); }; return b; };
    if (S.snapMode === 'discard') {
      bar.replaceChildren();
      const picked = marked(seat + ':hand', st.players[seat].hand).filter((k) => snapActs.some((a) => a.args.card === k));
      const ok = el('button', 'forkmove forkconfirm', 'Confirm');
      ok.type = 'button'; ok.disabled = !picked.length || S.forkBusy;
      ok.onclick = () => { S.snapCard = picked[0]; S.snapMode = 'snap'; for (const m of [...cardMarks]) if (/:hand#|^display#/.test(m)) cardMarks.delete(m); render(); };
      bar.append(who5, el('b', '', ' must choose a sponsors to discard' + (picked.length ? ': ' + cardName(picked[0]) : '')), ok, back('Back'));
    } else if (S.snapMode === 'snap') {
      bar.replaceChildren();
      const picked = marked('display', st.display).filter(Boolean).filter((k) => snapActs.some((a) => a.args.card === S.snapCard && a.args.take === k));
      const match = picked.length ? snapActs.find((a) => a.args.card === S.snapCard && a.args.take === picked[0]) : null;
      const ok = el('button', 'forkmove forkconfirm', 'Confirm');
      ok.type = 'button'; ok.disabled = !match || S.forkBusy;
      ok.onclick = () => { if (match) playFork(match); };
      bar.append(who5, el('b', '', ' must choose a sponsors to snap' + (picked.length ? ': ' + cardName(picked[0]) : '')), ok, back('Back'));
    } else {
      const sb = el('button', 'forkmove', 'Discard a sponsors to snap a sponsor');
      sb.type = 'button'; sb.disabled = !snapActs.length || S.forkBusy;
      sb.title = snapActs.length ? 'Discard a sponsor of your hand and take a sponsor of the display (once per action, before or after the sponsors you play)' : 'You need a sponsor in the hand and a sponsor in the display';
      sb.onclick = () => { S.snapMode = 'discard'; for (const m of [...cardMarks]) if (/:hand#|^display#/.test(m)) cardMarks.delete(m); render(); };
      bar.append(sb);
    }
  }
  const sunActs = acts.filter((a) => a.kind === 'sponsor_side' && (a.args.op === 'discard_money' || a.args.op === 'discard_strength'));
  if (sideOpen.variant === 3 && !sideOpen.side_used) {                                    // Sponsors variant 3 (Sunbathing): discard a card of the hand for 4 money (level I: a sponsor) or, level II, for 2 action strength; before or after the sponsors are played
    for (const a of sunActs) S.forkClaimed.add(a);
    const who6 = el('span', 'who', seatName(seat));
    who6.style.color = seatText(seat);
    const op = S.snapMode === 'sun_strength' ? 'discard_strength' : 'discard_money';
    const mine = sunActs.filter((a) => a.args.op === op);
    const sunIcon = (kind) => { if (kind === 'strength') return amountIcon('strength', 2) || document.createTextNode('2 strength'); return amountIcon('money', 4) || document.createTextNode('4 money'); };
    const clear = () => { for (const m of [...cardMarks]) if (/:hand#|^display#/.test(m)) cardMarks.delete(m); };
    if (S.snapMode === 'sun_money' || S.snapMode === 'sun_strength') {
      bar.replaceChildren();
      const picked = marked(seat + ':hand', st.players[seat].hand).filter((k) => mine.some((a) => a.args.card === k));
      const match = picked.length ? mine.find((a) => a.args.card === picked[0]) : null;
      const ok = el('button', 'forkmove forkconfirm', 'Confirm');
      ok.type = 'button'; ok.disabled = !match || S.forkBusy;
      ok.onclick = () => { if (match) playFork(match); };
      const back = el('button', 'forkmove', 'Back');
      back.type = 'button'; back.onclick = () => { S.snapMode = null; clear(); render(); };
      bar.append(who6, el('b', '', ' must choose ' + (sideOpen.level >= 2 ? 'a card' : 'a sponsors') + ' to discard' + (picked.length ? ': ' + cardName(picked[0]) : '')), ok, back);
    } else {
      const open = (mode) => { S.snapMode = mode; clear(); render(); };
      const moneyActs = sunActs.filter((a) => a.args.op === 'discard_money'), strActs = sunActs.filter((a) => a.args.op === 'discard_strength');
      const mb = el('button', 'forkmove');
      mb.type = 'button'; mb.disabled = !moneyActs.length || S.forkBusy;
      mb.style.setProperty('--pc', seatColor(seat));
      mb.title = moneyActs.length ? 'Discard ' + (sideOpen.level >= 2 ? 'a card' : 'a sponsor') + ' of your hand for 4 money (once per action, before or after the sponsors you play)' : 'You have no card to discard';
      if (sideOpen.level >= 2) mb.append('Discard a card to gain ', sunIcon('money')); else mb.append('Discard a sponsors to gain ', sunIcon('money'));
      mb.onclick = () => open('sun_money');
      bar.append(mb);
      if (sideOpen.level >= 2) {
        const sb2 = el('button', 'forkmove');
        sb2.type = 'button'; sb2.disabled = !strActs.length || S.forkBusy;
        sb2.style.setProperty('--pc', seatColor(seat));
        sb2.title = strActs.length ? 'Discard a card of your hand to raise the action strength by 2' : 'You have no card to discard';
        sb2.append('Discard a card to gain ', sunIcon('strength'));
        sb2.onclick = () => open('sun_strength');
        bar.append(sb2);
      }
    }
  }
  for (const a of acts) if (a.kind === 'choose_effect' && GATED_PICKS.has(effKinds.get(a.args.index)) && S.pickOpen !== a.args.index) S.forkClaimed.add(a);       // (Digging / Pouch / Store: their moves are chosen after their button has been clicked)
  for (const a of acts) if (a.kind === 'choose_effect' && typeof a.args.card === 'string' && ['assertion', 'search_discard'].includes(effKinds.get(a.args.index))) S.forkClaimed.add(a);       // (Assertion / Horse Whisperer: the cards are chosen in the lightbox)
  const placeActs = acts.filter((a) => a.kind === 'place_building');
  for (const a of placeActs) S.forkClaimed.add(a);
  // BDW2's crane: the "Reposition (crane)" button of the effects starts the move; until then neither the pieces menu nor the skip button is shown, afterwards the skip button sits beside the placement controls
  const moveOnly = placeActs.length > 0 && placeActs.every((a) => a.args.move);
  if (placeActs.length && !(moveOnly && !S.placement)) renderPlacementControls(bar, placeActs);
  const craneIdx = new Set((((cur.options && cur.options.effects) || [])).filter((e) => e.kind === 'build' && /^Crane:/.test(e.name || '')).map((e) => e.index));
  for (const a of acts.filter((x) => x.kind === 'skip_effect' && craneIdx.has(x.args.index))) {
    if (moveOnly && !(S.placement && S.placement.move)) { S.forkClaimed.add(a); continue; }
    S.forkClaimed.add(a); bar.append(btn(a, 'Skip the reposition', false));
  }
  const handActs = acts.filter((a) => a.args && a.args.card && !a.args.from_display && ['play_animal', 'play_sponsor', 'sponsor_side'].includes(a.kind) && a.args.op !== 'discard_snap' && a.args.op !== 'discard_money' && a.args.op !== 'discard_strength');
  const dispActs = acts.filter((a) => a.args && a.args.card && (a.args.from_display || (a.kind === 'take_cards' && a.args.mode !== 'deck')));
  const discardActs = acts.filter((a) => a.kind === 'discard_cards');
  const marketActs = acts.filter((a) => a.kind === 'choose_effect' && typeof a.args.card === 'string' && ((cur.options && cur.options.effects) || []).some((e) => e.index === a.args.index && e.kind === 'marketing'));
  for (const a of marketActs) S.forkClaimed.add(a);
  if (S.marketMode !== null && marketActs.some((a) => a.args.index === S.marketMode)) {   // Marketing: choose the sponsor in the hand (or pass), then confirm
    const mine = marketActs.filter((a) => a.args.index === S.marketMode), p0 = mine[0].player;
    bar.replaceChildren();
    const who0 = el('span', 'who', seatName(p0));
    who0.style.color = seatText(p0);
    const pickedKey = marked(p0 + ':hand', st.players[p0].hand).find((k) => mine.some((a) => a.args.card === k));
    const match = mine.find((a) => a.args.card === pickedKey);
    const ok = match ? btn(match, 'Confirm: market ' + cardName(pickedKey), true) : el('button', 'forkmove forkconfirm', 'Confirm');
    ok.type = 'button'; ok.disabled = !match || S.forkBusy;
    bar.append(who0, el('b', '', ' may spend money to play a sponsor from their hand'), ok);
    for (const a of acts.filter((x) => x.kind === 'skip_effect' && x.args.index === S.marketMode)) { S.forkClaimed.add(a); bar.append(btn(a, 'Pass', false)); }
  }
  const thrActs = acts.filter((a) => a.kind === 'choose_effect' && (a.args.upgrade || a.args.hire) && ((cur.options && cur.options.effects) || []).some((e) => e.index === a.args.index && (e.kind === 'threshold2' || e.kind === 'upgrade')));
  for (const a of thrActs) S.forkClaimed.add(a);
  if (S.thresholdMode && thrActs.some((a) => a.args.index === S.thresholdMode.index)) {      // 2 conservation: gain a worker or an upgrade (then which action card)
    const mine = thrActs.filter((a) => a.args.index === S.thresholdMode.index), p0 = mine[0].player;
    const hire = mine.filter((a) => a.args.hire), ups = mine.filter((a) => a.args.upgrade);
    bar.replaceChildren();
    const who0 = el('span', 'who', seatName(p0));
    who0.style.color = seatText(p0);
    bar.append(who0);
    const withIcon = (text, id, onclick) => {
      const b = el('button', 'forkmove forkchoice');
      b.type = 'button'; b.disabled = S.forkBusy;
      b.style.setProperty('--pc', seatColor(p0));
      const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = ''; i.height = 30;
      b.append(el('span', '', text), i);
      b.onclick = onclick;
      return b;
    };
    if (S.thresholdMode.stage === 'upgrade' && ups.length > 1) {
      bar.append(el('b', '', ' must choose an action card to upgrade'));
      for (const a of ups) {
        const b = el('button', 'forkmove forkchoice');
        b.type = 'button'; b.disabled = S.forkBusy; b.style.setProperty('--pc', seatColor(p0));
        b.title = 'Upgrade ' + ACTION_NAMES[a.args.upgrade];
        const mine = (st.players[p0].action_cards || []).find((c) => c.type === a.args.upgrade) || {};        // (the card as the player has it: its variant badge and side)
        const icon = mine.type ? labelNode(`<ACARD:${mine.type}-${S.replay.marine_worlds ? mine.variant || 0 : 0}-${mine.level === 2 ? 2 : 1}>`) : null;
        if (icon && icon.firstChild) b.append(icon); else b.append(pic(ACTION_ICON[a.args.upgrade], 34));
        b.onclick = () => playFork(a);
        bar.append(b);
      }
      if (hire.length) { const back = el('button', 'forkmove', 'Back'); back.type = 'button'; back.onclick = () => { S.thresholdMode.stage = 'choose'; refreshBar(); }; bar.append(back); }
    } else {
      bar.append(el('b', '', ' must choose to gain a worker or an upgrade'));
      if (hire.length) bar.append(withIcon('Gain a worker', ICON_IDS['bonus:Worker'], () => playFork(hire[0])));
      if (ups.length) bar.append(withIcon('Gain an upgrade', ICON_IDS['bonus:upgrade-card'] || 'r10c5', () => { if (ups.length === 1) playFork(ups[0]); else { S.thresholdMode.stage = 'upgrade'; refreshBar(); } }));
    }
  }
  const mulActs = acts.filter((a) => a.kind === 'choose_effect' && typeof a.args.multiplier === 'string' && ((cur.options && cur.options.effects) || []).some((e) => e.index === a.args.index && e.kind === 'multiplier'));
  for (const a of mulActs) S.forkClaimed.add(a);
  if (mulActs.length) {                                                             // a Multiplier token: the player's action cards are shown in their order, click the one that gets the token
    const effs = (cur.options && cur.options.effects) || [], p0 = mulActs[0].player;
    const others = effs.filter((e) => e.kind !== 'multiplier' && !(e.kind === 'gain' && (e.res === 'money' || e.res === 'xtoken')) && !/^income_/.test(e.kind));
    const idx = S.multiplierMode !== null && mulActs.some((a) => a.args.index === S.multiplierMode) ? S.multiplierMode : !others.length ? mulActs[0].args.index : null;     // (the only effect left: no need to click its button first)
    if (idx !== null) {
      const mine = mulActs.filter((a) => a.args.index === idx);
      bar.replaceChildren();
      const who0 = el('span', 'who', seatName(p0));
      who0.style.color = seatText(p0);
      bar.append(who0, el('b', '', ' must choose an action to put a multiplier token on'));
      (st.players[p0].action_cards || []).forEach((c, i) => {
        const a = mine.find((x) => x.args.multiplier === c.type);
        const b = el('span', 'abtn acbtn' + (c.level === 2 ? ' lvl2' : '') + (a ? ' choosable' : ' off'));
        b.title = a ? 'Put the Multiplier token on ' + ACTION_NAMES[c.type] + (c.level === 2 ? ' II' : '') : ACTION_NAMES[c.type] + ' cannot take it';
        b.append(pic(ACTION_ICON[c.type], 22), el('b', '', i + 1));
        if (S.replay.marine_worlds && c.variant) { const v = el('img', 'variant'); v.src = '/action_icons/' + c.type + '_' + c.variant + '_' + (c.level === 2 ? 2 : 1) + '.webp'; v.alt = 'Variant ' + c.variant; b.append(v); }
        if (a) b.onclick = () => { if (!S.forkBusy) playFork(a); };
        bar.append(b);
      });
      if (others.length) { const back = el('button', 'forkmove', 'Back'); back.type = 'button'; back.onclick = () => { S.multiplierMode = null; refreshBar(); }; bar.append(back); }
    }
  }
  const s1Effs = ((cur.options && cur.options.effects) || []);
  const s1Acts = acts.filter((a) => a.kind === 'choose_effect' && typeof a.args.type === 'string' && s1Effs.some((e) => e.index === a.args.index && e.kind === 'slot1'));
  for (const a of s1Acts) S.forkClaimed.add(a);
  if (s1Acts.length) {                                                              // Clever: the player's action cards are shown in their order, click the one that goes to slot 1
    const p0 = s1Acts[0].player;
    const others = s1Effs.filter((e) => e.kind !== 'slot1' && !(e.kind === 'gain' && (e.res === 'money' || e.res === 'xtoken')) && !/^income_/.test(e.kind));
    const idx = S.slot1Mode !== null && S.slot1Mode !== undefined && s1Acts.some((a) => a.args.index === S.slot1Mode) ? S.slot1Mode : null;          // (opens only when the player clicks the Clever button, which shows the 2 money it costs)
    if (idx !== null) {
      const mine = s1Acts.filter((a) => a.args.index === idx);
      const skip = acts.find((a) => a.kind === 'skip_effect' && a.args.index === idx);
      if (skip) S.forkClaimed.add(skip);
      bar.replaceChildren();
      const who0 = el('span', 'who', seatName(p0));
      who0.style.color = seatText(p0);
      bar.append(who0, el('b', '', ' must choose an action card to put on slot 1'));
      (st.players[p0].action_cards || []).forEach((c, i) => {
        const a = mine.find((x) => x.args.type === c.type);
        const b = el('span', 'abtn acbtn' + (c.level === 2 ? ' lvl2' : '') + (a ? ' choosable' : ' off'));
        b.title = 'Put ' + ACTION_NAMES[c.type] + (c.level === 2 ? ' II' : '') + ' on slot 1' + (i === 0 ? ' (it is there already)' : '');
        b.append(pic(ACTION_ICON[c.type], 22), el('b', '', i + 1));
        if (S.replay.marine_worlds && c.variant) { const v = el('img', 'variant'); v.src = '/action_icons/' + c.type + '_' + c.variant + '_' + (c.level === 2 ? 2 : 1) + '.webp'; v.alt = 'Variant ' + c.variant; b.append(v); }
        if (a) b.onclick = () => { if (!S.forkBusy) playFork(a); };
        bar.append(b);
      });
      if (skip) { const sk = el('button', 'forkmove', 'Skip'); sk.type = 'button'; sk.onclick = () => { if (!S.forkBusy) playFork(skip); }; bar.append(sk); }
      if (others.length) { const back = el('button', 'forkmove', 'Back'); back.type = 'button'; back.onclick = () => { S.slot1Mode = null; refreshBar(); }; bar.append(back); }
    }
  }
  S.forkSolo = false;                                                                // (a prompt that stands alone: none of the other moves is listed beside it)
  for (const a of acts) if (a.kind === 'choose_effect' && MAP_PICKS.has(effKinds.get(a.args.index))) S.forkClaimed.add(a);       // (Cut Down / Enlarge / Reposition / Move in / Archaeologist: chosen on the map after the effect's button)
  const bp = bpickInfo();
  if (bp) bpickBar(bar, bp, cur, acts);
  const endActs = acts.filter((a) => a.kind === 'choose_effect' && typeof a.args.card === 'string' && effKinds.get(a.args.index) === 'endgame_discard');
  for (const a of endActs) S.forkClaimed.add(a);
  if (endActs.length) {                                                             // conservation 10: the endgame card to discard is chosen in the endgame tab of the hand, then confirmed
    const p0 = endActs[0].player;
    if (S.forkDockStep !== S.step) { S.forkDockStep = S.step; S.dockSel = { seat: p0, kind: 'endgame' }; S.dockHidden = false; renderDock(curState()); }
    const picked = marked(p0 + ':endgame', st.players[p0].endgame_hand || []).find((k) => endActs.some((a) => a.args.card === k));
    const match = endActs.find((a) => a.args.card === picked);
    bar.replaceChildren();
    const whoE = el('span', 'who', seatName(p0));
    whoE.style.color = seatText(p0);
    const ok = el('button', 'forkmove forkconfirm', 'Confirm');
    ok.type = 'button'; ok.disabled = !match || S.forkBusy;
    ok.onclick = () => { if (match) playFork(match); };
    bar.append(whoE, el('b', '', ' must choose an endgame card to discard' + (picked ? ': ' + cardName(picked) : '')), ok);
    S.forkSolo = true;
  }
  const glideActs = acts.filter((a) => a.kind === 'choose_effect' && typeof a.args.gain === 'string' && effKinds.get(a.args.index) === 'glide_gain');
  for (const a of glideActs) S.forkClaimed.add(a);
  if (glideActs.length) {                                                           // Glide: the bonuses are chosen one by one (one per sea animal icon), only this prompt is left
    const first = Math.min(...glideActs.map((a) => a.args.index)), p0 = glideActs[0].player;
    bar.replaceChildren();
    const whoG = el('span', 'who', seatName(p0));
    whoG.style.color = seatText(p0);
    bar.append(whoG, el('b', '', ' must choose a bonus (Glide effect)'));
    for (const [gain, label, icon] of [['reputation', '1 reputation', amountIcon('reputation', 1)], ['kiosk', '1 kiosk', (() => { const i = el('img', 'icon'); i.src = iconUrl(ICON_IDS['bonus:kiosk']); i.alt = '1 kiosk'; i.height = 28; return i; })()], ['appeal', '2 appeal', amountIcon('appeal', 2)]]) {
      const a = glideActs.find((x) => x.args.index === first && x.args.gain === gain);
      const b = el('button', 'forkmove forkchoice');
      b.type = 'button'; b.disabled = !a || S.forkBusy;
      b.style.setProperty('--pc', seatColor(p0));
      b.title = label; if (icon) b.append(icon); else b.append(el('span', '', label));          // (the icon alone: its number says how many)
      if (a) b.onclick = () => playFork(a);
      bar.append(b);
    }
  }
  const cardEff = acts.filter((a) => a.kind === 'choose_effect' && Array.isArray(a.args.cards));      // an effect that takes cards of the hand (sunbathing)
  for (const a of [...handActs, ...dispActs, ...discardActs, ...cardEff]) S.forkClaimed.add(a);
  const pickGroups = [];                                                            // an effect that takes one card of the hand or the display: select it, then confirm
  {
    const byIdx = new Map();
    for (const a of acts) if (cardPickAct(a)) { if (!byIdx.has(a.args.index)) byIdx.set(a.args.index, []); byIdx.get(a.args.index).push(a); }
    for (const [idx, list] of byIdx) {
      const hand0 = st.players[list[0].player].hand;
      if (!list.every((a) => st.display.includes(pickCardOf(a)) || hand0.includes(pickCardOf(a)))) continue;
      for (const a of list) S.forkClaimed.add(a);
      pickGroups.push({ idx, p: list[0].player, list });
    }
  }
  const initActs = acts.filter((a) => a.kind === 'initial_discard');
  for (const a of initActs) S.forkClaimed.add(a);
  const actor = (handActs[0] || discardActs[0] || cardEff[0] || initActs[0] || (pickGroups[0] && pickGroups[0].list[0]) || (S.marketMode !== null ? marketActs[0] : null) || {}).player;
  if (actor !== undefined && S.forkDockStep !== S.step) {                              // the hand of the player who has to choose is open
    S.forkDockStep = S.step;
    if (S.dockSel.seat !== actor || S.dockSel.kind !== 'hand' || S.dockHidden) { S.dockSel = { seat: actor, kind: 'hand' }; S.dockHidden = false; renderDock(curState()); }
  }
  const chosen = [];                                                                // [card, its legal moves] of the selected cards
  for (const [s2, p] of st.players.entries()) {
    for (const k of marked(s2 + ':hand', p.hand)) {
      const mine = handActs.filter((a) => a.player === s2 && a.args.card === k);
      if (mine.length) chosen.push([k, mine]);
    }
  }
  for (const k of marked('display', st.display)) {
    const mine = dispActs.filter((a) => a.args.card === k);
    if (k && mine.length) chosen.push([k, mine]);
  }
  if (chosen.length) {                                                              // one selected card: its moves (a single one is a confirm button)
    const [k, mine] = chosen[0];
    const withEnc = mine.filter((a) => a.kind === 'play_animal' && 'x' in a.args);
    if (withEnc.length) {                                                           // an animal: click an enclosure of the zoo that can take it, then confirm
      const seatA = mine[0].player;
      if (!(S.animalEnc && S.animalEnc.card === k)) {                                // the smallest enclosure that takes the animal is selected for the player (one of them at random when several are equally small)
        const size = (a) => { const b = st.players[seatA].buildings.find((q) => q.x === a.args.x && q.y === a.args.y); return b ? placementCells(b.type, b.x, b.y, b.rotation).length : 99; };
        const sizes = withEnc.map(size), least = Math.min(...sizes);
        const pool = withEnc.filter((a, i) => sizes[i] === least);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        S.animalEnc = { card: k, x: pick.args.x, y: pick.args.y };
        setTimeout(() => renderZoos(), 0);                                            // (the zoo is drawn before the bar: draw it again with the selection)
      }
      const enc = S.animalEnc && S.animalEnc.card === k ? S.animalEnc : null;
      const who2 = el('span', 'who', seatName(seatA));
      who2.style.color = seatText(seatA);
      bar.append(who2, el('b', '', ' must select an enclosure for this animal (' + cardName(k) + ')'));
      const match = enc ? withEnc.find((a) => a.args.x === enc.x && a.args.y === enc.y) : null;
      const ok = match ? btn(match, 'Confirm', true) : el('button', 'forkmove forkconfirm', 'Confirm');
      ok.type = 'button'; ok.disabled = !match || S.forkBusy;
      bar.append(ok);
      for (const a of mine.filter((x) => !('x' in x.args))) bar.append(btn(a, 'Confirm: ' + a.text, true));       // (a flock animal needs no enclosure)
    } else {
      bar.append(el('b', '', cardName(k) + ':'));
      for (const a of mine) bar.append(btn(a, mine.length === 1 ? 'Confirm: ' + a.text : a.text, mine.length === 1));
    }
  } else if (handActs.length || dispActs.length) {
    // (no hint: the cards that can be clicked are lit)
  }
  if (discardActs.length) {                                                         // discards: pick the cards in the hand, then confirm
    const p = discardActs[0].player, need = (discardActs[0].args.cards || []).length;
    const picked = marked(p + ':hand', st.players[p].hand).sort();
    const match = discardActs.filter((a) => [...a.args.cards].sort().join() === picked.join());
    bar.append(el('b', '', 'select ' + need + ' card' + (need === 1 ? '' : 's') + ' in the hand (' + picked.length + '/' + need + ')'));
    for (const a of match) bar.append(btn(a, match.length === 1 ? 'Confirm' : a.text, true));
    if (!match.length) { const b = el('button', 'forkmove forkconfirm', 'Confirm'); b.type = 'button'; b.disabled = true; bar.append(b); }
  }
  if (cardEff.length) {                                                             // up to X cards of the hand, then confirm or pass
    const p = cardEff[0].player, idx = cardEff[0].args.index, max = Math.max(...cardEff.map((a) => a.args.cards.length));
    const eff = ((cur.options && cur.options.effects) || []).find((e) => e.index === idx) || {};
    const fromDisplay = eff.kind === 'shark';                                         // (Shark Attack: the animals are chosen on the display, and only this prompt is left)
    const picked = (fromDisplay ? marked('display', st.display).filter(Boolean) : marked(p + ':hand', st.players[p].hand)).sort();
    const match = cardEff.find((a) => a.args.index === idx && [...a.args.cards].sort().join() === picked.join());
    if (eff.kind === 'break_discard') {                                               // the hand limit at a break: only this prompt
      bar.replaceChildren();
      const whoB = el('span', 'who', seatName(p));
      whoB.style.color = seatText(p);
      bar.append(whoB, el('b', '', ' must choose cards to discard during the break (' + picked.length + '/' + max + ')'));
      S.forkSolo = true;
    } else if (fromDisplay) {
      bar.replaceChildren();
      const whoS = el('span', 'who', seatName(p));
      whoS.style.color = seatText(p);
      bar.append(whoS, el('b', '', ' must choose up to ' + max + ' animal' + (max === 1 ? '' : 's') + ' in reach on the display to shark attack (' + picked.length + '/' + max + ')'));
    } else {                                                                          // Sunbathing / Glide: only this prompt is left, the other effects wait
      bar.replaceChildren();
      const whoC = el('span', 'who', seatName(p));
      whoC.style.color = seatText(p);
      bar.append(whoC, el('b', '', ' must choose up to ' + max + ' card' + (max === 1 ? '' : 's') + (eff.kind === 'sell' ? ' to sunbathe' : eff.kind === 'glide' ? ' to glide' : '') + ' (' + picked.length + '/' + max + ')'));
    }
    const ok = match ? btn(match, 'Confirm', true) : el('button', 'forkmove forkconfirm', 'Confirm');
    ok.type = 'button'; ok.disabled = !match || S.forkBusy;
    bar.append(ok);
    for (const a of acts.filter((x) => x.kind === 'skip_effect' && x.args.index === idx)) { S.forkClaimed.add(a); bar.append(btn(a, 'Pass', false)); }
  }
  for (const grp of pickGroups) {
    const eff = ((cur.options && cur.options.effects) || []).find((e) => e.index === grp.idx) || {};
    const picked = [...marked(grp.p + ':hand', st.players[grp.p].hand), ...marked('display', st.display).filter(Boolean)].filter((k) => grp.list.some((a) => pickCardOf(a) === k));
    const mine = picked.length ? grp.list.filter((a) => pickCardOf(a) === picked[0]) : [];
    if (eff.kind === 'digging' || eff.kind === 'mark' || eff.kind === 'pouch' || eff.kind === 'store' || eff.kind === 'pilfer') bar.replaceChildren();         // (the Digging / Pouch / Store / Pilfering button was clicked / a Mark is to be resolved: only its prompt is left)
    const who3 = el('span', 'who', seatName(grp.p));
    who3.style.color = seatText(grp.p);
    const yours = seatName(grp.p) === 'You';
    const promptText = eff.kind === 'mark' ? ' must select an animal of the display to mark, then confirm'
      : eff.kind === 'pouch' ? ' must choose a card from ' + (yours ? 'your' : 'their') + ' hand to pouch'
      : eff.kind === 'store' ? ' must choose a card from ' + (yours ? 'your' : 'their') + ' hand to store'
      : eff.kind === 'pilfer' ? ' must choose a card from ' + (yours ? 'your' : 'their') + ' hand to give (Pilfering)'
      : ' must select a card from ' + (yours ? 'your' : 'the') + ' hand or on the display';
    bar.append(who3, el('b', '', promptText + (picked.length ? ': ' + cardName(picked[0]) : '')));
    const confirmWith = (a, label) => {
      const ok = a ? btn(a, label, true) : el('button', 'forkmove forkconfirm', label);
      ok.type = 'button'; ok.disabled = !a || S.forkBusy;
      return ok;
    };
    bar.append(confirmWith(mine.find((a) => !a.args.rescue), 'Confirm'));
    if (grp.list.some((a) => a.args.rescue)) bar.append(confirmWith(mine.find((a) => a.args.rescue), "Confirm and use map 10's effect"));
    if (eff.kind === 'pouch' || eff.kind === 'store' || eff.kind === 'pilfer') {                                // (Pouch / Store / Pilfering: Cancel goes back to the effects, the card choice closes)
      const cancel = el('button', 'forkmove', 'Cancel');
      cancel.type = 'button';
      cancel.onclick = () => { S.pickOpen = null; S.bpick = eff.kind === 'pilfer' ? { kind: 'pilfer', index: grp.idx, sel: [], opt: 0 } : null; for (const m of [...cardMarks]) if (/:hand#|^display#/.test(m)) cardMarks.delete(m); render(); };
      bar.append(cancel);
    }
    for (const a of acts.filter((x) => x.kind === 'skip_effect' && x.args.index === grp.idx)) { S.forkClaimed.add(a); bar.append(btn(a, eff.kind === 'mark' || eff.kind === 'pouch' || eff.kind === 'store' ? 'Pass' : 'Skip', false)); }
  }
  for (const seat0 of [...new Set(initActs.map((a) => a.player))]) {                 // the initial discard: pick the cards to keep in the hand, then confirm
    const mine = initActs.filter((a) => a.player === seat0);
    const offer = new Set(mine.flatMap((a) => a.args.cards));
    const hand0 = st.players[seat0].hand.filter((k) => offer.has(k));
    const keep = hand0.length - mine[0].args.cards.length;
    const picked = marked(seat0 + ':hand', st.players[seat0].hand).filter((k) => offer.has(k));
    const drop = hand0.filter((k) => !picked.includes(k)).sort().join();
    const match = picked.length === keep ? mine.find((a) => [...a.args.cards].sort().join() === drop) : null;
    const who1 = el('span', 'who', seatName(seat0));
    who1.style.color = seatText(seat0);
    const ok = match ? btn(match, 'Confirm', true) : el('button', 'forkmove forkconfirm', 'Confirm');
    ok.type = 'button'; ok.disabled = !match || S.forkBusy;
    bar.append(who1, el('b', '', ' must choose ' + keep + ' card' + (keep === 1 ? '' : 's') + ' to keep (' + picked.length + '/' + keep + ')'), ok);
  }
  let committed = false;
  if (S.forkMenu) {                                                                   // the choices of a button with several moves
    const row = el('span', 'forkmenu');
    row.append(el('b', '', S.forkMenu.label ? S.forkMenu.label + ': ' : ''));
    const tradeOf = S.forkMenu.acts.filter((a) => a.kind === 'choose_effect' && a.args.trade);
    if (tradeOf.length) {                                                             // a Trade ability: the two trades with their icons, the one that cannot be afforded greyed out
      const icon = ([k, n]) => amountIcon(k, n) || document.createTextNode(n + ' ' + k);
      for (const [which, give, get] of [['money', ['xtoken', 1], ['money', 5]], ['xtoken', ['money', 5], ['xtoken', 1]]]) {
        const a = tradeOf.find((x) => x.args.trade === which);
        const b = el('button', 'forkmove');
        b.type = 'button'; b.disabled = !a || S.forkBusy;
        b.style.setProperty('--pc', seatColor(seat));
        b.append('Trade ', icon(give), ' for ', icon(get));
        if (a) b.onclick = () => playFork(a);
        row.append(b);
      }
    } else for (const a of S.forkMenu.acts) row.append(btn(a, a.text, false));
    bar.append(row);
    if (S.forkMenu.acts.every((a) => a.kind === 'choose_effect')) {                   // the player committed to this effect: its choices and its Skip, nothing else
      bar.querySelectorAll('.abtn').forEach((n) => n.remove());
      for (const a of acts.filter((x) => x.kind === 'skip_effect' && x.args.index === S.forkMenu.acts[0].args.index)) { S.forkClaimed.add(a); bar.append(btn(a, 'Skip', false)); }
      committed = true;
    }
  }
  const usable = new Set(acts.filter((a) => a.kind === 'choose_effect').map((a) => a.args.index));          // (an effect that can be activated has no Skip button: it appears with the effect's own choices, or when the effect cannot be used)
  const buildSkips = acts.filter((a) => a.kind === 'skip_effect' && effKinds.get(a.args.index) === 'build');       // (Posturing and the like: one Skip, only while a piece is being placed, not one per building)
  const shownBuildSkip = S.placement ? buildSkips[0] : null;
  const rest = acts.filter((a) => !S.forkClaimed.has(a) && !(a.kind === 'skip_effect' && usable.has(a.args.index)) && !committed && !S.forkSolo && (!buildSkips.includes(a) || a === shownBuildSkip));                           // the moves that no control of the bar stands for
  if (rest.length) {
    const holder = rest.length > 10 ? el('details', 'forkmore') : el('span', 'forkmore');
    if (rest.length > 10) holder.append(el('summary', '', 'More moves (' + rest.length + ')'));
    for (const a of rest) holder.append(btn(a, (new Set(rest.map((x) => x.player)).size > 1 ? S.replay.players[a.player].name + ': ' : '') + (a.kind === 'skip_effect' && effKinds.get(a.args.index) === 'mark' ? 'Pass: no animal can be marked' : a.text), false));
    bar.append(holder);
  }
  if (PLAY || SANDBOX) playTurnButtons(bar, acts);
  else if (st.phase === 'turn' || st.phase === 'final_turns') turnButtons(bar, st.turn, st.active_player, false);       // undo / restart turn at every step of a turn
  if (!acts.length) bar.append(el('span', 'forkerror', 'The engine offers no move in this position (a rule that is not complete yet). Go back a step and play something else.'));
  if (S.forkError) bar.append(el('span', 'forkerror', S.forkError));
}

// The choice of Cut Down / Enlarge / Reposition / Move in / Archaeologist, opened by the effect's button: only this prompt is left. The enclosures are clicked on the zoo map (board.js
// draws the clickable ones, what is selected and the preview of the result), then Confirm; Cancel closes it again.
function bpickBar(bar, bp, cur, acts) {
  const p0 = bp.seat, st = cur.state, effs = (cur.options && cur.options.effects) || [], eff = effs.find((e) => e.index === bp.index) || {};
  const key = (b) => b.join(',');
  const skip = acts.find((a) => a.kind === 'skip_effect' && a.args.index === bp.index);
  bar.replaceChildren();
  const who = el('span', 'who', seatName(p0));
  who.style.color = seatText(p0);
  const confirm = (act, label) => {
    const ok = el('button', 'forkmove forkconfirm', label || 'Confirm');
    ok.type = 'button'; ok.disabled = !act || S.forkBusy;
    ok.onclick = () => { if (act && !S.forkBusy) playFork(act); };
    return ok;
  };
  const custom = (enabled, label, fn) => { const b = el('button', 'forkmove forkconfirm', label); b.type = 'button'; b.disabled = !enabled || S.forkBusy; b.onclick = () => { if (!S.forkBusy) fn(); }; return b; };
  const cancel = el('button', 'forkmove', 'Cancel');
  cancel.type = 'button'; cancel.onclick = () => { S.bpick = null; render(); };
  const choice = (label, onclick, on) => { const b = el('button', 'forkmove forkchoice' + (on ? ' on' : ''), label); b.type = 'button'; b.disabled = S.forkBusy; b.style.setProperty('--pc', seatColor(p0)); b.onclick = onclick; return b; };
  let prompt = '', extra = [], ok = null;
  if (bp.kind === 'cut_down') {
    const sel = bp.sel[0], cut = (eff.cuts || []).find((c) => key(c.building) === sel), act = sel ? bp.acts.find((a) => a.args.building && key(a.args.building) === sel) : null;
    prompt = ' must choose an empty enclosure to cut down' + (cut ? ': size ' + cut.type.replace('size-', '') + ', you gain ' + cut.money + ' money' : '');
    ok = confirm(act, 'Cut down');
  } else if (bp.kind === 'enlarge') {
    const sel = bp.sel[0], opts = sel ? bp.acts.filter((a) => a.args.building && key(a.args.building) === sel) : [], n = opts.length, i = n ? bp.opt % n : 0;
    prompt = sel ? ' must choose the shape of the enlarged enclosure (' + (i + 1) + '/' + n + ')' : ' must choose an enclosure to enlarge';
    if (n > 1) extra = [choice('‹ Previous shape', () => { S.bpick.opt = (i + n - 1) % n; render(); }), choice('Next shape ›', () => { S.bpick.opt = (i + 1) % n; render(); })];
    ok = confirm(opts[i] || null, 'Enlarge');
  } else if (bp.kind === 'reposition') {
    const act = bp.sel.length ? bp.acts.find((a) => a.args.remove && a.args.remove.map(key).sort().join('|') === bp.sel.slice().sort().join('|')) : null;
    prompt = ' must choose up to 3 buildings to pick up (' + bp.sel.length + '/3)';
    ok = confirm(act, 'Pick up');
  } else if (bp.kind === 'move_in') {                                              // the animal is clicked among the played cards (lit there), confirmed, then the enclosure it leaves is clicked on the map and confirmed
    const sel = bp.sel[0], mine = sel ? bp.acts.filter((a) => a.args.move === sel) : [], enc = bp.stage === 'enc';
    if (!enc) {
      prompt = ' must choose an animal to move in' + (sel ? ': ' + cardName(sel) : '');
      ok = custom(!!mine.length, 'Confirm', () => { S.bpick.stage = 'enc'; S.bpick.enc = mine.length === 1 ? key(mine[0].args.from) : null; render(); });
    } else {
      const at = bp.enc || (mine.length === 1 ? key(mine[0].args.from) : null), act = mine.find((a) => key(a.args.from) === at);
      prompt = ' must choose the enclosure to free up for ' + cardName(sel);
      extra = [choice('Back', () => { S.bpick.stage = 'animal'; S.bpick.enc = null; render(); })];
      ok = confirm(act || null, 'Confirm');
    }
  } else if (bp.kind === 'symbiosis') {                                            // the sea animal is clicked among the played cards, then its ability (a button for each when there are several)
    const sel = bp.sel[0], mine = sel ? bp.acts.filter((a) => a.args.animal === sel) : [], abilities = [...new Set(mine.map((a) => a.args.ability))];
    if (bp.stage !== 'ability') {
      prompt = ' must choose a sea animal to copy the ability of' + (sel ? ': ' + cardName(sel) : '');
      ok = custom(!!mine.length, 'Confirm', () => { if (abilities.length === 1) playFork(mine[0]); else { S.bpick.stage = 'ability'; render(); } });
    } else {
      prompt = ' must choose the ability of ' + cardName(sel) + ' to copy';
      extra = [...abilities.map((n) => choice(n, () => playFork(mine.find((a) => a.args.ability === n)))), choice('Back', () => { S.bpick.stage = 'animal'; render(); })];
    }
  } else if (bp.kind === 'extra_shift') {                                          // the zone of the association board to take a worker back from
    prompt = ' must choose a zone to take a worker back from';
    const icons = { reputation: 'bonus:reputation', 'partner zoo': 'bonus:Partner-Zoo', university: 'bonus:Fac', project: 'bonus:project-support' };
    for (const zone of [...new Set((eff.workers || []).map((w) => w.zone))]) {
      const w = eff.workers.find((x) => x.zone === zone), act = bp.acts.find((a) => a.args.worker === w.worker);
      const b = choice(zone.charAt(0).toUpperCase() + zone.slice(1), () => act && playFork(act));
      if (icons[zone] && ICON_IDS[icons[zone]]) { const i = el('img', 'icon'); i.src = iconUrl(ICON_IDS[icons[zone]]); i.alt = ''; i.height = 26; b.prepend(i); }
      extra.push(b);
    }
  } else if (bp.kind === 'waza') {
    prompt = ' must choose the animals to focus on';
    for (const [w, label, badge] of [['small', 'Small', 'ANIMAL-SIZE-2'], ['large', 'Large', 'ANIMAL-SIZE-4']]) {
      const act = bp.acts.find((a) => a.args.waza === w), b = choice(label, () => act && playFork(act));
      const i = el('img', 'icon'); i.src = '/badges/' + badge + '.webp'; i.alt = ''; i.height = 28; b.prepend(i);
      extra.push(b);
    }
  } else if (bp.kind === 'pilfer') {                                               // what the victim sees: pay 5 money or give a card of the hand
    prompt = ' must give 5 money or a card';
    const pay = bp.acts.find((a) => a.args.pay), give = bp.acts.filter((a) => typeof a.args.give === 'string'), nothing = bp.acts.find((a) => a.args.nothing);
    if (pay) { const b = choice('Give', () => playFork(pay)); b.append(amountIcon('money', 5) || '5 money'); extra.push(b); }
    if (give.length) extra.push(choice('Give a card', () => { S.pickOpen = bp.index; S.bpick = null; S.forkDockStep = -1; render(); }));
    if (nothing) extra.push(choice('Nothing happens', () => playFork(nothing)));
  } else if (bp.kind === 'continent') {                                            // map 9: the continent marker to remove (a badge each), then the bonus it pays
    const conts = [...new Set(bp.acts.filter((a) => a.args.continent).map((a) => a.args.continent))], stage = bp.stage || (conts.length === 1 ? 'bonus' : 'continent'), c = bp.sel[0] || conts[0];
    const ico = (id, alt) => { const i = el('img', 'icon'); i.src = iconUrl(ICON_IDS[id] || id); i.alt = alt; i.title = alt; i.height = 28; return i; };
    if (stage === 'continent') {
      prompt = ' must choose a continent marker to remove';
      for (const name of conts) {
        const b = choice('', () => { S.bpick.sel = [name]; S.bpick.stage = 'bonus'; render(); });
        const i = el('img', 'icon'); i.src = '/badges/' + name + '.webp'; i.alt = name; i.title = name; i.height = 30; i.style.borderRadius = '50%'; b.append(i, name);
        extra.push(b);
      }
    } else {
      prompt = ' must choose a bonus for the ' + c + ' marker';
      const bonuses = [() => amountIcon('reputation', 1), () => amountIcon('appeal', 2), () => amountIcon('money', 4), () => ico('bonus:Clever', 'Clever'), () => ico('r1c9', 'Kiosk / pavilion')]          // (r1c9: the kiosk and the pavilion with a slash between them);
      bonuses.forEach((mk, j) => {
        const act = bp.acts.find((a) => a.args.continent === c && a.args.pick === j);
        const b = choice('', () => act && playFork(act));
        b.append(mk() || String(j));
        b.disabled = !act || S.forkBusy;
        extra.push(b);
      });
      if (conts.length > 1) extra.push(choice('Back', () => { S.bpick.stage = 'continent'; render(); }));
    }
  } else if (bp.kind === 'archaeologist') {
    prompt = ' must choose a bonus (Archaeologist)';
    for (const a of bp.acts.filter((x) => x.args.cell)) {
      const c = (eff.cells || []).find((q) => key(q.cell) === key(a.args.cell));
      const b = el('button', 'forkmove forkchoice');
      b.type = 'button'; b.disabled = S.forkBusy; b.style.setProperty('--pc', seatColor(p0));
      for (const bo of (c && c.bonus) || []) {
        const ai = amountIcon(bo.type, bo.value);
        const id = ICON_IDS['bonus:' + bo.type];
        if (ai) b.append(ai);
        else if (id) { const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = ''; i.height = 28; b.append(i, el('span', '', placementBonusName(bo))); }
        else b.append(el('span', '', placementBonusName(bo)));
      }
      if (!b.childNodes.length) b.textContent = 'Hex ' + key(a.args.cell);
      b.title = 'Take the placement bonus of the hex ' + key(a.args.cell);
      b.onmouseenter = () => { S.bpick.hover = a.args.cell; renderZoos(); };
      b.onmouseleave = () => { S.bpick.hover = null; renderZoos(); };
      b.onclick = () => playFork(a);
      extra.push(b);
    }
  }
  bar.append(who, el('b', '', prompt), ...extra);
  if (ok) bar.append(ok);
  bar.append(cancel);
  if (skip) { const sk = el('button', 'forkmove', bp.kind === 'move_in' ? 'Done' : 'Skip'); sk.type = 'button'; sk.onclick = () => { if (!S.forkBusy) playFork(skip); }; bar.append(sk); }
  S.forkSolo = true;
}

// The legal moves are played from the action bar (see forkBar); this clears the old panel under it and keeps the error of the last move.
export function renderForkMoves(error) {
  const box = $('forkpanel');
  if (!box) return;
  box.replaceChildren();
  S.forkError = error || '';
  if (error) { refreshBar(); return; }
  if (S.forkBusy) refreshBar();
}
