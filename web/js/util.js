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
// A player's colour: BGA's own colour of that player from the log (`players[].color`). BGA's white (all channels >= 235) is shown as a mid grey (WHITE_AS) instead: the white
// font of the info box header and the pale paper of the panels would swallow a white player. `seatRawColor` is the colour as BGA has it (the worker picture is chosen with it).
const WHITE_AS = '#767c82';          // (white font on it: contrast 4.4:1; clearly lighter and cooler than BGA's own dark grey 5a5856)
export const seatRawColor = (seat) => (S.replay.players[seat] && S.replay.players[seat].color) || ['#c0392b', '#2980b9'][seat];
export const seatColor = (seat) => {
  const c = seatRawColor(seat), m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || '');
  return m && Math.min(...[1, 2, 3].map((i) => parseInt(m[i], 16))) >= 235 ? WHITE_AS : c;
};
// A player's colour as TEXT on the pale paper (names in the move bar, the action choices, the hand tray): a light colour (yellow, grey) is darkened step by step until it
// has a contrast of 4.5:1 with the paper, a dark one stays as it is.
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => { const m = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16))); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
const PAPER = '#F8EDCB';
export const seatText = (seat) => {
  const c = seatColor(seat);
  if (!/^#[0-9a-f]{6}$/i.test(c || '')) return c;
  for (let t = 0; t <= 0.9; t += 0.05) {
    const m = mix(c, '#000000', t);
    if ((luminance(PAPER) + 0.05) / (luminance(m) + 0.05) >= 4.5) return m;
  }
  return '#000000';
};
export const mix = (hex, other, t) => {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(other.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
