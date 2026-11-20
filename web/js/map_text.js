// [module] The text of a map's ability (the tooltip of the map badge in the viewer and the legend of the map library). The texts live in src/ark_nova/replay/map_texts.py
// (`description` of the map view, `ability` of web/wall_maps/index.json); an icon is written between < >: <APPEAL:2>, <REPUTATION:1>, <CONSERVATION:1>, <MONEY:4>, <CLEVER>, <KIOSK-PAVILION>, <OBSERVATION-TOWER>, <GATE>, <PETTING>, <T1-BONUS> (map T1's top-left bonus space: discard a card for +1 strength), <HOLLYWOOD>, <NEG-STRENGTH:n> (the -n action strength), <RESTAURANT>, <INSTITUTE>, <HARBOR>, <MONEY-SMALL:n> (a smaller coin inside a sentence),
// <RESCUE> (map 10's digging hex), <STORE> (map 11's hex), <BINDER> (map 12's hex), <STRENGTH:3> (the action strength icon). Self-contained: it brings its own style and
// needs no other module, so both pages can use it.
const HD = '/icons_hd/', V = '?v=hd20261118o';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const img = (file, cls = '') => `<img class="mti ${cls}" src="${HD}${file}${V}" alt="" decoding="sync">`;
const num = (n, cls) => `<b class="mtn ${cls}">${esc(n)}</b>`;
const SVG_BINDER = '<svg class="mti mtbinder" viewBox="0 0 82 76" aria-hidden="true"><rect width="82" height="76" rx="17" fill="#353233"/><rect x="5" y="4.5" width="72" height="67" rx="12" fill="#eed643"/>'
  + '<rect x="10" y="8" width="63" height="61" rx="2" fill="#1c1a1c"/><path fill="#fff" d="M10 13.5h6.6v7H10zM10 27.5h6.6v7H10zM10 40.9h6.6v7H10zM10 54.5h6.6v7H10z"/></svg>';
const SVG_STRENGTH = '<svg class="mti mtstr" viewBox="0 0 118 118" aria-hidden="true"><rect width="118" height="118" fill="#211e21"/><path fill="#fff" d="M0 13.13h13.15v13.2H0zM0 39.29h13.15v13.2H0zM0 65.58h13.15v13.2H0zM0 91.74h13.15v13.2H0z"/></svg>';
// The bonus icons of map 9 (APPEAL, REPUTATION, MONEY, CLEVER, KIOSK-PAVILION) are drawn plain, without the yellow bonus pentagon: the kiosk / pavilion is BGA's pair of hexes
// with the slash (one free building, no 3x), cut from its bonus tile.
const ICONS = {
  APPEAL: (n) => `<span class="mtw">${img('appeal.webp')}${n ? num(n, 'dk ap') : ''}</span>`,
  CONSERVATION: (n) => `<span class="mtw">${img('conservation.webp')}${n ? num(n, 'dk sh') : ''}</span>`,
  'MONEY-SMALL': (n) => `<span class="mtw sm">${img('money.webp')}${n ? num(n, 'lt mo') : ''}</span>`,
  REPUTATION: (n) => `<span class="mtw">${img('reputation.webp')}${n ? num(n, 'lt rp') : ''}</span>`,
  MONEY: (n) => `<span class="mtw">${img('money.webp')}${n ? num(n, 'lt mo') : ''}</span>`,
  CLEVER: () => `<span class="mtw">${img('clever.webp')}</span>`,
  'KIOSK-PAVILION': () => `<span class="mtw kp">${img('kiosk-pavilion-pair.webp')}</span>`,
  'OBSERVATION-TOWER': () => `<span class="mtw tw">${img('observation-tower.webp')}</span>`,
  HARBOR: () => `<span class="mtw hb">${img('commercial-harbor.webp')}</span>`,
  RESTAURANT: () => `<span class="mtw rs">${img('park-restaurant.webp')}</span>`,
  INSTITUTE: () => `<span class="mtw ins">${img('research-institute.webp')}</span>`,
  HOLLYWOOD: () => `<span class="mtw hw">${img('hollywood-h.webp')}</span>`,
  'NEG-STRENGTH': (n) => `<span class="mtw ng">${SVG_STRENGTH}${num('-' + (n || 1), 'lt str neg')}</span>`,
  PETTING: () => `<span class="mtw pz"><img class="mti" src="/badges/Pet.webp${V}" alt="" decoding="sync"></span>`,
  'T1-BONUS': () => `<span class="mtw t1"><img class="mti" src="/assets/t1_strength_icon.svg${V}" alt="" decoding="sync"></span>`,
  GATE: () => `<span class="mtw gt">${img('outdoor-gate.webp')}</span>`,
  RESCUE: () => `<span class="mtw">${img('rescue.webp')}</span>`,
  STORE: () => `<span class="mtw">${img('pentagon.webp')}${img('store.webp', 'mtin')}</span>`,
  BINDER: () => `<span class="mtw">${SVG_BINDER}</span>`,
  STRENGTH: (n) => `<span class="mtw ng">${SVG_STRENGTH}${n ? num(n, 'lt str') : ''}</span>`,
};
let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `.mtw{display:inline-block;position:relative;height:1.55em;vertical-align:-.42em;margin:0 .08em;line-height:1}
.mtw .mti{height:100%;width:auto;display:block}.mtw .mti.mtin{position:absolute;left:50%;top:54%;height:60%;transform:translate(-50%,-50%)}
.mtw .mtbinder{height:100%;width:auto}.mtw .mtstr{height:100%;width:auto;border-radius:2px}
.mtn{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:400 1.05em/1 'Park Num',system-ui,sans-serif;pointer-events:none}
.mtn:not(.str){top:.17em}.mtw.kp{height:1.8em;vertical-align:-.55em}.mtw.tw{height:1.7em;vertical-align:-.5em}.mtw.gt{height:1.05em;vertical-align:-.2em}.mtw.rs{height:1.05em;vertical-align:-.16em}.mtw.ins{height:1.7em;vertical-align:-.4em}.mtw.hw{height:1.25em;vertical-align:-.28em}.mtw.t1{height:1.7em;vertical-align:-.5em}.mtw.pz{height:1.25em;vertical-align:-.28em}.mtw.pz img{border-radius:50%;box-sizing:border-box;border:.09em solid #211e21;background:#fffaff}.mtw.ng{height:1.25em;vertical-align:-.3em}.mtn.neg{padding-left:.16em;font-size:.72em;letter-spacing:-.04em}.mtw.hb{height:1.5em;vertical-align:-.36em;margin-right:-.45em}.mtw.sm{font-size:.74em;vertical-align:-.36em}
.mtn.ap{transform:translateY(-.03em)}.mtn.rp{transform:translateY(-.07em)}.mtn.mo{transform:translateY(-.055em)}.mtn.sh{top:.075em;left:-.035em;text-shadow:none}.mtn.lt{color:#fff;text-shadow:0 0 2px #000,0 0 2px #000}.mtn.dk{color:#1a1a1a}.mtn.str{font-size:.95em;text-shadow:none}.mtw.ng .mtn.str:not(.neg){font-size:.77em}`;
  document.head.append(s);
}
// The HTML of a text: the words escaped, the <ICON[:n]> marks as icons (an unknown mark stays as text).
export function mapTextHtml(text) {
  style();
  return String(text).split(/(<[A-Z][A-Z0-9-]*(?::\d+)?>)/).map((part) => {
    const m = /^<([A-Z][A-Z0-9-]*)(?::(\d+))?>$/.exec(part);
    return m && ICONS[m[1]] ? ICONS[m[1]](m[2]) : esc(part);
  }).join('');
}
