# Differential problems: move-by-move breakdown

Generated from the differential run (chain=False) on `log_examples/`. For each problem: the error, the log events of the turn (order, player, event, text) and the engine actions the harness derived from them. Problems after the first one of a game may be consequences of it.

## Summary

| # | table | turn | kind | first in game | problem |
|---|---|---|---|---|---|
| 1 | 608893163 | 66 | illegal move | yes | choose_effect {'index': 1, 'rep_bonus': 0} not in legal_actions |
| 2 | 699702676 | 0 | state mismatch | yes | player 0, hand: only in the engine: A486; only in the replay: S216; main deck: only in the engine: S216; only in the replay: A486 |
| 3 | 730595633 | 40 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'multiplier', 'optional': False, 'player': 1}] |
| 4 | 761315720 | 64 | illegal move | yes | choose_effect {'type': 'build'} not in legal_actions |
| 5 | 765417594 | 46 | illegal move | yes | place_building {'type': 'kiosk', 'x': 7, 'y': 0, 'rotation': 0, 'extra': True} not in legal_actions |
| 6 | 765592991 | 65 | illegal move | yes | a mandatory effect is still pending: [{'kind': 'multiplier', 'optional': False, 'player': 1}] |
| 7 | 826013800 | 66 | illegal move | yes | choose_effect {'type': 'animals'} not in legal_actions |
| 8 | 832762065 | 38 | illegal move | yes | donate {} not in legal_actions |
| 9 | 888587994 | 27 | state mismatch | yes | player 1, tokens: only in the replay: ('token', 'S253_OkapiStable') |

9 problems in 9 games (7 illegal moves, 2 state mismatches). The first problem of a game is the one to look at, the others may be consequences.


## Table 608893163  (maps ['8a', '8a'], Marine Worlds True; seat 0 = JDansp, seat 1 = madsovich)


### 608893163 turn 66 — ILLEGAL (first in this game)

**Error:** choose_effect {'index': 1, 'rep_bonus': 0} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1803 | JDansp | getBonuses | JDansp pays 1 xtoken for increasing card strength |
| 1804 | JDansp | chooseActionCard | JDansp chooses action card AssociationI with strength 4 |
| 1808 | JDansp | slideMeeples | JDansp takes a new university |
| 1809 |  | discardTokens |  |
| 1810 | JDansp | slideMeeples |  |
| 1812 | JDansp | pDrawCards | You draw Southern Blue-ringed Octopus for gaining a new university with <SEARCH-SEAANIMAL> |
| 1819 | JDansp | getBonuses | JDansp gains 1 conservation (university) |
| 1823 | JDansp | takeBonus | JDansp gets 3 x xtoken (maxing out reputation) |
| 1824 | JDansp | getBonuses | JDansp gains 3 xtoken (maxing out reputation) |
| 1826 | JDansp | actionCardCleanup | JDansp places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1804 | 0 | choose_action_card | {'type': 'association', 'spend': 1} |
| 1810 | 0 | association_task | {'task': 'university', 'kind': 'fac-generic', 'category': 'marine'} |
| 1823 | 0 | choose_effect | {'bonus_type': 'xtoken', 'n': 3} |

## Table 699702676  (maps ['8a', '8a'], Marine Worlds True; seat 0 = qkb858, seat 1 = ryo64)


### 699702676 turn 0 — MISMATCH (first in this game)

**Error:** player 0, hand: only in the engine: A486; only in the replay: S216; main deck: only in the engine: S216; only in the replay: A486

| order | player | event | log text |
|---|---|---|---|
| 60 | qkb858 | chooseActionCard | qkb858 chooses action card SponsorsI with strength 4 |
| 64 | qkb858 | playSponsor | qkb858 plays Adventure Playground |
| 68 | qkb858 | getBonuses | qkb858 gains 4 appeal (Adventure Playground) |
| 72 | qkb858 | buyBuilding | qkb858 adds a unique building for free |
| 77 | qkb858 | pDrawCards | You draw Rhesus Monkey Park from the deck |
| 82 | qkb858 | pDrawCards | You draw Talented Communicator from the deck (Map 8 effect) |
| 87 | qkb858 | actionCardCleanup | qkb858 places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 60 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 64 | 0 | play_sponsor | {'card': 'S255', 'from_display': False} |
| 72 | 0 | place_building | {'type': 'adventure', 'x': 7, 'y': 8, 'rotation': 5} |
| 77 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 82 | 0 | choose_effect | {'apply': 'search_sponsor'} |

## Table 730595633  (maps ['4a', '4a'], Marine Worlds True; seat 0 = Lux6556, seat 1 = New Zealand fur seal)


### 730595633 turn 40 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'multiplier', 'optional': False, 'player': 1}]

| order | player | event | log text |
|---|---|---|---|
| 1074 | New Zealand fur seal | chooseActionCard | New Zealand fur seal chooses action card SponsorsII with strength 5 |
| 1079 | New Zealand fur seal | advanceBreak | New Zealand fur seal advances break token of 5 space(s), now at 7/9 |
| 1080 | New Zealand fur seal | getBonuses | New Zealand fur seal gains 10 money |

**Engine actions derived from the log:**

_no cleanup_


## Table 761315720  (maps ['4a', '4a'], Marine Worlds True; seat 0 = elephant542, seat 1 = sareyu0753)


### 761315720 turn 64 — ILLEGAL (first in this game)

**Error:** choose_effect {'type': 'build'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1977 | elephant542 | getBonuses | elephant542 pays 2 xtoken for increasing card strength |
| 1978 | elephant542 | chooseActionCard | elephant542 chooses action card SponsorsII with strength 3 |
| 1982 | elephant542 | playSponsor | elephant542 buys Expert In Herbivores from display |
| 1983 | elephant542 | getBonuses | elephant542 pays 2 money for playing sponsor from reputation range |
| 1984 | elephant542 | getBonuses | elephant542 gains 3 money (Expert In Herbivores) |
| 1991 | elephant542 | getBonuses | elephant542 pays 6 money for buying sponsor card |
| 1992 | elephant542 | discardTokens |  |
| 1993 | elephant542 | playSponsor | elephant542 plays Amazon House |
| 1994 | elephant542 | getBonuses | elephant542 gains 3 money (Expert In Herbivores) |
| 1998 | elephant542 | getBonuses | elephant542 gains 4 appeal (Amazon House) |
| 2005 | elephant542 | buyBuilding | elephant542 adds a size-5 enclosure for free |
| 2006 | elephant542 | getBonuses | elephant542 gains 1 money (Hydrologist) |
| 2013 | elephant542 | addMeeples | elephant542 adds a multiplier token on action card AssociationII |
| 2017 | elephant542 | getBonuses | elephant542 gains 2 conservation (Amazon House) |
| 2023 | elephant542 | getBonuses | elephant542 gains 2 appeal (Aquarium) |
| 2024 | elephant542 | getBonuses | elephant542 gains 1 reputation (Amazon House) |
| 2027 | elephant542 | actionCardCleanup | elephant542 places action card Sponsors at position 1 (finishing action) |
| 2031 | elephant542 | actionCardCleanup | elephant542 places Build at position 1 (Clever effect) |
| 2035 |  | fillPool | The display is replenished with Collared Mangabey |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1978 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 2} |
| 1982 | 0 | play_sponsor | {'card': 'S240', 'from_display': True} |
| 1993 | 0 | choose_effect | {'card': 'S278'} |
| 2005 | 0 | place_building | {'type': 'amazon', 'x': 7, 'y': 8, 'rotation': 5} |
| 2013 | 0 | choose_effect | {'multiplier': 'association'} |
| 2031 | 0 | choose_effect | {'type': 'build'} |

## Table 765417594  (maps ['4a', '4a'], Marine Worlds True; seat 0 = Gouverneur, seat 1 = Altherän)


### 765417594 turn 46 — ILLEGAL (first in this game)

**Error:** place_building {'type': 'kiosk', 'x': 7, 'y': 0, 'rotation': 0, 'extra': True} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1422 | Altherän | getBonuses | Altherän pays 1 xtoken for increasing card strength |
| 1423 | Altherän | chooseActionCard | Altherän chooses action card BuildII with strength 5 |
| 1427 | Altherän | buyBuilding | Altherän pays 10 for building the Large Bird Aviary |
| 1428 | Altherän | getBonuses | Altherän gains 1 xtoken (placement bonus) |
| 1432 | Altherän | getBonuses | Altherän gains 1 reputation (placement bonus) |
| 1433 | Altherän | takeBonus | Altherän gets 1 x upgrade-card (reputation track bonus) |
| 1437 | Altherän | upgradeCard | Altherän upgrades AnimalsII |
| 1444 | Altherän | addMeeples | Altherän adds a multiplier token on action card AssociationI |
| 1455 | Altherän | pDiscardCards | You sell Sea Cave cards for 3 money |
| 1468 | Altherän | buyBuilding | Altherän pays 2 for building a Kiosk |
| 1471 | Altherän | actionCardCleanup | Altherän places action card Build at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1423 | 1 | choose_action_card | {'type': 'build', 'spend': 1} |
| 1427 | 1 | place_building | {'type': 'large-bird-aviary', 'x': 6, 'y': 3, 'rotation': 1} |
| 1437 | 1 | choose_effect | {'upgrade': 'animals'} |
| 1444 | 1 | choose_effect | {'multiplier': 'association'} |
| 1455 | 1 | harbor_sell | {'card': 'P121'} |
| 1468 | 1 | place_building | {'type': 'kiosk', 'x': 7, 'y': 0, 'rotation': 0} |

## Table 765592991  (maps ['4a', '4a'], Marine Worlds True; seat 0 = shiq17, seat 1 = gamergirl1994)


### 765592991 turn 65 — ILLEGAL (first in this game)

**Error:** a mandatory effect is still pending: [{'kind': 'multiplier', 'optional': False, 'player': 1}]

| order | player | event | log text |
|---|---|---|---|
| 2069 | gamergirl1994 | chooseActionCard | gamergirl1994 chooses action card AnimalsII with strength 5 |
| 2070 | gamergirl1994 | getBonuses | gamergirl1994 gains 1 reputation (max strength Animals) |
| 2071 | gamergirl1994 | takeBonus | gamergirl1994 gets 1 x take-in-range-or-deck (reputation track bonus) |
| 2075 | gamergirl1994 | snapCard | gamergirl1994 takes Predator breeding program in reputation range from the display |
| 2079 | gamergirl1994 | buyAnimal | gamergirl1994 plays Gould's Monitor for 12 and places it in a size-3 enclosure |
| 2081 | gamergirl1994 | pDrawCards | You draw Expert In Small Animals, Bennett's Wallaby from discard for scavenging effect |
| 2089 | gamergirl1994 | pDiscardCards | You keep Expert In Small Animals and discard Bennett's Wallaby for scavenging effect |
| 2093 | gamergirl1994 | getBonuses | gamergirl1994 gains 6 appeal (Gould's Monitor) |
| 2098 | gamergirl1994 | pDiscardCards | You sell Sand Tiger Shark cards for 3 money |
| 2105 | gamergirl1994 | buyAnimal | gamergirl1994 plays Emu for 19 and places it in a size-5 enclosure |
| 2109 | gamergirl1994 | getBonuses | gamergirl1994 gains 2 appeal (Penguin Pool) |
| 2113 | gamergirl1994 | getBonuses | gamergirl1994 gains 7 appeal (Emu) |
| 2117 | gamergirl1994 | buyBuilding | gamergirl1994 adds the Large Bird Aviary (Emu) |
| 2118 | gamergirl1994 | getBonuses | gamergirl1994 gains 1 xtoken (placement bonus) |
| 2122 | gamergirl1994 | getBonuses | gamergirl1994 gains 1 reputation (placement bonus) |
| 2123 | gamergirl1994 | takeBonus | gamergirl1994 gets 1 x conservation (reputation track bonus) |
| 2124 | gamergirl1994 | getBonuses | gamergirl1994 gains 1 conservation (reputation track bonus) |
| 2131 | gamergirl1994 | addMeeples | gamergirl1994 adds a multiplier token on action card AssociationI |
| 2135 | gamergirl1994 | moveAnimal | gamergirl1994 moves Marabou into the the Large Bird Aviary and free a size-3 enclosure |
| 2137 | gamergirl1994 | actionCardCleanup | gamergirl1994 places action card Animals at position 1 (finishing action) |
| 2141 |  | fillPool | The display is replenished with Wolf |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2069 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 2075 | 1 | take_cards | {'mode': 'range', 'card': 'P124'} |
| 2079 | 1 | play_animal | {'card': 'A490', 'from_display': False, 'x': 4, 'y': 1} |
| 2081 | 1 | choose_effect | {'activate': True} |
| 2089 | 1 | choose_effect | {'keep': 'S229', 'drawn': ['S229', 'A528']} |
| 2093 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2098 | 1 | harbor_sell | {'card': 'A546'} |
| 2105 | 1 | play_animal | {'card': 'A514', 'from_display': False, 'x': 8, 'y': 7} |
| 2113 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2117 | 1 | place_building | {'type': 'large-bird-aviary', 'x': 6, 'y': 3, 'rotation': 1} |
| 2131 | 1 | choose_effect | {'multiplier': 'association'} |
| 2135 | 1 | choose_effect | {'move': 'A496', 'from': [2, 9]} |

## Table 826013800  (maps ['11', '11'], Marine Worlds True; seat 0 = aziaksfl, seat 1 = mal514)


### 826013800 turn 66 — ILLEGAL (first in this game)

**Error:** choose_effect {'type': 'animals'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1874 | mal514 | getBonuses | mal514 pays 1 xtoken for increasing card strength |
| 1875 | mal514 | chooseActionCard | mal514 chooses action card SponsorsI with strength 6 |
| 1882 | mal514 | playSponsor | mal514 plays Cable Car |
| 1889 | mal514 | buyBuilding | mal514 adds a unique building for free |
| 1890 | mal514 | getBonuses | mal514 gains 5 money (placement bonus) |
| 1891 | mal514 | getBonuses | mal514 gains 4 appeal (Cable Car) |
| 1895 | mal514 | getBonuses | mal514 trades 1<XTOKEN> for <MONEY:5> (Trade effect) |

**Engine actions derived from the log:**

_no cleanup_


## Table 832762065  (maps ['13', '14'], Marine Worlds True; seat 0 = Sergentio, seat 1 = sparrow565)


### 832762065 turn 38 — ILLEGAL (first in this game)

**Error:** donate {} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1033 | Sergentio | getBonuses | Sergentio pays 1 xtoken for increasing card strength |
| 1034 | Sergentio | chooseActionCard | Sergentio chooses action card AssociationII with strength 5 |
| 1038 | Sergentio | slideMeeples | Sergentio supports a conservation project on the second slot : Sea Animal Management Plan |
| 1039 | Sergentio | moveProjects | Sergentio plays a new conservation project: Sea Animal Management Plan |
| 1040 |  | slideMeeples |  |
| 1044 | Sergentio | getBonuses | Sergentio gains 1 reputation (adding a new conservation project) |
| 1048 | Sergentio | getBonuses | Sergentio gains 2 conservation (Sea Animal Management Plan) |
| 1052 | Sergentio | takeBonus | Sergentio triggers scoring card discard by reaching 10 conservation points |
| 1056 | Sergentio | pDiscardCards | You discard Aquatic Park (scoring card) |
| 1059 | sparrow565 | pDiscardCards | You discard Catered Picnic Areas (scoring card) |
| 1067 | Sergentio | getBonuses | Sergentio gains 2 reputation (Sea Animal Management Plan) |
| 1068 | Sergentio | takeBonus | Sergentio gets 1 x upgrade-card (reputation track bonus) |
| 1075 | Sergentio | upgradeCard | Sergentio upgrades AnimalsII |
| 1082 | Sergentio | donation | Sergentio donates 2 money to get 1 conservation |
| 1084 | Sergentio | actionCardCleanup | Sergentio places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1034 | 0 | choose_action_card | {'type': 'association', 'spend': 1} |
| 1040 | 0 | association_task | {'task': 'conservation', 'project': 'P138', 'source': 'hand', 'slot': 1, 'bonus': {'slot': 3}} |
| 1056 | 0 | choose_effect | {'card': 'F011'} |
| 1059 | 1 | choose_effect | {'card': 'F015'} |
| 1075 | 0 | choose_effect | {'upgrade': 'animals'} |
| 1082 | 0 | donate | {} |

## Table 888587994  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = N3EE, seat 1 = 653862455)


### 888587994 turn 27 — MISMATCH (first in this game)

**Error:** player 1, tokens: only in the replay: ('token', 'S253_OkapiStable')

| order | player | event | log text |
|---|---|---|---|
| 619 | 653862455 | chooseActionCard | 653862455 chooses action card SponsorsII with strength 4 |
| 624 | 653862455 | advanceBreak | 653862455 advances break token of 4 space(s), now at 6/9 |
| 625 | 653862455 | getBonuses | 653862455 gains 8 money |
| 627 | 653862455 | pDiscardCards | You discard Stoat to play a Sponsor card for money (Sponsors4 effect) |
| 634 | 653862455 | getBonuses | 653862455 pays 6 money for buying sponsor card |
| 635 | 653862455 | playSponsor | 653862455 plays Okapi Stable |
| 642 | 653862455 | buyBuilding | 653862455 adds a unique building for free |
| 649 | 653862455 | getBonuses | 653862455 pays 5 money for buying sponsor card |
| 650 | 653862455 | playSponsor | 653862455 plays Talented Communicator |
| 651 | 653862455 | slideMeeples | 653862455 gains a new Association worker |
| 652 | 653862455 | getBonuses | 653862455 gains 1 reputation (1st worker bonus) |
| 654 | 653862455 | pDrawCards | You draw Foreign Institute, Saltwater Crocodile, Mangalica from discard for scavenging effect |
| 659 | 653862455 | pDiscardCards | You keep Foreign Institute and discard Saltwater Crocodile, Mangalica for scavenging effect |
| 667 | 653862455 | actionCardCleanup | 653862455 places action card Sponsors at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 619 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 624 | 1 | sponsor_break | {} |
| 635 | 1 | sponsor_side | {'op': 'discard_play', 'card': 'A420', 'play': 'S253'} |
| 642 | 1 | place_building | {'type': 'okapi', 'x': 4, 'y': 5, 'rotation': 1} |
| 650 | 1 | play_sponsor | {'card': 'S216', 'from_display': False} |
| 654 | 1 | choose_effect | {'activate': True} |
| 659 | 1 | choose_effect | {'keep': 'S226', 'drawn': ['S226', 'A489', 'A524']} |
