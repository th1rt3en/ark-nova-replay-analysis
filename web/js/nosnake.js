// [module] No-snake mode (settings: "No-snake mode"): the 11 cards whose photo shows a snake are drawn with another picture. S.noSnake = 'show' (default) | 'hide' (a dashed "missing photo" frame) | 'worm' (the Slow Worm photo, which is no snake).
// The images are made by scripts/build_nosnake_images.py (web/cards/<key>_ns.webp / _sw.webp and the same in web/cards_large/); keep the list in step with SNAKE_CARDS there.
import { S } from './state.js';

export const NO_SNAKE_MODES = [['show', 'Show snake images'], ['hide', 'Suppress snake images'], ['worm', 'Show Slow Worm instead']];
const SNAKE = /\/(cards|cards_large)\/(A470|A474|A475|A482|A483|A485|A487|A492|P109|P125|S203)\.webp$/;
export function snakeSafe(url) {
  if (!url || S.noSnake === 'show' || !S.noSnake) return url;
  return url.replace(SNAKE, (m, dir, key) => `/${dir}/${key}${S.noSnake === 'worm' ? '_sw' : '_ns'}.webp`);
}
