// Geometry is captured while the Control pane is measurable, including on the Log/Chat tab.
import { actionChanges } from './action-motion-plan.js';

function withControlGeometry(read) {
  const pane = document.getElementById('paneControl');
  if (!pane?.hidden) return read();
  const others = ['paneLog', 'paneChat'].map((id) => document.getElementById(id)).filter((n) => n && !n.hidden);
  const visibility = pane.style.visibility;
  try {
    pane.style.visibility = 'hidden'; others.forEach((n) => { n.hidden = true; }); pane.hidden = false;
    return read();
  } finally {
    pane.hidden = true; pane.style.visibility = visibility; others.forEach((n) => { n.hidden = false; });
  }
}
const STYLE = ['display','position','width','height','box-sizing','padding','margin','border-top','border-right','border-bottom','border-left','border-radius','background','box-shadow','color','font','line-height','text-align','object-fit','object-position','overflow','left','right','top','bottom','z-index','transform','transform-origin','filter','opacity','align-items','justify-content','vertical-align','fill','stroke','stroke-width','paint-order','-webkit-text-stroke'];
function frozen(node) {
  const copy = node.cloneNode(true), source = [node, ...node.querySelectorAll('*')], dest = [copy, ...copy.querySelectorAll('*')];
  source.forEach((e, i) => {
    const c = getComputedStyle(e), d = dest[i];
    for (const name of STYLE) d.style.setProperty(name, c.getPropertyValue(name));
    d.removeAttribute('id'); d.style.visibility = 'visible'; d.style.animation = 'none'; d.style.transition = 'none'; d.style.pointerEvents = 'none';
  });
  Object.assign(copy.style, { position: 'absolute', left: '0', top: '0', right: 'auto', bottom: 'auto', margin: '0', transform: 'none', transformOrigin: '0 0' });
  return copy;
}
function shot(node) {
  const r = node.getBoundingClientRect();
  return { node, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, zoom: r.width / (node.offsetWidth || 1), copy: frozen(node) };
}
function snapshots(changes) {
  return withControlGeometry(() => [...document.querySelectorAll('#side [data-action-view], #zoos [data-action-view]')].flatMap((node) => {
    if (!changes.some((c) => c.seat === Number(node.dataset.actionSeat) && c.type === node.dataset.actionType)) return [];
    if (!node.getBoundingClientRect().width) return [];
    return [{ ...shot(node), seat: Number(node.dataset.actionSeat), type: node.dataset.actionType, view: node.dataset.actionView,
      tokens: [...node.querySelectorAll('[data-action-token]')].map((t) => ({ ...shot(t), type: t.dataset.actionToken, index: Number(t.dataset.tokenIndex) })),
    }];
  }));
}
export function captureActionMotion(before, after) {
  const changes = actionChanges(before, after);
  return changes.length ? { changes, shots: snapshots(changes) } : null;
}
const ease = (t) => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
function attach(parent, s, copy = s.copy.cloneNode(true)) {
  copy.style.transform = 'scale(' + s.zoom + ')'; parent.append(copy); return copy;
}
function rectStyle(s) { return { left: s.x - s.w / 2 + 'px', top: s.y - s.h / 2 + 'px', width: s.w + 'px', height: s.h + 'px' }; }
export function runActionMotion(capture, api) {
  if (!capture) return;
  const current = snapshots(capture.changes), deck = api.deckPoint(), sc = api.scale();
  for (const change of capture.changes) for (const to of current.filter((s) => s.seat === change.seat && s.type === change.type)) {
    const from = capture.shots.find((s) => s.seat === to.seat && s.type === to.type && s.view === to.view);
    if (!from) continue;
    const moving = change.from !== change.to, flipping = change.upgraded, sidebar = to.view === 'sidebar', pending = [];
    let shell = null, faces = [];
    if (moving || flipping) {
      shell = api.element('cm-action-shell', rectStyle(to)); shell.dataset.actionMotion = to.view; shell.dataset.actionSeat = to.seat; shell.dataset.actionType = to.type;
      api.hide(to.node);
      const rotor = api.element('cm-action-rotor', {}, shell);
      const face = api.element('cm-action-face', {}, rotor), front = to.copy.cloneNode(true);
      if (flipping) {
        if (sidebar) for (const edge of ['Top','Right','Bottom','Left']) front.style['border' + edge + 'Color'] = from.copy.style['border' + edge + 'Color'];
        const oldArt = from.copy.querySelector('img:not(.actoken)'), art = front.querySelector('img:not(.actoken)');
        if (oldArt && art) art.src = oldArt.src;
        const oldVariant = from.copy.querySelector('.variant'), variant = front.querySelector('.variant');
        if (oldVariant && variant) variant.src = oldVariant.src;
        const back = api.element('cm-action-face cm-action-back', {}, rotor);
        attach(back, to); faces.push(back);
      }
      attach(face, to, front); faces.push(face);
      if (sidebar) for (const side of faces) for (const added of change.added) side.querySelector('[data-token-index="' + added.index + '"]')?.remove();
      if (moving) {
        const frames = Array.from({ length: 41 }, (_, i) => {
          const t = i / 40, u = ease(t);
          return { offset: t, transform: `translate(${(from.x - to.x) * (1-u)}px,${(from.y - to.y) * (1-u)}px) scale(${1+(from.w/to.w-1)*(1-u)},${1+(from.h/to.h-1)*(1-u)})` };
        });
        pending.push(api.animate(shell, frames, 480, 0, 'linear'));
      }
      if (flipping) {
        const frames = Array.from({ length: 41 }, (_, i) => ({ offset: i / 40, transform: `rotateY(${-180 * ease(i / 40)}deg)` }));
        pending.push(api.animate(rotor, frames, 650, 0, 'linear'));
      }
    }
    // Only sidebar badges fly. Full-card badges already reflect the new state in the real card/ghost.
    let departureTime = 0;
    if (sidebar) for (const [add, list] of [[true, change.added], [false, change.removed]]) for (const token of list) {
      const s = (add ? to.tokens : from.tokens).find((t) => t.index === token.index && t.type === token.type);
      if (!s) continue;
      if (add) api.hide(s.node);
      const start = add ? deck : s, end = add ? s : deck;
      const e = api.element('cm-action-shell cm-action-token', { ...rectStyle({ ...s, x: start.x, y: start.y }), perspective: 'none' });
      e.dataset.actionTokenFlight = token.type; e.dataset.actionSeat = to.seat; e.dataset.direction = add ? 'add' : 'remove'; attach(e, s);
      const dx = end.x-start.x, dy = end.y-start.y, ms = Math.min(1500, Math.max(650, 650*Math.hypot(dx,dy)/sc/850));
      if (!add) departureTime = Math.max(departureTime, ms);
      const frames = Array.from({ length:41 }, (_,i) => { const t=i/40,u=ease(t); return {offset:t,transform:`translate(${dx*u}px,${dy*u}px)`,opacity:add?Math.min(1,t/.1):Math.min(1,(1-t)/.1)}; });
      const a = api.animate(e, frames, ms, 0, 'linear'); pending.push(a);
      api.finish(a, () => { if (add) api.show(s.node); e.remove(); });
    }
    // Close a sidebar badge gap after the departing token has left; preserve identities/duplicates.
    if (sidebar && change.removed.length) for (const kept of change.kept) {
      const a = from.tokens.find((t) => t.index===kept.from), b=to.tokens.find((t) => t.index===kept.to);
      if (!a || !b || kept.from===kept.to) continue;
      const dx=(a.x-from.x)-(b.x-to.x), dy=(a.y-from.y)-(b.y-to.y);
      const nodes = shell ? faces.map((f) => f.querySelector('[data-token-index="'+kept.to+'"]')).filter(Boolean) : [b.node];
      for (const node of nodes) {
        const z=shell?to.zoom:b.zoom;
        const animation=api.animate(node,[{transform:`translate(${dx/z}px,${dy/z}px)`},{transform:'none'}],220,departureTime,'ease-in-out');pending.push(animation);
        api.finish(animation,()=>animation.cancel());
      }
    }
    if (shell) Promise.all(pending.map((a)=>a.finished)).then(()=>{api.show(to.node);shell.remove();},()=>{});
  }
}
