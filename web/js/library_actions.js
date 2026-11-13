/* The action cards of the library as a ring binder (library/actions/index.html, css/library_actions.css): one action per spread, the standard card and the four
   special (Marine Worlds) cards of that action in clear pockets, level I on the left sheet and the upgraded side (level II) on the right. The coloured tabs at the
   right edge (or the arrow keys) turn to another action; a card opens large with both of its sides; the action on show is kept in the address (#animals ...). */
const ACTIONS = [
  { id: 'animals', name: 'Animals', icon: 'r3c7', col: '#E07B2E' },          // (the colours of the actions everywhere else: move-hover.js ACTION_COLOR)
  { id: 'association', name: 'Association', icon: 'r3c8', col: '#2F6FB3' },
  { id: 'build', name: 'Build', icon: 'r3c9', col: '#8C6A3C' },
  { id: 'cards', name: 'Cards', icon: 'r3c10', col: '#2E9C86' },
  { id: 'sponsors', name: 'Sponsors', icon: 'r3c12', col: '#C24E7E' },
];
const VARIANTS = [0, 1, 2, 3, 4];            // 0 = the standard card, 1-4 = the special cards
const art = (a, v, l) => `/action_cards/${a}_${v}_${l}.webp`;
const icon = (a) => `/icons/${a.icon}.webp`;
const label = (a, v) => `${a.name}, ${v ? 'special card ' + v : 'standard card'}`;
const stage = document.getElementById('stage'), fitEl = document.getElementById('fit'), tabsEl = document.getElementById('tabs');
const sheets = { 1: document.getElementById('sl'), 2: document.getElementById('sr') };
let cur = Math.max(0, ACTIONS.findIndex((a) => '#' + a.id === location.hash));

/* ---------- the stage is drawn at 1600 x 900 and scaled to the window ---------- */
const W = 1600, H = 900;
function fit() { const s = Math.min((innerWidth - 24) / W, (innerHeight - 56) / H); stage.style.transform = `scale(${Math.max(.2, s)})`; fitEl.style.width = W * s + 'px'; fitEl.style.height = H * s + 'px'; }
addEventListener('resize', fit);

/* ---------- the tabs ---------- */
tabsEl.innerHTML = ACTIONS.map((a, i) => `<button type="button" class="tab" role="tab" id="tab-${a.id}" aria-controls="sl sr" aria-label="${a.name}" style="--c:${a.col}" data-i="${i}"><img src="${icon(a)}" alt=""></button>`).join('');
tabsEl.addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) show(+b.dataset.i); });

/* ---------- the two sheets of a spread ---------- */
function sheet(a, l) {
  return `<header><img class="ico" src="${icon(a)}" alt=""><h2 style="color:${a.col}">${a.name}</h2><span class="lv l${l}">${l === 1 ? 'I' : 'II'}</span></header>`
    + `<div class="pockets">${VARIANTS.map((v) => `<button type="button" class="pocket" data-v="${v}" aria-label="${label(a, v)}, level ${l === 1 ? 'I' : 'II'}"><img src="${art(a.id, v, l)}" alt="" draggable="false"></button>`).join('')}</div>`
    + `<span class="holes" aria-hidden="true"><i></i><i></i><i></i></span>`;
}
/* a change of action turns a sheet over the rings: to a later tab the right sheet turns to the left (its front = the old right sheet, its back = the new left
   one), to an earlier tab the left sheet turns to the right; the sheet beneath shows the new page at once, the other sheet changes when the turn is done */
const TURN_MS = 620;
let leaf = null, leafDone = null;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function finishTurn() { if (leafDone) { clearTimeout(leafDone.t); leafDone(); } }
function show(i, first) {
  finishTurn();
  const from = cur; cur = (i + ACTIONS.length) % ACTIONS.length; const a = ACTIONS[cur];
  tabsEl.querySelectorAll('.tab').forEach((b, k) => { b.classList.toggle('on', k === cur); b.setAttribute('aria-selected', String(k === cur)); b.tabIndex = k === cur ? 0 : -1; });
  if (location.hash !== '#' + a.id) history.replaceState(null, '', '#' + a.id);
  if (first || from === cur || still()) { sheets[1].innerHTML = sheet(a, 1); sheets[2].innerHTML = sheet(a, 2); }
  else {
    const fwd = i > from;                                   // (the arrow keys wrap: the order of the tabs decides the direction)
    const moving = fwd ? 2 : 1, staying = fwd ? 1 : 2;      // the sheet that turns / the one it lands on
    leaf = document.createElement('div'); leaf.className = 'leaf ' + (fwd ? 'fwd' : 'back'); leaf.setAttribute('aria-hidden', 'true');
    leaf.innerHTML = `<div class="sheet face front ${fwd ? 'r' : 'l'}">${sheets[moving].innerHTML}</div><div class="sheet face rear ${fwd ? 'l' : 'r'}">${sheet(a, staying)}</div>`;
    sheets[moving].innerHTML = sheet(a, moving);
    stage.insertBefore(leaf, stage.querySelector('.rings'));
    leafDone = () => { sheets[staying].innerHTML = sheet(a, staying); leaf.remove(); leaf = leafDone = null; };
    leafDone.t = setTimeout(finishTurn, TURN_MS + 40);
  }
  // (warm the other actions' pictures so a tab turns without waiting)
  if (first) setTimeout(() => ACTIONS.forEach((b) => VARIANTS.forEach((v) => { new Image().src = art(b.id, v, 1); new Image().src = art(b.id, v, 2); })), 600);
}
addEventListener('hashchange', () => { const k = ACTIONS.findIndex((a) => '#' + a.id === location.hash); if (k >= 0 && k !== cur) show(k); });

/* ---------- a card large: both of its sides; arrows go through the five cards of the action ---------- */
const big = document.getElementById('big'), pair = document.getElementById('pair');
let bigV = 0;
function open(v) {
  bigV = (v + VARIANTS.length) % VARIANTS.length; const a = ACTIONS[cur];
  pair.innerHTML = [1, 2].map((l) => `<figure><img src="${art(a.id, bigV, l)}" alt="${label(a, bigV)}, level ${l === 1 ? 'I' : 'II'}"></figure>`).join('');
  if (!big.open) big.showModal();
}
stage.addEventListener('click', (e) => { const p = e.target.closest('.pocket'); if (p) open(+p.dataset.v); });
document.getElementById('bigclose').addEventListener('click', () => big.close());
document.getElementById('bigprev').addEventListener('click', () => open(bigV - 1));
document.getElementById('bignext').addEventListener('click', () => open(bigV + 1));
big.addEventListener('click', (e) => { if (e.target === big) big.close(); });

/* ---------- keys: left / right (or up / down) turn to the next action; in the large view they go through the cards ---------- */
addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]; if (!d) return;
  e.preventDefault();
  if (big.open) open(bigV + d);
  else { show(cur + d); if (tabsEl.contains(document.activeElement)) tabsEl.querySelector('.tab.on').focus(); }
});

fit(); show(cur, true);
