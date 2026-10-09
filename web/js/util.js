// [module] Tiny DOM / SVG helpers ($, el, svg, title, section) and colour helpers used by every module.
import { S } from './state.js';

export const $ = (id) => document.getElementById(id);
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// ---- card helpers ---------------------------------------------------------------------------------------------
export const title = (s) => String(s).toLowerCase().replace(/(^|[\s-])(\w)/g, (m, a, b) => a + b.toUpperCase());
export const section = (heading, node, cls) => {
  const s = el('div', cls || 'sect');
  s.append(el('h3', '', heading), node);
  return s;
};

// ---- zoo board ------------------------------------------------------------------------------------------------
const SVG = 'http://www.w3.org/2000/svg';
export const svg = (tag, attrs) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  return e;
};

// ---- association board ----------------------------------------------------------------------------------------
// Slot positions in the 2000x591 rendering of web/assets/association_board_*.webp (the PNGs are 3335x986, scaled 0.6).
export const seatColor = (seat) => (S.replay.players[seat] && S.replay.players[seat].color) || ['#c0392b', '#2980b9'][seat];
export const mix = (hex, other, t) => {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(other.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
