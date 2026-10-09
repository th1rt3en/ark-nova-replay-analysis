# cardgen: how the card images are made

`python scripts/build_cards.py` draws **every** card (animals, sponsors, conservation projects, endgame cards, Marine Worlds variants) with one process and writes
`web/cards/<key>.webp` (360 x 503, lists, hands, display) and `web/cards_large/<key>.webp` (745 x 1040, hover preview). The browser only ever shows these images
(`card_catalog` in `src/ark_nova/replay/view.py` hands out the URLs); nothing is composed in the browser.

## How
1. The cards are **HTML/CSS**, not images: the React card components and the stylesheet (`src/arknova.css`, BGA's own card CSS) of the fan site
   [Next-Ark-Nova-Cards](https://github.com/Ender-Wiggin2019/Next-Ark-Nova-Cards) (used with the author's permission), copied unchanged into `src/`
   (only the files the cards import). `shim/` replaces `next/image` and `next-i18next`; texts and effects come from `site/locales/en/common.json`.
2. `build.mjs` bundles `harness/entry.tsx` with esbuild; `render.mjs` turns the card list into `site/cards.html` (every card at 2x design size, 750 x 1044).
3. `shoot.mjs` opens it in headless Chromium (Playwright) and screenshots each card. Ability texts that do not fit are shrunk (zoom 0.6 to 1) until they end above
   the bottom of the card (sponsors: above the income/endgame bars, 85 % of the height).
3b. The same page is screenshotted a second time with `body.compact` (`site/compact.css` and BGA's own `data-card-desc="0"` mode from `arknova.css`: bigger names, taller title bar, no Latin name): animals show only the names of their abilities, sponsors and projects no text (like the small cards on BGA). These are the small images, the first screenshots the large ones.
4. `build_cards.py` scales the screenshots with Pillow and writes the webp files. `S250_MW` (Marine Worlds Sea Turtle Tank) is then painted from `S250` by
   `scripts/build_mw_card_images.py` (the top of a sponsor is a photo of the printed card, so its icons cannot be changed in HTML).

## Our own additions (not in the fan site)
- Card **data** comes from the fan site's `src/data` (copied), with two fixes from `data_manual/variants_mw.json`/`src/ark_nova/data/projects.json`: the patched slots of P129
  and P131 are used, and `P131_MW` uses the Marine Worlds slot indicators (3/2/1). `S250_MW` see above.
- `harness/mw.tsx` + `site/mw.css`: the Marine Worlds projects **P133-P139** (not in the fan site). P133 uses the fan site's base project template; the six Management
  Plans (P134-P139) have their own layout (two requirement icons, three slots with 2 conservation + keyword / reputation per 2 science / tutor reward, the place bonus tab).
  Their photos (`site/art/P133..P139.jpg`) are cut out of our old 240 px card images (the badge was removed with OpenCV inpainting), so they are softer than the others.
  Drop a better photo with the same name into `site/art/` (374 x 264 px or larger) and rebuild.

## Needs
node + npm, Python with Pillow, a Chromium for Playwright (`cd scripts/cardgen && npx playwright install chromium`, or set `CHROMIUM_PATH`). The first run does `npm install`.
`python scripts/build_cards.py --only A401,S201` rebuilds single cards (a full build of 300 cards takes about 4 minutes).

## Updating the card set
New cards: add them to the fan site's data files in `src/data/` (or take the new version of the fan repo: replace `src/components`, `src/data`, `src/types`, `src/lib`,
`src/arknova.css`, `site/img`, `site/locales`) and our `src/ark_nova/data/*.json`, then run the build.

3c. A third screenshot set (`body.bare`, `site/bare.css`): only the icon(s) and the three slots of every project (P###) on a transparent background, with their boxes in `out/bare/geometry.json`. `build_cards.py` composes them into `web/project_strips/<key>.webp` (the project areas of the page draw the green base in CSS).
