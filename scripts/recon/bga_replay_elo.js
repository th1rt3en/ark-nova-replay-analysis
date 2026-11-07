// Recon for the browser extension (extension/button.js, readElos / readMaps): where does BGA's replay page show each player's Elo, and does the page tell the maps?
//
// How to use: open a BGA replay page of a finished Ark Nova game (https://boardgamearena.com/archive/replay/<version>/?table=<id>&player=<id>&comments=), wait until the
// game is on screen, open the browser's developer tools (F12), pick the Console, paste this whole file, press Enter. It prints one JSON report and copies it to the clipboard
// (paste it into a file or a chat). Run it on a rated game and on a friendly one (a friendly game shows no Elo: the report then lists no candidates).
// It only reads the page: nothing is changed or sent anywhere. Frames of the same origin (the game lives in one) are searched as well.
(() => {
  const MAX_HTML = 1800;
  const docs = [];
  const walk = (doc, path, depth) => {
    docs.push({ doc, path });
    if (depth > 3) return;
    doc.querySelectorAll('iframe').forEach((f, i) => {
      try { if (f.contentDocument) walk(f.contentDocument, path + ' > iframe[' + i + ']', depth + 1); else docs.push({ doc: null, path: path + ' > iframe[' + i + '] (no document)' }); }
      catch (e) { docs.push({ doc: null, path: path + ' > iframe[' + i + '] (another origin)' }); }
    });
  };
  walk(document, 'top', 0);

  const text = (el, n = 80) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const describe = (el) => ({ tag: el.tagName.toLowerCase(), id: el.id || null, class: (typeof el.className === 'string' ? el.className : '') || null, text: text(el), title: el.getAttribute('title') || null });

  // the players of the table: from the panels / names on the page, and from BGA's game data when the page exposes it
  const ids = new Set();
  const idPatterns = [/^(?:overall_)?player_board_(\d{5,})$/, /^player_name_(\d{5,})$/, /^player_elo_(\d{5,})$/, /^avatar_active_wrap_(\d{5,})$/, /^avatar_(\d{5,})$/];
  for (const { doc } of docs) {
    if (!doc) continue;
    for (const el of doc.querySelectorAll('[id]')) for (const re of idPatterns) { const m = re.exec(el.id); if (m) ids.add(m[1]); }
  }
  const gd = (() => { for (const w of [window, ...docs.map((d) => d.doc && d.doc.defaultView).filter(Boolean)]) { try { if (w.gameui && w.gameui.gamedatas) return w.gameui.gamedatas; } catch (e) { /* skip */ } } return null; })();
  if (gd && gd.players) Object.keys(gd.players).forEach((id) => ids.add(String(id)));

  const eloish = /elo|rank|rating|gamerank/i;
  const players = {};
  for (const id of ids) {
    const found = [];
    for (const { doc, path } of docs) {
      if (!doc) continue;
      const panel = doc.getElementById('overall_player_board_' + id) || doc.getElementById('player_board_' + id);
      const direct = doc.getElementById('player_elo_' + id);
      if (!panel && !direct) continue;
      const root = panel || direct.parentElement;
      // every element of the panel whose id or class talks about a rating, and every short number in the panel (an Elo is 3-4 digits)
      const candidates = [...root.querySelectorAll('[id],[class]')].filter((el) => eloish.test(el.id + ' ' + (typeof el.className === 'string' ? el.className : ''))).map(describe);
      const numbers = [];
      const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const m = /\b\d{3,4}\b/.exec(n.nodeValue || '');
        if (m && n.parentElement) numbers.push({ value: m[0], in: describe(n.parentElement) });
      }
      found.push({
        frame: path,
        panel: panel ? { id: panel.id, class: panel.className } : null,
        playerEloById: direct ? describe(direct) : null,                                   // what button.js reads first: #player_elo_<id>
        gamerankValue: [...root.querySelectorAll('.gamerank_value')].map(describe),         // and its fallback: .gamerank_value in the panel
        candidates,
        numbers,
        panelHtml: panel ? panel.outerHTML.slice(0, MAX_HTML) : null,
      });
    }
    const data = gd && gd.players && gd.players[id] ? gd.players[id] : null;
    players[id] = {
      name: (() => { for (const { doc } of docs) { const el = doc && doc.getElementById('player_name_' + id); if (el) return text(el, 40); } return null; })(),
      panels: found,
      gamedatas: data ? Object.fromEntries(Object.entries(data).filter(([k]) => eloish.test(k)).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : v])) : null,
      extensionWouldRead: (() => {                                                           // the same lookup as readElos in extension/button.js
        for (const { doc } of docs) {
          if (!doc) continue;
          const el = doc.getElementById('player_elo_' + id) || doc.querySelector('#overall_player_board_' + id + ' .gamerank_value, #player_board_' + id + ' .gamerank_value');
          const m = el && /\d{3,4}/.exec((el.textContent || '').replace(/[\s,.]/g, ''));
          if (m) return parseInt(m[0], 10);
        }
        return null;
      })(),
    };
  }

  // maps: readMaps in extension/button.js looks for .zoo-map-board-background[data-map] and the id of the player in the elements around it
  const boards = [];
  for (const { doc, path } of docs) {
    if (!doc) continue;
    for (const el of doc.querySelectorAll('.zoo-map-board-background')) {
      const chain = [];
      for (let n = el, depth = 0; n && n.nodeType === 1 && depth < 8; n = n.parentElement, depth += 1) {
        chain.push({ tag: n.tagName.toLowerCase(), id: n.id || null, class: (typeof n.className === 'string' ? n.className : '').slice(0, 60) || null,
                     data: Object.fromEntries([...n.attributes].filter((a) => /^data-/.test(a.name)).map((a) => [a.name, a.value.slice(0, 40)])) });
      }
      boards.push({ frame: path, dataMap: el.getAttribute('data-map'), chain });
    }
  }

  const report = {
    url: location.href,
    when: new Date().toISOString(),
    frames: docs.map((d) => d.path),
    gamedatasFound: !!gd,
    playerIds: [...ids],
    anyEloShown: Object.values(players).some((p) => p.extensionWouldRead !== null || p.panels.some((x) => x.candidates.length || x.numbers.length)),
    players,
    zooBoards: boards,
  };
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  try { copy(json); console.log('[ark-nova recon] the report was copied to the clipboard'); } catch (e) { console.log('[ark-nova recon] copy the JSON above by hand'); }
  return report;
})();
