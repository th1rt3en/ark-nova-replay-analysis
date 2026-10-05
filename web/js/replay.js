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
  function cardRow(keys, cls, emptyText, zone, dimmed) {
    const row = el('div', 'cards' + (cls ? ' ' + cls : ''));
    if (!keys.length) row.append(el('span', 'empty', emptyText || 'none'));
    const z = zone ? zoneNew(zone, keys) : null;
    const items = keys.map((k) => (k ? card(k, (z && z.isNew(k) ? 'card-new' : '') + (dimmed && dimmed(k) ? ' dim' : '')) : el('div', 'card')));
    if (z) for (const g of z.gone) items.splice(Math.min(g.index, items.length), 0, ghost(g.key));
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
    'bonus:Worker': 'r5c13', 'bonus:Scavenging': 'r4c10', 'bonus:Mark': 'r3c3', 'bonus:Pouch': 'r7c11', 'bonus:kiosk': 'r7c3', 'bonus:upgrade-card': 'r10c5',
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
    place_building: 'Place a building', finish_build: 'Done building', take_cards: 'Take a card', play_animal: 'Play an animal', finish_animals: 'Done with animals',
    play_sponsor: 'Play a sponsor', sponsor_break: 'Advance the break', finish_sponsors: 'Done with sponsors', association_task: 'Association task', donate: 'Donate',
    finish_association: 'Done with association', discard_cards: 'Discard', choose_effect: 'Resolve an effect', skip_effect: 'Skip the effect', take_instead: 'Take a card instead',
    self_clever: 'Do nothing (Self-clever)', skip_extra: 'No second action', sponsor_side: 'Sponsors side action', animals_single: 'Play a single animal', choose_slot: 'Choose a slot',
    choose_bonus: 'Choose a bonus', upgrade_action_card: 'Upgrade an action card',
  };
  // The action card draft: each player is offered variants of the action cards (full card pictures) and selects the ones to keep; the replay shows what the
  // players were offered and what they chose (a green frame with a check mark). Both players choose at the same time, so both groups are shown.
  function draftCardUrl(v) { const m = /^([a-z]+)(\d)$/.exec(v); return m ? '/action_cards/' + m[1] + '_' + m[2] + '_1.webp' : ''; }
  function draftBar(bar, d) {
    const groups = [];
    for (const seat of [0, 1]) {
      const offers = d.offers[seat] || [];
      if (!offers.length) continue;
      const keeping = d.stage === 'keep' || d.stage === 'done';
      const chosen = keeping ? (d.kept[seat] || []) : (d.picked[seat] || []).slice(-1);
      const need = keeping ? 2 : 1;
      const group = el('div', 'draftgroup');
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
        const card = el('div', 'draftcard' + (chosen.includes(v) ? ' picked' : ' passed'));
        const img = el('img'); img.src = draftCardUrl(v); img.alt = v; img.loading = 'lazy';
        card.append(img);
        if (chosen.includes(v)) card.append(el('span', 'draftcheck', '✓'));
        if (d.auto && d.auto[seat] === v) card.title = 'Added at random: the three variants were of one action card';
        card.addEventListener('mouseenter', () => showPreview(draftCardUrl(v)));
        card.addEventListener('mouseleave', hidePreview);
        row.append(card);
      }
      group.append(head, row);
      groups.push(group);
    }
    if (!groups.length) return false;
    bar.hidden = false;
    bar.classList.add('draftbar');
    bar.append(...groups);
    return true;
  }
  function actionBar(st) {
    const bar = $('actionbar');
    bar.replaceChildren();
    bar.classList.remove('draftbar');
    const cur = replay.steps[step], o = cur.options;
    if (st.phase === 'setup' && st.draft && st.draft.stage !== 'done' && draftBar(bar, st.draft)) return;       // the action card draft at the start of the game
    // the step that puts the action card back on slot 1 ends the turn (the state already passes it on): the player has to confirm it. In the replay the buttons
    // are only shown, greyed out; in the game Confirm passes the turn, Undo takes back the last effect that can be taken back, Restart turn all of them
    const before = step > 0 ? replay.steps[step - 1].state : null;
    if (before && st.turn > before.turn && st.active_player !== before.active_player && (before.phase === 'turn' || before.phase === 'final_turns')) {
      bar.hidden = false;
      const who = el('span', 'who', replay.players[before.active_player].name);
      who.style.color = seatColor(before.active_player);
      bar.append(who, el('b', '', ' must confirm or restart your turn'));
      for (const [cls, label, tip] of [['confirm', 'Confirm', 'Confirm the turn and pass to the next player'],
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
    const who = el('span', 'who', replay.players[seat].name);
    who.style.color = seatColor(seat);
    bar.append(who, el('b', '', o && o.only ? ' must choose the second action' : ' must choose an action card'));
    p.action_cards.forEach((a, i) => {
      const b = el('span', 'abtn' + (a.level === 2 ? ' lvl2' : '') + (o && !o.cards[a.type] ? ' off' : ''));       // (greyed out: the engine does not offer it)
      b.title = ACTION_NAMES[a.type] + (a.level === 2 ? ' II' : '') + ', strength ' + (i + 1 + spent) + ' (up to ' + (i + 1 + spent + p.x_tokens) + ' with X tokens)';
      b.append(pic(ACTION_ICON[a.type], 26), el('b', '', i + 1 + spent));
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
    bar.append(xs('−', 'Spend one X token less', spent === 0), x, xs('+', 'Spend one more X token to raise the strength', o ? maxSpend - spent <= 0 : p.x_tokens === 0));
    // or put one of the action cards back to slot 1 and gain an X token (not possible at the maximum of 5)
    const canGain = o ? o.skip.length > 0 : p.x_tokens < 5;
    const gain = el('span', 'abtn gainx' + (canGain ? '' : ' off'));
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
    bar.append(el('b', '', ' must perform an association task'));
    for (const [task, n] of Object.entries(o.association.tasks)) {
      const b = el('span', 'abtn deckbtn');
      b.title = task + ': ' + n + (n === 1 ? ' possibility' : ' possibilities');
      if (task === 'reputation') b.append(el('b', '', 'Take 2'), pic('reputation', 26));
      else b.append(el('b', '', TASK_TEXT[task] || task));
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
    const b = el('span', 'abtn deckbtn');
    const src = e.source && /^[ASPF]\d{3}$/.test(e.source) ? cardName(e.source) : '';
    b.title = (e.name || EFFECT_TEXT[e.kind] || e.kind) + (src ? ' (' + src + ')' : '') + (e.optional ? ' - optional' : '');
    if (e.kind === 'gain') {
      b.append(el('b', '', 'Gain ' + (e.n || 1)), pic(e.res, 26));
    } else {
      b.append(el('b', '', e.name || EFFECT_TEXT[e.kind] || e.kind.replace(/_/g, ' ')));
    }
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
    if (o.pieces && o.pieces.length) bar.append(piecesRow(o));
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
    } else if (name === 'reputation' || name === 'appeal') {
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
    const first = replay.steps[0].state.conservation_options || {};     // the options of the game as dealt: a taken one leaves its place empty
    for (const th of ['5', '8']) {
      const left = (st.conservation_options || {})[th] || [];
      (first[th] || []).forEach((opt, i) => {
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
      if (k) f.append(card(k, (displayNew.isNew(k) ? 'card-new' : '') + (dim ? ' dim' : '')));
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
    box.append(repWrap);
    root.append(section('Display', box, 'sect displaycol'));
    const col = el('div', 'tablecol');
    // projects played during the game: the newest enters on the left and pushes the others right; a third one pushes the oldest off to the discard
    col.append(projectPanel(st, st.projects_in_play, 2, 'conservation-project', 'Conservation projects in play'));
    col.append(associationBoard(st));
    col.append(projectPanel(st, replay.base_projects, 3, 'conservation-project-base', 'Base conservation projects', true));
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
    const st = replay.steps[step].state;
    const keys = openedPile === 'discard' ? st.main_discard.slice().reverse() : openedPile === 'deck' ? st.main_deck.slice() : st.endgame_deck.slice().sort();      // the newest discard first; the draw pile top first; the endgame deck is shown unordered
    const win = el('div', 'pilewin');
    const head = el('div', 'pilehead');
    head.append(el('h2', '', (openedPile === 'discard' ? 'Discard pile' : openedPile === 'deck' ? 'Draw pile, top first' : 'Endgame cards left (unordered)') + ' - ' + keys.length + ' card' + (keys.length === 1 ? '' : 's')));
    const x = el('button', 'pileclose', '✕');
    x.type = 'button'; x.title = 'Close (Escape)'; x.setAttribute('aria-label', 'Close');
    x.onclick = closePile;
    head.append(x);
    const grid = el('div', 'cards pilegrid');
    if (!keys.length) grid.append(el('span', 'empty', 'no cards'));
    const known = openedPile === 'deck' ? st.main_deck_known || 0 : 0;
    keys.forEach((k, i) => {
      if (openedPile === 'deck' && i === 0 && known > 0) grid.append(el('div', 'pilenote', 'The order of these ' + known + ' cards is real: the log shows them being drawn later'));
      if (openedPile === 'deck' && i === known) grid.append(el('div', 'pilenote guess', 'The log never shows the order of the other ' + (keys.length - known) + ' cards: this order is a random guess'));
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
      for (const k of replay.marine_worlds ? [...SUMMARY.slice(0, 11), 'SeaAnimal', ...SUMMARY.slice(11)] : SUMMARY) {
        const n = (p.icons || {})[k] || 0;
        const c = el('span', 'ic' + (n ? '' : ' zero'));
        c.title = k;
        const img = el('img', 'badge');
        img.src = '/badges/' + k + '.webp'; img.alt = k; img.width = 30; img.height = 30;
        c.append(el('b', '', n), img);
        flash(seat + ':icon:' + k, n, c);
        grid.append(c);
      }
      box.append(grid);
      root.append(box);
    });
    lastNums = nums;
  }

  // while a sponsor is to be played, everything in the hand of that player that is not a playable sponsor is greyed out
  function handDim(seat) {
    const o = replay.steps[step].options;
    return o && o.sponsors && o.seat === seat ? (k) => !o.sponsors.hand.includes(k) : null;
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

    box.append(section('Hand (' + p.hand.length + ')', cardRow(p.hand, '', 'empty', seat + ':hand', handDim(seat))));
    box.append(section('Endgame cards', cardRow(p.endgame_hand, 'small', 'none', seat + ':endgame')));
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
    const s = replay.steps[step], st = s.state;
    const cur = $('current');
    cur.replaceChildren();
    cur.append(labelNode(s.label || '(state update)'));
    const eg = engineBadge(s.engine);
    cur.append(' ', eg);
    if (s.engine && s.engine.detail && s.engine.source === 'log') cur.append(el('div', 'engine-detail', 'Engine: ' + s.engine.detail));
    renderShared(st);
    sidePanel(st);
    const zoos = $('zoos');
    zoos.replaceChildren(renderZoo(st, 0), renderZoo(st, 1));
    prevZones = curZones; curZones = {}; prevZoneData = curZoneData; curZoneData = {};
    $('jump').value = step;
    for (const id of ['first', 'prev']) $(id).disabled = step === 0;
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

  function go(n) {
    step = Math.max(0, Math.min(replay.steps.length - 1, n));
    render();
  }
  function init() {
    $('tableInfo').textContent = 'Table #' + replay.table_id + (replay.marine_worlds ? ' · Marine Worlds' : '') + ' · ' + replay.players.map((p) => p.name).join(' vs ');
    $('total').textContent = replay.steps.length - 1;
    const es = replay.engine;
    if (es) $('tableInfo').append(' · engine: ' + es.ok + '/' + es.turns + ' turns replayed' + (es.mismatch + es.illegal ? ', ' + (es.mismatch + es.illegal) + ' differ from the log' : '') + (es.skipped ? ', ' + es.skipped + ' not supported yet' : ''));
    $('jump').max = replay.steps.length - 1;
    const list = $('moves');
    replay.steps.forEach((s, i) => {
      // the step that finishes an action passes the turn in its state, but it still belongs to the player who acted
      const prev = i > 0 ? replay.steps[i - 1].state : null;
      const named = replay.players.findIndex((pl) => (s.label || '').startsWith(pl.name + ' '));        // (a label that starts with a player's name is that player's)
      const actor = s.actor !== null && s.actor !== undefined ? s.actor : named >= 0 ? named            // the player the log names for this line (a Boost / Clever effect after the turn passed is still the acting player's)
        : prev && s.state.turn > prev.turn && s.state.active_player !== prev.active_player ? prev.active_player : s.state.active_player;
      const li = el('li', 'seat' + actor);
      li.style.borderLeftColor = seatColor(actor);
      li.append(el('span', 'n', i), labelNode(s.label || '…'), engineBadge(s.engine));
      li.onclick = () => { go(i); };
      list.append(li);
    });
    buildTimeline();
    setupDrawer();
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
