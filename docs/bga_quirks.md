# BGA quirks

Places where BGA's implementation does not follow the rules. The engine keeps the rule right; the replay harness (`replay/differential.py`) shows what BGA did,
so the games replay cleanly. Each quirk is recorded in `DiffReport.quirks` when it is replayed, and has a test in `tests/test_bga_quirks.py`.

## Explorer (S262) pays too little when an icon is gained again

Playing an animal with several new continent / animal category icons gives the player a pending Explorer effect: 1 appeal and 2 money for each new icon.
If another effect of the same action puts one of those icons into the zoo again before the Explorer effect is resolved (859034675 turn 23: Coastal Manta
Ray, Sea Animal + Asia, both new; its reef ability gives 1 conservation -> the 5 conservation reward -> a Sea Animal university), BGA takes that gain off the
pending Explorer payment because it thinks the icon was already in the zoo. Not fixed by BGA (reported by the owner, 2026-11-17).

- Engine: `effects.fire_icon_counter` pays every new icon (the rule) and records it in `state.explorer_paid`.
- Replay: `differential._explorer_quirk` compares the payment with the Explorer gains of the log; when the log shows fewer and the missing icons were gained again
  in the action, the difference is taken off the compared state and off the steps of the replay from the moment the icon is gained again.

(The Sea Turtle Tank's Sea Animal icon, which never counts as new for Explorer, is a quirk of the same card, `effects.EXPLORER_BUG`.)
