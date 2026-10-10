// [module] Fork mode: starts from a replay step, posts moves with their state to the server, placement controls, move flow.
import { $, el, seatColor } from './util.js';
import { PLAY, S, SANDBOX } from './state.js';
import { legalPlacement, spriteOf, zooBoard } from './board.js';
import { associationStrip, bonusPanel } from './association.js';
import { curState, orientParam, povParam } from './pov.js';
import { cardMarks, cardName, orderedKeys } from './cards.js';
import { ACTION_ICON, ACTION_NAMES, ICON_IDS, iconUrl, pic } from './icons.js';
import { PROMPT_TEXT, cardPickAct, pickCardOf, refreshBar, turnButtons } from './action-bar.js';
import { firstPlayerText, playLive, playTurnButtons, playWaitingBar } from './play.js';
import { renderDock } from './dock.js';
import { render } from './main.js';
import { sbMeta, sbReady, sbSetupBar } from './sandbox.js';
import { buildMoveList, go } from './playback.js';


export function initFork() {
  document.title = 'Fork - Ark Nova Replay';
  const box = $('forkinfo');
  box.hidden = false;
  box.replaceChildren();
  const back = el('a', '', 'replay of table #' + S.replay.table_id);
  back.href = '/replay.html?table=' + encodeURIComponent(S.replay.table_id) + '#' + S.forkInfo.step;
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
    const key = a.args.type + (a.args.extra ? '*' : '');
    let p = pieces.find((q) => q.key === key);
    if (!p) { p = { key, type: a.args.type, extra: !!a.args.extra, n: 0 }; pieces.push(p); }
    p.n += 1;
  }
  if (!S.placement) {
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
      b.append(el('span', '', p.type.replace(/-/g, ' ') + (p.extra ? ' (additional)' : '') + ' - ' + p.n + ' spots'));
      b.onclick = () => {
        S.placement = { seat, type: p.type, extra: p.extra, x: null, y: null, rot: 0 };
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
    head.append(el('b', '', S.placement.type.replace(/-/g, ' ') + (S.placement.extra ? ' (additional)' : '')),
                document.createTextNode(S.placement.x === null ? ' - click a hex of ' + S.replay.players[S.placement.seat].name + "'s zoo to put the anchor there"
                  : ' - anchor (' + S.placement.x + ', ' + S.placement.y + '), rotation ' + S.placement.rot + ' - '),
                S.placement.x === null ? document.createTextNode('') : el('b', legal ? 'placeok' : 'placebad', legal ? 'legal' : 'not legal'));
    wrap.append(head);
    const row = el('div', 'forkrow');
    const ok = el('button', 'forkmove');
    ok.type = 'button'; ok.textContent = 'Place the building'; ok.disabled = !legal || S.forkBusy;
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
  S.replay.steps.length = S.step + 1;
  for (const st of steps) { st.index = S.replay.steps.length; S.replay.steps.push(st); }
  buildMoveList();
  S.forkBusy = false;
  go(S.replay.steps.length - 1);
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
  if (SANDBOX && S.replay.setup) { if (bar) sbSetupBar(bar); return; }          // the seat and the maps first
  if (SANDBOX && !sbReady()) {                                             // the empty spaces first
    if (bar) { bar.hidden = false; bar.replaceChildren(el('b', '', 'Set the base projects and the conservation bonuses (the empty spaces of the board) to start playing.')); }
    return;
  }
  if (PLAY && bar) {                                                       // a live game: the confirm / undo / restart are legal actions of their own
    for (const a of acts) if (['confirm_turn', 'undo_last', 'restart_turn'].includes(a.kind)) S.forkClaimed.add(a);
    if (!acts.length || S.play.status === 'waiting') { playWaitingBar(bar); return; }                 // (nothing is offered until both players have joined)
    const picks = acts.filter((a) => a.kind === 'choose_map');
    if (picks.length) {                                                    // the maps are chosen in the bar: click a map to see it, then confirm
      for (const a of picks) S.forkClaimed.add(a);
      bar.hidden = false;
      if (!picks.some((a) => a.args.map === S.play.mapPick)) S.play.mapPick = picks.length === 1 ? picks[0].args.map : null;
      bar.replaceChildren(el('b', '', firstPlayerText() + 'Choose the map of your zoo: click a map to see its layout, then confirm'));
      const list = el('div', 'sbmaps');
      for (const a of picks) {
        const b = el('button', 'forkmove sbmapbtn' + (a.args.map === S.play.mapPick ? ' on' : ''), 'Map ' + a.args.map + ((S.replay.map_names || {})[a.args.map] ? ': ' + S.replay.map_names[a.args.map] : ''));
        b.type = 'button'; b.disabled = S.forkBusy; b.onclick = () => { S.play.mapPick = a.args.map; forkBar(); };
        list.append(b);
      }
      bar.append(list);
      const chosenMap = picks.find((a) => a.args.map === S.play.mapPick);
      if (chosenMap) {
        const ok = el('button', 'forkmove forkconfirm', 'Confirm map ' + chosenMap.args.map);
        ok.type = 'button'; ok.disabled = S.forkBusy; ok.onclick = () => playFork(chosenMap);
        const box = el('div', 'zoo mappreview');
        const mv = (S.replay.map_views || {})[chosenMap.args.map];
        if (mv) {                                                          // the map as it looks in play: picture, placement bonuses and the bonus slots of the player board
          const stub = { buildings: [], flags: {}, tokens: [], animals: [], sponsors: [] };
          try {                                                           // (the same row as in the zoo: bonus slots, board, partner zoos and universities, at the same proportions)
            const row = el('div', 'zooRow');
            row.append(bonusPanel(mv, stub, chosenMap.player), zooBoard(mv, stub, chosenMap.player), associationStrip(stub, mv, chosenMap.player));
            box.append(row);
          } catch (err) { box.replaceChildren(); }
        }
        if (!box.childNodes.length) { const img = el('img'); img.src = (S.replay.map_images || {})[chosenMap.args.map] || '/maps/map-' + chosenMap.args.map + '.jpg'; img.alt = 'Layout of map ' + chosenMap.args.map; box.append(img); }
        bar.append(ok, box);
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
  const bonusActs = acts.filter((a) => a.kind === 'choose_bonus');
  if (bonusActs.length) {                                                          // the bonus of a supported project: click a bonus slot of the player board, then confirm
    for (const a of bonusActs) S.forkClaimed.add(a);
    bar.replaceChildren();
    const who0 = el('span', 'who', S.replay.players[bonusActs[0].player].name);
    who0.style.color = seatColor(bonusActs[0].player);
    const match = bonusActs.find((a) => a.args.bonus === S.forkBonus);
    const ok = el('button', 'forkmove forkconfirm', 'Confirm');
    ok.type = 'button'; ok.disabled = !match || S.forkBusy;
    ok.onclick = () => { if (match) playFork(match); };
    bar.append(who0, el('b', '', ' must choose a bonus to unlock'), ok);
  }
  if (!bar.children.length && !acts.some((x) => x.kind === 'initial_discard')) {
    const who = el('span', 'who', S.replay.players[seat].name);
    who.style.color = seatColor(seat);
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
  const placeActs = acts.filter((a) => a.kind === 'place_building');
  for (const a of placeActs) S.forkClaimed.add(a);
  if (placeActs.length) renderPlacementControls(bar, placeActs);
  const handActs = acts.filter((a) => a.args && a.args.card && !a.args.from_display && ['play_animal', 'play_sponsor', 'sponsor_side'].includes(a.kind));
  const dispActs = acts.filter((a) => a.args && a.args.card && (a.args.from_display || (a.kind === 'take_cards' && a.args.mode !== 'deck')));
  const discardActs = acts.filter((a) => a.kind === 'discard_cards');
  const marketActs = acts.filter((a) => a.kind === 'choose_effect' && typeof a.args.card === 'string' && ((cur.options && cur.options.effects) || []).some((e) => e.index === a.args.index && e.kind === 'marketing'));
  for (const a of marketActs) S.forkClaimed.add(a);
  if (S.marketMode !== null && marketActs.some((a) => a.args.index === S.marketMode)) {   // Marketing: choose the sponsor in the hand (or pass), then confirm
    const mine = marketActs.filter((a) => a.args.index === S.marketMode), p0 = mine[0].player;
    bar.replaceChildren();
    const who0 = el('span', 'who', S.replay.players[p0].name);
    who0.style.color = seatColor(p0);
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
    const who0 = el('span', 'who', S.replay.players[p0].name);
    who0.style.color = seatColor(p0);
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
        b.append(pic(ACTION_ICON[a.args.upgrade], 34));
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
      const seatA = mine[0].player, enc = S.animalEnc && S.animalEnc.card === k ? S.animalEnc : null;
      const who2 = el('span', 'who', S.replay.players[seatA].name);
      who2.style.color = seatColor(seatA);
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
    bar.append(el('span', 'muted', 'click a card of the hand' + (dispActs.length ? ' or of the display' : '') + ' to see its moves'));
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
    const picked = marked(p + ':hand', st.players[p].hand).sort();
    const match = cardEff.find((a) => a.args.index === idx && [...a.args.cards].sort().join() === picked.join());
    bar.append(el('b', '', 'Choose up to ' + max + ' card' + (max === 1 ? '' : 's') + (eff.kind === 'sell' ? ' to sunbathe' : '') + ' (' + picked.length + '/' + max + ')'));
    const ok = match ? btn(match, 'Confirm', true) : el('button', 'forkmove forkconfirm', 'Confirm');
    ok.type = 'button'; ok.disabled = !match || S.forkBusy;
    bar.append(ok);
    for (const a of acts.filter((x) => x.kind === 'skip_effect' && x.args.index === idx)) { S.forkClaimed.add(a); bar.append(btn(a, 'Pass', false)); }
  }
  for (const grp of pickGroups) {
    const eff = ((cur.options && cur.options.effects) || []).find((e) => e.index === grp.idx) || {};
    const picked = [...marked(grp.p + ':hand', st.players[grp.p].hand), ...marked('display', st.display).filter(Boolean)].filter((k) => grp.list.some((a) => pickCardOf(a) === k));
    const mine = picked.length ? grp.list.filter((a) => pickCardOf(a) === picked[0]) : [];
    const who3 = el('span', 'who', S.replay.players[grp.p].name);
    who3.style.color = seatColor(grp.p);
    bar.append(who3, el('b', '', ' must select a card of the hand or the display' + (eff.kind === 'digging' ? ' to dig' : '') + (picked.length ? ': ' + cardName(picked[0]) : '')));
    const confirmWith = (a, label) => {
      const ok = a ? btn(a, label, true) : el('button', 'forkmove forkconfirm', label);
      ok.type = 'button'; ok.disabled = !a || S.forkBusy;
      return ok;
    };
    bar.append(confirmWith(mine.find((a) => !a.args.rescue), 'Confirm'));
    if (grp.list.some((a) => a.args.rescue)) bar.append(confirmWith(mine.find((a) => a.args.rescue), "Confirm and use map 10's effect"));
    for (const a of acts.filter((x) => x.kind === 'skip_effect' && x.args.index === grp.idx)) { S.forkClaimed.add(a); bar.append(btn(a, 'Skip', false)); }
  }
  for (const seat0 of [...new Set(initActs.map((a) => a.player))]) {                 // the initial discard: pick the cards to keep in the hand, then confirm
    const mine = initActs.filter((a) => a.player === seat0);
    const offer = new Set(mine.flatMap((a) => a.args.cards));
    const hand0 = st.players[seat0].hand.filter((k) => offer.has(k));
    const keep = hand0.length - mine[0].args.cards.length;
    const picked = marked(seat0 + ':hand', st.players[seat0].hand).filter((k) => offer.has(k));
    const drop = hand0.filter((k) => !picked.includes(k)).sort().join();
    const match = picked.length === keep ? mine.find((a) => [...a.args.cards].sort().join() === drop) : null;
    const who1 = el('span', 'who', S.replay.players[seat0].name);
    who1.style.color = seatColor(seat0);
    const ok = match ? btn(match, 'Confirm', true) : el('button', 'forkmove forkconfirm', 'Confirm');
    ok.type = 'button'; ok.disabled = !match || S.forkBusy;
    bar.append(who1, el('b', '', ' must choose ' + keep + ' card' + (keep === 1 ? '' : 's') + ' to keep (' + picked.length + '/' + keep + ')'), ok);
  }
  if (S.forkMenu) {                                                                   // the choices of a button with several moves
    const row = el('span', 'forkmenu');
    row.append(el('b', '', S.forkMenu.label ? S.forkMenu.label + ': ' : ''));
    for (const a of S.forkMenu.acts) row.append(btn(a, a.text, false));
    bar.append(row);
  }
  const rest = acts.filter((a) => !S.forkClaimed.has(a));                             // the moves that no control of the bar stands for
  if (rest.length) {
    const holder = rest.length > 10 ? el('details', 'forkmore') : el('span', 'forkmore');
    if (rest.length > 10) holder.append(el('summary', '', 'More moves (' + rest.length + ')'));
    for (const a of rest) holder.append(btn(a, (new Set(rest.map((x) => x.player)).size > 1 ? S.replay.players[a.player].name + ': ' : '') + a.text, false));
    bar.append(holder);
  }
  if (PLAY) playTurnButtons(bar, acts);
  else if (st.phase === 'turn' || st.phase === 'final_turns') turnButtons(bar, st.turn, st.active_player, false);       // undo / restart turn at every step of a turn
  if (!acts.length) bar.append(el('span', 'forkerror', 'The engine offers no move in this position (a rule that is not complete yet). Go back a step and play something else.'));
  if (S.forkError) bar.append(el('span', 'forkerror', S.forkError));
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
