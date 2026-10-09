// [module] Shared viewer state: URL params, the FORK / SANDBOX mode flags and the mutable state object `S` (all former top-level `let`s of the old replay.js).
export const params = new URLSearchParams(location.search);
export const table = params.get('table');

// Fork mode (fork.html): the same viewer on a position taken from a replay, played on for both seats. The server keeps nothing: every step carries its engine state,
// every move is posted with the state it applies to.
export const FORK = !!window.FORK_MODE;
export const PLAY = !!window.PLAY_MODE;                                         // play.html: a live game (fork mode: the bar is the way to play; the steps are the states the server pushes)
export const SANDBOX = !!window.SANDBOX_MODE;                                   // sandbox.html: a game that is set up and edited freely against a bot that passes (fork mode, with the tools of the sandbox)
// Mutable viewer state shared by the modules: `S.replay` (the loaded replay package), `S.step` (the index of the step on show), `S.pov` and the fork / sandbox
// bits. Everything here used to be a `let` inside the one big function of the old replay.js.
export const S = {
  forkInfo: null,
  animalEnc: null,   // {card, x, y}: the enclosure clicked for the animal that is selected (not yet confirmed)
  // live play (play.js): the game id, the seat token and seat, the last version pushed, the socket / poll, the status, the abandon proposal, the clocks and the map picked but not confirmed
  play: { id: null, token: null, seat: null, version: -1, socket: null, poll: null, status: 'playing', backoff: 1000, leaving: false, abandon: { proposal: null, cooldown: {}, skew: 0 },
          clock: null, clockSkew: 0, mapPick: null, endShown: false, menuOpen: false },
  forkBusy: false,
  // Placing a building in a fork: { seat, type, extra, x, y, rot } - the piece is chosen in the move panel, a click on a hex of the zoo sets its anchor, the two buttons round
  // the building turn it, green / red tells whether that placement is legal, the check mark places it. null while no building is being placed.
  placement: null,
  replay: null,
  step: 0,
  phase: 0,   // replay: the frame of the step on show (index into framesOf(step): text, gate, decision - see frames.js)
  // ---- point of view: null = everything is visible (god mode), 0 / 1 = what the player of that seat sees ------------------------------------------------------
  // Only the information of the other player is hidden: the cards of the hand and the endgame cards (shown as card backs), what was pouched or stored face down, the draw
  // pile and the endgame deck (counts only), the action card draft choices of the other player, and the words of the move list that name such cards.
  pov: null,
  // A card that was not in its zone (hand, endgame cards, animals, sponsors, display, projects...) at the previous render gets a green border that
  // fades like the changed numbers of the player tracker (--flash-duration). A card that left the zone stays where it was as a "ghost" with a red
  // border; card and border fade away in the same time and the ghost is removed. `zoneNew(zone, keys)` returns the test for each card of the zone,
  // with `.gone` = [{key, index}] of the cards that left (index = their place in the zone before).
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
  assocSpecies: null,   // fork: the Marketing effect the viewer opened (its index) / the generic university whose species is being chosen
  assocMode: null,   // fork: 'partner' | 'university' once the viewer clicked that task of the Association action
  dockHandStep: -1,   // fork: the last step whose changed hand the dock was pointed at
  forkSpend: 0,
  skipMode: false,   // fork: the X tokens the viewer spends on the chosen action card / puts a card back instead of acting
  // ---- the popup that lists the cards of the discard pile / the endgame deck (stays open while stepping, closes with the X, Escape or a click outside) ----
  openedPile: null,
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
  timer: null,
  speed: 1,
  showTimeline: false,         // the timeline row in the control panel (settings pop-up, settings.js)
  sbSeat: null,        // sandbox: the seat whose tools are shown
  sbUnlocked: false,   // sandbox: the action card list can be reordered by dragging
  sbOpen: true,        // sandbox: the tools box is open
  sbMapList: null,     // sandbox: the list of maps offered
};
