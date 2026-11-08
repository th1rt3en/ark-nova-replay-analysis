// [module] Search bar of the Log: finds text in the lines on show (never in the moves still ahead), highlights the hits, steps through them.
// The bar and the list share one box (`#logBox`, built here); the funnel button is where the filter bar will open (not built yet, `FILTERS` below counts the active filters).
import { $, el } from './util.js';
import { S, MINIGAME } from './state.js';

const NS = 'http://www.w3.org/2000/svg';
const icon = (cls, vb, d) => {
  const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  s.setAttribute('viewBox', vb); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true');
  p.setAttribute('d', d); s.append(p);
  return s;
};
const MAG = () => { const s = icon('ls-mag', '0 0 24 24', 'M15 15l6 6'); const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 10); c.setAttribute('cy', 10); c.setAttribute('r', 6.5); s.prepend(c); return s; };

export const FILTERS = { active: 0 };                              // the number the funnel shows: how many of Players / Actions are narrowed (log-filter.js sets it)
let q = '', cur = null, input, count, clear, up, down, fun, funCount;     // `cur`: the line (li) of the current hit

const lines = () => [...$('moves').children];
const shown = (li) => !li.hidden && li.style.display !== 'none' && !li.classList.contains('fout');

function unmark() {
  for (const m of $('moves').querySelectorAll('mark.hit')) { const p = m.parentNode; m.replaceWith(document.createTextNode(m.textContent)); p.normalize(); }
}
function mark(root, needle) {                                      // wrap every hit inside the text nodes of one line
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const t = n.textContent, low = t.toLowerCase();
    let at = low.indexOf(needle); if (at < 0) continue;
    const frag = document.createDocumentFragment(); let last = 0;
    for (; at >= 0; at = low.indexOf(needle, last)) {
      frag.append(document.createTextNode(t.slice(last, at)));
      frag.append(el('mark', 'hit', t.slice(at, at + needle.length)));
      last = at + needle.length;
    }
    frag.append(document.createTextNode(t.slice(last)));
    n.replaceWith(frag);
  }
}

/** Search again over the lines on show (called after every render and every keystroke). `go`: scroll to the current hit. */
export function refreshLogSearch(go) {
  if (!input) return;
  unmark();
  const needle = q.trim().toLowerCase();
  const hits = needle ? lines().filter((li) => shown(li) && (li.children[1] || li).textContent.toLowerCase().includes(needle)) : [];
  for (const li of hits) mark(li.children[1] || li, needle);
  if (!hits.includes(cur)) cur = hits.length ? hits[hits.length - 1] : null;      // (the hit nearest the move on show)
  lines().forEach((li) => li.classList.toggle('hitline', li === cur));
  cur?.querySelector('mark.hit')?.classList.add('cur');
  const n = hits.indexOf(cur) + 1;
  count.textContent = needle ? (hits.length ? n + '/' + hits.length : '0/0') : '';
  count.classList.toggle('none', !!needle && !hits.length);
  up.disabled = down.disabled = hits.length < 2;
  $('logBox').classList.toggle('searching', !!hits.length);                  // (the arrows show only while there is a hit)
  fun.title = FILTERS.active ? FILTERS.active + ' filter' + (FILTERS.active > 1 ? 's' : '') + ' on' : 'Filters';
  funCount.textContent = FILTERS.active || ''; funCount.hidden = !FILTERS.active;
  fun.classList.toggle('on', !!FILTERS.active);
  if (go && cur) {
    const list = $('moves');
    list.scrollTop = cur.offsetTop - (list.clientHeight - cur.offsetHeight) / 2;
  }
  refreshLogSearch.hits = hits;
}
function step(d) {
  const hits = refreshLogSearch.hits || [];
  if (hits.length < 2) return;
  cur = hits[(hits.indexOf(cur) + d + hits.length) % hits.length];
  refreshLogSearch(true);
}

export function setupLogSearch() {
  const list = $('moves');
  if (MINIGAME || !list || $('logBox')) return;
  const box = el('div', 'logbox'); box.id = 'logBox';
  const bar = el('div', 'logsearch');
  const row = el('div', 'ls-row');
  input = el('input', 'ls-q'); input.type = 'text'; input.id = 'logQuery'; input.placeholder = 'Search the log';
  input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', 'Search the log'); input.enterKeyHint = 'search';
  clear = el('button', 'ls-btn ls-clear'); clear.type = 'button'; clear.title = 'Clear the search'; clear.setAttribute('aria-label', 'Clear the search'); clear.hidden = true;
  clear.append(icon('ls-chev', '0 0 16 16', 'M4 4l8 8M12 4l-8 8'));
  count = el('span', 'ls-cnt');
  const nav = el('span', 'ls-nav');
  up = el('button', 'ls-btn'); up.type = 'button'; up.title = 'Previous hit (Shift+Enter)'; up.setAttribute('aria-label', 'Previous hit');
  up.append(icon('ls-chev', '0 0 16 16', 'M3 10l5-5 5 5'));
  down = el('button', 'ls-btn'); down.type = 'button'; down.title = 'Next hit (Enter)'; down.setAttribute('aria-label', 'Next hit');
  down.append(icon('ls-chev', '0 0 16 16', 'M3 6l5 5 5-5'));
  nav.append(up, down);
  const zone = el('span', 'ls-grp'); zone.append(count, nav);                      // (the count and the arrows are one control, set apart from the X)
  fun = el('button', 'ls-fun'); fun.type = 'button'; fun.title = 'Filters'; fun.setAttribute('aria-label', 'Filters');
  fun.append(icon('ls-funnel', '0 0 24 24', 'M3 6h18M6 12h12M10 18h4'));
  funCount = el('b', 'ls-fk'); funCount.hidden = true; fun.append(funCount);
  row.append(MAG(), input, clear, zone, el('i', 'ls-sep'), fun);
  bar.append(row);
  list.replaceWith(box); box.append(bar, list);
  const reset = () => { input.value = ''; q = ''; cur = null; clear.hidden = true; refreshLogSearch(); };
  clear.onclick = () => { reset(); input.focus(); };
  input.oninput = () => { q = input.value; cur = null; clear.hidden = !input.value; refreshLogSearch(true); };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { if (input.value) reset(); else input.blur(); e.stopPropagation(); }
  };
  up.onclick = () => step(-1);
  down.onclick = () => step(1);
}
