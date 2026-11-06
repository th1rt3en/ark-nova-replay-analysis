// Replay sponsor statistics: shared row descriptions keep resource totals and counters distinct.
const RESOURCES = ['appeal', 'money', 'reputation', 'conservation', 'xtoken'];
const COUNTERS = {
  cards_gained: 'Cards gained', effect_used: 'Effect used', tokens_spent: 'Tokens spent', attacks_prevented: 'Attacks prevented',
  water_covered: 'Water spaces built over', rock_covered: 'Rock spaces built over', water_ignored: 'Water requirements bypassed', rock_ignored: 'Rock requirements bypassed',
  clever: 'Clevers activated', pavilion: 'Pavilions built', pouch: 'Pouches', enlarge: 'Enclosures enlarged', snap_small: 'Small animals snapped', third_small: 'Extra small animals played',
  animals_marked: 'Animals marked', scuba3: 'Scuba Dives', kiosk: 'Kiosks gained', size1: 'Size-1 enclosures gained', birds: 'Perceptions', sunbathed: 'Cards sunbathed',
  hunts: 'Hunts triggered', seen: 'Cards seen', donations: 'Donations', ignores: 'Large animals played with an ignored condition',
};
const BONUS_NAMES = {
  Clever: 'Clever', Worker: 'Worker', 'extra-shift': 'Extra Shift', 'upgrade-card': 'Upgrade', 'take-in-range-or-deck': 'Card-taking',
  'bonus-sponsor': 'Marketing', 'sponsor-person-card': 'Person sponsor', Fac: 'University', 'Partner-Zoo': 'Partner zoo',
  SharkAttack: 'Shark Attack', 'shark-attack': 'Shark Attack', Digging: 'Digging', Scavenging: 'Scavenging', Mark: 'Mark', wave: 'Wave', kiosk: 'Kiosk',
};
export function sponsorStatRows(got, sponsor = null) {
  const rows = [];
  const resource = (key, icon, label = '') => { if (got[key] || (sponsor === 'S265' && key === 'money' && got.money === 0)) rows.push({ key, icon, value: '+' + got[key], label }); };
  for (const key of RESOURCES) resource(key, key);
  resource('appeal_initial', 'appeal', 'Immediate appeal');
  resource('appeal_final', 'appeal', 'Final-scoring appeal');
  resource('appeal_income', 'appeal', 'Income appeal');
  resource('appeal_enlargement', 'appeal', 'Occupied-enclosure appeal');
  if (got.saved) rows.push({ key: 'saved', icon: 'money', value: '+' + got.saved, label: 'saved' });
  for (const [key, label] of Object.entries(COUNTERS)) if (got[key]) rows.push({ key, value: got[key] + '×', label });
  for (const key of Object.keys(got).filter((k) => k.startsWith('placement:') || k.startsWith('doubled:')).sort()) {
    if (!got[key]) continue;
    const doubled = key.startsWith('doubled:');
    const [kind, strength] = key.slice(key.indexOf(':') + 1).split(':');
    if (RESOURCES.includes(kind)) resource(key, kind, doubled ? 'Doubled placement bonuses' : 'Extra placement bonuses');
    else rows.push({ key, value: got[key] + '×', label: (BONUS_NAMES[kind] || kind.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ')) + (strength ? ' ' + strength : '') + (doubled ? ' bonuses (doubled)' : ' bonuses') });
  }
  return rows;
}
