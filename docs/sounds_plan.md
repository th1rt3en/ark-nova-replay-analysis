# Sounds: what BGA does and what we plan

Notes for the agent who builds the sounds of the site. State on 2026-11-10.

## Done

- **Animal sounds** (`web/js/animal-sounds.js`, setting "Animal sounds" in the Sound tab, off by default; its More button unfolds "Calls for" (all players / only me), "Animal volume" (on top of Volume) "Snake sounds" (on by default: off silences the snake animals) and "Ctrl + S" (the Shoebill's call, on by default); Animal volume defaults to 50 %, which is the level the calls always had): an animal entering a zoo plays its call, on a one-step move forward only (Next, arrow key, autoplay, a fork move, a new live move). Sounds and the card list come from the extension "Ark Nova Ambience" (github.com/Wilvarin/ark-nova-fun, used with the author's permission). Changelog section "Animal sounds".
- **Ctrl + S** plays the Shoebill.
- **Live turn alert** (`web/js/play.js`, `beep()`): two sine tones (660 and 880 Hz, 0.16 s apart) made with Web Audio, no file, switched by `localStorage.playAlerts`.

Still open for the animal sounds: the credit to the extension (the user will say how), and a sounds popup with their own settings (whose animals, volume, snake sounds).

## Done: the step sound

Recorded sounds chosen by the user from free libraries (`web/sounds/`: `step.mp3` swoosh, `play-card.mp3`, `draw-card.mp3`, `shuffle.mp3`; `web/js/step-sound.js`, setting "Animation sounds" (formerly "Step sound"), off by default, every mode). `stepKind` reads the states before and after a step: a play gets the play sound, a step without cards the swoosh, every card drawn (into a hand or onto the display) its own draw hit and cards discarded (discard, Sunbathing, pouching, Glide; `discard-card.mp3`, may get separate sounds later) ONE discard hit per step and player (the starting discard: one each), for the first card that leaves, struck by `card-motion.js` at the moment that card's flight starts (Web Audio, scheduled on the audio clock, so picture and sound stay together). The first deal of a game: the step is shown, 0.5 s pause, two separate shuffles play, 0.5 s pause, then the cards are dealt (10 per player: 8 + 2 endgame cards, each with its hit). With the setting on, an animal's call plays 0.25 s after the step's sound. With animations off (Animations = None or reduce motion) only the swoosh plays, on every step, and no animal calls.

## Background: BGA's step click

BGA plays one short sound ("move") for every move that writes to the log, in live games and in replays. That is the only sound a BGA replay of Ark Nova ever makes. 

BGA's "move" sound, measured (not copied): 0.63 s file, about 0.5 s audible, two hits: the first rises from 70 ms to a peak at 120 ms and fades by 200 ms, a second softer hit peaks at 330 ms, a tail fades out by 500 ms. Dominant frequencies 175-350 Hz with a noisy content (zero crossing rate ~760 Hz): it sounds like a wooden piece set down twice ("tock-tock").

## Deferred: the live game sounds

Ark Nova on BGA has no sounds of its own (`modules/js/Core/game.js` defines `playSound`, the game code never calls it). Every sound comes from BGA's platform (`bgaSoundService`, files `https://x.boardgamearena.net/data/themereleases/<version>/sound/<file>.ogg`, volume 0.7). The triggers, read in BGA's `ly_studio.js`:

| BGA event | File | Length | When | Our place for it |
|---|---|---|---|---|
| `move` | move | 0.63 s | every notification with a log line, unless the game turned it off for the next one (`bDisableNextMoveOnNextSound`) | the step click (above); live: each pushed move (`play.js` `pushLive`) |
| `yourturn` | main_Star | 1.5 s | the current player becomes active (stops `move` first); not in replays / instant mode | `play.js` `turnAlert` / `beep()` (exists, a code-made tone) |
| `time_alarm` | alt_Alarm | 0.75 s | real-time clock: 10 s left, and when it reaches 0 (also logs "Warning: Your clock ...") | `play.js` `clockBadge` (the clock counts down in the page) |
| `victory` / `lose` / `tie` | alt_Win / punch / main_Victory | 2.0 / 0.5 / 2.1 s | the end of a game just happened, not in archive mode | end of a live game (`view.end`, `endstats.js`, `end.html`) |
| `elochange` | main_Points | 1.2 s | the Elo animation at the end of a rated game | rated games: `end.html` rating changes |
| `chatmessage` | alt_Plop | 0.06 s | a chat message from someone else | `chat.js` (play page Chat tab, lobby chat) |
| `tableReady` | main_Star | 1.5 s | the table is ready to start | lobby: the game starts (`lobby.js`, push `lobby:L3`) |
| `joinTable` | door-knock-1 | 1.6 s | someone joins the table | lobby: a player takes a seat / accepts an invitation |
| `new_trophy`, `gain_arena`, `lose_arena` | main_Reward, punch | | trophies, arena | nothing like it on our site |

Plan when we get there:
- Do not use BGA's files. Simple sounds (click, plop, chime) can be made with Web Audio like `beep()`; fuller ones (fanfare, alarm, door knock) from a free library (Freesound CC0, Pixabay, Mixkit): Claude's shell cannot download from those sites, the user downloads the picks.
- Mock first (an artifact where each candidate can be played), the user picks by ear.
- One settings place for all sounds (the sounds popup planned for the animal sounds), each kind with its own switch, a common volume; off or on by default to be decided per kind.
- The browser refuses sound until the page got a click or a key: the turn alert of a player who never touched the page stays silent (already true of `beep()`).

## Music (10 November 2026)

Settings, Sound tab: **Music** (dropdown) and **Music volume** (slider, default 50 %) are in place (`S.music`, `S.musicVolume`, `MUSIC` in settings.js). There are no tracks yet: the dropdown offers Off only and nothing plays. To add a track: put the file under `web/sounds/`, add `[value, name]` to `MUSIC`, and write the player (loop, Volume x Music volume).
