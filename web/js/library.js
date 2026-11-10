// [module] The card library page (library.html): every card of web/library_data.json (scripts/build_library.py) with the filters. A group of chips with all of them on is no filter;
// with one off, a card must have one of the chips that are on in that group (the groups are separate: Bird only hides the predators whatever their continent). The cost slider only looks at animals.
const GROUPS = {
  type: [['animal', 'Animals'], ['sponsor', 'Sponsors'], ['project', 'Projects'], ['endgame', 'Endgame']],
  species: [['bird', 'Bird', 'Bird'], ['herbivore', 'Herbivore', 'Herbivore'], ['predator', 'Predator', 'Predator'], ['primate', 'Primate', 'Primate'], ['reptile', 'Reptile', 'Reptile'], ['seaAnimal', 'Sea animal', 'SeaAnimal'], ['bear', 'Bear', 'Bear'], ['pet', 'Petting zoo', 'Pet']],
  continent: [['africa', 'Africa', 'Africa'], ['americas', 'Americas', 'Americas'], ['asia', 'Asia', 'Asia'], ['australia', 'Australia', 'Australia'], ['europe', 'Europe', 'Europe']],
  other: [['science', 'Science', 'Science'], ['rock', 'Rock', 'Rock'], ['water', 'Water', 'Water']],
  normal: [1, 2, 3, 4, 5].map((n) => [n, String(n)]),
  aqua: [0, 1, 2, 3, 4].map((n) => [n, String(n)]),
};
const ICON_GROUPS = ['species', 'continent', 'other'];
const $ = (id) => document.getElementById(id);
const sel = {};                                           // group -> Set of the chips that are on
for (const [g, list] of Object.entries(GROUPS)) sel[g] = new Set(list.map((c) => c[0]));
sel.ability = new Set();                                  // (none selected = any)
let cards = [], nodes = [];

let names = {};                                           // BGA's icon names -> the ids of the icon sheet (web/icons/names.json)
const iconSrc = (name) => (names[name] ? '/icons/' + names[name] + '.webp' : null);
const ACTION_ICON = { Association: 'action-association', Building: 'action-build', Cards: 'action-cards', Card: 'action-cards', Sponsors: 'action-sponsors', Animal: 'action-animals' };
const ABILITY_ICON = { Adapt: 'adapt', Clever: 'clever', Constriction: 'constriction', 'Cut Down': 'cut-down', Determination: 'determination', Digging: 'digging', 'Extra Shift': 'extra-shift', Hunter: 'hunter', Hypnosis: 'hypnosis',
  Mark: 'mark', Marketing: 'bonus-sponsor', Perception: 'perception', Pilfering: 'pilfering', Pouch: 'pouch', Scavenging: 'scavenging', 'Scuba Dive': 'diving', 'Shark Attack': 'shark-attack', Snapping: 'snapping',
  Sunbathing: 'sunbathing', Venom: 'venom', 'Sea Animal Magnet': 'animal-magnet', 'Sponsor Magnet': 'animal-magnet' };
function abilityIcon(a) {                                 // the icon of an ability where the game has one (the rest stay words)
  let m;
  if ((m = /^(?:Action|Boost): (\w+)/.exec(a))) return iconSrc(ACTION_ICON[m[1]]);
  if (a.startsWith('Multiplier')) return iconSrc('multiplier');
  if (a === 'Assertion') return '/icons/r11c6.webp';
  if (a === 'Reef') return iconSrc('reef');
  if (a === 'Resistance') return '/icons/hourglass.svg';
  if (a === 'Petting Zoo Animal') return '/badges/Pet.webp';
  const key = Object.keys(ABILITY_ICON).find((k) => a === k || a.startsWith(k + ' '));
  return key ? iconSrc(ABILITY_ICON[key]) : null;
}

function chip(group, value, label, badge, icon) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.group = group; b.dataset.value = String(value);
  if (badge) { const i = document.createElement('img'); i.src = '/badges/' + badge + '.webp'; i.alt = ''; i.width = 26; i.height = 26; b.append(i); }
  else if (icon) { const i = document.createElement('img'); i.src = icon; i.alt = ''; i.className = 'ico'; i.height = 24; b.append(i); }
  b.append(label);
  const paint = () => { const on = sel[group].has(value); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
  b.onclick = () => {
    if (GROUPS[group] && sel[group].size === GROUPS[group].length) sel[group] = new Set([value]);          // everything on: the click picks this one and switches the rest off
    else if (sel[group].has(value)) sel[group].delete(value);
    else sel[group].add(value);
    document.querySelectorAll(`.chip[data-group="${group}"]`).forEach((c) => c.paint());
    apply();
  };
  b.paint = paint; paint();
  return b;
}

function buildFilters(abilities) {
  for (const [g, list] of Object.entries(GROUPS)) {
    const box = document.querySelector(`.fgroup[data-group="${g}"] .chips`);
    for (const [v, label, badge] of list) box.append(chip(g, v, label, badge));
    const head = box.parentElement.querySelector('h2');
    for (const [text, all] of [['All', true], ['None', false]]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mini'; b.textContent = text;
      b.onclick = () => { sel[g] = new Set(all ? list.map((c) => c[0]) : []); box.querySelectorAll('.chip').forEach((c) => c.paint()); apply(); };
      head.append(b);
    }
  }
  const box = document.querySelector('.abilities');
  for (const a of [...abilities, 'Reef'].sort((x, y) => x.localeCompare(y))) box.append(chip('ability', a, a, null, abilityIcon(a)));          // ("Reef": every Reef Dweller, which has the effect of its aquarium instead of an ability of its own)
}

const TRI = ['any', 'yes', 'no'];                         // the gives / requires filters: one button that cycles Any -> Yes -> No
function paintTri(b) {
  const v = b.dataset.v, src = iconSrc(b.dataset.icon);
  b.replaceChildren();
  if (src) { const i = document.createElement('img'); i.src = src; i.alt = ''; i.height = 24; b.append(i); }
  const s = document.createElement('b'); s.textContent = v === 'any' ? 'Any' : v === 'yes' ? 'Yes' : 'No';
  b.append(b.dataset.label + ': ', s);
  b.className = 'tribtn ' + v;
  b.setAttribute('aria-label', b.dataset.label + ': ' + s.textContent);
}
function initTri() {
  for (const id of ['rep', 'cons', 'partner', 'uni']) {
    const b = $(id);
    b.onclick = () => { b.dataset.v = TRI[(TRI.indexOf(b.dataset.v) + 1) % TRI.length]; paintTri(b); apply(); };
    paintTri(b);
  }
}

const passes = (c, q) => (c.mw ? [c, c.mw] : [c]).some((v) => passesWith(c, v, q));          // (a card reprinted for Marine Worlds stays in when either of its two versions matches, so its switch stays in reach)
function passesWith(c, v, q) {                                       // v: the icons and the text of the version that is looked at
  if (!sel.type.has(c.type)) return false;
  for (const g of ICON_GROUPS) if (sel[g].size < GROUPS[g].length && !v.icons.some((i) => sel[g].has(i))) return false;          // (a group with a chip off: the card needs one of the chips that are on)
  if (c.price != null && (c.price < +$('cmin').value || c.price > +$('cmax').value)) return false;
  const size = [];                                                                                                                   // (the two size groups: with a chip off in either, the card needs a size that is on)
  if (sel.normal.size < GROUPS.normal.length) size.push(c.normal != null && sel.normal.has(c.normal));
  if (sel.aqua.size < GROUPS.aqua.length) size.push(c.aqua != null && sel.aqua.has(c.aqua));
  if (size.length && !size.some(Boolean)) return false;
  const advanced = sel.ability.size || ['rep', 'cons', 'partner', 'uni'].some((id) => $(id).dataset.v !== 'any');
  if (advanced) {                                           // (these only describe animals: with one of them set, the other cards are out)
    if (c.type !== 'animal') return false;
    if (sel.ability.size && !c.abilities.some((a) => sel.ability.has(a)) && !(sel.ability.has('Reef') && c.reef)) return false;
    for (const [id, field] of [['rep', 'reputation'], ['cons', 'conservation'], ['partner', 'partner'], ['uni', 'university']]) {
      const v = $(id).dataset.v;
      if (v !== 'any' && (v === 'yes') !== !!c[field]) return false;
    }
  }
  return q.every((w) => v.text.includes(w));
}

function apply() {
  const q = $('text').value.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  cards.forEach((c, i) => { const ok = passes(c, q); nodes[i].hidden = !ok; if (ok) shown++; });
  $('count').textContent = shown + ' of ' + cards.length + ' cards';
}

function costRange(lo, hi, from) {                        // the double slider: two range inputs on one track, the lower one never above the other
  const a = $('cmin'), b = $('cmax');
  for (const i of [a, b]) { i.min = lo; i.max = hi; i.step = 1; }
  if (from === 'reset') { a.value = lo; b.value = hi; }
  if (from === 'min' && +a.value > +b.value) b.value = a.value;
  if (from === 'max' && +b.value < +a.value) a.value = b.value;
  const span = Math.max(1, hi - lo);
  $('dual').style.setProperty('--lo', ((+a.value - lo) / span * 100) + '%');
  $('dual').style.setProperty('--hi', ((+b.value - lo) / span * 100) + '%');
  $('costlabel').textContent = a.value + ' - ' + b.value;
}

function build(d) {
  cards = d.cards;
  const prices = cards.filter((c) => c.price != null).map((c) => c.price), lo = Math.min(...prices), hi = Math.max(...prices);
  costRange(lo, hi, 'reset');
  $('cmin').addEventListener('input', () => { costRange(lo, hi, 'min'); apply(); });
  $('cmax').addEventListener('input', () => { costRange(lo, hi, 'max'); apply(); });
  $('reset').addEventListener('click', () => { costRange(lo, hi, 'reset'); apply(); });
  const grid = $('grid'), dlg = $('big');
  nodes = cards.map((c) => {
    const f = document.createElement('figure');
    f.className = 'libcard ' + c.type;
    const b = document.createElement('button');
    b.type = 'button'; b.title = c.name + ' (' + c.key + ')';
    const img = document.createElement('img');
    img.src = '/cards/' + c.key + '.webp'; img.alt = c.name; img.loading = 'lazy'; img.width = 360; img.height = 503;
    b.append(img);
    c.view = 'base';
    const file = () => c.key + (c.view === 'mw' ? '_MW' : '') + '.webp';
    b.onclick = () => { $('bigimg').src = '/cards_large/' + file(); $('bigimg').alt = c.name; dlg.showModal(); };
    const cap = document.createElement('figcaption');
    cap.textContent = c.name;
    if (c.source === 'marine_worlds') { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'Marine Worlds'; cap.append(t); }
    f.append(b, cap);
    if (c.mw) {                                            // the base game card and its Marine Worlds reprint: a switch under the card
      const sw = document.createElement('div');
      sw.className = 'vswitch'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', c.name + ' version');
      const pick = (view, quiet) => { c.view = view; img.src = '/cards/' + file(); for (const x of sw.children) { const on = x.dataset.view === view; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); } if (!quiet) apply(); };
      for (const [view, label] of [['base', 'Base'], ['mw', 'Marine Worlds']]) {
        const x = document.createElement('button');
        x.type = 'button'; x.dataset.view = view; x.textContent = label; x.onclick = () => pick(view);
        sw.append(x);
      }
      pick('base', true);
      f.append(sw);
    }
    grid.append(f);
    return f;
  });
  buildFilters(d.abilities);
  initTri();
  apply();
}

$('text').addEventListener('input', apply);
$('reset').onclick = () => {
  for (const [g, list] of Object.entries(GROUPS)) sel[g] = new Set(list.map((c) => c[0]));
  sel.ability = new Set();
  for (const id of ['rep', 'cons', 'partner', 'uni']) { $(id).dataset.v = 'any'; paintTri($(id)); }
  $('text').value = '';
  document.querySelectorAll('.chip').forEach((c) => c.paint());
  apply();
};
$('bigclose').onclick = () => $('big').close();
$('big').addEventListener('click', (e) => { if (e.target === $('big')) $('big').close(); });
Promise.all([fetch('/library_data.json').then((r) => r.json()), fetch('/icons/names.json').then((r) => r.json()).catch(() => ({}))]).then(([d, n]) => { names = n; build(d); }).catch(() => { $('count').textContent = 'The cards could not be loaded.'; });
