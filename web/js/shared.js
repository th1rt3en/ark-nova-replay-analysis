// [module] Shared area of the table: card folders, the display, the reputation track, upgrade / worker thresholds, the conservation track.
import { $, el, seatColor, section, svg } from './util.js';
import { FORK, S, SANDBOX } from './state.js';
import { curState } from './pov.js';
import { card, cardMarks, ghost, zoneNew } from './cards.js';
import { ICON_IDS, iconUrl, moneyTile } from './icons.js';
import { associationBoard } from './association.js';
import { blockedCube, markCube, markOwner, projectPanel } from './projects.js';
import { actionBar, afterMark, cardPickAct, forkActs, forkSingleSelect, pickCardOf } from './action-bar.js';
import { sbButton, sbEdit, sbMeta, sbPickProjects, sbSlotButtons } from './sandbox.js';

// zoo place printed on the tab of each display folder (BGA: folder 1..6)
const FOLDER_PLACES = ['San Diego, USA', 'Frankfurt, GER', 'Johannesburg, SA', 'São Paulo, BR', 'Okinawa, JP', 'Sydney, AUS'];


// the cards of the display a player can reach at this reputation (engine cards_action.reputation_range)
const repRange = (rep) => (rep <= 1 ? 1 : rep <= 3 ? 2 : rep <= 6 ? 3 : rep <= 9 ? 4 : rep <= 12 ? 5 : 6);

// The conservation track for the first 10 points, above the display (BGA's picture); a cube per player. It goes away when both players are past 10.
// At 5 and 8 the two random bonuses of the game still on offer lie to the left and right of the arrows, like the upgrade / worker at 2.
const CT_X = (n) => (88 + 182.4 * n) / 2000;                       // centre of the space n on the picture (2000 px wide version)
const CT_BONUS_X = { 5: [905, 1095], 8: [1457, 1643] };            // where the two random bonus tiles lie under the arrows
// a bonus tile of the conservation track: the bonus tokens (bonus-...) are whole tiles of the icon sheet; the others (university, partner zoo, money, X tokens...)
// are drawn like the placement bonuses of the zoo map: the yellow pentagon with the icon, and the amount for money and X tokens
export function bonusTile(name, value) {
  if (name.startsWith('bonus-') && S.iconNames[name]) {
    const t = el('img', 'ctbonus');
    t.src = iconUrl(S.iconNames[name]); t.alt = name;
    return t;
  }
  const id = ICON_IDS['bonus:' + name];
  if (!id) return null;
  // drawn in the units of the placement bonuses of the zoo map (pentagon 80, icon 48, numbers in the same typography)
  const t = svg('svg', { class: 'ctbonus ctcomposed', viewBox: '0 0 80 80' });
  const picture = (iconId, cx, cy, h) => {
    const [w0, h0] = S.iconSizes[iconId] || [h, h];
    t.append(svg('image', { href: iconUrl(iconId), x: cx - (w0 * h / h0) / 2, y: cy - h / 2, width: w0 * h / h0, height: h }));
  };
  picture(ICON_IDS.pentagon, 40, 40, 80);
  if (name === 'money') {
    moneyTile(t, 40, 43, 48);
    if (value) t.append(Object.assign(svg('text', { x: 40, y: 56, class: 'bonus-number' }), { textContent: value }));      // on top of the money icon
  } else if (name === 'reputation' || name === 'appeal' || name === 'conservation') {
    picture(id, 40, 43, 48);
    if (value) t.append(Object.assign(svg('text', { x: 40, y: 59, class: 'bonus-number' }), { textContent: value }));      // the amount over the icon, like the other reputation bonuses
  } else if (name === 'take-in-range-or-deck' && value > 1) {
    picture(id, 52, 43, 48);
    t.append(Object.assign(svg('text', { x: 16, y: 55, class: 'bonus-number', style: 'font-size:38px' }), { textContent: value }));   // the amount to the left of the icon
  } else if (name === 'xtoken' && value > 1) {
    picture(id, 50, 43, 48);
    t.append(Object.assign(svg('text', { x: 23, y: 55, class: 'bonus-number', style: 'font-size:38px' }), { textContent: value }));   // the amount to the left of the icon
  } else {
    picture(id, 40, 43, 48);
  }
  return t;
}
function conservationTrack(st) {
  const wrap = el('div', 'ctrackwrap');                                // (always drawn, also when both players are past 10: then without cubes)
  const img = el('img', 'ctrack');
  img.src = '/assets/conservation_track.webp'; img.alt = 'Conservation track';
  wrap.append(img);
  const first = SANDBOX ? sbMeta().initial : S.replay.steps[0].state.conservation_options || {};     // the options of the game as dealt: a taken one leaves its place empty
  for (const th of ['5', '8']) {
    const left = (st.conservation_options || {})[th] || [];
    (first[th] || []).forEach((opt, i) => {
      if (SANDBOX && !S.replay.setup && sbMeta().unset['b' + th][i]) {                            // not set yet: randomize / choose
        const b = sbSlotButtons(th, i);
        b.style.left = (CT_BONUS_X[th][i] / 2000 * 100) + '%';
        wrap.append(b);
        return;
      }
      if (!left.some((o) => JSON.stringify(o) === JSON.stringify(opt))) return;
      const [name] = Object.keys(opt);
      const t = bonusTile(name, opt[name]);
      if (!t) return;
      t.title = 'Bonus at ' + th + ' conservation: ' + name.replace(/^bonus-/, '').replace(/-/g, ' ') + (opt[name] > 1 ? ' (' + opt[name] + ')' : '');
      t.style.left = (CT_BONUS_X[th][i] / 2000 * 100) + '%';
      wrap.append(t);
    });
  }
  st.players.forEach((p, seat) => {
    if (p.conservation > 10) return;                                   // past the end of this track
    const same = st.players.filter((q) => q.conservation === p.conservation);
    const cube = blockedCube(0, seatColor(seat), S.replay.players[seat].name + ': conservation ' + p.conservation);
    cube.setAttribute('class', 'trackcube');
    cube.style.left = ((CT_X(p.conservation) + (same.length > 1 ? (seat - 0.5) * 0.03 : 0)) * 100) + '%';
    cube.style.top = '26%';
    wrap.append(cube);
  });
  return wrap;
}

export function renderShared(st) {
  actionBar(st);
  const root = $('shared');
  root.replaceChildren();
  // the display: each card lies in a folder, numbered 1-6 on the brown tab (the number is the cost in reputation range / position of the slot)
  const row = el('div', 'cards folders');
  const displayNew = zoneNew('display', st.display);
  const displayGone = displayNew.gone;
  st.display.forEach((k, i) => {
    const f = el('div', 'folder');
    const allowed = (S.replay.steps[S.step].options || {}).take;                       // while taking cards, the cards that cannot be taken are greyed out
    const sps = (S.replay.steps[S.step].options || {}).sponsors;
    const pickKeys = FORK ? forkActs(cardPickAct).map(pickCardOf) : [];
    const dim = (allowed && k && !allowed.range.includes(k) && !allowed.snap.includes(k)) || (sps && sps.level >= 2 && k && !sps.display.includes(k)) || (pickKeys.length && k && !pickKeys.includes(k));
    if (k) f.append(card(k, (displayNew.isNew(k) ? 'card-new' : '') + (dim ? ' dim' : '') + (FORK && cardMarks.has('display#' + i) ? ' marked' : '')));
    if (k && FORK) {                                                              // a card of the display can be chosen for a move
      f.classList.add('markable');
      f.addEventListener('click', () => { if (dim && forkSingleSelect()) return; const m = 'display#' + i; if (cardMarks.has(m)) cardMarks.delete(m); else { for (const x of [...cardMarks]) if (x.startsWith('display#') || /:hand#/.test(x)) cardMarks.delete(x); cardMarks.add(m); } renderShared(curState()); afterMark(); });
    }
    for (const g of displayGone) if (g.index === i) f.append(ghost(g.key));       // the card that left this slot fades away on top of it
    f.append(el('span', 'folname', FOLDER_PLACES[i] || ''));
    f.append(el('span', 'folnum', i + 1));
    const owner = k ? markOwner(st, k) : -1;                         // a Mark cube of a player lies on the animal
    if (owner >= 0) f.append(markCube(owner));
    row.append(f);
  });
  const box = el('div', 'displaybox');
  const ctrack = conservationTrack(st);
  if (ctrack) box.append(ctrack);
  box.append(row);
  // the reputation track under the folders: its 6 equal stretches (hat | 2-3 | 4-6 | 7-9 | 10-12 | 13-15) lie under folders 1-6, i.e. the cards a player can reach
  // at 1 | 2-3 | 4-6 | 7-9 | 10-12 | 13-15 reputation (engine cards_action.reputation_range)
  const track = el('img', 'reptrack');
  track.src = '/assets/reputation_track.webp'; track.alt = 'Reputation track'; track.title = 'Reputation track: the cards under each stretch can be taken at that reputation';
  const repWrap = el('div', 'reptrackwrap');
  repWrap.append(track);
  // a cube per player on the stretch of the track they can draw from (the cell with their reputation lies under the last folder in reach)
  const repX = [163, 163, 406, 568, 703, 811, 919, 1027, 1135, 1242, 1351, 1459, 1567, 1675, 1783, 1891];       // centres of the cells 1..15 (+ the first one again) on the 2000 px wide picture
  const repCubes = st.players.map((p, seat) => ({ seat, x: repX[Math.max(0, Math.min(15, p.reputation))] / 2000, rep: p.reputation }));
  repCubes.forEach((c, i) => {
    const same = repCubes.filter((o) => o.x === c.x);
    const cube = blockedCube(0, seatColor(c.seat), S.replay.players[c.seat].name + ': reputation ' + c.rep + ', draws from the first ' + repRange(c.rep) + ' cards of the display');
    cube.setAttribute('class', 'trackcube');
    cube.style.left = ((c.x + (same.length > 1 ? (same.indexOf(c) - 0.5) * 0.026 : 0)) * 100) + '%';
    cube.style.top = '50%';
    repWrap.append(cube);
  });
  // what each stretch of the track pays when it is reached, under its space (5 upgrade, 8 worker, 10 / 13 a card, 11 / 14 conservation, 12 / 15 X token),
  // and the card upgrade requirements icon on the border between 9 and 10
  const REP_REWARDS = { 5: ['upgrade-card', 1, 'upgrade an action card'], 8: ['Worker', 1, 'hire a worker'], 10: ['take-in-range-or-deck', 1, 'take a card from the deck or the reputation range'],
                        11: ['conservation', 1, '1 conservation'], 12: ['xtoken', 1, '1 X token'], 13: ['take-in-range-or-deck', 1, 'take a card from the deck or the reputation range'],
                        14: ['conservation', 1, '1 conservation'], 15: ['xtoken', 1, '1 X token'] };
  for (const [rep, [name, value, text]] of Object.entries(REP_REWARDS)) {
    const t = bonusTile(name, value);
    if (!t) continue;
    t.classList.add('repreward');
    t.style.left = (repX[+rep] / 2000 * 100) + '%';
    t.setAttribute('title', 'Reputation ' + rep + ': ' + text);
    repWrap.append(t);
  }
  // Marine Worlds: the bonus drawn for 16 reputation (a point gained at 15 may be traded for it) sits above the appeal space at the end of the track, until it is taken
  const bonus16 = S.replay.marine_worlds && ((st.conservation_options || {})['99'] || [])[0];
  if (SANDBOX && !S.replay.setup && S.replay.marine_worlds && sbMeta().unset.b99 && sbMeta().unset.b99[0]) {
    const b = sbSlotButtons('99', 0);
    b.classList.add('rep16');
    b.style.left = '98.6%';
    repWrap.append(b);
  } else if (bonus16) {
    const [name] = Object.keys(bonus16);
    const t = bonusTile(name, bonus16[name]);
    if (t) {
      t.classList.add('rep16');
      t.style.left = '98.6%';
      t.setAttribute('title', 'Reputation 16: ' + name.replace(/^bonus-/, '').replace(/-/g, ' ') + (bonus16[name] > 1 ? ' (' + bonus16[name] + ')' : '') + ' - a reputation point gained at 15 may be traded for it');
      repWrap.append(t);
    }
  }
  const req = el('div', 'repupgrade');                                 // the icon in a red circle with a white border, a dark red box with a white "II" below it
  req.title = 'Action card upgrade requirements';
  const disc = el('span', 'repupdisc'), icon = el('img');
  icon.src = iconUrl('r3c10'); icon.alt = 'Action card upgrade requirements';
  disc.append(icon, el('span', 'repupbox', 'II'));
  req.append(disc);
  req.style.left = ((repX[9] + repX[10]) / 2 / 2000 * 100) + '%';
  repWrap.append(req);
  box.append(repWrap);
  const dispcol = el('div', 'sect displaycol');                      // (no heading: the display is easy to recognise)
  dispcol.append(box);
  root.append(dispcol);
  const col = el('div', 'tablecol');
  // projects played during the game: the newest enters on the left and pushes the others right; a third one pushes the oldest off to the discard
  col.append(projectPanel(st, st.projects_in_play, 2, 'conservation-project', 'Conservation projects in play'));
  col.append(associationBoard(st));
  if (SANDBOX && !S.replay.setup) {                                            // the sandbox starts with empty base project slots: two buttons in the centre set them
    const unset = sbMeta().unset.projects;
    const panel = projectPanel(st, st.base_projects.map((k, n) => (unset[n] ? null : k)), 3, 'conservation-project-base', 'Base conservation projects', true);
    const taken = st.base_projects.filter((k, n) => !unset[n]);
    [...panel.querySelectorAll('.projslot')].forEach((slotEl, n) => {            // each empty slot has its own two buttons
      if (!unset[n]) return;
      const over = el('div', 'sbcenter');
      over.append(sbButton('Randomize', 'Draw this base project at random', () => sbEdit('set_projects', { slots: [n], keys: [null] })),
                  sbButton('Choose…', 'Choose this base project', async () => { const keys = await sbPickProjects(1, taken); if (keys) sbEdit('set_projects', { slots: [n], keys }); }));
      slotEl.classList.add('sbhost');
      slotEl.append(over);
    });
    col.append(panel);
  } else col.append(projectPanel(st, S.replay.base_projects, 3, 'conservation-project-base', 'Base conservation projects', true));
  root.append(col);
}
