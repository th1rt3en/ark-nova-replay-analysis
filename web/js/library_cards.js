// [module] The card library as a scrapbook (library/cards/index.html): every card of web/library_data.json mounted on the pages of a book that is turned, not scrolled.
// The sections (Animals, Sponsors, Projects, Endgame) follow each other and have a bookmark each. The filters are in the drawer: stamps (one per icon; stamping a sheet
// = that icon is asked for; within species / continents / the other icons one of the stamped is enough, between those groups all must hold), a ruler (animal size),
// a gold sack (animal cost), a wax seal (only the sponsors that are people). The magnifying glass opens the text search.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const TYPES = [['animal', 'Animals', '#E9662A'], ['sponsor', 'Sponsors', '#2A8FC4'], ['project', 'Projects', '#3E9A55'], ['endgame', 'Endgame', '#8058C4']];
const STAMPS = {          // group -> [icon of the data, badge file, name, colour of its ink]
  species: [['bird', 'Bird', 'Bird', '#34506B'], ['herbivore', 'Herbivore', 'Herbivore', '#4F6B45'], ['predator', 'Predator', 'Predator', '#8C2F39'], ['primate', 'Primate', 'Primate', '#7A4A1E'], ['reptile', 'Reptile', 'Reptile', '#2F5248'], ['seaAnimal', 'SeaAnimal', 'Sea animal', '#1D6A8A'], ['bear', 'Bear', 'Bear', '#5A3A24'], ['pet', 'Pet', 'Petting zoo', '#8A5A1C']],
  continent: [['africa', 'Africa', 'Africa', '#9A7A12'], ['americas', 'Americas', 'Americas', '#A85A1A'], ['asia', 'Asia', 'Asia', '#3F7A4A'], ['australia', 'Australia', 'Australia', '#9E1F35'], ['europe', 'Europe', 'Europe', '#2A6F96']],
  other: [['science', 'Science', 'Science', '#5A3A7C'], ['rock', 'Rock', 'Rock', '#5F5458'], ['water', 'Water', 'Water', '#1D6A8A']],
};
// the sponsors that are a person (the data has no field for it: by name)
const PEOPLE = new Set(['Spokesperson', 'Veterinarian', 'Expert On The Americas', 'Expert On Europe', 'Expert On Australia', 'Expert On Asia', 'Expert On Africa', 'Talented Communicator', 'Engineer', 'Diversity Researcher', 'Archaeologist',
  'Expert In Small Animals', 'Expert In Large Animals', 'Primatologist', 'Herpetologist', 'Ornithologist', 'Expert In Predators', 'Expert In Herbivores', 'Hydrologist', 'Geologist', 'Explorer', 'Marine Biologist', 'Horse Whisperer', 'Landscape Gardener']);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sel = { species: new Set(), continent: new Set(), other: new Set() };
const F = { size: [1, 5], cost: [0, 0], costAll: [0, 0], people: false };
let cards = [], shown = [], per = 8, spread = 0, turning = false;

/* ---------- which cards are in the book ---------- */
const passes = (c, q) => (c.mw ? [c, c.mw] : [c]).some((v) => {          // (a card reprinted for Marine Worlds stays when either printing matches)
  for (const g in sel) if (sel[g].size && !v.icons.some((i) => sel[g].has(i))) return false;
  if (F.size[0] > 1 || F.size[1] < 5) { if (c.size == null || c.size < F.size[0] || c.size > F.size[1]) return false; }
  if (F.cost[0] > F.costAll[0] || F.cost[1] < F.costAll[1]) { if (c.price == null || c.price < F.cost[0] || c.price > F.cost[1]) return false; }
  if (F.people && !(c.type === 'sponsor' && PEOPLE.has(c.name))) return false;
  return q.every((w) => v.text.includes(w));
});
const filtered = () => sel.species.size || sel.continent.size || sel.other.size || F.size[0] > 1 || F.size[1] < 5 || F.cost[0] > F.costAll[0] || F.cost[1] < F.costAll[1] || F.people;
function apply(keep) {
  const q = $('text').value.toLowerCase().split(/\s+/).filter(Boolean);
  shown = cards.filter((c) => passes(c, q));
  $('count').textContent = shown.length + (shown.length === 1 ? ' card' : ' cards');
  $('wipe').hidden = !filtered();
  if (!keep) spread = 0;
  draw();
}

/* ---------- a mounted card ---------- */
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; };
function mount(c, w) {
  const r = hash(c.key + 'x'); r(); r();
  let rot = (r() - .5) * 7; const k = r(); if (k < .2) rot *= 2.1; else if (k > .82) rot *= .25;          // (most a little crooked, some clearly, a few nearly straight)
  const m = el('div', 'mount'); m.style.width = w + 'px'; m.style.setProperty('--rot', rot.toFixed(2) + 'deg'); m.style.setProperty('--dx', ((r() - .5) * 12).toFixed(1) + 'px'); m.style.setProperty('--dy', ((r() - .5) * 10).toFixed(1) + 'px');
  const file = () => c.key + (c.view === 'mw' ? '_MW' : '') + '.webp';
  const b = el('button', 'card'); b.type = 'button'; b.title = c.name;
  const img = el('img'); img.alt = c.name; img.width = 360; img.height = 503; img.src = '/cards/' + file(); img.decoding = 'async';
  b.append(img); b.onclick = () => { $('bigimg').src = '/cards_large/' + file(); $('bigimg').alt = c.name; $('big').showModal(); };
  m.append(b);
  if (c.mw) {          // the Marine Worlds printing of the card: a round switch at its edge
    const s = el('button', 'mw', 'MW'); s.type = 'button'; s.title = 'Marine Worlds printing'; s.setAttribute('aria-pressed', String(c.view === 'mw'));
    s.onclick = () => { c.view = c.view === 'mw' ? 'base' : 'mw'; s.setAttribute('aria-pressed', String(c.view === 'mw')); img.src = '/cards/' + file(); };
    m.append(s);
  }
  return m;
}

/* ---------- the pages ---------- */
let grid = { cols: 4, rows: 2, w: 150 };
function measure() {          // how many cards a page holds: as many rows as leave the cards at least 116 px wide (never fewer than one)
  const box = $('pr').querySelector('.cards'), W = box.clientWidth, H = box.clientHeight, gx = 18, gy = 14, one = matchMedia('(max-width: 760px)').matches;
  let best = null;
  for (let rows = 1; rows <= 4; rows++) { const h = (H - (rows - 1) * gy) / rows - 12, w0 = h * 360 / 503, cols = Math.max(1, Math.floor((W + gx) / (w0 + gx + 10))), w = Math.min(w0, (W - (cols - 1) * gx) / cols - 10); if (rows === 1 || w >= 116) best = { cols, rows, w: Math.floor(w) }; }
  grid = best; per = grid.cols * grid.rows; return one ? 1 : 2;
}
let sides = 2;
function fill(page, items, n) {
  const box = page.querySelector('.cards'); box.style.gridTemplateColumns = `repeat(${grid.cols}, 1fr)`; box.style.gridTemplateRows = `repeat(${grid.rows}, 1fr)`;
  box.replaceChildren(...items.map((c) => mount(c, grid.w)));
  if (!shown.length && page.classList.contains('r')) box.append(el('p', 'none', 'Nothing in the book matches.'));
  page.querySelector('.pn').textContent = items.length ? n : '';
}
const slice = (i) => shown.slice(i * per, (i + 1) * per);
const spreads = () => Math.max(1, Math.ceil(shown.length / (per * sides)));
function content(s) { return sides === 2 ? [slice(s * 2), slice(s * 2 + 1), s * 2 + 1, s * 2 + 2] : [[], slice(s), 0, s + 1]; }
function chrome() {
  const n = spreads(); $('prev').disabled = spread <= 0; $('next').disabled = spread >= n - 1;
  $('book').style.setProperty('--t', n > 1 ? spread / (n - 1) : 0);
  document.querySelector('.stack.l').style.setProperty('--t', n > 1 ? spread / (n - 1) : 0); document.querySelector('.stack.r').style.setProperty('--t', n > 1 ? 1 - spread / (n - 1) : 1);
  const first = shown[spread * per * sides], cur = first ? first.type : null;
  for (const b of $('marks').children) { b.classList.toggle('on', b.dataset.type === cur); b.disabled = !shown.some((c) => c.type === b.dataset.type); }
}
function draw() {
  sides = measure(); spread = Math.min(spread, spreads() - 1);
  const [l, r, nl, nr] = content(spread); fill($('pl'), l, nl); fill($('pr'), r, nr); chrome();
}
function go(to) {
  to = Math.max(0, Math.min(spreads() - 1, to));
  if (to === spread || turning) return;
  const fwd = to > spread, [l, r, nl, nr] = content(to);
  if (still || sides === 1) { spread = to; draw(); return; }
  // the leaf: the page that leaves on its front, the page that arrives on its back; the page under it is already the new one
  turning = true;
  const leaf = el('div', 'leaf ' + (fwd ? 'fwd' : 'back')), old = $(fwd ? 'pr' : 'pl'), front = old.cloneNode(true), back = old.cloneNode(false);
  front.removeAttribute('id'); back.removeAttribute('id'); back.className = 'page ' + (fwd ? 'l' : 'r') + ' flip'; back.append(el('div', 'cards'), el('span', 'pn'));
  fill(back, fwd ? l : r, fwd ? nl : nr); leaf.append(front, back); old.parentNode.append(leaf);
  fill(old, fwd ? r : l, fwd ? nr : nl); spread = to; chrome();
  requestAnimationFrame(() => requestAnimationFrame(() => { leaf.style.transform = `rotateY(${fwd ? -180 : 180}deg)`; }));
  const done = () => { fill($(fwd ? 'pl' : 'pr'), fwd ? l : r, fwd ? nl : nr); leaf.remove(); turning = false; };
  leaf.addEventListener('transitionend', done, { once: true }); setTimeout(() => { if (leaf.isConnected) done(); }, 1100);
}

/* ---------- the drawer ---------- */
function dual(host, lo, hi, a0, b0, label, onChange) {          // two range inputs on one rail, the lower never above the upper
  const box = el('div', 'dual'), a = el('input'), b = el('input');
  for (const [i, v, n] of [[a, a0, 'from'], [b, b0, 'to']]) { i.type = 'range'; i.min = lo; i.max = hi; i.step = 1; i.value = v; i.setAttribute('aria-label', label + ', ' + n); }
  a.oninput = () => { if (+a.value > +b.value) b.value = a.value; onChange(+a.value, +b.value); }; b.oninput = () => { if (+b.value < +a.value) a.value = b.value; onChange(+a.value, +b.value); };
  box.append(a, b); host.append(box);
  return (x, y) => { a.value = x; b.value = y; onChange(x, y, true); };
}
const resets = [];
function buildDrawer() {
  let n = 0;
  for (const [g, list] of Object.entries(STAMPS)) for (const [icon, badge, name, ink] of list) {
    const b = el('button', 'stamp'); b.type = 'button'; b.title = name; b.setAttribute('aria-label', name); b.setAttribute('aria-pressed', 'false'); b.style.setProperty('--pc', ink);
    const base = el('span', 'base'), img = el('img'); img.src = '/badges/' + badge + '.webp'; img.alt = ''; base.append(img); b.append(el('span', 'grip'), base);
    const rot = ((n++ * 47) % 31) - 15;
    let print = null;
    const set = (on, quiet) => {
      if (on === sel[g].has(icon)) return;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      if (on) { sel[g].add(icon); print = el('button', 'print'); print.type = 'button'; print.title = name + ': remove'; print.setAttribute('aria-label', name + ': remove'); print.style.setProperty('--pc', ink); print.style.setProperty('--rot', rot + 'deg'); const i = el('img'); i.src = img.src; i.alt = ''; print.append(i); print.onclick = () => set(false); $('prints').append(print); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }
      else { sel[g].delete(icon); print?.remove(); print = null; }
      if (!quiet) apply();
    };
    b.onclick = () => set(!sel[g].has(icon)); resets.push(() => set(false, true));
    $('stamps').append(b);
  }
  // the ruler: animal size 1 to 5
  const ticks = el('div', 'ticks'); for (let i = 1; i <= 5; i++) { const t = el('i'); t.dataset.n = i; ticks.append(t); } $('ruler').append(ticks);
  const paintRuler = () => [...ticks.children].forEach((t, i) => t.classList.toggle('off', i + 1 < F.size[0] || i + 1 > F.size[1]));
  resets.push(((set) => () => set(1, 5))(dual($('ruler'), 1, 5, 1, 5, 'Animal size', (a, b, quiet) => { F.size = [a, b]; paintRuler(); if (!quiet) apply(); })));
  // the gold sack: animal cost
  const [lo, hi] = F.costAll;
  $('sack').innerHTML = '<svg viewBox="0 0 70 80" aria-hidden="true"><path d="M22 22C8 34 4 50 8 64c3 10 14 13 27 13s24-3 27-13c4-14 0-30-14-42z" fill="#C9A227" stroke="#2A1210" stroke-width="2.5"/><path d="M22 22q13 6 26 0l5-12q-5 4-9 0-5 5-9 0-4 5-9 0-4 4-9 0z" fill="#E0B93A" stroke="#2A1210" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 23q15 7 30 0" fill="none" stroke="#7A2A1E" stroke-width="4" stroke-linecap="round"/><circle cx="35" cy="50" r="12" fill="#F2D36B" stroke="#2A1210" stroke-width="2"/><circle cx="35" cy="50" r="7.5" fill="none" stroke="#9A6A1C" stroke-width="1.6"/><path d="M14 44q-3 12 2 22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".3"/></svg>';
  const rail = el('div', 'rail'), out = el('output'); $('sack').append(rail, out);
  resets.push(((set) => () => set(lo, hi))(dual(rail, lo, hi, lo, hi, 'Animal cost', (a, b, quiet) => { F.cost = [a, b]; out.textContent = a + ' – ' + b; if (!quiet) apply(); })));
  out.textContent = lo + ' – ' + hi;
  // the wax seal: only the sponsors that are people
  const seal = $('seal'); const setSeal = (on, quiet) => { F.people = on; seal.setAttribute('aria-pressed', String(on)); if (!quiet) apply(); };
  seal.onclick = () => setSeal(!F.people); resets.push(() => setSeal(false, true));
  $('wipe').onclick = () => { resets.forEach((f) => f()); apply(); };
  // pulling the drawer
  const d = $('drawer'), pull = $('pull'), tray = $('tray');
  const open = (on) => { d.classList.toggle('open', on); pull.setAttribute('aria-expanded', String(on)); pull.setAttribute('aria-label', on ? 'Close the filter drawer' : 'Open the filter drawer'); tray.inert = !on; };
  pull.onclick = () => open(!d.classList.contains('open'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.classList.contains('open') && !$('big').open) { open(false); pull.focus(); } });
  document.addEventListener('pointerdown', (e) => { if (d.classList.contains('open') && !d.contains(e.target)) open(false); });
}

/* ---------- the rest ---------- */
function build(d) {
  const order = Object.fromEntries(TYPES.map(([t], i) => [t, i]));
  cards = d.cards.map((c, i) => ({ ...c, view: 'base', n: i })).sort((a, b) => order[a.type] - order[b.type] || a.n - b.n);
  const prices = cards.filter((c) => c.price != null).map((c) => c.price); F.costAll = [Math.min(...prices), Math.max(...prices)]; F.cost = [...F.costAll];
  for (const [type, name, col] of TYPES) {
    const b = el('button'); b.type = 'button'; b.dataset.type = type; b.style.setProperty('--c', col); b.append(el('span', '', name));
    b.onclick = () => { const i = shown.findIndex((c) => c.type === type); if (i >= 0) go(Math.floor(i / (per * sides))); };
    $('marks').append(b);
  }
  buildDrawer(); apply();
}
$('prev').onclick = () => go(spread - 1); $('next').onclick = () => go(spread + 1);
document.addEventListener('keydown', (e) => {
  if ($('big').open || e.target.matches('input')) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(spread + 1); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(spread - 1); }
  else if (e.key === 'Home') go(0); else if (e.key === 'End') go(spreads() - 1);
});
$('book').addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > 20) go(spread + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
const glass = $('glass'), search = $('search');
const openSearch = (on) => { search.hidden = !on; glass.setAttribute('aria-expanded', String(on)); if (on) $('text').focus(); };
glass.onclick = () => openSearch(search.hidden);
$('text').addEventListener('input', () => apply());
$('text').addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('text').value) { $('text').value = ''; apply(); } else { openSearch(false); glass.focus(); } } });
$('bigclose').onclick = () => $('big').close();
$('big').addEventListener('click', (e) => { if (e.target === $('big')) $('big').close(); });
let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const first = spread * per * sides; sides = measure(); spread = Math.floor(first / (per * sides)); draw(); }, 120); });
fetch('/library_data.json').then((r) => r.json()).then(build).catch(() => { $('pr').querySelector('.cards').append(el('p', 'none', 'The cards could not be loaded.')); });
