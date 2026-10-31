// [module] Shared viewer state: URL params, the FORK / SANDBOX mode flags and the mutable state object `S` (all former top-level `let`s of the old replay.js).
export const params = new URLSearchParams(location.search);
export const table = params.get('table');

// Fork mode (fork.html): the same viewer on a position taken from a replay, played on for both seats. The server keeps nothing: every step carries its engine state,
// every move is posted with the state it applies to.
export const FORK = !!window.FORK_MODE;
export const PLAY = !!window.PLAY_MODE;                                         // play.html: a live game (fork mode: the bar is the way to play; the steps are the states the server pushes)
export const MINIGAME = !!window.MINIGAME_MODE;                                 // minigames/<key>.html: one redacted position of a finished game, no stepping, no point of view switch (js/minigames/)
export const SHOW_ELO = false;                                                // the Elo pills (player box, zoo tab) are switched off for now: set to true to show them again
export const SANDBOX = !!window.SANDBOX_MODE;                                   // sandbox.html: a game that is set up and edited freely against a bot that passes (fork mode, with the tools of the sandbox)
// Mutable viewer state shared by the modules: `S.replay` (the loaded replay package), `S.step` (the index of the step on show), `S.pov` and the fork / sandbox
// bits. Everything here used to be a `let` inside the one big function of the old replay.js.
export const S = {
  forkInfo: null,
  minigame: null,    // a mini game page sets {decorate(row, 'seat:kind')}: dock.js calls it for every row of cards it draws (js/minigames/daily_hand.js)
  lastBoard: null,   // replay: {st, pov} the boards on show were drawn from (render() skips redrawing identical boards)
  animalEnc: null,   // {card, x, y}: the enclosure clicked for the animal that is selected (not yet confirmed)
  // live play (play.js): the game id, the seat token and seat, the last version pushed, the socket / poll, the status, the abandon proposal, the clocks and the map picked but not confirmed
  play: { id: null, token: null, seat: null, version: -1, socket: null, poll: null, status: 'playing', backoff: 1000, leaving: false, abandon: { proposal: null, cooldown: {}, skew: 0 },
          clock: null, clockSkew: 0, mapPick: null, endShown: false, menuOpen: false, study: null, studySkew: 0, studyAsked: false, started: true },
  forkBusy: false,
  // Placing a building in a fork: { seat, type, extra, x, y, rot } - the piece is chosen in the move panel, a click on a hex of the zoo sets its anchor, the two buttons round
  // the building turn it, green / red tells whether that placement is legal, the check mark places it. null while no building is being placed.
  placement: null,
  preview: null,              // the building preview (right click on a sponsor building card of a hand): see bpreview.js; always null in a replay step that is not the one it was started on
  previewBuilding: true,      // the setting "Building preview" (Cards tab, settings.js)
  replay: null,
  step: 0,
  phase: 0,   // replay: the frame of the step on show (index into framesOf(step): text, gate, decision - see frames.js)
  // ---- point of view: null = everything is visible (god mode), 0 / 1 = what the player of that seat sees ------------------------------------------------------
  // Only the information of the other player is hidden: the cards of the hand and the endgame cards (shown as card backs), what was pouched or stored face down, the draw
  // pile and the endgame deck (counts only), the action card draft choices of the other player, and the words of the move list that name such cards.
  pov: null,
  // A card that was not in its zone (hand, endgame cards, animals, sponsors, display, projects...) at the previous render is `isNew` (class `card-new`: a green border
  // that fades like the changed numbers of the player tracker, --flash-duration; switched off in parkposter.css for now, changelog 27). `zoneNew(zone, keys)` returns the test for each card of the zone;
  // its `.gone` (the cards that left, drawn as red fading "ghosts") is not filled at the moment.
  prevZones: {},
  curZones: {},
  prevZoneData: {},
  curZoneData: {},   // (the Data ones keep the objects of the zones that need them to draw a ghost)
  iconSizes: {},   // web/icons/icons.json: id -> [width, height]
  // the money icon is a square picture: clip it to a rounded square and outline it in white, like BGA (no square grey corners sticking out of the border)
  clipCount: 0,
  sprites: {},   // web/enclosures/sprites.json: id -> {image, anchor: [x, y] of the anchor hex in the image, size}
  forkClaimed: new Set(),
  forkMenu: null,
  forkError: '',
  forkDockStep: -1,   // fork: the legal actions the controls of the bar stand for / the choices of a button with several / the last error
  forkGate: false,
  forkConfirmed: -1,   // fork: the turn has just been passed on and the player has not confirmed it yet
  forkBonus: null,   // fork: the bonus slot of the player board the viewer picked to unlock
  thresholdMode: null,   // fork: the upgrade / worker choice the viewer opened ({index, stage: 'choose' | 'upgrade'})
  marketMode: null,
  multiplierMode: null,   // fork: the Multiplier effect (its index) whose action card the viewer is choosing
  assocSpecies: null,   // fork: the Marketing effect the viewer opened (its index) / the generic university whose species is being chosen
  assocMode: null,   // fork: 'partner' | 'university' once the viewer clicked that task of the Association action
  dockHandStep: -1,   // fork: the last step whose changed hand the dock was pointed at
  forkSpend: 0,
  skipMode: false,   // fork: the X tokens the viewer spends on the chosen action card / puts a card back instead of acting
  iconNames: {},   // web/icons/names.json: BGA icon name -> icon id
  // number changes in the tracker flash green (up) or red (down); the length is --flash-duration in replay.css
  lastNums: {},
  // The hands and the endgame cards of both players are not part of the zoos: they sit in a floating dock at the bottom left corner of the screen. A round button
  // for each (hand: r4c7, endgame cards: r4c11, ringed in the colour of the player) opens that player's cards above the dock; the same button closes them.
  dockSel: null,
  dockHidden: false,   // the panel is folded away (the selection stays)
  // Scaled desktop mode (see fitScale in layout.js): the page is laid out at DESIGN_W px and zoomed by `scale` to fill the window. scale = 1 / scaled = false on phones.
  scale: 1,
  scaled: false,
  // ---- autoplay: one step a second at 1x ------------------------------------------------------------------------
  sbTab: 'control',   // sidebar tab: 'control' | 'log'
  results: false,     // replay: the results of the finished game are on show instead of the boards (› on the last step, the switch in the move bar; results.js)
  postStats: null,    // replay: the statistics counted from the raw log once the last step is reached (results.js `loadStats`): {loading} | {error} | {players, first, ender, conceded}
  timer: null,
  speed: 1,
  handScale: 1,                                          // size of the cards in the hand, 0.5 ... 2 (settings pop-up, settings.js; --hs on body)
  s274: 'victory',                                       // 'victory' | 'mascot': the sponsor S274 under its BGA name Victory Column (default) or as the Mascot Statue, see cards.js `info` / settings.js
  noSnake: 'show',                                       // 'show' | 'hide' | 'worm': the cards with a snake photo, see nosnake.js / settings.js
  handMode: 'tray',                                      // how the hand is shown: 'fan' (at the screen edge) or 'tray' (floating container), see settings.js
  zooLayout: 'side',                                     // the zoo boards: 'side' (side by side), 'tabs' (one, with arrows) or 'stack' (one above the other); settings.js, replay only
  playedMode: 'below',                                  // where the played cards are shown: 'below' (under the map), 'tray' (a button in the hand dock), 'drawer' (a chip on the top edge + a sheet pulled out over the map, narrow or expanded: `drawerFull`); settings.js, zoo.js
  drawerFull: {},                                        // 'drawer': seat -> true while that board's drawer is expanded over its whole map (missing / false = narrow beside the map); every board has its own size (kept in the settings)
  drawerAnim: null,                                      // 'drawer': { seat, t, kind? } of the drawer that was just opened (it slides in once) or, with kind 'resize', of a size switch (only the drawer of that seat wipes to the new size)
  drawerSeats: {},                                       // 'drawer': seat -> true while that board's sheet is open
  zooTab: null,                                          // 'tabs': the seat on show (null = the first of seatOrder())
  endgameLive: true,           // the live count of the endgame points (violet +X under the appeal and conservation tiles, side-panel.js; settings pop-up, settings.js)
  showTimeline: false,         // the timeline row in the control panel (settings pop-up, settings.js)
  sbSeat: null,        // sandbox: the seat whose tools are shown
  sbUnlocked: false,   // sandbox: the action card list can be reordered by dragging
  sbOpen: true,        // sandbox: the tools box is open
  sbMapList: null,     // sandbox: the list of maps offered
};
