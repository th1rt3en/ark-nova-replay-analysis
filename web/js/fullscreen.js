// [module] The full screen button of the control panel (replay, fork, sandbox, play), the same as F11: the Fullscreen API on the page; the button follows the real state
// (also when the browser itself went full screen with F11, which sets no `fullscreenElement`: then the window is as big as the screen).
const ENTER = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/></svg>';
const EXIT = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3v4H3M13 3v4h4M17 13h-4v4M3 13h4v4"/></svg>';

export const inFull = () => !!document.fullscreenElement || (window.innerWidth === screen.width && window.innerHeight === screen.height);

export function initFullscreen(btn) {
  if (!btn) return;
  const sync = () => {
    const on = inFull();
    btn.innerHTML = on ? EXIT : ENTER;
    btn.title = on ? 'Leave full screen (F11)' : 'Full screen (F11)';
    btn.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  btn.onclick = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (inFull()) { /* the browser's own F11 full screen: a page cannot leave it, F11 does */ }
      else document.documentElement.requestFullscreen?.()?.catch?.(sync);
    } catch (e) { sync(); }
    btn.blur();
  };
  document.addEventListener('fullscreenchange', sync);
  window.addEventListener('resize', sync);
  sync();
}
