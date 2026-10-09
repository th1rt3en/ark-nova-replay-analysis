// [module] Icon sprite lookup (icons.json / names.json), icon <img> builders, action icon and worker icon tables.
import { el, seatColor, svg } from './util.js';
import { S } from './state.js';


// ---- icons (web/icons, cut from BGA's icon sheet by scripts/build_icons.py; ids are row/column on the sheet) ----------------------------
export const ICON_IDS = {
  Africa: 'r1c2', Americas: 'r1c3', Asia: 'r1c4', Australia: 'r1c5', Europe: 'r1c6',
  Bird: 'r2c4', Herbivore: 'r2c5', Predator: 'r2c6', Primate: 'r2c7', Reptile: 'r2c8', SeaAnimal: 'r2c9', Rock: 'r11c11', Water: 'r11c12',
  Pet: 'r4c2', xtoken: 'r3c2',
  // university tiles, by the BGA token type
  'fac-rep-hand': 'r7c15', 'fac-science-rep': 'r8c6', 'fac-science-science': 'r8c8', 'fac-generic': 'r7c14',
  'fac-science-bird': 'r8c1', 'fac-science-herbivore': 'r8c2', 'fac-science-marine': 'r8c3', 'fac-science-predator': 'r8c4', 'fac-science-primate': 'r8c5',
  'fac-science-reptile': 'r8c7',
  pentagon: 'r5c14', flag: 'r6c9',
  // what a placement bonus pentagon shows on top of the yellow base (r5c14); the number is drawn as text
  'bonus:reputation': 'r4c9', 'bonus:money': 'r11c8', 'bonus:xtoken': 'r3c2', 'bonus:take-in-range-or-deck': 'r6c13', 'bonus:Clever': 'r6c6',
  'bonus:bonus-sponsor': 'r7c6', 'bonus:sponsor-person-card': 'r7c6', 'bonus:Digging': 'r9c13', 'bonus:Determination': 'r6c7', 'bonus:cut-down': 'r4c1', 'bonus:bonus-scoring-cards': 'r6c4', 'bonus:Fac': 'r10c2', 'bonus:Partner-Zoo': 'r10c14', 'bonus:Multiplier': 'r6c8',
  'bonus:animal-magnet': 'r10c12', 'bonus:Worker': 'r5c13', 'bonus:Scavenging': 'r4c10', 'bonus:Mark': 'r3c3', 'bonus:Pouch': 'r7c11', 'bonus:kiosk': 'r7c3', 'bonus:upgrade-card': 'r10c5',
  'bonus:continent': 'r9c12', 'bonus:shark-attack': 'r5c1', 'bonus:wave': 'r11c14', 'bonus:store': 'r5c2', 'bonus:conceal': 'r5c5',
};
// BGA's names of the icons (scripts/name_icons.py): the placement bonus of each type shows the icon of the same name
const BONUS_ICON_NAME = {
  reputation: 'reputation', money: 'money', xtoken: 'xtoken-bordered', 'take-in-range-or-deck': 'take-in-range-or-deck', Clever: 'clever', 'bonus-sponsor': 'bonus-sponsor',
  'sponsor-person-card': 'sponsor-person-card', Digging: 'digging', 'Partner-Zoo': 'partner-zoo', Multiplier: 'multiplier', Worker: 'add-worker', 'upgrade-card': 'upgrade-card',
  appeal: 'appeal', conservation: 'conservation', Snapping: 'snapping', 'size-2': 'enclosure-size-2', 'size-3': 'enclosure-size-3',
};
export function applyIconNames(names) {
  for (const [type, name] of Object.entries(BONUS_ICON_NAME)) if (names[name] && type !== 'Digging') ICON_IDS['bonus:' + type] = names[name];       // (Digging keeps r9c13)
  ICON_IDS.money = names.money; ICON_IDS.appeal = names.appeal; ICON_IDS.conservation = names.conservation; ICON_IDS.reputation = names.reputation; ICON_IDS.xtoken_plain = names.xtoken;
}
export const SHOW_VALUE = new Set(['money', 'reputation', 'appeal']);     // BGA prints the number on these three only (appeal: 2 on the drawing board); the icon of every other bonus already says what it is
export const iconUrl = (id) => '/icons/' + id + '.webp';
export function moneyTile(root, cx, cy, size) {
  const id = 'mt' + (S.clipCount += 1), r = size * 0.24;
  const clip = svg('clipPath', { id });
  clip.append(svg('rect', { x: cx - size / 2, y: cy - size / 2, width: size, height: size, rx: r }));
  root.append(clip);
  root.append(svg('image', { href: iconUrl(ICON_IDS['bonus:money']), x: cx - size / 2, y: cy - size / 2, width: size, height: size, 'clip-path': 'url(#' + id + ')' }));
  root.append(svg('rect', { x: cx - size / 2, y: cy - size / 2, width: size, height: size, rx: r, class: 'money-border' }));
}

// the map's bonus space panel (left of the zoo map): the 3 locked workers on top, then the 7 bonus slots. A player cube covers a slot until its bonus has been
// chosen (a conservation project was supported) and a worker disappears when it is unlocked. Cubes and workers are drawn in the player's colour.
// BGA's player colours with a worker picture (web/workers); a colour that is not one of them gets the closest
const WORKER_COLORS = ['30a638', '1863a5', '7f4e30', '000000', '5a5856', 'ffffff', 'd1c81c', 'b91b1b', 'c028d3', 'cb7b19'];
export function workerUrl(seat) {
  const c = seatColor(seat).replace('#', '').toLowerCase();
  const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (h) => rgb(h).reduce((d, v, i) => d + Math.abs(v - rgb(c)[i]), 0);
  return '/workers/' + WORKER_COLORS.reduce((best, h) => (dist(h) < dist(best) ? h : best)) + '.webp';
}
// icon (and whether to print the value on it) of a bonus slot
export const SLOT_ICON = {};   // the slots use the same icons as the placement bonuses (ICON_IDS 'bonus:<type>', named from BGA's stylesheet)
export const SLOT_NUMBER = new Set(['money', 'xtoken', 'reputation', 'conservation']);

// ---- rendering ------------------------------------------------------------------------------------------------
export const ACTION_NAMES = { animals: 'Animals', association: 'Association', build: 'Build', cards: 'Cards', sponsors: 'Sponsors' };

export const ACTION_ICON = { animals: 'action-animals', association: 'action-association', build: 'action-build', cards: 'action-cards', sponsors: 'action-sponsors' };
export function pic(name, h) {
  const id = S.iconNames[name];
  if (!id) return document.createTextNode('');
  const img = el('img', 'icon');
  img.src = iconUrl(id); img.alt = name; img.title = name; img.height = h;
  return img;
}
