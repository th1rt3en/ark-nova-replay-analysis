// [module] Conservation project panel: project cards, worker / owner markers, blocked cubes.
import { el, mix, seatColor, svg } from './util.js';
import { S } from './state.js';
import { card, hidePreview, info, showPreview, zoneNew } from './cards.js';
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
const SLOT_X = [0.18, 0.51, 0.83];
export function blockedCube(i, colour, title) {            // colour / title: a cube of a player who supports the project at slot i
  const c = colour || unusedColor();
  const e = mix(c, '#000000', .6);
  const g = svg('svg', { class: 'blockcube', viewBox: '-24 -24 48 48' });
  g.style.left = (SLOT_X[i] * 100) + '%';
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
    const slot = el('div', 'projslot');
    if (keys[i]) {
      const wrap = el('div', 'withtokens');
      const bar = el('div', 'projbar');                  // dark green bar with the project's icon(s): the top left corner of the card art
      const pc = info(keys[i]);
      if (pc.image) {
        bar.style.backgroundImage = 'url(' + pc.image + ')';
        bar.addEventListener('mouseenter', () => showPreview(pc.large || pc.image));
        bar.addEventListener('mouseleave', hidePreview);
      }
      const holder = el('div', 'cardwrap projcrop');       // only the bottom of the card (cubes and slots) shows; hovering still previews the whole card
      holder.append(card(keys[i]));
      if (blocked) holder.append(blockedCube(i));
      for (const t of projectTokens(st, keys[i])) {         // a supporter's cube blocks its slot
        holder.append(blockedCube(0, seatColor(t.seat), S.replay.players[t.seat].name + ': slot ' + (t.slot + 1)));
        holder.lastChild.style.left = (SLOT_X[t.slot] * 100) + '%';
      }
      const line = el('div', 'projline' + (isNew(keys[i]) ? ' card-new' : ''));
      line.append(bar, holder);
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
