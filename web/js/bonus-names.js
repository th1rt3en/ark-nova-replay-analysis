// [module] The words for a placement bonus (a building that covers several bonuses at once makes each one a button of the move bar: "Gain 5 money", "Take a card"...).
// One table, so the wording of every bonus is changed in one place. `type` is the bonus type of the map data / engine (`pbonus` effects carry it as `bonus.type`).
const n = (v) => Number(v) || 1;
export const PLACEMENT_BONUS_NAME = {
  money: (v) => `Gain ${n(v)} money`,
  xtoken: (v) => `Gain ${n(v)} X-token${n(v) > 1 ? 's' : ''}`,
  reputation: (v) => `Gain ${n(v)} reputation`,
  appeal: (v) => `Gain ${n(v)} appeal`,
  'take-in-range-or-deck': () => 'Take a card',
  Clever: (v) => (n(v) > 1 ? `Clever x${n(v)}` : 'Clever'),
  'bonus-sponsor': () => 'Marketing',
  Worker: () => 'Hire a worker',
  'extra-shift': () => 'Extra Shift',       // (the hex of map 11 and custom maps: a worker comes back from the association board)
  'upgrade-card': () => 'Upgrade an action card',
  'Partner-Zoo': () => 'Partner zoo',
  Fac: () => 'University',
  Multiplier: (v) => `Multiplier token${n(v) > 1 ? ' x' + n(v) : ''}`,
  Digging: () => 'Digging or rescue',
  'digging-plain': (v) => `Digging ${n(v)}`,
  Mark: () => 'Mark',
  Scavenging: (v) => `Scavenging ${n(v)}`,
  kiosk: () => 'Free kiosk',
  store: () => 'Store',
  wave: () => 'Wave',
  'shark-attack': () => 'Shark attack',
  adapt: () => 'Adapt',
  conceal: () => 'Conceal',
};
export const placementBonusName = (b) => (b && PLACEMENT_BONUS_NAME[b.type] ? PLACEMENT_BONUS_NAME[b.type](b.value) : String((b && b.type) || 'placement bonus').replace(/[-_]/g, ' '));
