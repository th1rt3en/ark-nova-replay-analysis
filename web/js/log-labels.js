// [module] Turns the <ICON> markup of move-list lines into icons and badges.
import { el, seatText } from './util.js';
import { ACTION_ICON, ACTION_NAMES, ICON_IDS, VARIANT_NAMES, iconUrl } from './icons.js';
import { S } from './state.js';


// A log line with the icons the log names written between < >: <SEARCH-HERBIVORE>, <XTOKEN>, <MONEY:5> (with an amount), <APPEAL:1>, <AMERICAS>, <BIRD> ...
// Species searches and the other named icons come from BGA's icon sheet (names.json), continents and animal categories are the round badges.
const BADGE = { AFRICA: 'Africa', AMERICAS: 'Americas', ASIA: 'Asia', AUSTRALIA: 'Australia', EUROPE: 'Europe', BIRD: 'Bird', HERBIVORE: 'Herbivore', PREDATOR: 'Predator',
                PRIMATE: 'Primate', REPTILE: 'Reptile', SEAANIMAL: 'SeaAnimal' };
const WITH_AMOUNT = new Set(['MONEY', 'APPEAL', 'REPUTATION', 'CONSERVATION', 'XTOKEN', 'STRENGTH']);           // the amount is printed over the icon, like on the tracker
// The number inside an icon is centred by its ink, not by its text box (a "1" has more room on its left, every font has its own space above and below the digits): the shift that
// puts the middle of the drawn digits on the middle of the box is measured once per text with a canvas (in em of the number's own size) and set as --nx / --ny (parkposter.css).
const INK = new Map();
const NUM_LS = -.04;                                                                     // the letter-spacing (em) of the number in a money / appeal / conservation icon of a step text; the same value is in parkposter.css (`.labelamount.labelm b`, `.labeldk b`)
function inkShift(text, ls = 0) {
  const key = ls ? text + '|' + ls : text;
  let v = INK.get(key);
  if (v) return v;
  const c = inkShift.ctx || (inkShift.ctx = document.createElement('canvas').getContext('2d'));
  c.font = "400 200px 'Park Num'"; c.letterSpacing = (ls * 200) + 'px';                 // (the number's own letter-spacing, in em of its size)
  const m = c.measureText(text), ascent = m.fontBoundingBoxAscent, descent = m.fontBoundingBoxDescent;
  const baseline = (200 - (ascent + descent)) / 2 + ascent;                               // (line-height 1: the content area is centred in the line box)
  v = { x: (m.width / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2) / 200,
        y: (100 - (baseline + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2)) / 200 };
  INK.set(key, v);
  return v;
}
function centreInk(b, text, ls = 0) {
  const go = () => { try { const v = inkShift(text, ls); b.style.setProperty('--nx', v.x.toFixed(4) + 'em'); b.style.setProperty('--ny', v.y.toFixed(4) + 'em'); } catch (e) { /* (the CSS centring stays) */ } };
  if (document.fonts && !document.fonts.check("200px 'Park Num'")) { document.fonts.load("200px 'Park Num'").then(() => { INK.clear(); go(); }, () => {}); return; }
  go();
}
// Why an icon used to come a few milliseconds after its text: a step's line is built anew at every render, so each icon is a fresh <img>, and a fresh <img> is decoded off the main
// thread even when the file is in the cache; the text was painted in the frame before the picture was ready. Three things close the gap: the pictures are decoded once at idle time
// and kept (`warmLabelIcons`), the <img>s ask to be decoded with the frame (`decoding = 'sync'`, `labelImg`), and the strength icon (an SVG, rasterised on its own like any svg image)
// is drawn inline, which paints in the same frame as the text around it.
const WARM = new Map();
function warm(src) {
  if (WARM.has(src)) return;
  const i = new Image();
  i.decoding = 'async'; i.src = src;
  WARM.set(src, i);                                                                       // (kept: a picture nobody holds is dropped from the decoded cache)
  if (i.decode) i.decode().catch(() => {});
}
export function warmLabelIcons() {
  const urls = [...Object.values(S.iconNames).map(iconUrl), ...Object.values(BADGE).map((b) => '/badges/' + b + '.webp'), iconUrl('r5c6_ns')];
  const next = () => { for (const u of urls.splice(0, 12)) warm(u); if (urls.length) idle(next); };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
  if (document.fonts && document.fonts.load) document.fonts.load("200px 'Park Num'").catch(() => {});          // (the digits inside the icons are centred by this font's ink, `centreInk`)
  idle(next);
}
function labelImg(cls, src) {
  const img = el('img', cls);
  img.decoding = 'sync'; img.src = src;
  warm(src);
  return img;
}
const STRENGTH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 118 118"><rect width="118" height="118" fill="#211e21"/><path fill="#fff" d="M0 13.13h13.15v13.2H0zM0 39.29h13.15v13.2H0zM0 65.58h13.15v13.2H0zM0 91.74h13.15v13.2H0z"/></svg>';          // (web/icons/strength.svg)
function strengthIcon(cls, title) {
  const t = document.createElement('template');
  t.innerHTML = STRENGTH_SVG;
  const s = t.content.firstChild;
  s.setAttribute('class', cls); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'strength');
  const ti = document.createElementNS('http://www.w3.org/2000/svg', 'title'); ti.textContent = title;
  s.prepend(ti);
  return s;
}
function labelIcon(name, amount) {
  if (name === 'UNI') {                                                  // a university tile (`amount` is its type, e.g. fac-science-rep)
    if (!ICON_IDS[amount]) return null;
    const img = labelImg('icon labelicon labeluni', iconUrl(ICON_IDS[amount])); img.alt = 'university'; img.title = 'university ' + amount;
    return img;
  }
  if (name === 'ACARD') return actionCardIcon(amount);
  if (name === 'XTOKEN' && String(amount) === '1') amount = '';          // (a single X token: the plain icon without the 1)
  let src = null;
  if (BADGE[name]) src = '/badges/' + BADGE[name] + '.webp';
  else if (name === 'STRENGTH') src = 'inline';                    // (BGA's action strength icon redrawn as a vector, `r5c5` of the sheet is only 118 px; drawn inline, see `strengthIcon`)
  else {
    const key = name.startsWith('SEARCH-') ? 'search-' + name.slice(7).toLowerCase().replace('seaanimal', 'sea-animal') : name.toLowerCase();
    if (S.iconNames[key]) src = iconUrl(S.iconNames[key]);
  }
  if (!src) return null;
  if (name === 'XTOKEN' && amount) src = iconUrl('r5c6_ns');       // (no white squares under a number)
  const cls = 'icon labelicon' + (name === 'MONEY' ? ' labelmoney' : name === 'XTOKEN' && !amount ? ' labelxplain' : ''), title = name.toLowerCase().replace(/-/g, ' ') + (amount ? ' ' + amount : '');
  let img;
  if (src === 'inline') img = strengthIcon(cls, title);
  else { img = labelImg(cls, src); img.alt = name.toLowerCase(); img.title = title; }
  if (amount && WITH_AMOUNT.has(name)) {
    const box = el('span', 'labelamount' + (name === 'XTOKEN' ? ' labelx' : name === 'MONEY' ? ' labelm' : name === 'APPEAL' ? ' labeldk' : name === 'CONSERVATION' ? ' labeldk' : name === 'STRENGTH' ? ' labelstr' : ''));
    const num = el('b', '', amount);
    centreInk(num, String(amount), name === 'MONEY' || name === 'APPEAL' || name === 'CONSERVATION' ? NUM_LS : 0);
    box.append(img, num);
    return box;
  }
  return amount ? [img, document.createTextNode(amount)] : img;
}
// "gains 5 money", "pays 1 xtoken", "to get 2 conservation": the amounts of the five counters are shown as their icon with the number inside (the same as the
// <MONEY:5> markup), whichever way the line was worded (BGA's log, the engine, a live game). Only a number directly in front of the word counts.
const AMOUNT_WORD = { money: 'MONEY', xtoken: 'XTOKEN', xtokens: 'XTOKEN', 'x-token': 'XTOKEN', 'x-tokens': 'XTOKEN', reputation: 'REPUTATION', appeal: 'APPEAL', conservation: 'CONSERVATION' };
const AMOUNT_RE = /(^|[^\w<:-])(\d+) (money|x-?tokens?|reputation|appeal|conservation(?: points?)?)(?![\w-])/gi;
const PLAYS_FOR_RE = /\b((?:plays|buys) [^<>\n]*? for )(\d+)(?= and places\b|\s*$)/gm;           // "X plays Malayan Tapir for 14 and places it ...", "X buys Sand Tiger Shark from display for 32 and places it ...": the price is money
const PAYS_BUILDING_RE = /\b(pays )(\d+)( (?:for building|to buy)\b)/g;               // BGA leaves the word out here: "pays 4 for building a size-2 enclosure" is always money
// "chooses action card Animals with strength 4": the word and the number are the strength icon with the number inside
const STRENGTH_RE = /(^|[^\w<:-])strength (\d+)(?![\w-])/gi;
// "places action card Sponsors at position 1 (finishing action)", "places Build at position 1 (Clever effect)": the slot is the strength icon with the slot number (a card in slot N has strength N)
const POSITION_RE = /\b(places (?:action card )?<ACARD:[\w-]+> at )position (\d+)/g;
// An action card in a step text is its icon (the type's icon, the silver badge of a special card, the side I / II chip) with the descriptive name as the tooltip. BGA writes it as
// "action card SponsorsII" (type + side), "places Build at position 1", "upgrades AnimalsII" and, for a special card, "Sponsors2 effect" / "(Sponsors3)" / "Cards4 effect" (type + variant).
// The side and the variant of a card the text does not give are those of the card the player owns in that step's state.
const ACT = 'Animals|Association|Build|Cards|Sponsors';
const ACARD_PLAIN_RE = new RegExp(`\\baction card (${ACT})(II|I)?(?![A-Za-z0-9])`, 'g');
const ACARD_PLACES_RE = new RegExp(`\\b(places )(${ACT})(?= at position)`, 'g');
const ACARD_UPGRADES_RE = new RegExp(`\\b(upgrades )(${ACT})(II|I)?(?![A-Za-z0-9])`, 'g');
const ACARD_VARIANT_RE = new RegExp(`\\b(${ACT})([1-4])(?![A-Za-z0-9])`, 'g');
function ownedCard(step, text, type) {
  const st = step && step.state, players = (S.replay && S.replay.players) || [];
  if (!st || !st.players) return null;
  let seat = players.findIndex((p) => p.name && text.startsWith(p.name + ' '));
  if (seat < 0) seat = step.actor !== null && step.actor !== undefined ? step.actor : st.active_player;
  const p = st.players[seat];
  return (p && (p.action_cards || []).find((c) => c.type === type)) || null;
}
function actionMarkup(text, step) {
  if (!S.iconNames[ACTION_ICON.animals]) return text;
  const mark = (type, variant, level) => `<ACARD:${type}-${variant}-${level}>`;
  const mw = !!(S.replay && S.replay.marine_worlds);
  const own = (word, level) => {                                                      // type, variant and side of a card the text names by type (+ side)
    const type = word.toLowerCase(), c = ownedCard(step, text, type);
    return mark(type, mw && c ? c.variant || 0 : 0, level === 'II' ? 2 : level === 'I' ? 1 : c && c.level === 2 ? 2 : 1);
  };
  return text
    .replace(ACARD_PLAIN_RE, (all, w, lv) => `action card ${own(w, lv)}`)
    .replace(ACARD_PLACES_RE, (all, pre, w) => pre + own(w, ''))
    .replace(ACARD_UPGRADES_RE, (all, pre, w, lv) => pre + own(w, lv))
    .replace(ACARD_VARIANT_RE, (all, w, v) => (mw && VARIANT_NAMES[w.toLowerCase() + '_' + v]) || all);          // "Sponsors2 effect": the descriptive name of the special card, as text ("Money Sponsors effect")
}
// the icon of an action card: <ACARD:type-variant-side>
function actionCardIcon(spec) {
  const [type, variant, side] = String(spec).split('-'), v = +variant, lvl = +side === 2 ? 2 : 1;
  const id = S.iconNames[ACTION_ICON[type]];
  if (!id) return null;
  const box = el('span', 'acticon' + (lvl === 2 ? ' lvl2' : ''));                    // the look of the action card in the player box (side-panel.js: `.ac`): a white tile with a blue (I) / purple (II) frame
  box.title = (v ? VARIANT_NAMES[type + '_' + v] || ACTION_NAMES[type] : ACTION_NAMES[type]) + ' (' + (lvl === 2 ? 'II' : 'I') + ')';
  const img = labelImg('icon', iconUrl(id));
  img.alt = ACTION_NAMES[type] || type;
  box.append(img);
  if (v) {                                                                          // the silver badge of the special card, the side's own, top left like in the player box
    const b = labelImg('acvar', '/action_icons/' + type + '_' + v + '_' + lvl + '.webp');
    b.alt = 'Variant ' + v;
    box.append(b);
  }
  return box;
}
// "X plays A for 14 and places it in the large aquarium, the underwater tunnel": the special enclosures of BGA's text in our wording: aquariums and the tunnel capitalised like the other
// special buildings, "and" instead of the commas, both aquariums together as "both Aquariums" ("... in both Aquariums and the Underwater Tunnel" / "... and the Reptile House").
const PLACES_RE = /\b(places it in )([^\n<]+)/g;
const SPECIAL = /^(the (?:large|small) aquarium|the underwater tunnel|the large bird aviary|the reptile house|the petting zoo)$/i;
const SPECIAL_CAPS = { 'the large aquarium': 'the Large Aquarium', 'the small aquarium': 'the Small Aquarium', 'the underwater tunnel': 'the Underwater Tunnel', 'the large bird aviary': 'the Large Bird Aviary', 'the reptile house': 'the Reptile House', 'the petting zoo': 'the Petting Zoo' };
export function placesText(text) {
  return text.replace(PLACES_RE, (all, pre, list) => {
    const parts = list.split(', ');
    if (!parts.every((q) => SPECIAL.test(q.trim()))) return all;                  // (a size-N enclosure, a Kiosk ... stay as BGA writes them)
    let names = parts.map((q) => SPECIAL_CAPS[q.trim().toLowerCase()]);
    const big = names.indexOf('the Large Aquarium'), small = names.indexOf('the Small Aquarium');
    if (big >= 0 && small >= 0) names = ['both Aquariums', ...names.filter((q, i) => i !== big && i !== small)];
    return pre + (names.length < 3 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
  });
}
// "X takes a new university" shows the tile that was taken instead: the university token that is new on the association board in this step (or in the next one, where the log moves it)
function universityTaken(step) {
  const steps = (S.replay && S.replay.steps) || [], i = steps.indexOf(step);
  if (i < 0) return null;
  const tiles = (st) => (st ? st.players.flatMap((p) => (p.tokens || []).filter((t) => /^university_/.test(t.location || '')).map((t) => t.type)) : []);
  const fresh = (a, b) => { const left = [...tiles(a)]; for (const t of tiles(b)) { const k = left.indexOf(t); if (k < 0) return t; left.splice(k, 1); } return null; };
  const cur = steps[i].state, prev = i > 0 ? steps[i - 1].state : null, next = steps[i + 1] ? steps[i + 1].state : null;
  return (prev && fresh(prev, cur)) || (next && fresh(cur, next)) || null;
}
function amountMarkup(text, step) {
  if (step && /takes a new university/.test(text)) { const t = universityTaken(step); if (t) text = text.replace(/takes a new university/, 'takes <UNI:' + t + '>'); }
  text = placesText(actionMarkup(text, step));
  text = text.replace(STRENGTH_RE, (all, pre, n) => `${pre}<STRENGTH:${n}>`).replace(POSITION_RE, (all, pre, n) => `${pre}<STRENGTH:${n}>`);
  if (S.iconNames.money) text = text.replace(PAYS_BUILDING_RE, (all, a, n, b) => `${a}<MONEY:${n}>${b}`);
  if (S.iconNames.money) text = text.replace(PLAYS_FOR_RE, (all, a, n) => `${a}<MONEY:${n}>`);
  return text.replace(AMOUNT_RE, (all, pre, n, word) => {
    const key = AMOUNT_WORD[word.toLowerCase().replace(/ points?$/, '')];
    return key && S.iconNames[key.toLowerCase()] ? `${pre}<${key}:${n}>` : all;
  });
}
// The icon of a counter with its amount inside, for the buttons of the move bar ("Gain" + this); null when the icon is not known yet.
export function amountIcon(kind, n) {
  const key = String(kind).toUpperCase();
  if (!WITH_AMOUNT.has(key)) return null;
  const r = labelIcon(key, String(n));
  return r && !Array.isArray(r) ? r : null;
}
// The text of a log line / step text with the players' names in their colour (on the pale paper: `seatText`, the colour the decisions of the move bar use).
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function namedNodes(text) {
  const players = (S.replay && S.replay.players) || [];
  const names = players.map((p, i) => ({ name: p.name || '', seat: i })).filter((x) => x.name).sort((a, b) => b.name.length - a.name.length);
  if (!names.length || !text) return [document.createTextNode(text)];
  const re = new RegExp('(^|[^\\p{L}\\p{N}_])(' + names.map((x) => escapeRe(x.name)).join('|') + ')(?![\\p{L}\\p{N}_])', 'gu');
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index + m[1].length;
    if (start > last) out.push(document.createTextNode(text.slice(last, start)));
    const hit = names.find((x) => x.name === m[2]);
    const sp = el('span', 'pname', m[2]);
    sp.style.color = seatText(hit.seat);
    out.push(sp);
    last = start + m[2].length;
  }
  if (!out.length) return [document.createTextNode(text)];
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}
// The Log's line of a step. The starting discards of both players are one step ("A discards 4 cards · B discards 4 cards · The display is replenished"): they stand on lines of their own,
// as the two starting draws are lines of their own (the move bar joins them, frames.js `barLabel`).
export function stepLabelNode(text, step) {
  const names = (S.replay?.players || []).map((p) => p.name), parts = String(text).split(' · ');
  if (parts.length < 2 || parts.filter((p) => names.some((n) => p.startsWith(n + ' discards '))).length !== 2) return labelNode(text, step);
  const box = el('span', 'loglines');
  for (const p of parts) { const l = el('span', 'logline'); l.append(labelNode(p, step)); box.append(l); }
  return box;
}
export function labelNode(text, step) {
  text = amountMarkup(text, step).replace(/ for a total of \d+ <[A-Z][A-Z-]*(?::[\w-]+)?>/gi, '').replace(/ chooses (.+?) and \1 to Pilfer\b/, ' chooses $1 to Pilfer');          // ("discards A, B for a total of 1 <SEAANIMAL> (Glide effect)" -> "discards A, B (Glide effect)")
  const span = el('span', '');
  let last = 0;
  for (const m of text.matchAll(/<([A-Z][A-Z-]*)(?::([\w-]+))?>/g)) {
    const icon = labelIcon(m[1], m[2]);
    if (!icon) continue;
    span.append(...namedNodes(text.slice(last, m.index)));
    span.append(...(Array.isArray(icon) ? icon : [icon]));
    last = m.index + m[0].length;
  }
  span.append(...namedNodes(text.slice(last)));
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
