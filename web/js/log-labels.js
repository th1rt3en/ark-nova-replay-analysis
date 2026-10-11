// [module] Turns the <ICON> markup of move-list lines into icons and badges.
import { el } from './util.js';
import { iconUrl } from './icons.js';
import { S } from './state.js';


// A log line with the icons the log names written between < >: <SEARCH-HERBIVORE>, <XTOKEN>, <MONEY:5> (with an amount), <APPEAL:1>, <AMERICAS>, <BIRD> ...
// Species searches and the other named icons come from BGA's icon sheet (names.json), continents and animal categories are the round badges.
const BADGE = { AFRICA: 'Africa', AMERICAS: 'Americas', ASIA: 'Asia', AUSTRALIA: 'Australia', EUROPE: 'Europe', BIRD: 'Bird', HERBIVORE: 'Herbivore', PREDATOR: 'Predator',
                PRIMATE: 'Primate', REPTILE: 'Reptile', SEAANIMAL: 'SeaAnimal' };
const WITH_AMOUNT = new Set(['MONEY', 'APPEAL', 'REPUTATION', 'CONSERVATION']);           // the amount is printed over the icon, like on the tracker
function labelIcon(name, amount) {
  let src = null;
  if (BADGE[name]) src = '/badges/' + BADGE[name] + '.webp';
  else {
    const key = name.startsWith('SEARCH-') ? 'search-' + name.slice(7).toLowerCase().replace('seaanimal', 'sea-animal') : name.toLowerCase();
    if (S.iconNames[key]) src = iconUrl(S.iconNames[key]);
  }
  if (!src) return null;
  const img = el('img', 'icon labelicon' + (name === 'MONEY' ? ' labelmoney' : ''));
  img.src = src; img.alt = name.toLowerCase(); img.title = name.toLowerCase().replace(/-/g, ' ') + (amount ? ' ' + amount : '');
  if (amount && WITH_AMOUNT.has(name)) {
    const box = el('span', 'labelamount');
    box.append(img, el('b', '', amount));
    return box;
  }
  return amount ? [img, document.createTextNode(amount)] : img;
}
export function labelNode(text) {
  const span = el('span', '');
  let last = 0;
  for (const m of text.matchAll(/<([A-Z][A-Z-]*)(?::(\d+))?>/g)) {
    const icon = labelIcon(m[1], m[2]);
    if (!icon) continue;
    span.append(document.createTextNode(text.slice(last, m.index)));
    span.append(...(Array.isArray(icon) ? icon : [icon]));
    last = m.index + m[0].length;
  }
  span.append(document.createTextNode(text.slice(last)));
  return span;
}

const ENGINE_MARK = { engine: ['✓', 'Played by the rules engine; it agrees with the log'], mismatch: ['≠', 'The engine played this turn but ended in a different state than the log (shown: log state)'],
                      illegal: ['!', 'A logged action is not legal for the engine (shown: log state)'], skipped: ['–', 'Not supported by the engine yet (shown: log state)'], log: ['', ''] };
export function engineBadge(eng) {
  if (!eng) return document.createTextNode('');
  const key = eng.source === 'engine' ? 'engine' : (eng.status in ENGINE_MARK ? eng.status : 'log');
  const [mark, tip] = ENGINE_MARK[key];
  const b = el('span', 'engine-badge ' + key, key === 'engine' ? '' : mark);
  if (key === 'engine') {                                          // the check mark is drawn (a font glyph was thin and small)
    const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), pth = document.createElementNS(NS, 'path');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    pth.setAttribute('d', 'M4.5 12.8 L9.8 18 L19.5 6.2'); s.append(pth); b.append(s);
  }
  b.title = tip + (eng.detail ? '\n' + eng.detail : '');
  return b;
}
