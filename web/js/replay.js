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

  let replay = null;
  let step = 0;
  let timer = null;

  // ---- loading --------------------------------------------------------------------------------------------------
  async function fetchReplay() {
    const url = '/api/tables/' + encodeURIComponent(table) + '/replay';
    let res;
    if (params.get('source') === 'upload') {
      const text = await LogStore.get(table);
      if (!text) { location.replace('/submit.html?table=' + encodeURIComponent(table)); return null; }
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
    } else {
      res = await fetch(url);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'the replay could not be loaded');
    return body;
  }

  // ---- card helpers ---------------------------------------------------------------------------------------------
  const title = (s) => String(s).toLowerCase().replace(/(^|[\s-])(\w)/g, (m, a, b) => a + b.toUpperCase());
  const info = (key) => replay.cards[key] || { name: key, type: 'unknown' };
  const cardName = (key) => title(info(key).name);

  function card(key, extraClass) {
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
  function showPreview(src) { const p = $('preview'); p.src = src; p.hidden = false; }
  function hidePreview() { $('preview').hidden = true; }
  function textFace(key, c) {
    const t = el('div', 'txt');
    t.append(el('b', '', title(c.name)), el('span', '', key + (c.type && c.type !== 'unknown' ? ' · ' + c.type : '')));
    return t;
  }
  function cardRow(keys, cls, emptyText) {
    const row = el('div', 'cards' + (cls ? ' ' + cls : ''));
    if (!keys.length) row.append(el('span', 'empty', emptyText || 'none'));
    for (const k of keys) row.append(k ? card(k) : el('div', 'card'));
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
    'bonus:bonus-sponsor': 'r7c6', 'bonus:sponsor-person-card': 'r7c6', 'bonus:Digging': 'r4c11', 'bonus:Partner-Zoo': 'r10c14', 'bonus:Multiplier': 'r6c8',
    'bonus:Worker': 'r5c13', 'bonus:upgrade-card': 'r10c5',
  };
  // BGA's names of the icons (scripts/name_icons.py): the placement bonus of each type shows the icon of the same name
  const BONUS_ICON_NAME = {
    reputation: 'reputation', money: 'money', xtoken: 'xtoken-bordered', 'take-in-range-or-deck': 'take-in-range-or-deck', Clever: 'clever', 'bonus-sponsor': 'bonus-sponsor',
    'sponsor-person-card': 'sponsor-person-card', Digging: 'digging', 'Partner-Zoo': 'partner-zoo', Multiplier: 'multiplier', Worker: 'add-worker', 'upgrade-card': 'upgrade-card',
    appeal: 'appeal', conservation: 'conservation', Snapping: 'snapping', 'size-2': 'enclosure-size-2',
  };
  function applyIconNames(names) {
    for (const [type, name] of Object.entries(BONUS_ICON_NAME)) if (names[name]) ICON_IDS['bonus:' + type] = names[name];
    ICON_IDS.money = names.money; ICON_IDS.appeal = names.appeal; ICON_IDS.conservation = names.conservation; ICON_IDS.reputation = names.reputation; ICON_IDS.xtoken_plain = names.xtoken;
  }
  const SHOW_VALUE = new Set(['money', 'reputation']);     // BGA prints the number on these two only; the icon of every other bonus already says what it is
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

  function zooBoard(map, player) {
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
      iconBox(ICON_IDS.pentagon, cx, cy, 80);
      const icon = ICON_IDS['bonus:' + bn.type];
      if (bn.type === 'money') moneyTile(s, cx, cy + 3, 48);
      else if (icon) iconBox(icon, cx, cy + 3, 48);
      if (bn.type === 'appeal') put('text', { x: cx, y: cy + 6, class: 'bonus-label' }, '★');      // a bonus nobody has identified yet is just the empty pentagon
      if (SHOW_VALUE.has(bn.type)) put('text', { x: cx, y: cy + 16, class: 'bonus-number' }, bn.value);       // the number sits over the middle of the icon
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

    for (const b of player.buildings) {
      const sp = spriteOf(b);
      const animals = b.animal ? [b.animal] : b.animals;
      const title = svg('title');
      title.textContent = b.type + (animals && animals.length ? ': ' + animals.map(cardName).join(', ') : ' (empty)');
      if (!sp) {                                  // a building whose sprite is missing: outline its hexes
        const g = svg('g');
        g.append(title);
        for (const [x, y] of b.cells) {
          const [cx, cy] = cellCentre(x, y);
          g.append(svg('polygon', { points: [0, 1, 2, 3, 4, 5].map((i) => (cx + 76 * Math.cos(i * Math.PI / 3)).toFixed(1) + ',' + (cy + 76 * Math.sin(i * Math.PI / 3)).toFixed(1)).join(' '), class: 'nosprite' }));
        }
        s.append(g);
        continue;
      }
      const [cx, cy] = cellCentre(b.x, b.y);
      const img = svg('image', {
        href: '/enclosures/' + sp.image, x: cx - sp.anchor[0] * SPRITE_SCALE, y: cy - sp.anchor[1] * SPRITE_SCALE,
        width: sp.size[0] * SPRITE_SCALE, height: sp.size[1] * SPRITE_SCALE,
        transform: 'rotate(' + (b.rotation * 60) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')',
      });
      img.append(title);
      s.append(img);
      if (params.has('debug')) {                  // ?debug: outline the cells the engine says the building covers
        for (const [x, y] of b.cells) {
          const [hx, hy] = cellCentre(x, y);
          s.append(svg('polygon', { points: [0, 1, 2, 3, 4, 5].map((i) => (hx + 76 * Math.cos(i * Math.PI / 3)).toFixed(1) + ',' + (hy + 76 * Math.sin(i * Math.PI / 3)).toFixed(1)).join(' '),
            fill: 'none', stroke: '#f0f', 'stroke-width': 3 }));
        }
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
    const at = {};                       // location -> [seat, ...] of the players' tokens there
    st.players.forEach((p, seat) => p.tokens.forEach((t) => (at[t.location] = at[t.location] || []).push(seat)));
    for (const t of st.board_tokens) {
      if (t.location === 'association_3') {
        const continent = t.type.replace('partner-', '');
        const pos = ASSOC.partner[continent];
        if (pos) {
          put('image', { href: iconUrl(ICON_IDS[continent]), x: pos[0] - 109, y: pos[1] - 87, width: 218, height: 174 }, undefined, t.type);
        }
      } else if (t.location === 'association_4') {
        const pos = ASSOC.university[mw ? 'mw' : 'base'][t.type];
        if (pos && ICON_IDS[t.type]) {
          put('image', { href: iconUrl(ICON_IDS[t.type]), x: pos[0] - 115, y: pos[1] - 87, width: 230, height: 174 }, undefined, t.type);
        }
      }
    }
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
      put('circle', { cx: x, cy: y, r: 30, fill: seatColor(seat), stroke: '#fff', 'stroke-width': 6 }, undefined, replay.players[seat].name + ': donation');
    }));
    for (const [n, [cx, cy, xs]] of Object.entries(ASSOC.workers)) {
      (at['association_' + n] || []).slice(0, 3).forEach((seat, i) => {
        put('circle', { cx: cx + xs[i], cy, r: 30, fill: seatColor(seat), stroke: '#fff', 'stroke-width': 6 }, undefined, replay.players[seat].name + ': worker');
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
    [1, 2, 3].forEach((k, i) => {
      const cx = 40 + i * 48;     // slots 18..62, 66..110, 114..158 stay inside the box (x 14..162)
      add('rect', { x: cx - 22, y: 26, width: 44, height: 70, rx: 8, fill: '#f9c9c9' });
      if (!locked.has(k)) return;
      const w = 38, h = w * 277 / 282;                     // BGA's worker meeple of the player's colour
      const img = add('image', { href: workerUrl(seat), x: cx - w / 2, y: 61 - h / 2, width: w, height: h });
      const tip = svg('title');
      tip.textContent = 'Worker ' + k + ' (locked)';
      img.append(tip);
    });

    const drawGroup = (list, top, height, rowY) => {
      add('rect', { x: 14, y: top, width: 148, height, rx: 14, fill: '#fff', stroke: '#222', 'stroke-width': 3 });
      list.forEach((sl, i) => {
        const y = rowY(i), bn = sl.bonus || {};
        if (sl.kind === 'instant_income') add('rect', { x: 78, y: y - 31, width: 62, height: 62, rx: 12, fill: '#9a4ba7', stroke: '#5e2a6b', 'stroke-width': 3 });
        else add('image', { href: iconUrl(ICON_IDS.pentagon), x: 74, y: y - 36, width: 72, height: 71 });
        const icon = SLOT_ICON[bn.type] || ICON_IDS['bonus:' + bn.type];
        const size = bn.type === 'money' ? (sl.kind === 'instant_income' ? 46 : 42) : (sl.kind === 'instant_income' ? 44 : 50);
        if (bn.type === 'money') moneyTile(s, 109, y + 1, size);
        else if (icon) {
          const [w0, h0] = iconSizes[icon] || [size, size];
          add('image', { href: iconUrl(icon), x: 109 - (w0 * size / h0) / 2, y: y - size / 2 + 1, width: w0 * size / h0, height: size });
        } else add('text', { x: 109, y: y + 8, class: 'slot-label' }, '?');
        if (SLOT_NUMBER.has(bn.type) && bn.value) add('text', { x: 109, y: y + 13, class: 'slot-number' }, bn.value);
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
    partner: { 1: 850, 2: 612, 3: 376, 4: 140 },          // y of the middle of the slot picture; x is always 175
    university: { 1: 1610, 2: 1375, 3: 1140 },
  };
  function associationStrip(p) {
    const s = svg('svg', { class: 'strip', viewBox: '0 0 351 1776', role: 'img', 'aria-label': 'Partner zoos and universities' });
    s.append(svg('image', { href: '/assets/association_player_board.webp', x: 0, y: 0, width: 351, height: 1776 }));
    for (const t of p.tokens) {
      const m = /^(partner|university)_(\d)$/.exec(t.location);
      if (!m) continue;
      const kind = m[1], y = STRIP[kind][m[2]];
      const id = ICON_IDS[kind === 'partner' ? t.type.replace('partner-', '') : t.type];
      if (!y || !id) continue;
      const [w0, h0] = iconSizes[id] || [190, 152];
      const w = kind === 'partner' ? 232 : 250, h = w * h0 / w0;
      const img = svg('image', { href: iconUrl(id), x: 175 - w / 2, y: y - h / 2, width: w, height: h });
      const tip = svg('title');
      tip.textContent = t.type;
      img.append(tip);
      s.append(img);
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
  function blockedCube(i) {
    const c = unusedColor();
    const e = mix(c, '#000000', .6);
    const g = svg('svg', { class: 'blockcube', viewBox: '-24 -24 48 48' });
    g.style.left = (SLOT_X[i] * 100) + '%';
    for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(c, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', c], ['19,-9 0,2 0,21 19,10', mix(c, '#000000', .3)]]) {
      g.append(svg('polygon', { points: pts, fill, stroke: e, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
    }
    const tip = svg('title');
    tip.textContent = 'Blocked in a 2 player game';
    g.append(tip);
    return g;
  }

  function projectPanel(st, keys, count, iconName, title, blocked) {
    const panel = el('div', 'projpanel');
    panel.title = title;
    const icon = el('img', 'icon projicon');
    icon.src = iconUrl(iconNames[iconName] || ''); icon.alt = title; icon.height = 44;
    panel.append(icon);
    for (let i = 0; i < count; i++) {
      const slot = el('div', 'projslot');
      if (keys[i]) {
        const wrap = el('div', 'withtokens');
        const holder = el('div', 'cardwrap');
        holder.append(card(keys[i]));
        if (blocked) holder.append(blockedCube(i));
        wrap.append(holder);
        const dots = el('div', 'dots');
        for (const t of projectTokens(st, keys[i])) {
          const d = el('span', 'dot', t.slot + 1);
          d.style.background = seatColor(t.seat);
          d.title = replay.players[t.seat].name + ': slot ' + (t.slot + 1);
          dots.append(d);
        }
        wrap.append(dots);
        slot.append(wrap);
      }
      panel.append(slot);
    }
    return panel;
  }

  function renderShared(st) {
    const root = $('shared');
    root.replaceChildren();
    // the display: each card lies in a folder, numbered 1-6 on the brown tab (the number is the cost in reputation range / position of the slot)
    const row = el('div', 'cards folders');
    st.display.forEach((k, i) => {
      const f = el('div', 'folder');
      if (k) f.append(card(k));
      f.append(el('span', 'folnum', i + 1));
      row.append(f);
    });
    const box = el('div', 'displaybox');
    box.append(row);
    // the reputation track under the folders: its 6 equal stretches (hat | 2-3 | 4-6 | 7-9 | 10-12 | 13-15) lie under folders 1-6, i.e. the cards a player can reach
    // at 0 | 1-2 | 3-5 | 6-8 | 9-11 | 12+ reputation (engine cards_action.reputation_range)
    const track = el('img', 'reptrack');
    track.src = '/assets/reputation_track.webp'; track.alt = 'Reputation track'; track.title = 'Reputation track: the cards under each stretch can be taken at that reputation';
    box.append(track);
    root.append(section('Display', box, 'sect displaycol'));
    const col = el('div', 'tablecol');
    // projects played during the game: the newest enters on the left and pushes the others right; a third one pushes the oldest off to the discard
    col.append(projectPanel(st, st.projects_in_play, 2, 'conservation-project', 'Conservation projects in play'));
    col.append(associationBoard(st));
    col.append(projectPanel(st, replay.base_projects, 3, 'conservation-project-base', 'Base conservation projects', true));
    root.append(col);
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
  function sidePanel(st) {
    const root = $('side');
    root.replaceChildren();
    const top = el('div', 'sidetop');
    const brk = el('div', 'breaktrack');
    brk.title = 'Break track';
    const bi = el('img', 'icon'); bi.src = iconUrl('r3c14'); bi.alt = 'Break'; bi.height = 40;
    brk.append(el('b', '', st.break_position + ' / 9'), bi);
    top.append(brk);
    const counts = el('div', 'deckcounts');
    counts.append(deckIcon(st.main_deck_size), discardIcon(st.main_discard_size));
    const eg = el('span', 'dc');
    eg.title = 'Endgame cards left';
    const ei = el('img', 'icon'); ei.src = iconUrl('r10c15'); ei.alt = 'Endgame cards'; ei.height = 32;
    eg.append(ei, el('b', '', st.endgame_deck_size));
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
      score.append(document.createTextNode((p.score !== undefined ? p.score : trackScore(p)) + ' ★'));
      head.append(name, score);
      box.append(head);

      const res = el('div', 'ppres');
      const xr = el('span', 'rs xr');               // X tokens: the number sits to the left of the token
      xr.title = 'X tokens';
      xr.append(el('b', '', p.x_tokens), pic('xtoken', 40));
      for (const [icon, n, label] of [['money', p.money, 'Money'], ['reputation', p.reputation, 'Reputation'], ['appeal', p.appeal, 'Appeal'], ['conservation', p.conservation, 'Conservation']]) {
        const r = el('span', 'rs inside' + (icon === 'money' ? ' money' : ''));    // the number is printed over the icon
        r.title = label;
        r.append(pic(icon, 42), el('b', '', n));
        if (icon === 'appeal') {                       // a small money icon on top of the appeal icon: the income this player gets at a break
          const inc = el('span', 'income money');       // the standard money tile: number inside the icon, white rounded border
          inc.title = 'Income at the next break (from the appeal track)';
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
      wr.append(el('b', '', p.tokens.filter((t) => t.type === 'worker' && t.location === 'reserve').length), wi);
      const hand = el('span', 'rs handcount');         // cards in hand / hand size (3, or 5 with the hand-size university)
      const limit = p.hand_limit !== undefined ? p.hand_limit : (p.tokens.some((t) => t.type === 'fac-rep-hand' && /^university_/.test(t.location)) ? 5 : 3);
      hand.title = 'Cards in hand / hand size';
      const hi = el('img', 'icon'); hi.src = iconUrl('r10c8'); hi.alt = 'Cards in hand'; hi.height = 40;
      const hb = el('b', p.hand.length > limit ? 'over' : '', p.hand.length + '/' + limit);   // red while the hand is over the limit, as on BGA
      hand.append(hi, hb);
      const eg = el('span', 'rs handcount');          // endgame scoring cards held: 2 at the start, 1 after the discard at 10 conservation, more with Resistance
      eg.title = 'Endgame scoring cards';
      const ei = el('img', 'icon'); ei.src = iconUrl('r10c15'); ei.alt = 'Endgame cards'; ei.height = 40;
      eg.append(ei, el('b', '', p.endgame_hand.length));
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
      for (const k of replay.marine_worlds ? [...SUMMARY.slice(0, 11), 'SeaAnimal', ...SUMMARY.slice(11)] : SUMMARY) {
        const n = (p.icons || {})[k] || 0;
        const c = el('span', 'ic' + (n ? '' : ' zero'));
        c.title = k;
        const img = el('img', 'badge');
        img.src = '/badges/' + k + '.webp'; img.alt = k; img.width = 30; img.height = 30;
        c.append(el('b', '', n), img);
        grid.append(c);
      }
      box.append(grid);
      root.append(box);
    });
  }

  function renderZoo(st, seat) {
    const p = st.players[seat], who = replay.players[seat], map = replay.maps[seat];
    const box = el('div', 'zoo seat' + seat + (st.active_player === seat && st.phase !== 'over' ? ' active' : ''));
    const h = el('h2', '', who.name);
    h.style.borderBottom = '3px solid ' + seatColor(seat);
    h.append(el('span', 'map', 'Map ' + map.id + (map.name ? ': ' + map.name : '')));
    box.append(h);

    const row = el('div', 'zooRow');
    row.append(bonusPanel(map, p, seat), zooBoard(map, p), associationStrip(p));
    box.append(row);

    box.append(section('Hand (' + p.hand.length + ')', cardRow(p.hand, '', 'empty')));
    box.append(section('Endgame cards', cardRow(p.endgame_hand, 'small', 'none')));
    box.append(section('Animals (' + p.animals.length + ')', cardRow(p.animals, 'small', 'none')));
    box.append(section('Sponsors (' + p.sponsors.length + ')', cardRow(p.sponsors, 'small', 'none')));
    if (p.released.length) box.append(section('Released (' + p.released.length + ')', cardRow(p.released, 'small')));
    return box;
  }

  function render() {
    const s = replay.steps[step], st = s.state;
    const cur = $('current');
    cur.replaceChildren();
    cur.textContent = s.label || '(state update)';
    renderShared(st);
    sidePanel(st);
    const zoos = $('zoos');
    zoos.replaceChildren(renderZoo(st, 0), renderZoo(st, 1));
    $('jump').value = step;
    for (const id of ['first', 'prev']) $(id).disabled = step === 0;
    for (const id of ['next', 'last']) $(id).disabled = step === replay.steps.length - 1;
    const list = $('moves');
    list.querySelector('.on')?.classList.remove('on');
    const li = list.children[step];
    li.classList.add('on');
    li.scrollIntoView({ block: 'nearest' });
    history.replaceState(null, '', '#' + step);
  }

  function go(n) {
    step = Math.max(0, Math.min(replay.steps.length - 1, n));
    if (step === replay.steps.length - 1) stop();
    render();
  }
  function stop() {
    clearInterval(timer); timer = null;
    $('play').innerHTML = '&#9654;'; $('play').setAttribute('aria-label', 'Play');
  }
  function togglePlay() {
    if (timer) { stop(); return; }
    if (step === replay.steps.length - 1) step = 0;
    $('play').innerHTML = '&#10074;&#10074;'; $('play').setAttribute('aria-label', 'Pause');
    timer = setInterval(() => go(step + 1), 900);
    go(step + 1);
  }

  function init() {
    $('tableInfo').textContent = 'Table #' + replay.table_id + (replay.marine_worlds ? ' · Marine Worlds' : '') + ' · ' + replay.players.map((p) => p.name).join(' vs ');
    $('total').textContent = replay.steps.length - 1;
    $('jump').max = replay.steps.length - 1;
    const list = $('moves');
    replay.steps.forEach((s, i) => {
      const li = el('li', 'seat' + s.state.active_player);
      li.style.borderLeftColor = seatColor(s.state.active_player);
      li.append(el('span', 'n', i), el('span', '', s.label || '…'));
      li.onclick = () => { stop(); go(i); };
      list.append(li);
    });
    $('first').onclick = () => { stop(); go(0); };
    $('prev').onclick = () => { stop(); go(step - 1); };
    $('next').onclick = () => { stop(); go(step + 1); };
    $('last').onclick = () => { stop(); go(replay.steps.length - 1); };
    $('play').onclick = togglePlay;
    $('jump').onchange = (e) => { stop(); go(parseInt(e.target.value, 10) || 0); };
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.altKey || e.ctrlKey || e.metaKey) return;
      const keys = { ArrowLeft: () => go(step - 1), ArrowRight: () => go(step + 1), Home: () => go(0), End: () => go(replay.steps.length - 1) };
      if (keys[e.key]) { e.preventDefault(); stop(); keys[e.key](); }
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    });
    const start = parseInt(location.hash.slice(1), 10);
    $('loading').hidden = true;
    $('app').hidden = false;
    go(Number.isFinite(start) ? start : 0);
  }

  if (!/^\d+$/.test(table || '')) { location.replace('/'); return; }
  fetchReplay().then((data) => {
    if (!data) return;
    replay = data;
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
    m.className = 'status error';
    m.textContent = 'Could not load this table: ' + err.message;
  });
})();
