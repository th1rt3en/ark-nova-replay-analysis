// [module] Conservation project panel: project cards, worker / owner markers, blocked cubes.
import { el, mix, seatColor, svg } from './util.js';
import { S } from './state.js';
import { hidePreview, info, largeOf, showPreview, zoneNew } from './cards.js';
import { iconUrl } from './icons.js';
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
export function blockedCube(i, colour, title, spot) {            // colour / title: a cube of a player who supports the project at slot i; spot: [x, y, width] on a project strip
  const c = colour || unusedColor();
  const e = mix(c, '#000000', .6);
  const g = svg('svg', { class: 'blockcube', viewBox: '-24 -24 48 48' });
  g.style.left = ((spot ? spot[0] : SLOT_X[i]) * 100) + '%';
  if (spot) { g.style.top = (spot[1] * 100) + '%'; g.style.width = (spot[2] * 100) + '%'; }
  for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(c, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', c], ['19,-9 0,2 0,21 19,10', mix(c, '#000000', .3)]]) {
    g.append(svg('polygon', { points: pts, fill, stroke: e, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
  }
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
        line.addEventListener('mouseenter', () => showPreview(largeOf(pc)));         // (the whole card)
        line.addEventListener('mouseleave', hidePreview);
      }
      const spots = STRIP_CUBES[keys[i]] || [];
      if (blocked) line.append(blockedCube(i, undefined, undefined, spots[i]));
      for (const t of projectTokens(st, keys[i])) {         // a supporter's cube blocks its slot
        line.append(blockedCube(t.slot, seatColor(t.seat), S.replay.players[t.seat].name + ': slot ' + (t.slot + 1), spots[t.slot]));
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
  const c = seatColor(seat), e = mix(c, '#000000', .6);
  const g = svg('svg', { class: 'markcube', viewBox: '-24 -24 48 48' });
  for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(c, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', c], ['19,-9 0,2 0,21 19,10', mix(c, '#000000', .3)]]) {
    g.append(svg('polygon', { points: pts, fill, stroke: e, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
  }
  const tip = svg('title');
  tip.textContent = 'Marked by ' + S.replay.players[seat].name;
  g.append(tip);
  return g;
}
