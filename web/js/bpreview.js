// [module] Placement preview: a right click on a sponsor building card in a hand puts the building (half see-through) on that player's zoo to try where it fits; a right click on a zoo map
// opens a picker with the enclosures of the Build action (1-5 spaces, aviary, reptile house, petting zoo, the two aquariums in Marine Worlds) and previews the chosen one the same way. Nothing is placed.
// The legal anchors / turns come from POST /api/preview/placements (replay/preview.py: the rules of the card when it is played), the drawing is in board.js (`previewLayer` of zooBoard).
// State: `S.preview` = { seat, card (a card key, or null for an enclosure), name, step, type, shape, options: Set('x,y,k'), x, y (the pinned anchor, null = the building follows the cursor), hx, hy (the hex under the cursor), rot }.
// Setting "Building preview" (Cards tab, `S.previewBuilding`): without it the right click keeps the browser's menu. The preview ends with a step change, Esc, the setting, or a right click
// on the card again / on the map; a right click on another building card of a hand shows that one instead.
import { MINIGAME, S } from './state.js';
import { hides } from './pov.js';
import { PREVIEW_CARDS, cardName } from './cards.js';
import { el } from './util.js';
import { render } from './main.js';

let ticket = 0;

const redraw = () => { S.lastBoard = null; render(); };
export const previewable = (seat, key) => S.previewBuilding && !MINIGAME && !!S.replay && PREVIEW_CARDS.has(key) && !hides(seat);

export function endPreview() {
  ticket++;
  closeMenu();
  if (!S.preview) return;
  S.preview = null;
  redraw();
}

const ENCLOSURES = [['size-1', '1-size'], ['size-2', '2-size'], ['size-3', '3-size'], ['size-4', '4-size'], ['size-5', '5-size'],
  ['large-bird-aviary', 'Aviary'], ['reptile-house', 'Reptile house'], ['petting-zoo', 'Petting zoo'], ['small-aquarium', 'Small aquarium'], ['large-aquarium', 'Large aquarium']];
const AQUARIUMS = ['small-aquarium', 'large-aquarium'];

async function begin(seat, extra, name) {
  const step = S.replay.steps[S.step], p = step.state.players[seat], mine = ++ticket;
  S.preview = { seat, card: null, enclosure: null, name, step: S.step, type: null, shape: null, options: null, x: null, y: null, hx: null, hy: null, rot: 0, ...extra };
  redraw();
  let res;
  try {
    res = await fetch('/api/preview/placements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(extra.card ? { card: extra.card } : { enclosure: extra.enclosure }), map_id: p.map_id, marine_worlds: !!S.replay.marine_worlds,
        buildings: p.buildings.map((b) => ({ type: b.type, x: b.x, y: b.y, rotation: b.rotation })),
        build_level: Math.max(1, ...p.action_cards.filter((a) => a.type === 'build').map((a) => a.level)),
        overbuild: p.sponsors.includes('S219'),
        terrain_build: p.action_cards.some((a) => a.type === 'build' && a.variant === 4),                  // (Terrain Build: the enclosures may cover one rock / water space)
      }),
    });
  } catch (e) { res = null; }
  if (mine !== ticket || !S.preview) return;                                 // (another preview was chosen, or it ended, while the answer was on its way)
  let out = null;
  if (res && res.ok) { try { out = await res.json(); } catch (e) { out = null; } }
  if (mine !== ticket || !S.preview) return;
  if (!out) {                                                                // (shown, not swallowed: an old server without the route answers 404)
    S.preview.error = !res ? 'no answer from the server' : res.status === 404 || res.status === 405 ? 'the server has no preview route yet (HTTP ' + res.status + '): restart / deploy the backend' : 'the server refused it (HTTP ' + res.status + ')';
    redraw(); return;
  }
  Object.assign(S.preview, { type: out.type, shape: out.shape, options: new Set(out.options.map((o) => o.join(','))) });
  redraw();
}

export async function togglePreview(seat, key) {
  if (!previewable(seat, key)) return;
  if (S.preview && S.preview.seat === seat && S.preview.card === key) { endPreview(); return; }
  await begin(seat, { card: key }, cardName(key));
}

// ---- the picker of the enclosures (a right click on a map) --------------------------------------------------------------------------------------------------------------------------
let menu = null;
export function closeMenu() { if (menu) { menu.remove(); menu = null; } }
export function openMenu(seat, clientX, clientY) {
  if (!S.previewBuilding || MINIGAME || !S.replay) return;
  closeMenu();
  const mw = !!S.replay.marine_worlds;
  menu = el('div', 'bpmenu');
  menu.setAttribute('role', 'menu');
  menu.append(el('b', 'bpmtitle', 'Preview an enclosure'));
  const grid = el('div', 'bpmgrid');
  for (const [type, label] of ENCLOSURES) {
    if (AQUARIUMS.includes(type) && !mw) continue;                          // (the aquariums belong to Marine Worlds)
    const b = el('button', 'bpmitem'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.title = label;
    const sp = S.sprites[/^size-\d$/.test(type) ? type + '_empty' : type];
    if (sp) { const im = el('img'); im.src = '/enclosures/' + sp.image; im.alt = ''; im.draggable = false; b.append(im); }
    b.append(el('span', '', label));
    b.onclick = () => { closeMenu(); begin(seat, { enclosure: type }, label); };
    grid.append(b);
  }
  menu.append(grid);
  menu.addEventListener('contextmenu', (e) => { e.preventDefault(); closeMenu(); });
  document.body.append(menu);
  const sc = S.scaled && S.scale ? S.scale : 1;                              // (the page is zoomed: fixed positions are in zoomed pixels)
  const r = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(clientX, window.innerWidth - r.width - 8)), top = Math.max(8, Math.min(clientY, window.innerHeight - r.height - 8));
  menu.style.left = (left / sc) + 'px'; menu.style.top = (top / sc) + 'px';
  menu.querySelector('button').focus({ preventScroll: true });
}
document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
document.addEventListener('wheel', () => closeMenu(), { passive: true });
document.addEventListener('bpreview-menu', (e) => openMenu(e.detail.seat, e.detail.x, e.detail.y));

export function turnPreview(d) {
  if (!S.preview || !S.preview.shape) return;
  S.preview.rot = ((S.preview.rot + d) % 6 + 6) % 6;
  redraw();
}

document.addEventListener('bpreview-toggle', (e) => togglePreview(e.detail.seat, e.detail.key));
document.addEventListener('bpreview', () => { closeMenu(); if (!S.previewBuilding) endPreview(); else redraw(); });         // (the setting was switched)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menu) { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
  if (!S.preview || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  if (typing) return;
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); turnPreview(e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape' && !document.querySelector('.modal:not([hidden])')) { e.preventDefault(); endPreview(); }
});
