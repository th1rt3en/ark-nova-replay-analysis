# Differential problems: move-by-move breakdown

Generated from the differential run (chain=False) on `log_examples/`. For each problem: the error, the log events of the turn (order, player, event, text) and the engine actions the harness derived from them. Problems after the first one of a game may be consequences of it.

## Summary

| # | table | turn | kind | first in game | problem |
|---|---|---|---|---|---|
| 1 | 653431606 | 73 | state mismatch | yes | project slots before move 368: engine {'P107': [2], 'P133': [0], 'P119': [0]} bga {'P133': [0], 'P119': [0]} |
| 2 | 800178782 | 46 | illegal move | yes | take_cards {'mode': 'snap', 'card': 'A452'} not in legal_actions |
| 3 | 800308899 | 14 | state mismatch | yes | player 0, reputation: engine 2, replay 3 |
| 4 | 800385493 | 72 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'take', 'source': 'bonus', 'optional': False, 'player': 0}] |
| 5 | 800438098 | 51 | state mismatch | yes | player 1, reputation: engine 9, replay 10 |
| 6 | 800438098 | 69 | state mismatch | no | player 1, reputation: engine 9, replay 10 |
| 7 | 801244007 | 24 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'gain', 'source': 'A538', 'res': 'xtoken', 'n': 1, 'optional': False}] |
| 8 | 802528333 | 31 | illegal move | yes | take_cards {'mode': 'deck', 'count': 1} not in legal_actions |
| 9 | 802528333 | 59 | illegal move | no | take_cards {'mode': 'range', 'card': 'S219'} not in legal_actions |
| 10 | 802787987 | 39 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'take', 'source': 'reputation track', 'optional': False, 'player': 1}] |
| 11 | 803004707 | 67 | state mismatch | yes | player 1, reputation: engine 9, replay 10 |
| 12 | 803004707 | 79 | state mismatch | no | player 1, reputation: engine 9, replay 10 |
| 13 | 803523726 | 5 | state mismatch | yes | player 1, reputation: engine 1, replay 2 |
| 14 | 804988782 | 66 | state mismatch | yes | player 1, hand: only in the replay: S266 |
| 15 | 805030443 | 74 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'take_tile', 'tile': 'university', 'player': 0, 'optional': False}] |
| 16 | 805601662 | 70 | illegal move | yes | association_task {'task': 'conservation', 'project': 'P133', 'source': 'play'} not in legal_actions |
| 17 | 806276023 | 51 | state mismatch | yes | player 0, money: engine 43, replay 44 |
| 18 | 807723077 | 30 | illegal move | yes | play_animal {'card': 'A469', 'from_display': False, 'x': 7, 'y': 10} not in legal_actions |
| 19 | 809651876 | 21 | illegal move | yes | choose_effect {'keep': 'S209'} not in legal_actions |
| 20 | 811076698 | 61 | illegal move | yes | choose_effect {'cards': ['A409', 'A510', 'A560']} not in legal_actions |
| 21 | 814075010 | 58 | state mismatch | yes | player 0, action cards: same cards, other order  [engine: animals, sponsors II v4, association, build II v1, cards II \| replay: cards II, s |
| 22 | 814842703 | 72 | state mismatch | yes | player 1, hand: only in the engine: P108 |
| 23 | 814950957 | 71 | illegal move | yes | association_task {'task': 'conservation', 'project': 'P111', 'source': 'play'} not in legal_actions |
| 24 | 814950957 | 3 | state mismatch | no | player 1, reputation: engine 1, replay 2 |
| 25 | 814950957 | 45 | state mismatch | no | player 1, conservation: engine 5, replay 6; player 1, x tokens: engine 1, replay 2; player 1, reputation: engine 10, replay 12 |
| 26 | 815572376 | 17 | illegal move | yes | take_cards {'mode': 'range', 'card': 'S205'} not in legal_actions |
| 27 | 816450097 | 52 | illegal move | yes | play_animal {'card': 'A440', 'from_display': False, 'x': 6, 'y': 7} not in legal_actions |
| 28 | 816836354 | 37 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'gain', 'source': 'A538', 'res': 'xtoken', 'n': 1, 'optional': False}] |
| 29 | 816836354 | 59 | illegal move | no | play_animal {'card': 'A534', 'from_display': False, 'x': 3, 'y': 0} not in legal_actions |
| 30 | 817212885 | 68 | illegal move | yes | take_cards {'mode': 'snap', 'card': 'A453'} not in legal_actions |
| 31 | 818199843 | 25 | illegal move | yes | choose_effect {'cards': []} not in legal_actions |
| 32 | 818947505 | 42 | illegal move | yes | play_sponsor {'card': 'S280', 'from_display': False} not in legal_actions |
| 33 | 819091744 | 47 | illegal move | yes | choose_effect {'bonus_type': 'reputation', 'n': 1} not in legal_actions |
| 34 | 819130034 | 75 | illegal move | yes | association_task {'task': 'conservation', 'project': 'P110', 'source': 'play'} not in legal_actions |
| 35 | 819789164 | 60 | illegal move | yes | choose_effect {'card': 'S280'} not in legal_actions |
| 36 | 819962687 | 64 | illegal move | yes | mark an animal of the display that has no mark |
| 37 | 820206282 | 61 | state mismatch | yes | player 1, hand: only in the engine: P108 |
| 38 | 820534913 | 56 | illegal move | yes | choose_effect {'release': 'A554', 'building': [6, 5]} not in legal_actions |
| 39 | 821574238 | 18 | illegal move | yes | choose_effect {'building': [7, 4], 'x': 7, 'y': 4, 'rotation': 1} not in legal_actions |
| 40 | 821574238 | 77 | illegal move | no | choose_effect {'building': [2, 9], 'x': 2, 'y': 11, 'rotation': 0} not in legal_actions |
| 41 | 821934642 | 29 | illegal move | yes | take_cards {'mode': 'snap', 'card': 'A518'} not in legal_actions |
| 42 | 822218187 | 55 | illegal move | yes | choose_effect {'apply': 'gain', 'res': 'reputation'} not in legal_actions |
| 43 | 823017370 | 40 | state mismatch | yes | placements after move 137: size-3: engine-only [(0, 1, 0), (0, 3, 4), (0, 7, 5)] bga-only []; placements after move 138: size-1: engine-only |
| 44 | 826568675 | 67 | state mismatch | yes | player 0, appeal: engine 113, replay 114 |
| 45 | 828008788 | 59 | illegal move | yes | take_cards {'mode': 'deck', 'count': 1} not in legal_actions |
| 46 | 830949460 | 54 | illegal move | yes | take_cards {'mode': 'range', 'card': 'A478'} not in legal_actions |
| 47 | 831125835 | 63 | illegal move | yes | play_animal {'card': 'A411', 'from_display': False, 'x': 5, 'y': 4} not in legal_actions |
| 48 | 832292660 | 49 | state mismatch | yes | player 1, money: engine 46, replay 43 |
| 49 | 832292660 | 55 | state mismatch | no | player 1, hand: only in the replay: S266; main deck: only in the engine: A542, A417; main discard: only in the replay: A402 |
| 50 | 832548511 | 58 | illegal move | yes | choose_effect {'bonus_type': 'reputation', 'n': 1} not in legal_actions |
| 51 | 834011827 | 71 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'take', 'source': 'bonus', 'optional': False, 'player': 0}] |
| 52 | 835808481 | 51 | illegal move | yes | take_cards {'mode': 'range', 'card': 'A544'} not in legal_actions |
| 53 | 836560387 | 24 | illegal move | yes | play a sponsor first (or take the break option) |
| 54 | 837033009 | 66 | illegal move | yes | choose_effect {'bonus_type': 'reputation', 'n': 1} not in legal_actions |
| 55 | 837033009 | 74 | illegal move | no | association_task {'task': 'conservation', 'project': 'P108', 'source': 'play'} not in legal_actions |
| 56 | 837771519 | 60 | illegal move | yes | take_cards {'mode': 'deck', 'count': 1} not in legal_actions |
| 57 | 841272721 | 49 | illegal move | yes | choose_effect {'card': 'S202'} not in legal_actions |
| 58 | 842580036 | 57 | illegal move | yes | choose_effect {'keep': 'S242'} not in legal_actions |
| 59 | 843469060 | 46 | state mismatch | yes | player 1, money: engine 10, replay 9; player 1, conservation: engine 10, replay 9; player 1, reputation: engine 13, replay 10 |
| 60 | 843469060 | 66 | state mismatch | no | display: only in the engine: A439; only in the replay: None; main deck: only in the replay: A439 |
| 61 | 844027463 | 34 | state mismatch | yes | player 1, money: engine 3, replay 5 |
| 62 | 846590560 | 78 | illegal move | yes | play_animal {'card': 'A503', 'from_display': False, 'x': 7, 'y': 12} not in legal_actions |
| 63 | 846710292 | 55 | state mismatch | yes | main deck: only in the engine: P132; only in the replay: A401; player 1, hand: only in the engine: A401; only in the replay: S239; main disc |
| 64 | 850825471 | 53 | illegal move | yes | play_animal {'card': 'A477', 'from_display': False, 'x': 7, 'y': 2} not in legal_actions |
| 65 | 852870715 | 52 | illegal move | yes | choose_effect {'worker': 53} not in legal_actions |
| 66 | 852870715 | 78 | illegal move | no | a mandatory effect is still pending: [{'kind': 'build', 'source': 'S272', 'type': 'size-3', 'rules': {}, 'optional': False, 'double': False, |
| 67 | 853613089 | 20 | illegal move | yes | choose_effect {'cards': []} not in legal_actions |
| 68 | 853928407 | 46 | illegal move | yes | choose_effect {'building': [7, 6], 'x': 7, 'y': 8, 'rotation': 0} not in legal_actions |
| 69 | 854263310 | 37 | state mismatch | yes | player 0, money: engine 9, replay 11 |
| 70 | 855033887 | 57 | illegal move | yes | take_cards {'mode': 'deck', 'count': 1} not in legal_actions |
| 71 | 855033887 | 62 | illegal move | no | take_cards {'mode': 'deck', 'count': 1} not in legal_actions |
| 72 | 855252797 | 56 | illegal move | yes | association_task {'task': 'conservation', 'project': 'P111', 'source': 'play'} not in legal_actions |
| 73 | 856556982 | 46 | illegal move | yes | choose_effect {'send': 'S236'} not in legal_actions |
| 74 | 856570085 | 16 | illegal move | yes | play_animal {'card': 'A473', 'from_display': False, 'x': 3, 'y': 6} not in legal_actions |
| 75 | 857053797 | 62 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'take_tile', 'tile': 'university', 'player': 1, 'optional': False}] |
| 76 | 858199959 | 55 | state mismatch | yes | player 1, action cards: engine: cards, animals II v2, sponsors II v1, association, build II +Constriction \| replay: cards, animals II v2, s |
| 77 | 859360830 | 60 | illegal move | yes | choose_action_card {'type': 'animals', 'spend': 0} not in legal_actions |
| 78 | 859461296 | 51 | illegal move | yes | donate {} not in legal_actions |
| 79 | 864036800 | 49 | illegal move | yes | choose_effect {'worker': 53} not in legal_actions |
| 80 | 865382491 | 66 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'take', 'source': 'reputation track', 'optional': False, 'player': 1}] |
| 81 | 868837221 | 42 | illegal move | yes | place_building {'type': 'size-2', 'x': 2, 'y': 5, 'rotation': 5} not in legal_actions |
| 82 | 869053695 | 41 | illegal move | yes | place_building {'type': 'kiosk', 'x': 1, 'y': 8, 'rotation': 0} not in legal_actions |
| 83 | 874269610 | 68 | state mismatch | yes | player 0, appeal: engine 63, replay 70 |
| 84 | 874274513 | 63 | illegal move | yes | choose_effect {'card': 'S261'} not in legal_actions |
| 85 | 877649220 | 27 | illegal move | yes | choose_effect {'upgrade': 'cards'} not in legal_actions |
| 86 | 877798202 | 53 | illegal move | yes | choose_effect {'bonus_type': 'take-in-range-or-deck', 'n': 1} not in legal_actions |
| 87 | 878372500 | 20 | illegal move | yes | choose_effect {'keep': None} not in legal_actions |
| 88 | 879867929 | 29 | illegal move | yes | play_animal {'card': 'A475', 'from_display': False, 'x': 3, 'y': 2} not in legal_actions |
| 89 | 880468340 | 12 | illegal move | yes | choose_effect {'donate': True} not in legal_actions |
| 90 | 881630407 | 61 | illegal move | yes | choose_effect {'card': 'A496', 'mark': True} not in legal_actions |
| 91 | 881841416 | 41 | illegal move | yes | choose_effect {'bonus_type': 'reputation', 'n': 1} not in legal_actions |
| 92 | 886820039 | 66 | state mismatch | yes | display: only in the engine: S250; only in the replay: S236; player 1, hand: only in the replay: S250; main deck: only in the engine: S236 |
| 93 | 889209922 | 46 | illegal move | yes | take_cards {'mode': 'snap', 'card': 'A486'} not in legal_actions |
| 94 | 890439778 | 17 | illegal move | yes | choose_effect {'donate': True} not in legal_actions |
| 95 | 894764261 | 82 | illegal move | yes | choose_effect {'activate': True} not in legal_actions |
| 96 | 900401029 | 6 | illegal move | yes | choose_effect {'cards': []} not in legal_actions |
| 97 | 901779082 | 49 | illegal move | yes | choose_effect {'type': 'build'} not in legal_actions |

97 problems in 85 games (71 illegal moves, 26 state mismatches). The first problem of a game is the one to look at, the others may be consequences.


## Table 653431606  (maps ['A', 'A'], Marine Worlds True; seat 0 = WildLachs, seat 1 = confident goat)


### 653431606 turn 73 — MISMATCH (first in this game)

**Error:** project slots before move 368: engine {'P107': [2], 'P133': [0], 'P119': [0]} bga {'P133': [0], 'P119': [0]}

| order | player | event | log text |
|---|---|---|---|
| 1990 | confident goat | getBonuses | confident goat pays 3 xtoken for increasing card strength |
| 1991 | confident goat | chooseActionCard | confident goat chooses action card AssociationII with strength 8 |
| 1995 | confident goat | slideMeeples | confident goat takes a new Partner zoo |
| 1996 | confident goat | slideMeeples |  |
| 1997 | confident goat | slideMeeples | confident goat gains a new Association worker |
| 1998 | confident goat | getBonuses | confident goat gains 2 conservation (last worker bonus) |
| 2002 | confident goat | slideMeeples | confident goat supports a conservation project on the first slot : Sea Animals |
| 2003 |  | slideMeeples |  |
| 2007 | confident goat | getBonuses | confident goat gains 2 reputation (map bonus space) |
| 2011 | confident goat | takeBonus | confident goat gets 1 x take-in-range-or-deck (reputation track bonus) |
| 2017 | confident goat | snapCard | confident goat takes Amazon House in reputation range from the display |
| 2018 | confident goat | takeBonus | confident goat gets 1 x conservation (reputation track bonus) |
| 2019 | confident goat | endOfGame | End of game triggered: everyone except confident goat will get a last turn to play |
| 2020 | confident goat | getBonuses | confident goat gains 1 conservation (reputation track bonus) |
| 2021 | confident goat | getBonuses | confident goat gains 5 conservation (Sea Animals) |
| 2024 | confident goat | actionCardCleanup | confident goat places action card Association at position 1 (finishing action) |
| 2028 | confident goat | markCard | confident goat marks White Stork from display |
| 2032 |  | fillPool | The display is replenished with Llama |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1991 | 1 | choose_action_card | {'type': 'association', 'spend': 3} |
| 1996 | 1 | association_task | {'task': 'partner', 'continent': 'Europe'} |
| 2003 | 1 | association_task | {'task': 'conservation', 'project': 'P133', 'source': 'play', 'slot': 0, 'bonus': {'type': 'reputation', 'value': 2}} |
| 2017 | 1 | take_cards | {'mode': 'range', 'card': 'S278'} |
| 2028 | 1 | choose_effect | {'card': 'A510', 'mark': True} |

## Table 800178782  (maps ['2a', '2a'], Marine Worlds True; seat 0 = portgard, seat 1 = nights1030)


### 800178782 turn 46 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'snap', 'card': 'A452'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1359 | nights1030 | chooseActionCard | nights1030 chooses action card AnimalsII with strength 4 |
| 1363 | nights1030 | buyAnimal | nights1030 plays Rock Monitor for 9 and places it in a size-2 enclosure |
| 1367 | nights1030 | getBonuses | nights1030 gains 5 appeal (Rock Monitor) |
| 1372 | nights1030 | pDiscardCards | You sell Veiled Chameleon cards for 4 money |
| 1379 | nights1030 | buyAnimal | nights1030 plays Tasmanian Devil for 5 and places it in a size-1 enclosure |
| 1383 | nights1030 | getBonuses | nights1030 gains 1 reputation (Tasmanian Devil) |
| 1387 | nights1030 | getBonuses | nights1030 gains 4 appeal (Tasmanian Devil) |
| 1400 | nights1030 | snapCard | nights1030 snaps Senegal Bushbaby from the display |
| 1402 | nights1030 | actionCardCleanup | nights1030 places action card Animals at position 1 (finishing action) |
| 1406 | nights1030 | markCard | nights1030 marks Compass Jellyfish from display |
| 1410 |  | fillPool | The display is replenished with Shoebill |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1359 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1363 | 1 | play_animal | {'card': 'A472', 'from_display': False, 'x': 2, 'y': 11} |
| 1367 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1372 | 1 | choose_effect | {'cards': ['A477']} |
| 1379 | 1 | play_animal | {'card': 'A425', 'from_display': False, 'x': 2, 'y': 5} |
| 1383 | 1 | choose_effect | {'apply': 'gain', 'res': 'reputation'} |
| 1387 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1400 | 1 | take_cards | {'mode': 'snap', 'card': 'A452'} |
| 1406 | 1 | choose_effect | {'card': 'A550', 'mark': True} |

## Table 800308899  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = TheEpicSaxGuy, seat 1 = icefacez)


### 800308899 turn 14 — MISMATCH (first in this game)

**Error:** player 0, reputation: engine 2, replay 3

| order | player | event | log text |
|---|---|---|---|
| 360 | TheEpicSaxGuy | chooseActionCard | TheEpicSaxGuy chooses action card AssociationI with strength 5 |
| 364 | TheEpicSaxGuy | slideMeeples | TheEpicSaxGuy hires a new worker (Association2 effect) |
| 365 | TheEpicSaxGuy | getBonuses | TheEpicSaxGuy gains 1 reputation (1st worker bonus) |
| 367 | TheEpicSaxGuy | actionCardCleanup | TheEpicSaxGuy places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 360 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 364 | 0 | association_task | {'task': 'hire'} |

## Table 800385493  (maps ['T1', '2a'], Marine Worlds True; seat 0 = frosty-woodpecker956, seat 1 = Guacafella)


### 800385493 turn 72 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'take', 'source': 'bonus', 'optional': False, 'player': 0}]

| order | player | event | log text |
|---|---|---|---|
| 2039 | frosty-woodpecker956 | getBonuses | frosty-woodpecker956 pays 2 xtoken for increasing card strength |
| 2040 | frosty-woodpecker956 | chooseActionCard | frosty-woodpecker956 chooses action card AssociationI with strength 5 |
| 2044 | frosty-woodpecker956 | slideMeeples | frosty-woodpecker956 supports a conservation project on the first slot : Yosemite national park |
| 2045 |  | discardCardsOnDisplay | The rightmost project card is discarded: Bird Management Plan |
| 2046 | frosty-woodpecker956 | moveProjects | frosty-woodpecker956 plays a new conservation project: Yosemite national park |
| 2047 |  | slideMeeples |  |
| 2048 | frosty-woodpecker956 | releaseAnimal | frosty-woodpecker956 releases Bald Eagle into the wild and loses 8 appeal and frees the Large Bird Aviary |
| 2055 | frosty-woodpecker956 | getBonuses | frosty-woodpecker956 gains 3 appeal (maxing out reputation) |
| 2062 | frosty-woodpecker956 | getBonuses | frosty-woodpecker956 gains 1 appeal (maxing out reputation) |
| 2063 | frosty-woodpecker956 | getBonuses | frosty-woodpecker956 gains 5 conservation (Yosemite national park) |
| 2065 | frosty-woodpecker956 | actionCardCleanup | frosty-woodpecker956 places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2040 | 0 | choose_action_card | {'type': 'association', 'spend': 2} |
| 2047 | 0 | association_task | {'task': 'conservation', 'project': 'P114', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |
| 2048 | 0 | choose_effect | {'release': 'A505', 'building': [5, 6]} |

## Table 800438098  (maps ['12', '12'], Marine Worlds True; seat 0 = Dramatisch, seat 1 = Korniiszon)


### 800438098 turn 51 — MISMATCH (first in this game)

**Error:** player 1, reputation: engine 9, replay 10

| order | player | event | log text |
|---|---|---|---|
| 1424 | Korniiszon | getBonuses | Korniiszon pays 1 xtoken for increasing card strength |
| 1425 | Korniiszon | chooseActionCard | Korniiszon chooses action card AssociationII with strength 7 |
| 1429 | Korniiszon | slideMeeples | Korniiszon supports a conservation project on the third slot : Bird Management Plan |
| 1430 |  | discardCardsOnDisplay | The rightmost project card is discarded: Primate Management Plan |
| 1431 | Korniiszon | moveProjects | Korniiszon plays a new conservation project: Bird Management Plan |
| 1432 |  | slideMeeples |  |
| 1433 | Korniiszon | getBonuses | Korniiszon gains 3 xtoken (map bonus space) |
| 1435 | Korniiszon | pDrawCards | You draw Ornithologist with <BIRD> (Bird Management Plan) |
| 1442 | Korniiszon | getBonuses | Korniiszon gains 2 conservation (Bird Management Plan) |
| 1446 | Korniiszon | takeBonus | Korniiszon gets 5 x money |
| 1447 | Korniiszon | getBonuses | Korniiszon gains 5 money |
| 1451 | Korniiszon | buyBuilding | Korniiszon adds a pavilion for free |
| 1452 | Korniiszon | getBonuses | Korniiszon gains 1 appeal (building a pavilion) |
| 1456 | Korniiszon | slideMeeples | Korniiszon increases reputation |
| 1458 | Korniiszon | getBonuses | Korniiszon gains 1 reputation (association board) |
| 1462 | Korniiszon | donation | Korniiszon donates 2 money to get 1 conservation |
| 1466 | Korniiszon | takeBonus | Korniiszon triggers scoring card discard by reaching 10 conservation points |
| 1471 | Dramatisch | pDiscardCards | You discard Specialized Species Zoo (scoring card) |
| 1474 | Korniiszon | pDiscardCards | You discard Favorite Zoo (scoring card) |
| 1480 | Korniiszon | actionCardCleanup | Korniiszon places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1425 | 1 | choose_action_card | {'type': 'association', 'spend': 1, 'unpaid': 1} |
| 1432 | 1 | association_task | {'task': 'conservation', 'project': 'P135', 'source': 'hand', 'slot': 2, 'bonus': {'type': 'xtoken', 'value': 3}} |
| 1435 | 1 | choose_effect | {'apply': 'tutor'} |
| 1446 | 1 | choose_effect | {'bonus_type': 'money', 'n': 5} |
| 1451 | 1 | place_building | {'type': 'pavilion', 'x': 2, 'y': 7, 'rotation': 0} |
| 1456 | 1 | association_task | {'task': 'reputation'} |
| 1462 | 1 | donate | {} |
| 1471 | 0 | choose_effect | {'card': 'F014'} |
| 1474 | 1 | choose_effect | {'card': 'F007'} |

### 800438098 turn 69 — MISMATCH (later; may be a consequence)

**Error:** player 1, reputation: engine 9, replay 10

| order | player | event | log text |
|---|---|---|---|
| 2026 | Korniiszon | chooseActionCard | Korniiszon chooses action card AnimalsII with strength 6 |
| 2031 | Korniiszon | buyAnimal | Korniiszon plays Australian Sea Lion for 15 and places it in a size-4 enclosure |
| 2035 | Korniiszon | getBonuses | Korniiszon gains 7 appeal (Australian Sea Lion) |
| 2039 | Korniiszon | getBonuses | Korniiszon gains 1 conservation (Australian Sea Lion) |
| 2041 | Korniiszon | pDiscardCards | You sell Bolivian Red Howler, Laughing Kookaburra, Zoo School cards for 12 money |
| 2048 | Korniiszon | buyAnimal | Korniiszon plays Malayan Tapir for 14 and places it in a size-2 enclosure |
| 2053 | Korniiszon | pDiscardCards | You dig Grizzly Bear from your hand |
| 2054 | Korniiszon | pDrawCards | You draw Shoebill from the deck |
| 2062 | Korniiszon | discardCardsOnDisplay | Korniiszon digs Aquarium from the display |
| 2063 |  | fillPool | The display is replenished with Expert In Large Animals |
| 2065 | Korniiszon | pDiscardCards | You dig Llama from your hand |
| 2066 | Korniiszon | pDrawCards | You draw Horsfield's Tarsier from the deck |
| 2075 | Korniiszon | getBonuses | Korniiszon gains 5 appeal (Malayan Tapir) |
| 2077 | Korniiszon | actionCardCleanup | Korniiszon places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2026 | 1 | choose_action_card | {'type': 'animals', 'spend': 0, 'unpaid': 1} |
| 2031 | 1 | play_animal | {'card': 'A422', 'from_display': False, 'x': 6, 'y': 9} |
| 2035 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2039 | 1 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 2041 | 1 | choose_effect | {'cards': ['A466', 'A517', 'S254']} |
| 2048 | 1 | play_animal | {'card': 'A435', 'from_display': False, 'x': 5, 'y': 8} |
| 2053 | 1 | choose_effect | {'hand': 'A411'} |
| 2062 | 1 | choose_effect | {'display': 'S245'} |
| 2065 | 1 | choose_effect | {'hand': 'A439'} |
| 2075 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 801244007  (maps ['14', '14'], Marine Worlds True; seat 0 = BlanketAddict, seat 1 = DurdleGerg)


### 801244007 turn 24 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'gain', 'source': 'A538', 'res': 'xtoken', 'n': 1, 'optional': False}]

| order | player | event | log text |
|---|---|---|---|
| 620 | DurdleGerg | getBonuses | DurdleGerg pays 1 xtoken for increasing card strength |
| 621 | DurdleGerg | chooseActionCard | DurdleGerg chooses action card AnimalsII with strength 5 |
| 622 | DurdleGerg | getBonuses | DurdleGerg gains 1 reputation (max strength Animals) |
| 626 | DurdleGerg | buyAnimal | DurdleGerg plays Devil Firefish for 10 and places it in the small aquarium |
| 634 | DurdleGerg | getBonuses | DurdleGerg gains 1 xtoken (Inventive) |
| 641 | DurdleGerg | discardCardsOnDisplay | DurdleGerg digs Slow Worm from the display |
| 642 |  | fillPool | The display is replenished with Panamanian White-faced Capuchin |
| 646 | DurdleGerg | getBonuses | DurdleGerg gains 6 appeal (Devil Firefish) |
| 656 | DurdleGerg | discardCardsOnDisplay | DurdleGerg sends Expert In Small Animals away to an expedition |
| 657 | DurdleGerg | getBonuses | DurdleGerg gains 1 conservation (Marine Research Expedition) |
| 664 | DurdleGerg | actionCardCleanup | DurdleGerg places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 621 | 1 | choose_action_card | {'type': 'animals', 'spend': 1} |
| 626 | 1 | play_animal | {'card': 'A538', 'from_display': False, 'x': 1, 'y': 2} |
| 634 | 1 | choose_effect | {'apply': 'gain', 'res': 'xtoken'} |
| 641 | 1 | choose_effect | {'display': 'A488'} |
| 646 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 656 | 1 | choose_effect | {'send': 'S229'} |

## Table 802528333  (maps ['10', '10'], Marine Worlds True; seat 0 = windgs, seat 1 = nuowei zh)


### 802528333 turn 31 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'deck', 'count': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 920 | nuowei zh | chooseActionCard | nuowei zh chooses action card SponsorsII with strength 5 |
| 927 | nuowei zh | playSponsor | nuowei zh plays Penguin Pool |
| 934 | nuowei zh | buyBuilding | nuowei zh adds a unique building for free |
| 938 | nuowei zh | getBonuses | nuowei zh gains 1 reputation (placement bonus) |
| 940 | nuowei zh | pDrawCards | You draw Australian Sea Lion from the deck |
| 943 | nuowei zh | buyAnimal | nuowei zh tucks Jaguar in the rescue station (Map10's effect) |
| 946 | nuowei zh | pDrawCards | You draw Jungle, Dusky-leaf Monkey for hunter effect |
| 948 | nuowei zh | pDiscardCards | You keep Dusky-leaf Monkey and discard Jungle for hunter effect |
| 957 | nuowei zh | getBonuses | nuowei zh gains 2 appeal (Penguin Pool) |
| 962 | nuowei zh | getBonuses | nuowei zh trades 1<XTOKEN> for <REPUTATION:1> (Trade effect) |
| 963 | nuowei zh | slideMeeples | nuowei zh gains a new Association worker |
| 965 | nuowei zh | actionCardCleanup | nuowei zh places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 920 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 927 | 1 | play_sponsor | {'card': 'S244', 'from_display': False} |
| 934 | 1 | place_building | {'type': 'penguin', 'x': 8, 'y': 3, 'rotation': 4} |
| 940 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 943 | 1 | choose_effect | {'hand': 'A412', 'rescue': True} |
| 948 | 1 | choose_effect | {'keep': 'A460'} |
| 962 | 1 | sponsor_side | {'op': 'rep_x'} |

### 802528333 turn 59 — ILLEGAL (later; may be a consequence)

**Error:** take_cards {'mode': 'range', 'card': 'S219'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1872 | nuowei zh | chooseActionCard | nuowei zh chooses action card SponsorsII with strength 5 |
| 1879 | nuowei zh | getBonuses | nuowei zh trades <MONEY:5> for <REPUTATION:1> (Trade effect) |
| 1883 | nuowei zh | snapCard | nuowei zh takes Diversity Researcher in reputation range from the display |
| 1889 | nuowei zh | playSponsor | nuowei zh plays Diversity Researcher |
| 1890 | nuowei zh | getBonuses | nuowei zh gains 8 money (Diversity Researcher) |
| 1891 | nuowei zh | getBonuses | nuowei zh gains 2 money (Science Library) |
| 1894 | nuowei zh | actionCardCleanup | nuowei zh places action card Sponsors at position 1 (finishing action) |
| 1898 |  | fillPool | The display is replenished with Expert On Europe |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1872 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 1879 | 1 | sponsor_side | {'op': 'rep_money'} |
| 1883 | 1 | take_cards | {'mode': 'range', 'card': 'S219'} |
| 1889 | 1 | play_sponsor | {'card': 'S219', 'from_display': False} |

## Table 802787987  (maps ['14', '14'], Marine Worlds True; seat 0 = 2366439349, seat 1 = TheLittlestGiant)


### 802787987 turn 39 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'take', 'source': 'reputation track', 'optional': False, 'player': 1}]

| order | player | event | log text |
|---|---|---|---|
| 966 | TheLittlestGiant | chooseActionCard | TheLittlestGiant chooses action card SponsorsI with strength 4 |
| 970 | TheLittlestGiant | playSponsor | TheLittlestGiant plays Science Museum |
| 971 | TheLittlestGiant | getBonuses | TheLittlestGiant gains 10 money (Science Museum) |
| 976 | TheLittlestGiant | getBonuses | TheLittlestGiant gains 1 conservation (Science Museum) |
| 980 | TheLittlestGiant | takeBonus | TheLittlestGiant gets 1 x upgrade-card |
| 984 | TheLittlestGiant | upgradeCard | TheLittlestGiant upgrades CardsII |
| 986 | TheLittlestGiant | actionCardCleanup | TheLittlestGiant places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 966 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 970 | 1 | play_sponsor | {'card': 'S204', 'from_display': False} |
| 984 | 1 | choose_effect | {'upgrade': 'cards'} |

## Table 803004707  (maps ['4a', '4a'], Marine Worlds True; seat 0 = XGHJ, seat 1 = trickbreaker)


### 803004707 turn 67 — MISMATCH (first in this game)

**Error:** player 1, reputation: engine 9, replay 10

| order | player | event | log text |
|---|---|---|---|
| 1858 | trickbreaker | chooseActionCard | trickbreaker chooses action card AssociationI with strength 3 |
| 1862 | trickbreaker | slideMeeples | trickbreaker increases reputation |
| 1864 | trickbreaker | getBonuses | trickbreaker gains 1 reputation (association board) |
| 1866 | XGHJ | actionCardCleanup | XGHJ places action card Association at position 1 (finishing action) |
| 1870 |  | fillPool | The display is replenished with Explorer |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1858 | 1 | choose_action_card | {'type': 'association', 'spend': 0, 'hypnosis': True} |
| 1862 | 1 | association_task | {'task': 'reputation'} |

### 803004707 turn 79 — MISMATCH (later; may be a consequence)

**Error:** player 1, reputation: engine 9, replay 10

| order | player | event | log text |
|---|---|---|---|
| 2234 | trickbreaker | chooseActionCard | trickbreaker chooses action card AnimalsII with strength 4 |
| 2238 | trickbreaker | buyAnimal | trickbreaker plays Northern Cassowary for 9 and places it in a size-3 enclosure |
| 2245 | trickbreaker | addMeeples | trickbreaker adds a multiplier token on action card BuildII |
| 2246 | trickbreaker | getBonuses | trickbreaker gains 6 appeal (Northern Cassowary) |
| 2250 | trickbreaker | buyAnimal | trickbreaker plays Koala for 18 and places it in a size-5 enclosure |
| 2259 | trickbreaker | pDiscardCards | You pouch Savanna cards for 2 appeal |
| 2263 | trickbreaker | getBonuses | trickbreaker gains 8 appeal (Koala) |
| 2265 | trickbreaker | actionCardCleanup | trickbreaker places action card Animals at position 1 (finishing action) |
| 2266 |  | enableMultiplier |  |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2234 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 2238 | 1 | play_animal | {'card': 'A516', 'from_display': False, 'x': 1, 'y': 0} |
| 2245 | 1 | choose_effect | {'multiplier': 'build'} |
| 2246 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2250 | 1 | play_animal | {'card': 'A448', 'from_display': False, 'x': 5, 'y': 8} |
| 2259 | 1 | choose_effect | {'card': 'P118', 'psrc': 'A448'} |
| 2263 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 803523726  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = xiurui1517, seat 1 = Raden Prabu)


### 803523726 turn 5 — MISMATCH (first in this game)

**Error:** player 1, reputation: engine 1, replay 2

| order | player | event | log text |
|---|---|---|---|
| 153 | Raden Prabu | chooseActionCard | Raden Prabu chooses action card AssociationI with strength 5 |
| 157 | Raden Prabu | slideMeeples | Raden Prabu hires a new worker (Association2 effect) |
| 158 | Raden Prabu | getBonuses | Raden Prabu gains 1 reputation (1st worker bonus) |
| 160 | Raden Prabu | actionCardCleanup | Raden Prabu places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 153 | 1 | choose_action_card | {'type': 'association', 'spend': 0} |
| 157 | 1 | association_task | {'task': 'hire'} |

## Table 804988782  (maps ['6a', '6a'], Marine Worlds True; seat 0 = PaulStupka, seat 1 = hohighb2024)


### 804988782 turn 66 — MISMATCH (first in this game)

**Error:** player 1, hand: only in the replay: S266

| order | player | event | log text |
|---|---|---|---|
| 2152 | hohighb2024 | getBonuses | hohighb2024 pays 2 xtoken for increasing card strength |
| 2153 | hohighb2024 | chooseActionCard | hohighb2024 chooses action card AnimalsII with strength 3 |
| 2157 | hohighb2024 | buyAnimal | hohighb2024 plays Blackbar Triggerfish for 14 and places it in the large aquarium |
| 2162 | hohighb2024 | addMeeples | hohighb2024 uses Constriction effect and gives constriction token(s) to PaulStupka |
| 2167 | hohighb2024 | pDrawCards | You draw Expert On Africa from the deck |
| 2171 | hohighb2024 | getBonuses | hohighb2024 gains 5 appeal (Blackbar Triggerfish) |
| 2175 | hohighb2024 | buyAnimal | hohighb2024 buys Zooplankton from display for 6 and places it in the large aquarium |
| 2179 | hohighb2024 | sponsorMagnet | hohighb2024 takes Marine Biologist from the display (Sea animal magnet effect) |
| 2180 | hohighb2024 | getBonuses | hohighb2024 gains 1 appeal (Zooplankton) |
| 2182 | PaulStupka | actionCardCleanup | PaulStupka places action card Animals at position 1 (finishing action) |
| 2187 |  | fillPool | The display is replenished with African Bush Elephant, Sun Bear |
| 2189 | PaulStupka | getBonuses | PaulStupka gains 2 conservation (Science Lab) |
| 2190 | PaulStupka | getBonuses | PaulStupka gains 1 conservation (Hydrologist) |
| 2191 | PaulStupka | getBonuses | PaulStupka gains 1 conservation (Guided School Tours) |
| 2192 | PaulStupka | getBonuses | PaulStupka gains 5 appeal (Underwater Tunnel) |
| 2193 | PaulStupka | getBonuses | PaulStupka gains 4 conservation (Accessible Zoo) |
| 2194 | hohighb2024 | getBonuses | hohighb2024 gains 3 conservation (Designer Zoo) |
| 2195 | PaulStupka | finalScoring | PaulStupka has 80<APPEAL> and scores 54 for having 26<CONSERVATION>. PaulStupka scores 134. |
| 2196 | hohighb2024 | finalScoring | hohighb2024 has 72<APPEAL> and scores 27 for having 17<CONSERVATION>. hohighb2024 scores 99. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2153 | 1 | choose_action_card | {'type': 'animals', 'spend': 2, 'hypnosis': True} |
| 2157 | 1 | play_animal | {'card': 'A537', 'from_display': False, 'x': 6, 'y': 9} |
| 2162 | 1 | choose_effect | {'apply': 'constrict'} |
| 2167 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 2171 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2175 | 1 | play_animal | {'card': 'A532', 'from_display': True, 'x': 6, 'y': 9} |
| 2179 | 1 | magnet_note | {'ability': 'Sea Animal Magnet'} |
| 2180 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 805030443  (maps ['4a', '4a'], Marine Worlds True; seat 0 = slashno1, seat 1 = MoniLiu)


### 805030443 turn 74 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'take_tile', 'tile': 'university', 'player': 0, 'optional': False}]

| order | player | event | log text |
|---|---|---|---|
| 2198 | slashno1 | chooseActionCard | slashno1 chooses action card AssociationI with strength 4 |
| 2202 | slashno1 | slideMeeples | slashno1 supports a conservation project on the second slot : Reptile Management Plan |
| 2203 |  | discardCardsOnDisplay | The rightmost project card is discarded: Large Animals |
| 2204 | slashno1 | moveProjects | slashno1 plays a new conservation project: Reptile Management Plan |
| 2205 |  | slideMeeples |  |
| 2210 | slashno1 | getBonuses | slashno1 gains 2 conservation (Reptile Management Plan) |
| 2214 | slashno1 | getBonuses | slashno1 gains 2 reputation (Reptile Management Plan) |
| 2215 | slashno1 | takeBonus | slashno1 gets 1 x add-worker (reputation track bonus) |
| 2216 | slashno1 | slideMeeples | slashno1 gains a new Association worker |
| 2218 | slashno1 | pDiscardCards | You sell Slow Worm, Coastal Manta Ray cards for 8 money |
| 2223 | slashno1 | actionCardCleanup | slashno1 places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2198 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 2205 | 0 | association_task | {'task': 'conservation', 'project': 'P136', 'source': 'hand', 'slot': 1, 'bonus': {'slot': 3}} |
| 2218 | 0 | choose_effect | {'cards': ['A488', 'A543']} |

## Table 805601662  (maps ['1a', '1a'], Marine Worlds True; seat 0 = kkatusch, seat 1 = lazieast)


### 805601662 turn 70 — ILLEGAL (first in this game)

**Error:** association_task {'task': 'conservation', 'project': 'P133', 'source': 'play'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2237 | kkatusch | chooseActionCard | kkatusch chooses action card AssociationI with strength 5 |
| 2241 | kkatusch | slideMeeples | kkatusch supports a conservation project on the first slot : Sea Animals |
| 2242 | kkatusch | discardTokens | kkatusch uses 1 token(s) from sponsor card(s) and 1 x bonus-icon |
| 2243 |  | slideMeeples |  |
| 2245 | kkatusch | getBonuses | kkatusch gains 2 xtoken (map bonus space) |
| 2246 | kkatusch | endOfGame | End of game triggered: everyone except kkatusch will get a last turn to play |
| 2247 | kkatusch | getBonuses | kkatusch gains 5 conservation (Sea Animals) |
| 2249 | kkatusch | actionCardCleanup | kkatusch places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2237 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 2243 | 0 | association_task | {'task': 'conservation', 'project': 'P133', 'source': 'play', 'slot': 0, 'bonus': {'type': 'xtoken', 'value': 2}, 'icon': True, 'token': 'S218'} |

## Table 806276023  (maps ['1a', '1a'], Marine Worlds True; seat 0 = The Aristocrat, seat 1 = ISENGUARD 4658)


### 806276023 turn 51 — MISMATCH (first in this game)

**Error:** player 0, money: engine 43, replay 44

| order | player | event | log text |
|---|---|---|---|
| 1522 | ISENGUARD 4658 | chooseActionCard | ISENGUARD 4658 chooses action card SponsorsI with strength 4 |
| 1527 | ISENGUARD 4658 | advanceBreak | ISENGUARD 4658 advances break token of 4 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1528 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 1 xtoken (triggering break) |
| 1529 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 4 money |
| 1530 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 3 money (Sponsors2 effect) |
| 1532 | ISENGUARD 4658 | actionCardCleanup | ISENGUARD 4658 places action card Sponsors at position 1 (finishing action) |
| 1537 |  | startBreak | Starting a new break |
| 1541 | ISENGUARD 4658 | updateBreakDiscardSelection |  |
| 1542 | ISENGUARD 4658 | pDiscardCards | You discard Marine Research Expedition, Serengeti national park |
| 1547 |  | discardTokens | All tokens are removed from player cards |
| 1548 |  | slideMeeples | All workers go back to each player's reserve |
| 1549 |  | addMeeples | Replenishing partner zoos and universities |
| 1550 |  | discardCardsOnDisplay | Removing first two cards of the display: Native Lizards |
| 1551 | ISENGUARD 4658 | markAssign | Emu is not discarded and given to ISENGUARD 4658 (Mark effect) |
| 1552 |  | fillPool | The display is replenished with Savanna, Anaconda |
| 1554 | ISENGUARD 4658 | takeBonus | ISENGUARD 4658 gets 5 x money (map bonus space) |
| 1555 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 5 money (map bonus space) |
| 1559 | ISENGUARD 4658 | takeBonus | ISENGUARD 4658 gets 1 x Snapping (map bonus space) |
| 1563 | ISENGUARD 4658 | snapCard | ISENGUARD 4658 snaps Savanna from the display |
| 1564 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 27 money (appeal income) |
| 1565 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 4 money (kiosk income) |
| 1570 |  | fillPool | The display is replenished with Northern Cassowary |
| 1574 | The Aristocrat | takeBonus | The Aristocrat gets 1 x bonus-sponsor (map bonus space) |
| 1578 | The Aristocrat | getBonuses | The Aristocrat pays 3 money for buying sponsor card |
| 1579 | The Aristocrat | playSponsor | The Aristocrat plays Gorilla Field Research |
| 1583 | The Aristocrat | getBonuses | The Aristocrat gains 1 reputation (Gorilla Field Research) |
| 1584 | The Aristocrat | takeBonus | The Aristocrat gets 1 x xtoken (reputation track bonus) |
| 1585 | The Aristocrat | getBonuses | The Aristocrat gains 1 xtoken (reputation track bonus) |
| 1589 | The Aristocrat | getBonuses | The Aristocrat gains 1 appeal (maxing out reputation) |
| 1593 | The Aristocrat | getBonuses | The Aristocrat gains 1 conservation (Gorilla Field Research) |
| 1597 | The Aristocrat | getBonuses | The Aristocrat gains 1 appeal (maxing out reputation) |
| 1601 | The Aristocrat | takeBonus | The Aristocrat gets 1 x size-2 (map bonus space) |
| 1605 | The Aristocrat | buyBuilding | The Aristocrat adds a size-2 enclosure for free |
| 1606 | The Aristocrat | getBonuses | The Aristocrat gains 24 money (appeal income) |
| 1607 | The Aristocrat | getBonuses | The Aristocrat gains 2 money (kiosk income) |
| 1608 | The Aristocrat | getBonuses | The Aristocrat gains 1 money (Franchise Business) |
| 1613 |  | finishBreak | End of the break |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1522 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 1527 | 1 | sponsor_break | {} |
| 1542 | 1 | choose_effect | {'cards': ['P116', 'S270']} |
| 1563 | 1 | take_cards | {'mode': 'snap', 'card': 'P118'} |
| 1564 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1565 | 1 | choose_effect | {'apply': 'income_kiosk'} |
| 1579 | 0 | choose_effect | {'card': 'S205'} |
| 1605 | 0 | place_building | {'type': 'size-2', 'x': 2, 'y': 3, 'rotation': 0} |
| 1606 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1607 | 0 | choose_effect | {'apply': 'income_kiosk'} |
| 1608 | 0 | choose_effect | {'apply': 'income_sponsor', 'source': 'S265'} |

## Table 807723077  (maps ['5a', '5a'], Marine Worlds True; seat 0 = GWGY, seat 1 = Shahar48)


### 807723077 turn 30 — ILLEGAL (first in this game)

**Error:** play_animal {'card': 'A469', 'from_display': False, 'x': 7, 'y': 10} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 864 | Shahar48 | chooseActionCard | Shahar48 chooses action card AnimalsII with strength 5 |
| 865 | Shahar48 | getBonuses | Shahar48 gains 1 reputation (max strength Animals) |
| 869 | Shahar48 | buyAnimal | Shahar48 plays Indian Cobra for 13 and places it in the Reptile House |
| 873 | Shahar48 | hypnosis | Shahar48 chooses to hypnotize GWGY |
| 877 | Shahar48 | getBonuses | Shahar48 gains 6 appeal (Indian Cobra) |
| 887 | Shahar48 | buyAnimal | Shahar48 plays Nile Crocodile for 13 and places it in the Reptile House |
| 894 | Shahar48 | snapCard | Shahar48 snaps Anaconda from the display |
| 898 | Shahar48 | snapCard | Shahar48 snaps Siberian Tiger from the display |
| 903 | Shahar48 | pDiscardCards | You sell Siberian Tiger, Anaconda cards for 8 money |
| 907 | Shahar48 | getBonuses | Shahar48 gains 9 appeal (Nile Crocodile) |
| 909 | Shahar48 | actionCardCleanup | Shahar48 places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 864 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 869 | 1 | play_animal | {'card': 'A475', 'from_display': False, 'x': 7, 'y': 10} |
| 873 | 1 | choose_effect | {'apply': 'hypnosis'} |
| 877 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 887 | 1 | play_animal | {'card': 'A469', 'from_display': False, 'x': 7, 'y': 10} |
| 894 | 1 | take_cards | {'mode': 'snap', 'card': 'A482'} |
| 898 | 1 | take_cards | {'mode': 'snap', 'card': 'A406'} |
| 903 | 1 | choose_effect | {'cards': ['A406', 'A482']} |
| 907 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 809651876  (maps ['4a', '4a'], Marine Worlds True; seat 0 = BlueSwan, seat 1 = supercoolbrianD)


### 809651876 turn 21 — ILLEGAL (first in this game)

**Error:** choose_effect {'keep': 'S209'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 699 | supercoolbrianD | getBonuses | supercoolbrianD pays 1 xtoken for increasing card strength |
| 700 | supercoolbrianD | chooseActionCard | supercoolbrianD chooses action card SponsorsI with strength 6 |
| 704 | supercoolbrianD | playSponsor | supercoolbrianD plays Barred Owl Hut |
| 705 | supercoolbrianD | getBonuses | supercoolbrianD gains 3 money (Ornithologist) |
| 706 | supercoolbrianD | getBonuses | supercoolbrianD gains 3 money (Sponsors2 effect) |
| 713 | supercoolbrianD | buyBuilding | supercoolbrianD adds a unique building for free |
| 717 | supercoolbrianD | getBonuses | supercoolbrianD pays 5 money for buying sponsor card |
| 718 | supercoolbrianD | playSponsor | supercoolbrianD plays Marine Research Expedition |
| 723 | supercoolbrianD | pDrawCards | You draw Sea Turtle Tank, Longhorn Cowfish, Technology Institute for scuba dive effect |
| 728 | supercoolbrianD | pDiscardCards | You keep Technology Institute and discard Sea Turtle Tank, Longhorn Cowfish for scuba dive effect |
| 733 | supercoolbrianD | pDrawCards | You draw Gould's Monitor, Amazon House for perception effect |
| 738 | supercoolbrianD | pDiscardCards | You keep Amazon House and discard Gould's Monitor |
| 743 | supercoolbrianD | actionCardCleanup | supercoolbrianD places action card Sponsors at position 1 (finishing action) |
| 748 | supercoolbrianD | pDiscardCards | You sell Coquerel's Sifaka cards for 3 money |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 700 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 1} |
| 704 | 1 | play_sponsor | {'card': 'S249', 'from_display': False} |
| 713 | 1 | place_building | {'type': 'owl', 'x': 1, 'y': 2, 'rotation': 1} |
| 718 | 1 | play_sponsor | {'card': 'S270', 'from_display': False} |
| 728 | 1 | choose_effect | {'keep': 'S209'} |
| 738 | 1 | choose_effect | {'keep': 'S278'} |
| 748 | 1 | harbor_sell | {'card': 'A559'} |

## Table 811076698  (maps ['8a', '8a'], Marine Worlds True; seat 0 = xhsbhh, seat 1 = cammauta)


### 811076698 turn 61 — ILLEGAL (first in this game)

**Error:** choose_effect {'cards': ['A409', 'A510', 'A560']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1787 | xhsbhh | chooseActionCard | xhsbhh chooses action card SponsorsII with strength 5 |
| 1792 | xhsbhh | advanceBreak | xhsbhh advances break token of 5 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1793 | xhsbhh | getBonuses | xhsbhh gains 1 xtoken (triggering break) |
| 1794 | xhsbhh | getBonuses | xhsbhh gains 10 money |
| 1795 | xhsbhh | getBonuses | xhsbhh gains 5 money (Sponsors2 effect) |
| 1797 | xhsbhh | actionCardCleanup | xhsbhh places action card Sponsors at position 1 (finishing action) |
| 1802 | xhsbhh | discardTokens | xhsbhh uses 1 x bonus-sponsor-gray |
| 1806 | xhsbhh | getBonuses | xhsbhh pays 3 money for buying sponsor card |
| 1807 | xhsbhh | playSponsor | xhsbhh plays Federal Grants |
| 1808 | xhsbhh | getBonuses | xhsbhh gains 3 money (Federal Grants) |
| 1813 |  | startBreak | Starting a new break |
| 1817 | xhsbhh | updateBreakDiscardSelection |  |
| 1818 | xhsbhh | pDiscardCards | You discard Brahminy Kite, White Stork, Sun Bear |
| 1823 |  | discardTokens | All tokens are removed from player cards |
| 1824 |  | slideMeeples | All workers go back to each player's reserve |
| 1825 |  | addMeeples | Replenishing partner zoos and universities |
| 1826 |  | discardCardsOnDisplay | Removing first two cards of the display: Reindeer, Senegal Bushbaby |
| 1827 |  | fillPool | The display is replenished with Llama, Science Lab |
| 1832 | xhsbhh | takeBonus | xhsbhh gets 1 x Snapping (map bonus space) |
| 1836 | xhsbhh | snapCard | xhsbhh snaps Expert On Asia from the display |
| 1840 | xhsbhh | takeBonus | xhsbhh gets 1 x size-2 (map bonus space) |
| 1844 | xhsbhh | buyBuilding | xhsbhh adds a size-2 enclosure for free |
| 1848 | xhsbhh | snapCard | xhsbhh takes Grevy's Zebra in reputation range from the display |
| 1849 | xhsbhh | getBonuses | xhsbhh gains 25 money (appeal income) |
| 1850 | xhsbhh | getBonuses | xhsbhh gains 5 money (kiosk income) |
| 1851 | xhsbhh | getBonuses | xhsbhh gains 3 money (Federal Grants) |
| 1856 |  | fillPool | The display is replenished with Sharknose Goby, Koala |
| 1857 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Gould's Monitor |
| 1858 |  | fillPool | The display is replenished with Quarantine Lab |
| 1866 | cammauta | getBonuses | cammauta gains 27 money (appeal income) |
| 1868 | cammauta | getBonuses | cammauta gains 7 money (kiosk income) |
| 1870 | cammauta | getBonuses | cammauta gains 3 money (Sponsorship: Elephants) |
| 1874 | cammauta | takeBonus | cammauta gets 1 x Snapping (map bonus space) |
| 1878 | cammauta | snapCard | cammauta snaps Sharknose Goby from the display |
| 1879 | cammauta | getBonuses | cammauta gains 1 xtoken (Technology Institute) |
| 1884 |  | finishBreak | End of the break |
| 1885 |  | fillPool | The display is replenished with White Rhinoceros |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1787 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 1792 | 0 | sponsor_break | {} |
| 1802 | 0 | use_token | {'token': 'bonus-sponsor-gray'} |
| 1807 | 0 | choose_effect | {'card': 'S220'} |
| 1818 | 0 | choose_effect | {'cards': ['A409', 'A510', 'A560']} |
| 1836 | 0 | take_cards | {'mode': 'snap', 'card': 'S213'} |
| 1844 | 0 | place_building | {'type': 'size-2', 'x': 8, 'y': 9, 'rotation': 0} |
| 1848 | 0 | take_cards | {'mode': 'range', 'card': 'A429'} |
| 1849 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1850 | 0 | choose_effect | {'apply': 'income_kiosk'} |
| 1866 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1868 | 1 | choose_effect | {'apply': 'income_kiosk'} |
| 1870 | 1 | choose_effect | {'apply': 'income_sponsor', 'source': 'S235'} |
| 1878 | 1 | take_cards | {'mode': 'snap', 'card': 'A535'} |
| 1879 | 1 | choose_effect | {'apply': 'income_sponsor', 'source': 'S209'} |

## Table 814075010  (maps ['6a', '6a'], Marine Worlds True; seat 0 = sleepyist, seat 1 = Sutoly)


### 814075010 turn 58 — MISMATCH (first in this game)

**Error:** player 0, action cards: same cards, other order  [engine: animals, sponsors II v4, association, build II v1, cards II \| replay: cards II, sponsors II v4, association, animals, build II v1]; player 1, action cards: animals II is in slot 5 in the engine but slot 1 in the replay (the other cards keep their order)  [engine: sponsors II v1, cards II, build v4, association II, animals II \| replay: animals II, sponsors II v1, cards II, build v4, association II]

| order | player | event | log text |
|---|---|---|---|
| 1696 | sleepyist | chooseActionCard | sleepyist chooses action card SponsorsII with strength 4 |
| 1701 | sleepyist | advanceBreak | sleepyist advances break token of 4 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1702 | sleepyist | getBonuses | sleepyist gains 1 xtoken (triggering break) |
| 1703 | sleepyist | getBonuses | sleepyist gains 8 money |
| 1708 | sleepyist | actionCardCleanup | sleepyist places action card Sponsors at position 1 (finishing action) |
| 1713 |  | startBreak | Starting a new break |
| 1717 | Sutoly | updateBreakDiscardSelection |  |
| 1718 | Sutoly | pDiscardCards | You discard Dusky-leaf Monkey |
| 1723 |  | discardTokens | All tokens are removed from player cards |
| 1724 |  | slideMeeples | All workers go back to each player's reserve |
| 1725 |  | addMeeples | Replenishing partner zoos and universities |
| 1726 |  | discardCardsOnDisplay | Removing first two cards of the display: Red Deer, Longcomb Sawfish |
| 1727 |  | fillPool | The display is replenished with Herpetologist, Veterinarian |
| 1738 | sleepyist | getBonuses | sleepyist gains 25 money (appeal income) |
| 1740 | sleepyist | getBonuses | sleepyist gains 11 money (kiosk income) |
| 1742 | sleepyist | getBonuses | sleepyist gains 6 money (Sponsorship: Vultures) |
| 1747 | sleepyist | takeBonus | sleepyist gets 1 x size-2 (map bonus space) |
| 1754 | sleepyist | buyBuilding | sleepyist adds a size-2 enclosure for free |
| 1758 | sleepyist | actionCardCleanup | sleepyist places Cards at position 1 (Clever effect) |
| 1766 | Sutoly | takeBonus | Sutoly gets 1 x Snapping (map bonus space) |
| 1770 | Sutoly | snapCard | Sutoly snaps Veterinarian from the display |
| 1774 | Sutoly | takeBonus | Sutoly gets 1 x size-2 (map bonus space) |
| 1778 | Sutoly | buyBuilding | Sutoly adds a size-2 enclosure for free |
| 1780 | Sutoly | pDrawCards | You draw Expert On Europe from the deck |
| 1787 | Sutoly | takeBonus | Sutoly gets 2 x Clever (map bonus space) |
| 1791 | Sutoly | actionCardCleanup | Sutoly places Sponsors at position 1 (Clever effect) |
| 1795 | Sutoly | actionCardCleanup | Sutoly places Animals at position 1 (Clever effect) |
| 1799 | Sutoly | getBonuses | Sutoly gains 25 money (appeal income) |
| 1804 |  | finishBreak | End of the break |
| 1805 |  | fillPool | The display is replenished with Indian Peafowl |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1696 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 1701 | 0 | sponsor_break | {} |
| 1718 | 1 | choose_effect | {'cards': ['A460']} |
| 1738 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1740 | 0 | choose_effect | {'apply': 'income_kiosk'} |
| 1742 | 0 | choose_effect | {'apply': 'income_sponsor', 'source': 'S233'} |
| 1754 | 0 | place_building | {'type': 'size-2', 'x': 5, 'y': 2, 'rotation': 5} |
| 1758 | 0 | choose_effect | {'type': 'cards'} |
| 1770 | 1 | take_cards | {'mode': 'snap', 'card': 'S203'} |
| 1778 | 1 | place_building | {'type': 'size-2', 'x': 8, 'y': 5, 'rotation': 0} |
| 1780 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1791 | 0 | choose_effect | {'type': 'sponsors'} |
| 1795 | 0 | choose_effect | {'type': 'animals'} |
| 1799 | 1 | choose_effect | {'apply': 'income_appeal'} |

## Table 814842703  (maps ['7a', '7a'], Marine Worlds True; seat 0 = tsj7, seat 1 = JontyMC)


### 814842703 turn 72 — MISMATCH (first in this game)

**Error:** player 1, hand: only in the engine: P108

| order | player | event | log text |
|---|---|---|---|
| 2055 | JontyMC | getBonuses | JontyMC pays 2 xtoken for increasing card strength |
| 2056 | JontyMC | chooseActionCard | JontyMC chooses action card AnimalsII with strength 5 |
| 2057 | JontyMC | getBonuses | JontyMC gains 1 reputation (max strength Animals) |
| 2058 | JontyMC | takeBonus | JontyMC gets 1 x conservation (reputation track bonus) |
| 2059 | JontyMC | endOfGame | End of game triggered: everyone except JontyMC will get a last turn to play |
| 2060 | JontyMC | getBonuses | JontyMC gains 1 conservation (reputation track bonus) |
| 2064 | JontyMC | buyAnimal | JontyMC plays Proboscis Monkey for 29 and places it in a size-5 enclosure |
| 2068 | JontyMC | getBonuses | JontyMC gains 2 appeal (Baboon Rock) |
| 2072 | JontyMC | getBonuses | JontyMC gains 10 appeal (Proboscis Monkey) |
| 2076 | JontyMC | getBonuses | JontyMC pays <MONEY:2> to gain <APPEAL:1> (Animals3 ability) |
| 2080 | JontyMC | getBonuses | JontyMC gains 2 conservation (Proboscis Monkey) |
| 2087 | JontyMC | buyAnimal | JontyMC plays Tambaqui for 15 and places it in the large aquarium |
| 2091 | JontyMC | getBonuses | JontyMC gains 2 money (Explorer) |
| 2092 | JontyMC | getBonuses | JontyMC gains 1 appeal (Explorer) |
| 2096 | JontyMC | getBonuses | JontyMC pays <MONEY:2> to gain <APPEAL:1> (Animals3 ability) |
| 2100 | JontyMC | getBonuses | JontyMC gains 5 appeal (Tambaqui) |
| 2102 | JontyMC | pDrawCards | You draw Conservation Zoo for adapt effect |
| 2107 | JontyMC | pDiscardCards | You discard Conservation Zoo for adapt effect |
| 2112 | JontyMC | actionCardCleanup | JontyMC places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2056 | 1 | choose_action_card | {'type': 'animals', 'spend': 2} |
| 2064 | 1 | play_animal | {'card': 'A451', 'from_display': False, 'x': 1, 'y': 10} |
| 2072 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2076 | 1 | choose_effect | {'apply': 'pay_appeal'} |
| 2080 | 1 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 2087 | 1 | play_animal | {'card': 'A553', 'from_display': False, 'x': 5, 'y': 2} |
| 2096 | 1 | choose_effect | {'apply': 'pay_appeal'} |
| 2100 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2107 | 1 | choose_effect | {'discard': ['F005']} |

## Table 814950957  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = Zesdav, seat 1 = Bertrand_)


### 814950957 turn 71 — ILLEGAL (first in this game)

**Error:** association_task {'task': 'conservation', 'project': 'P111', 'source': 'play'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2009 | Bertrand_ | pDiscardCards | You discard African Penguin for Map T1 effect |

**Engine actions derived from the log:**

_(no plan: )_


### 814950957 turn 3 — MISMATCH (later; may be a consequence)

**Error:** player 1, reputation: engine 1, replay 2

| order | player | event | log text |
|---|---|---|---|
| 103 | Bertrand_ | chooseActionCard | Bertrand_ chooses action card AssociationI with strength 5 |
| 107 | Bertrand_ | slideMeeples | Bertrand_ hires a new worker (Association2 effect) |
| 108 | Bertrand_ | getBonuses | Bertrand_ gains 1 reputation (1st worker bonus) |
| 110 | Bertrand_ | actionCardCleanup | Bertrand_ places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 103 | 1 | choose_action_card | {'type': 'association', 'spend': 0} |
| 107 | 1 | association_task | {'task': 'hire'} |

### 814950957 turn 45 — MISMATCH (later; may be a consequence)

**Error:** player 1, conservation: engine 5, replay 6; player 1, x tokens: engine 1, replay 2; player 1, reputation: engine 10, replay 12

| order | player | event | log text |
|---|---|---|---|
| 1103 | Bertrand_ | getBonuses | Bertrand_ pays 1 xtoken for increasing card strength |
| 1104 | Bertrand_ | chooseActionCard | Bertrand_ chooses action card AssociationI with strength 5 |
| 1108 | Bertrand_ | slideMeeples | Bertrand_ supports a conservation project on the second slot : Serengeti national park |
| 1109 | Bertrand_ | moveProjects | Bertrand_ plays a new conservation project: Serengeti national park |
| 1110 |  | slideMeeples |  |
| 1111 | Bertrand_ | releaseAnimal | Bertrand_ releases Humphead Wrasse into the wild and loses 6 appeal and frees the small aquarium |
| 1115 | Bertrand_ | getBonuses | Bertrand_ gains 4 conservation (Serengeti national park) |
| 1122 | Bertrand_ | takeBonus | Bertrand_ gets 1 x upgrade-card |
| 1126 | Bertrand_ | upgradeCard | Bertrand_ upgrades CardsII |
| 1130 | Bertrand_ | takeBonus | Bertrand_ gets 3 x take-in-range-or-deck |
| 1132 | Bertrand_ | pDrawCards | You draw Water Playground from the deck |
| 1137 | Bertrand_ | pDrawCards | You draw Barred Owl Hut from the deck |
| 1142 | Bertrand_ | pDrawCards | You draw African Penguin from the deck |
| 1149 | Bertrand_ | getBonuses | Bertrand_ gains 1 reputation (adding a new conservation project) |
| 1150 | Bertrand_ | takeBonus | Bertrand_ gets 1 x add-worker (reputation track bonus) |
| 1151 | Bertrand_ | slideMeeples | Bertrand_ gains a new Association worker |
| 1152 | Bertrand_ | getBonuses | Bertrand_ gains 1 reputation (2nd worker bonus) |
| 1153 | Bertrand_ | getBonuses | Bertrand_ gains 3 reputation (map bonus space) |
| 1154 | Bertrand_ | takeBonus | Bertrand_ gets 1 x xtoken (reputation track bonus) |
| 1155 | Bertrand_ | getBonuses | Bertrand_ gains 1 xtoken (reputation track bonus) |
| 1159 | Bertrand_ | takeBonus | Bertrand_ gets 1 x conservation (reputation track bonus) |
| 1160 | Bertrand_ | getBonuses | Bertrand_ gains 1 conservation (reputation track bonus) |
| 1161 | Bertrand_ | takeBonus | Bertrand_ gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1163 | Bertrand_ | pDrawCards | You draw King Vulture from the deck |
| 1168 | Bertrand_ | actionCardCleanup | Bertrand_ places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1104 | 1 | choose_action_card | {'type': 'association', 'spend': 1} |
| 1110 | 1 | association_task | {'task': 'conservation', 'project': 'P116', 'source': 'hand', 'slot': 1, 'bonus': {'type': 'reputation', 'value': 3}} |
| 1111 | 1 | choose_effect | {'release': 'A542', 'building': [7, 4]} |
| 1126 | 1 | choose_effect | {'upgrade': 'cards'} |
| 1130 | 1 | choose_effect | {'bonus_type': 'take-in-range-or-deck', 'n': 3} |
| 1132 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1137 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1142 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1163 | 1 | take_cards | {'mode': 'deck', 'count': 1} |

## Table 815572376  (maps ['6a', '6a'], Marine Worlds True; seat 0 = CHENJIANHAO6, seat 1 = citazn)


### 815572376 turn 17 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'range', 'card': 'S205'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 421 | CHENJIANHAO6 | chooseActionCard | CHENJIANHAO6 chooses action card BuildII with strength 3 |
| 425 | CHENJIANHAO6 | buyBuilding | CHENJIANHAO6 pays 2 for building a Kiosk |
| 429 | CHENJIANHAO6 | buyBuilding | CHENJIANHAO6 pays 2 for building a pavilion |
| 430 | CHENJIANHAO6 | getBonuses | CHENJIANHAO6 gains 1 appeal (building a pavilion) |
| 437 | CHENJIANHAO6 | takeBonus | CHENJIANHAO6 gets 1 x Fac |
| 441 | CHENJIANHAO6 | slideMeeples |  |
| 442 | CHENJIANHAO6 | getBonuses | CHENJIANHAO6 gains 2 reputation ( from university) |
| 443 | CHENJIANHAO6 | takeBonus | CHENJIANHAO6 gets 1 x upgrade-card (reputation track bonus) |
| 447 | CHENJIANHAO6 | upgradeCard | CHENJIANHAO6 upgrades SponsorsII |
| 451 | CHENJIANHAO6 | snapCard | CHENJIANHAO6 takes Gorilla Field Research in reputation range from the display |
| 456 | CHENJIANHAO6 | actionCardCleanup | CHENJIANHAO6 places action card Build at position 1 (finishing action) |
| 460 |  | fillPool | The display is replenished with Panamanian White-faced Capuchin |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 421 | 0 | choose_action_card | {'type': 'build', 'spend': 0} |
| 425 | 0 | place_building | {'type': 'kiosk', 'x': 8, 'y': 7, 'rotation': 0} |
| 429 | 0 | place_building | {'type': 'pavilion', 'x': 8, 'y': 5, 'rotation': 0} |
| 437 | 0 | choose_effect | {'bonus_type': 'Fac', 'n': 1} |
| 441 | 0 | choose_effect | {'university': 'fac-science-rep'} |
| 447 | 0 | choose_effect | {'upgrade': 'sponsors'} |
| 451 | 0 | take_cards | {'mode': 'range', 'card': 'S205'} |

## Table 816450097  (maps ['7a', '7a'], Marine Worlds True; seat 0 = milkandholywater, seat 1 = CidEx1994)


### 816450097 turn 52 — ILLEGAL (first in this game)

**Error:** play_animal {'card': 'A440', 'from_display': False, 'x': 6, 'y': 7} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1382 | milkandholywater | chooseActionCard | milkandholywater chooses action card AnimalsI with strength 5 |
| 1386 | milkandholywater | buyAnimal | milkandholywater plays Malayan Tapir for 14 and places it in a size-2 enclosure |
| 1387 | CidEx1994 | getBonuses | CidEx1994 gains 3 money (Expert In Herbivores) |
| 1391 | milkandholywater | getBonuses | milkandholywater gains 5 appeal (Malayan Tapir) |
| 1395 | milkandholywater | getBonuses | milkandholywater gains 1 reputation (Malayan Tapir) |
| 1399 | milkandholywater | getBonuses | milkandholywater gains 2 appeal (Meerkat Den) |
| 1406 | milkandholywater | buyAnimal | milkandholywater plays Mountain Tapir for 12 and places it in a size-2 enclosure |
| 1407 | CidEx1994 | getBonuses | CidEx1994 gains 3 money (Expert In Herbivores) |
| 1411 | milkandholywater | getBonuses | milkandholywater gains 4 appeal (Mountain Tapir) |
| 1415 | milkandholywater | getBonuses | milkandholywater gains 1 conservation (Mountain Tapir) |
| 1419 | milkandholywater | getBonuses | milkandholywater gains 2 appeal (Meerkat Den) |
| 1423 | milkandholywater | discardCardsOnDisplay | milkandholywater digs Bald Eagle from the display |
| 1424 |  | fillPool | The display is replenished with Amazon House |
| 1428 | milkandholywater | discardCardsOnDisplay | milkandholywater digs Amazon House from the display |
| 1429 |  | fillPool | The display is replenished with Golden Lion Tamarin |
| 1431 | milkandholywater | actionCardCleanup | milkandholywater places action card Animals at position 1 (finishing action) |
| 1435 | milkandholywater | markCard | milkandholywater marks Lesser Bird-of-paradise from display |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1382 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1386 | 0 | play_animal | {'card': 'A435', 'from_display': False, 'x': 2, 'y': 3} |
| 1391 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1395 | 0 | choose_effect | {'apply': 'gain', 'res': 'reputation'} |
| 1406 | 0 | play_animal | {'card': 'A440', 'from_display': False, 'x': 6, 'y': 7} |
| 1411 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1415 | 0 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 1423 | 0 | choose_effect | {'display': 'A505'} |
| 1428 | 0 | choose_effect | {'display': 'S278'} |
| 1435 | 0 | choose_effect | {'card': 'A518', 'mark': True} |

## Table 816836354  (maps ['13', '13'], Marine Worlds True; seat 0 = la-li-lu, seat 1 = bulewhale66)


### 816836354 turn 37 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'gain', 'source': 'A538', 'res': 'xtoken', 'n': 1, 'optional': False}]

| order | player | event | log text |
|---|---|---|---|
| 1029 | la-li-lu | chooseActionCard | la-li-lu chooses action card AnimalsI with strength 4 |
| 1033 | la-li-lu | buyAnimal | la-li-lu plays Devil Firefish for 13 and places it in the large aquarium |
| 1038 | la-li-lu | getBonuses | la-li-lu gains 1 xtoken (Inventive) |
| 1048 | la-li-lu | slideMeeples | la-li-lu takes 1 worker(s) back from the university zone to their notepad (Extra Shift effect) |
| 1052 | la-li-lu | getBonuses | la-li-lu gains 2 appeal (Orange Clownfish) |
| 1053 | la-li-lu | getBonuses | la-li-lu gains 6 appeal (Devil Firefish) |
| 1055 | la-li-lu | actionCardCleanup | la-li-lu places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1029 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1033 | 0 | play_animal | {'card': 'A538', 'from_display': False, 'x': 3, 'y': 0} |
| 1038 | 0 | choose_effect | {'apply': 'gain', 'res': 'xtoken'} |
| 1048 | 0 | choose_effect | {'worker': 56} |
| 1052 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1053 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

### 816836354 turn 59 — ILLEGAL (later; may be a consequence)

**Error:** play_animal {'card': 'A534', 'from_display': False, 'x': 3, 'y': 0} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1717 | la-li-lu | chooseActionCard | la-li-lu chooses action card AnimalsII with strength 5 |
| 1718 | la-li-lu | getBonuses | la-li-lu gains 1 reputation (max strength Animals) |
| 1719 | la-li-lu | takeBonus | la-li-lu gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1723 | la-li-lu | snapCard | la-li-lu takes New Zealand Sea Lion in reputation range from the display |
| 1727 | la-li-lu | buyAnimal | la-li-lu plays Guineafowl Puffer for 12 and places it in the large aquarium |
| 1735 | la-li-lu | slideMeeples | la-li-lu takes 1 worker(s) back from the partner zoo zone to their notepad (Extra Shift effect) |
| 1739 | la-li-lu | getBonuses | la-li-lu gains 1 reputation (Guineafowl Puffer) |
| 1740 | la-li-lu | takeBonus | la-li-lu gets 1 x conservation (reputation track bonus) |
| 1741 | la-li-lu | getBonuses | la-li-lu gains 1 conservation (reputation track bonus) |
| 1745 | la-li-lu | getBonuses | la-li-lu gains 1 xtoken (Inventive) |
| 1752 | la-li-lu | getBonuses | la-li-lu gains 2 appeal (Orange Clownfish) |
| 1753 | la-li-lu | getBonuses | la-li-lu gains 5 appeal (Guineafowl Puffer) |
| 1757 | la-li-lu | buyAnimal | la-li-lu plays Southern Blue-ringed Octopus for 9 and places it in the large aquarium |
| 1759 | la-li-lu | getBonuses | la-li-lu gains 3 money (Southern Blue-ringed Octopus) |
| 1763 | la-li-lu | getBonuses | la-li-lu gains 1 xtoken (Inventive) |
| 1767 | la-li-lu | getBonuses | la-li-lu gains 1 reputation (Guineafowl Puffer) |
| 1768 | la-li-lu | takeBonus | la-li-lu gets 1 x xtoken (reputation track bonus) |
| 1769 | la-li-lu | getBonuses | la-li-lu gains 1 xtoken (reputation track bonus) |
| 1773 | la-li-lu | getBonuses | la-li-lu gains 2 appeal (Orange Clownfish) |
| 1783 | la-li-lu | slideMeeples | la-li-lu takes 1 worker(s) back from the conservation project zone to their notepad (Extra Shift effect) |
| 1784 | la-li-lu | getBonuses | la-li-lu gains 4 appeal (Southern Blue-ringed Octopus) |
| 1786 | la-li-lu | actionCardCleanup | la-li-lu places action card Animals at position 1 (finishing action) |
| 1790 |  | fillPool | The display is replenished with Saltwater Crocodile |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1717 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1723 | 0 | take_cards | {'mode': 'range', 'card': 'A423'} |
| 1727 | 0 | play_animal | {'card': 'A540', 'from_display': False, 'x': 3, 'y': 0} |
| 1735 | 0 | choose_effect | {'worker': 56} |
| 1739 | 0 | choose_effect | {'apply': 'gain', 'res': 'reputation'} |
| 1745 | 0 | choose_effect | {'apply': 'gain', 'res': 'xtoken'} |
| 1752 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1753 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1757 | 0 | play_animal | {'card': 'A534', 'from_display': False, 'x': 3, 'y': 0} |
| 1759 | 0 | choose_effect | {'apply': 'gain', 'res': 'money'} |
| 1763 | 0 | choose_effect | {'apply': 'gain', 'res': 'xtoken'} |
| 1767 | 0 | choose_effect | {'apply': 'gain', 'res': 'reputation'} |
| 1773 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1783 | 0 | choose_effect | {'worker': 54} |
| 1784 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 817212885  (maps ['12', '12'], Marine Worlds True; seat 0 = mangomadman, seat 1 = lanlanwww)


### 817212885 turn 68 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'snap', 'card': 'A453'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1584 | lanlanwww | getBonuses | lanlanwww pays 2 xtoken for increasing card strength |
| 1585 | lanlanwww | chooseActionCard | lanlanwww chooses action card AssociationII with strength 5 |
| 1589 | lanlanwww | slideMeeples | lanlanwww supports a conservation project on the first slot : Angthong national park |
| 1590 | lanlanwww | moveProjects | lanlanwww plays a new conservation project: Angthong national park |
| 1591 |  | slideMeeples |  |
| 1595 | lanlanwww | releaseAnimal | lanlanwww releases Cinereous Vulture into the wild and loses 6 appeal and frees a size-5 enclosure |
| 1599 | lanlanwww | getBonuses | lanlanwww gains 5 conservation (Angthong national park) |
| 1606 | lanlanwww | takeBonus | lanlanwww gets 1 x Partner-Zoo |
| 1610 | lanlanwww | slideMeeples |  |
| 1614 | lanlanwww | upgradeCard | lanlanwww upgrades CardsII |
| 1618 | lanlanwww | takeBonus | lanlanwww triggers scoring card discard by reaching 10 conservation points |
| 1623 | lanlanwww | pDiscardCards | You discard Favorite Zoo (scoring card) |
| 1626 | mangomadman | pDiscardCards | You discard Specialized Species Zoo (scoring card) |
| 1635 | lanlanwww | getBonuses | lanlanwww gains 1 reputation (adding a new conservation project) |
| 1636 | lanlanwww | takeBonus | lanlanwww gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1640 | lanlanwww | snapCard | lanlanwww takes Indian Rock Python in reputation range from the display |
| 1644 | lanlanwww | snapCard | lanlanwww snaps Collared Mangabey from the display |
| 1648 | lanlanwww | donation | lanlanwww donates 5 money to get 1 conservation |
| 1650 | lanlanwww | actionCardCleanup | lanlanwww places action card Association at position 1 (finishing action) |
| 1654 |  | fillPool | The display is replenished with Mountain Tapir, Expert On Europe |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1585 | 1 | choose_action_card | {'type': 'association', 'spend': 2} |
| 1591 | 1 | association_task | {'task': 'conservation', 'project': 'P115', 'source': 'hand', 'slot': 0, 'bonus': {'type': 'Snapping'}} |
| 1595 | 1 | choose_effect | {'release': 'A499', 'building': [7, 8]} |
| 1606 | 1 | choose_effect | {'bonus_type': 'Partner-Zoo', 'n': 1} |
| 1610 | 1 | choose_effect | {'partner': 'Africa'} |
| 1614 | 1 | choose_effect | {'upgrade': 'cards'} |
| 1623 | 1 | choose_effect | {'card': 'F007'} |
| 1626 | 0 | choose_effect | {'card': 'F014'} |
| 1640 | 1 | take_cards | {'mode': 'range', 'card': 'A474'} |
| 1644 | 1 | take_cards | {'mode': 'snap', 'card': 'A453'} |
| 1648 | 1 | donate | {} |

## Table 818199843  (maps ['4a', '4a'], Marine Worlds True; seat 0 = cloud_turtle, seat 1 = usunmet)


### 818199843 turn 25 — ILLEGAL (first in this game)

**Error:** choose_effect {'cards': []} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 798 | cloud_turtle | chooseActionCard | cloud_turtle chooses action card CardsI with strength 5 |
| 800 | cloud_turtle | advanceBreak | cloud_turtle advances break token of 2 space(s), now at 4/9 |
| 802 | cloud_turtle | pDrawCards | You draw Brahminy Kite, Grevy's Zebra, Primatologist from the deck |
| 810 | cloud_turtle | pDiscardCards | You discard Primatologist |
| 815 | cloud_turtle | actionCardCleanup | cloud_turtle places action card Cards at position 1 (finishing action) |
| 820 | cloud_turtle | pDiscardCards | You sell cards for |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 798 | 0 | choose_action_card | {'type': 'cards', 'spend': 0} |
| 802 | 0 | take_cards | {'mode': 'deck', 'count': 3} |
| 810 | 0 | discard_cards | {'cards': ['S236']} |
| 820 | 0 | choose_effect | {'cards': []} |

## Table 818947505  (maps ['7a', '7a'], Marine Worlds True; seat 0 = Ninogade, seat 1 = victorioushermit)


### 818947505 turn 42 — ILLEGAL (first in this game)

**Error:** play_sponsor {'card': 'S280', 'from_display': False} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1081 | Ninogade | chooseActionCard | Ninogade chooses action card SponsorsI with strength 3 |
| 1085 | Ninogade | playSponsor | Ninogade plays Reconstruction |
| 1098 | Ninogade | buyBuilding | Ninogade adds a Kiosk for free |
| 1105 | Ninogade | buyBuilding | Ninogade adds a pavilion for free |
| 1106 | Ninogade | getBonuses | Ninogade gains 1 appeal (building a pavilion) |
| 1111 | Ninogade | actionCardCleanup | Ninogade places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1081 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 1085 | 0 | play_sponsor | {'card': 'S280', 'from_display': False} |
| 1098 | 0 | place_building | {'type': 'kiosk', 'x': 5, 'y': 2, 'rotation': 0} |
| 1105 | 0 | place_building | {'type': 'pavilion', 'x': 1, 'y': 0, 'rotation': 0} |

## Table 819091744  (maps ['8a', '8a'], Marine Worlds True; seat 0 = milkandholywater, seat 1 = Waggi)


### 819091744 turn 47 — ILLEGAL (first in this game)

**Error:** choose_effect {'bonus_type': 'reputation', 'n': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1183 | milkandholywater | chooseActionCard | milkandholywater chooses action card BuildII with strength 5 |
| 1188 | milkandholywater | buyBuilding | milkandholywater pays 10 for building the large aquarium |
| 1189 | milkandholywater | getBonuses | milkandholywater gains 1 xtoken (placement bonus) |
| 1190 | milkandholywater | getBonuses | milkandholywater gains 2 money (Build4) |
| 1197 | milkandholywater | takeBonus | milkandholywater gets 1 x reputation |
| 1198 | milkandholywater | getBonuses | milkandholywater gains 1 reputation |
| 1199 | milkandholywater | takeBonus | milkandholywater gets 1 x conservation (reputation track bonus) |
| 1200 | milkandholywater | getBonuses | milkandholywater gains 1 conservation (reputation track bonus) |
| 1204 | milkandholywater | takeBonus | milkandholywater gets 5 x money |
| 1205 | milkandholywater | getBonuses | milkandholywater gains 5 money |
| 1213 | milkandholywater | actionCardCleanup | milkandholywater places action card Build at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1183 | 0 | choose_action_card | {'type': 'build', 'spend': 0} |
| 1188 | 0 | place_building | {'type': 'large-aquarium', 'x': 2, 'y': 7, 'rotation': 4} |
| 1197 | 0 | choose_effect | {'bonus_type': 'reputation', 'n': 1} |
| 1204 | 0 | choose_effect | {'bonus_type': 'money', 'n': 5} |

## Table 819130034  (maps ['12', '12'], Marine Worlds True; seat 0 = Milowitt, seat 1 = lv3curtiss)


### 819130034 turn 75 — ILLEGAL (first in this game)

**Error:** association_task {'task': 'conservation', 'project': 'P110', 'source': 'play'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2165 | lv3curtiss | getBonuses | lv3curtiss pays 1 xtoken for increasing card strength |
| 2166 | lv3curtiss | chooseActionCard | lv3curtiss chooses action card AssociationII with strength 7 |
| 2170 | lv3curtiss | slideMeeples | lv3curtiss supports a conservation project on the second slot : Predators |
| 2171 | lv3curtiss | discardTokens | lv3curtiss uses 1 token(s) from sponsor card(s) and 1 x bonus-icon |
| 2172 |  | slideMeeples |  |
| 2173 | lv3curtiss | getBonuses | lv3curtiss gains 12 money (map bonus space) |
| 2174 | lv3curtiss | getBonuses | lv3curtiss gains 4 conservation (Predators) |
| 2178 | lv3curtiss | slideMeeples | lv3curtiss increases reputation |
| 2179 | lv3curtiss | getBonuses | lv3curtiss gains 2 reputation (association board) |
| 2180 | lv3curtiss | takeBonus | lv3curtiss gets 1 x xtoken (reputation track bonus) |
| 2181 | lv3curtiss | getBonuses | lv3curtiss gains 1 xtoken (reputation track bonus) |
| 2182 | lv3curtiss | takeBonus | lv3curtiss gets 1 x conservation (reputation track bonus) |
| 2183 | lv3curtiss | getBonuses | lv3curtiss gains 1 conservation (reputation track bonus) |
| 2187 | lv3curtiss | donation | lv3curtiss donates 12 money to get 1 conservation |
| 2189 | lv3curtiss | actionCardCleanup | lv3curtiss places action card Association at position 1 (finishing action) |
| 2192 | Milowitt | getBonuses | Milowitt gains 1 conservation (Penguin Pool) |
| 2193 | Milowitt | getBonuses | Milowitt gains 1 conservation (Large Animal Zoo) |
| 2194 | lv3curtiss | getBonuses | lv3curtiss gains 1 conservation (Technology Institute) |
| 2195 | lv3curtiss | getBonuses | lv3curtiss gains 1 conservation (Foreign Institute) |
| 2196 | lv3curtiss | getBonuses | lv3curtiss gains 4 conservation (Favorite Zoo) |
| 2197 | Milowitt | finalScoring | Milowitt has 78<APPEAL> and scores 30 for having 18<CONSERVATION>. Milowitt scores 108. |
| 2198 | lv3curtiss | finalScoring | lv3curtiss has 43<APPEAL> and scores 60 for having 28<CONSERVATION>. lv3curtiss scores 103. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2166 | 1 | choose_action_card | {'type': 'association', 'spend': 1, 'unpaid': 2} |
| 2172 | 1 | association_task | {'task': 'conservation', 'project': 'P110', 'source': 'play', 'slot': 1, 'bonus': {'type': 'money', 'value': 12}, 'workers': 1, 'icon': True, 'token': 'S215'} |
| 2178 | 1 | association_task | {'task': 'reputation', 'workers': 1} |
| 2187 | 1 | donate | {} |

## Table 819789164  (maps ['1a', '1a'], Marine Worlds True; seat 0 = DanLisa, seat 1 = Vincent Koh)


### 819789164 turn 60 — ILLEGAL (first in this game)

**Error:** choose_effect {'card': 'S280'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1772 | Vincent Koh | getBonuses | Vincent Koh pays 2 xtoken for increasing card strength |
| 1773 | Vincent Koh | chooseActionCard | Vincent Koh chooses action card SponsorsII with strength 7 |
| 1778 | Vincent Koh | advanceBreak | Vincent Koh advances break token of 7 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1779 | Vincent Koh | getBonuses | Vincent Koh gains 1 xtoken (triggering break) |
| 1780 | Vincent Koh | getBonuses | Vincent Koh gains 14 money |
| 1782 | Vincent Koh | actionCardCleanup | Vincent Koh places action card Sponsors at position 1 (finishing action) |
| 1783 | Vincent Koh | discardTokens | Vincent Koh discards their Venom token |
| 1788 |  | startBreak | Starting a new break |
| 1793 | Vincent Koh | updateBreakDiscardSelection |  |
| 1795 | DanLisa | updateBreakDiscardSelection |  |
| 1796 | DanLisa | pDiscardCards | You discard Northern Giraffe, Moose, White Stork |
| 1798 | Vincent Koh | pDiscardCards | You discard Emu, Sea Turtle Tank, Expansion Area |
| 1803 |  | discardTokens | All tokens are removed from player cards |
| 1804 |  | slideMeeples | All workers go back to each player's reserve |
| 1805 |  | addMeeples | Replenishing partner zoos and universities |
| 1806 |  | discardCardsOnDisplay | Removing first two cards of the display: Llama, Collared Mangabey |
| 1807 |  | fillPool | The display is replenished with Blue mountains national park, Common Octopus |
| 1808 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Greater Rhea |
| 1809 |  | fillPool | The display is replenished with Reconstruction |
| 1814 | Vincent Koh | takeBonus | Vincent Koh gets 1 x Snapping (map bonus space) |
| 1818 | Vincent Koh | snapCard | Vincent Koh snaps Spokesperson from the display |
| 1822 | Vincent Koh | takeBonus | Vincent Koh gets 1 x size-2 (map bonus space) |
| 1826 | Vincent Koh | buyBuilding | Vincent Koh adds a size-2 enclosure for free |
| 1827 | Vincent Koh | getBonuses | Vincent Koh gains 1 money (Hydrologist) |
| 1828 | Vincent Koh | getBonuses | Vincent Koh gains 27 money (appeal income) |
| 1829 | Vincent Koh | getBonuses | Vincent Koh gains 3 money (kiosk income) |
| 1834 |  | fillPool | The display is replenished with (domestic) Goat |
| 1835 | DanLisa | takeBonus | DanLisa gets 5 x money (map bonus space) |
| 1836 | DanLisa | getBonuses | DanLisa gains 5 money (map bonus space) |
| 1840 | DanLisa | takeBonus | DanLisa gets 1 x Snapping (map bonus space) |
| 1844 | DanLisa | snapCard | DanLisa snaps Reconstruction from the display |
| 1848 | DanLisa | takeBonus | DanLisa gets 1 x bonus-sponsor (map bonus space) |
| 1852 | DanLisa | getBonuses | DanLisa pays 3 money for buying sponsor card |
| 1853 | DanLisa | playSponsor | DanLisa plays Reconstruction |
| 1863 | DanLisa | buyBuilding | DanLisa adds a Kiosk for free |
| 1867 | DanLisa | buyBuilding | DanLisa adds a pavilion for free |
| 1868 | DanLisa | getBonuses | DanLisa gains 1 appeal (building a pavilion) |
| 1872 | DanLisa | reconstructionRemove | DanLisa removes a size-1 enclosure (Reconstruction) |
| 1876 | DanLisa | reconstructionPlaceBack | DanLisa places back a size-1 enclosure (Reconstruction) |
| 1877 | DanLisa | getBonuses | DanLisa gains 23 money (appeal income) |
| 1878 | DanLisa | getBonuses | DanLisa gains 11 money (kiosk income) |
| 1879 | DanLisa | getBonuses | DanLisa gains 3 money (Federal Grants) |
| 1884 |  | finishBreak | End of the break |
| 1885 |  | fillPool | The display is replenished with Primatologist |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1773 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 2} |
| 1778 | 1 | sponsor_break | {} |
| 1796 | 0 | choose_effect | {'cards': ['A428', 'A442', 'A510']} |
| 1798 | 1 | choose_effect | {'cards': ['A514', 'S250', 'S272']} |
| 1818 | 1 | take_cards | {'mode': 'snap', 'card': 'S202'} |
| 1826 | 1 | place_building | {'type': 'size-2', 'x': 6, 'y': 7, 'rotation': 0} |
| 1828 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1829 | 1 | choose_effect | {'apply': 'income_kiosk'} |
| 1844 | 0 | take_cards | {'mode': 'snap', 'card': 'S280'} |
| 1853 | 0 | choose_effect | {'card': 'S280'} |
| 1863 | 0 | place_building | {'type': 'kiosk', 'x': 2, 'y': 11, 'rotation': 0} |
| 1867 | 0 | place_building | {'type': 'pavilion', 'x': 1, 'y': 12, 'rotation': 0} |
| 1872 | 1 | choose_effect | {'remove': [[7, 4]]} |
| 1876 | 1 | place_building | {'type': 'size-1', 'x': 1, 'y': 4, 'rotation': 0} |
| 1877 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1878 | 0 | choose_effect | {'apply': 'income_kiosk'} |
| 1879 | 0 | choose_effect | {'apply': 'income_sponsor', 'source': 'S220'} |

## Table 819962687  (maps ['14', '14'], Marine Worlds True; seat 0 = diaplekomenoc21, seat 1 = nuq043)


### 819962687 turn 64 — ILLEGAL (first in this game)

**Error:** mark an animal of the display that has no mark

| order | player | event | log text |
|---|---|---|---|
| 1835 | nuq043 | chooseActionCard | nuq043 chooses action card AnimalsII with strength 5 |
| 1836 | nuq043 | getBonuses | nuq043 gains 1 reputation (max strength Animals) |
| 1840 | nuq043 | buyAnimal | nuq043 plays Sharknose Goby for 7 and places it in the underwater tunnel |
| 1845 | nuq043 | getBonuses | nuq043 gains 2 appeal (Sharknose Goby) |
| 1849 | nuq043 | getBonuses | nuq043 gains 2 appeal (Orange Clownfish) |
| 1853 | nuq043 | getBonuses | nuq043 gains 2 appeal (Waza Special Assignment) |
| 1860 | nuq043 | buyAnimal | nuq043 plays Mountain Tapir for 15 and places it in a size-2 enclosure |
| 1861 | nuq043 | getBonuses | nuq043 gains 3 money (Expert In Herbivores) |
| 1865 | nuq043 | getBonuses | nuq043 gains 2 appeal (Meerkat Den) |
| 1869 | nuq043 | getBonuses | nuq043 gains 4 appeal (Mountain Tapir) |
| 1873 | nuq043 | getBonuses | nuq043 gains 2 appeal (Waza Special Assignment) |
| 1877 | nuq043 | getBonuses | nuq043 gains 1 conservation (Mountain Tapir) |
| 1879 | nuq043 | pDiscardCards | You dig Komodo Dragon from your hand |
| 1880 | nuq043 | pDrawCards | You draw Palette Surgeonfish from the deck |
| 1886 | nuq043 | pDiscardCards | You dig Sponsorship: Reptiles from your hand |
| 1887 | nuq043 | pDrawCards | You draw Caribbean Reef Shark from the deck |
| 1893 | nuq043 | actionCardCleanup | nuq043 places action card Animals at position 1 (finishing action) |
| 1897 | nuq043 | markCard | nuq043 marks Andean Condor from display |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1835 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1840 | 1 | play_animal | {'card': 'A535', 'from_display': False, 'x': 8, 'y': 1} |
| 1845 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1849 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1860 | 1 | play_animal | {'card': 'A440', 'from_display': False, 'x': 7, 'y': 2} |
| 1869 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1877 | 1 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 1879 | 1 | choose_effect | {'hand': 'A476'} |
| 1886 | 1 | choose_effect | {'hand': 'S232'} |
| 1897 | 1 | choose_effect | {'card': 'A504', 'mark': True} |

## Table 820206282  (maps ['4a', '4a'], Marine Worlds True; seat 0 = Moo81, seat 1 = duckmammal)


### 820206282 turn 61 — MISMATCH (first in this game)

**Error:** player 1, hand: only in the engine: P108

| order | player | event | log text |
|---|---|---|---|
| 1969 | duckmammal | getBonuses | duckmammal pays 1 xtoken for increasing card strength |
| 1970 | duckmammal | chooseActionCard | duckmammal chooses action card AnimalsII with strength 5 |
| 1971 | duckmammal | getBonuses | duckmammal gains 1 reputation (max strength Animals) |
| 1972 | duckmammal | takeBonus | duckmammal gets 1 x xtoken (reputation track bonus) |
| 1973 | duckmammal | getBonuses | duckmammal gains 1 xtoken (reputation track bonus) |
| 1977 | duckmammal | buyAnimal | duckmammal buys Frilled Lizard from display for 16 and places it in a size-2 enclosure |
| 1979 | duckmammal | pDrawCards | You draw Lesser Flamingo for sprint effect |
| 1987 | duckmammal | pDiscardCards | You sell Marine Research Expedition cards for 3 money |
| 1994 | duckmammal | getBonuses | duckmammal gains 2 appeal (Cable Car) |
| 1995 | duckmammal | getBonuses | duckmammal gains 5 appeal (Frilled Lizard) |
| 1999 | duckmammal | buyAnimal | duckmammal plays Proboscis Monkey for 32 and places it in a size-5 enclosure |
| 2007 | duckmammal | getBonuses | duckmammal gains 2 conservation (Proboscis Monkey) |
| 2011 | duckmammal | getBonuses | duckmammal gains 2 appeal (Cable Car) |
| 2012 | duckmammal | getBonuses | duckmammal gains 10 appeal (Proboscis Monkey) |
| 2014 | duckmammal | actionCardCleanup | duckmammal places action card Animals at position 1 (finishing action) |
| 2018 |  | fillPool | The display is replenished with Grizzly Bear |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1970 | 1 | choose_action_card | {'type': 'animals', 'spend': 1} |
| 1977 | 1 | play_animal | {'card': 'A491', 'from_display': True, 'x': 0, 'y': 7} |
| 1979 | 1 | choose_effect | {'activate': True} |
| 1987 | 1 | harbor_sell | {'card': 'S270'} |
| 1995 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1999 | 1 | play_animal | {'card': 'A451', 'from_display': False, 'x': 4, 'y': 3} |
| 2007 | 1 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 2012 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 820534913  (maps ['3a', '3a'], Marine Worlds True; seat 0 = 814607668zebra, seat 1 = quillll)


### 820534913 turn 56 — ILLEGAL (first in this game)

**Error:** choose_effect {'release': 'A554', 'building': [6, 5]} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1692 | 814607668zebra | chooseActionCard | 814607668zebra chooses action card AssociationI with strength 5 |
| 1696 | 814607668zebra | slideMeeples | 814607668zebra supports a conservation project on the second slot : Low Mountain Range |
| 1697 |  | slideMeeples |  |
| 1701 | 814607668zebra | releaseAnimal | 814607668zebra releases African Penguin into the wild and loses 6 appeal and frees the small aquarium |
| 1702 | 814607668zebra | getBonuses | 814607668zebra gains 5 money (map bonus space) |
| 1703 | 814607668zebra | getBonuses | 814607668zebra gains 4 conservation (Low Mountain Range) |
| 1710 | 814607668zebra | takeBonus | 814607668zebra gets 2 x reputation |
| 1711 | 814607668zebra | getBonuses | 814607668zebra gains 2 reputation |
| 1715 | 814607668zebra | takeBonus | 814607668zebra gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1717 | 814607668zebra | pDrawCards | You draw South American Coati from the deck |
| 1721 | 814607668zebra | takeBonus | 814607668zebra gets 1 x conservation (reputation track bonus) |
| 1722 | 814607668zebra | getBonuses | 814607668zebra gains 1 conservation (reputation track bonus) |
| 1726 | 814607668zebra | takeBonus | 814607668zebra triggers scoring card discard by reaching 10 conservation points |
| 1730 | 814607668zebra | pDiscardCards | You discard Aquatic Park (scoring card) |
| 1734 | quillll | pDiscardCards | You discard Architectural Zoo (scoring card) |
| 1740 | 814607668zebra | actionCardCleanup | 814607668zebra places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1692 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 1697 | 0 | association_task | {'task': 'conservation', 'project': 'P119', 'source': 'play', 'slot': 1, 'bonus': {'type': 'money', 'value': 5}} |
| 1701 | 0 | choose_effect | {'release': 'A554', 'building': [6, 5]} |
| 1710 | 0 | choose_effect | {'bonus_type': 'reputation', 'n': 2} |
| 1717 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1730 | 0 | choose_effect | {'card': 'F011'} |
| 1734 | 1 | choose_effect | {'card': 'F004'} |

## Table 821574238  (maps ['5', '5'], Marine Worlds True; seat 0 = pro-fesor, seat 1 = serenaiai)


### 821574238 turn 18 — ILLEGAL (first in this game)

**Error:** choose_effect {'building': [7, 4], 'x': 7, 'y': 4, 'rotation': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 490 | serenaiai | chooseActionCard | serenaiai chooses action card SponsorsII with strength 5 |
| 494 | serenaiai | playSponsor | serenaiai plays Conference On Australia |
| 503 | serenaiai | increaseSize | serenaiai increase the size of a a size-4 enclosure |
| 506 | serenaiai | actionCardCleanup | serenaiai places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 490 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 494 | 1 | play_sponsor | {'card': 'S269', 'from_display': False} |
| 503 | 1 | choose_effect | {'building': [7, 4], 'x': 7, 'y': 4, 'rotation': 1} |

### 821574238 turn 77 — ILLEGAL (later; may be a consequence)

**Error:** choose_effect {'building': [2, 9], 'x': 2, 'y': 11, 'rotation': 0} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2213 | serenaiai | chooseActionCard | serenaiai chooses action card AnimalsII with strength 5 |
| 2214 | serenaiai | getBonuses | serenaiai gains 1 reputation (max strength Animals) |
| 2215 | serenaiai | takeBonus | serenaiai gets 1 x xtoken (reputation track bonus) |
| 2216 | serenaiai | getBonuses | serenaiai gains 1 xtoken (reputation track bonus) |
| 2220 | serenaiai | buyAnimal | serenaiai plays Galapagos Giant Tortoise for 27 and places it in a size-3 enclosure |
| 2224 | serenaiai | getBonuses | serenaiai gains 2 conservation (Galapagos Giant Tortoise) |
| 2231 | serenaiai | takeBonus | serenaiai gets 1 x Partner-Zoo (maxing out reputation) |
| 2238 | serenaiai | slideMeeples |  |
| 2245 | serenaiai | increaseSize | serenaiai increase the size of a a size-3 enclosure |
| 2246 | serenaiai | getBonuses | serenaiai gains 2 appeal (Conference On Australia) |
| 2247 | serenaiai | getBonuses | serenaiai gains 2 conservation (partner zoo) |
| 2251 | serenaiai | getBonuses | serenaiai gains 8 appeal (Galapagos Giant Tortoise) |
| 2255 | serenaiai | getBonuses | serenaiai pays <MONEY:2> to gain <APPEAL:1> (Animals3 ability) |
| 2257 | serenaiai | pDiscardCards | You sell Small Animals, Wolverine, Golden Snub-nosed Monkey, Indian Peafowl cards for 16 money |
| 2264 | serenaiai | buyAnimal | serenaiai buys Malayan Tapir from display for 16 and places it in a size-2 enclosure |
| 2268 | serenaiai | getBonuses | serenaiai gains 1 appeal (maxing out reputation) |
| 2272 | serenaiai | getBonuses | serenaiai gains 5 appeal (Malayan Tapir) |
| 2279 | serenaiai | buyBuilding | serenaiai adds a pavilion for free |
| 2280 | serenaiai | getBonuses | serenaiai gains 1 appeal (building a pavilion) |
| 2284 | serenaiai | getBonuses | serenaiai pays <MONEY:2> to gain <APPEAL:1> (Animals3 ability) |
| 2289 | serenaiai | actionCardCleanup | serenaiai places action card Animals at position 1 (finishing action) |
| 2291 |  | fillPool | The display is replenished with Talented Communicator |
| 2293 | pro-fesor | getBonuses | pro-fesor gains 5 appeal (Engineer) |
| 2294 | pro-fesor | getBonuses | pro-fesor gains 1 conservation (Foreign Institute) |
| 2295 | pro-fesor | getBonuses | pro-fesor gains 1 conservation (Excavation Site) |
| 2296 | pro-fesor | getBonuses | pro-fesor gains 3 conservation (International Zoo) |
| 2297 | serenaiai | getBonuses | serenaiai gains 3 conservation (Sponsored Zoo) |
| 2298 | pro-fesor | finalScoring | pro-fesor has 85<APPEAL> and scores 39 for having 21<CONSERVATION>. pro-fesor scores 124. |
| 2299 | serenaiai | finalScoring | serenaiai has 69<APPEAL> and scores 48 for having 24<CONSERVATION>. serenaiai scores 117. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2213 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 2220 | 1 | play_animal | {'card': 'A481', 'from_display': False, 'x': 2, 'y': 9} |
| 2224 | 1 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 2231 | 1 | choose_effect | {'bonus_type': 'Partner-Zoo', 'n': 1} |
| 2238 | 1 | choose_effect | {'partner': 'Australia'} |
| 2245 | 1 | choose_effect | {'building': [2, 9], 'x': 2, 'y': 11, 'rotation': 0} |
| 2251 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2255 | 1 | choose_effect | {'apply': 'pay_appeal'} |
| 2257 | 1 | choose_effect | {'cards': ['A501', 'A555', 'A556', 'P130']} |
| 2264 | 1 | play_animal | {'card': 'A435', 'from_display': True, 'x': 7, 'y': 0} |
| 2272 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2279 | 1 | place_building | {'type': 'pavilion', 'x': 4, 'y': 11, 'rotation': 0} |
| 2284 | 1 | choose_effect | {'apply': 'pay_appeal'} |

## Table 821934642  (maps ['7a', '7a'], Marine Worlds True; seat 0 = lipu_ding, seat 1 = yazavats)


### 821934642 turn 29 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'snap', 'card': 'A518'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 944 | lipu_ding | chooseActionCard | lipu_ding chooses action card AnimalsII with strength 3 |
| 948 | lipu_ding | buyAnimal | lipu_ding plays Ecuadorian Squirrel Monkey for 12 and places it in a size-2 enclosure |
| 949 | lipu_ding | getBonuses | lipu_ding gains 5 appeal (Ecuadorian Squirrel Monkey) |
| 965 | lipu_ding | snapCard | lipu_ding snaps Lesser Bird-of-paradise from the display |

**Engine actions derived from the log:**

_no cleanup_


## Table 822218187  (maps ['1a', '1a'], Marine Worlds True; seat 0 = Phil_I27, seat 1 = Squirtle_)


### 822218187 turn 55 — ILLEGAL (first in this game)

**Error:** choose_effect {'apply': 'gain', 'res': 'reputation'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1492 | Phil_I27 | chooseActionCard | Phil_I27 chooses action card AnimalsI with strength 5 |
| 1496 | Phil_I27 | discardTokens | Phil_I27 uses 3 x bonus-ignore-conditions |
| 1497 | Phil_I27 | buyAnimal | Phil_I27 plays Coastal Manta Ray for 23 and places it in the large aquarium, the small aquarium |
| 1503 | Phil_I27 | pDiscardCards | You discard Humphead Wrasse for a total of 1 <SEAANIMAL> (Glide effect) |
| 1513 | Phil_I27 | buyBuilding | Phil_I27 adds a Kiosk for free |
| 1517 | Phil_I27 | getBonuses | Phil_I27 gains 1 conservation (Coastal Manta Ray) |
| 1521 | Phil_I27 | takeBonus | Phil_I27 gets 1 x Multiplier |
| 1525 | Phil_I27 | addMeeples | Phil_I27 adds a multiplier token on action card SponsorsII |
| 1529 | Phil_I27 | getBonuses | Phil_I27 gains 1 reputation (Coastal Manta Ray) |
| 1539 | Phil_I27 | discardCardsOnDisplay | Phil_I27 sends Primatologist away to an expedition |
| 1540 | Phil_I27 | getBonuses | Phil_I27 gains 1 conservation (Marine Research Expedition) |
| 1541 | Phil_I27 | getBonuses | Phil_I27 gains 8 appeal (Coastal Manta Ray) |
| 1548 | Phil_I27 | actionCardCleanup | Phil_I27 places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1492 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1497 | 0 | play_animal | {'card': 'A543', 'from_display': False, 'x': 3, 'y': 4} |
| 1503 | 0 | choose_effect | {'cards': ['A542']} |
| 1513 | 0 | place_building | {'type': 'kiosk', 'x': 0, 'y': 3, 'rotation': 0} |
| 1517 | 0 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 1521 | 0 | choose_effect | {'bonus_type': 'Multiplier', 'n': 1} |
| 1525 | 0 | choose_effect | {'multiplier': 'sponsors'} |
| 1529 | 0 | choose_effect | {'apply': 'gain', 'res': 'reputation'} |
| 1539 | 0 | choose_effect | {'send': 'S236'} |
| 1541 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 823017370  (maps ['8a', '8a'], Marine Worlds True; seat 0 = AtlasKuma, seat 1 = Dustyyy)


### 823017370 turn 40 — MISMATCH (first in this game)

**Error:** placements after move 137: size-3: engine-only [(0, 1, 0), (0, 3, 4), (0, 7, 5)] bga-only []; placements after move 138: size-1: engine-only [(0, 3, 0), (1, 8, 0), (2, 3, 0)] bga-only []

| order | player | event | log text |
|---|---|---|---|
| 988 | Dustyyy | chooseActionCard | Dustyyy chooses action card BuildII with strength 4 |
| 992 | Dustyyy | buyBuilding | Dustyyy pays 2 for building a Kiosk |
| 993 | Dustyyy | getBonuses | Dustyyy gains 1 money (Hydrologist) |
| 997 | Dustyyy | buyBuilding | Dustyyy pays 2 for building a pavilion |
| 998 | Dustyyy | getBonuses | Dustyyy gains 1 appeal (building a pavilion) |
| 999 | Dustyyy | getBonuses | Dustyyy gains 1 money (Hydrologist) |
| 1005 | Dustyyy | buyBuilding | Dustyyy pays 4 for building the small aquarium |
| 1006 | Dustyyy | getBonuses | Dustyyy gains 5 money (placement bonus) |
| 1007 | Dustyyy | getBonuses | Dustyyy gains 2 money (Hydrologist) |
| 1010 | Dustyyy | actionCardCleanup | Dustyyy places action card Build at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 988 | 1 | choose_action_card | {'type': 'build', 'spend': 0} |
| 992 | 1 | place_building | {'type': 'kiosk', 'x': 2, 'y': 1, 'rotation': 0} |
| 997 | 1 | place_building | {'type': 'pavilion', 'x': 3, 'y': 2, 'rotation': 0} |
| 1005 | 1 | place_building | {'type': 'small-aquarium', 'x': 1, 'y': 2, 'rotation': 2} |

## Table 826568675  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = juice hua, seat 1 = fireflys)


### 826568675 turn 67 — MISMATCH (first in this game)

**Error:** player 0, appeal: engine 113, replay 114

| order | player | event | log text |
|---|---|---|---|
| 2206 | juice hua | pDiscardCards | You discard Science Institute for Map T1 effect |

**Engine actions derived from the log:**

_(no plan: )_


## Table 828008788  (maps ['4a', '4a'], Marine Worlds True; seat 0 = cun guang, seat 1 = Kaisilton23)


### 828008788 turn 59 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'deck', 'count': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1736 | cun guang | getBonuses | cun guang pays 2 xtoken for increasing card strength |
| 1737 | cun guang | chooseActionCard | cun guang chooses action card SponsorsII with strength 5 |
| 1742 | cun guang | advanceBreak | cun guang advances break token of 5 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1743 | cun guang | getBonuses | cun guang gains 1 xtoken (triggering break) |
| 1744 | cun guang | getBonuses | cun guang gains 10 money |
| 1746 | cun guang | actionCardCleanup | cun guang places action card Sponsors at position 1 (finishing action) |
| 1747 | cun guang | discardTokens | cun guang discards their Constriction token |
| 1752 |  | startBreak | Starting a new break |
| 1754 |  | discardTokens | All tokens are removed from player cards |
| 1755 |  | slideMeeples | All workers go back to each player's reserve |
| 1756 |  | addMeeples | Replenishing partner zoos and universities |
| 1757 |  | discardCardsOnDisplay | Removing first two cards of the display: Australian Sea Lion, Marabou |
| 1758 |  | fillPool | The display is replenished with Coastal Manta Ray, Sea Turtle Tank |
| 1759 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Publications |
| 1760 |  | fillPool | The display is replenished with Spotted Hyena Compound |
| 1765 | cun guang | takeBonus | cun guang gets 1 x size-2 (map bonus space) |
| 1769 | cun guang | buyBuilding | cun guang adds a size-2 enclosure for free |
| 1773 | cun guang | getBonuses | cun guang pays 5 money for buying sponsor card |
| 1774 | cun guang | playSponsor | cun guang plays Science Lab |
| 1776 | cun guang | pDrawCards | You draw Stoat from the deck |
| 1787 | cun guang | pDrawCards | You draw Caribbean Reef Shark from the deck |
| 1798 | cun guang | getBonuses | cun guang gains 23 money (appeal income) |
| 1801 | cun guang | getBonuses | cun guang gains 3 money (Federal Grants) |
| 1802 | cun guang | takeBonus | cun guang gets 1 x Snapping (map bonus space) |
| 1806 | cun guang | snapCard | cun guang snaps American Whitespotted Filefish from the display |
| 1811 |  | fillPool | The display is replenished with Quarantine Lab |
| 1812 | Kaisilton23 | takeBonus | Kaisilton23 gets 5 x money (map bonus space) |
| 1813 | Kaisilton23 | getBonuses | Kaisilton23 gains 5 money (map bonus space) |
| 1814 | Kaisilton23 | getBonuses | Kaisilton23 gains 25 money (appeal income) |
| 1815 | Kaisilton23 | getBonuses | Kaisilton23 gains 6 money (kiosk income) |
| 1821 |  | finishBreak | End of the break |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1737 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 2} |
| 1742 | 0 | sponsor_break | {} |
| 1769 | 0 | place_building | {'type': 'size-2', 'x': 1, 'y': 2, 'rotation': 1} |
| 1774 | 0 | choose_effect | {'card': 'S201'} |
| 1776 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1787 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1798 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1801 | 0 | choose_effect | {'apply': 'income_sponsor', 'source': 'S220'} |
| 1806 | 0 | take_cards | {'mode': 'snap', 'card': 'A539'} |
| 1814 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1815 | 1 | choose_effect | {'apply': 'income_kiosk'} |

## Table 830949460  (maps ['2a', '2a'], Marine Worlds True; seat 0 = ROSEALLENzwt, seat 1 = vxc606)


### 830949460 turn 54 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'range', 'card': 'A478'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1448 | vxc606 | getBonuses | vxc606 pays 2 xtoken for increasing card strength |
| 1449 | vxc606 | chooseActionCard | vxc606 chooses action card SponsorsII with strength 7 |
| 1454 | vxc606 | advanceBreak | vxc606 advances break token of 7 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1455 | vxc606 | getBonuses | vxc606 gains 1 xtoken (triggering break) |
| 1456 | vxc606 | getBonuses | vxc606 gains 14 money |
| 1458 | vxc606 | actionCardCleanup | vxc606 places action card Sponsors at position 1 (finishing action) |
| 1463 |  | startBreak | Starting a new break |
| 1468 | ROSEALLENzwt | updateBreakDiscardSelection |  |
| 1470 | vxc606 | updateBreakDiscardSelection |  |
| 1471 | vxc606 | pDiscardCards | You discard Common Octopus |
| 1473 | ROSEALLENzwt | pDiscardCards | You discard Northern Plains Gray Langur, Great Hornbill, Komodo Dragon |
| 1478 |  | discardTokens | All tokens are removed from player cards |
| 1479 |  | slideMeeples | All workers go back to each player's reserve |
| 1480 |  | addMeeples | Replenishing partner zoos and universities |
| 1481 |  | discardCardsOnDisplay | Removing first two cards of the display: Waza Large Animal Program |
| 1482 | vxc606 | markAssign | Australian Sea Lion is not discarded and given to vxc606 (Mark effect) |
| 1483 |  | fillPool | The display is replenished with Indian Rock Python, Chinese Water Dragon |
| 1485 | vxc606 | takeBonus | vxc606 gets 5 x money (map bonus space) |
| 1486 | vxc606 | getBonuses | vxc606 gains 5 money (map bonus space) |
| 1494 | vxc606 | getBonuses | vxc606 gains 22 money (appeal income) |
| 1496 | vxc606 | getBonuses | vxc606 gains 2 money (kiosk income) |
| 1498 | vxc606 | getBonuses | vxc606 gains 8 money (Side Entrance) |
| 1499 | vxc606 | takeBonus | vxc606 gets 1 x Snapping (map bonus space) |
| 1504 | vxc606 | snapCard | vxc606 snaps Amazon House from the display |
| 1509 |  | fillPool | The display is replenished with Baboon Rock |
| 1513 | ROSEALLENzwt | takeBonus | ROSEALLENzwt gets 1 x Snapping (map bonus space) |
| 1517 | ROSEALLENzwt | snapCard | ROSEALLENzwt snaps Polar Bear Exhibit from the display |
| 1521 | ROSEALLENzwt | takeBonus | ROSEALLENzwt gets 1 x size-2 (map bonus space) |
| 1525 | ROSEALLENzwt | buyBuilding | ROSEALLENzwt adds a size-2 enclosure for free |
| 1529 | ROSEALLENzwt | getBonuses | ROSEALLENzwt pays 5 money for buying sponsor card |
| 1530 | ROSEALLENzwt | playSponsor | ROSEALLENzwt plays Science Lab |
| 1534 | ROSEALLENzwt | snapCard | ROSEALLENzwt takes Indian Rock Python in reputation range from the display |
| 1541 | ROSEALLENzwt | snapCard | ROSEALLENzwt takes Chinese Water Dragon in reputation range from the display |
| 1542 | ROSEALLENzwt | getBonuses | ROSEALLENzwt gains 22 money (appeal income) |
| 1543 | ROSEALLENzwt | getBonuses | ROSEALLENzwt gains 4 money (kiosk income) |
| 1548 |  | finishBreak | End of the break |
| 1549 |  | fillPool | The display is replenished with Rhesus Monkey Park, Guinea Pig, Mangalica |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1449 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 2} |
| 1454 | 1 | sponsor_break | {} |
| 1471 | 1 | choose_effect | {'cards': ['A549']} |
| 1473 | 0 | choose_effect | {'cards': ['A462', 'A476', 'A502']} |
| 1494 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1496 | 1 | choose_effect | {'apply': 'income_kiosk'} |
| 1498 | 1 | choose_effect | {'apply': 'income_sponsor', 'source': 'S257'} |
| 1504 | 1 | take_cards | {'mode': 'snap', 'card': 'S278'} |
| 1517 | 0 | take_cards | {'mode': 'snap', 'card': 'S251'} |
| 1525 | 0 | place_building | {'type': 'size-2', 'x': 8, 'y': 1, 'rotation': 1} |
| 1530 | 0 | choose_effect | {'card': 'S201'} |
| 1534 | 0 | take_cards | {'mode': 'range', 'card': 'A474'} |
| 1541 | 0 | take_cards | {'mode': 'range', 'card': 'A478'} |
| 1542 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1543 | 0 | choose_effect | {'apply': 'income_kiosk'} |

## Table 831125835  (maps ['6a', '6a'], Marine Worlds True; seat 0 = Beeeater, seat 1 = mymcookie)


### 831125835 turn 63 — ILLEGAL (first in this game)

**Error:** play_animal {'card': 'A411', 'from_display': False, 'x': 5, 'y': 4} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1736 | mymcookie | getBonuses | mymcookie pays 1 xtoken for increasing card strength |
| 1737 | mymcookie | chooseActionCard | mymcookie chooses action card AnimalsII with strength 5 |
| 1738 | mymcookie | getBonuses | mymcookie gains 1 reputation (max strength Animals) |
| 1739 | mymcookie | takeBonus | mymcookie gets 1 x conservation (reputation track bonus) |
| 1740 | mymcookie | getBonuses | mymcookie gains 1 conservation (reputation track bonus) |
| 1744 | mymcookie | buyAnimal | mymcookie plays Short-snouted Seahorse for 7 and places it in the large aquarium |
| 1750 | mymcookie | pDiscardCards | You pouch Wolverine cards for 2 appeal |
| 1754 | mymcookie | getBonuses | mymcookie gains 2 appeal (Short-snouted Seahorse) |
| 1758 | mymcookie | buyAnimal | mymcookie plays Grizzly Bear for 19 and places it in a size-5 enclosure |
| 1762 | mymcookie | getBonuses | mymcookie gains 4 money (Explorer) |
| 1763 | mymcookie | getBonuses | mymcookie gains 2 appeal (Explorer) |
| 1767 | mymcookie | slideMeeples | mymcookie gains a new Association worker |
| 1771 | Beeeater | getBonuses | Beeeater gains 2 appeal (Polar Bear Exhibit) |
| 1776 | mymcookie | getBonuses | mymcookie gains 2 xtoken (Inventive) |
| 1777 | mymcookie | getBonuses | mymcookie gains 9 appeal (Grizzly Bear) |
| 1779 | mymcookie | actionCardCleanup | mymcookie places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1737 | 1 | choose_action_card | {'type': 'animals', 'spend': 1} |
| 1744 | 1 | play_animal | {'card': 'A548', 'from_display': False, 'x': 4, 'y': 11} |
| 1750 | 1 | choose_effect | {'card': 'A556', 'psrc': 'A548'} |
| 1754 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1758 | 1 | play_animal | {'card': 'A411', 'from_display': False, 'x': 5, 'y': 4} |
| 1776 | 1 | choose_effect | {'apply': 'gain', 'res': 'xtoken'} |
| 1777 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 832292660  (maps ['2a', '2a'], Marine Worlds True; seat 0 = MottyPT, seat 1 = bbbao)


### 832292660 turn 49 — MISMATCH (first in this game)

**Error:** player 1, money: engine 46, replay 43

| order | player | event | log text |
|---|---|---|---|
| 1425 | bbbao | getBonuses | bbbao pays 2 xtoken for increasing card strength |
| 1426 | bbbao | chooseActionCard | bbbao chooses action card SponsorsII with strength 7 |
| 1430 | bbbao | playSponsor | bbbao plays Adventure Playground |
| 1434 | bbbao | getBonuses | bbbao gains 4 appeal (Adventure Playground) |
| 1438 | bbbao | buyBuilding | bbbao adds a unique building for free |
| 1439 | bbbao | getBonuses | bbbao gains 2 money (Geologist) |
| 1443 | bbbao | snapCard | bbbao takes Herbivore breeding program in reputation range from the display |
| 1447 | bbbao | playSponsor | bbbao plays Expert On Asia |
| 1451 | bbbao | getBonuses | bbbao gains 3 appeal (Expert On Asia) |
| 1460 | bbbao | buyBuilding | bbbao adds a pavilion for free |
| 1461 | bbbao | getBonuses | bbbao gains 1 appeal (building a pavilion) |
| 1462 | bbbao | getBonuses | bbbao gains 1 money (Geologist) |

**Engine actions derived from the log:**

_no cleanup_


### 832292660 turn 55 — MISMATCH (later; may be a consequence)

**Error:** player 1, hand: only in the replay: S266; main deck: only in the engine: A542, A417; main discard: only in the replay: A402

| order | player | event | log text |
|---|---|---|---|
| 1615 | bbbao | chooseActionCard | bbbao chooses action card AnimalsII with strength 5 |
| 1616 | bbbao | getBonuses | bbbao gains 1 reputation (max strength Animals) |
| 1617 | bbbao | takeBonus | bbbao gets 1 x xtoken (reputation track bonus) |
| 1618 | bbbao | getBonuses | bbbao gains 1 xtoken (reputation track bonus) |
| 1622 | bbbao | buyAnimal | bbbao plays European Badger for 2 and places it in a size-2 enclosure |
| 1623 | bbbao | getBonuses | bbbao gains 3 appeal (European Badger) |
| 1627 | bbbao | buyAnimal | bbbao plays Zooplankton for 4 and places it in the large aquarium |
| 1631 | bbbao | getBonuses | bbbao gains 1 appeal (Zooplankton) |
| 1632 | bbbao | sponsorMagnet | bbbao takes Marine Biologist from the display (Sea animal magnet effect) |
| 1634 | bbbao | actionCardCleanup | bbbao places action card Animals at position 1 (finishing action) |
| 1641 | bbbao | markCard | bbbao marks Llama from display |
| 1645 | bbbao | actionCardCleanup | bbbao places Animals at position 5 (Boost effect) |
| 1649 |  | fillPool | The display is replenished with Humphead Wrasse |
| 1650 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Lion |
| 1651 |  | fillPool | The display is replenished with Wolf |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1615 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1622 | 1 | play_animal | {'card': 'A419', 'from_display': False, 'x': 7, 'y': 2} |
| 1623 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1627 | 1 | play_animal | {'card': 'A532', 'from_display': False, 'x': 2, 'y': 7} |
| 1631 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1632 | 1 | magnet_note | {'ability': 'Sea Animal Magnet'} |
| 1641 | 1 | choose_effect | {'card': 'A439', 'mark': True} |
| 1645 | 1 | choose_effect | {'boost': 'animals', 'position': 5} |

## Table 832548511  (maps ['7a', '7a'], Marine Worlds False; seat 0 = wouter106, seat 1 = 33Sw33n3y)


### 832548511 turn 58 — ILLEGAL (first in this game)

**Error:** choose_effect {'bonus_type': 'reputation', 'n': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1507 | wouter106 | getBonuses | wouter106 pays 2 xtoken for increasing card strength |
| 1508 | wouter106 | chooseActionCard | wouter106 chooses action card BuildII with strength 7 |
| 1515 | wouter106 | buyBuilding | wouter106 pays 6 for building a size-3 enclosure |
| 1516 | wouter106 | getBonuses | wouter106 gains 1 reputation (placement bonus) |
| 1517 | wouter106 | takeBonus | wouter106 gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1521 | wouter106 | snapCard | wouter106 takes Sponsorship: Lions in reputation range from the display |
| 1525 | wouter106 | buyBuilding | wouter106 pays 8 for building a size-4 enclosure |
| 1532 | wouter106 | buyBuilding | wouter106 adds a Kiosk for free |
| 1536 | wouter106 | takeBonus | wouter106 gets 1 x reputation |
| 1537 | wouter106 | getBonuses | wouter106 gains 1 reputation |
| 1538 | wouter106 | takeBonus | wouter106 gets 1 x conservation (reputation track bonus) |
| 1539 | wouter106 | getBonuses | wouter106 gains 1 conservation (reputation track bonus) |
| 1543 | wouter106 | takeBonus | wouter106 gets 1 x Partner-Zoo |
| 1547 | wouter106 | slideMeeples |  |
| 1551 | wouter106 | upgradeCard | wouter106 upgrades AssociationII |
| 1556 | wouter106 | actionCardCleanup | wouter106 places action card Build at position 1 (finishing action) |
| 1560 |  | fillPool | The display is replenished with Mantled Guereza |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1508 | 0 | choose_action_card | {'type': 'build', 'spend': 2} |
| 1515 | 0 | place_building | {'type': 'size-3', 'x': 1, 'y': 2, 'rotation': 5} |
| 1521 | 0 | take_cards | {'mode': 'range', 'card': 'S234'} |
| 1525 | 0 | place_building | {'type': 'size-4', 'x': 0, 'y': 5, 'rotation': 1} |
| 1532 | 0 | place_building | {'type': 'kiosk', 'x': 3, 'y': 0, 'rotation': 0} |
| 1536 | 0 | choose_effect | {'bonus_type': 'reputation', 'n': 1} |
| 1543 | 0 | choose_effect | {'bonus_type': 'Partner-Zoo', 'n': 1} |
| 1547 | 0 | choose_effect | {'partner': 'Australia'} |
| 1551 | 0 | choose_effect | {'upgrade': 'association'} |

## Table 834011827  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = Zucchini rosti, seat 1 = lyizh)


### 834011827 turn 71 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'take', 'source': 'bonus', 'optional': False, 'player': 0}]

| order | player | event | log text |
|---|---|---|---|
| 1952 | Zucchini rosti | chooseActionCard | Zucchini rosti chooses action card AssociationI with strength 5 |
| 1956 | Zucchini rosti | slideMeeples | Zucchini rosti supports a conservation project on the first slot : Africa |
| 1957 | Zucchini rosti | moveProjects | Zucchini rosti plays a new conservation project: Africa |
| 1958 |  | slideMeeples |  |
| 1962 | Zucchini rosti | getBonuses | Zucchini rosti gains 3 appeal (maxing out reputation) |
| 1963 | Zucchini rosti | getBonuses | Zucchini rosti gains 5 conservation (Africa) |
| 1965 | Zucchini rosti | actionCardCleanup | Zucchini rosti places action card Association at position 1 (finishing action) |
| 1968 | Zucchini rosti | getBonuses | Zucchini rosti gains 4 conservation (Accessible Zoo) |
| 1969 | lyizh | getBonuses | lyizh gains 1 conservation (Federal Grants) |
| 1970 | lyizh | getBonuses | lyizh gains 1 conservation (Aquarium) |
| 1971 | lyizh | getBonuses | lyizh gains 2 conservation (Conservation Zoo) |
| 1972 | Zucchini rosti | finalScoring | Zucchini rosti has 62<APPEAL> and scores 45 for having 23<CONSERVATION>. Zucchini rosti scores 107. |
| 1973 | lyizh | finalScoring | lyizh has 79<APPEAL> and scores 39 for having 21<CONSERVATION>. lyizh scores 118. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1952 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 1958 | 0 | association_task | {'task': 'conservation', 'project': 'P103', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |

## Table 835808481  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = Emu At Dusk, seat 1 = nfd560)


### 835808481 turn 51 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'range', 'card': 'A544'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1348 | Emu At Dusk | pDiscardCards | You discard Great Hornbill for Map T1 effect |

**Engine actions derived from the log:**

_(no plan: )_


## Table 836560387  (maps ['13', '13'], Marine Worlds True; seat 0 = weicuiwqh, seat 1 = BEX9)


### 836560387 turn 24 — ILLEGAL (first in this game)

**Error:** play a sponsor first (or take the break option)

| order | player | event | log text |
|---|---|---|---|
| 572 | BEX9 | chooseActionCard | BEX9 chooses action card SponsorsII with strength 3 |
| 579 | BEX9 | getBonuses | BEX9 trades 1<XTOKEN> for <REPUTATION:1> (Trade effect) |
| 583 | BEX9 | upgradeCard | BEX9 upgrades BuildII |
| 588 | BEX9 | advanceBreak | BEX9 advances break token of 3 space(s), now at 5/9 |
| 589 | BEX9 | getBonuses | BEX9 gains 6 money |
| 591 | BEX9 | actionCardCleanup | BEX9 places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 572 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 579 | 1 | sponsor_side | {'op': 'rep_x'} |
| 583 | 1 | choose_effect | {'upgrade': 'build'} |
| 588 | 1 | sponsor_break | {} |

## Table 837033009  (maps ['8a', '8a'], Marine Worlds True; seat 0 = mjp_xX, seat 1 = portgard)


### 837033009 turn 66 — ILLEGAL (first in this game)

**Error:** choose_effect {'bonus_type': 'reputation', 'n': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1737 | mjp_xX | chooseActionCard | mjp_xX chooses action card CardsII with strength 5 |
| 1739 | mjp_xX | advanceBreak | mjp_xX advances break token of 2 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1740 | mjp_xX | getBonuses | mjp_xX gains 1 xtoken (triggering break) |
| 1742 | mjp_xX | pDrawCards | You draw Caribbean Reef Shark from the deck |
| 1747 | mjp_xX | pDrawCards | You draw Guineafowl Puffer from the deck |
| 1752 | mjp_xX | pDrawCards | You draw Technology Institute from the deck |
| 1757 | mjp_xX | pDrawCards | You draw Leopard from the deck |
| 1762 | mjp_xX | pDiscardCards | You discard Leopard |
| 1767 | mjp_xX | actionCardCleanup | mjp_xX places action card Cards at position 1 (finishing action) |
| 1772 |  | startBreak | Starting a new break |
| 1775 | mjp_xX | updateBreakDiscardSelection |  |
| 1776 | mjp_xX | pDiscardCards | You discard Conference On Australia, Technology Institute, Hydrologist |
| 1781 |  | discardTokens | All tokens are removed from player cards |
| 1782 |  | slideMeeples | All workers go back to each player's reserve |
| 1783 |  | addMeeples | Replenishing partner zoos and universities |
| 1784 |  | discardCardsOnDisplay | Removing first two cards of the display: Expert On Australia |
| 1785 | portgard | markAssign | Indian Rock Python is not discarded and given to portgard (Mark effect) |
| 1786 |  | fillPool | The display is replenished with Explorer, Senegal Bushbaby |
| 1795 | mjp_xX | getBonuses | mjp_xX gains 22 money (appeal income) |
| 1797 | mjp_xX | getBonuses | mjp_xX gains 2 money (kiosk income) |
| 1799 | mjp_xX | getBonuses | mjp_xX gains 6 money (Sponsorship: Vultures) |
| 1803 | mjp_xX | takeBonus | mjp_xX gets 1 x size-2 (map bonus space) |
| 1810 | mjp_xX | buyBuilding | mjp_xX adds a size-2 enclosure for free |
| 1811 | mjp_xX | takeBonus | mjp_xX gets 1 x Snapping (map bonus space) |
| 1815 | mjp_xX | snapCard | mjp_xX snaps Explorer from the display |
| 1820 |  | fillPool | The display is replenished with Australian Sea Lion |
| 1825 | portgard | takeBonus | portgard gets 1 x Snapping (map bonus space) |
| 1829 | portgard | snapCard | portgard snaps Dusky-leaf Monkey from the display |
| 1833 | portgard | takeBonus | portgard gets 1 x size-2 (map bonus space) |
| 1837 | portgard | buyBuilding | portgard adds a size-2 enclosure for free |
| 1838 | portgard | getBonuses | portgard gains 1 xtoken (placement bonus) |
| 1842 | portgard | takeBonus | portgard gets 1 x reputation |
| 1848 | portgard | getBonuses | portgard gains 1 appeal (maxing out reputation) |
| 1849 | portgard | getBonuses | portgard gains 23 money (appeal income) |
| 1850 | portgard | getBonuses | portgard gains 8 money (kiosk income) |
| 1851 | portgard | getBonuses | portgard gains 1 money (Franchise Business) |
| 1854 |  | finishBreak | End of the break |
| 1855 |  | fillPool | The display is replenished with Sharknose Goby |
| 1856 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Marine Biologist |
| 1857 |  | fillPool | The display is replenished with Landscape Gardener |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1737 | 0 | choose_action_card | {'type': 'cards', 'spend': 0} |
| 1742 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1747 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1752 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1757 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1762 | 0 | discard_cards | {'cards': ['A403']} |
| 1776 | 0 | choose_effect | {'cards': ['S209', 'S241', 'S269']} |
| 1795 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1797 | 0 | choose_effect | {'apply': 'income_kiosk'} |
| 1799 | 0 | choose_effect | {'apply': 'income_sponsor', 'source': 'S233'} |
| 1810 | 0 | place_building | {'type': 'size-2', 'x': 8, 'y': 5, 'rotation': 0} |
| 1815 | 0 | take_cards | {'mode': 'snap', 'card': 'S262'} |
| 1829 | 1 | take_cards | {'mode': 'snap', 'card': 'A460'} |
| 1837 | 1 | place_building | {'type': 'size-2', 'x': 3, 'y': 0, 'rotation': 1} |
| 1842 | 1 | choose_effect | {'bonus_type': 'reputation', 'n': 1} |
| 1849 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1850 | 1 | choose_effect | {'apply': 'income_kiosk'} |
| 1851 | 1 | choose_effect | {'apply': 'income_sponsor', 'source': 'S265'} |

### 837033009 turn 74 — ILLEGAL (later; may be a consequence)

**Error:** association_task {'task': 'conservation', 'project': 'P108', 'source': 'play'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2138 | portgard | chooseActionCard | portgard chooses action card AssociationI with strength 5 |
| 2144 | portgard | slideMeeples | portgard supports a conservation project on the second slot : Primates |
| 2145 | portgard | discardTokens | portgard uses 2 token(s) from sponsor card(s) and 1 x bonus-icon |
| 2146 |  | slideMeeples |  |
| 2147 | portgard | getBonuses | portgard gains 3 xtoken (map bonus space) |
| 2148 | portgard | getBonuses | portgard gains 4 conservation (Primates) |
| 2150 | portgard | actionCardCleanup | portgard places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2138 | 1 | choose_action_card | {'type': 'association', 'spend': 0} |
| 2146 | 1 | association_task | {'task': 'conservation', 'project': 'P108', 'source': 'play', 'slot': 1, 'bonus': {'type': 'xtoken', 'value': 3}, 'icon': True, 'token': 'S215'} |

## Table 837771519  (maps ['10', '10'], Marine Worlds True; seat 0 = zuttoden, seat 1 = luminous48)


### 837771519 turn 60 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'deck', 'count': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1830 | luminous48 | getBonuses | luminous48 pays 1 xtoken for increasing card strength |
| 1831 | luminous48 | chooseActionCard | luminous48 chooses action card SponsorsII with strength 4 |
| 1835 | luminous48 | playSponsor | luminous48 plays Rhesus Monkey Park |
| 1836 | luminous48 | getBonuses | luminous48 gains 1 xtoken (Rhesus Monkey Park) |
| 1840 | luminous48 | buyBuilding | luminous48 adds a unique building for free |
| 1845 | luminous48 | pDrawCards | You draw Donkey from the deck |
| 1848 | luminous48 | buyAnimal | luminous48 tucks Pygmy Hippopotamus in the rescue station (Map10's effect) |
| 1850 | luminous48 | getBonuses | luminous48 gains 2 appeal (Meerkat Den) |
| 1852 | luminous48 | pDrawCards | You draw Excavation Site from the deck |
| 1860 | luminous48 | actionCardCleanup | luminous48 places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1831 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 1} |
| 1835 | 1 | play_sponsor | {'card': 'S248', 'from_display': False} |
| 1840 | 1 | place_building | {'type': 'monkey', 'x': 2, 'y': 3, 'rotation': 2} |
| 1845 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1848 | 1 | choose_effect | {'hand': 'A430', 'rescue': True} |
| 1852 | 1 | take_cards | {'mode': 'deck', 'count': 1} |

## Table 841272721  (maps ['14', '14'], Marine Worlds True; seat 0 = tmxk, seat 1 = Koudee)


### 841272721 turn 49 — ILLEGAL (first in this game)

**Error:** choose_effect {'card': 'S202'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1444 | Koudee | chooseActionCard | Koudee chooses action card SponsorsII with strength 3 |
| 1449 | Koudee | advanceBreak | Koudee advances break token of 3 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1450 | Koudee | getBonuses | Koudee gains 1 xtoken (triggering break) |
| 1451 | Koudee | getBonuses | Koudee gains 6 money |
| 1453 | Koudee | actionCardCleanup | Koudee places action card Sponsors at position 1 (finishing action) |
| 1458 | Koudee | discardTokens | Koudee uses 1 x bonus-sponsor-gray |
| 1462 | Koudee | getBonuses | Koudee pays 4 money for buying sponsor card |
| 1463 | Koudee | playSponsor | Koudee plays Expert On The Americas |
| 1467 | Koudee | getBonuses | Koudee gains 1 appeal (Expert On The Americas) |
| 1474 | Koudee | buyBuilding | Koudee adds a Kiosk for free |
| 1475 | Koudee | getBonuses | Koudee gains 1 xtoken (placement bonus) |
| 1480 |  | startBreak | Starting a new break |
| 1484 | tmxk | updateBreakDiscardSelection |  |
| 1485 | tmxk | pDiscardCards | You discard Fennec Fox |
| 1490 |  | discardTokens | All tokens are removed from player cards |
| 1491 |  | slideMeeples | All workers go back to each player's reserve |
| 1492 |  | addMeeples | Replenishing partner zoos and universities |
| 1493 |  | discardCardsOnDisplay | Removing first two cards of the display: Barn Owl, Green Sea Turtle |
| 1494 |  | fillPool | The display is replenished with Guided School Tours, Golden Lion Tamarin |
| 1500 | Koudee | takeBonus | Koudee gets 1 x sponsor-person-card (map bonus space) |
| 1504 | Koudee | playSponsor | Koudee plays Spokesperson |
| 1505 | Koudee | getBonuses | Koudee gains 1 reputation (Spokesperson) |
| 1506 | Koudee | takeBonus | Koudee gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1510 | Koudee | snapCard | Koudee takes Guided School Tours in reputation range from the display |
| 1514 | Koudee | takeBonus | Koudee gets 1 x size-2 (map bonus space) |
| 1518 | Koudee | buyBuilding | Koudee adds a size-2 enclosure for free |
| 1519 | Koudee | getBonuses | Koudee gains 24 money (appeal income) |
| 1520 | Koudee | getBonuses | Koudee gains 2 money (kiosk income) |
| 1525 |  | fillPool | The display is replenished with Sea Animal Management Plan |
| 1526 | tmxk | takeBonus | tmxk gets 5 x money (map bonus space) |
| 1527 | tmxk | getBonuses | tmxk gains 5 money (map bonus space) |
| 1528 | tmxk | getBonuses | tmxk gains 22 money (appeal income) |
| 1529 | tmxk | getBonuses | tmxk gains 5 money (kiosk income) |
| 1531 |  | finishBreak | End of the break |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1444 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 1449 | 1 | sponsor_break | {} |
| 1458 | 1 | use_token | {'token': 'bonus-sponsor-gray'} |
| 1463 | 1 | choose_effect | {'card': 'S210'} |
| 1474 | 1 | place_building | {'type': 'kiosk', 'x': 2, 'y': 7, 'rotation': 0} |
| 1485 | 0 | choose_effect | {'cards': ['A405']} |
| 1504 | 1 | choose_effect | {'card': 'S202'} |
| 1510 | 1 | take_cards | {'mode': 'range', 'card': 'S261'} |
| 1518 | 1 | place_building | {'type': 'size-2', 'x': 4, 'y': 7, 'rotation': 0} |
| 1519 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1520 | 1 | choose_effect | {'apply': 'income_kiosk'} |
| 1528 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1529 | 0 | choose_effect | {'apply': 'income_kiosk'} |

## Table 842580036  (maps ['4a', '4a'], Marine Worlds True; seat 0 = cammauta, seat 1 = sunbear55)


### 842580036 turn 57 — ILLEGAL (first in this game)

**Error:** choose_effect {'keep': 'S242'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1716 | cammauta | chooseActionCard | cammauta chooses action card AnimalsII with strength 3 |
| 1720 | cammauta | buyAnimal | cammauta plays Common Octopus for 9 and places it in the large aquarium |
| 1725 | cammauta | getBonuses | cammauta gains 5 appeal (Common Octopus) |
| 1730 | cammauta | pDrawCards | You draw Orange Clownfish, Eurasian Lynx, Brown Spider Monkey for scuba dive effect |
| 1732 | cammauta | pDiscardCards | You discard Orange Clownfish, Eurasian Lynx, Brown Spider Monkey (no sponsor) |
| 1742 | cammauta | buyAnimal | cammauta plays Green Sea Turtle for 14 and places it in the large aquarium |
| 1747 | cammauta | pDrawCards | You draw Adventure Playground, Indian Rhinoceros, Laughing Kookaburra for scuba dive effect |
| 1749 | cammauta | pDiscardCards | You keep Adventure Playground and discard Indian Rhinoceros, Laughing Kookaburra for scuba dive effect |
| 1759 | cammauta | getBonuses | cammauta gains 6 appeal (Green Sea Turtle) |
| 1761 | cammauta | pDrawCards | You draw Geologist, Reconstruction, American Alligator, Southern Blue-ringed Octopus, Expert In Herbivores, Palette Surgeonfish, Hydrologist for scuba dive effe |
| 1769 | cammauta | pDiscardCards | You keep Geologist and discard Reconstruction, American Alligator, Southern Blue-ringed Octopus, Expert In Herbivores, Palette Surgeonfish, Hydrologist for scub |
| 1774 | cammauta | actionCardCleanup | cammauta places action card Animals at position 1 (finishing action) |
| 1779 | cammauta | pDiscardCards | You sell Conference On Europe cards for 3 money |
| 1784 | cammauta | pDrawCards | You draw African Spurred Tortoise, Diversity Researcher, Blackbar Triggerfish, Coconut Lorikeet, Collared Mangabey, Scarlet Macaw for hunter effect |
| 1790 | cammauta | pDiscardCards | You keep Scarlet Macaw and discard African Spurred Tortoise, Diversity Researcher, Blackbar Triggerfish, Coconut Lorikeet, Collared Mangabey for hunter effect |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1716 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1720 | 0 | play_animal | {'card': 'A549', 'from_display': False, 'x': 3, 'y': 6} |
| 1725 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1732 | 0 | choose_effect | {'keep': None} |
| 1742 | 0 | play_animal | {'card': 'A552', 'from_display': False, 'x': 3, 'y': 6} |
| 1749 | 0 | choose_effect | {'keep': 'S255'} |
| 1759 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1769 | 0 | choose_effect | {'keep': 'S242'} |
| 1779 | 0 | harbor_sell | {'card': 'S268'} |
| 1790 | 0 | choose_effect | {'keep': 'A508'} |

## Table 843469060  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = bizarbus, seat 1 = tmkk)


### 843469060 turn 46 — MISMATCH (first in this game)

**Error:** player 1, money: engine 10, replay 9; player 1, conservation: engine 10, replay 9; player 1, reputation: engine 13, replay 10

| order | player | event | log text |
|---|---|---|---|
| 1186 | tmkk | chooseActionCard | tmkk chooses action card AssociationI with strength 5 |
| 1190 | tmkk | slideMeeples | tmkk takes a new Partner zoo |
| 1191 | tmkk | slideMeeples |  |
| 1192 | tmkk | getBonuses | tmkk gains 1 xtoken (Association3 effect) |
| 1196 | tmkk | upgradeCard | tmkk upgrades AssociationII |

**Engine actions derived from the log:**

_no cleanup_


### 843469060 turn 66 — MISMATCH (later; may be a consequence)

**Error:** display: only in the engine: A439; only in the replay: None; main deck: only in the replay: A439

| order | player | event | log text |
|---|---|---|---|
| 1804 | bizarbus | chooseActionCard | bizarbus chooses action card AnimalsII with strength 3 |
| 1808 | bizarbus | buyAnimal | bizarbus plays Western Green Mamba for 13 and places it in a size-2 enclosure |
| 1812 | bizarbus | getBonuses | bizarbus gains 6 appeal (Western Green Mamba) |
| 1816 | bizarbus | buyAnimal | bizarbus plays American Whitespotted Filefish for 9 and places it in the large aquarium |
| 1821 | bizarbus | getBonuses | bizarbus gains 5 appeal (American Whitespotted Filefish) |
| 1824 | bizarbus | pDrawCards | You draw Bamboo Forest from the deck |
| 1832 | bizarbus | buyAnimal | bizarbus plays Coconut Lorikeet for 7 and places it in the Petting Zoo |
| 1840 | bizarbus | snapCard | bizarbus snaps Sheep from the display |
| 1841 | bizarbus | getBonuses | bizarbus gains 9 appeal (Petting Zoo Animal action) |
| 1843 | bizarbus | actionCardCleanup | bizarbus places action card Animals at position 1 (finishing action) |
| 1853 | bizarbus | actionCardCleanup | bizarbus places Build at position 1 (Clever effect) |
| 1855 | bizarbus | markCard | bizarbus marks American Alligator from display |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1804 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1808 | 0 | play_animal | {'card': 'A470', 'from_display': False, 'x': 7, 'y': 8} |
| 1812 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1816 | 0 | play_animal | {'card': 'A539', 'from_display': False, 'x': 2, 'y': 9} |
| 1821 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1824 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1832 | 0 | play_animal | {'card': 'A527', 'from_display': False, 'x': 0, 'y': 3} |
| 1840 | 0 | take_cards | {'mode': 'snap', 'card': 'A520'} |
| 1853 | 0 | choose_effect | {'type': 'build'} |
| 1855 | 0 | choose_effect | {'card': 'A479', 'mark': True} |

## Table 844027463  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = egirel, seat 1 = nights1030)


### 844027463 turn 34 — MISMATCH (first in this game)

**Error:** player 1, money: engine 3, replay 5

| order | player | event | log text |
|---|---|---|---|
| 971 | nights1030 | chooseActionCard | nights1030 chooses action card CardsII with strength 3 |
| 973 | nights1030 | advanceBreak | nights1030 advances break token of 2 space(s), now at 4/9 |
| 975 | nights1030 | pDrawCards | You draw Marine Research Expedition from the deck |
| 980 | nights1030 | pDrawCards | You draw Quarantine Lab from the deck |
| 985 | nights1030 | actionCardCleanup | nights1030 places action card Cards at position 1 (finishing action) |
| 986 | nights1030 | discardTokens | nights1030 discards their Venom token |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 971 | 1 | choose_action_card | {'type': 'cards', 'spend': 0} |
| 975 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 980 | 1 | take_cards | {'mode': 'deck', 'count': 1} |

## Table 846590560  (maps ['4a', '6a'], Marine Worlds True; seat 0 = Mic_thu, seat 1 = mchen930226)


### 846590560 turn 78 — ILLEGAL (first in this game)

**Error:** play_animal {'card': 'A503', 'from_display': False, 'x': 7, 'y': 12} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2185 | mchen930226 | chooseActionCard | mchen930226 chooses action card AnimalsII with strength 3 |
| 2192 | mchen930226 | buyAnimal | mchen930226 plays Snowy Owl for 5 and places it in a size-2 enclosure |
| 2196 | mchen930226 | getBonuses | mchen930226 gains 1 reputation (Snowy Owl) |
| 2197 | mchen930226 | takeBonus | mchen930226 gets 1 x conservation (reputation track bonus) |
| 2198 | mchen930226 | getBonuses | mchen930226 gains 1 conservation (reputation track bonus) |
| 2202 | mchen930226 | getBonuses | mchen930226 gains 4 appeal (Snowy Owl) |
| 2209 | mchen930226 | buyBuilding | mchen930226 adds a pavilion for free |
| 2210 | mchen930226 | getBonuses | mchen930226 gains 1 appeal (building a pavilion) |
| 2212 | mchen930226 | pDrawCards | You draw King Vulture, Thorny Devil, Western Green Mamba, Sponsorship: Elephants for perception effect |
| 2217 | mchen930226 | pDiscardCards | You keep Thorny Devil, Western Green Mamba and discard King Vulture, Sponsorship: Elephants |
| 2222 | Mic_thu | actionCardCleanup | Mic_thu places action card Animals at position 1 (finishing action) |
| 2226 | mchen930226 | actionCardCleanup | mchen930226 places Build at position 1 (Clever effect) |
| 2230 |  | fillPool | The display is replenished with Native Farm Animals |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2185 | 1 | choose_action_card | {'type': 'animals', 'spend': 0, 'hypnosis': True} |
| 2192 | 1 | play_animal | {'card': 'A503', 'from_display': False, 'x': 7, 'y': 12} |
| 2196 | 1 | choose_effect | {'apply': 'gain', 'res': 'reputation'} |
| 2202 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2209 | 1 | place_building | {'type': 'pavilion', 'x': 5, 'y': 2, 'rotation': 0} |
| 2217 | 1 | choose_effect | {'keep': ['A470', 'A493']} |
| 2226 | 1 | choose_effect | {'type': 'build'} |

## Table 846710292  (maps ['1a', '1a'], Marine Worlds True; seat 0 = azsxy, seat 1 = TemurB)


### 846710292 turn 55 — MISMATCH (first in this game)

**Error:** main deck: only in the engine: P132; only in the replay: A401; player 1, hand: only in the engine: A401; only in the replay: S239; main discard: only in the engine: S239; only in the replay: P132

| order | player | event | log text |
|---|---|---|---|
| 1631 | TemurB | getBonuses | TemurB pays 1 xtoken for increasing card strength |
| 1632 | TemurB | chooseActionCard | TemurB chooses action card AssociationII with strength 4 |
| 1636 | TemurB | slideMeeples | TemurB takes a new university |
| 1637 |  | discardTokens |  |
| 1638 | TemurB | slideMeeples |  |
| 1642 | TemurB | getBonuses | TemurB gains 1 conservation (university) |
| 1644 | TemurB | pDrawCards | You draw Expert In Predators for gaining a new university with <SEARCH-PREDATOR> |
| 1649 | TemurB | pDrawCards | You draw Stoat, Asian Elephant, Jaguar, Research for hunter effect |
| 1654 | TemurB | pDiscardCards | You keep Asian Elephant and discard Stoat, Jaguar, Research for hunter effect |
| 1662 | TemurB | actionCardCleanup | TemurB places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1632 | 1 | choose_action_card | {'type': 'association', 'spend': 1} |
| 1638 | 1 | association_task | {'task': 'university', 'kind': 'fac-generic', 'category': 'predator'} |
| 1654 | 1 | choose_effect | {'keep': 'A431'} |

## Table 850825471  (maps ['5a', '5a'], Marine Worlds True; seat 0 = kaibail, seat 1 = Willjo22)


### 850825471 turn 53 — ILLEGAL (first in this game)

**Error:** play_animal {'card': 'A477', 'from_display': False, 'x': 7, 'y': 2} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1836 | kaibail | chooseActionCard | kaibail chooses action card AnimalsII with strength 3 |
| 1840 | kaibail | buyAnimal | kaibail plays Platypus for 10 and places it in a size-2 enclosure |
| 1845 | kaibail | getBonuses | kaibail gains 4 appeal (Platypus) |
| 1849 | kaibail | buyAnimal | kaibail plays Veiled Chameleon for 11 and places it in the Reptile House |
| 1858 | kaibail | snapCard | kaibail snaps African Bush Elephant from the display |
| 1859 | kaibail | getBonuses | kaibail gains 4 appeal (Veiled Chameleon) |
| 1861 | kaibail | actionCardCleanup | kaibail places action card Animals at position 1 (finishing action) |
| 1863 | kaibail | markCard | kaibail marks Mantled Guereza from display |
| 1867 |  | fillPool | The display is replenished with Common Wombat |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1836 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1840 | 0 | play_animal | {'card': 'A449', 'from_display': False, 'x': 4, 'y': 9} |
| 1845 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1849 | 0 | play_animal | {'card': 'A477', 'from_display': False, 'x': 7, 'y': 2} |
| 1858 | 0 | take_cards | {'mode': 'snap', 'card': 'A426'} |
| 1859 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1863 | 0 | choose_effect | {'card': 'A455', 'mark': True} |

## Table 852870715  (maps ['11', '11'], Marine Worlds True; seat 0 = yucky-nante, seat 1 = sweet-manatee278)


### 852870715 turn 52 — ILLEGAL (first in this game)

**Error:** choose_effect {'worker': 53} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1484 | yucky-nante | getBonuses | yucky-nante pays 2 xtoken for increasing card strength |
| 1485 | yucky-nante | chooseActionCard | yucky-nante chooses action card AssociationI with strength 4 |
| 1489 | yucky-nante | slideMeeples | yucky-nante takes a new university |
| 1490 | yucky-nante | slideMeeples |  |
| 1494 | yucky-nante | getBonuses | yucky-nante gains 1 reputation ( from university) |
| 1495 | yucky-nante | takeBonus | yucky-nante gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1497 | yucky-nante | pDrawCards | You draw Conference On Europe from the deck |
| 1504 | yucky-nante | slideMeeples | yucky-nante takes 1 worker(s) back from the conservation project zone to their notepad (Extra Shift effect) |
| 1506 | sweet-manatee278 | actionCardCleanup | sweet-manatee278 places action card Association at position 1 (finishing action) |
| 1510 |  | fillPool | The display is replenished with Koala |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1485 | 0 | choose_action_card | {'type': 'association', 'spend': 2, 'hypnosis': True} |
| 1490 | 0 | association_task | {'task': 'university', 'kind': 'fac-rep-hand'} |
| 1497 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1504 | 0 | choose_effect | {'worker': 53} |

### 852870715 turn 78 — ILLEGAL (later; may be a consequence)

**Error:** a mandatory effect is still pending: [{'kind': 'build', 'source': 'S272', 'type': 'size-3', 'rules': {}, 'optional': False, 'double': False, 'player': 0}]

| order | player | event | log text |
|---|---|---|---|
| 2174 | yucky-nante | getBonuses | yucky-nante pays 2 xtoken for increasing card strength |
| 2175 | yucky-nante | chooseActionCard | yucky-nante chooses action card SponsorsII with strength 4 |
| 2179 | yucky-nante | playSponsor | yucky-nante plays Expansion Area |
| 2187 | yucky-nante | actionCardCleanup | yucky-nante places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2175 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 2} |
| 2179 | 0 | play_sponsor | {'card': 'S272', 'from_display': False} |

## Table 853613089  (maps ['4a', '4a'], Marine Worlds True; seat 0 = Pig_God, seat 1 = Meltapo)


### 853613089 turn 20 — ILLEGAL (first in this game)

**Error:** choose_effect {'cards': []} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 544 | Pig_God | chooseActionCard | Pig_God chooses action card CardsI with strength 5 |
| 546 | Pig_God | advanceBreak | Pig_God advances break token of 2 space(s), now at 4/9 |
| 549 | Pig_God | pDrawCards | You draw Orange Clownfish, Horse, Jungle from the deck |
| 554 | Pig_God | actionCardCleanup | Pig_God places action card Cards at position 1 (finishing action) |
| 559 | Pig_God | pDiscardCards | You sell cards for |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 544 | 0 | choose_action_card | {'type': 'cards', 'spend': 0} |
| 549 | 0 | take_cards | {'mode': 'deck', 'count': 3} |
| 559 | 0 | choose_effect | {'cards': []} |

## Table 853928407  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = AX111, seat 1 = ISENGUARD 4658)


### 853928407 turn 46 — ILLEGAL (first in this game)

**Error:** choose_effect {'building': [7, 6], 'x': 7, 'y': 8, 'rotation': 0} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1458 | ISENGUARD 4658 | chooseActionCard | ISENGUARD 4658 chooses action card AnimalsII with strength 4 |
| 1462 | ISENGUARD 4658 | buyAnimal | ISENGUARD 4658 plays Galapagos Giant Tortoise for 27 and places it in a size-3 enclosure |
| 1466 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 2 conservation (Galapagos Giant Tortoise) |
| 1470 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 1 reputation (Galapagos Giant Tortoise) |
| 1475 | ISENGUARD 4658 | pDiscardCards | You sell Moose, Chinese Water Dragon, Publications cards for 12 money |
| 1479 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 8 appeal (Galapagos Giant Tortoise) |
| 1483 | ISENGUARD 4658 | buyAnimal | ISENGUARD 4658 plays Lesser Bird-of-paradise for 12 and places it in a size-1 enclosure |
| 1490 | ISENGUARD 4658 | buyBuilding | ISENGUARD 4658 adds a Kiosk (Lesser Bird-of-paradise) |
| 1494 | ISENGUARD 4658 | snapCard | ISENGUARD 4658 takes Reindeer in reputation range from the display |
| 1498 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 5 appeal (Lesser Bird-of-paradise) |
| 1505 | ISENGUARD 4658 | increaseSize | ISENGUARD 4658 increase the size of a a size-3 enclosure |
| 1509 | ISENGUARD 4658 | getBonuses | ISENGUARD 4658 gains 2 appeal (Conference On Australia) |
| 1513 | ISENGUARD 4658 | snapCard | ISENGUARD 4658 takes Water Playground in reputation range from the display |
| 1515 | ISENGUARD 4658 | actionCardCleanup | ISENGUARD 4658 places action card Animals at position 1 (finishing action) |
| 1519 |  | fillPool | The display is replenished with Cheetah, Sponsorship: Elephants |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1458 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1462 | 1 | play_animal | {'card': 'A481', 'from_display': False, 'x': 7, 'y': 6} |
| 1466 | 1 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 1470 | 1 | choose_effect | {'apply': 'gain', 'res': 'reputation'} |
| 1475 | 1 | choose_effect | {'cards': ['A442', 'A478', 'S273']} |
| 1479 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1483 | 1 | play_animal | {'card': 'A518', 'from_display': False, 'x': 1, 'y': 12} |
| 1490 | 1 | place_building | {'type': 'kiosk', 'x': 6, 'y': 5, 'rotation': 0} |
| 1494 | 1 | take_cards | {'mode': 'range', 'card': 'A438'} |
| 1498 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1505 | 1 | choose_effect | {'building': [7, 6], 'x': 7, 'y': 8, 'rotation': 0} |
| 1513 | 1 | take_cards | {'mode': 'range', 'card': 'S256'} |

## Table 854263310  (maps ['2a', '2a'], Marine Worlds True; seat 0 = weicuiwqh, seat 1 = soyeon_12)


### 854263310 turn 37 — MISMATCH (first in this game)

**Error:** player 0, money: engine 9, replay 11

| order | player | event | log text |
|---|---|---|---|
| 918 | weicuiwqh | chooseActionCard | weicuiwqh chooses action card BuildI with strength 5 |
| 923 | weicuiwqh | buyBuilding | weicuiwqh pays 2 for building a size-1 enclosure |
| 925 | weicuiwqh | actionCardCleanup | weicuiwqh places action card Build at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 918 | 0 | choose_action_card | {'type': 'build', 'spend': 0} |
| 923 | 0 | place_building | {'type': 'size-1', 'x': 4, 'y': 9, 'rotation': 0} |

## Table 855033887  (maps ['10', '10'], Marine Worlds True; seat 0 = yuan020209, seat 1 = Drin_Reset)


### 855033887 turn 57 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'deck', 'count': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1644 | yuan020209 | chooseActionCard | yuan020209 chooses action card SponsorsII with strength 5 |
| 1649 | yuan020209 | advanceBreak | yuan020209 advances break token of 5 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1650 | yuan020209 | getBonuses | yuan020209 gains 1 xtoken (triggering break) |
| 1651 | yuan020209 | getBonuses | yuan020209 gains 10 money |
| 1653 | yuan020209 | actionCardCleanup | yuan020209 places action card Sponsors at position 1 (finishing action) |
| 1658 |  | startBreak | Starting a new break |
| 1662 | yuan020209 | updateBreakDiscardSelection |  |
| 1663 | yuan020209 | pDiscardCards | You discard Talented Communicator, Shoebill |
| 1668 |  | discardTokens | All tokens are removed from player cards |
| 1669 |  | slideMeeples | All workers go back to each player's reserve |
| 1670 |  | addMeeples | Replenishing partner zoos and universities |
| 1671 |  | discardCardsOnDisplay | Removing first two cards of the display: Domestic Rabbit, Vietnamese Pot-bellied Pig |
| 1672 |  | fillPool | The display is replenished with Aquatic, African Penguin |
| 1673 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Moose |
| 1674 |  | fillPool | The display is replenished with Red Deer |
| 1676 | yuan020209 | takeBonus | yuan020209 gets 5 x money (map bonus space) |
| 1677 | yuan020209 | getBonuses | yuan020209 gains 5 money (map bonus space) |
| 1681 | yuan020209 | takeBonus | yuan020209 gets 1 x Snapping (map bonus space) |
| 1685 | yuan020209 | snapCard | yuan020209 snaps Aquatic from the display |
| 1689 | yuan020209 | takeBonus | yuan020209 gets 1 x size-2 (map bonus space) |
| 1693 | yuan020209 | buyBuilding | yuan020209 adds a size-2 enclosure for free |
| 1694 | yuan020209 | getBonuses | yuan020209 gains 1 money (Geologist) |
| 1695 | yuan020209 | getBonuses | yuan020209 gains 25 money (appeal income) |
| 1696 | yuan020209 | getBonuses | yuan020209 gains 5 money (kiosk income) |
| 1701 |  | fillPool | The display is replenished with Serengeti national park |
| 1702 | Drin_Reset | takeBonus | Drin_Reset gets 5 x money (map bonus space) |
| 1703 | Drin_Reset | getBonuses | Drin_Reset gains 5 money (map bonus space) |
| 1707 | Drin_Reset | takeBonus | Drin_Reset gets 1 x Snapping (map bonus space) |
| 1711 | Drin_Reset | snapCard | Drin_Reset snaps Giant Panda from the display |
| 1715 | Drin_Reset | takeBonus | Drin_Reset gets 1 x size-2 (map bonus space) |
| 1719 | Drin_Reset | buyBuilding | Drin_Reset adds a size-2 enclosure for free |
| 1723 | Drin_Reset | takeBonus | Drin_Reset gets 1 x map10 |
| 1725 | Drin_Reset | pDrawCards | You draw Geological from the deck |
| 1728 | Drin_Reset | buyAnimal | Drin_Reset tucks Koala in the rescue station (Map10's effect) |
| 1733 | Drin_Reset | getBonuses | Drin_Reset gains 1 conservation (Medical Breakthrough) |
| 1734 | Drin_Reset | getBonuses | Drin_Reset gains 24 money (appeal income) |
| 1735 | Drin_Reset | getBonuses | Drin_Reset gains 3 money (Federal Grants) |
| 1739 | Drin_Reset | actionCardCleanup | Drin_Reset places Cards at position 1 (Clever effect) |
| 1744 |  | finishBreak | End of the break |
| 1745 |  | fillPool | The display is replenished with Senegal Bushbaby |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1644 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 1649 | 0 | sponsor_break | {} |
| 1663 | 0 | choose_effect | {'cards': ['A498', 'S216']} |
| 1685 | 0 | take_cards | {'mode': 'snap', 'card': 'P128'} |
| 1693 | 0 | place_building | {'type': 'size-2', 'x': 3, 'y': 4, 'rotation': 5} |
| 1695 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1696 | 0 | choose_effect | {'apply': 'income_kiosk'} |
| 1711 | 1 | take_cards | {'mode': 'snap', 'card': 'A433'} |
| 1719 | 1 | place_building | {'type': 'size-2', 'x': 8, 'y': 11, 'rotation': 1} |
| 1723 | 1 | choose_effect | {'bonus_type': 'map10', 'n': 1} |
| 1725 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1728 | 0 | choose_effect | {'hand': 'A448', 'rescue': True} |
| 1733 | 1 | choose_effect | {'apply': 'income_sponsor', 'source': 'S206'} |
| 1734 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1735 | 1 | choose_effect | {'apply': 'income_sponsor', 'source': 'S220'} |
| 1739 | 0 | choose_effect | {'type': 'cards'} |

### 855033887 turn 62 — ILLEGAL (later; may be a consequence)

**Error:** take_cards {'mode': 'deck', 'count': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1886 | yuan020209 | getBonuses | yuan020209 pays 1 xtoken for increasing card strength |
| 1887 | yuan020209 | chooseActionCard | yuan020209 chooses action card SponsorsII with strength 4 |
| 1891 | yuan020209 | playSponsor | yuan020209 plays Aquarium |
| 1898 | yuan020209 | buyBuilding | yuan020209 adds a unique building for free |
| 1903 | yuan020209 | pDrawCards | You draw Breeding Program from the deck |
| 1906 | yuan020209 | buyAnimal | yuan020209 tucks Saltwater Crocodile in the rescue station (Map10's effect) |
| 1908 | Drin_Reset | getBonuses | Drin_Reset gains 6 money (Herpetologist) |
| 1909 | yuan020209 | getBonuses | yuan020209 gains 2 appeal (Aquarium) |
| 1911 | yuan020209 | pDrawCards | You draw American Alligator from the deck |
| 1917 | yuan020209 | getBonuses | yuan020209 gains 4 appeal (Aquarium) |
| 1920 | yuan020209 | actionCardCleanup | yuan020209 places action card Sponsors at position 1 (finishing action) |
| 1921 |  | fillPool | The display is replenished with Palette Surgeonfish |
| 1922 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Conference On Europe |
| 1923 |  | fillPool | The display is replenished with Release Of Patents |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1887 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 1} |
| 1891 | 0 | play_sponsor | {'card': 'S245', 'from_display': False} |
| 1898 | 0 | place_building | {'type': 'aquarium', 'x': 1, 'y': 0, 'rotation': 0} |
| 1903 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1906 | 0 | choose_effect | {'hand': 'A489', 'rescue': True} |
| 1911 | 0 | take_cards | {'mode': 'deck', 'count': 1} |

## Table 855252797  (maps ['7a', '7a'], Marine Worlds True; seat 0 = BaseSig, seat 1 = hwquidfwqhbcw2)


### 855252797 turn 56 — ILLEGAL (first in this game)

**Error:** association_task {'task': 'conservation', 'project': 'P111', 'source': 'play'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1713 | BaseSig | chooseActionCard | BaseSig chooses action card AssociationII with strength 5 |
| 1717 | BaseSig | slideMeeples | BaseSig supports a conservation project on the second slot : Herbivores |
| 1718 | BaseSig | discardTokens | BaseSig uses 1 token(s) from sponsor card(s) and 1 x bonus-icon |
| 1719 |  | slideMeeples |  |
| 1723 | BaseSig | getBonuses | BaseSig gains 4 conservation (Herbivores) |
| 1725 | BaseSig | pDiscardCards | You pouch Bennett's Wallaby, Cotton-top Tamarin cards for 4 appeal |
| 1733 | BaseSig | actionCardCleanup | BaseSig places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1713 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 1719 | 0 | association_task | {'task': 'conservation', 'project': 'P111', 'source': 'play', 'slot': 1, 'bonus': {'slot': 3}, 'icon': True, 'token': 'S215'} |
| 1725 | 0 | choose_effect | {'card': 'A528'} |
| 1725 | 0 | choose_effect | {'card': 'A468'} |

## Table 856556982  (maps ['1a', '1a'], Marine Worlds True; seat 0 = zuttoden, seat 1 = cainonglaila)


### 856556982 turn 46 — ILLEGAL (first in this game)

**Error:** choose_effect {'send': 'S236'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1435 | cainonglaila | chooseActionCard | cainonglaila chooses action card SponsorsI with strength 5 |
| 1443 | cainonglaila | advanceBreak | cainonglaila advances break token of 5 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1444 | cainonglaila | getBonuses | cainonglaila gains 1 xtoken (triggering break) |
| 1445 | cainonglaila | getBonuses | cainonglaila gains 5 money |
| 1450 | cainonglaila | actionCardCleanup | cainonglaila places action card Sponsors at position 1 (finishing action) |
| 1455 |  | startBreak | Starting a new break |
| 1459 | cainonglaila | updateBreakDiscardSelection |  |
| 1460 | cainonglaila | pDiscardCards | You discard Palette Surgeonfish |
| 1465 |  | discardTokens | All tokens are removed from player cards |
| 1466 |  | slideMeeples | All workers go back to each player's reserve |
| 1467 |  | addMeeples | Replenishing partner zoos and universities |
| 1468 |  | discardCardsOnDisplay | Removing first two cards of the display: Horsfield's Tarsier, White Stork |
| 1469 |  | fillPool | The display is replenished with Cinereous Vulture, Southern Blue-ringed Octopus |
| 1470 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Guinea Pig |
| 1471 |  | fillPool | The display is replenished with Large Animals |
| 1476 | cainonglaila | takeBonus | cainonglaila gets 1 x Snapping (map bonus space) |
| 1480 | cainonglaila | snapCard | cainonglaila snaps Marine Research Expedition from the display |
| 1484 | cainonglaila | takeBonus | cainonglaila gets 1 x bonus-sponsor (map bonus space) |
| 1488 | cainonglaila | getBonuses | cainonglaila pays 5 money for buying sponsor card |
| 1489 | cainonglaila | playSponsor | cainonglaila plays Marine Research Expedition |
| 1493 | cainonglaila | getBonuses | cainonglaila gains 1 reputation (Spokesperson) |
| 1494 | cainonglaila | takeBonus | cainonglaila gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1496 | cainonglaila | pDrawCards | You draw Saltwater Crocodile from the deck |
| 1509 | cainonglaila | discardCardsOnDisplay | cainonglaila sends Primatologist away to an expedition |
| 1510 | cainonglaila | getBonuses | cainonglaila gains 1 conservation (Marine Research Expedition) |
| 1514 | cainonglaila | getBonuses | cainonglaila gains 3 money (Federal Grants) |
| 1518 | cainonglaila | getBonuses | cainonglaila gains 19 money (appeal income) |
| 1522 | cainonglaila | getBonuses | cainonglaila gains 3 money (kiosk income) |
| 1526 | cainonglaila | takeBonus | cainonglaila gets 1 x size-2 (map bonus space) |
| 1530 | cainonglaila | buyBuilding | cainonglaila adds a size-2 enclosure for free |
| 1532 | cainonglaila | pDrawCards | You draw Hydrologist from the deck |
| 1537 |  | fillPool | The display is replenished with Donkey |
| 1541 | zuttoden | takeBonus | zuttoden gets 1 x Snapping (map bonus space) |
| 1545 | zuttoden | snapCard | zuttoden snaps Cinereous Vulture from the display |
| 1546 | zuttoden | getBonuses | zuttoden gains 26 money (appeal income) |
| 1547 | zuttoden | getBonuses | zuttoden gains 6 money (kiosk income) |
| 1552 |  | finishBreak | End of the break |
| 1553 |  | fillPool | The display is replenished with Long-billed Vulture |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1435 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 1443 | 1 | sponsor_break | {} |
| 1460 | 1 | choose_effect | {'cards': ['A531']} |
| 1480 | 1 | take_cards | {'mode': 'snap', 'card': 'S270'} |
| 1489 | 1 | choose_effect | {'card': 'S270'} |
| 1496 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1509 | 1 | choose_effect | {'send': 'S236'} |
| 1514 | 1 | choose_effect | {'apply': 'income_sponsor', 'source': 'S220'} |
| 1518 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1522 | 1 | choose_effect | {'apply': 'income_kiosk'} |
| 1530 | 1 | place_building | {'type': 'size-2', 'x': 4, 'y': 7, 'rotation': 2} |
| 1532 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1545 | 0 | take_cards | {'mode': 'snap', 'card': 'A499'} |
| 1546 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1547 | 0 | choose_effect | {'apply': 'income_kiosk'} |

## Table 856570085  (maps ['4a', '4a'], Marine Worlds True; seat 0 = Malekbonnudd, seat 1 = ShadoWindss)


### 856570085 turn 16 — ILLEGAL (first in this game)

**Error:** play_animal {'card': 'A473', 'from_display': False, 'x': 3, 'y': 6} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 534 | Malekbonnudd | chooseActionCard | Malekbonnudd chooses action card AnimalsI with strength 5 |
| 538 | Malekbonnudd | buyAnimal | Malekbonnudd plays Rock Monitor for 12 and places it in a size-2 enclosure |
| 542 | Malekbonnudd | getBonuses | Malekbonnudd gains 2 money (Explorer) |
| 543 | Malekbonnudd | getBonuses | Malekbonnudd gains 1 appeal (Explorer) |
| 550 | Malekbonnudd | getBonuses | Malekbonnudd gains 5 appeal (Rock Monitor) |
| 554 | Malekbonnudd | buyAnimal | Malekbonnudd plays Common Agama for 9 and places it in a size-2 enclosure |
| 558 | Malekbonnudd | getBonuses | Malekbonnudd gains 3 appeal (Common Agama) |
| 563 | Malekbonnudd | pDiscardCards | You sell Publications cards for 4 money |
| 568 | Malekbonnudd | actionCardCleanup | Malekbonnudd places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 534 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 538 | 0 | play_animal | {'card': 'A472', 'from_display': False, 'x': 2, 'y': 9} |
| 550 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 554 | 0 | play_animal | {'card': 'A473', 'from_display': False, 'x': 3, 'y': 6} |
| 558 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 563 | 0 | choose_effect | {'cards': ['S273']} |

## Table 857053797  (maps ['4a', '4a'], Marine Worlds True; seat 0 = Ttmanm, seat 1 = CCCChen-1)


### 857053797 turn 62 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'take_tile', 'tile': 'university', 'player': 1, 'optional': False}]

| order | player | event | log text |
|---|---|---|---|
| 2135 | CCCChen-1 | getBonuses | CCCChen-1 pays 2 xtoken for increasing card strength |
| 2136 | CCCChen-1 | chooseActionCard | CCCChen-1 chooses action card AssociationI with strength 5 |
| 2140 | CCCChen-1 | slideMeeples | CCCChen-1 supports a conservation project on the third slot : Reptiles |
| 2141 |  | slideMeeples |  |
| 2142 | CCCChen-1 | getBonuses | CCCChen-1 gains 3 xtoken (map bonus space) |
| 2143 | CCCChen-1 | getBonuses | CCCChen-1 gains 2 conservation (Reptiles) |

**Engine actions derived from the log:**

_no cleanup_


## Table 858199959  (maps ['9', '9'], Marine Worlds True; seat 0 = Obnoxious_Ostrich, seat 1 = AGGRODA)


### 858199959 turn 55 — MISMATCH (first in this game)

**Error:** player 1, action cards: engine: cards, animals II v2, sponsors II v1, association, build II +Constriction \| replay: cards, animals II v2, sponsors II v1, association +Constriction, build II +Constriction

| order | player | event | log text |
|---|---|---|---|
| 1787 | Obnoxious_Ostrich | getBonuses | Obnoxious_Ostrich pays 1 xtoken for increasing card strength |
| 1788 | Obnoxious_Ostrich | chooseActionCard | Obnoxious_Ostrich chooses action card AnimalsII with strength 3 |
| 1792 | Obnoxious_Ostrich | buyAnimal | Obnoxious_Ostrich plays Raccoon for 8 and places it in a size-2 enclosure |
| 1799 | Obnoxious_Ostrich | discardTokens | Obnoxious_Ostrich removes <AMERICAS> marker from their map |
| 1803 | Obnoxious_Ostrich | takeBonus | Obnoxious_Ostrich gets 2 x appeal (Map 9 effect) |
| 1804 | Obnoxious_Ostrich | getBonuses | Obnoxious_Ostrich gains 2 appeal (Map 9 effect) |
| 1808 | Obnoxious_Ostrich | getBonuses | Obnoxious_Ostrich gains 2 appeal (Waza Special Assignment) |
| 1809 | Obnoxious_Ostrich | getBonuses | Obnoxious_Ostrich gains 4 appeal (Raccoon) |
| 1813 | Obnoxious_Ostrich | discardTokens | Obnoxious_Ostrich uses 3 x bonus-ignore-conditions |
| 1814 | Obnoxious_Ostrich | buyAnimal | Obnoxious_Ostrich plays Indian Rock Python for 8 and places it in a size-2 enclosure |
| 1818 | Obnoxious_Ostrich | addMeeples | Obnoxious_Ostrich uses Constriction effect and gives constriction token(s) to AGGRODA |
| 1822 | Obnoxious_Ostrich | getBonuses | Obnoxious_Ostrich gains 2 appeal (Waza Special Assignment) |
| 1826 | Obnoxious_Ostrich | getBonuses | Obnoxious_Ostrich gains 7 appeal (Indian Rock Python) |
| 1833 | Obnoxious_Ostrich | buyBuilding | Obnoxious_Ostrich adds a pavilion for free |
| 1834 | Obnoxious_Ostrich | getBonuses | Obnoxious_Ostrich gains 1 appeal (building a pavilion) |
| 1835 | Obnoxious_Ostrich | getBonuses | Obnoxious_Ostrich gains 1 xtoken (placement bonus) |
| 1837 | Obnoxious_Ostrich | actionCardCleanup | Obnoxious_Ostrich places action card Animals at position 1 (finishing action) |
| 1841 | Obnoxious_Ostrich | actionCardCleanup | Obnoxious_Ostrich places Association at position 5 (Boost effect) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1788 | 0 | choose_action_card | {'type': 'animals', 'spend': 1} |
| 1792 | 0 | play_animal | {'card': 'A415', 'from_display': False, 'x': 2, 'y': 5} |
| 1803 | 0 | choose_effect | {'continent': 'Americas', 'bonus_type': 'appeal', 'n': 2} |
| 1809 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1814 | 0 | play_animal | {'card': 'A474', 'from_display': False, 'x': 3, 'y': 2} |
| 1818 | 0 | choose_effect | {'apply': 'constrict'} |
| 1826 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1833 | 0 | place_building | {'type': 'pavilion', 'x': 7, 'y': 8, 'rotation': 0} |
| 1841 | 0 | choose_effect | {'boost': 'association', 'position': 5} |

## Table 859360830  (maps ['4a', '4a'], Marine Worlds True; seat 0 = beefq, seat 1 = davidb9)


### 859360830 turn 60 — ILLEGAL (first in this game)

**Error:** choose_action_card {'type': 'animals', 'spend': 0} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2071 | beefq | chooseActionCard | beefq chooses action card AnimalsII with strength 5 |
| 2075 | beefq | takeBonus | beefq gets 10 x money (maxing out reputation) |
| 2076 | beefq | getBonuses | beefq gains 10 money (maxing out reputation) |
| 2080 | beefq | buyAnimal | beefq buys Malayan Tapir from display for 18 and places it in a size-2 enclosure |
| 2084 | beefq | getBonuses | beefq gains 5 appeal (Malayan Tapir) |
| 2088 | beefq | getBonuses | beefq gains 1 appeal (maxing out reputation) |
| 2093 | beefq | discardCardsOnDisplay | beefq digs Vietnamese Pot-bellied Pig from the display |
| 2094 |  | fillPool | The display is replenished with Cable Car, Anaconda |
| 2097 | beefq | pDiscardCards | You dig Sand Tiger Shark from your hand |
| 2098 | beefq | pDrawCards | You draw Crested Porcupine from the deck |

**Engine actions derived from the log:**

_no cleanup_


## Table 859461296  (maps ['4a', '4a'], Marine Worlds True; seat 0 = victorioushermit, seat 1 = Misha-Pupkin)


### 859461296 turn 51 — ILLEGAL (first in this game)

**Error:** donate {} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1572 | victorioushermit | chooseActionCard | victorioushermit chooses action card AssociationII with strength 5 |
| 1576 | victorioushermit | slideMeeples | victorioushermit supports a conservation project on the second slot : Bamboo Forest |
| 1577 | victorioushermit | moveProjects | victorioushermit plays a new conservation project: Bamboo Forest |
| 1578 |  | slideMeeples |  |
| 1582 | victorioushermit | releaseAnimal | victorioushermit releases Northern Giraffe into the wild and loses 7 appeal and frees a size-3 enclosure |
| 1586 | victorioushermit | getBonuses | victorioushermit gains 4 conservation (Bamboo Forest) |
| 1593 | victorioushermit | takeBonus | victorioushermit gets 1 x Multiplier |
| 1597 | victorioushermit | addMeeples | victorioushermit adds a multiplier token on action card CardsI |
| 1601 | victorioushermit | takeBonus | victorioushermit triggers scoring card discard by reaching 10 conservation points |
| 1605 | Misha-Pupkin | pDiscardCards | You discard Architectural Zoo (scoring card) |
| 1608 | victorioushermit | pDiscardCards | You discard Catered Picnic Areas (scoring card) |
| 1616 | victorioushermit | getBonuses | victorioushermit gains 1 reputation (adding a new conservation project) |
| 1617 | victorioushermit | slideMeeples | victorioushermit gains a new Association worker |
| 1621 | victorioushermit | donation | victorioushermit donates 2 money to get 1 conservation |

**Engine actions derived from the log:**

_no cleanup_


## Table 864036800  (maps ['11', '11'], Marine Worlds True; seat 0 = Viciow, seat 1 = S0lanum)


### 864036800 turn 49 — ILLEGAL (first in this game)

**Error:** choose_effect {'worker': 53} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1478 | Viciow | chooseActionCard | Viciow chooses action card AssociationII with strength 4 |
| 1482 | Viciow | slideMeeples | Viciow takes a new university |
| 1483 | Viciow | slideMeeples |  |
| 1484 | Viciow | getBonuses | Viciow gains 2 money (Science Library) |
| 1488 | Viciow | getBonuses | Viciow gains 2 reputation ( from university) |
| 1492 | Viciow | takeBonus | Viciow gets 1 x conservation (reputation track bonus) |
| 1493 | Viciow | getBonuses | Viciow gains 1 conservation (reputation track bonus) |
| 1494 | Viciow | takeBonus | Viciow gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1498 | Viciow | snapCard | Viciow takes Dusky-leaf Monkey in reputation range from the display |
| 1499 | S0lanum | gainMarked | S0lanum gains 2 money for their mark on Dusky-leaf Monkey |
| 1503 | Viciow | slideMeeples | Viciow takes 1 worker(s) back from the conservation project zone to their notepad (Extra Shift effect) |
| 1507 | Viciow | donation | Viciow donates 1 money to get 1 conservation |
| 1509 | Viciow | actionCardCleanup | Viciow places action card Association at position 1 (finishing action) |
| 1513 |  | fillPool | The display is replenished with Diversity Researcher |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1478 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 1483 | 0 | association_task | {'task': 'university', 'kind': 'fac-science-rep'} |
| 1498 | 0 | take_cards | {'mode': 'range', 'card': 'A460'} |
| 1503 | 0 | choose_effect | {'worker': 53} |
| 1507 | 0 | donate | {} |

## Table 865382491  (maps ['1a', '1a'], Marine Worlds True; seat 0 = SmokinFlounder, seat 1 = gunners009-sparrow)


### 865382491 turn 66 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'take', 'source': 'reputation track', 'optional': False, 'player': 1}]

| order | player | event | log text |
|---|---|---|---|
| 1989 | gunners009-sparrow | chooseActionCard | gunners009-sparrow chooses action card AssociationI with strength 5 |
| 1993 | gunners009-sparrow | slideMeeples | gunners009-sparrow supports a conservation project on the second slot : Bird Management Plan |
| 1994 |  | discardCardsOnDisplay | The rightmost project card is discarded: Angthong national park |
| 1995 | gunners009-sparrow | moveProjects | gunners009-sparrow plays a new conservation project: Bird Management Plan |
| 1996 |  | slideMeeples |  |
| 2000 | gunners009-sparrow | getBonuses | gunners009-sparrow gains 1 reputation (Bird Management Plan) |
| 2001 | gunners009-sparrow | takeBonus | gunners009-sparrow gets 1 x conservation (reputation track bonus) |
| 2002 | gunners009-sparrow | getBonuses | gunners009-sparrow gains 1 conservation (reputation track bonus) |
| 2006 | gunners009-sparrow | getBonuses | gunners009-sparrow gains 2 conservation (Bird Management Plan) |
| 2013 | gunners009-sparrow | buyBuilding | gunners009-sparrow adds a pavilion for free |
| 2014 | gunners009-sparrow | getBonuses | gunners009-sparrow gains 1 appeal (building a pavilion) |
| 2018 | gunners009-sparrow | getBonuses | gunners009-sparrow pays 4 money for buying sponsor card |
| 2019 | gunners009-sparrow | playSponsor | gunners009-sparrow plays Science Library |
| 2020 | gunners009-sparrow | getBonuses | gunners009-sparrow gains 2 money (Science Library) |
| 2021 | gunners009-sparrow | getBonuses | gunners009-sparrow gains 4 appeal (Science Library) |

**Engine actions derived from the log:**

_no cleanup_


## Table 868837221  (maps ['1a', '1a'], Marine Worlds True; seat 0 = MatchaBun, seat 1 = wcy710)


### 868837221 turn 42 — ILLEGAL (first in this game)

**Error:** place_building {'type': 'size-2', 'x': 2, 'y': 5, 'rotation': 5} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1183 | MatchaBun | chooseActionCard | MatchaBun chooses action card CardsII with strength 5 |
| 1185 | MatchaBun | advanceBreak | MatchaBun advances break token of 2 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 1186 | MatchaBun | getBonuses | MatchaBun gains 1 xtoken (triggering break) |
| 1190 | MatchaBun | discardCardsOnDisplay | MatchaBun digs Alpaca from the display |
| 1191 |  | fillPool | The display is replenished with Common Wall Lizard |
| 1195 | MatchaBun | discardCardsOnDisplay | MatchaBun digs Baboon Rock from the display |
| 1196 |  | fillPool | The display is replenished with Indian Rhinoceros |
| 1200 | MatchaBun | snapCard | MatchaBun takes Small Animals in reputation range from the display |
| 1202 | MatchaBun | pDrawCards | You draw Laughing Kookaburra from the deck |
| 1207 | MatchaBun | pDrawCards | You draw Rhesus Monkey Park from the deck |
| 1214 | MatchaBun | snapCard | MatchaBun takes Quarantine Lab in reputation range from the display |
| 1216 | MatchaBun | pDiscardCards | You discard Laughing Kookaburra |
| 1221 | MatchaBun | actionCardCleanup | MatchaBun places action card Cards at position 1 (finishing action) |
| 1226 | MatchaBun | discardTokens | MatchaBun uses 1 x bonus-sponsor-gray |
| 1230 | MatchaBun | getBonuses | MatchaBun pays 3 money for buying sponsor card |
| 1231 | MatchaBun | playSponsor | MatchaBun plays Quarantine Lab |
| 1232 | MatchaBun | getBonuses | MatchaBun gains 1 xtoken (Quarantine Lab) |
| 1236 |  | fillPool | The display is replenished with New Zealand Sea Lion, European Grass Snake |
| 1238 |  | startBreak | Starting a new break |
| 1240 |  | discardTokens | All tokens are removed from player cards |
| 1241 |  | slideMeeples | All workers go back to each player's reserve |
| 1242 |  | addMeeples | Replenishing partner zoos and universities |
| 1243 |  | discardCardsOnDisplay | Removing first two cards of the display: Australian Sea Lion, Reindeer |
| 1244 |  | fillPool | The display is replenished with Serengeti national park, Snowy Owl |
| 1249 | MatchaBun | takeBonus | MatchaBun gets 1 x size-2 (map bonus space) |
| 1253 | MatchaBun | buyBuilding | MatchaBun adds a size-2 enclosure for free |
| 1257 | MatchaBun | snapCard | MatchaBun takes Indian Rhinoceros in reputation range from the display |
| 1258 | MatchaBun | getBonuses | MatchaBun gains 21 money (appeal income) |
| 1263 |  | fillPool | The display is replenished with Rock Monitor |
| 1264 | wcy710 | getBonuses | wcy710 gains 20 money (appeal income) |
| 1265 | wcy710 | getBonuses | wcy710 gains 6 money (kiosk income) |
| 1267 |  | finishBreak | End of the break |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1183 | 0 | choose_action_card | {'type': 'cards', 'spend': 0} |
| 1190 | 0 | choose_effect | {'display': 'A526'} |
| 1195 | 0 | choose_effect | {'display': 'S247'} |
| 1200 | 0 | take_cards | {'mode': 'range', 'card': 'P130'} |
| 1202 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1207 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1214 | 0 | take_cards | {'mode': 'range', 'card': 'S225'} |
| 1216 | 0 | discard_cards | {'cards': ['A517']} |
| 1226 | 0 | use_token | {'token': 'bonus-sponsor-gray'} |
| 1231 | 0 | choose_effect | {'card': 'S225'} |
| 1253 | 0 | place_building | {'type': 'size-2', 'x': 2, 'y': 5, 'rotation': 5} |
| 1257 | 0 | take_cards | {'mode': 'range', 'card': 'A432'} |
| 1258 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 1264 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 1265 | 1 | choose_effect | {'apply': 'income_kiosk'} |

## Table 869053695  (maps ['4a', '4a'], Marine Worlds True; seat 0 = nights1030, seat 1 = qiangda)


### 869053695 turn 41 — ILLEGAL (first in this game)

**Error:** place_building {'type': 'kiosk', 'x': 1, 'y': 8, 'rotation': 0} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1037 | qiangda | chooseActionCard | qiangda chooses action card BuildII with strength 5 |
| 1041 | qiangda | buyBuilding | qiangda pays 4 for building a size-2 enclosure |
| 1045 | qiangda | snapCard | qiangda takes Northern Muriqui in reputation range from the display |
| 1052 | qiangda | buyBuilding | qiangda pays 2 for building a size-1 enclosure |
| 1057 | qiangda | pDiscardCards | You sell Northern Muriqui cards for 3 money |
| 1064 | qiangda | buyBuilding | qiangda pays 2 for building a Kiosk |
| 1070 | qiangda | buyBuilding | qiangda pays 2 for building a pavilion |
| 1071 | qiangda | getBonuses | qiangda gains 1 appeal (building a pavilion) |
| 1074 | qiangda | actionCardCleanup | qiangda places action card Build at position 1 (finishing action) |
| 1078 |  | fillPool | The display is replenished with Sea Animal Management Plan |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1037 | 1 | choose_action_card | {'type': 'build', 'spend': 0} |
| 1041 | 1 | place_building | {'type': 'size-2', 'x': 0, 'y': 5, 'rotation': 5} |
| 1045 | 1 | take_cards | {'mode': 'range', 'card': 'A558'} |
| 1052 | 1 | place_building | {'type': 'size-1', 'x': 0, 'y': 7, 'rotation': 0} |
| 1057 | 1 | harbor_sell | {'card': 'A558'} |
| 1064 | 1 | place_building | {'type': 'kiosk', 'x': 1, 'y': 8, 'rotation': 0} |
| 1070 | 1 | place_building | {'type': 'pavilion', 'x': 5, 'y': 10, 'rotation': 0} |

## Table 874269610  (maps ['8a', '8a'], Marine Worlds True; seat 0 = xupengzhi9688, seat 1 = festive-fish176)


### 874269610 turn 68 — MISMATCH (first in this game)

**Error:** player 0, appeal: engine 63, replay 70

| order | player | event | log text |
|---|---|---|---|
| 2007 | xupengzhi9688 | chooseActionCard | xupengzhi9688 chooses action card AnimalsII with strength 5 |
| 2008 | xupengzhi9688 | getBonuses | xupengzhi9688 gains 1 reputation (max strength Animals) |
| 2009 | xupengzhi9688 | takeBonus | xupengzhi9688 gets 1 x xtoken (reputation track bonus) |
| 2010 | xupengzhi9688 | getBonuses | xupengzhi9688 gains 1 xtoken (reputation track bonus) |
| 2014 | xupengzhi9688 | buyAnimal | xupengzhi9688 plays Devil Firefish for 13 and places it in the large aquarium |
| 2019 | xupengzhi9688 | addMeeples | xupengzhi9688 uses Venom effect and gives Venom token(s) to festive-fish176 |
| 2030 | xupengzhi9688 | slideMeeples | xupengzhi9688 takes 1 worker(s) back from the conservation project zone to their notepad (Extra Shift effect) |
| 2031 | xupengzhi9688 | getBonuses | xupengzhi9688 gains 6 appeal (Devil Firefish) |
| 2035 | xupengzhi9688 | buyAnimal | xupengzhi9688 plays Australian Dingo for 10 and places it in a size-2 enclosure |
| 2042 | xupengzhi9688 | increaseSize | xupengzhi9688 increase the size of a a size-3 enclosure |
| 2046 | xupengzhi9688 | getBonuses | xupengzhi9688 gains 2 appeal (Conference On Australia) |
| 2047 | xupengzhi9688 | getBonuses | xupengzhi9688 gains 7 appeal (filling the map) |
| 2051 | xupengzhi9688 | getBonuses | xupengzhi9688 gains 1 appeal (Pack action) |
| 2052 | xupengzhi9688 | getBonuses | xupengzhi9688 gains 3 appeal (Australian Dingo) |
| 2054 | xupengzhi9688 | actionCardCleanup | xupengzhi9688 places action card Animals at position 1 (finishing action) |
| 2061 | xupengzhi9688 | actionCardCleanup | xupengzhi9688 places Cards at position 1 (Clever effect) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2007 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 2014 | 0 | play_animal | {'card': 'A538', 'from_display': False, 'x': 5, 'y': 8} |
| 2019 | 0 | choose_effect | {'apply': 'venom'} |
| 2030 | 0 | choose_effect | {'worker': 53} |
| 2031 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2035 | 0 | play_animal | {'card': 'A424', 'from_display': False, 'x': 8, 'y': 11} |
| 2042 | 0 | choose_effect | {'building': [7, 6], 'x': 6, 'y': 7, 'rotation': 1} |
| 2052 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2061 | 0 | choose_effect | {'type': 'cards'} |

## Table 874274513  (maps ['10', '10'], Marine Worlds True; seat 0 = JohnnyWin, seat 1 = quirky-flamingo170)


### 874274513 turn 63 — ILLEGAL (first in this game)

**Error:** choose_effect {'card': 'S261'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2000 | JohnnyWin | getBonuses | JohnnyWin pays 2 xtoken for increasing card strength |
| 2001 | JohnnyWin | chooseActionCard | JohnnyWin chooses action card SponsorsII with strength 7 |
| 2005 | JohnnyWin | playSponsor | JohnnyWin plays Expansion Area |
| 2009 | JohnnyWin | buyBuilding | JohnnyWin adds a size-3 enclosure for free |
| 2011 | JohnnyWin | pDrawCards | You draw Expert On Africa from the deck |
| 2014 | JohnnyWin | buyAnimal | JohnnyWin tucks Llama in the rescue station (Map10's effect) |
| 2019 | JohnnyWin | getBonuses | JohnnyWin gains 2 appeal (Meerkat Den) |
| 2026 | JohnnyWin | getBonuses | JohnnyWin pays 3 money for buying sponsor card |
| 2027 | JohnnyWin | discardTokens |  |
| 2028 | JohnnyWin | playSponsor | JohnnyWin plays Adventure Playground |
| 2035 | JohnnyWin | buyBuilding | JohnnyWin adds a unique building for free |
| 2036 | JohnnyWin | getBonuses | JohnnyWin gains 4 appeal (Adventure Playground) |
| 2040 | JohnnyWin | playSponsor | JohnnyWin plays Guided School Tours |
| 2046 | JohnnyWin | getBonuses | JohnnyWin gains 1 conservation (Guided School Tours) |
| 2047 | JohnnyWin | getBonuses | JohnnyWin gains 1 appeal (Guided School Tours) |
| 2050 | JohnnyWin | actionCardCleanup | JohnnyWin places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2001 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 2} |
| 2005 | 0 | play_sponsor | {'card': 'S272', 'from_display': False} |
| 2009 | 0 | place_building | {'type': 'size-3', 'x': 1, 'y': 0, 'rotation': 1} |
| 2011 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 2014 | 0 | choose_effect | {'hand': 'A439', 'rescue': True} |
| 2028 | 0 | choose_effect | {'card': 'S255'} |
| 2035 | 0 | place_building | {'type': 'adventure', 'x': 4, 'y': 5, 'rotation': 1} |
| 2040 | 0 | choose_effect | {'card': 'S261'} |

## Table 877649220  (maps ['11', '11'], Marine Worlds True; seat 0 = ANT-Vittorio, seat 1 = kit0330)


### 877649220 turn 27 — ILLEGAL (first in this game)

**Error:** choose_effect {'upgrade': 'cards'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 687 | kit0330 | getBonuses | kit0330 pays 1 xtoken for increasing card strength |
| 688 | kit0330 | chooseActionCard | kit0330 chooses action card AssociationI with strength 5 |
| 692 | kit0330 | slideMeeples | kit0330 supports a conservation project on the third slot : Asia |
| 693 |  | slideMeeples |  |
| 697 | kit0330 | getBonuses | kit0330 gains 2 conservation (Asia) |
| 701 | kit0330 | takeBonus | kit0330 gets 1 x upgrade-card |
| 705 | kit0330 | upgradeCard | kit0330 upgrades CardsII |
| 709 | kit0330 | snapCard | kit0330 snaps Primate breeding program from the display |
| 711 | kit0330 | actionCardCleanup | kit0330 places action card Association at position 1 (finishing action) |
| 715 |  | fillPool | The display is replenished with Federal Grants |
| 717 |  | startBreak | Starting a new break |
| 719 |  | discardTokens | All tokens are removed from player cards |
| 720 |  | slideMeeples | All workers go back to each player's reserve |
| 721 |  | addMeeples | Replenishing partner zoos and universities |
| 722 |  | discardCardsOnDisplay | Removing first two cards of the display: Brown Spider Monkey, Reptile Management Plan |
| 723 |  | fillPool | The display is replenished with Blackside Hawkfish, Shoebill |
| 724 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Okapi Stable |
| 725 |  | fillPool | The display is replenished with African Penguin |
| 726 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: African Bush Elephant |
| 727 |  | fillPool | The display is replenished with Sponsorship: Primates |
| 732 | kit0330 | takeBonus | kit0330 gets 1 x Snapping (map bonus space) |
| 739 | kit0330 | snapCard | kit0330 snaps Shoebill from the display |
| 740 | kit0330 | getBonuses | kit0330 gains 16 money (appeal income) |
| 745 |  | fillPool | The display is replenished with Australian Dingo |
| 749 | ANT-Vittorio | takeBonus | ANT-Vittorio gets 1 x Snapping (map bonus space) |
| 753 | ANT-Vittorio | snapCard | ANT-Vittorio snaps Federal Grants from the display |
| 754 | ANT-Vittorio | getBonuses | ANT-Vittorio gains 12 money (appeal income) |
| 755 | ANT-Vittorio | getBonuses | ANT-Vittorio gains 4 money (map income) |
| 760 |  | finishBreak | End of the break |
| 761 |  | fillPool | The display is replenished with Franchise Business |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 688 | 1 | choose_action_card | {'type': 'association', 'spend': 1} |
| 693 | 1 | association_task | {'task': 'conservation', 'project': 'P106', 'source': 'play', 'slot': 2, 'bonus': {'type': 'Snapping'}} |
| 705 | 1 | choose_effect | {'upgrade': 'cards'} |
| 709 | 1 | take_cards | {'mode': 'snap', 'card': 'P127'} |
| 739 | 1 | take_cards | {'mode': 'snap', 'card': 'A498'} |
| 740 | 1 | choose_effect | {'apply': 'income_appeal'} |
| 753 | 0 | take_cards | {'mode': 'snap', 'card': 'S220'} |
| 754 | 0 | choose_effect | {'apply': 'income_appeal'} |
| 755 | 0 | choose_effect | {'apply': 'income_map'} |

## Table 877798202  (maps ['3a', '3a'], Marine Worlds True; seat 0 = Vivian_kk, seat 1 = Agiagi)


### 877798202 turn 53 — ILLEGAL (first in this game)

**Error:** choose_effect {'bonus_type': 'take-in-range-or-deck', 'n': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1732 | Vivian_kk | chooseActionCard | Vivian_kk chooses action card BuildI with strength 5 |
| 1736 | Vivian_kk | buyBuilding | Vivian_kk pays 10 for building a size-5 enclosure |
| 1737 | Vivian_kk | getBonuses | Vivian_kk gains 1 xtoken (placement bonus) |
| 1738 | Vivian_kk | getBonuses | Vivian_kk gains 1 xtoken (placement bonus) |
| 1745 | Vivian_kk | takeBonus | Vivian_kk gets 1 x bonus-sponsor |
| 1749 | Vivian_kk | getBonuses | Vivian_kk pays 5 money for buying sponsor card |
| 1750 | Vivian_kk | playSponsor | Vivian_kk plays Technology Institute |
| 1751 | Vivian_kk | getBonuses | Vivian_kk gains 1 xtoken (Technology Institute) |
| 1752 | Vivian_kk | getBonuses | Vivian_kk gains 1 appeal (maxing out reputation) |
| 1756 | Vivian_kk | takeBonus | Vivian_kk gets 1 x take-in-range-or-deck |
| 1760 | Vivian_kk | snapCard | Vivian_kk takes Coquerel's Sifaka in reputation range from the display |
| 1762 | Vivian_kk | actionCardCleanup | Vivian_kk places action card Build at position 1 (finishing action) |
| 1766 |  | fillPool | The display is replenished with Marine Biologist |
| 1767 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Slow Worm |
| 1768 |  | fillPool | The display is replenished with Panamanian White-faced Capuchin |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1732 | 0 | choose_action_card | {'type': 'build', 'spend': 0} |
| 1736 | 0 | place_building | {'type': 'size-5', 'x': 7, 'y': 10, 'rotation': 4} |
| 1745 | 0 | choose_effect | {'bonus_type': 'bonus-sponsor', 'n': 1} |
| 1750 | 0 | choose_effect | {'card': 'S209'} |
| 1756 | 0 | choose_effect | {'bonus_type': 'take-in-range-or-deck', 'n': 1} |
| 1760 | 0 | take_cards | {'mode': 'range', 'card': 'A559'} |

## Table 878372500  (maps ['1a', 'T1'], Marine Worlds True; seat 0 = LemoneySnickets, seat 1 = AarkNoVander)


### 878372500 turn 20 — ILLEGAL (first in this game)

**Error:** choose_effect {'keep': None} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 542 | LemoneySnickets | chooseActionCard | LemoneySnickets chooses action card AssociationII with strength 5 |
| 546 | LemoneySnickets | slideMeeples | LemoneySnickets takes a new university |
| 547 |  | discardTokens |  |
| 548 | LemoneySnickets | slideMeeples |  |
| 555 | LemoneySnickets | upgradeCard | LemoneySnickets upgrades BuildII |
| 559 | LemoneySnickets | getBonuses | LemoneySnickets gains 1 reputation (Spokesperson) |
| 560 | LemoneySnickets | takeBonus | LemoneySnickets gets 1 x upgrade-card (reputation track bonus) |
| 567 | LemoneySnickets | upgradeCard | LemoneySnickets upgrades CardsII |
| 571 | LemoneySnickets | getBonuses | LemoneySnickets gains 1 conservation (Science Museum) |
| 573 | LemoneySnickets | pDrawCards | You draw Blackbar Triggerfish for gaining a new university with <SEARCH-SEAANIMAL> |
| 581 | LemoneySnickets | pDrawCards | You draw South American Coati, Mangalica, Greater Rhea for scuba dive effect |
| 583 | LemoneySnickets | pDiscardCards | You discard South American Coati, Mangalica, Greater Rhea (no sponsor) |
| 593 | LemoneySnickets | donation | LemoneySnickets donates 2 money to get 1 conservation |
| 595 | LemoneySnickets | actionCardCleanup | LemoneySnickets places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 542 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 548 | 0 | association_task | {'task': 'university', 'kind': 'fac-generic', 'category': 'marine'} |
| 555 | 0 | choose_effect | {'upgrade': 'build'} |
| 567 | 0 | choose_effect | {'upgrade': 'cards'} |
| 583 | 0 | choose_effect | {'keep': None} |
| 593 | 0 | donate | {} |

## Table 879867929  (maps ['9', '9'], Marine Worlds True; seat 0 = PingisPongus, seat 1 = xifeng)


### 879867929 turn 29 — ILLEGAL (first in this game)

**Error:** play_animal {'card': 'A475', 'from_display': False, 'x': 3, 'y': 2} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 786 | PingisPongus | chooseActionCard | PingisPongus chooses action card AnimalsI with strength 5 |
| 790 | PingisPongus | buyAnimal | PingisPongus plays Sumatran Tiger for 24 and places it in a size-4 enclosure |
| 797 | PingisPongus | discardTokens | PingisPongus removes <ASIA> marker from their map |
| 801 | PingisPongus | takeBonus | PingisPongus gets 1 x reputation (Map 9 effect) |
| 802 | PingisPongus | getBonuses | PingisPongus gains 1 reputation (Map 9 effect) |
| 803 | PingisPongus | takeBonus | PingisPongus gets 1 x upgrade-card (reputation track bonus) |
| 807 | PingisPongus | upgradeCard | PingisPongus upgrades AnimalsII |
| 811 | PingisPongus | getBonuses | PingisPongus gains 2 conservation (Sumatran Tiger) |
| 815 | PingisPongus | takeBonus | PingisPongus gets 1 x upgrade-card |
| 819 | PingisPongus | upgradeCard | PingisPongus upgrades CardsII |
| 823 | PingisPongus | getBonuses | PingisPongus gains 8 appeal (Sumatran Tiger) |
| 824 | PingisPongus | getBonuses | PingisPongus gains 1 reputation (Sumatran Tiger) |
| 828 | PingisPongus | buyAnimal | PingisPongus plays Indian Cobra for 13 and places it in a size-3 enclosure |
| 829 | xifeng | getBonuses | xifeng gains 3 money (Herpetologist) |
| 833 | PingisPongus | getBonuses | PingisPongus gains 6 appeal (Indian Cobra) |
| 838 | PingisPongus | actionCardCleanup | PingisPongus places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 786 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 790 | 0 | play_animal | {'card': 'A407', 'from_display': False, 'x': 5, 'y': 4} |
| 801 | 0 | choose_effect | {'continent': 'Asia', 'bonus_type': 'reputation', 'n': 1} |
| 807 | 0 | choose_effect | {'upgrade': 'animals'} |
| 811 | 0 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 819 | 0 | choose_effect | {'upgrade': 'cards'} |
| 823 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 824 | 0 | choose_effect | {'apply': 'gain', 'res': 'reputation'} |
| 828 | 0 | play_animal | {'card': 'A475', 'from_display': False, 'x': 3, 'y': 2} |
| 833 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 880468340  (maps ['8', '8'], Marine Worlds True; seat 0 = Omgplatypus, seat 1 = dede17111)


### 880468340 turn 12 — ILLEGAL (first in this game)

**Error:** choose_effect {'donate': True} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 318 | Omgplatypus | chooseActionCard | Omgplatypus chooses action card SponsorsI with strength 4 |
| 325 | Omgplatypus | playSponsor | Omgplatypus plays Quarantine Lab |
| 326 | Omgplatypus | getBonuses | Omgplatypus gains 1 xtoken (Quarantine Lab) |
| 327 | Omgplatypus | getBonuses | Omgplatypus gains 1 reputation (Spokesperson) |

**Engine actions derived from the log:**

_no cleanup_


## Table 881630407  (maps ['7a', '7a'], Marine Worlds True; seat 0 = chaoji, seat 1 = PM_Shrimp)


### 881630407 turn 61 — ILLEGAL (first in this game)

**Error:** choose_effect {'card': 'A496', 'mark': True} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2094 | PM_Shrimp | getBonuses | PM_Shrimp pays 3 xtoken for increasing card strength |
| 2095 | PM_Shrimp | chooseActionCard | PM_Shrimp chooses action card AnimalsII with strength 5 |
| 2096 | PM_Shrimp | getBonuses | PM_Shrimp gains 1 reputation (max strength Animals) |
| 2097 | PM_Shrimp | takeBonus | PM_Shrimp gets 1 x conservation (reputation track bonus) |
| 2098 | PM_Shrimp | getBonuses | PM_Shrimp gains 1 conservation (reputation track bonus) |
| 2105 | PM_Shrimp | buyAnimal | PM_Shrimp plays Komodo Dragon for 11 and places it in a size-4 enclosure |
| 2109 | PM_Shrimp | getBonuses | PM_Shrimp gains 5 appeal (Iconic animal) |
| 2110 | PM_Shrimp | endOfGame | End of game triggered: everyone except PM_Shrimp will get a last turn to play |
| 2111 | PM_Shrimp | getBonuses | PM_Shrimp gains 2 appeal (Komodo Dragon) |
| 2115 | PM_Shrimp | buyAnimal | PM_Shrimp plays Nile Crocodile for 13 and places it in the Reptile House |
| 2119 | PM_Shrimp | getBonuses | PM_Shrimp gains 9 appeal (Nile Crocodile) |
| 2123 | PM_Shrimp | snapCard | PM_Shrimp snaps Adventure Playground from the display |
| 2127 |  | fillPool | The display is replenished with Marabou |
| 2131 | PM_Shrimp | snapCard | PM_Shrimp snaps Cotton-top Tamarin from the display |
| 2133 | PM_Shrimp | actionCardCleanup | PM_Shrimp places action card Animals at position 1 (finishing action) |
| 2137 | PM_Shrimp | markCard | PM_Shrimp marks Marabou from display |
| 2141 |  | fillPool | The display is replenished with Southern Blue-ringed Octopus |
| 2142 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: Sharknose Goby |
| 2143 |  | fillPool | The display is replenished with Pygmy Hippopotamus |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2095 | 1 | choose_action_card | {'type': 'animals', 'spend': 3} |
| 2105 | 1 | play_animal | {'card': 'A476', 'from_display': False, 'x': 3, 'y': 12} |
| 2111 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2115 | 1 | play_animal | {'card': 'A469', 'from_display': False, 'x': 6, 'y': 9} |
| 2119 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2123 | 1 | take_cards | {'mode': 'snap', 'card': 'S255'} |
| 2131 | 1 | take_cards | {'mode': 'snap', 'card': 'A468'} |
| 2137 | 1 | choose_effect | {'card': 'A496', 'mark': True} |

## Table 881841416  (maps ['12', '12'], Marine Worlds True; seat 0 = lack, seat 1 = ravelstein)


### 881841416 turn 41 — ILLEGAL (first in this game)

**Error:** choose_effect {'bonus_type': 'reputation', 'n': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1220 | lack | chooseActionCard | lack chooses action card SponsorsI with strength 6 |
| 1224 | lack | playSponsor | lack plays Water Playground |
| 1231 | lack | buyBuilding | lack adds a unique building for free |
| 1232 | lack | getBonuses | lack gains 5 money (placement bonus) |
| 1236 | lack | takeBonus | lack gets 1 x reputation |
| 1237 | lack | getBonuses | lack gains 1 reputation |
| 1238 | lack | takeBonus | lack gets 1 x conservation (reputation track bonus) |
| 1239 | lack | getBonuses | lack gains 1 conservation (reputation track bonus) |
| 1243 | lack | takeBonus | lack gets 1 x Multiplier |
| 1247 | lack | addMeeples | lack adds a multiplier token on action card AssociationII |
| 1248 | lack | getBonuses | lack gains 4 appeal (Water Playground) |
| 1250 | lack | actionCardCleanup | lack places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1220 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 0, 'unpaid': 2} |
| 1224 | 0 | play_sponsor | {'card': 'S256', 'from_display': False} |
| 1231 | 0 | place_building | {'type': 'water-playground', 'x': 4, 'y': 1, 'rotation': 0} |
| 1236 | 0 | choose_effect | {'bonus_type': 'reputation', 'n': 1} |
| 1243 | 0 | choose_effect | {'bonus_type': 'Multiplier', 'n': 1} |
| 1247 | 0 | choose_effect | {'multiplier': 'association'} |

## Table 886820039  (maps ['11', '11'], Marine Worlds True; seat 0 = Nicolexx33, seat 1 = Lucky-boy)


### 886820039 turn 66 — MISMATCH (first in this game)

**Error:** display: only in the engine: S250; only in the replay: S236; player 1, hand: only in the replay: S250; main deck: only in the engine: S236

| order | player | event | log text |
|---|---|---|---|
| 1727 | Lucky-boy | chooseActionCard | Lucky-boy chooses action card AnimalsII with strength 5 |
| 1728 | Lucky-boy | getBonuses | Lucky-boy gains 1 reputation (max strength Animals) |
| 1732 | Lucky-boy | buyAnimal | Lucky-boy buys Wolverine from display for 16 and places it in a size-3 enclosure |
| 1736 | Lucky-boy | getBonuses | Lucky-boy gains 1 reputation (Wolverine) |
| 1737 | Lucky-boy | takeBonus | Lucky-boy gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1739 | Lucky-boy | pDrawCards | You draw Golden Snub-nosed Monkey from the deck |
| 1743 | Lucky-boy | getBonuses | Lucky-boy gains 5 appeal (Wolverine) |
| 1747 | Lucky-boy | buyAnimal | Lucky-boy plays Zooplankton for 4 and places it in the small aquarium |
| 1751 | Lucky-boy | getBonuses | Lucky-boy gains 1 appeal (Zooplankton) |
| 1752 | Lucky-boy | sponsorMagnet | Lucky-boy takes Sea Turtle Tank from the display (Sea animal magnet effect) |
| 1754 | Lucky-boy | actionCardCleanup | Lucky-boy places action card Animals at position 1 (finishing action) |
| 1761 | Lucky-boy | markCard | Lucky-boy marks Sheep from display |
| 1765 | Lucky-boy | actionCardCleanup | Lucky-boy places Association at position 5 (Boost effect) |
| 1769 |  | fillPool | The display is replenished with Donkey, Primatologist |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1727 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1732 | 1 | play_animal | {'card': 'A556', 'from_display': True, 'x': 3, 'y': 2} |
| 1736 | 1 | choose_effect | {'apply': 'gain', 'res': 'reputation'} |
| 1739 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1743 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1747 | 1 | play_animal | {'card': 'A532', 'from_display': False, 'x': 7, 'y': 12} |
| 1751 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1752 | 1 | magnet_note | {'ability': 'Sea Animal Magnet'} |
| 1761 | 1 | choose_effect | {'card': 'A520', 'mark': True} |
| 1765 | 1 | choose_effect | {'boost': 'association', 'position': 5} |

## Table 889209922  (maps ['13', '13'], Marine Worlds True; seat 0 = Yuanzhuzhe, seat 1 = BoboTeaa)


### 889209922 turn 46 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'snap', 'card': 'A486'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1474 | BoboTeaa | chooseActionCard | BoboTeaa chooses action card AnimalsII with strength 5 |
| 1475 | BoboTeaa | getBonuses | BoboTeaa gains 1 reputation (max strength Animals) |
| 1479 | BoboTeaa | buyAnimal | BoboTeaa plays Palette Surgeonfish for 6 and places it in the large aquarium |
| 1481 | BoboTeaa | getBonuses | BoboTeaa gains 3 money (Southern Blue-ringed Octopus) |
| 1485 | BoboTeaa | getBonuses | BoboTeaa gains 4 appeal (Palette Surgeonfish) |
| 1489 | BoboTeaa | getBonuses | BoboTeaa gains 2 appeal (Orange Clownfish) |
| 1493 | BoboTeaa | getBonuses | BoboTeaa pays <MONEY:2> to gain <APPEAL:1> (Animals3 ability) |
| 1500 | BoboTeaa | buyAnimal | BoboTeaa plays Mediterranean Rainbow Wrasse for 8 and places it in the large aquarium |
| 1504 | BoboTeaa | getBonuses | BoboTeaa gains 3 appeal (Mediterranean Rainbow Wrasse) |
| 1508 | BoboTeaa | getBonuses | BoboTeaa pays <MONEY:2> to gain <APPEAL:1> (Animals3 ability) |
| 1514 | BoboTeaa | pDiscardCards | You pouch Expansion Area cards for 2 appeal |
| 1521 | BoboTeaa | buyAnimal | BoboTeaa plays Tambaqui for 12 and places it in the large aquarium |
| 1522 | BoboTeaa | getBonuses | BoboTeaa gains 3 money (Expert In Herbivores) |
| 1526 | BoboTeaa | getBonuses | BoboTeaa gains 5 appeal (Tambaqui) |
| 1530 | BoboTeaa | getBonuses | BoboTeaa pays <MONEY:2> to gain <APPEAL:1> (Animals3 ability) |
| 1537 | BoboTeaa | snapCard | BoboTeaa snaps Common Wall Lizard from the display |
| 1539 | BoboTeaa | pDrawCards | You draw Specialized Species Zoo for adapt effect |
| 1544 | BoboTeaa | pDiscardCards | You discard Aquatic Park for adapt effect |
| 1549 | BoboTeaa | actionCardCleanup | BoboTeaa places action card Animals at position 1 (finishing action) |
| 1553 |  | fillPool | The display is replenished with Science Lab |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1474 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1479 | 1 | play_animal | {'card': 'A531', 'from_display': False, 'x': 5, 'y': 0} |
| 1481 | 1 | choose_effect | {'apply': 'gain', 'res': 'money'} |
| 1485 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1489 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1493 | 1 | choose_effect | {'apply': 'pay_appeal'} |
| 1500 | 1 | play_animal | {'card': 'A547', 'from_display': False, 'x': 5, 'y': 0} |
| 1504 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1508 | 1 | choose_effect | {'apply': 'pay_appeal'} |
| 1514 | 1 | choose_effect | {'card': 'S272', 'psrc': 'A547'} |
| 1521 | 1 | play_animal | {'card': 'A553', 'from_display': False, 'x': 5, 'y': 0} |
| 1526 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1530 | 1 | choose_effect | {'apply': 'pay_appeal'} |
| 1537 | 1 | take_cards | {'mode': 'snap', 'card': 'A486'} |
| 1544 | 1 | choose_effect | {'discard': ['F011']} |

## Table 890439778  (maps ['5a', '5a'], Marine Worlds True; seat 0 = acquittance, seat 1 = mdlzg)


### 890439778 turn 17 — ILLEGAL (first in this game)

**Error:** choose_effect {'donate': True} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 492 | acquittance | chooseActionCard | acquittance chooses action card SponsorsII with strength 3 |
| 499 | acquittance | playSponsor | acquittance buys Publications from display |
| 500 | acquittance | getBonuses | acquittance pays 3 money for playing sponsor from reputation range |
| 504 | acquittance | getBonuses | acquittance gains 1 reputation (Spokesperson) |
| 505 | acquittance | takeBonus | acquittance gets 1 x upgrade-card (reputation track bonus) |
| 509 | acquittance | upgradeCard | acquittance upgrades AnimalsII |
| 515 | acquittance | donation | acquittance donates for free to get 1 conservation |
| 521 | acquittance | actionCardCleanup | acquittance places action card Sponsors at position 1 (finishing action) |
| 525 |  | fillPool | The display is replenished with Arcade |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 492 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 499 | 0 | play_sponsor | {'card': 'S273', 'from_display': True} |
| 509 | 0 | choose_effect | {'upgrade': 'animals'} |
| 515 | 0 | choose_effect | {'donate': True} |

## Table 894764261  (maps ['6a', '6a'], Marine Worlds True; seat 0 = HOONBO, seat 1 = FuerZuljin)


### 894764261 turn 82 — ILLEGAL (first in this game)

**Error:** choose_effect {'activate': True} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2042 | FuerZuljin | chooseActionCard | FuerZuljin chooses action card AnimalsII with strength 5 |
| 2043 | FuerZuljin | getBonuses | FuerZuljin gains 1 reputation (max strength Animals) |
| 2044 | FuerZuljin | takeBonus | FuerZuljin gets 1 x conservation (reputation track bonus) |
| 2045 | FuerZuljin | getBonuses | FuerZuljin gains 1 conservation (reputation track bonus) |
| 2049 | FuerZuljin | buyAnimal | FuerZuljin plays Lion for 13 and places it in a size-4 enclosure |
| 2050 | FuerZuljin | getBonuses | FuerZuljin gains 3 money (Expert In Predators) |
| 2054 | FuerZuljin | getBonuses | FuerZuljin gains 9 appeal (Lion) |
| 2055 | FuerZuljin | getBonuses | FuerZuljin gains 5 appeal (Pack action) |
| 2059 | FuerZuljin | buyAnimal | FuerZuljin buys Panamanian White-faced Capuchin from display for 13 and places it in a size-2 enclosure |
| 2060 | FuerZuljin | getBonuses | FuerZuljin gains 3 money (Primatologist) |
| 2064 | FuerZuljin | getBonuses | FuerZuljin gains 5 appeal (Panamanian White-faced Capuchin) |
| 2066 | FuerZuljin | pDrawCards | You draw Rock Monitor for sprint effect |
| 2074 | FuerZuljin | actionCardCleanup | FuerZuljin places action card Animals at position 1 (finishing action) |
| 2078 |  | fillPool | The display is replenished with Frilled Lizard |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2042 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 2049 | 1 | play_animal | {'card': 'A402', 'from_display': False, 'x': 2, 'y': 1} |
| 2054 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2059 | 1 | play_animal | {'card': 'A463', 'from_display': True, 'x': 6, 'y': 9} |
| 2064 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2066 | 1 | choose_effect | {'activate': True} |

## Table 900401029  (maps ['4a', '4a'], Marine Worlds True; seat 0 = mem-cyo, seat 1 = Quinlan1)


### 900401029 turn 6 — ILLEGAL (first in this game)

**Error:** choose_effect {'cards': []} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 221 | mem-cyo | chooseActionCard | mem-cyo chooses action card AnimalsI with strength 4 |
| 225 | mem-cyo | buyAnimal | mem-cyo plays Caracal for 9 and places it in a size-2 enclosure |
| 227 | mem-cyo | pDrawCards | You draw Chinese Water Dragon, American Bison for hunter effect |
| 232 | mem-cyo | pDiscardCards | You keep American Bison and discard Chinese Water Dragon for hunter effect |
| 236 | mem-cyo | getBonuses | mem-cyo gains 4 appeal (Caracal) |
| 238 | mem-cyo | actionCardCleanup | mem-cyo places action card Animals at position 1 (finishing action) |
| 243 | mem-cyo | pDiscardCards | You sell cards for |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 221 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 225 | 0 | play_animal | {'card': 'A404', 'from_display': False, 'x': 1, 'y': 10} |
| 232 | 0 | choose_effect | {'keep': 'A436'} |
| 236 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 243 | 0 | choose_effect | {'cards': []} |

## Table 901779082  (maps ['2a', '2a'], Marine Worlds True; seat 0 = Papa Emeritus V, seat 1 = jfr33zy)


### 901779082 turn 49 — ILLEGAL (first in this game)

**Error:** choose_effect {'type': 'build'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1525 | Papa Emeritus V | chooseActionCard | Papa Emeritus V chooses action card AssociationII with strength 5 |
| 1529 | Papa Emeritus V | slideMeeples | Papa Emeritus V supports a conservation project on the first slot : Sea Animals |
| 1530 |  | slideMeeples |  |
| 1534 | Papa Emeritus V | getBonuses | Papa Emeritus V gains 5 conservation (Sea Animals) |
| 1538 | Papa Emeritus V | snapCard | Papa Emeritus V snaps Proboscis Monkey from the display |
| 1542 | Papa Emeritus V | donation | Papa Emeritus V donates 7 money to get 1 conservation |
| 1544 | Papa Emeritus V | actionCardCleanup | Papa Emeritus V places action card Association at position 1 (finishing action) |
| 1548 | Papa Emeritus V | actionCardCleanup | Papa Emeritus V places Build at position 1 (Clever effect) |
| 1552 |  | fillPool | The display is replenished with Marine Research Expedition |
| 1553 |  | discardCardsOnDisplay | Removing 1 cards of the display due to Wave icons reveal: New Zealand Fur Seal |
| 1554 |  | fillPool | The display is replenished with Lion |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1525 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 1530 | 0 | association_task | {'task': 'conservation', 'project': 'P133', 'source': 'play', 'slot': 0, 'bonus': {'type': 'Snapping'}} |
| 1538 | 0 | take_cards | {'mode': 'snap', 'card': 'A451'} |
| 1542 | 0 | donate | {} |
| 1548 | 0 | choose_effect | {'type': 'build'} |
