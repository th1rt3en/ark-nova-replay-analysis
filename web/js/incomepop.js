// The income pop-up: a torn paper slip left of the gold income chip, one line per source of the money paid at the next break (state.players[i].income_lines).
import { el } from './util.js';
import { S } from './state.js';
import { cardName } from './cards.js';

const PAL = ['#D9503F', '#3B7DD8', '#F2B53A', '#8E63D2', '#2E9E5B', '#E86FA6', '#8B5A3C', '#1FA3A3'];          // by position in the list: neighbours never look alike
let pop = null;

function lines(p) {                                                    // [category, label, amount]: appeal track, zoo, sponsors, anything else; inside a group the biggest first (no group names are shown)
    const src = p.income_lines || [[0, 'Appeal track', p.income_total !== undefined ? p.income_total : p.income || 0, null]];
    return src.map(([c, label, n, key]) => [c, key ? cardName(key) : label, n]).sort((a, b) => a[0] - b[0] || b[2] - a[2] || (a[1] < b[1] ? -1 : 1));
}

export function hideIncome() { if (pop) { pop.remove(); pop = null; } }

export function showIncome(chip, p) { showSlip(chip, 'Income at the next break', lines(p)); }

// the conservation / appeal points of the endgame (`kind`): one line per sponsor, then (a thin rule between) one line per endgame card the viewer may see, or one grey "hidden" line per card he may not
export function showEndgame(chip, p, kind, withCards, hidden = 0) {
    const app = kind === 'appeal';
    const sp = ((app ? p.endgame_appeal_lines : p.endgame_sponsor_lines) || []).map(([k, n]) => [0, cardName(k), n]);
    const cd = withCards ? ((app ? p.endgame_card_appeal_lines : p.endgame_card_lines) || []).map(([k, n]) => [1, cardName(k), n]) : [];
    const hd = !withCards ? Array.from({ length: hidden }, () => [1, 'Endgame card (hidden)', '?']) : [];          // (cards the viewer may not see: the points are unknown)
    showSlip(chip, (app ? 'Appeal' : 'Conservation') + ' at final scoring', sp.concat(cd, hd));
}

function showSlip(chip, title, it) {                                   // it: [[group, label, amount]] in display order; a change of group draws the thin rule
    hideIncome();
    const unk = it.some((x) => x[2] === '?'), total = it.reduce((s, x) => s + (x[2] === '?' ? 0 : x[2]), 0);
    const slip = el('div', 'incslip');
    slip.append(el('div', 'ih', title));
    const bar = el('div', 'ibar');
    const list = el('ul');
    it.forEach(([g, label, n], k) => {
        if (k && g !== it[k - 1][0]) list.append(el('hr', 'irule'));
        if (n === '?') { const li = el('li', 'iunk'); li.append(el('s', 'itab'), el('span', 'il', label), el('i', 'ilead'), el('b', null, '?')); list.append(li); return; }          // hidden card: grey hatched tab, no share-bar segment
        const c = PAL[(k) % PAL.length];
        const seg = el('i'); seg.style.flex = String(Math.max(n, 0.0001)); seg.style.background = c; bar.append(seg);
        const li = el('li'); li.style.setProperty('--c', c);
        li.append(el('span', 'il', label), el('i', 'ilead'), el('b', null, String(n)));
        list.append(li);
    });
    const tot = el('div', 'itot'); tot.append(el('span', null, 'Total'), el('b', null, String(total) + (unk ? ' + ?' : '')));
    slip.append(bar, list, tot);
    pop = el('div', 'incpop'); pop.append(slip, el('i', 'iarrow'));
    document.body.append(pop);
    const sc = S.scaled && S.scale ? S.scale : 1;                      // (the page is zoomed: fixed positions are in zoomed pixels)
    const r = chip.getBoundingClientRect(), w = pop.getBoundingClientRect();
    const top = Math.max(8, Math.min(r.top + r.height / 2 - 34, window.innerHeight - w.height - 8));
    pop.style.left = Math.max(8, r.left - w.width - 14) / sc + 'px';
    pop.style.top = top / sc + 'px';
    pop.querySelector('.iarrow').style.top = Math.max(8, r.top + r.height / 2 - top - 11) / sc + 'px';
}
