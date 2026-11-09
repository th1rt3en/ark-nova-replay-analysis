// [module] The "?" of a setup form: a small round button on the line of an option's title; the help of the option shows on hover, on keyboard focus and on a tap or click (a click again, a click
// elsewhere or Escape closes it). `helpMark(text)` makes one; a button written in the page (`<button type="button" class="helpmark" data-tip="...">?</button>`) is set up when this module loads.
// A "?" inside a switch tile does not flip the switch. `setHelp(mark, text)` changes the text (an empty text hides the mark).
export function setHelp(mark, text) {
  mark.dataset.tip = text || '';
  mark.setAttribute('aria-label', text ? 'Help: ' + text : 'Help');
  mark.hidden = !text;
}

export function helpMark(text) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'helpmark'; b.textContent = '?';
  setHelp(b, text);
  return b;
}

const closeOthers = (keep) => { for (const m of document.querySelectorAll('.helpmark.open')) if (m !== keep) m.classList.remove('open'); };
document.addEventListener('click', (e) => {
  const mark = e.target instanceof Element ? e.target.closest('.helpmark') : null;
  closeOthers(mark);
  if (!mark) return;
  e.preventDefault();                                                   // (inside a label: the switch stays as it is)
  mark.classList.toggle('open');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOthers(null); });

for (const m of document.querySelectorAll('.helpmark[data-tip]')) setHelp(m, m.dataset.tip);          // (the buttons written in the page)
