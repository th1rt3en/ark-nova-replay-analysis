// [module] Conservation project panel: project cards, worker / owner markers, blocked cubes.
import { el, seatRawColor, svg } from './util.js';
import { S } from './state.js';
import { bindPreview, info, largeOf, zoneNew } from './cards.js';
import { iconUrl, pieceImage } from './icons.js';
import { unusedColor } from './association.js';


// support tokens of both players on a conservation project card: [{seat, slot}]
function projectTokens(st, key) {
  const out = [];
  const re = new RegExp('^' + key + '_.*_(\\d+)$');
  st.players.forEach((p, seat) => p.tokens.forEach((t) => {
    const m = re.exec(t.location);
    if (m) out.push({ seat, slot: +m[1] });
  }));
  return out;
}
// a beige panel with a shield icon and `count` slots, like BGA's project holders; the cards in `keys` go left to right
// a cube (colour nobody plays) over one of the three slots of a base project card; in a 2 player game card k has its slot k covered: left, middle, right
const SLOT_X = [0.375, 0.625, 0.875];       // (a cube on a card of the track areas / when a strip has no entry in cubes.json: the middle of the three slots of a strip)
const STRIP_CUBES = await fetch('/project_strips/cubes.json').then((r) => r.json()).catch(() => ({}));       // {key: [[x, y, width], ...]}: where the cube of each slot of a project strip goes (fractions of the strip; made by scripts/build_cards.py, the slots are centred and enlarged)
const stripOf = (c) => (c.image && c.image.startsWith('/cards/') ? c.image.replace('/cards/', '/project_strips/') : '');
export function blockedCube(i, colour, title, spot, kind = 'cubes') {            // colour / title: a cube of a player who supports the project at slot i; spot: [x, y, width] on a project strip; kind 'cylinders' for the tracks
  const c = colour || unusedColor();
  const g = svg('svg', { class: 'blockcube', viewBox: '-24 -24 48 48' });
  g.style.left = ((spot ? spot[0] : SLOT_X[i]) * 100) + '%';
  if (spot) { g.style.top = (spot[1] * 100) + '%'; g.style.width = (spot[2] * 100) + '%'; }
  g.append(pieceImage(kind, c, 48));
  const tip = svg('title');
  tip.textContent = title || 'Blocked in a 2 player game';
  g.append(tip);
  return g;
}

export function projectPanel(st, keys, count, iconName, title, blocked) {
  const panel = el('div', 'projpanel' + (count < 3 ? ' pair' : ''));
  panel.title = title;
  const icon = el('img', 'icon projicon');
  icon.src = iconUrl(S.iconNames[iconName] || ''); icon.alt = title; icon.height = 44;
  panel.append(icon);
  const zn = zoneNew('projects:' + iconName, keys), isNew = zn.isNew;
  for (let i = 0; i < count; i++) {
    const slot = el('div', 'projslot' + (keys[i] ? '' : ' projempty'));
    if (keys[i]) {
      const wrap = el('div', 'withtokens');
      const pc = info(keys[i]);
      const line = el('div', 'projline projstrip' + (isNew(keys[i]) ? ' card-new' : ''));       // like BGA: the dark green part with the icon(s) of the project left, the light green part with its three slots right; the green base is CSS, the icons and slots are the picture
      if (stripOf(pc)) {
        const art = el('img', 'projstripart'); art.src = stripOf(pc); art.alt = pc.name;
        line.append(art);
        bindPreview(line, () => largeOf(pc));         // (the whole card)
      }
      const spots = STRIP_CUBES[keys[i]] || [];
      if (blocked) line.append(blockedCube(i, undefined, undefined, spots[i]));
      for (const t of projectTokens(st, keys[i])) {         // a supporter's cube blocks its slot
        line.append(blockedCube(t.slot, seatRawColor(t.seat), S.replay.players[t.seat].name + ': slot ' + (t.slot + 1), spots[t.slot]));
      }
      wrap.append(line);
      slot.append(wrap);
    }
    panel.append(slot);
  }
  return panel;
}

// the player whose Mark cube is on this display card (a token located on `A###_Name`), or -1
export function markOwner(st, key) {
  return st.players.findIndex((p) => p.tokens.some((t) => t.type === 'token' && t.location.slice(0, 5) === key + '_'));
}
export function markCube(seat) {
  const g = svg('svg', { class: 'markcube', viewBox: '-24 -24 48 48' });
  g.append(pieceImage('cubes', seatRawColor(seat), 48));
  const tip = svg('title');
  tip.textContent = 'Marked by ' + S.replay.players[seat].name;
  g.append(tip);
  return g;
}
