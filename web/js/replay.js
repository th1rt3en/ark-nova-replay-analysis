// Replay viewer: loads the replay package of a table (players, maps, card catalog, one state per step) and renders one step at a time.
// No animation: every step re-renders the whole board from the state.
(() => {
  const params = new URLSearchParams(location.search);
  const table = params.get('table');
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // Fork mode (fork.html): the same viewer on a position taken from a replay, played on for both seats. The server keeps nothing: every step carries its engine state,
  // every move is posted with the state it applies to.
  const FORK = !!window.FORK_MODE;
  const SANDBOX = !!window.SANDBOX_MODE;                                   // sandbox.html: a game that is set up and edited freely against a bot that passes (fork mode, with the tools of the sandbox)
  let forkInfo = null;
  let forkBusy = false;
  // Placing a building in a fork: { seat, type, extra, x, y, rot } - the piece is chosen in the move panel, a click on a hex of the zoo sets its anchor, the two buttons round
  // the building turn it, green / red tells whether that placement is legal, the check mark places it. null while no building is being placed.
  let placement = null;
  const toAxial = (x, y) => [x, (y - x - 1) / 2];
  const fromAxial = (q, r) => [q, 2 * r + q + 1];
  const rotateAxial = (a, k) => { let [q, r] = a; for (let i = 0; i < ((k % 6) + 6) % 6; i++) [q, r] = [-r, q + r]; return [q, r]; };
  const placementCells = (type, x, y, k) => {
    const [q0, r0] = toAxial(x, y);
    return (replay.shapes[type] || []).map((o) => { const [dq, dr] = rotateAxial(o, k); return fromAxial(q0 + dq, r0 + dr); });
  };
  const cellsKey = (cells) => cells.map((c) => c[0] + ',' + c[1]).sort().join(';');
  // the legal action that puts the piece on exactly these cells (a symmetric piece has several rotations that cover the same cells), or null
  function legalPlacement(p) {
    if (p.x === null) return null;
    const want = cellsKey(placementCells(p.type, p.x, p.y, p.rot));
    for (const a of replay.steps[step].actions || []) {
      if (a.kind !== 'place_building' || a.player !== p.seat || a.args.type !== p.type || !!a.args.extra !== !!p.extra) continue;
      if (cellsKey(placementCells(p.type, a.args.x, a.args.y, a.args.rotation)) === want) return a;
    }
    return null;
  }
  let replay = null;
  let step = 0;

  // ---- point of view: null = everything is visible (god mode), 0 / 1 = what the player of that seat sees ------------------------------------------------------
  // Only the information of the other player is hidden: the cards of the hand and the endgame cards (shown as card backs), what was pouched or stored face down, the draw
  // pile and the endgame deck (counts only), the action card draft choices of the other player, and the words of the move list that name such cards.
  let pov = null;
  try { const v = FORK ? null : localStorage.getItem('pov'); pov = v === '0' ? 0 : v === '1' ? 1 : null; } catch (e) { /* no storage */ }
  const hides = (seat) => pov !== null && seat !== pov;
  const povCache = new Map();
  function povState(st) {
    if (pov === null) return st;
    const key = pov + ':' + (st.__id || (st.__id = Math.random()));
    if (povCache.has(key)) return povCache.get(key);
    const back = (a) => (a || []).map(() => '?');
    const out = {
      ...st, main_deck: [], endgame_deck: [], endgame_discard: [], main_deck_known: 0, hidden_pov: pov,
      players: st.players.map((p, i) => (i === pov ? p : {
        ...p, hand: back(p.hand), endgame_hand: back(p.endgame_hand), initial_offer: back(p.initial_offer), stored: back(p.stored), pouched: back(p.pouched),
        under: Object.fromEntries(Object.entries(p.under || {}).map(([k, v]) => [k, back(v)])),
      })),
    };
    if (st.draft) {
      const hide = (arr) => (arr || []).map((v, i) => (i === pov ? v : []));
      out.draft = { ...st.draft, offers: hide(st.draft.offers), picked: hide(st.draft.picked), kept: hide(st.draft.kept), choice: [null, null] };
    }
    povCache.set(key, out);
    if (povCache.size > 400) povCache.delete(povCache.keys().next().value);
    return out;
  }
  const curState = () => povState(replay.steps[step].state);
  const labelOf = (s) => (pov !== null && s.label_pov && s.label_pov[pov]) || s.label;

  // ---- loading --------------------------------------------------------------------------------------------------
  async function fetchReplay() {
    const url = '/api/tables/' + encodeURIComponent(table) + '/replay';
    let res;
    if (SANDBOX) {                                                           // the game the lobby started
      const raw = sessionStorage.getItem('sandboxGame');
      if (!raw) { location.replace('/sandbox.html'); return null; }
      const game = JSON.parse(raw);
      game.steps.forEach((st, i) => { st.index = i; });
      return game;
    }
    if (FORK) {
      const seed = params.get('seed');
      res = await fetch(url.replace(/\/replay$/, '/fork'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                             body: JSON.stringify({ step: parseInt(params.get('step'), 10), seed: seed ? parseInt(seed, 10) : undefined }) });
    } else if (params.get('source') === 'upload') {
      const text = await LogStore.get(table);
      if (!text) { location.replace('/submit.html?table=' + encodeURIComponent(table)); return null; }
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
    } else {
      res = await fetch(url);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'the replay could not be loaded');
    if (FORK) forkInfo = body.fork;
    return body;
  }

  // ---- card helpers ---------------------------------------------------------------------------------------------
  const title = (s) => String(s).toLowerCase().replace(/(^|[\s-])(\w)/g, (m, a, b) => a + b.toUpperCase());
  const info = (key) => replay.cards[key] || { name: key, type: 'unknown' };
  const cardName = (key) => title(info(key).name);

  function card(key, extraClass) {
    if (key === '?') {                                                     // a card the viewer may not see (the other player's hand in a player's point of view)
      const b = el('div', 'card back' + (extraClass ? ' ' + extraClass : ''));
      b.title = 'Hidden card';
      b.append(el('span', 'backmark', '?'));
      return b;
    }
    const c = info(key);
    const d = el('div', 'card' + (extraClass ? ' ' + extraClass : ''));
    d.title = cardName(key) + ' (' + key + ')';
    if (c.image) {
      const img = el('img');
      img.src = c.image; img.alt = cardName(key); img.loading = 'lazy';
      img.onerror = () => { img.remove(); d.append(textFace(key, c)); };
      d.append(img);
      d.addEventListener('mouseenter', () => showPreview(c.large || c.image));           // the full size card where there is one (sponsors), else the 240 px card
      d.addEventListener('mouseleave', hidePreview);
    } else {
      d.append(textFace(key, c));
    }
    return d;
  }
  let previewTimer = null;
  function showPreview(src) {
    const p = $('preview');
    p.src = src; p.hidden = false;
    clearTimeout(previewTimer);
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) previewTimer = setTimeout(hidePreview, 3000);       // (a touch screen has no mouse leaving the card: the thumbnail goes away by itself)
  }
  function hidePreview() { $('preview').hidden = true; }
  document.addEventListener('DOMContentLoaded', () => { const pv = $('preview'); if (pv) pv.addEventListener('click', hidePreview); });       // (on touch screens a tap closes the preview)
  function textFace(key, c) {
    const t = el('div', 'txt');
    t.append(el('b', '', title(c.name)), el('span', '', key + (c.type && c.type !== 'unknown' ? ' · ' + c.type : '')));
    return t;
  }
  // A card that was not in its zone (hand, endgame cards, animals, sponsors, display, projects...) at the previous render gets a green border that
  // fades like the changed numbers of the player tracker (--flash-duration). A card that left the zone stays where it was as a "ghost" with a red
  // border; card and border fade away in the same time and the ghost is removed. `zoneNew(zone, keys)` returns the test for each card of the zone,
  // with `.gone` = [{key, index}] of the cards that left (index = their place in the zone before).
  let prevZones = {}, curZones = {}, prevZoneData = {}, curZoneData = {};       // (the Data ones keep the objects of the zones that need them to draw a ghost)
  function zoneNew(zone, keys) {
    const prev = prevZones[zone], cur = {}, seen = {}, left = {};
    for (const k of keys) if (k) { cur[k] = (cur[k] || 0) + 1; left[k] = (left[k] || 0) + 1; }
    curZones[zone] = keys.slice();
    const test = (k) => { seen[k] = (seen[k] || 0) + 1; return !!prev && seen[k] > (prev[k] || 0); };
    test.gone = [];
    const count = {};
    for (const k of prev || []) if (k) count[k] = (count[k] || 0) + 1;
    test.isNew = (k) => { seen[k] = (seen[k] || 0) + 1; return !!prev && seen[k] > (count[k] || 0); };
    (prev || []).forEach((k, index) => {
      if (!k) return;
      if (left[k] > 0) left[k]--; else test.gone.push({ key: k, index });
    });
    return test;
  }
  function ghost(key) {
    const g = card(key, 'card-gone');
    g.addEventListener('animationend', () => g.remove());
    return g;
  }
  const cardMarks = new Set();                                             // the hand / endgame cards the viewer highlighted with a click: cleared at every step
  function cardRow(keys, cls, emptyText, zone, dimmed, markable) {
    const row = el('div', 'cards' + (cls ? ' ' + cls : ''));
    if (!keys.length) row.append(el('span', 'empty', emptyText || 'none'));
    const z = zone ? zoneNew(zone, keys) : null;
    const items = keys.map((k, i) => (k ? card(k, (z && z.isNew(k) ? 'card-new' : '') + (dimmed && dimmed(k) ? ' dim' : '')) : el('div', 'card')));
    if (z) for (const g of z.gone) items.splice(Math.min(g.index, items.length), 0, ghost(g.key));
    if (markable) {
      let n = 0;                                                         // (a card that is fading away does not count)
      items.forEach((node) => {
        if (!node || !node.classList || node.classList.contains('card-gone')) return;
        const mark = zone + '#' + (n++);
        if (cardMarks.has(mark)) node.classList.add('marked');
        node.classList.add('markable');
        node.addEventListener('click', () => {
          if (FORK && node.classList.contains('dim') && forkSingleSelect()) return;                      // (a card that cannot be played cannot be selected)
          if (cardMarks.has(mark)) cardMarks.delete(mark);
          else {
            if (FORK && forkSingleSelect()) for (const x of [...cardMarks]) if (/:hand#|^display#/.test(x)) cardMarks.delete(x);        // a card to play: the new choice replaces the old one
            cardMarks.add(mark);
          }
          if (FORK && forkSingleSelect()) for (const n of document.querySelectorAll('.dockpanel .card.markable')) n.classList.remove('marked');
          node.classList.toggle('marked', cardMarks.has(mark));
          if (FORK) refreshBar();
        });
      });
    }
    row.append(...items);
    return row;
  }
  const section = (heading, node, cls) => {
    const s = el('div', cls || 'sect');
    s.append(el('h3', '', heading), node);
    return s;
  };

  // ---- icons (web/icons, cut from BGA's icon sheet by scripts/build_icons.py; ids are row/column on the sheet) ----------------------------
  const ICON_IDS = {
    Africa: 'r1c2', Americas: 'r1c3', Asia: 'r1c4', Australia: 'r1c5', Europe: 'r1c6',
    Bird: 'r2c4', Herbivore: 'r2c5', Predator: 'r2c6', Primate: 'r2c7', Reptile: 'r2c8', SeaAnimal: 'r2c9', Rock: 'r11c11', Water: 'r11c12',
    Pet: 'r4c2', xtoken: 'r3c2',
    // university tiles, by the BGA token type
    'fac-rep-hand': 'r7c15', 'fac-science-rep': 'r8c6', 'fac-science-science': 'r8c8', 'fac-generic': 'r7c14',
    'fac-science-bird': 'r8c1', 'fac-science-herbivore': 'r8c2', 'fac-science-marine': 'r8c3', 'fac-science-predator': 'r8c4', 'fac-science-primate': 'r8c5',
    'fac-science-reptile': 'r8c7',
    pentagon: 'r5c14', flag: 'r6c9',
    // what a placement bonus pentagon shows on top of the yellow base (r5c14); the number is drawn as text
    'bonus:reputation': 'r4c9', 'bonus:money': 'r11c8', 'bonus:xtoken': 'r3c2', 'bonus:take-in-range-or-deck': 'r6c13', 'bonus:Clever': 'r6c6',
    'bonus:bonus-sponsor': 'r7c6', 'bonus:sponsor-person-card': 'r7c6', 'bonus:Digging': 'r9c13', 'bonus:Determination': 'r6c7', 'bonus:cut-down': 'r4c1', 'bonus:bonus-scoring-cards': 'r6c4', 'bonus:Fac': 'r10c2', 'bonus:Partner-Zoo': 'r10c14', 'bonus:Multiplier': 'r6c8',
    'bonus:animal-magnet': 'r10c12', 'bonus:Worker': 'r5c13', 'bonus:Scavenging': 'r4c10', 'bonus:Mark': 'r3c3', 'bonus:Pouch': 'r7c11', 'bonus:kiosk': 'r7c3', 'bonus:upgrade-card': 'r10c5',
    'bonus:continent': 'r9c12', 'bonus:shark-attack': 'r5c1', 'bonus:wave': 'r11c14', 'bonus:store': 'r5c2', 'bonus:conceal': 'r5c5',
  };
  // BGA's names of the icons (scripts/name_icons.py): the placement bonus of each type shows the icon of the same name
  const BONUS_ICON_NAME = {
    reputation: 'reputation', money: 'money', xtoken: 'xtoken-bordered', 'take-in-range-or-deck': 'take-in-range-or-deck', Clever: 'clever', 'bonus-sponsor': 'bonus-sponsor',
    'sponsor-person-card': 'sponsor-person-card', Digging: 'digging', 'Partner-Zoo': 'partner-zoo', Multiplier: 'multiplier', Worker: 'add-worker', 'upgrade-card': 'upgrade-card',
    appeal: 'appeal', conservation: 'conservation', Snapping: 'snapping', 'size-2': 'enclosure-size-2', 'size-3': 'enclosure-size-3',
  };
  function applyIconNames(names) {
    for (const [type, name] of Object.entries(BONUS_ICON_NAME)) if (names[name] && type !== 'Digging') ICON_IDS['bonus:' + type] = names[name];       // (Digging keeps r9c13)
    ICON_IDS.money = names.money; ICON_IDS.appeal = names.appeal; ICON_IDS.conservation = names.conservation; ICON_IDS.reputation = names.reputation; ICON_IDS.xtoken_plain = names.xtoken;
  }
  const SHOW_VALUE = new Set(['money', 'reputation', 'appeal']);     // BGA prints the number on these three only (appeal: 2 on the drawing board); the icon of every other bonus already says what it is
  const iconUrl = (id) => '/icons/' + id + '.webp';
  let iconSizes = {};                             // web/icons/icons.json: id -> [width, height]
  function iconImg(name, height) {
    const img = el('img', 'icon');
    img.src = iconUrl(ICON_IDS[name]); img.alt = name; img.title = name; img.height = height; img.loading = 'lazy';
    return img;
  }

  // ---- zoo board ------------------------------------------------------------------------------------------------
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  };
  // the money icon is a square picture: clip it to a rounded square and outline it in white, like BGA (no square grey corners sticking out of the border)
  let clipCount = 0;
  function moneyTile(root, cx, cy, size) {
    const id = 'mt' + (clipCount += 1), r = size * 0.24;
    const clip = svg('clipPath', { id });
    clip.append(svg('rect', { x: cx - size / 2, y: cy - size / 2, width: size, height: size, rx: r }));
    root.append(clip);
    root.append(svg('image', { href: iconUrl(ICON_IDS['bonus:money']), x: cx - size / 2, y: cy - size / 2, width: size, height: size, 'clip-path': 'url(#' + id + ')' }));
    root.append(svg('rect', { x: cx - size / 2, y: cy - size / 2, width: size, height: size, rx: r, class: 'money-border' }));
  }

  // BGA's zoo map pictures (web/maps, 1122x976): hex (x, y) is centred at (MAP.x0 + x*MAP.dx, MAP.y0 + y*MAP.dy), see scripts/download_bga_maps.py
  const MAP = { x0: 96, y0: 88, dx: 115, dy: 66.5 };
  const SPRITE_SCALE = (MAP.dx / 1.5) / 136;      // the building sprites are drawn with hexes of circumradius 136 px
  const cellCentre = (x, y) => [MAP.x0 + x * MAP.dx, MAP.y0 + y * MAP.dy];
  let sprites = {};                               // web/enclosures/sprites.json: id -> {image, anchor: [x, y] of the anchor hex in the image, size}

  // sprite of a building: standard enclosures have an empty (yellow) and an occupied (green) side
  function spriteOf(b) {
    const occupied = b.animal || (b.animals && b.animals.length);
    const id = /^size-\d$/.test(b.type) ? b.type + (occupied ? '_occupied' : '_empty') : (b.type === 'victory' && replay.marine_worlds ? 'victory_mw' : b.type);
    return sprites[id];
  }

  function zooBoard(map, player, seat) {
    const s = svg('svg', { class: 'board', viewBox: '0 0 1122 976', role: 'img', 'aria-label': 'Zoo map ' + map.name });
    if (map.image) s.append(svg('image', { href: map.image, x: 0, y: 0, width: 1122, height: 976 }));
    const covered = new Set();
    for (const b of player.buildings) for (const c of b.cells) covered.add(c[0] + ',' + c[1]);

    // printed bonuses and upgrade flags that no building covers
    const put = (tag, attrs, text) => {
      const e = svg(tag, attrs);
      if (text !== undefined) e.textContent = text;
      s.append(e);
    };
    const iconBox = (id, cx, cy, h) => {
      const [w0, h0] = iconSizes[id] || [h, h];
      put('image', { href: iconUrl(id), x: cx - (w0 * h / h0) / 2, y: cy - h / 2, width: w0 * h / h0, height: h });
    };
    for (const pb of map.placement_bonuses) {
      if (covered.has(pb.x + ',' + pb.y)) continue;
      const [cx, cy] = cellCentre(pb.x, pb.y);
      const bn = pb.bonus || {};
      const tip = svg('title');
      tip.textContent = bn.type ? bn.type + (bn.value ? ' ' + bn.value : '') : 'bonus';
      const icon = ICON_IDS['bonus:' + bn.type];
      if (bn.type === 'Digging') { iconBox(icon, cx, cy, 80); s.lastChild.append(tip); continue; }       // r9c13 already has its own background
      iconBox(ICON_IDS.pentagon, cx, cy, 80);
      if (bn.type === 'adapt') { iconBox('r10c15', cx - 14, cy + 3, 36); iconBox('r10c16', cx + 15, cy + 3, 36); }      // two endgame card icons side by side
      else if (bn.type === 'money') moneyTile(s, cx, cy + 3, 48);
      else if (bn.type === 'Scavenging' && icon && bn.value > 1) {                 // Scavenging 3: the number to the left of the icon, overlapping it a little
        iconBox(icon, cx + 9, cy + 3, 44);
        put('text', { x: cx - 15, y: cy + 14, class: 'bonus-number', style: 'font-size:34px;stroke-width:7px' }, bn.value);
      }
      else if (icon) iconBox(icon, cx, cy + 3, bn.type === 'wave' ? 21 : 48);       // (the wave is a wide banner)
      if (bn.type === 'appeal' && !icon) put('text', { x: cx, y: cy + 6, class: 'bonus-label' }, '★');      // a bonus nobody has identified yet is just the empty pentagon
      if (SHOW_VALUE.has(bn.type)) put('text', { x: cx, y: cy + (bn.type === 'money' ? 14 : 16), class: 'bonus-number', ...(bn.type === 'money' ? { style: 'font-size:36px;stroke-width:7px' } : {}) }, bn.value);       // (the money number is a little smaller on the map)       // the number sits over the middle of the icon
      s.lastChild.append(tip);
    }
    for (const sh of map.special_hexes) {            // hex that needs the upgraded Build action: red wedge on its upper left, purple "II" shovel badge
      if (sh.kind !== 'upgrade_flag' || covered.has(sh.x + ',' + sh.y)) continue;
      const [cx, cy] = cellCentre(sh.x, sh.y);
      const R = MAP.dx / 1.5, h = R * 0.866;
      put('polygon', { points: [[cx - R * 0.96, cy + 3], [cx - R * 0.5, cy - h * 0.96], [cx + R * 0.38, cy - h * 0.96], [cx - R * 0.1, cy + 3]].map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '),
        class: 'flag-wedge' });
      const br = 30, bx = cx + 3, by = cy - h + br + 2;   // the badge touches the top edge of the hex
      put('circle', { cx: bx, cy: by, r: br, class: 'flag-badge' });
      iconBox('r3c9', bx, by - 8, 29);               // the shovel (Build action) on white
      put('text', { x: bx, y: by + 20, class: 'flag-label' }, 'II');
    }

    // map 9: a slot with the continent icon on the edge of the map holds the player's cube until the marker is removed (the log line "removes <ASIA> marker")
    if (map.id === '9') {
      const ORDER = ['Europe', 'Americas', 'Africa', 'Australia', 'Asia'], gone = (player.flags && player.flags.m9_removed) || 0;
      const at = Object.fromEntries((map.special_hexes || []).filter((h) => h.kind === 'continent_marker').map((h) => [h.note.split(' ')[0], cellCentre(h.x, h.y)]));
      ORDER.forEach((c, i) => {
        if (gone >> i & 1 || !at[c]) return;
        const cx = Math.max(52, Math.min(1070, at[c][0])), cy = Math.max(30, Math.min(946, at[c][1]));
        const g = svg('g', {});
        g.append(svg('rect', { x: cx - 50, y: cy - 25, width: 100, height: 50, rx: 12, fill: '#f3ecd2', stroke: '#2b1d12', 'stroke-width': 3 }));
        const col = seatColor(seat), edge = mix(col, '#000000', .6);
        const cube = svg('g', { transform: 'translate(' + (cx - 24) + ' ' + (cy - 1) + ') scale(.8)' });
        for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(col, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', col], ['19,-9 0,2 0,21 19,10', mix(col, '#000000', .3)]]) {
          cube.append(svg('polygon', { points: pts, fill, stroke: edge, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
        }
        g.append(cube);
        const id = ICON_IDS[c];
        if (id) { const [w0, h0] = iconSizes[id] || [190, 152], h = 38, w = w0 * h / h0; g.append(svg('image', { href: iconUrl(id), x: cx + 26 - w / 2, y: cy - h / 2, width: w, height: h })); }
        const tip = svg('title');
        tip.textContent = c + ' marker (' + replay.players[seat].name + '): removed when an animal of this continent is played next to its area';
        g.append(tip);
        s.append(g);
      });
    }

    // map 13: the bonus of each quadrant (gained when the area is completely covered and at every break) sits on the edge of the map, on the
    // yellow / purple tag r8c11; the left one (hunter 4) is not in the geometry data
    const AREA_TAG = 'r8c11', AREA_AT = { top: [561, 46], bottom: [561, 932], left: [42, 488], right: [1080, 488] };
    for (const sh of map.special_hexes) {
      if (sh.kind !== 'area_bonus') continue;
      const side = sh.y < 0 ? 'top' : sh.y > 12 ? 'bottom' : sh.x < 0 ? 'left' : 'right';
      const bn = sh.bonus || (side === 'left' ? { type: 'Hunter', value: 4 } : null);
      if (!bn) continue;
      const [cx, cy] = AREA_AT[side];
      iconBox(AREA_TAG, cx, cy, 82);
      if (bn.type === 'Hunter') {
        iconBox('r7c7', cx + 7, cy + 2, 54);
        put('text', { x: cx - 21, y: cy + 16, class: 'bonus-number' }, bn.value);            // white with a black border, near the left edge
      } else if (bn.type === 'money') {
        moneyTile(s, cx, cy + 3, 48);
        put('text', { x: cx, y: cy + 16, class: 'bonus-number' }, bn.value);
      } else {
        const icon = ICON_IDS['bonus:' + bn.type];
        if (icon) iconBox(icon, cx, cy + 3, 48);
        put('text', { x: cx, y: cy + 16, class: 'bonus-number' }, bn.value);
      }
      const tip = svg('title');
      tip.textContent = 'Area bonus: ' + bn.type + ' ' + bn.value + ' (when the area is completely covered, and at every break)';
      s.lastChild.append(tip);
    }

    // the buildings; one that arrived (or changed: another rotation, turned over when an animal is placed / turned back when it is released) gets a green frame round its hexes, one that left (cut down, replaced) stays
    // as a ghost with a red frame; both fade like the cards
    const hexPoints = (x, y) => {
      const [hx, hy] = cellCentre(x, y);
      return [0, 1, 2, 3, 4, 5].map((i) => (hx + 76 * Math.cos(i * Math.PI / 3)).toFixed(1) + ',' + (hy + 76 * Math.sin(i * Math.PI / 3)).toFixed(1)).join(' ');
    };
    // the outline of a building: only the edges of its hexes that have no neighbour hex of the same building (flat topped hexes; the neighbour across edge i
    // lies at (+1,+1), (0,+2), (-1,+1), (-1,-1), (0,-2), (+1,-1))
    const NEIGHBOUR = [[1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2], [1, -1]];
    const outlinePath = (cells) => {
      const mine = new Set(cells.map(([x, y]) => x + ',' + y));
      const parts = [];
      for (const [x, y] of cells) {
        const [hx, hy] = cellCentre(x, y);
        NEIGHBOUR.forEach(([dx, dy], i) => {
          if (mine.has((x + dx) + ',' + (y + dy))) return;
          const pt = (k) => (hx + 76 * Math.cos(k * Math.PI / 3)).toFixed(1) + ' ' + (hy + 76 * Math.sin(k * Math.PI / 3)).toFixed(1);
          parts.push('M' + pt(i) + 'L' + pt(i + 1));
        });
      }
      return parts.join('');
    };
    const drawBuilding = (b, cls) => {
      const g = svg('g', cls ? { class: cls } : {});
      const sp = spriteOf(b);
      const animals = b.animal ? [b.animal] : b.animals;
      const title = svg('title');
      title.textContent = b.type + (animals && animals.length ? ': ' + animals.map(cardName).join(', ') : ' (empty)');
      if (!sp) {                                  // a building whose sprite is missing: outline its hexes
        g.append(title);
        for (const [x, y] of b.cells) g.append(svg('polygon', { points: hexPoints(x, y), class: 'nosprite' }));
      } else {
        const [cx, cy] = cellCentre(b.x, b.y);
        const img = svg('image', {
          href: '/enclosures/' + sp.image, x: cx - sp.anchor[0] * SPRITE_SCALE, y: cy - sp.anchor[1] * SPRITE_SCALE,
          width: sp.size[0] * SPRITE_SCALE, height: sp.size[1] * SPRITE_SCALE,
          transform: 'rotate(' + (b.rotation * 60) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')',
        });
        img.append(title);
        g.append(img);
      }
      if (cls) g.append(svg('path', { d: outlinePath(b.cells), class: 'frame' }));
      return g;
    };
    const keyOf = (b) => [b.type, b.x, b.y, b.rotation, b.animal || (b.animals && b.animals.length) ? 'full' : 'empty'].join('|');
    const zone = seat + ':buildings';
    const z = zoneNew(zone, player.buildings.map(keyOf));
    curZoneData[zone] = Object.fromEntries(player.buildings.map((b) => [keyOf(b), b]));
    for (const b of player.buildings) {
      s.append(drawBuilding(b, z.isNew(keyOf(b)) ? 'tok-new' : ''));
      if (params.has('debug')) {                  // ?debug: outline the cells the engine says the building covers
        for (const [x, y] of b.cells) s.append(svg('polygon', { points: hexPoints(x, y), fill: 'none', stroke: '#f0f', 'stroke-width': 3 }));
      }
    }
    for (const gone of z.gone) {
      const b = (prevZoneData[zone] || {})[gone.key];
      if (!b) continue;
      const g = drawBuilding(b, 'tok-gone');
      g.addEventListener('animationend', () => g.remove());
      s.append(g);
    }
    if (FORK && placement && placement.seat === seat) {
      // every hex is a target for the anchor; until one is chosen the building follows the cursor (anchor on the hex under it), green / red like the placed one
      const hover = svg('g', { class: 'hoverplace', 'pointer-events': 'none' });
      for (const h of map.hexes || []) {
        const poly = svg('polygon', { points: hexPoints(h.x, h.y), class: 'pickhex' });
        poly.addEventListener('click', () => { placement.x = h.x; placement.y = h.y; render(); });
        poly.addEventListener('mouseenter', () => {
          if (placement.x !== null) return;
          const cells = placementCells(placement.type, h.x, h.y, placement.rot);
          const legal = !!legalPlacement({ ...placement, x: h.x, y: h.y });
          const ghost = drawBuilding({ type: placement.type, x: h.x, y: h.y, rotation: placement.rot, cells }, '');
          ghost.setAttribute('class', 'ghost');
          hover.replaceChildren(ghost, svg('path', { d: outlinePath(cells), class: 'placeborder ' + (legal ? 'ok' : 'bad') }));
        });
        poly.addEventListener('mouseleave', () => hover.replaceChildren());
        s.append(poly);
      }
      s.append(hover);
      if (placement.x !== null) {
        const cells = placementCells(placement.type, placement.x, placement.y, placement.rot);
        const legal = !!legalPlacement(placement);
        const ghost = drawBuilding({ type: placement.type, x: placement.x, y: placement.y, rotation: placement.rot, cells }, '');
        ghost.setAttribute('class', 'ghost');
        ghost.setAttribute('pointer-events', 'none');
        s.append(ghost);
        s.append(svg('path', { d: outlinePath(cells), class: 'placeborder ' + (legal ? 'ok' : 'bad'), 'pointer-events': 'none' }));
        const [ax, ay] = cellCentre(placement.x, placement.y);                      // the anchor of the building, drawn on top of it while it is being placed
        const anchor = svg('g', { class: 'anchormark', 'pointer-events': 'none' });
        anchor.append(svg('circle', { cx: ax, cy: ay, r: 17, class: 'anchordot' }), svg('line', { x1: ax - 11, y1: ay, x2: ax + 11, y2: ay, class: 'anchorcross' }),
                      svg('line', { x1: ax, y1: ay - 11, x2: ax, y2: ay + 11, class: 'anchorcross' }));
        s.append(anchor);
        const centres = [0, 1, 2, 3, 4, 5].flatMap((k) => placementCells(placement.type, placement.x, placement.y, k)).map((c) => cellCentre(c[0], c[1]));      // (the cells of every rotation: the buttons stay where they are while the piece turns)
        const xs = centres.map((c) => c[0]), ys = centres.map((c) => c[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), midY = (Math.min(...ys) + Math.max(...ys)) / 2, midX = (minX + maxX) / 2, maxY = Math.max(...ys);
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const button = (cx, cy, glyph, title, onclick, cls) => {
          const g = svg('g', { class: 'placebtn ' + (cls || ''), transform: 'translate(' + clamp(cx, 40, 1082).toFixed(0) + ' ' + clamp(cy, 40, 936).toFixed(0) + ')' });
          const tip = svg('title');
          tip.textContent = title;
          const gl = svg('text', { y: 12, 'text-anchor': 'middle' });
          gl.textContent = glyph;
          g.append(svg('circle', { r: 34 }), gl, tip);
          g.addEventListener('click', (e) => { e.stopPropagation(); onclick(); });
          s.append(g);
        };
        button(minX - 105, midY, '\u21B6', 'Turn counter-clockwise', () => { placement.rot = (placement.rot + 5) % 6; render(); }, 'rot');
        button(maxX + 105, midY, '\u21B7', 'Turn clockwise', () => { placement.rot = (placement.rot + 1) % 6; render(); }, 'rot');
        if (legal) button(midX - 48, maxY + 110, '\u2713', 'Place the building here', () => playFork(legalPlacement(placement)), 'okbtn');
        button(midX + (legal ? 48 : 0), maxY + 110, '\u2715', 'Cancel', () => { placement = null; render(); }, 'cancelbtn');
      }
    }
    return s;
  }

  // ---- association board ----------------------------------------------------------------------------------------
  // Slot positions in the 2000x591 rendering of web/assets/association_board_*.webp (the PNGs are 3335x986, scaled 0.6).
  const seatColor = (seat) => (replay.players[seat] && replay.players[seat].color) || ['#c0392b', '#2980b9'][seat];
  const ASSOC = {
    donation: [[215, 145], [75, 245], [225, 245], [75, 343], [225, 343], [75, 441], [225, 441], [185, 540]],   // association_0_k
    // task id -> [centre x, y, x offsets of the workers]
    workers: { 2: [427, 455, [-64, 0, 64]], 3: [0, 520, [700, 890, 1080]], 4: [0, 520, [1340, 1520, 1700]], 5: [1897, 455, [-64, 0, 64]] },
    partner: { Americas: [662, 225], Europe: [880, 115], Asia: [1120, 125], Africa: [880, 345], Australia: [1120, 345] },
    university: {
      mw: { 'fac-rep-hand': [1395, 175], 'fac-generic': [1655, 175], 'fac-science-science': [1395, 370], 'fac-science-rep': [1655, 370] },
      base: { 'fac-rep-hand': [1555, 110], 'fac-science-science': [1395, 350], 'fac-science-rep': [1655, 350] },
    },
  };

  const BLOCKED_COLORS = ['#d9372b', '#2fa84f', '#e8c030', '#e07a1f', '#7a4fd0'];
  function unusedColor() {
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const far = (c) => replay.players.every((p) => !p.color || rgb(c).reduce((d, v, i) => d + Math.abs(v - rgb(p.color)[i]), 0) > 200);
    return BLOCKED_COLORS.find(far) || BLOCKED_COLORS[0];
  }

  function associationBoard(st) {
    const mw = replay.marine_worlds;
    const s = svg('svg', { class: 'assoc', viewBox: '0 0 2000 591', role: 'img', 'aria-label': 'Association board' });
    s.append(svg('image', { href: '/assets/association_board_' + (mw ? 'mw' : 'base') + '.webp', x: 0, y: 0, width: 2000, height: 591 }));
    const put = (tag, attrs, text, title) => {
      const e = svg(tag, attrs);
      if (text !== undefined) e.textContent = text;
      if (title) { const t = svg('title'); t.textContent = title; e.append(t); }
      s.append(e);
    };
    // the fork: a tile of the board that a legal association task takes can be clicked
    const pickable = (x, y, w, h, match, tip) => {
      const acts = forkActs((a) => a.kind === 'association_task' && !a.args.supply && match(a));
      if (!acts.length) return;
      const r = svg('rect', { x, y, width: w, height: h, rx: 14, class: 'assocpick' });
      const t = svg('title');
      t.textContent = tip;
      r.append(t);
      s.append(bindActs(r, acts));
    };
    const at = {};                       // location -> [seat, ...] of the players' tokens there
    st.players.forEach((p, seat) => p.tokens.forEach((t) => (at[t.location] = at[t.location] || []).push(seat)));
    for (const t of st.board_tokens) {
      if (t.location === 'association_3') {
        const continent = t.type.replace('partner-', '');
        const pos = ASSOC.partner[continent];
        if (pos) {
          put('image', { href: iconUrl(ICON_IDS[continent]), x: pos[0] - 109, y: pos[1] - 87, width: 218, height: 174 }, undefined, t.type);
          pickable(pos[0] - 109, pos[1] - 87, 218, 174, (a) => a.args.task === 'partner' && a.args.continent === continent, 'Take this partner zoo');
        }
      } else if (t.location === 'association_4') {
        const pos = ASSOC.university[mw ? 'mw' : 'base'][t.type];
        if (pos && ICON_IDS[t.type]) {
          put('image', { href: iconUrl(ICON_IDS[t.type]), x: pos[0] - 115, y: pos[1] - 87, width: 230, height: 174 }, undefined, t.type);
          pickable(pos[0] - 115, pos[1] - 87, 230, 174, (a) => a.args.task === 'university' && a.args.kind === t.type, 'Take this university');
        }
      }
    }
    const workerAt = (cx, cy, seat, tip) => {          // BGA's worker meeple of the player's colour (282x277), standing on the slot
      const w = 92, h = w * 277 / 282;
      put('image', { href: workerUrl(seat), x: cx - w / 2, y: cy - h / 2, width: w, height: h }, undefined, tip);
    };
    const blocked = unusedColor();                     // 2 players: the left donation cells of 5 / 7 / 10 money are covered by cubes of a colour nobody plays
    for (const k of [1, 3, 5]) {
      const [x, y] = ASSOC.donation[k];
      const g = svg('g', { transform: 'translate(' + x + ' ' + (y - 2) + ') scale(1.55)' });
      const edge = mix(blocked, '#000000', .6);
      for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(blocked, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', blocked], ['19,-9 0,2 0,21 19,10', mix(blocked, '#000000', .3)]]) {
        g.append(svg('polygon', { points: pts, fill, stroke: edge, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }));
      }
      const tip = svg('title');
      tip.textContent = 'Blocked in a 2 player game';
      g.append(tip);
      s.append(g);
    }
    ASSOC.donation.forEach(([x, y], k) => (at['association_0_' + k] || []).forEach((seat) => {
      workerAt(x, y, seat, replay.players[seat].name + ': donation');
    }));
    for (const [n, [cx, cy, xs]] of Object.entries(ASSOC.workers)) {
      (at['association_' + n] || []).slice(0, 3).forEach((seat, i) => {
        workerAt(cx + xs[i], cy, seat, replay.players[seat].name + ': worker');
      });
    }
    return s;
  }

  // the map's bonus space panel (left of the zoo map): the 3 locked workers on top, then the 7 bonus slots. A player cube covers a slot until its bonus has been
  // chosen (a conservation project was supported) and a worker disappears when it is unlocked. Cubes and workers are drawn in the player's colour.
  // BGA's player colours with a worker picture (web/workers); a colour that is not one of them gets the closest
  const WORKER_COLORS = ['30a638', '1863a5', '7f4e30', '000000', '5a5856', 'ffffff', 'd1c81c', 'b91b1b', 'c028d3', 'cb7b19'];
  function workerUrl(seat) {
    const c = seatColor(seat).replace('#', '').toLowerCase();
    const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (h) => rgb(h).reduce((d, v, i) => d + Math.abs(v - rgb(c)[i]), 0);
    return '/workers/' + WORKER_COLORS.reduce((best, h) => (dist(h) < dist(best) ? h : best)) + '.webp';
  }
  const mix = (hex, other, t) => {
    const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const b = [1, 3, 5].map((i) => parseInt(other.slice(i, i + 2), 16));
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  // icon (and whether to print the value on it) of a bonus slot
  const SLOT_ICON = {};   // the slots use the same icons as the placement bonuses (ICON_IDS 'bonus:<type>', named from BGA's stylesheet)
  const SLOT_NUMBER = new Set(['money', 'xtoken', 'reputation', 'conservation']);

  // a conservation icon with its number printed over it, like the conservation tracker in the side panel (nothing for a bonus of 0)
  function conservationBonus(root, cx, cy, h, value, tip) {
    if (!value) return null;
    const id = ICON_IDS.conservation, [w0, h0] = iconSizes[id] || [h, h];
    const g = svg('g', { class: 'consbonus' });
    g.append(svg('image', { href: iconUrl(id), x: cx - (w0 * h / h0) / 2, y: cy - h / 2, width: w0 * h / h0, height: h }));
    const t = svg('text', { x: cx, y: cy + h * 0.18, class: 'cons-number', style: 'font-size:' + (h * 0.5).toFixed(1) + 'px' });
    t.textContent = value;
    g.append(t);
    if (tip) { const tt = svg('title'); tt.textContent = tip; g.append(tt); }
    root.append(g);
    return g;
  }

  function bonusPanel(map, p, seat) {
    const color = seatColor(seat);
    const slots = [...map.bonus_slots].sort((a, b) => a.index - b.index);
    const lead = slots.findIndex((x) => x.kind !== 'instant_income');
    const upper = lead === -1 ? slots.length : Math.max(lead, 1);              // the purple (income) slots come first, in the upper panel
    const groups = [slots.slice(0, upper), slots.slice(upper)];
    const used = p.flags.bonus_used || 0;
    const H = 720;                                                           // as tall as the zoo map next to it (map 1122x976 beside a panel 16% of the row)
    const rowH = (H - 118 - 12 - 13 - 2 * 20) / slots.length;               // the rows share the space under the worker box
    const height1 = groups[0].length * rowH + 20, top2 = 118 + height1 + 13, height2 = groups[1].length * rowH + 20;
    const s = svg('svg', { class: 'bonuspanel', viewBox: '0 0 192 ' + H, role: 'img', 'aria-label': 'Bonus spaces of ' + replay.players[seat].name });
    const add = (tag, attrs, text) => { const e = svg(tag, attrs); if (text !== undefined) e.textContent = text; s.append(e); return e; };
    add('rect', { x: 0, y: 0, width: 192, height: H, rx: 10, fill: '#efe6cf' });

    // locked workers
    add('rect', { x: 14, y: 14, width: 148, height: 92, rx: 14, fill: '#f4a3a3', stroke: '#222', 'stroke-width': 3 });
    const locked = new Set(p.tokens.filter((t) => t.type === 'worker' && /^supply_\d$/.test(t.location)).map((t) => +t.location.slice(7)));
    const lockbox = add('g', { class: 'lockbox' });          // hovering the box lifts all the workers to show what unlocks under them (conservation of the 4th worker; T1: reputation of the first two)
    const lbAdd = (tag, attrs) => { const e = svg(tag, attrs); lockbox.append(e); return e; };
    [1, 2, 3].forEach((k, i) => {
      const cx = 40 + i * 48;     // slots 18..62, 66..110, 114..158 stay inside the box (x 14..162)
      lbAdd('rect', { x: cx - 22, y: 26, width: 44, height: 70, rx: 8, fill: '#f9c9c9' });
      if (k === 3) conservationBonus(lockbox, cx, 72, 38, (map.association_bonuses || {}).last_worker, '4th worker: ' + (map.association_bonuses || {}).last_worker + ' conservation');
      else if (map.id === 'T1') {                          // T1: the first and the second worker also give 1 reputation, shown under the worker
        const id = ICON_IDS.reputation, [w0, h0] = iconSizes[id] || [38, 38], h = 38, w = w0 * h / h0;
        const g = svg('g', { class: 'consbonus' });
        g.append(svg('image', { href: iconUrl(id), x: cx - w / 2, y: 72 - h / 2, width: w, height: h }));
        const t = svg('text', { x: cx, y: 72 + h * 0.18, class: 'cons-number', style: 'font-size:' + (h * 0.5).toFixed(1) + 'px' });
        t.textContent = '1';
        g.append(t);
        const tt = svg('title'); tt.textContent = 'Worker ' + k + ': 1 reputation'; g.append(tt);
        lockbox.append(g);
      }
      if (!locked.has(k)) return;
      const w = 38, h = w * 277 / 282;                     // BGA's worker meeple of the player's colour
      const img = lbAdd('image', { href: workerUrl(seat), x: cx - w / 2, y: 61 - h / 2, width: w, height: h, class: 'lift' });
      const tip = svg('title');
      tip.textContent = 'Worker ' + k + ' (locked)';
      img.append(tip);
    });
    lockbox.append(svg('rect', { x: 14, y: 14, width: 148, height: 92, rx: 14, fill: 'transparent' }));      // hover area: the whole box

    const drawGroup = (list, top, height, rowY) => {
      add('rect', { x: 14, y: top, width: 148, height, rx: 14, fill: '#fff', stroke: '#222', 'stroke-width': 3 });
      list.forEach((sl, i) => {
        const y = rowY(i), bn = sl.bonus || {};
        if (sl.kind === 'instant_income') add('rect', { x: 78, y: y - 31, width: 62, height: 62, rx: 12, fill: '#9a4ba7', stroke: '#5e2a6b', 'stroke-width': 3 });
        else add('image', { href: iconUrl(ICON_IDS.pentagon), x: 74, y: y - 36, width: 72, height: 71 });
        const icon = SLOT_ICON[bn.type] || ICON_IDS['bonus:' + bn.type];
        const size = bn.type === 'money' ? (sl.kind === 'instant_income' ? 46 : 42) : (sl.kind === 'instant_income' ? 44 : 50);
        if (bn.type === 'money') moneyTile(s, 109, y + 1, size);
        else if (bn.type === 'special-enclosure') {            // the choice of a large bird aviary / reptile house (/ large aquarium in a Marine Worlds game)
          const h = 24, row = (ids, cy, trailing) => {
            const ws = ids.map((id) => { const [w0, h0] = iconSizes[id] || [h, h]; return w0 * h / h0; });
            let x = 110 - (ws.reduce((a, b) => a + b, 0) + 10 * (ids.length - 1) + (trailing ? 6 : 0)) / 2;
            ids.forEach((id, n) => {
              add('image', { href: iconUrl(id), x, y: cy - h / 2, width: ws[n], height: h });
              x += ws[n];
              if (n < ids.length - 1 || trailing) { add('text', { x: x + 5, y: cy + 7, class: 'slot-label', style: 'font-size:18px' }, '/'); x += 10; }
            });
          };
          if (replay.marine_worlds) { row(['r9c9', 'r9c11'], y - 11, true); row(['r8c14'], y + 15, false); }      // the aquarium goes down a row so that all three fit the pentagon
          else row(['r9c9', 'r9c11'], y, false);
        } else if (icon && bn.type === 'Clever' && bn.value > 1) {          // 2 Clever abilities: the amount to the left of the icon (no overlap)
          const [w0, h0] = iconSizes[icon] || [size, size];
          add('image', { href: iconUrl(icon), x: 120 - (w0 * size / h0) / 2, y: y - size / 2 + 1, width: w0 * size / h0, height: size });
          add('text', { x: 90, y: y + 12, class: 'slot-number', style: 'font-size:32px' }, bn.value);
        } else if (icon && (bn.type === 'xtoken' || bn.type === 'Pouch') && bn.value > 1) {          // several X tokens / Pouch 2: the amount to the left of the icon, overlapping it a little
          const [w0, h0] = iconSizes[icon] || [size, size];
          add('image', { href: iconUrl(icon), x: 117 - (w0 * size / h0) / 2, y: y - size / 2 + 1, width: w0 * size / h0, height: size });
          add('text', { x: 92, y: y + 12, class: 'slot-number', style: 'font-size:32px' }, bn.value);       // (overlaps the token a little)
        } else if (icon) {
          const [w0, h0] = iconSizes[icon] || [size, size];
          add('image', { href: iconUrl(icon), x: 109 - (w0 * size / h0) / 2, y: y - size / 2 + 1, width: w0 * size / h0, height: size });
        } else add('text', { x: 109, y: y + 8, class: 'slot-label' }, '?');
        if (SLOT_NUMBER.has(bn.type) && bn.value && !(bn.type === 'xtoken' && bn.value > 1)) add('text', { x: 109, y: y + 13, class: 'slot-number' }, bn.value);
        if (bn.type === 'cut-down' && icon) {                  // the Cut Down ability: a white 1 with a black border near the left edge of the icon
          const [w0, h0] = iconSizes[icon] || [size, size];
          add('text', { x: 109 - (w0 * size / h0) / 2 + 8, y: y + 14, class: 'slot-number', style: 'font-size:28px' }, '1');
        }
        const pick = FORK ? forkActs((a) => a.kind === 'choose_bonus' && a.player === seat && a.args.bonus === sl.index) : [];
        if (pick.length) {                                   // the fork: a bonus to unlock is chosen by clicking its slot
          const hit = add('rect', { x: 16, y: y - rowH / 2 + 1, width: 144, height: rowH - 2, rx: 12, class: 'bonuspick' + (forkBonus === sl.index ? ' on' : '') });
          hit.addEventListener('click', () => { forkBonus = sl.index; render(); });
        }
        if (!(used & (1 << sl.index))) {                     // the cube is still on the slot: its bonus has not been chosen yet
          const cx = 46, c = add('g', { transform: 'translate(' + cx + ' ' + (y - 1) + ')' });
          const face = (pts, fill) => c.append(svg('polygon', { points: pts, fill, stroke: mix(color, '#000000', .6), 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
          face('0,-19 19,-9 0,2 -19,-9', mix(color, '#ffffff', .45));
          face('-19,-9 0,2 0,21 -19,10', color);
          face('19,-9 0,2 0,21 19,10', mix(color, '#000000', .3));
          const tip = svg('title');
          tip.textContent = replay.players[seat].name + ': bonus ' + (sl.index + 1) + ' not chosen yet';
          c.append(tip);
        }
      });
    };
    drawGroup(groups[0], 118, height1, (i) => 118 + 10 + rowH / 2 + rowH * i);
    if (groups[0].length) add('image', { href: iconUrl('r1c1'), x: 144, y: 118 + height1 / 2 - 33, width: 40, height: 66 });
    drawGroup(groups[1], top2, height2, (i) => top2 + 10 + rowH / 2 + rowH * i);
    if (groups[1].length) add('image', { href: iconUrl('r8c9'), x: 148, y: top2 + 10 + rowH * 1.5 - 22, width: 38, height: 44 });
    add('image', { href: iconUrl('r7c4'), x: 134, y: top2 - 6.5 - 28, width: 50, height: 56 });
    return s;
  }

  // the player's association board (web/assets/association_player_board.webp, 351x1776): partner zoo slots 1-4 and university slots 1-3, bottom to top
  const STRIP = {
    partner: { 1: 855, 2: 619, 3: 383, 4: 147 },          // y of the middle of the slot picture (measured on the silhouettes); x is always 175
    university: { 1: 1612, 2: 1378, 3: 1144 },
  };
  const SLOT_SIZE = { partner: [253, 198], university: [248, 199] };         // the silhouettes of the slots on the picture of the player board
  function associationStrip(p, map, seat) {
    const s = svg('svg', { class: 'strip', viewBox: '-50 0 451 1776', role: 'img', 'aria-label': 'Partner zoos and universities' });
    s.append(svg('image', { href: '/assets/association_player_board.webp', x: 0, y: 0, width: 351, height: 1776 }));
    const bonuses = map.association_bonuses || {};            // conservation points of the 4th partner zoo and the 3rd university, shown on their (empty) slots
    conservationBonus(s, 175, STRIP.partner[4] + 22, 92, bonuses.partner4, '4th partner zoo: ' + bonuses.partner4 + ' conservation');
    conservationBonus(s, 175, STRIP.university[3] + 22, 92, bonuses.university3, '3rd university: ' + bonuses.university3 + ' conservation');
    // where the zoo map awards an action card upgrade: most maps on the 2nd partner zoo and the 2nd university; maps 12 and T1 on the first and the second *set*
    // (a partner zoo and a university), map 11 on the first set: a curved line joins the two slots of a set with the upgrade icon in its middle and an arrow from
    // each end pointing at it
    const upgradeIcon = ICON_IDS['bonus:upgrade-card'] || 'r10c5';
    const putUpgrade = (cx, cy, h, tip) => {
      const [w0, h0] = iconSizes[upgradeIcon] || [h, h], w = w0 * h / h0;
      const img = svg('image', { href: iconUrl(upgradeIcon), x: cx - w / 2, y: cy - h / 2, width: w, height: h });
      const t = svg('title'); t.textContent = tip; img.append(t);
      s.append(img);
    };
    const SETS = { '12': [1, 2], T1: [1, 2], '11': [1] };
    if (!SETS[map.id]) {
      putUpgrade(175, STRIP.partner[2] + 22, 84, 'Upgrade an action card (2nd partner zoo)');
      putUpgrade(175, STRIP.university[2] + 22, 84, 'Upgrade an action card (2nd university)');
    } else {
      SETS[map.id].forEach((n, i) => {
        const side = i % 2 === 0 ? 1 : -1, ex = side === 1 ? 34 : 351 - 34, cx = side === 1 ? -34 : 351 + 34;        // the first set on the left margin, the second on the right
        const y1 = STRIP.partner[n], y2 = STRIP.university[n];
        const pt = (t) => [(1 - t) * (1 - t) * ex + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ((y1 + y2) / 2) + t * t * y2];
        s.append(svg('path', { d: 'M' + ex + ' ' + y1 + ' Q' + cx + ' ' + (y1 + y2) / 2 + ' ' + ex + ' ' + y2, fill: 'none', stroke: '#3a2616', 'stroke-width': 7, 'stroke-linecap': 'round' }));
        for (const t of [0.34, 0.66]) {                                                    // arrowheads on the line, pointing towards the middle
          const [x, y] = pt(t), [x2, y2b] = pt(t + (t < 0.5 ? 0.04 : -0.04));
          const ang = Math.atan2(y2b - y, x2 - x), L = 26, W = 14;
          const tip = [x2, y2b], base = [x2 - Math.cos(ang) * L, y2b - Math.sin(ang) * L];
          const nx = -Math.sin(ang) * W, ny = Math.cos(ang) * W;
          s.append(svg('polygon', { points: [tip, [base[0] + nx, base[1] + ny], [base[0] - nx, base[1] - ny]].map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '), fill: '#3a2616' }));
        }
        const [mx, my] = pt(0.5);
        putUpgrade(mx, my, 84, 'Upgrade an action card (set ' + n + ': a partner zoo and a university)');
      });
    }
    // the partner zoos and universities of the player; one that arrived gets a green frame, one that left stays as a ghost with a red frame
    // (the same fade as the cards)
    const drawToken = (kind, slot, type, cls) => {
      const y = STRIP[kind][slot];
      const id = ICON_IDS[kind === 'partner' ? type.replace('partner-', '') : type];
      if (!y || !id) return null;
      // the token moves from the association board to its slot: scaled so that its visible part (without the transparent edge of the picture) fills the slot
      const [w0, h0] = iconSizes[id] || [190, 152];
      const [bx, by, bw, bh] = kind === 'partner' ? [5, 4, 179, 142] : w0 === 121 ? [1, 1, 119, 84] : [7, 6, 119, 84];       // (the category universities and the generic one are 121 px wide pictures, the others 137)       // the drawn part of the picture (no transparent edge / shadow)
      const [slotW, slotH] = SLOT_SIZE[kind];
      const kx = slotW / bw, ky = kind === 'partner' ? kx : slotH / bh;               // a university is a little flatter than its slot: stretched to fill it
      const w = w0 * kx, h = h0 * ky;
      const g = svg('g', cls ? { class: cls } : {});
      const img = svg('image', { href: iconUrl(id), x: 175 - (bx + bw / 2) * kx, y: y - (by + bh / 2) * ky, width: w, height: h, preserveAspectRatio: 'none' });
      const tip = svg('title');
      tip.textContent = type;
      img.append(tip);
      g.append(img);
      if (cls) g.append(svg('rect', { x: 175 - slotW / 2 - 4, y: y - slotH / 2 - 4, width: slotW + 8, height: slotH + 8, rx: 14, class: 'frame' }));
      return g;
    };
    const toks = p.tokens.filter((t) => /^(partner|university)_\d$/.test(t.location));
    const keyOf = (t) => t.location + '|' + t.type;
    const z = zoneNew(seat + ':association', toks.map(keyOf));
    for (const t of toks) {
      const [kind, slot] = t.location.split('_');
      const g = drawToken(kind, slot, t.type, z.isNew(keyOf(t)) ? 'tok-new' : '');
      if (g) s.append(g);
    }
    for (const gone of z.gone) {
      const [loc, type] = gone.key.split('|');
      const [kind, slot] = loc.split('_');
      const g = drawToken(kind, slot, type, 'tok-gone');
      if (!g) continue;
      g.addEventListener('animationend', () => g.remove());
      s.append(g);
    }
    return s;
  }

  // what a player has on the association side: workers by place
  function associationSummary(p) {
    const loc = (re) => p.tokens.filter((t) => re.test(t.location));
    const names = (list) => list.map((t) => t.type.replace(/^partner-|^fac-/, '')).join(', ') || 'none';
    const row = el('div', 'chips');
    const workers = p.tokens.filter((t) => t.type === 'worker');
    const count = (re) => workers.filter((t) => re.test(t.location)).length;
    row.append(el('span', 'chip', 'Workers: ' + count(/^association_/) + ' on tasks · ' + count(/^supply_/) + ' waiting · ' + count(/^reserve$/) + ' reserve'));
    return row;
  }

  // support tokens of both players on a conservation project card: [{seat, slot}]
  function projectTokens(st, key) {
    const out = [];
    const re = new RegExp('^' + key + '_.*_(\\d+)$');
    st.players.forEach((p, seat) => p.tokens.forEach((t) => {
      const m = re.exec(t.location);
      if (m) out.push({ seat, slot: +m[1] });
    }));
    return out;
  }
  function projectRow(st, keys, cls, emptyText) {
    const row = el('div', 'cards' + (cls ? ' ' + cls : ''));
    if (!keys.length) row.append(el('span', 'empty', emptyText || 'none'));
    for (const k of keys) {
      const wrap = el('div', 'withtokens');
      wrap.append(card(k));
      const dots = el('div', 'dots');
      for (const t of projectTokens(st, k)) {
        const d = el('span', 'dot', t.slot + 1);
        d.style.background = seatColor(t.seat);
        d.title = replay.players[t.seat].name + ': slot ' + (t.slot + 1);
        dots.append(d);
      }
      wrap.append(dots);
      row.append(wrap);
    }
    return row;
  }

  // ---- rendering ------------------------------------------------------------------------------------------------
  const ACTION_NAMES = { animals: 'Animals', association: 'Association', build: 'Build', cards: 'Cards', sponsors: 'Sponsors' };

  // a beige panel with a shield icon and `count` slots, like BGA's project holders; the cards in `keys` go left to right
  // a cube (colour nobody plays) over one of the three slots of a base project card; in a 2 player game card k has its slot k covered: left, middle, right
  const SLOT_X = [0.18, 0.51, 0.83];
  function blockedCube(i, colour, title) {            // colour / title: a cube of a player who supports the project at slot i
    const c = colour || unusedColor();
    const e = mix(c, '#000000', .6);
    const g = svg('svg', { class: 'blockcube', viewBox: '-24 -24 48 48' });
    g.style.left = (SLOT_X[i] * 100) + '%';
    for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(c, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', c], ['19,-9 0,2 0,21 19,10', mix(c, '#000000', .3)]]) {
      g.append(svg('polygon', { points: pts, fill, stroke: e, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
    }
    const tip = svg('title');
    tip.textContent = title || 'Blocked in a 2 player game';
    g.append(tip);
    return g;
  }

  function projectPanel(st, keys, count, iconName, title, blocked) {
    const panel = el('div', 'projpanel');
    panel.title = title;
    const icon = el('img', 'icon projicon');
    icon.src = iconUrl(iconNames[iconName] || ''); icon.alt = title; icon.height = 44;
    panel.append(icon);
    const zn = zoneNew('projects:' + iconName, keys), isNew = zn.isNew;
    for (let i = 0; i < count; i++) {
      const slot = el('div', 'projslot');
      if (keys[i]) {
        const wrap = el('div', 'withtokens');
        const bar = el('div', 'projbar');                  // dark green bar with the project's icon(s): the top left corner of the card art
        const pc = info(keys[i]);
        if (pc.image) {
          bar.style.backgroundImage = 'url(' + pc.image + ')';
          bar.addEventListener('mouseenter', () => showPreview(pc.large || pc.image));
          bar.addEventListener('mouseleave', hidePreview);
        }
        const holder = el('div', 'cardwrap projcrop');       // only the bottom of the card (cubes and slots) shows; hovering still previews the whole card
        holder.append(card(keys[i]));
        if (blocked) holder.append(blockedCube(i));
        for (const t of projectTokens(st, keys[i])) {         // a supporter's cube blocks its slot
          holder.append(blockedCube(0, seatColor(t.seat), replay.players[t.seat].name + ': slot ' + (t.slot + 1)));
          holder.lastChild.style.left = (SLOT_X[t.slot] * 100) + '%';
        }
        const line = el('div', 'projline' + (isNew(keys[i]) ? ' card-new' : ''));
        line.append(bar, holder);
        wrap.append(line);
        slot.append(wrap);
      }
      panel.append(slot);
    }
    return panel;
  }

  // the player whose Mark cube is on this display card (a token located on `A###_Name`), or -1
  function markOwner(st, key) {
    return st.players.findIndex((p) => p.tokens.some((t) => t.type === 'token' && t.location.slice(0, 5) === key + '_'));
  }
  function markCube(seat) {
    const c = seatColor(seat), e = mix(c, '#000000', .6);
    const g = svg('svg', { class: 'markcube', viewBox: '-24 -24 48 48' });
    for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(c, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', c], ['19,-9 0,2 0,21 19,10', mix(c, '#000000', .3)]]) {
      g.append(svg('polygon', { points: pts, fill, stroke: e, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
    }
    const tip = svg('title');
    tip.textContent = 'Marked by ' + replay.players[seat].name;
    g.append(tip);
    return g;
  }

  // the bar above the boards, like BGA's: what the active player can do now. Before an action card is chosen: the five action cards (the number is the
  // strength of its space) and the X tokens that could raise it
  // The decision comes from the rules engine (`step.options`: its prompt and a summary of legal_actions) on the steps the engine played; on the other
  // steps the bar is guessed from the log-built state (only the choice of an action card).
  const PROMPT_TEXT = {
    build_place: 'must place a building', cards_take: 'must take cards', cards_discard: 'must discard cards', sponsors_play: 'may play a sponsor',
    animals_play: 'may play an animal', association_tasks: 'may perform an association task', effects: 'must resolve an effect',
  };
  const KIND_LABEL = {
    draft_pick: 'Pick an action card', draft_keep: 'Keep two action cards', initial_discard: 'Initial discard',
    place_building: 'Place a building', finish_build: 'Done building', take_cards: 'Take a card', play_animal: 'Play an animal', finish_animals: 'Done with animals',
    play_sponsor: 'Play a sponsor', sponsor_break: 'Advance the break', finish_sponsors: 'Done with sponsors', association_task: 'Association task', donate: 'Donate',
    finish_association: 'Done with association', discard_cards: 'Discard', choose_effect: 'Resolve an effect', skip_effect: 'Skip the effect', take_instead: 'Take a card instead',
    self_clever: 'Do nothing (Self-clever)', skip_extra: 'No second action', sponsor_side: 'Sponsors side action', animals_single: 'Play a single animal', choose_slot: 'Choose a slot',
    choose_bonus: 'Choose a bonus', upgrade_action_card: 'Upgrade an action card',
  };
  // The action card draft: each player is offered variants of the action cards (full card pictures) and selects the ones to keep; the replay shows what the
  // players were offered and what they chose (a green frame with a check mark). Both players choose at the same time, so both groups are shown.
  function draftCardUrl(v) { const m = /^([a-z]+)(\d)$/.exec(v); return m ? '/action_cards/' + m[1] + '_' + m[2] + '_1.webp' : ''; }
  let forkClaimed = new Set(), forkMenu = null, forkError = '', forkDockStep = -1;      // fork: the legal actions the controls of the bar stand for / the choices of a button with several / the last error
  const forkActs = (pred) => (FORK && replay.steps[step].actions || []).filter(pred || (() => true));
  // a control of the bar plays the legal action it stands for (with several: a row of buttons for them appears)
  function bindActs(node, acts) {
    if (!FORK || !acts.length) return node;
    for (const a of acts) forkClaimed.add(a);
    node.classList.add('choosable');
    node.onclick = () => {
      if (forkBusy) return;
      if (acts.length === 1) playFork(acts[0]);
      else { forkMenu = { label: node.title || '', acts }; refreshBar(); }
    };
    return node;
  }
  // a card is chosen to be played (an animal, a sponsor, a Marketing sponsor...): only one can be selected at a time
  const forkSingleSelect = () => marketMode !== null || forkActs((a) => a.args && a.args.card && !a.args.from_display && ['play_animal', 'play_sponsor', 'sponsor_side'].includes(a.kind)).length > 0;
  function refreshBar() { actionBar(curState()); if (FORK) forkBar(); }
  let forkGate = false, forkConfirmed = -1;                               // fork: the turn has just been passed on and the player has not confirmed it yet
  let forkBonus = null;                                                    // fork: the bonus slot of the player board the viewer picked to unlock
  // Undo / Restart turn of the fork: undo goes back one step, restart to the choice of the action card at the start of the turn; neither goes back over a step that
  // cannot be taken back (cards drawn, a search / pilfer choice: `irreversible` from the server)
  function turnTargets(turn, active) {
    const same = (k) => k >= 0 && replay.steps[k].state.turn === turn && replay.steps[k].state.active_player === active;
    const irrev = (k) => !!replay.steps[k].irreversible;
    if (step <= 0 || irrev(step) || !same(step - 1)) return { undo: null, restart: null };
    let j = step - 1;
    for (let k = step - 1; same(k); k--) {
      const sk = replay.steps[k];
      if (sk.options && sk.options.prompt === 'choose_action_card' && !sk.options.only) j = k;
      if (irrev(k)) { j = k; break; }
    }
    return { undo: step - 1, restart: j };
  }
  function turnButtons(bar, turn, active, confirm) {
    const t = turnTargets(turn, active);
    for (const [cls, label, tip, target] of [...(confirm ? [['confirm', 'Confirm', 'Confirm the turn and pass to the next player', 0]] : []),
                                             ['undo', 'Undo last step', 'Take back the last step (not possible after cards were drawn or a search / pilfer choice)', t.undo],
                                             ['restart', 'Restart turn', 'Take back the steps of the turn, to the choice of the action card (no further back than a step that cannot be taken back)', t.restart]]) {
      const b = el('button', 'turnbtn ' + cls, label);
      b.type = 'button'; b.title = tip;
      b.disabled = cls !== 'confirm' && target === null;
      b.onclick = () => { if (cls === 'confirm') { forkConfirmed = step; refreshBar(); } else go(target); };
      bar.append(b);
    }
  }
  let thresholdMode = null;                                                // fork: the upgrade / worker choice the viewer opened ({index, stage: 'choose' | 'upgrade'})
  let marketMode = null, assocSpecies = null;                              // fork: the Marketing effect the viewer opened (its index) / the generic university whose species is being chosen
  let assocMode = null;                                                    // fork: 'partner' | 'university' once the viewer clicked that task of the Association action
  let dockHandStep = -1;                                                   // fork: the last step whose changed hand the dock was pointed at
  let forkSpend = 0, skipMode = false;                                    // fork: the X tokens the viewer spends on the chosen action card / puts a card back instead of acting
  const draftMarks = new Set();                                          // the cards the viewer highlighted with a click: cleared at every step
  function draftBar(bar, d) {
    const groups = [], choosers = [];
    for (const seat of [0, 1]) {
      const offers = d.offers[seat] || [];
      if (!offers.length) continue;
      const keeping = d.stage === 'keep' || d.stage === 'done';
      const chosen = keeping ? (d.kept[seat] || []) : (d.picked[seat] || []).slice(d.stage === 'pick2' ? 1 : 0);          // (the choices of this round only)
      const need = keeping ? 2 : 1;
      const group = el('div', 'draftgroup');
      const mine = FORK ? (replay.steps[step].actions || []).filter((a) => a.player === seat && (a.kind === 'draft_pick' || a.kind === 'draft_keep')) : [];       // the fork lets the viewer choose
      const sel = mine.length ? (keepSel.get('d' + seat) || []) : [];
      if (mine.length) keepSel.set('d' + seat, sel);
      const who = el('span', 'who', replay.players[seat].name);
      who.style.color = seatColor(seat);
      const head = el('div', 'drafthead');
      head.append(who, el('b', '', need === 1 ? ' must select the action card you want to keep' : ' must select the 2 action cards you want to keep'));
      const row = el('div', 'draftcards');
      if (d.stage === 'pick2' && (d.picked[seat] || []).length) {          // the second pick: the card picked in the first round stays in a green zone to the left
        const zone = el('div', 'draftkept');
        zone.title = 'Picked in the first round';
        const v = d.picked[seat][0];
        const card = el('div', 'draftcard picked');
        const img = el('img'); img.src = draftCardUrl(v); img.alt = v;
        card.append(img, el('span', 'draftcheck', '✓'));
        card.addEventListener('mouseenter', () => showPreview(draftCardUrl(v)));
        card.addEventListener('mouseleave', hidePreview);
        zone.append(card);
        row.append(zone);
      }
      for (const v of offers) {
        const mark = seat + ':' + v;
        const card = el('div', 'draftcard' + (chosen.includes(v) ? ' picked' : chosen.length ? ' passed' : '') + (draftMarks.has(mark) ? ' marked' : ''));
        card.title = 'Click to highlight this card (the highlight goes away at the next step)';
        card.addEventListener('click', () => { if (draftMarks.has(mark)) draftMarks.delete(mark); else draftMarks.add(mark); card.classList.toggle('marked'); });
        if (mine.length && mine.some((a) => (a.kind === 'draft_keep' ? a.args.keep.includes(v) : a.args.variant === v))) {
          card.title = 'Click to choose this card; click another to change the choice';
          card.classList.add('choosable');
          card.classList.toggle('marked', sel.includes(v));
          choosers.push([card, v]);
        }
        const img = el('img'); img.src = draftCardUrl(v); img.alt = v; img.loading = 'lazy';
        card.append(img);
        if (chosen.includes(v)) card.append(el('span', 'draftcheck', '✓'));
        if (d.auto && d.auto[seat] === v) card.title = 'Added at random: the three variants were of one action card';
        card.addEventListener('mouseenter', () => showPreview(draftCardUrl(v)));
        card.addEventListener('mouseleave', hidePreview);
        row.append(card);
      }
      group.append(head, row);
      if (mine.length) {
        const keepRound = mine[0].kind === 'draft_keep';
        const confirm = el('button', 'forkmove forkconfirm');
        confirm.type = 'button';
        confirm.style.setProperty('--pc', seatColor(seat));
        const match = () => mine.find((a) => (keepRound ? [...a.args.keep].sort().join() === [...sel].sort().join() : a.args.variant === sel[0]));
        const refresh = () => { confirm.textContent = 'Confirm (' + sel.length + '/' + (keepRound ? 2 : 1) + ')'; confirm.disabled = forkBusy || !match(); };
        for (const [card, v] of choosers.splice(0)) {
          card.addEventListener('click', (ev) => {
            ev.stopImmediatePropagation();
            const i = sel.indexOf(v);
            if (i >= 0) sel.splice(i, 1); else { if (sel.length >= (keepRound ? 2 : 1)) sel.shift(); sel.push(v); }
            for (const n of row.querySelectorAll('.choosable')) n.classList.toggle('marked', sel.includes(n.firstChild.alt));
            refresh();
          }, true);
        }
        confirm.onclick = () => { const act = match(); if (act) playFork(act); };
        refresh();
        group.append(confirm);
      }
      groups.push(group);
    }
    if (!groups.length) return false;
    bar.hidden = false;
    bar.classList.add('draftbar');
    bar.append(...groups);
    return true;
  }
  function actionBar(st) {
    forkClaimed = new Set();
    forkGate = false;
    const bar = $('actionbar');
    bar.replaceChildren();
    bar.classList.remove('draftbar');
    const cur = replay.steps[step], o = cur.options;
    if (st.phase === 'setup' && st.draft && st.draft.stage !== 'done' && draftBar(bar, st.draft)) return;       // the action card draft at the start of the game
    // the step that puts the action card back on slot 1 ends the turn (the state already passes it on): the player has to confirm it. In the replay the buttons
    // are only shown, greyed out; in the game Confirm passes the turn, Undo takes back the last effect that can be taken back, Restart turn all of them
    const before = step > 0 ? replay.steps[step - 1].state : null;
    if (before && st.turn > before.turn && st.active_player !== before.active_player && (before.phase === 'turn' || before.phase === 'final_turns') && !(FORK && forkConfirmed === step)) {
      bar.hidden = false;
      forkGate = FORK;
      const who = el('span', 'who', replay.players[before.active_player].name);
      who.style.color = seatColor(before.active_player);
      bar.append(who, el('b', '', ' must confirm or restart your turn'));
      if (FORK) turnButtons(bar, before.turn, before.active_player, true);
      else for (const [cls, label, tip] of [['confirm', 'Confirm', 'Confirm the turn and pass to the next player'],
                                            ['undo', 'Undo last step', 'Take back the last effect (only if it can be taken back)'],
                                            ['restart', 'Restart turn', 'Take back all the steps of the turn (to its start or the last effect that cannot be taken back)']]) {
        const b = el('button', 'turnbtn ' + cls, label);
        b.type = 'button'; b.disabled = true; b.title = tip + ' - not available in the replay';
        bar.append(b);
      }
      return;
    }
    const fromEngine = cur.engine && cur.engine.source === 'engine';
    const seat = o ? o.seat : st.active_player;
    const choosing = o ? true : !fromEngine && (st.phase === 'turn' || st.phase === 'final_turns') && !st.current_action && st.players[seat] && st.players[seat].action_cards;
    bar.hidden = !choosing;
    if (!choosing) return;
    if (o && o.prompt !== 'choose_action_card') { genericBar(bar, st, o, seat); return; }
    const p = st.players[seat];
    // X tokens already paid for this action ("pays 1 xtoken for increasing card strength" comes before the card is chosen): they raise every strength
    let spent = 0;
    for (let j = step; j >= 0; j--) {
      const m = /pays (\d+) xtoken for increasing card strength/.exec(replay.steps[j].label || '');
      if (!m) break;
      spent += +m[1];
    }
    const fa = FORK ? (cur.actions || []) : [];                           // the fork: the bar is the way to play (the engine's legal actions are compiled from the clicks)
    const mayChoose = (type) => fa.some((x) => x.kind === 'choose_action_card' && x.args.spend === forkSpend && x.args.type === type);
    const maySkip = (type) => fa.some((x) => x.kind === 'skip_action' && x.args.type === type);
    if (FORK) spent += forkSpend;
    const who = el('span', 'who', replay.players[seat].name);
    who.style.color = seatColor(seat);
    bar.append(who, el('b', '', o && o.only ? ' must choose the second action' : ' must choose an action card'));
    p.action_cards.forEach((a, i) => {
      const b = el('span', 'abtn' + (a.level === 2 ? ' lvl2' : '') + (o && !o.cards[a.type] ? ' off' : ''));       // (greyed out: the engine does not offer it)
      b.title = ACTION_NAMES[a.type] + (a.level === 2 ? ' II' : '') + ', strength ' + (i + 1 + spent) + ' (up to ' + (i + 1 + spent + p.x_tokens) + ' with X tokens)';
      b.append(pic(ACTION_ICON[a.type], 26), el('b', '', i + 1 + spent));
      if (FORK && (skipMode ? maySkip(a.type) : mayChoose(a.type))) {
        b.classList.add('choosable');
        b.title = skipMode ? 'Put ' + ACTION_NAMES[a.type] + ' back to slot 1 and gain an X token' : 'Choose ' + ACTION_NAMES[a.type] + (forkSpend ? ', spending ' + forkSpend + ' X token' + (forkSpend === 1 ? '' : 's') : '');
        b.onclick = () => {
          const pool = fa.filter((x) => (skipMode ? x.kind === 'skip_action' && x.args.type === a.type && !x.args.repeat
                                                  : x.kind === 'choose_action_card' && x.args.type === a.type && x.args.spend === forkSpend && !x.args.hypnosis && !x.args.t1));
          if (pool.length && !forkBusy) playFork(pool[0]);
        };
      } else if (FORK) b.classList.add('off');
      if (replay.marine_worlds && a.variant) {          // the variant's silver effect badge, like on the action card in the tracker
        const v = el('img', 'variant');
        v.src = '/action_icons/' + a.type + '_' + a.variant + '_' + (a.level === 2 ? 2 : 1) + '.webp'; v.alt = 'Variant ' + a.variant;
        b.append(v);
      }
      bar.append(b);
    });
    // spending X tokens raises the strength of the chosen card: - (nothing spent yet, so greyed out) | X tokens | + (greyed out without tokens)
    const xs = (sign, label, off) => {
      const btn = el('button', 'xstep', sign);
      btn.type = 'button'; btn.title = label; btn.disabled = off; btn.setAttribute('aria-label', label);
      return btn;
    };
    const maxSpend = o ? Math.max(0, ...Object.values(o.cards).flat()) : p.x_tokens;       // the most X tokens the engine lets the player spend
    const x = el('span', 'abtn xbtn');
    x.title = 'X tokens that can raise the strength of the chosen card';
    x.append(el('b', '', p.x_tokens), pic('xtoken', 26));
    const minus = xs('−', 'Spend one X token less', FORK ? forkSpend === 0 : spent === 0);
    const plus = xs('+', 'Spend one more X token to raise the strength', FORK ? !fa.some((x) => x.kind === 'choose_action_card' && x.args.spend > forkSpend) : o ? maxSpend - spent <= 0 : p.x_tokens === 0);
    if (FORK) {
      minus.onclick = () => { forkSpend--; refreshBar(); };
      plus.onclick = () => { forkSpend++; refreshBar(); };
    }
    bar.append(minus, x, plus);
    // or put one of the action cards back to slot 1 and gain an X token (not possible at the maximum of 5)
    const canGain = FORK ? fa.some((x) => x.kind === 'skip_action') : o ? o.skip.length > 0 : p.x_tokens < 5;
    const gain = el('span', 'abtn gainx' + (canGain ? '' : ' off') + (FORK && skipMode ? ' on' : ''));
    if (FORK && canGain) {
      gain.classList.add('choosable');
      gain.onclick = () => { skipMode = !skipMode; refreshBar(); };
    }
    gain.title = !canGain ? 'Not possible now (the maximum is 5 X tokens)' : 'Instead of an action: put one action card back to slot 1 and gain an X token';
    const rawIcon = (id, h) => { const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = ''; i.height = h; return i; };
    gain.append(rawIcon('r6c6', 30), el('b', '', ':'), rawIcon('r5c6', 26));
    bar.append(gain);
  }

  // the building pieces the engine lets the player place now (affordable with the money and the strength left); the extra kiosk / pavilion of a Build
  // variant comes first, with the variant's silver badge to tell it from a normal one
  const PIECE_SCALE = 0.3;
  function piecesRow(o) {
    const row = el('span', 'pieces');
    for (const piece of o.pieces) {
      const sp = spriteOf({ type: piece.type });
      const name = piece.type.replace(/-/g, ' ') + (piece.extra ? ' (additional, from the Build variant)' : '');
      const w = el('span', 'piece' + (piece.extra ? ' extra' : ''));
      w.title = name;
      if (sp) {
        const img = el('img');
        img.src = '/enclosures/' + sp.image; img.alt = name;
        const k = Math.min(PIECE_SCALE, 240 / sp.size[1]);                        // (the tallest pieces are scaled down to fit the bar)
        img.style.width = (sp.size[0] * k) + 'px'; img.style.height = (sp.size[1] * k) + 'px';
        w.append(img);
      } else {
        w.append(el('span', 'abtn gen', piece.type));
      }
      if (piece.extra && o.build && o.build.variant) {
        const v = el('img', 'variant');
        v.src = '/action_icons/build_' + o.build.variant + '_' + (o.build.level === 2 ? 2 : 1) + '.webp'; v.alt = 'Build variant ' + o.build.variant;
        w.append(v);
      }
      row.append(w);
    }
    return row;
  }

  // taking cards: what it is for, and the button to draw from the deck; the display cards that can be taken are the ones not greyed out
  const SOURCE_TEXT = { bonus: 'placement bonus', 'reputation track': 'reputation track', association4: 'association', map13: 'map bonus' };
  // the action card of the running action with its strength, as in front of BGA's prompt
  function actionBadge(st) {
    const ca = st.current_action || {};
    const card = (st.players[ca.seat] && st.players[ca.seat].action_cards[ca.slot - 1]) || {};      // (the log-built state only knows the slot of the card)
    const type = ca.type || card.type, level = ca.level || card.level;
    const b = el('span', 'abtn' + (level === 2 ? ' lvl2' : ''));
    b.title = (ACTION_NAMES[type] || '') + (level === 2 ? ' II' : '') + ', strength ' + ca.strength;
    if (type) b.append(pic(ACTION_ICON[type], 26), el('b', '', ca.strength));
    return b;
  }
  // the Association action: one button per kind of task that can be done now (not one per partner zoo / university)
  const TASK_TEXT = { partner: 'Take a partner zoo', university: 'Take a university', conservation: 'Support a conservation project', hire: 'Hire a worker' };
  function associationBar(bar, o) {
    const chosen = FORK && assocMode && forkActs((a) => a.kind === 'association_task' && a.args.task === assocMode);
    const species = FORK && assocMode === 'university' && assocSpecies !== null && chosen && chosen.filter((a) => a.args.category && (a.args.kind + (a.args.supply ? ':supply' : '')) === assocSpecies);
    if (species && species.length) {                                // a blank university: the species that nobody has taken yet, and only those
      bar.append(el('b', '', ' must choose the species of the university'));
      for (const a of species) {
        const b = el('span', 'abtn deckbtn tilebtn');
        const i = el('img', 'icon'); i.src = iconUrl(ICON_IDS['fac-science-' + a.args.category] || ICON_IDS['bonus:Fac']); i.alt = a.args.category; i.height = 44;
        b.append(i);
        b.title = 'University: ' + a.args.category;
        bindActs(b, [a]);
        bar.append(b);
      }
      const back = el('button', 'forkmove', 'Back');
      back.type = 'button';
      back.onclick = () => { assocSpecies = null; refreshBar(); };
      bar.append(back);
      return;
    }
    if (chosen && chosen.length) {                                  // the fork: the tiles that can be taken, as buttons (the tiles of the board can be clicked too)
      bar.append(el('b', '', ' must choose a ' + (assocMode === 'partner' ? 'partner zoo' : 'university')));
      const groups = new Map();
      for (const a of chosen) {
        const key = (a.args.continent || a.args.kind) + (a.args.supply ? ':supply' : '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(a);
      }
      for (const [key, list] of groups) {
        const name = list[0].args.continent || list[0].args.kind;
        const b = el('span', 'abtn deckbtn tilebtn' + (list[0].args.supply ? ' supply' : ''));
        const i = el('img', 'icon'); i.src = iconUrl(ICON_IDS[name] || ICON_IDS['bonus:Fac']); i.alt = name; i.height = 44;
        b.append(i);
        b.title = (assocMode === 'partner' ? 'Partner zoo: ' : 'University: ') + name.replace(/^fac-/, '').replace(/-/g, ' ') + (list[0].args.supply ? ' (from the supply)' : '');
        if (list.some((a) => a.args.category)) { b.classList.add('choosable'); b.onclick = () => { assocSpecies = key; refreshBar(); }; for (const a of list) forkClaimed.add(a); }
        else bindActs(b, list);
        bar.append(b);
      }
      const back = el('button', 'forkmove', 'Back');
      back.type = 'button';
      back.onclick = () => { assocMode = null; refreshBar(); };
      bar.append(back);
      return;
    }
    bar.append(el('b', '', ' must perform an association task'));
    for (const [task, n] of Object.entries(o.association.tasks)) {
      const b = el('span', 'abtn deckbtn');
      b.title = task + ': ' + n + (n === 1 ? ' possibility' : ' possibilities');
      const tile = (id, tip) => { const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = tip; i.height = 34; return i; };
      if (task === 'reputation') b.append(el('b', '', 'Take 2'), pic('reputation', 26));
      else if (FORK && task === 'partner') { b.append(tile(ICON_IDS['bonus:Partner-Zoo'], TASK_TEXT.partner)); b.title = TASK_TEXT.partner + ': choose the partner zoo'; }
      else if (FORK && task === 'university') { b.append(tile(ICON_IDS['bonus:Fac'], TASK_TEXT.university)); b.title = TASK_TEXT.university + ': choose the university'; }
      else b.append(el('b', '', TASK_TEXT[task] || task));
      if (FORK && (task === 'partner' || task === 'university')) {
        b.classList.add('choosable');
        b.onclick = () => { assocMode = task; refreshBar(); };
      } else bindActs(b, forkActs((a) => a.kind === 'association_task' && a.args.task === task));
      bar.append(b);
    }
    for (const [kind, n] of Object.entries(o.kinds)) {
      if (kind === 'association_task') continue;
      const b = el('span', 'abtn gen');
      b.title = kind + ': ' + n + (n === 1 ? ' option' : ' options');
      b.append(el('b', '', KIND_LABEL[kind] || kind.replace(/_/g, ' ')));
      bar.append(b);
    }
  }
  // the Sponsors action: play a sponsor (click it in the hand; the cards that cannot be played are greyed out) or break for money
  function sponsorsBar(bar, o) {
    const sp = o.sponsors;
    const text = sp.played ? ' may play another sponsor card' : sp.level >= 2 ? ' must play sponsor cards from hand or display or break for money' : ' must play one sponsor card from hand or break for money';
    bar.append(el('b', '', text));
    if (sp.can_break) {
      const b = el('span', 'abtn deckbtn');
      b.title = 'Instead of playing a sponsor: advance the break token by the strength and gain money';
      b.append(el('b', '', 'Break ' + sp.strength + ', Gain ' + sp.gain));
      bindActs(b, forkActs((a) => a.kind === 'sponsor_break'));
      bar.append(b);
    }
    for (const [kind, n] of Object.entries(o.kinds)) {
      if (kind === 'play_sponsor' || kind === 'sponsor_break') continue;
      const b = el('span', 'abtn gen');
      b.title = kind + ': ' + n + (n === 1 ? ' option' : ' options');
      b.append(el('b', '', KIND_LABEL[kind] || kind.replace(/_/g, ' ')));
      bar.append(b);
    }
  }
  function takeBar(bar, o, seat) {
    const t = o.take;
    let text;
    if (t.remaining !== undefined) {                      // the Cards action: draw (and discard) or snap
      const n = t.remaining, s = n === 1 ? ' card' : ' cards';
      text = ' must take ' + n + (t.taken ? ' more' : '') + s + (t.range.length ? ' from deck or display in reputation range' : ' from deck') + (t.discard ? ' (and discard ' + t.discard + ')' : '')
        + (t.snapping && !t.taken ? ' or snap ' + t.snaps_left + ' card(s)' : '');
    }
    else {
      const src = t.source ? (SOURCE_TEXT[t.source] || (/^[ASPF]\d{3}$/.test(t.source) ? cardName(t.source) : t.source)) : '';
      text = ' must ' + (t.is_snap ? 'snap 1 card from the display' + (t.small ? ' (a small animal)' : '') : 'take 1 card from display in reputation range') + (src ? ' (' + src + ')' : '');
    }
    bar.append(el('b', '', text));
    if (t.deck && !t.range_only) {
      const b = el('span', 'abtn deckbtn');
      b.title = 'Draw from the deck';
      b.append(el('b', '', t.remaining !== undefined && t.deck === t.remaining && t.deck > 1 ? 'Draw all ' + t.deck + ' cards from deck' : t.deck > 1 ? 'Draw up to ' + t.deck + ' cards from deck' : 'Draw one card from deck'));
      bindActs(b, forkActs((a) => a.kind === 'take_cards' && a.args.mode === 'deck'));
      bar.append(b);
    }
  }

  // the buttons of the pending effects. Reputation, appeal and conservation gains, project rewards, placement bonuses and animal abilities are choices of the
  // player; money and X token gains happen by themselves (no button).
  const EFFECT_TEXT = {
    build: 'Build', take: 'Take a card', reveal: 'Reveal cards', sell: 'Sell cards', mark: 'Mark an animal', marketing: 'Marketing', donation: 'Donate', digging: 'Dig',
    scavenge: 'Scavenge', glide: 'Glide', glide_gain: 'Glide', shark: 'Shark attack', symbiosis: 'Symbiosis', cut_down: 'Cut down', trade: 'Trade', extra_shift: 'Extra shift',
    assertion: 'Assertion', pilfer: 'Pilfer', venom: 'Venom', constrict: 'Constriction', hypnosis: 'Hypnosis', pay_appeal: 'Pay appeal', slot1: 'Card to slot 1', boost: 'Boost',
    waza: 'Waza', reposition: 'Reposition', pouch: 'Pouch a card', search_discard: 'Search the discard pile', upgrade: 'Upgrade an action card', threshold2: 'Upgrade or worker',
    threshold_bonus: 'Choose a bonus', endgame_discard: 'Discard an endgame card', adapt: 'Adapt', break_discard: 'Discard to the hand limit', take_tile: 'Take a tile',
    archaeologist: 'Archaeologist', income_appeal: 'Income', project_bonus: 'Project bonus', tutor: 'Search for a card', reef: 'Reef', ability: 'Animal ability',
  };
  const AUTOMATIC_GAINS = new Set(['money', 'xtoken']);
  function effectButton(e) {
    if (e.kind === 'gain' && AUTOMATIC_GAINS.has(e.res)) return null;
    if (e.kind === 'take' || e.kind === 'build') return null;                      // shown as the deck button / the pieces
    if (FORK && forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index && Array.isArray(a.args.cards)).length) return null;       // (the cards are chosen in the hand: see forkBar)
    const b = el('span', 'abtn deckbtn');
    const src = e.source && /^[ASPF]\d{3}$/.test(e.source) ? cardName(e.source) : '';
    b.title = (e.name || EFFECT_TEXT[e.kind] || e.kind) + (src ? ' (' + src + ')' : '') + (e.optional ? ' - optional' : '');
    const SEARCH_ICON = { bird: ['Bird', 'r2c3'], herbivore: ['Herbivore', 'r2c4'], predator: ['Predator', 'r2c5'], primate: ['Primate', 'r2c6'], reptile: ['Reptile', 'r2c7'], marine: ['Sea animal', 'r2c8'] };
    if (e.kind === 'gain') {
      b.append(el('b', '', 'Gain ' + (e.n || 1)), pic(e.res, 26));
    } else if (e.kind === 'search_category' && SEARCH_ICON[e.category]) {        // a targeted search: "Find a {species}" with the species' search icon
      const [label, id] = SEARCH_ICON[e.category];
      const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = ''; i.height = 28;
      b.append(el('b', '', 'Find a ' + label.toLowerCase()), i);
      b.title = 'Search the deck for the first ' + label.toLowerCase() + ' card';
    } else {
      b.append(el('b', '', e.name || EFFECT_TEXT[e.kind] || e.kind.replace(/_/g, ' ')));
    }
    if (FORK && (e.kind === 'threshold2' || e.kind === 'upgrade') && forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index && (a.args.upgrade || a.args.hire)).length) {
      b.classList.add('choosable');                                      // (click it: gain a worker or an upgrade, see forkBar)
      b.onclick = () => { thresholdMode = { index: e.index, stage: e.kind === 'upgrade' ? 'upgrade' : 'choose' }; refreshBar(); };
    } else if (FORK && e.kind === 'marketing' && forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index && typeof a.args.card === 'string').length) {
      b.classList.add('choosable');                                      // (click it, then choose the sponsor in the hand: see forkBar)
      b.onclick = () => { marketMode = e.index; forkDockStep = -1; refreshBar(); renderDock(curState()); };
    } else bindActs(b, forkActs((a) => a.kind === 'choose_effect' && a.args.index === e.index));
    return b;
  }

  // any other decision of the engine: who must do what, and the kinds of action it offers (with how many options each)
  function genericBar(bar, st, o, seat) {
    const who = el('span', 'who', replay.players[seat].name);
    who.style.color = seatColor(seat);
    if (o.discard) {                                            // no buttons: in the game the player clicks the cards of the hand, then a Confirm button appears
      let who2 = who, count = o.discard.count;
      if (o.prompt === 'effects' && o.discard.what === 'card') {
        // the hand limit at a break: the engine has the discard pending from the moment the break is triggered, the log only from "Starting a new break" on, and it
        // is the player over the limit (by the log's hand) who has to discard
        let inBreak = false;
        for (let j = step; j >= 0; j--) {
          const label = replay.steps[j].label || '';
          if (/^End of the break/.test(label)) break;
          if (/^Starting a new break/.test(label)) { inBreak = true; break; }
        }
        const over = st.players.map((q, i) => ({ i, n: q.hand.length - q.hand_limit })).filter((q) => q.n > 0);
        if (!inBreak || !over.length) { bar.hidden = true; return; }
        who2 = el('span', 'who', replay.players[over[0].i].name);
        who2.style.color = seatColor(over[0].i);
        count = over[0].n;
      }
      bar.append(who2, el('b', '', ' must discard ' + count + ' ' + o.discard.what + '(s)'));
      return;
    }
    if (o.association) {
      bar.append(actionBadge(st), who);
      associationBar(bar, o);
      return;
    }
    if (o.sponsors) {
      bar.append(actionBadge(st), who);
      sponsorsBar(bar, o);
      return;
    }
    if (o.take) {
      if (o.prompt === 'cards_take') bar.append(actionBadge(st));
      bar.append(who);
      takeBar(bar, o, seat);
      return;
    }
    const effectsOnly = o.prompt === 'effects' && !o.take && !(o.pieces && o.pieces.length);       // (the effect buttons say it all)
    if (effectsOnly) bar.append(who);
    else bar.append(who, el('b', '', ' ' + (PROMPT_TEXT[o.prompt] || 'must decide (' + o.prompt + ')')));
    let shown = 0;
    const label = replay.steps[step].label || '';
    const drawn = /draw .* for (perception|hunter|scuba dive) effect/i.test(label);          // the cards of a reveal-and-keep effect have been drawn: the player now chooses
    for (const e of o.effects || []) {                          // every effect the player can resolve has its own button (in any order); automatic gains have none
      if (e.kind === 'reveal' && drawn) {
        const n = e.n || 1;
        bar.append(el('b', '', ' must choose ' + n + ' card' + (n === 1 ? '' : 's') + ' to keep'));
        shown++;
        continue;
      }
      const b = effectButton(e);
      if (b) { bar.append(b); shown++; }
    }
    if (o.pieces && o.pieces.length && !FORK) bar.append(piecesRow(o));
    for (const [kind, n] of Object.entries(o.kinds)) {
      if (kind === 'place_building' && o.pieces && o.pieces.length) continue;       // shown as the pieces themselves
      if (kind === 'choose_effect' || kind === 'take_cards' || (o.prompt === 'effects' && kind === 'place_building')) continue;      // shown as the effect buttons / cards
      const b = el('span', 'abtn gen');
      b.title = kind + ': ' + n + (n === 1 ? ' option' : ' options');
      b.append(el('b', '', KIND_LABEL[kind] || kind.replace(/_/g, ' ')));
      if (n > 1) b.append(el('i', '', '×' + n));
      bar.append(b);
    }
    if (!Object.keys(o.kinds).length) bar.append(el('span', 'abtn gen off', 'nothing to choose'));
    if (effectsOnly && bar.querySelector('.abtn')) who.after(el('b', '', ' must choose an effect to resolve'));       // (an effect without a prompt of its own, or several waiting)
    if (effectsOnly && !bar.querySelector('.abtn') && !shown) bar.hidden = true;                // only automatic gains are pending: nothing for the player to do
  }

  // the cards of the display a player can reach at this reputation (engine cards_action.reputation_range)
  const repRange = (rep) => (rep <= 1 ? 1 : rep <= 3 ? 2 : rep <= 6 ? 3 : rep <= 9 ? 4 : rep <= 12 ? 5 : 6);

  // The conservation track for the first 10 points, above the display (BGA's picture); a cube per player. It goes away when both players are past 10.
  // At 5 and 8 the two random bonuses of the game still on offer lie to the left and right of the arrows, like the upgrade / worker at 2.
  const CT_X = (n) => (88 + 182.4 * n) / 2000;                       // centre of the space n on the picture (2000 px wide version)
  const CT_BONUS_X = { 5: [905, 1095], 8: [1457, 1643] };            // where the two random bonus tiles lie under the arrows
  // a bonus tile of the conservation track: the bonus tokens (bonus-...) are whole tiles of the icon sheet; the others (university, partner zoo, money, X tokens...)
  // are drawn like the placement bonuses of the zoo map: the yellow pentagon with the icon, and the amount for money and X tokens
  function bonusTile(name, value) {
    if (name.startsWith('bonus-') && iconNames[name]) {
      const t = el('img', 'ctbonus');
      t.src = iconUrl(iconNames[name]); t.alt = name;
      return t;
    }
    const id = ICON_IDS['bonus:' + name];
    if (!id) return null;
    // drawn in the units of the placement bonuses of the zoo map (pentagon 80, icon 48, numbers in the same typography)
    const t = svg('svg', { class: 'ctbonus ctcomposed', viewBox: '0 0 80 80' });
    const picture = (iconId, cx, cy, h) => {
      const [w0, h0] = iconSizes[iconId] || [h, h];
      t.append(svg('image', { href: iconUrl(iconId), x: cx - (w0 * h / h0) / 2, y: cy - h / 2, width: w0 * h / h0, height: h }));
    };
    picture(ICON_IDS.pentagon, 40, 40, 80);
    if (name === 'money') {
      moneyTile(t, 40, 43, 48);
      if (value) t.append(Object.assign(svg('text', { x: 40, y: 56, class: 'bonus-number' }), { textContent: value }));      // on top of the money icon
    } else if (name === 'reputation' || name === 'appeal' || name === 'conservation') {
      picture(id, 40, 43, 48);
      if (value) t.append(Object.assign(svg('text', { x: 40, y: 59, class: 'bonus-number' }), { textContent: value }));      // the amount over the icon, like the other reputation bonuses
    } else if (name === 'take-in-range-or-deck' && value > 1) {
      picture(id, 52, 43, 48);
      t.append(Object.assign(svg('text', { x: 16, y: 55, class: 'bonus-number', style: 'font-size:38px' }), { textContent: value }));   // the amount to the left of the icon
    } else if (name === 'xtoken' && value > 1) {
      picture(id, 50, 43, 48);
      t.append(Object.assign(svg('text', { x: 23, y: 55, class: 'bonus-number', style: 'font-size:38px' }), { textContent: value }));   // the amount to the left of the icon
    } else {
      picture(id, 40, 43, 48);
    }
    return t;
  }
  function conservationTrack(st) {
    if (Math.min(...st.players.map((p) => p.conservation)) > 10) return null;
    const wrap = el('div', 'ctrackwrap');
    const img = el('img', 'ctrack');
    img.src = '/assets/conservation_track.webp'; img.alt = 'Conservation track';
    wrap.append(img);
    const first = SANDBOX ? sbMeta().initial : replay.steps[0].state.conservation_options || {};     // the options of the game as dealt: a taken one leaves its place empty
    for (const th of ['5', '8']) {
      const left = (st.conservation_options || {})[th] || [];
      (first[th] || []).forEach((opt, i) => {
        if (SANDBOX && !replay.setup && sbMeta().unset['b' + th][i]) {                            // not set yet: randomize / choose
          const b = sbSlotButtons(th, i);
          b.style.left = (CT_BONUS_X[th][i] / 2000 * 100) + '%';
          wrap.append(b);
          return;
        }
        if (!left.some((o) => JSON.stringify(o) === JSON.stringify(opt))) return;
        const [name] = Object.keys(opt);
        const t = bonusTile(name, opt[name]);
        if (!t) return;
        t.title = 'Bonus at ' + th + ' conservation: ' + name.replace(/^bonus-/, '').replace(/-/g, ' ') + (opt[name] > 1 ? ' (' + opt[name] + ')' : '');
        t.style.left = (CT_BONUS_X[th][i] / 2000 * 100) + '%';
        wrap.append(t);
      });
    }
    st.players.forEach((p, seat) => {
      if (p.conservation > 10) return;                                   // past the end of this track
      const same = st.players.filter((q) => q.conservation === p.conservation);
      const cube = blockedCube(0, seatColor(seat), replay.players[seat].name + ': conservation ' + p.conservation);
      cube.setAttribute('class', 'trackcube');
      cube.style.left = ((CT_X(p.conservation) + (same.length > 1 ? (seat - 0.5) * 0.03 : 0)) * 100) + '%';
      cube.style.top = '26%';
      wrap.append(cube);
    });
    return wrap;
  }

  function renderShared(st) {
    actionBar(st);
    const root = $('shared');
    root.replaceChildren();
    // the display: each card lies in a folder, numbered 1-6 on the brown tab (the number is the cost in reputation range / position of the slot)
    const row = el('div', 'cards folders');
    const displayNew = zoneNew('display', st.display);
    const displayGone = displayNew.gone;
    st.display.forEach((k, i) => {
      const f = el('div', 'folder');
      const allowed = (replay.steps[step].options || {}).take;                       // while taking cards, the cards that cannot be taken are greyed out
      const sps = (replay.steps[step].options || {}).sponsors;
      const dim = (allowed && k && !allowed.range.includes(k) && !allowed.snap.includes(k)) || (sps && sps.level >= 2 && k && !sps.display.includes(k));
      if (k) f.append(card(k, (displayNew.isNew(k) ? 'card-new' : '') + (dim ? ' dim' : '') + (FORK && cardMarks.has('display#' + i) ? ' marked' : '')));
      if (k && FORK) {                                                              // a card of the display can be chosen for a move
        f.classList.add('markable');
        f.addEventListener('click', () => { const m = 'display#' + i; if (cardMarks.has(m)) cardMarks.delete(m); else { for (const x of [...cardMarks]) if (x.startsWith('display#') || /:hand#/.test(x)) cardMarks.delete(x); cardMarks.add(m); } renderShared(curState()); refreshBar(); });
      }
      for (const g of displayGone) if (g.index === i) f.append(ghost(g.key));       // the card that left this slot fades away on top of it
      f.append(el('span', 'folnum', i + 1));
      const owner = k ? markOwner(st, k) : -1;                         // a Mark cube of a player lies on the animal
      if (owner >= 0) f.append(markCube(owner));
      row.append(f);
    });
    const box = el('div', 'displaybox');
    const ctrack = conservationTrack(st);
    if (ctrack) box.append(ctrack);
    box.append(row);
    // the reputation track under the folders: its 6 equal stretches (hat | 2-3 | 4-6 | 7-9 | 10-12 | 13-15) lie under folders 1-6, i.e. the cards a player can reach
    // at 1 | 2-3 | 4-6 | 7-9 | 10-12 | 13-15 reputation (engine cards_action.reputation_range)
    const track = el('img', 'reptrack');
    track.src = '/assets/reputation_track.webp'; track.alt = 'Reputation track'; track.title = 'Reputation track: the cards under each stretch can be taken at that reputation';
    const repWrap = el('div', 'reptrackwrap');
    repWrap.append(track);
    // a cube per player on the stretch of the track they can draw from (the cell with their reputation lies under the last folder in reach)
    const repX = [163, 163, 406, 568, 703, 811, 919, 1027, 1135, 1242, 1351, 1459, 1567, 1675, 1783, 1891];       // centres of the cells 1..15 (+ the first one again) on the 2000 px wide picture
    const repCubes = st.players.map((p, seat) => ({ seat, x: repX[Math.max(0, Math.min(15, p.reputation))] / 2000, rep: p.reputation }));
    repCubes.forEach((c, i) => {
      const same = repCubes.filter((o) => o.x === c.x);
      const cube = blockedCube(0, seatColor(c.seat), replay.players[c.seat].name + ': reputation ' + c.rep + ', draws from the first ' + repRange(c.rep) + ' cards of the display');
      cube.setAttribute('class', 'trackcube');
      cube.style.left = ((c.x + (same.length > 1 ? (same.indexOf(c) - 0.5) * 0.026 : 0)) * 100) + '%';
      cube.style.top = '50%';
      repWrap.append(cube);
    });
    // what each stretch of the track pays when it is reached, under its space (5 upgrade, 8 worker, 10 / 13 a card, 11 / 14 conservation, 12 / 15 X token),
    // and the card upgrade requirements icon on the border between 9 and 10
    const REP_REWARDS = { 5: ['upgrade-card', 1, 'upgrade an action card'], 8: ['Worker', 1, 'hire a worker'], 10: ['take-in-range-or-deck', 1, 'take a card from the deck or the reputation range'],
                          11: ['conservation', 1, '1 conservation'], 12: ['xtoken', 1, '1 X token'], 13: ['take-in-range-or-deck', 1, 'take a card from the deck or the reputation range'],
                          14: ['conservation', 1, '1 conservation'], 15: ['xtoken', 1, '1 X token'] };
    for (const [rep, [name, value, text]] of Object.entries(REP_REWARDS)) {
      const t = bonusTile(name, value);
      if (!t) continue;
      t.classList.add('repreward');
      t.style.left = (repX[+rep] / 2000 * 100) + '%';
      t.setAttribute('title', 'Reputation ' + rep + ': ' + text);
      repWrap.append(t);
    }
    // Marine Worlds: the bonus drawn for 16 reputation (a point gained at 15 may be traded for it) sits above the appeal space at the end of the track, until it is taken
    const bonus16 = replay.marine_worlds && ((st.conservation_options || {})['99'] || [])[0];
    if (SANDBOX && !replay.setup && replay.marine_worlds && sbMeta().unset.b99 && sbMeta().unset.b99[0]) {
      const b = sbSlotButtons('99', 0);
      b.classList.add('rep16');
      b.style.left = '98.6%';
      repWrap.append(b);
    } else if (bonus16) {
      const [name] = Object.keys(bonus16);
      const t = bonusTile(name, bonus16[name]);
      if (t) {
        t.classList.add('rep16');
        t.style.left = '98.6%';
        t.setAttribute('title', 'Reputation 16: ' + name.replace(/^bonus-/, '').replace(/-/g, ' ') + (bonus16[name] > 1 ? ' (' + bonus16[name] + ')' : '') + ' - a reputation point gained at 15 may be traded for it');
        repWrap.append(t);
      }
    }
    const req = el('div', 'repupgrade');                                 // the icon in a red circle with a white border, a dark red box with a white "II" below it
    req.title = 'Action card upgrade requirements';
    const disc = el('span', 'repupdisc'), icon = el('img');
    icon.src = iconUrl('r3c10'); icon.alt = 'Action card upgrade requirements';
    disc.append(icon, el('span', 'repupbox', 'II'));
    req.append(disc);
    req.style.left = ((repX[9] + repX[10]) / 2 / 2000 * 100) + '%';
    repWrap.append(req);
    box.append(repWrap);
    root.append(section('Display', box, 'sect displaycol'));
    const col = el('div', 'tablecol');
    // projects played during the game: the newest enters on the left and pushes the others right; a third one pushes the oldest off to the discard
    col.append(projectPanel(st, st.projects_in_play, 2, 'conservation-project', 'Conservation projects in play'));
    col.append(associationBoard(st));
    if (SANDBOX && !replay.setup) {                                            // the sandbox starts with empty base project slots: two buttons in the centre set them
      const unset = sbMeta().unset.projects;
      const panel = projectPanel(st, st.base_projects.map((k, n) => (unset[n] ? null : k)), 3, 'conservation-project-base', 'Base conservation projects', true);
      const taken = st.base_projects.filter((k, n) => !unset[n]);
      [...panel.querySelectorAll('.projslot')].forEach((slotEl, n) => {            // each empty slot has its own two buttons
        if (!unset[n]) return;
        const over = el('div', 'sbcenter');
        over.append(sbButton('Randomize', 'Draw this base project at random', () => sbEdit('set_projects', { slots: [n], keys: [null] })),
                    sbButton('Choose…', 'Choose this base project', async () => { const keys = await sbPickProjects(1, taken); if (keys) sbEdit('set_projects', { slots: [n], keys }); }));
        slotEl.classList.add('sbhost');
        slotEl.append(over);
      });
      col.append(panel);
    } else col.append(projectPanel(st, replay.base_projects, 3, 'conservation-project-base', 'Base conservation projects', true));
    root.append(col);
  }

  // ---- the popup that lists the cards of the discard pile / the endgame deck (stays open while stepping, closes with the X, Escape or a click outside) ----
  let openedPile = null;
  function openPile(which) { openedPile = which; renderPile(); }
  function closePile() { openedPile = null; renderPile(); }
  function renderPile() {
    let box = $('pile');
    if (!openedPile) { if (box) box.hidden = true; return; }
    if (!box) {
      box = el('div', 'pile'); box.id = 'pile';
      box.addEventListener('click', (e) => { if (e.target === box) closePile(); });
      document.body.append(box);
    }
    const st = curState();
    const keys = openedPile === 'discard' ? st.main_discard.slice().reverse() : openedPile === 'deck' ? st.main_deck.slice() : st.endgame_deck.slice().sort();      // the newest discard first; the draw pile top first; the endgame deck is shown unordered
    const secret = pov !== null && openedPile !== 'discard';             // the contents of the draw pile and of the endgame deck are hidden in a player's point of view
    const win = el('div', 'pilewin');
    const head = el('div', 'pilehead');
    head.append(el('h2', '', (openedPile === 'discard' ? 'Discard pile' : openedPile === 'deck' ? 'Draw pile, top first' : 'Endgame cards left (unordered)') + ' - ' + (secret ? (openedPile === 'deck' ? st.main_deck_size : st.endgame_deck_size) : keys.length) + ' card' + ((secret ? 1 : keys.length) === 1 ? '' : 's')));
    const x = el('button', 'pileclose', '✕');
    x.type = 'button'; x.title = 'Close (Escape)'; x.setAttribute('aria-label', 'Close');
    x.onclick = closePile;
    head.append(x);
    const grid = el('div', 'cards pilegrid');
    if (secret) {
      const n = openedPile === 'deck' ? st.main_deck_size : st.endgame_deck_size;
      grid.append(el('div', 'pilenote', 'Hidden in this point of view: ' + n + ' card' + (n === 1 ? '' : 's') + ' are left. Switch to "All hands" to see what is in this pile.'));
    } else if (!keys.length) grid.append(el('span', 'empty', 'no cards'));
    const known = openedPile === 'deck' ? st.main_deck_known || 0 : 0;
    (secret ? [] : keys).forEach((k, i) => {
      if (FORK && openedPile === 'deck' && i === 0) grid.append(el('div', 'pilenote', 'The order of this fork, set by seed ' + forkInfo.seed + ': the next card to be drawn comes first.'));
      else if (openedPile === 'deck' && i === 0 && known > 0) grid.append(el('div', 'pilenote', 'The order of these ' + known + ' cards is real: the log shows them being drawn later'));
      if (!FORK && openedPile === 'deck' && i === known) grid.append(el('div', 'pilenote guess', 'The log never shows the order of the other ' + (keys.length - known) + ' cards: this order is a random guess'));
      grid.append(card(k));
    });
    win.append(head, grid);
    box.replaceChildren(win);
    box.hidden = false;
  }

  // ---- the side panel above the move log (like BGA's player panels): break track, decks, then per player score, resources, action cards and icon counters ----
  const SUMMARY = ['Africa', 'Americas', 'Asia', 'Australia', 'Europe', 'Bird', 'Predator', 'Herbivore', 'Reptile', 'Primate', 'Bear', 'Pet', 'Science', 'Rock', 'Water'];
  const ACTION_ICON = { animals: 'action-animals', association: 'action-association', build: 'action-build', cards: 'action-cards', sponsors: 'action-sponsors' };
  let iconNames = {};                             // web/icons/names.json: BGA icon name -> icon id
  function pic(name, h) {
    const id = iconNames[name];
    if (!id) return document.createTextNode('');
    const img = el('img', 'icon');
    img.src = iconUrl(id); img.alt = name; img.title = name; img.height = h;
    return img;
  }
  // the draw pile (two grey cards, the count on the front one) and the discard pile (count and a trash can), drawn like BGA's
  function deckIcon(n) {
    const w = el('span', 'dc');
    w.title = 'Cards in the deck';
    const s = svg('svg', { viewBox: '0 0 72 56', width: 72, height: 56 });
    s.append(svg('rect', { x: 26, y: 3, width: 40, height: 48, rx: 6, transform: 'rotate(8 46 27)', fill: '#7d7a73', stroke: '#2b2b2b', 'stroke-width': 3 }));
    s.append(svg('rect', { x: 8, y: 6, width: 40, height: 48, rx: 6, fill: '#8d8a83', stroke: '#2b2b2b', 'stroke-width': 3 }));
    s.append(svg('rect', { x: 12, y: 10, width: 32, height: 40, rx: 4, fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 2 }));
    const t = svg('text', { x: 28, y: 36, class: 'deck-num', style: 'font-size:' + (String(n).length > 2 ? 17 : 22) + 'px' });
    t.textContent = n;
    s.append(t);
    w.append(s);
    return w;
  }
  function discardIcon(n) {
    const w = el('span', 'dc');
    w.title = 'Cards in the discard pile';
    w.append(el('b', '', n));
    const s = svg('svg', { viewBox: '0 0 44 48', width: 40, height: 44 });
    s.append(svg('rect', { x: 2, y: 2, width: 40, height: 44, rx: 9, fill: '#5d5a54', stroke: '#fff', 'stroke-width': 2.5 }));
    s.append(svg('rect', { x: 2, y: 2, width: 40, height: 44, rx: 9, fill: 'none', stroke: '#1d1d1d', 'stroke-width': 1 }));
    s.append(svg('path', { d: 'M13 16h18M18 16v-3h8v3M15 19l1.5 17a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2L29 19z', fill: 'none', stroke: '#111', 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    s.append(svg('path', { d: 'M20 22v12M24 22v12', stroke: '#111', 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
    w.append(s);
    return w;
  }
  // score = appeal + conservation points (-14 at 0, +2 per step to 10, then +3): same rule as engine/tracks.py, used when the server did not send it
  const trackScore = (p) => Math.max(0, Math.min(113, p.appeal)) + (p.conservation <= 10 ? 2 * p.conservation - 14 : 3 * Math.min(41, p.conservation) - 24);
  // money the appeal track gives at a break (engine/tracks.py income_from_appeal): 5 at 0, +1 per appeal to 5, then per 2 to 17, 3 to 32, 4 to 56, 5 to 96, 6 to 113
  function trackIncome(appeal) {
    let income = 5, start = 0;
    appeal = Math.max(0, Math.min(113, appeal));
    for (const [end, step] of [[5, 1], [17, 2], [32, 3], [56, 4], [96, 5], [113, 6]]) {
      if (appeal <= end) return income + Math.floor((appeal - start) / step);
      income += Math.floor((end - start) / step);
      start = end;
    }
    return income;
  }
  // number changes in the tracker flash green (up) or red (down); the length is --flash-duration in replay.css
  let lastNums = {};
  function sidePanel(st) {
    const root = $('side');
    root.replaceChildren();
    const nums = {};
    const flash = (key, value, node) => {
      nums[key] = value;
      const old = lastNums[key];
      if (old !== undefined && old !== value) node.classList.add(value > old ? 'flash-up' : 'flash-down');
      return node;
    };
    const top = el('div', 'sidetop');
    const brk = el('div', 'breaktrack');
    brk.title = 'Break track';
    const bi = el('img', 'icon'); bi.src = iconUrl('r3c14'); bi.alt = 'Break'; bi.height = 40;
    const rnd = flash('round', st.round, el('span', 'roundno', 'Round ' + st.round));
    rnd.title = 'Round ' + st.round + ': a new round starts when a break ends';
    brk.append(flash('break', st.break_position, el('b', '', st.break_position + ' / 9')), bi, rnd);
    top.append(brk);
    const counts = el('div', 'deckcounts');
    const discardBtn = flash('discard', st.main_discard_size, discardIcon(st.main_discard_size));
    discardBtn.classList.add('pilebtn');
    discardBtn.title = 'Discard pile: click to list its cards';
    discardBtn.onclick = () => openPile('discard');
    const deckBtn = flash('deck', st.main_deck_size, deckIcon(st.main_deck_size));
    deckBtn.classList.add('pilebtn');
    deckBtn.title = 'Draw pile: click to list the cards that are left (in no particular order)';
    deckBtn.onclick = () => openPile('deck');
    counts.append(deckBtn, discardBtn);
    const eg = el('span', 'dc');
    eg.title = 'Endgame cards left';
    const ei = el('img', 'icon'); ei.src = iconUrl('r10c15'); ei.alt = 'Endgame cards'; ei.height = 32;
    eg.append(el('b', '', st.endgame_deck_size), ei);                       // the number first, like the discard pile
    eg.classList.add('pilebtn');
    eg.title = 'Endgame cards left: click to list them';
    eg.onclick = () => openPile('endgame');
    flash('egdeck', st.endgame_deck_size, eg);
    counts.append(eg);
    top.append(counts);
    root.append(top);
    st.players.forEach((p, seat) => {
      const box = el('div', 'pp' + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
      const head = el('div', 'pphead');
      const name = el('b', 'ppname', replay.players[seat].name);
      name.style.color = seatColor(seat);
      const score = el('span', 'ppscore');
      score.title = 'Score (appeal + conservation points)';
      const scoreValue = p.score !== undefined ? p.score : trackScore(p);
      score.append(document.createTextNode(scoreValue + ' ★'));
      flash(seat + ':score', scoreValue, score);
      head.append(name, score);
      box.append(head);

      const res = el('div', 'ppres');
      const xr = el('span', 'rs xr');               // X tokens: the number sits to the left of the token
      xr.title = 'X tokens';
      xr.append(el('b', '', p.x_tokens), pic('xtoken', 40));
      flash(seat + ':x', p.x_tokens, xr);
      for (const [icon, n, label] of [['money', p.money, 'Money'], ['reputation', p.reputation, 'Reputation'], ['appeal', p.appeal, 'Appeal'], ['conservation', p.conservation, 'Conservation']]) {
        const r = el('span', 'rs inside' + (icon === 'money' ? ' money' : ''));    // the number is printed over the icon
        r.title = label;
        r.append(pic(icon, 42), el('b', '', n));
        flash(seat + ':' + icon, n, r);
        if (icon === 'appeal') {                       // a small money icon on top of the appeal icon: the income this player gets at a break
          const inc = el('span', 'income money');       // the standard money tile: number inside the icon, white rounded border
          inc.title = 'Income at the next break (from the appeal track' + (['5', '5a'].includes(replay.maps[seat].id) ? ' and the hexes covered next to the restaurant' : '') + ')';
          inc.append(pic('money', 30), el('i', '', p.income !== undefined ? p.income : trackIncome(p.appeal)));
          r.append(inc);
        }
        res.append(r);
        if (icon === 'money') res.append(xr);
      }

      box.append(res);

      const res2 = el('div', 'ppres2');
      const wr = el('span', 'rs xr');                // workers ready to use (the ones in the reserve); the number sits left of the meeple like the X tokens
      wr.title = 'Workers available (' + p.tokens.filter((t) => t.type === 'worker' && /^supply_/.test(t.location)).length + ' still locked)';
      const wi = el('img', 'icon'); wi.src = workerUrl(seat); wi.alt = 'Workers'; wi.height = 40;
      const ready = p.tokens.filter((t) => t.type === 'worker' && t.location === 'reserve').length;
      wr.append(el('b', '', ready), wi);
      flash(seat + ':workers', ready, wr);
      const hand = el('span', 'rs handcount');         // cards in hand / hand size (3, or 5 with the hand-size university)
      const limit = p.hand_limit !== undefined ? p.hand_limit : (p.tokens.some((t) => t.type === 'fac-rep-hand' && /^university_/.test(t.location)) ? 5 : 3);
      hand.title = 'Cards in hand / hand size';
      const hi = el('img', 'icon'); hi.src = iconUrl('r10c8'); hi.alt = 'Cards in hand'; hi.height = 40;
      const hb = el('b', p.hand.length > limit ? 'over' : '', p.hand.length + '/' + limit);   // red while the hand is over the limit, as on BGA
      hand.append(hi, hb);
      flash(seat + ':hand', p.hand.length, hand);
      const eg = el('span', 'rs handcount');          // endgame scoring cards held: 2 at the start, 1 after the discard at 10 conservation, more with Resistance
      eg.title = 'Endgame scoring cards';
      const ei = el('img', 'icon'); ei.src = iconUrl('r10c15'); ei.alt = 'Endgame cards'; ei.height = 40;
      eg.append(ei, el('b', '', p.endgame_hand.length));
      flash(seat + ':endgame', p.endgame_hand.length, eg);
      res2.append(wr, hand, eg);
      box.append(res2);

      const acts = el('div', 'ppactions');
      p.action_cards.forEach((a, i) => {
        // the card chosen for the running action (set by "chooses action card", cleared when it is placed back on slot 1 at the end of the action)
        const chosen = st.current_action && st.current_action.seat === seat && st.current_action.slot === i + 1;
        const c = el('span', 'ac' + (a.level === 2 ? ' lvl2' : '') + (chosen ? ' chosen' : ''));
        c.title = 'Slot ' + (i + 1) + ': ' + ACTION_NAMES[a.type] + (a.level === 2 ? ' II' : '') + (a.variant ? ' (variant ' + a.variant + ')' : '');
        c.append(pic(ACTION_ICON[a.type], 40));
        const art = '/action_cards/' + a.type + '_' + (replay.marine_worlds ? a.variant : 0) + '_' + (a.level === 2 ? 2 : 1) + '.webp';     // the whole action card
        c.addEventListener('mouseenter', () => showPreview(art));
        c.addEventListener('mouseleave', hidePreview);
        if (replay.marine_worlds && a.variant) {         // the variant's silver effect badge (side I or II of the card) on the top left of the action card
          const b = el('img', 'variant');
          b.src = '/action_icons/' + a.type + '_' + a.variant + '_' + (a.level === 2 ? 2 : 1) + '.webp'; b.alt = 'Variant ' + a.variant;
          c.append(b);
        }
        acts.append(c);
      });
      box.append(acts);

      const grid = el('div', 'ppicons');
      const ICON_ROWS = [['Africa', 'Europe', 'Asia', 'Americas', 'Australia'],
                         ['Bird', 'Predator', 'Herbivore', 'Reptile', 'Primate', ...(replay.marine_worlds ? ['SeaAnimal'] : [])],
                         ['Bear', 'Pet', 'Science', 'Rock', 'Water']];
      ICON_ROWS.forEach((names, r) => names.forEach((k, ci) => {
        const n = (p.icons || {})[k] || 0;
        const c = el('span', 'ic' + (n ? '' : ' zero'));
        c.title = k;
        const img = el('img', 'badge');
        img.src = '/badges/' + k + '.webp'; img.alt = k; img.width = 30; img.height = 30;
        c.append(el('b', '', n), img);
        flash(seat + ':icon:' + k, n, c);
        c.style.gridColumn = String(ci + 1);                            // (a row of 5 icons fills the 5 columns, the 6 of the animal row use 6 columns)
        c.style.gridRow = String(r + 1);
        grid.append(c);
      }));
      grid.style.gridTemplateColumns = 'repeat(' + (replay.marine_worlds ? 6 : 5) + ', 1fr)';
      box.append(grid);
      // the bonus tokens of the player's notepad (one-time effects); the row exists only while the player has at least one, every token goes at the step it is used
      const toks = p.tokens.filter((t) => BONUS_TOKENS.includes(t.type)).sort((x, y) => BONUS_TOKENS.indexOf(x.type) - BONUS_TOKENS.indexOf(y.type) || x.id - y.id);
      const bz = zoneNew(seat + ':bonustokens', toks.map((t) => t.type));
      if (toks.length) {
        const row = el('div', 'bonusrow');
        row.title = 'Bonus tokens';
        const items = toks.map((t) => bonusToken(t.type, bz.isNew(t.type) ? 'card-new' : ''));
        for (const g of bz.gone) items.splice(Math.min(g.index, items.length), 0, bonusToken(g.key, 'card-gone', true));      // a token that was just used fades away in its place
        row.append(...items);
        box.append(row);
      }
      root.append(box);
    });
    lastNums = nums;
  }

  const BONUS_TOKENS = ['bonus-icon', 'bonus-sponsor-gray', 'bonus-ignore-conditions', 'bonus-extra-shift'];
  const BONUS_TOKEN_TEXT = { 'bonus-icon': 'Bonus icon: counts as one more icon of your choice for a conservation project or an animal condition',
                             'bonus-sponsor-gray': 'Sponsor bonus: play a sponsor card without paying its cost or meeting its requirements',
                             'bonus-ignore-conditions': 'Ignore conditions: ignore one condition of an animal card', 'bonus-extra-shift': 'Extra shift: take an association worker back' };
  function bonusToken(type, cls, ghost) {
    const t = el('span', 'btoken ' + (cls || ''));
    t.title = BONUS_TOKEN_TEXT[type] || type;
    const id = iconNames[type];
    if (id) { const img = el('img'); img.src = iconUrl(id); img.alt = type; img.height = 36; t.append(img); } else t.append(el('b', '', type));
    if (ghost) t.addEventListener('animationend', () => t.remove());
    return t;
  }

  // while a sponsor is to be played, everything in the hand of that player that is not a playable sponsor is greyed out
  function handDim(seat) {
    if (FORK && marketMode !== null) {                                    // Marketing: the sponsors that cannot be played are greyed out
      const keys = forkActs((a) => a.kind === 'choose_effect' && a.player === seat && a.args.index === marketMode && typeof a.args.card === 'string').map((a) => a.args.card);
      if (keys.length) return (k) => !keys.includes(k);
    }
    if (FORK) {                                                           // a card is to be played: the cards the engine does not let the player play (not an animal / a sponsor, a requirement, the price or an enclosure that cannot be met) are greyed out
      const ok = forkActs((a) => a.player === seat && a.args && a.args.card && !a.args.from_display && ['play_animal', 'play_sponsor', 'sponsor_side'].includes(a.kind)).map((a) => a.args.card);
      if (ok.length) return (k) => !ok.includes(k);
    }
    const o = replay.steps[step].options;
    return o && o.sponsors && o.seat === seat && !hides(seat) ? (k) => !o.sponsors.hand.includes(k) : null;
  }
  // The hands and the endgame cards of both players are not part of the zoos: they sit in a floating dock at the bottom left corner of the screen. A round button
  // for each (hand: r4c7, endgame cards: r4c11, ringed in the colour of the player) opens that player's cards above the dock; the same button closes them.
  let dockSel = null;
  try { dockSel = JSON.parse(localStorage.getItem('dockSel') || 'null'); } catch (e) { /* no storage */ }
  if (!dockSel) dockSel = { seat: 0, kind: 'hand' };
  let dockHidden = false;                                              // the panel is folded away (the selection stays)
  try { dockHidden = localStorage.getItem('dockHidden') === '1'; } catch (e) { /* no storage */ }
  const saveDock = () => { try { localStorage.setItem('dockSel', JSON.stringify(dockSel)); localStorage.setItem('dockHidden', dockHidden ? '1' : '0'); } catch (e) { /* no storage */ } };
  function renderDock(st) {
    let dock = $('dock');
    if (!dock) { dock = el('div', 'dock'); dock.id = 'dock'; document.body.append(dock); }
    if (SANDBOX && replay.setup) { dock.replaceChildren(); return; }                // (nothing to show before the game: the seat and the maps are chosen first)
    const panel = el('div', 'dockpanel');
    const bar = el('div', 'dockbar');
    const rows = {};
    const shownSel = pov !== null && dockSel && dockSel.seat !== pov ? { seat: pov, kind: dockSel.kind } : dockSel;      // (a player's point of view has no way to the other player's cards)
    st.players.forEach((p, seat) => {
      if (hides(seat)) return;
      const cards = { hand: p.hand, endgame: p.endgame_hand };
      for (const kind of ['hand', 'endgame']) {
        const row = cardRow(cards[kind], kind === 'hand' ? '' : 'small', kind === 'hand' ? 'empty' : 'none', seat + ':' + kind, kind === 'hand' ? handDim(seat) : null, true);
        rows[seat + ':' + kind] = row;                                   // (built for both players every time, so the arrivals and departures of the cards are tracked)
        const on = !dockHidden && shownSel && shownSel.seat === seat && shownSel.kind === kind;
        const b = el('button', 'dockbtn' + (on ? ' on' : ''));
        b.type = 'button';
        const label = replay.players[seat].name + ': ' + (kind === 'hand' ? 'hand' : 'endgame cards') + ' (' + cards[kind].length + ')';
        b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(on));
        b.style.setProperty('--pc', seatColor(seat));
        const img = el('img'); img.src = iconUrl(kind === 'hand' ? 'r4c7' : 'r4c11'); img.alt = ''; b.append(img, el('span', 'dockn', cards[kind].length));
        b.onclick = () => {
          dockSel = { seat, kind };                                      // (the button of the open cards folds them away: the arrow at the end does that too)
          dockHidden = on;
          saveDock();
          renderDock(curState());
        };
        bar.append(b);
      }
    });
    const fold = el('button', 'dockfold');                               // collapse / expand the cards, at the right end of the buttons
    fold.type = 'button';
    fold.textContent = dockHidden ? '▲' : '▼';
    fold.title = dockHidden ? 'Show the cards' : 'Hide the cards';
    fold.setAttribute('aria-label', fold.title); fold.setAttribute('aria-expanded', String(!dockHidden));
    fold.onclick = () => { dockHidden = !dockHidden; saveDock(); renderDock(curState()); };
    bar.append(fold);
    if (!dockHidden && shownSel && rows[shownSel.seat + ':' + shownSel.kind]) {
      const head = el('div', 'dockhead');
      const who = el('b', '', replay.players[shownSel.seat].name);
      who.style.color = seatColor(shownSel.seat);
      head.append(who, document.createTextNode(shownSel.kind === 'hand' ? ' - hand' : ' - endgame cards'));
      panel.append(head, rows[shownSel.seat + ':' + shownSel.kind]);
      panel.style.setProperty('--pc', seatColor(shownSel.seat));
      dock.replaceChildren(bar, panel);                                // the buttons above the cards
    } else dock.replaceChildren(bar);
  }

  function renderZoo(st, seat) {
    const p = st.players[seat], who = replay.players[seat], map = replay.maps[seat];
    const box = el('div', 'zoo seat' + seat + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
    const h = el('h2', '', who.name);
    h.style.borderBottom = '3px solid ' + seatColor(seat);
    h.append(el('span', 'map', 'Map ' + map.id + (map.name ? ': ' + map.name : '')));
    box.append(h);

    const row = el('div', 'zooRow');
    row.append(bonusPanel(map, p, seat), zooBoard(map, p, seat), associationStrip(p, map, seat));
    box.append(row);

    box.append(section('Animals (' + p.animals.length + ')', cardRow(p.animals, 'small', 'none', seat + ':animals')));
    box.append(section('Sponsors (' + p.sponsors.length + ')', cardRow(p.sponsors, 'small', 'none', seat + ':sponsors')));
    if (p.released.length) box.append(section('Released (' + p.released.length + ')', cardRow(p.released, 'small', undefined, seat + ':released')));
    return box;
  }

  // A log line with the icons the log names written between < >: <SEARCH-HERBIVORE>, <XTOKEN>, <MONEY:5> (with an amount), <APPEAL:1>, <AMERICAS>, <BIRD> ...
  // Species searches and the other named icons come from BGA's icon sheet (names.json), continents and animal categories are the round badges.
  const BADGE = { AFRICA: 'Africa', AMERICAS: 'Americas', ASIA: 'Asia', AUSTRALIA: 'Australia', EUROPE: 'Europe', BIRD: 'Bird', HERBIVORE: 'Herbivore', PREDATOR: 'Predator',
                  PRIMATE: 'Primate', REPTILE: 'Reptile', SEAANIMAL: 'SeaAnimal' };
  const WITH_AMOUNT = new Set(['MONEY', 'APPEAL', 'REPUTATION', 'CONSERVATION']);           // the amount is printed over the icon, like on the tracker
  function labelIcon(name, amount) {
    let src = null;
    if (BADGE[name]) src = '/badges/' + BADGE[name] + '.webp';
    else {
      const key = name.startsWith('SEARCH-') ? 'search-' + name.slice(7).toLowerCase().replace('seaanimal', 'sea-animal') : name.toLowerCase();
      if (iconNames[key]) src = iconUrl(iconNames[key]);
    }
    if (!src) return null;
    const img = el('img', 'icon labelicon' + (name === 'MONEY' ? ' labelmoney' : ''));
    img.src = src; img.alt = name.toLowerCase(); img.title = name.toLowerCase().replace(/-/g, ' ') + (amount ? ' ' + amount : '');
    if (amount && WITH_AMOUNT.has(name)) {
      const box = el('span', 'labelamount');
      box.append(img, el('b', '', amount));
      return box;
    }
    return amount ? [img, document.createTextNode(amount)] : img;
  }
  function labelNode(text) {
    const span = el('span', '');
    let last = 0;
    for (const m of text.matchAll(/<([A-Z][A-Z-]*)(?::(\d+))?>/g)) {
      const icon = labelIcon(m[1], m[2]);
      if (!icon) continue;
      span.append(document.createTextNode(text.slice(last, m.index)));
      span.append(...(Array.isArray(icon) ? icon : [icon]));
      last = m.index + m[0].length;
    }
    span.append(document.createTextNode(text.slice(last)));
    return span;
  }

  const ENGINE_MARK = { engine: ['✓', 'Played by the rules engine; it agrees with the log'], mismatch: ['≠', 'The engine played this turn but ended in a different state than the log (shown: log state)'],
                        illegal: ['!', 'A logged action is not legal for the engine (shown: log state)'], skipped: ['–', 'Not supported by the engine yet (shown: log state)'], log: ['', ''] };
  function engineBadge(eng) {
    if (!eng) return document.createTextNode('');
    const key = eng.source === 'engine' ? 'engine' : (eng.status in ENGINE_MARK ? eng.status : 'log');
    const [mark, tip] = ENGINE_MARK[key];
    const b = el('span', 'engine-badge ' + key, mark);
    b.title = tip + (eng.detail ? '\n' + eng.detail : '');
    return b;
  }

  function render() {
    const scrollY = window.scrollY, scrollX = window.scrollX;       // rebuilding the boards must not move the page
    const s = replay.steps[step], st = povState(s.state);
    const cur = $('current');
    cur.replaceChildren();
    cur.append(labelNode(labelOf(s) || '(state update)'));
    const eg = engineBadge(s.engine);
    cur.append(' ', eg);
    if (s.engine && s.engine.detail && s.engine.source === 'log') cur.append(el('div', 'engine-detail', 'Engine: ' + s.engine.detail));
    renderShared(st);
    sidePanel(st);
    const zoos = $('zoos');
    zoos.replaceChildren(renderZoo(st, 0), renderZoo(st, 1));
    renderDock(st);
    if (FORK) {
      const prev = step > 0 ? replay.steps[step - 1].state : null;          // the hand that just changed (a card found by a search...) is the one the dock shows
      if (prev && dockHandStep !== step) {
        dockHandStep = step;
        const seat = st.players.findIndex((p, i) => p.hand.join() !== prev.players[i].hand.join() && p.hand.length > prev.players[i].hand.length);      // (a hand that grew)
        if (seat >= 0 && (dockSel.seat !== seat || dockSel.kind !== 'hand' || dockHidden)) { dockSel = { seat, kind: 'hand' }; dockHidden = false; renderDock(st); }
      }
      forkBar(); renderForkMoves();
      if (SANDBOX) renderSandboxTools(st);
    }
    prevZones = curZones; curZones = {}; prevZoneData = curZoneData; curZoneData = {};
    $('jump').value = step;
    for (const id of ['first', 'prev']) $(id).disabled = step === 0;
    const fb = $('fork');
    if (fb) fb.disabled = !s.fork;
    for (const id of ['next', 'last']) $(id).disabled = step === replay.steps.length - 1;
    const list = $('moves');
    list.querySelector('.on')?.classList.remove('on');
    const li = list.children[step];
    li.classList.add('on');
    if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;                     // scroll the list only, never the page
    else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
    history.replaceState(null, '', '#' + step);
    fitAside();
    fitDisplay();
    updateTimeline();
    if (openedPile) renderPile();
    window.scrollTo(scrollX, scrollY);
  }

  // Fit the right column (break track, both player trackers, move list) into the window: the aside gets the free height, the trackers are
  // scaled down (CSS zoom) when they would not leave room for the list, and the list scrolls inside its box.
  let naturalTop = null;
  const DRAWER_QUERY = '(max-width: 1100px), (max-height: 920px)';          // (the same as in the stylesheet)
  function fitAside() {
    const aside = document.querySelector('aside'), side = $('side'), bar = document.querySelector('.bar');
    if (!aside || !side) return;
    if (window.matchMedia(DRAWER_QUERY).matches) {          // narrow or short screens: the column is a drawer on the right (see setupDrawer), below the top bar
      aside.style.height = ''; side.style.zoom = ''; aside.style.top = bar.offsetHeight + 'px';
      const t = $('asideToggle'); if (t) t.style.top = (bar.offsetHeight + 12) + 'px';
      return;
    }
    aside.style.top = bar.offsetHeight + 8 + 'px';
    const top = bar.offsetHeight + 8;
    aside.style.top = top + 'px';
    if (naturalTop === null) naturalTop = aside.getBoundingClientRect().top + window.scrollY;      // where the column sits at the top of the page
    const avail = window.innerHeight - Math.max(top, naturalTop) - 10;
    const MIN_ZOOM = 0.62, MIN_LIST = Math.max(250, avail * 0.33);                                                        // a usable list, trackers that stay readable
    side.style.zoom = 1;
    const need = side.scrollHeight;
    const zoom = Math.min(1, Math.max(MIN_ZOOM, (avail - MIN_LIST) / need));
    side.style.zoom = zoom;
    if (need * zoom + MIN_LIST <= avail) {                    // fits the window: the column is as tall as the window, the list takes what the trackers leave
      aside.style.position = '';
      aside.style.height = avail + 'px';
    } else {                                                  // a short window: no sticky column, the page scrolls and the list keeps a decent height
      aside.style.position = 'static';
      aside.style.height = (need * zoom + MIN_LIST + 40) + 'px';
    }
  }
  // Display (folders + reputation track) and the association zone share a row: the association zone keeps at least ASSOC_MIN px, the display is scaled to what
  // is left (at most 10% bigger than its natural size), so on a small screen both stay visible instead of the association zone shrinking away.
  const ASSOC_MIN = 460, DISPLAY_MAX = 1.1, DISPLAY_MIN = 0.4, SIDE_BY_SIDE_MIN = 0.78;
  function fitDisplay() {
    const box = document.querySelector('.displaybox'), shared = $('shared');
    if (!box || !shared) return;
    const narrow = window.matchMedia('(max-width: 1100px)').matches;          // narrow screens: always stacked (the stylesheet wraps them), the display fills the width
    box.style.zoom = 1;
    const natural = box.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(shared).columnGap) || 16;
    const room = shared.clientWidth - ASSOC_MIN - gap;
    const fit = room / natural;
    // when side by side would make the display smaller than SIDE_BY_SIDE_MIN of its size the association zone goes under it (and the display uses the full width)
    const stacked = narrow || fit < SIDE_BY_SIDE_MIN;
    shared.classList.toggle('stacked', stacked);
    box.style.zoom = Math.max(DISPLAY_MIN, Math.min(DISPLAY_MAX, stacked ? shared.clientWidth / natural : fit));
  }
  // Narrow screens: the player / round trackers and the move list slide in from the right edge; a tab on the edge brings them in and out
  function setupDrawer() {
    const aside = document.querySelector('aside');
    if (!aside || $('asideToggle')) return;
    const btn = el('button', 'asidetoggle');
    btn.id = 'asideToggle'; btn.type = 'button';
    const apply = (open) => {
      aside.classList.toggle('open', open);
      btn.classList.toggle('open', open);
      btn.textContent = open ? '▶' : '◀';
      btn.title = open ? 'Hide the trackers and moves' : 'Show the trackers and moves';
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', btn.title);
      try { localStorage.setItem('asideOpen', open ? '1' : '0'); } catch (e) { /* private window */ }
    };
    btn.onclick = () => apply(!aside.classList.contains('open'));
    document.body.append(btn);
    let saved = false;
    try { saved = localStorage.getItem('asideOpen') === '1'; } catch (e) { /* private window */ }
    apply(saved);
  }
  window.addEventListener('resize', () => { fitAside(); fitDisplay(); });

  // ---- autoplay: one step a second at 1x ------------------------------------------------------------------------
  let timer = null, speed = 1;
  function setPlaying(on) {
    if (timer) { clearInterval(timer); timer = null; }
    if (on && step >= replay.steps.length - 1) go(0);                  // started at the end: play again from the start
    if (on) timer = setInterval(() => { if (step >= replay.steps.length - 1) setPlaying(false); else go(step + 1); }, 1000 / speed);
    const b = $('play');
    b.textContent = on ? '⏸︎' : '▶︎';
    b.title = on ? 'Stop autoplay (Space)' : 'Start autoplay (Space)';
    b.setAttribute('aria-label', on ? 'Stop autoplay' : 'Start autoplay');
    b.classList.toggle('on', on);
  }
  function setSpeed(x) {
    speed = x;
    for (const b of document.querySelectorAll('.speed button')) b.classList.toggle('on', +b.dataset.speed === x);
    if (timer) setPlaying(true);                                       // restart the timer at the new rate
  }

  // ---- timeline: |----|------|----|, each | is the start of a round (the step after a break ends) ---------------------
  function roundStarts() {
    const starts = [0];
    replay.steps.forEach((s, i) => { if (/^End of the break/i.test(s.label || '') && i + 1 < replay.steps.length) starts.push(i + 1); });
    return starts;
  }
  function buildTimeline() {
    const tl = $('timeline'), n = replay.steps.length, starts = roundStarts();
    tl.replaceChildren();
    starts.forEach((a, k) => {
      const b = k + 1 < starts.length ? starts[k + 1] : n;
      const seg = el('div', 'tlseg');
      seg.style.flexGrow = b - a;
      seg.title = 'Round ' + (k + 1) + ': steps ' + a + '–' + (b - 1);
      tl.append(seg);
    });
    tl.append(el('div', 'tlhead'));
    tl.onclick = (e) => {
      const r = tl.getBoundingClientRect();
      go(Math.round((e.clientX - r.left) / r.width * (n - 1)));
    };
  }
  function updateTimeline() {
    const head = document.querySelector('#timeline .tlhead');
    if (head) head.style.left = (replay.steps.length > 1 ? step / (replay.steps.length - 1) * 100 : 0) + '%';
  }

  // three points of view: everything (god mode), what the player of seat 0 sees, what the player of seat 1 sees; switching is instant (no reload)
  function setupPov() {
    const box = $('pov');
    if (!box) return;
    box.replaceChildren();
    const defs = [[null, 'All hands', 'God mode: both hands, the endgame cards and every card named in the move list'],
                  [0, replay.players[0].name, 'The game as ' + replay.players[0].name + ' saw it: the other hand and endgame cards are hidden'],
                  [1, replay.players[1].name, 'The game as ' + replay.players[1].name + ' saw it: the other hand and endgame cards are hidden']];
    for (const [value, text, tip] of defs) {
      const b = el('button', 'povbtn' + (pov === value ? ' on' : ''));
      b.type = 'button'; b.title = tip; b.setAttribute('aria-pressed', String(pov === value));
      if (value !== null) b.style.setProperty('--pc', seatColor(value));
      b.append(el('span', 'povicon', value === null ? '\u25C9' : '\u25CF'), el('span', 'povname', text));
      b.onclick = () => {
        if (pov === value) return;
        pov = value;
        try { localStorage.setItem('pov', value === null ? 'all' : String(value)); } catch (e) { /* no storage */ }
        applyPov();
      };
      box.append(b);
    }
  }
  function applyPov() {
    setupPov();
    document.querySelectorAll('#moves li').forEach((li) => {          // the move list names cards: rewrite every line for the new point of view
      const s = li._step;
      if (!s) return;
      const num = li.firstChild, badge = li.lastChild;
      li.replaceChildren(num, labelNode(labelOf(s) || '…'), badge);
    });
    render();
  }

  // ---- fork: the information line (seed), the legal moves of both seats, and adding the step that a move makes -----------------------------------------------------

  // ---- sandbox ------------------------------------------------------------------------------------------------------------------------------
  // The controller sets the game up (the empty base projects and conservation bonuses) and edits it at any time with the tools panel; every edit is a step (Undo / the
  // arrows take it back). The server answers each move of the controller with the moves of the bot, which only passes.
  const BONUS_POOL = [{ 'Partner-Zoo': 1 }, { Fac: 1 }, { Multiplier: 1 }, { xtoken: 3 }, { 'take-in-range-or-deck': 3 }, { 'size-3': 1 }, { 'bonus-ignore-conditions': 3 },
                      { 'bonus-increased-hand': 1 }, { 'bonus-icon': 1 }, { 'bonus-scoring-cards': 3 }, { 'bonus-sponsor-gray': 1 }, { 'bonus-sponsor': 1 }, { reputation: 2 },
                      { 'bonus-extra-shift': 1 }, { 'bonus-kiosk-pavilion': 3 }, { money: 10 }];
  const sbMeta = () => (replay.steps[step] && replay.steps[step].sandbox) || replay.sandbox;
  const sbReady = () => !Object.values(sbMeta().unset).some((a) => a.some(Boolean));
  let sbSeat = null, sbUnlocked = false, sbOpen = true;

  async function sbEdit(op, args) {
    if (forkBusy) return;
    forkBusy = true;
    try {
      const res = await fetch('/api/sandbox/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ state: replay.steps[step].engine_state, meta: sbMeta(), op, args }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'the edit could not be made');
      commitSteps(body.steps);
    } catch (err) {
      forkBusy = false;
      renderForkMoves(err.message);
    }
  }
  function sbButton(text, tip, onclick, cls) {
    const b = el('button', 'forkmove sbbtn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button'; b.title = tip; b.onclick = onclick;
    return b;
  }
  // the two buttons of an empty bonus space of the conservation track / the reputation track
  function sbSlotButtons(th, i) {
    const d = el('div', 'sbslot');
    d.append(sbButton('\u{1F3B2}', 'Randomize this bonus', () => sbEdit('set_bonus', { threshold: th, slot: i, bonus: null }), 'sbmini'),
             sbButton('\u270E', 'Choose this bonus', async () => {
               const m = sbMeta();
               const others = Object.entries(m.initial).flatMap(([t, bs]) => bs.filter((b, j) => !(t === th && j === i) && !m.unset['b' + t][j]));      // the bonuses already set anywhere on the board
               const bonus = await sbPickBonus(others);
               if (bonus) sbEdit('set_bonus', { threshold: th, slot: i, bonus });
             }, 'sbmini'));
    return d;
  }

  // ---- pop-ups ----
  function sbModal(title, build) {
    return new Promise((resolve) => {
      const back = el('div', 'modalback');
      const box = el('div', 'modalbox sbmodal');
      const done = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') done(null); };
      const head = el('div', 'sbmodalhead');
      const x = el('button', 'sbclose', '\u00D7');
      x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = () => done(null);
      head.append(el('h3', '', title), x);
      box.append(head, build(done));
      back.append(box);
      back.addEventListener('click', (e) => { if (e.target === back) done(null); });
      document.addEventListener('keydown', onKey);
      document.body.append(back);
    });
  }
  function sbPickCard(title, groups) {            // groups: [[label, [card keys]], ...] -> the key chosen, or null
    return sbModal(title, (done) => {
      const wrap = el('div', 'sbpick');
      const filter = el('input', 'sbfilter');
      filter.type = 'search'; filter.placeholder = 'Filter by name'; filter.setAttribute('aria-label', 'Filter by name');
      const list = el('div', 'sblist');
      const fill = () => {
        const q = filter.value.trim().toLowerCase();
        list.replaceChildren();
        let shown = 0;
        for (const [label, keys] of groups) {
          const hits = keys.filter((k) => !q || cardName(k).toLowerCase().includes(q) || k.toLowerCase() === q).sort((a, b) => cardName(a).localeCompare(cardName(b)));
          if (!hits.length) continue;
          list.append(el('div', 'sbgroup', label + ' (' + hits.length + ')'));
          for (const k of hits.slice(0, 120 - Math.min(shown, 120))) {
            const b = el('button', 'sbrow', cardName(k));
            b.type = 'button';
            b.append(el('span', 'sbkey', k));
            b.onclick = () => done(k);
            b.onmouseenter = () => showPreview(info(k).large || info(k).image);
            b.onmouseleave = hidePreview;
            list.append(b);
            shown++;
          }
        }
        if (!shown) list.append(el('div', 'muted', 'No card matches.'));
      };
      filter.oninput = fill;
      fill();
      wrap.append(filter, list);
      setTimeout(() => filter.focus(), 0);
      return wrap;
    }).finally(hidePreview);
  }
  function sbPickBonus(taken) {
    return sbModal('Choose the bonus', (done) => {
      const grid = el('div', 'sbbonuses');
      for (const b of BONUS_POOL) {
        const [name] = Object.keys(b);
        const t = bonusTile(name, b[name]);
        const btn = el('button', 'sbtile');
        btn.type = 'button';
        btn.title = name.replace(/^bonus-/, '').replace(/-/g, ' ') + (b[name] > 1 ? ' (' + b[name] + ')' : '');
        btn.disabled = taken.some((o) => JSON.stringify(o) === JSON.stringify(b));
        if (t) { t.classList.remove('ctbonus'); btn.append(t); } else btn.textContent = btn.title;
        btn.onclick = () => done(b);
        grid.append(btn);
      }
      return grid;
    });
  }
  function sbPickProjects(n, current) {
    return sbModal('Choose ' + n + ' base project' + (n === 1 ? '' : 's'), (done) => {
      const wrap = el('div', 'sbpick');
      const chosen = [];
      const grid = el('div', 'sbprojects');
      const ok = sbButton('Confirm', 'Set the projects', () => done(chosen.slice()), 'forkconfirm');
      ok.disabled = true;
      const refresh = () => { ok.disabled = chosen.length !== n; ok.textContent = 'Confirm (' + chosen.length + '/' + n + ')'; };
      for (const k of replay.base_pool || []) {
        const wrapc = el('div', 'sbproject' + (current.includes(k) ? ' taken' : ''));
        wrapc.append(card(k));
        wrapc.onclick = () => {
          if (current.includes(k)) return;
          const at = chosen.indexOf(k);
          if (at >= 0) chosen.splice(at, 1); else if (chosen.length < n) chosen.push(k);
          wrapc.classList.toggle('marked', chosen.includes(k));
          refresh();
        };
        wrapc.title = cardName(k);
        grid.append(wrapc);
      }
      refresh();
      wrap.append(grid, el('div', 'modalrow'));
      wrap.lastChild.append(ok);
      return wrap;
    });
  }

  // ---- the tools panel ----
  const SB_TYPES = ['animals', 'association', 'build', 'cards', 'sponsors'];
  function renderSandboxTools(st) {
    const box = $('sbtools');
    if (!box) return;
    box.hidden = !!replay.setup;
    if (replay.setup) return;
    const meta = sbMeta();
    if (sbSeat === null) sbSeat = meta.controller;
    const seat = sbSeat, p = st.players[seat];
    const sum = el('summary', '', 'Sandbox tools');
    box.open = sbOpen;
    box.ontoggle = () => { sbOpen = box.open; };
    const body = el('div', 'sbbody');
    const sec = (title, ...nodes) => { const d = el('div', 'sbsec'); d.append(el('h4', '', title), ...nodes); body.append(d); return d; };

    const who = el('select', 'sbselect');
    who.setAttribute('aria-label', 'Seat to edit');
    st.players.forEach((q, i) => { const o = el('option', '', replay.players[i].name + (i === meta.controller ? ' (you play this seat)' : ' (passes)')); o.value = i; who.append(o); });
    who.value = seat;
    who.onchange = () => { sbSeat = +who.value; renderSandboxTools(curState()); };
    sec('Edit the seat of', who);

    const fields = el('div', 'sbfields');
    for (const [f, label, lo, hi] of [['money', 'Money', 0, 999], ['x_tokens', 'X tokens', 0, 5], ['conservation', 'Conservation', 0, 40], ['reputation', 'Reputation', 0, 15]]) {
      const l = el('label', 'sbfield', label + ' ');
      const inp = el('input');
      inp.type = 'number'; inp.min = lo; inp.max = hi; inp.value = p[f];
      inp.onchange = () => { const v = parseInt(inp.value, 10); if (Number.isFinite(v)) sbEdit('set_value', { seat, field: f, value: v }); };
      l.append(inp);
      fields.append(l);
    }
    sec('Resources (set directly: no bonus follows)', fields);

    const ul = el('ul', 'sblist-actions');
    let drag = null;
    for (const [n, a] of p.action_cards.entries()) {
      const li = el('li', 'sbaction' + (sbUnlocked ? ' unlocked' : ''));
      li.dataset.type = a.type;
      li.draggable = sbUnlocked;
      li.append(el('span', 'sbn', n + 1), pic(ACTION_ICON[a.type], 26), el('span', 'sbname', ACTION_NAMES[a.type] + (a.level === 2 ? ' II' : '')));
      const v = el('select', 'sbselect');
      v.title = replay.marine_worlds ? 'Variant of the action card' : 'The variants belong to Marine Worlds';
      v.disabled = !replay.marine_worlds;
      for (const k of [0, 1, 2, 3, 4]) { const o = el('option', '', k ? 'Variant ' + k : 'Standard'); o.value = k; v.append(o); }
      v.value = a.variant || 0;
      v.onchange = () => sbEdit('set_variant', { seat, type: a.type, variant: +v.value });
      li.append(v);
      li.addEventListener('dragstart', (e) => { drag = li; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.type); });
      li.addEventListener('dragover', (e) => {
        if (!drag || drag === li) return;
        e.preventDefault();
        const r = li.getBoundingClientRect();
        ul.insertBefore(drag, e.clientY > r.top + r.height / 2 ? li.nextSibling : li);
      });
      li.addEventListener('dragend', () => { li.classList.remove('dragging'); drag = null; });
      ul.append(li);
    }
    const lock = sbButton(sbUnlocked ? '\u{1F513} Unlocked: drag to reorder' : '\u{1F512} Locked', sbUnlocked ? 'Click to lock the new order' : 'Click to unlock and drag the action cards into another order', () => {
      if (sbUnlocked) {
        const order = [...ul.children].map((li) => li.dataset.type);
        sbUnlocked = false;
        if (order.join() !== p.action_cards.map((c) => c.type).join()) sbEdit('reorder', { seat, order });
        else renderSandboxTools(curState());
      } else { sbUnlocked = true; renderSandboxTools(curState()); }
    }, sbUnlocked ? 'on' : '');
    sec('Action cards (slot 1 first)', lock, ul);

    const deckKeys = st.main_deck.filter((k) => k !== '?'), discardKeys = (st.main_discard || []).filter((k) => k !== '?'), egKeys = st.endgame_deck.filter((k) => k !== '?');
    sec('Cards', sbButton('Add a card to the hand…', 'A card of the draw pile, the discard pile or the endgame deck goes to the hand', async () => {
      const k = await sbPickCard('Add a card to the hand of ' + replay.players[seat].name, [['Draw pile', deckKeys], ['Discard pile', discardKeys], ['Endgame deck', egKeys]]);
      if (k) sbEdit('add_hand', { seat, card: k });
    }));
    const disp = el('div', 'sbdisplay');
    st.display.forEach((k, i) => {
      const b = sbButton((i + 1) + ': ' + (k ? cardName(k) : '(empty)'), 'Change this display card: the card that leaves takes the place of the new one', async () => {
        const c = await sbPickCard('Display space ' + (i + 1), [['Draw pile', deckKeys], ['Discard pile', discardKeys], ['Display', st.display.filter((x, j) => x && j !== i)]]);
        if (c) sbEdit('set_display', { index: i, card: c });
      });
      disp.append(b);
    });
    sec('Display', disp);

    const tiles = el('div', 'sbtiles');
    const tile = (kind, name, id, tip) => {
      const b = el('button', 'sbtile');
      b.type = 'button'; b.title = tip;
      const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = tip; i.height = 40;
      b.append(i);
      b.onclick = () => sbEdit('add_tile', { seat, tile: kind, name });
      tiles.append(b);
    };
    for (const c of ['Africa', 'Europe', 'Asia', 'Americas', 'Australia']) tile('partner', c, ICON_IDS[c], 'Partner zoo: ' + c);
    for (const u of ['fac-rep-hand', 'fac-science-rep', 'fac-science-science']) tile('university', u, ICON_IDS[u], 'University: ' + u.replace('fac-', '').replace(/-/g, ' '));
    for (const c of ['bird', 'predator', 'herbivore', 'primate', 'reptile'].concat(replay.marine_worlds ? ['marine'] : [])) tile('university', c, ICON_IDS['fac-science-' + c], 'Species university: ' + c);
    sec('Partner zoos and universities (their bonuses follow)', tiles);

    const w = (where) => p.tokens.filter((t) => t.type === 'worker' && t.location.startsWith(where)).length;
    const wk = el('div', 'sbworkers');
    wk.append(sbButton('Unlock a worker (' + w('supply_') + ' locked)', 'Unlock the next locked worker', () => sbEdit('workers', { seat, what: 'unlock' })));
    for (const [where, label] of [['supply_', 'locked'], ['reserve', 'ready'], ['association_', 'placed']]) {
      const b = sbButton('Remove a ' + label + ' worker (' + w(where) + ')', 'Take a worker away for good', () => sbEdit('workers', { seat, what: 'remove', where }));
      b.disabled = !w(where);
      wk.append(b);
    }
    sec('Workers', wk);
    box.replaceChildren(sum, body);
  }

  // The setup before the game: the seat to play, then the map of each seat (a click on a map shows it on the player board; it can be changed before Confirm).
  // `replay.setup` = {stage: 'seat' | 'map0' | 'map1', controller, maps: [id, id]}; the real game starts when the last map is confirmed.
  const mapViews = {};
  let sbMapList = null;
  async function sbShowMap(seat, id) {
    if (!mapViews[id]) {
      const res = await fetch('/api/sandbox/map/' + encodeURIComponent(id));
      if (!res.ok) return;
      mapViews[id] = await res.json();
    }
    replay.setup.maps[seat] = id;
    replay.maps[seat] = mapViews[id];
    render();
  }
  function sbSetupBar(bar) {
    const set = replay.setup;
    bar.hidden = false;
    bar.replaceChildren();
    if (!sbMapList) {
      sbMapList = [];
      fetch('/api/sandbox/maps?marine_worlds=' + (replay.marine_worlds ? 'true' : 'false')).then((r) => r.json()).then((b) => { sbMapList = b.maps; if (replay.setup) render(); });
    }
    if (set.stage === 'seat') {
      bar.append(el('b', '', 'Choose the seat you play'));
      for (const seat of [0, 1]) {
        const b = sbButton('Seat ' + (seat + 1) + (seat === 0 ? ' (plays first)' : ''), 'You play this seat; the other one is a bot that passes', () => { set.controller = seat; set.stage = 'map0'; render(); }, 'forkchoice');
        b.style.setProperty('--pc', seatColor(seat));
        bar.append(b);
      }
      return;
    }
    const seat = set.stage === 'map0' ? 0 : 1;
    const head = el('b', '', 'Choose the map of seat ' + (seat + 1) + (seat === set.controller ? ' (you)' : ' (the bot)'));
    const list = el('div', 'sbmaps');
    for (const m of sbMapList) {
      const b = el('button', 'forkmove sbmapbtn' + (set.maps[seat] === m.id ? ' on' : ''), 'Map ' + m.id + ': ' + m.name);
      b.type = 'button';
      b.onclick = () => sbShowMap(seat, m.id);
      list.append(b);
    }
    const ok = sbButton('Confirm', 'Use this map', async () => {
      if (seat === 0) { set.stage = 'map1'; set.maps[1] = null; render(); return; }
      ok.disabled = true;
      const res = await fetch('/api/sandbox/new', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ marine_worlds: replay.marine_worlds, maps: set.maps, controller: set.controller }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { ok.disabled = false; renderForkMoves(body.message || 'could not start'); return; }
      sessionStorage.setItem('sandboxGame', JSON.stringify(body));
      location.reload();
    }, 'forkconfirm');
    ok.disabled = !set.maps[seat];
    const back = sbButton('Back', 'Go back', () => { set.stage = seat === 0 ? 'seat' : 'map0'; render(); });
    const dice = sbButton('Random map', 'Pick a map at random: it is shown on the board and can still be changed before Confirm', () => {
      if (sbMapList.length) sbShowMap(seat, sbMapList[Math.floor(Math.random() * sbMapList.length)].id);
    });
    bar.append(head, list, dice, ok, back);
  }

  function initSandbox() {
    document.title = 'Sandbox - Ark Nova';
    if (replay.setup) {
      Object.assign(replay.setup, { stage: 'seat', controller: 0, maps: [null, null] });
      replay.players.forEach((q, i) => { q.name = 'Seat ' + (i + 1); });
      replay.steps[0].label = 'Choose your seat and the maps';
      buildMoveList();
      $('tableInfo').textContent = 'Sandbox setup' + (replay.marine_worlds ? ' · Marine Worlds' : '');
      const box0 = $('forkinfo');
      box0.hidden = false;
      box0.replaceChildren(el('b', '', 'Sandbox setup'), el('div', 'forknote', 'Choose the seat you play, then the map of each seat. The other seat is a bot that only passes.'));
      document.body.classList.add('forkpage');
      return;
    }
    replay.sandbox = replay.sandbox || replay.steps[0].sandbox;
    $('tableInfo').textContent = 'Sandbox · ' + replay.players.map((q, i) => q.name + ' (map ' + replay.maps[i].id + ')').join(' vs ') + (replay.marine_worlds ? ' · Marine Worlds' : '');
    const box = $('forkinfo');
    box.hidden = false;
    box.replaceChildren();
    const fresh = el('a', '', 'New sandbox');
    fresh.href = '/sandbox.html';
    fresh.onclick = () => { sessionStorage.removeItem('sandboxGame'); };
    box.append(el('b', '', 'Sandbox'), document.createTextNode(' · '), fresh, el('div', 'forknote', 'The other seat is a bot that only passes. Set the empty base projects and conservation bonuses, then play; the tools below change the game at any time. Going back a step undoes an edit or a move.'));
    document.body.classList.add('forkpage');
  }

  function initFork() {
    document.title = 'Fork - Ark Nova Replay';
    $('tableInfo').textContent = 'Fork of table #' + replay.table_id + ' after step ' + forkInfo.step + ' · ' + replay.players.map((p) => p.name).join(' vs ');
    const box = $('forkinfo');
    box.hidden = false;
    box.replaceChildren();
    const back = el('a', '', 'replay of table #' + replay.table_id);
    back.href = '/replay.html?table=' + encodeURIComponent(replay.table_id) + '#' + forkInfo.step;
    const seedIn = el('input', 'seedinput');
    seedIn.type = 'number'; seedIn.min = 0; seedIn.value = forkInfo.seed; seedIn.setAttribute('aria-label', 'Seed');
    const use = el('button', '', 'Fork again with this seed');
    use.type = 'button';
    use.title = 'Reload the fork from the same position with this seed (the moves made so far are lost)';
    use.onclick = () => {
      const v = String(seedIn.value).trim();
      if (!/^\d+$/.test(v)) { seedIn.focus(); return; }
      if (replay.steps.length > 1 && !confirm('Start the fork again? The moves you made are lost.')) return;
      const q = new URLSearchParams(location.search);
      q.set('seed', v);
      location.search = q.toString();
    };
    const copy = el('button', '', 'Copy link');
    copy.type = 'button';
    copy.title = 'The link of this fork position with its seed: opening it gives the same position and deck order';
    copy.onclick = async () => {
      const q = new URLSearchParams({ table: String(replay.table_id), step: String(forkInfo.step), seed: String(forkInfo.seed) });
      const link = location.origin + '/fork.html?' + q.toString();
      try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied'; } catch (e) { window.prompt('Link of this fork', link); }
      setTimeout(() => { copy.textContent = 'Copy link'; }, 1500);
    };
    const note = el('span', 'muted', forkInfo.seed === forkInfo.default_seed
      ? 'Seed ' + forkInfo.seed + ' is the order of the replay: the cards that were drawn in the game come up as they did; the rest was shuffled with this seed.'
      : 'Seed ' + forkInfo.seed + ': the cards never seen in the game are in the order of this seed (seed ' + forkInfo.default_seed + ' is the replay).');
    box.append(el('b', '', 'Fork of the '), back, document.createTextNode(' after step ' + forkInfo.step + ' · Draw pile order seed: '), seedIn, use, copy, el('div', 'forknote', ''));
    box.lastChild.append(note, document.createTextNode(' You play both seats; the same seed always gives the same deck order. Going back a step and playing another move replaces what came after.'));
    document.body.classList.add('forkpage');
  }

  // the buildings that can be placed: a button per piece; once one is chosen the zoo map takes the clicks (see zooBoard)
  function renderPlacementControls(box, placeActs) {
    const wrap = el('div', 'placectl');
    const seat = placeActs[0].player;
    const pieces = [];
    for (const a of placeActs) {
      const key = a.args.type + (a.args.extra ? '*' : '');
      let p = pieces.find((q) => q.key === key);
      if (!p) { p = { key, type: a.args.type, extra: !!a.args.extra, n: 0 }; pieces.push(p); }
      p.n += 1;
    }
    if (!placement) {
      wrap.append(el('div', 'placehead', replay.players[seat].name + ' can place a building: choose a piece, then click a hex of the zoo for its anchor'));
      const row = el('div', 'forkrow');
      for (const p of pieces) {
        const b = el('button', 'forkmove piece');
        b.type = 'button'; b.disabled = forkBusy;
        b.style.setProperty('--pc', seatColor(seat));
        const sp = spriteOf({ type: p.type });
        if (sp) { const img = el('img'); img.src = '/enclosures/' + sp.image; img.alt = ''; const k = Math.min(0.12, 70 / sp.size[1]); img.style.width = (sp.size[0] * k) + 'px'; img.style.height = (sp.size[1] * k) + 'px'; b.append(img); }
        b.append(el('span', '', p.type.replace(/-/g, ' ') + (p.extra ? ' (additional)' : '') + ' - ' + p.n + ' spots'));
        b.onclick = () => {
          placement = { seat, type: p.type, extra: p.extra, x: null, y: null, rot: 0 };
          render();
          const board = document.querySelectorAll('.zoo')[seat];
          if (board) board.scrollIntoView({ block: 'center', behavior: 'smooth' });
        };
        row.append(b);
      }
      wrap.append(row);
    } else {
      const legal = legalPlacement(placement);
      const head = el('div', 'placehead');
      head.append(el('b', '', placement.type.replace(/-/g, ' ') + (placement.extra ? ' (additional)' : '')),
                  document.createTextNode(placement.x === null ? ' - click a hex of ' + replay.players[placement.seat].name + "'s zoo to put the anchor there"
                    : ' - anchor (' + placement.x + ', ' + placement.y + '), rotation ' + placement.rot + ' - '),
                  placement.x === null ? document.createTextNode('') : el('b', legal ? 'placeok' : 'placebad', legal ? 'legal' : 'not legal'));
      wrap.append(head);
      const row = el('div', 'forkrow');
      const ok = el('button', 'forkmove');
      ok.type = 'button'; ok.textContent = 'Place the building'; ok.disabled = !legal || forkBusy;
      ok.onclick = () => playFork(legal);
      const cancel = el('button', 'forkmove');
      cancel.type = 'button'; cancel.textContent = 'Choose another piece';
      cancel.onclick = () => { placement = null; render(); };
      row.append(ok, cancel);
      wrap.append(row);
    }
    box.append(wrap);
  }

  // the warning before a move that cannot be taken back: Undo and Restart turn stop at it
  function warnIrreversible(reason) {
    return new Promise((resolve) => {
      const back = el('div', 'modalback');
      const box = el('div', 'modalbox');
      box.setAttribute('role', 'alertdialog');
      const done = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      const cancel = el('button', 'turnbtn undo', 'Cancel'), go = el('button', 'turnbtn confirm', 'Confirm');
      cancel.type = go.type = 'button';
      cancel.onclick = () => done(false);
      go.onclick = () => done(true);
      const row = el('div', 'modalrow');
      row.append(go, cancel);
      box.append(el('p', '', "You are about to do a move that's impossible to undo. Are you sure?"), row);
      back.append(box);
      back.addEventListener('click', (e) => { if (e.target === back) done(false); });
      document.addEventListener('keydown', onKey);
      document.body.append(back);
      go.focus();
    });
  }

  // the steps a move made after going back replaces the old future with
  function commitSteps(steps) {
    placement = null;
    replay.steps.length = step + 1;
    for (const st of steps) { st.index = replay.steps.length; replay.steps.push(st); }
    buildMoveList();
    $('total').textContent = replay.steps.length - 1;
    $('jump').max = replay.steps.length - 1;
    forkBusy = false;
    go(replay.steps.length - 1);
  }

  async function playFork(action) {
    if (forkBusy) return;
    forkBusy = true;
    renderForkMoves();
    try {
      const move = { player: action.player, kind: action.kind, args: action.args };
      const res = SANDBOX
        ? await fetch('/api/sandbox/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: replay.steps[step].engine_state, meta: sbMeta(), action: move }) })
        : await fetch('/api/fork/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: replay.steps[step].engine_state, action: move, names: replay.players.map((p) => p.name) }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'the move could not be played');
      const steps = SANDBOX ? body.steps : [body];
      const first = steps[0];
      if (first.irreversible && ['turn', 'final_turns'].includes(replay.steps[step].state.phase)) {          // (a fork changes nothing until the step is added: the move was only computed)
        forkBusy = false;
        const ok = await warnIrreversible(first.irreversible_reason);
        if (!ok) { refreshBar(); return; }
        forkBusy = true;
      }
      commitSteps(steps);
    } catch (err) {
      forkBusy = false;
      renderForkMoves(err.message);
    }
  }

  const keepSel = new Map();                                              // seat -> the cards the viewer keeps at the initial discard: cleared at every step
  function renderInitialDiscard(box, acts, st) {
    for (const seat of [...new Set(acts.map((a) => a.player))]) {
      const mine = acts.filter((a) => a.player === seat);
      const offer = new Set(mine.flatMap((a) => a.args.cards));
      const hand = st.players[seat].hand.filter((k) => offer.has(k));
      const nDiscard = mine[0].args.cards.length, keep = hand.length - nDiscard;
      const sel = keepSel.get(seat) || new Set();
      keepSel.set(seat, sel);
      const sect = el('div', 'forkdiscard');
      const who = el('span', 'who', replay.players[seat].name);
      who.style.color = seatColor(seat);
      const head = el('div', 'forkhead');
      head.append(el('b', '', 'Choose ' + keep + ' card' + (keep === 1 ? '' : 's') + ' to keep for '), who, el('span', 'muted', ' - the other ' + nDiscard + ' are discarded'));
      const row = el('div', 'cards');
      const confirm = el('button', 'forkmove forkconfirm');
      confirm.type = 'button';
      confirm.style.setProperty('--pc', seatColor(seat));
      const refresh = () => {
        confirm.textContent = 'Confirm (' + sel.size + '/' + keep + ')';
        confirm.disabled = forkBusy || sel.size !== keep;
      };
      for (const k of hand) {
        const c = card(k, 'markable' + (sel.has(k) ? ' marked' : ''));
        c.addEventListener('click', () => {
          if (sel.has(k)) sel.delete(k); else if (sel.size < keep) sel.add(k);
          c.classList.toggle('marked', sel.has(k));
          refresh();
        });
        row.append(c);
      }
      confirm.onclick = () => {
        const drop = hand.filter((k) => !sel.has(k)).sort();
        const act = mine.find((a) => [...a.args.cards].sort().join() === drop.join());
        if (act) playFork(act);
      };
      refresh();
      sect.append(head, row, confirm);
      box.append(sect);
    }
  }

  // The fork is played from the bar at the top: the controls the bar already has (action cards, break, tasks, effects, deck) play their legal action, the pieces
  // of a Build are placed with the controls that follow them, a card clicked in the hand / display shows the moves of that card (a confirm button when there is
  // one), and the legal moves that no control stands for are listed at the end of the bar.
  function forkBar() {
    const bar = $('actionbar'), cur = replay.steps[step], acts = cur.actions || [];
    if (SANDBOX && replay.setup) { if (bar) sbSetupBar(bar); return; }          // the seat and the maps first
    if (SANDBOX && !sbReady()) {                                             // the empty spaces first
      if (bar) { bar.hidden = false; bar.replaceChildren(el('b', '', 'Set the base projects and the conservation bonuses (the empty spaces of the board) to start playing.')); }
      return;
    }
    if (!bar || forkGate || (!acts.length && !forkError)) return;
    if (acts.some((a) => a.kind === 'draft_pick' || a.kind === 'draft_keep')) return;      // (the draft is played in the bar itself)
    for (const a of acts) {                                                          // the action cards of the bar
      if (a.kind === 'choose_action_card' && !a.args.hypnosis && !a.args.t1) forkClaimed.add(a);
      if (a.kind === 'skip_action' && !a.args.repeat) forkClaimed.add(a);
    }
    for (const a of acts) {                                                          // the tiles of the association board that are clicked there
      if (a.kind === 'association_task' && ((a.args.task === 'partner' && a.args.continent) || (a.args.task === 'university' && a.args.kind))) forkClaimed.add(a);
    }
    if (assocMode) for (const a of acts) if (a.kind === 'association_task') forkClaimed.add(a);      // (while a partner zoo / university is chosen, the other tasks are not offered)
    bar.querySelectorAll('.abtn.gen').forEach((n) => n.remove());                    // (the kinds of action are listed as buttons of their own below)
    bar.hidden = false;
    const st = cur.state, seat = cur.options ? cur.options.seat : acts.length ? acts[0].player : 0;
    const bonusActs = acts.filter((a) => a.kind === 'choose_bonus');
    if (bonusActs.length) {                                                          // the bonus of a supported project: click a bonus slot of the player board, then confirm
      for (const a of bonusActs) forkClaimed.add(a);
      bar.replaceChildren();
      const who0 = el('span', 'who', replay.players[bonusActs[0].player].name);
      who0.style.color = seatColor(bonusActs[0].player);
      const match = bonusActs.find((a) => a.args.bonus === forkBonus);
      const ok = el('button', 'forkmove forkconfirm', 'Confirm');
      ok.type = 'button'; ok.disabled = !match || forkBusy;
      ok.onclick = () => { if (match) playFork(match); };
      bar.append(who0, el('b', '', ' must choose a bonus to unlock'), ok);
    }
    if (!bar.children.length && !acts.some((x) => x.kind === 'initial_discard')) {
      const who = el('span', 'who', replay.players[seat].name);
      who.style.color = seatColor(seat);
      bar.append(who, el('b', '', ' ' + ((cur.options && PROMPT_TEXT[cur.options.prompt]) || 'must decide')));
    }
    const marked = (zone, keys) => keys.filter((k, i) => cardMarks.has(zone + '#' + i));
    const btn = (a, text, confirm) => {
      const b = el('button', 'forkmove' + (confirm ? ' forkconfirm' : ''));
      b.type = 'button'; b.disabled = forkBusy;
      b.style.setProperty('--pc', seatColor(a.player));
      b.textContent = text;
      b.title = JSON.stringify(a.args);
      b.onclick = () => playFork(a);
      return b;
    };
    const placeActs = acts.filter((a) => a.kind === 'place_building');
    for (const a of placeActs) forkClaimed.add(a);
    if (placeActs.length) renderPlacementControls(bar, placeActs);
    const handActs = acts.filter((a) => a.args && a.args.card && !a.args.from_display && ['play_animal', 'play_sponsor', 'sponsor_side'].includes(a.kind));
    const dispActs = acts.filter((a) => a.args && a.args.card && (a.args.from_display || (a.kind === 'take_cards' && a.args.mode !== 'deck')));
    const discardActs = acts.filter((a) => a.kind === 'discard_cards');
    const marketActs = acts.filter((a) => a.kind === 'choose_effect' && typeof a.args.card === 'string' && ((cur.options && cur.options.effects) || []).some((e) => e.index === a.args.index && e.kind === 'marketing'));
    for (const a of marketActs) forkClaimed.add(a);
    if (marketMode !== null && marketActs.some((a) => a.args.index === marketMode)) {   // Marketing: choose the sponsor in the hand (or pass), then confirm
      const mine = marketActs.filter((a) => a.args.index === marketMode), p0 = mine[0].player;
      bar.replaceChildren();
      const who0 = el('span', 'who', replay.players[p0].name);
      who0.style.color = seatColor(p0);
      const pickedKey = marked(p0 + ':hand', st.players[p0].hand).find((k) => mine.some((a) => a.args.card === k));
      const match = mine.find((a) => a.args.card === pickedKey);
      const ok = match ? btn(match, 'Confirm: market ' + cardName(pickedKey), true) : el('button', 'forkmove forkconfirm', 'Confirm');
      ok.type = 'button'; ok.disabled = !match || forkBusy;
      bar.append(who0, el('b', '', ' may spend money to play a sponsor from their hand'), ok);
      for (const a of acts.filter((x) => x.kind === 'skip_effect' && x.args.index === marketMode)) { forkClaimed.add(a); bar.append(btn(a, 'Pass', false)); }
    }
    const thrActs = acts.filter((a) => a.kind === 'choose_effect' && (a.args.upgrade || a.args.hire) && ((cur.options && cur.options.effects) || []).some((e) => e.index === a.args.index && (e.kind === 'threshold2' || e.kind === 'upgrade')));
    for (const a of thrActs) forkClaimed.add(a);
    if (thresholdMode && thrActs.some((a) => a.args.index === thresholdMode.index)) {      // 2 conservation: gain a worker or an upgrade (then which action card)
      const mine = thrActs.filter((a) => a.args.index === thresholdMode.index), p0 = mine[0].player;
      const hire = mine.filter((a) => a.args.hire), ups = mine.filter((a) => a.args.upgrade);
      bar.replaceChildren();
      const who0 = el('span', 'who', replay.players[p0].name);
      who0.style.color = seatColor(p0);
      bar.append(who0);
      const withIcon = (text, id, onclick) => {
        const b = el('button', 'forkmove forkchoice');
        b.type = 'button'; b.disabled = forkBusy;
        b.style.setProperty('--pc', seatColor(p0));
        const i = el('img', 'icon'); i.src = iconUrl(id); i.alt = ''; i.height = 30;
        b.append(el('span', '', text), i);
        b.onclick = onclick;
        return b;
      };
      if (thresholdMode.stage === 'upgrade' && ups.length > 1) {
        bar.append(el('b', '', ' must choose an action card to upgrade'));
        for (const a of ups) {
          const b = el('button', 'forkmove forkchoice');
          b.type = 'button'; b.disabled = forkBusy; b.style.setProperty('--pc', seatColor(p0));
          b.title = 'Upgrade ' + ACTION_NAMES[a.args.upgrade];
          b.append(pic(ACTION_ICON[a.args.upgrade], 34));
          b.onclick = () => playFork(a);
          bar.append(b);
        }
        if (hire.length) { const back = el('button', 'forkmove', 'Back'); back.type = 'button'; back.onclick = () => { thresholdMode.stage = 'choose'; refreshBar(); }; bar.append(back); }
      } else {
        bar.append(el('b', '', ' must choose to gain a worker or an upgrade'));
        if (hire.length) bar.append(withIcon('Gain a worker', ICON_IDS['bonus:Worker'], () => playFork(hire[0])));
        if (ups.length) bar.append(withIcon('Gain an upgrade', ICON_IDS['bonus:upgrade-card'] || 'r10c5', () => { if (ups.length === 1) playFork(ups[0]); else { thresholdMode.stage = 'upgrade'; refreshBar(); } }));
      }
    }
    const cardEff = acts.filter((a) => a.kind === 'choose_effect' && Array.isArray(a.args.cards));      // an effect that takes cards of the hand (sunbathing)
    for (const a of [...handActs, ...dispActs, ...discardActs, ...cardEff]) forkClaimed.add(a);
    const initActs = acts.filter((a) => a.kind === 'initial_discard');
    for (const a of initActs) forkClaimed.add(a);
    const actor = (handActs[0] || discardActs[0] || cardEff[0] || initActs[0] || (marketMode !== null ? marketActs[0] : null) || {}).player;
    if (actor !== undefined && forkDockStep !== step) {                              // the hand of the player who has to choose is open
      forkDockStep = step;
      if (dockSel.seat !== actor || dockSel.kind !== 'hand' || dockHidden) { dockSel = { seat: actor, kind: 'hand' }; dockHidden = false; renderDock(curState()); }
    }
    const chosen = [];                                                                // [card, its legal moves] of the selected cards
    for (const [s2, p] of st.players.entries()) {
      for (const k of marked(s2 + ':hand', p.hand)) {
        const mine = handActs.filter((a) => a.player === s2 && a.args.card === k);
        if (mine.length) chosen.push([k, mine]);
      }
    }
    for (const k of marked('display', st.display)) {
      const mine = dispActs.filter((a) => a.args.card === k);
      if (k && mine.length) chosen.push([k, mine]);
    }
    if (chosen.length) {                                                              // one selected card: its moves (a single one is a confirm button)
      const [k, mine] = chosen[0];
      bar.append(el('b', '', cardName(k) + ':'));
      for (const a of mine) bar.append(btn(a, mine.length === 1 ? 'Confirm: ' + a.text : a.text, mine.length === 1));
    } else if (handActs.length || dispActs.length) {
      bar.append(el('span', 'muted', 'click a card of the hand' + (dispActs.length ? ' or of the display' : '') + ' to see its moves'));
    }
    if (discardActs.length) {                                                         // discards: pick the cards in the hand, then confirm
      const p = discardActs[0].player, need = (discardActs[0].args.cards || []).length;
      const picked = marked(p + ':hand', st.players[p].hand).sort();
      const match = discardActs.filter((a) => [...a.args.cards].sort().join() === picked.join());
      bar.append(el('b', '', 'select ' + need + ' card' + (need === 1 ? '' : 's') + ' in the hand (' + picked.length + '/' + need + ')'));
      for (const a of match) bar.append(btn(a, match.length === 1 ? 'Confirm' : a.text, true));
      if (!match.length) { const b = el('button', 'forkmove forkconfirm', 'Confirm'); b.type = 'button'; b.disabled = true; bar.append(b); }
    }
    if (cardEff.length) {                                                             // up to X cards of the hand, then confirm or pass
      const p = cardEff[0].player, idx = cardEff[0].args.index, max = Math.max(...cardEff.map((a) => a.args.cards.length));
      const eff = ((cur.options && cur.options.effects) || []).find((e) => e.index === idx) || {};
      const picked = marked(p + ':hand', st.players[p].hand).sort();
      const match = cardEff.find((a) => a.args.index === idx && [...a.args.cards].sort().join() === picked.join());
      bar.append(el('b', '', 'Choose up to ' + max + ' card' + (max === 1 ? '' : 's') + (eff.kind === 'sell' ? ' to sunbathe' : '') + ' (' + picked.length + '/' + max + ')'));
      const ok = match ? btn(match, 'Confirm', true) : el('button', 'forkmove forkconfirm', 'Confirm');
      ok.type = 'button'; ok.disabled = !match || forkBusy;
      bar.append(ok);
      for (const a of acts.filter((x) => x.kind === 'skip_effect' && x.args.index === idx)) { forkClaimed.add(a); bar.append(btn(a, 'Pass', false)); }
    }
    for (const seat0 of [...new Set(initActs.map((a) => a.player))]) {                 // the initial discard: pick the cards to keep in the hand, then confirm
      const mine = initActs.filter((a) => a.player === seat0);
      const offer = new Set(mine.flatMap((a) => a.args.cards));
      const hand0 = st.players[seat0].hand.filter((k) => offer.has(k));
      const keep = hand0.length - mine[0].args.cards.length;
      const picked = marked(seat0 + ':hand', st.players[seat0].hand).filter((k) => offer.has(k));
      const drop = hand0.filter((k) => !picked.includes(k)).sort().join();
      const match = picked.length === keep ? mine.find((a) => [...a.args.cards].sort().join() === drop) : null;
      const who1 = el('span', 'who', replay.players[seat0].name);
      who1.style.color = seatColor(seat0);
      const ok = match ? btn(match, 'Confirm', true) : el('button', 'forkmove forkconfirm', 'Confirm');
      ok.type = 'button'; ok.disabled = !match || forkBusy;
      bar.append(who1, el('b', '', ' must choose ' + keep + ' card' + (keep === 1 ? '' : 's') + ' to keep (' + picked.length + '/' + keep + ')'), ok);
    }
    if (forkMenu) {                                                                   // the choices of a button with several moves
      const row = el('span', 'forkmenu');
      row.append(el('b', '', forkMenu.label ? forkMenu.label + ': ' : ''));
      for (const a of forkMenu.acts) row.append(btn(a, a.text, false));
      bar.append(row);
    }
    const rest = acts.filter((a) => !forkClaimed.has(a));                             // the moves that no control of the bar stands for
    if (rest.length) {
      const holder = rest.length > 10 ? el('details', 'forkmore') : el('span', 'forkmore');
      if (rest.length > 10) holder.append(el('summary', '', 'More moves (' + rest.length + ')'));
      for (const a of rest) holder.append(btn(a, (new Set(rest.map((x) => x.player)).size > 1 ? replay.players[a.player].name + ': ' : '') + a.text, false));
      bar.append(holder);
    }
    if (st.phase === 'turn' || st.phase === 'final_turns') turnButtons(bar, st.turn, st.active_player, false);       // undo / restart turn at every step of a turn
    if (!acts.length) bar.append(el('span', 'forkerror', 'The engine offers no move in this position (a rule that is not complete yet). Go back a step and play something else.'));
    if (forkError) bar.append(el('span', 'forkerror', forkError));
  }

  function renderForkMoves(error) {
    const box = $('forkpanel');
    if (!box) return;
    const s = replay.steps[step], acts = s.actions || [];
    box.replaceChildren();
    forkError = error || '';
    if (error) { refreshBar(); return; }
    if (forkBusy) refreshBar();
    return;          // everything is played from the bar at the top (the initial discard keeps its cards here)
    if (acts.some((a) => a.kind === 'draft_pick' || a.kind === 'draft_keep')) return;      // the draft is played in the bar at the top
    if (acts.length && acts.every((a) => a.kind === 'choose_action_card' || a.kind === 'skip_action') && s.options && s.options.prompt === 'choose_action_card') return;      // so is the choice of the action card
    const head = el('div', 'forkhead');
    const seats = [...new Set(acts.map((a) => a.player))];
    head.append(el('b', '', acts.length ? 'Legal moves (' + acts.length + ')' : 'No legal move'),
                el('span', 'muted', acts.length ? ' - ' + seats.map((q) => replay.players[q].name).join(' and ') + ' to act; click one to play it' : ''));
    box.append(head);
    if (error) box.append(el('div', 'forkerror', error));
    if (!acts.length) {
      const phase = s.state.phase;
      box.append(el('div', 'forknone', phase === 'over' || phase === 'scoring' ? 'The game is over.' : 'The engine offers no move in this position (a rule that is not complete yet, or nothing that can be done). Go back a step with the arrow and play something else.'));
      return;
    }
    const discardActs = acts.filter((a) => a.kind === 'initial_discard');
    if (discardActs.length) { renderInitialDiscard(box, discardActs, s.state); return; }
    const placeActs = acts.filter((a) => a.kind === 'place_building');
    if (placeActs.length) renderPlacementControls(box, placeActs);
    const otherActs = acts.filter((a) => a.kind !== 'place_building');
    let filter = null;
    if (otherActs.length > 24) {
      filter = el('input', 'forkfilter');
      filter.type = 'search'; filter.placeholder = 'Filter the moves'; filter.setAttribute('aria-label', 'Filter the moves');
      box.append(filter);
    }
    const groups = new Map();
    for (const a of otherActs) {
      const key = a.kind + (a.kind === 'place_building' ? ':' + a.args.type : '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    }
    const buttons = [];
    for (const [key, list] of groups) {
      const d = el('details', 'forkgroup');
      d.open = list.length <= 16 || groups.size === 1;
      const sum = el('summary', '', (KIND_LABEL[list[0].kind] || list[0].kind.replace(/_/g, ' ')) + (key.includes(':') ? ' - ' + key.split(':')[1] : '') + ' (' + list.length + ')');
      d.append(sum);
      const row = el('div', 'forkrow');
      for (const a of list) {
        const b = el('button', 'forkmove');
        b.type = 'button';
        b.disabled = forkBusy;
        b.style.setProperty('--pc', seatColor(a.player));
        b.textContent = (seats.length > 1 ? replay.players[a.player].name + ': ' : '') + a.text;
        b.title = JSON.stringify(a.args);
        b.onclick = () => playFork(a);
        b._text = b.textContent.toLowerCase();
        buttons.push(b);
        row.append(b);
      }
      d.append(row);
      box.append(d);
    }
    if (filter) filter.oninput = () => {
      const q = filter.value.trim().toLowerCase();
      for (const b of buttons) b.hidden = !!q && !b._text.includes(q);
      for (const d of box.querySelectorAll('details')) { const any = [...d.querySelectorAll('.forkmove')].some((b) => !b.hidden); d.hidden = !any; if (q && any) d.open = true; }
    };
  }

  function go(n) {
    const before = step;
    step = Math.max(0, Math.min(replay.steps.length - 1, n));
    if (step !== before) { thresholdMode = null; marketMode = null; assocSpecies = null; forkBonus = null; assocMode = null; forkMenu = null; forkError = ''; draftMarks.clear(); cardMarks.clear(); keepSel.clear(); forkSpend = 0; skipMode = false; placement = null; }
    render();
  }
  function buildMoveList() {
    const list = $('moves');
    list.replaceChildren();
    replay.steps.forEach((s, i) => {
      // the step that finishes an action passes the turn in its state, but it still belongs to the player who acted
      const prev = i > 0 ? replay.steps[i - 1].state : null;
      const named = replay.players.findIndex((pl) => (s.label || '').startsWith(pl.name + ' '));        // (a label that starts with a player's name is that player's)
      const actor = s.actor !== null && s.actor !== undefined ? s.actor : named >= 0 ? named            // the player the log names for this line (a Boost / Clever effect after the turn passed is still the acting player's)
        : prev && s.state.turn > prev.turn && s.state.active_player !== prev.active_player ? prev.active_player : s.state.active_player;
      const li = el('li', 'seat' + actor);
      li.style.borderLeftColor = seatColor(actor);
      li.append(el('span', 'n', i), labelNode(labelOf(s) || '…'), engineBadge(s.engine));
      li._step = s;
      li.onclick = () => { go(i); };
      list.append(li);
    });
  }

  function init() {
    $('tableInfo').textContent = 'Table #' + replay.table_id + (replay.marine_worlds ? ' · Marine Worlds' : '') + ' · ' + replay.players.map((p) => p.name).join(' vs ');
    $('total').textContent = replay.steps.length - 1;
    const es = replay.engine;
    if (es) $('tableInfo').append(' · engine: ' + es.ok + '/' + es.turns + ' turns replayed' + (es.mismatch + es.illegal ? ', ' + (es.mismatch + es.illegal) + ' differ from the log' : '') + (es.skipped ? ', ' + es.skipped + ' not supported yet' : ''));
    $('jump').max = replay.steps.length - 1;
    buildMoveList();
    buildTimeline();
    setupDrawer();
    setupPov();
    $('first').onclick = () => { go(0); };
    $('prev').onclick = () => { go(step - 1); };
    $('next').onclick = () => { go(step + 1); };
    $('play').onclick = () => { setPlaying(!timer); };
    for (const b of document.querySelectorAll('.speed button')) b.onclick = () => { setSpeed(+b.dataset.speed); };
    $('last').onclick = () => { go(replay.steps.length - 1); };
    $('jump').onchange = (e) => { go(parseInt(e.target.value, 10) || 0); };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && openedPile) { closePile(); return; }
      if (e.target.tagName === 'INPUT' || e.altKey || e.ctrlKey || e.metaKey) return;
      const keys = { ArrowLeft: () => go(step - 1), ArrowRight: () => go(step + 1), ' ': () => { document.activeElement?.blur?.(); setPlaying(!timer); }, Home: () => go(0), End: () => go(replay.steps.length - 1) };
      if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
    });
    if (SANDBOX) initSandbox();
    else if (FORK) initFork();
    else {
      const fb = $('fork');
      if (fb) fb.onclick = () => { if (replay.steps[step].fork) window.open('/fork.html?table=' + encodeURIComponent(table) + '&step=' + step, '_blank'); };
    }
    const start = FORK ? 0 : parseInt(location.hash.slice(1), 10);
    if (loadProgress) loadProgress.done();
    $('loading').hidden = true;
    $('app').hidden = false;
    go(Number.isFinite(start) ? start : 0);
  }

  if (!SANDBOX && !/^\d+$/.test(table || '')) { location.replace('/'); return; }
  const loadProgress = !SANDBOX && window.Progress && $('loading')
    ? Progress.start($('loading'), { key: FORK ? 'fork' : 'replay', title: FORK ? 'Loading the fork' : 'Loading the table and its log', expected: FORK ? 5000 : 9000,
                                     stages: [[0, 'Looking up the table'], [0.08, 'Reading the log'], [0.25, 'Replaying the game with the engine'], [0.8, 'Building the steps']] })
    : null;
  fetchReplay().then((data) => {
    if (!data) return;
    replay = data;
    if (loadProgress) loadProgress.stage('Preparing the board');
    return Promise.all([
      fetch('/enclosures/sprites.json').then((r) => r.json()).catch(() => ({ sprites: {} })),
      fetch('/icons/icons.json').then((r) => r.json()).catch(() => ({})),
      fetch('/icons/names.json').then((r) => r.json()).catch(() => ({})),
    ]).then(([sp, ic, names]) => {
      applyIconNames(names);
      iconNames = names;
      sprites = sp.sprites;
      for (const [id, v] of Object.entries(ic)) iconSizes[id] = v.size;
      init();
    });
  }).catch((err) => {
    const m = $('loading');
    if (loadProgress) loadProgress.fail();
    m.className = 'status error';
    m.textContent = 'Could not load this table: ' + err.message;
  });
})();
