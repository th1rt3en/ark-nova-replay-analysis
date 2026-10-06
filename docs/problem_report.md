# Differential problems: move-by-move breakdown

Generated from the differential run (chain=False) on `log_examples/`. For each problem: the error, the log events of the turn (order, player, event, text) and the engine actions the harness derived from them. Problems after the first one of a game may be consequences of it.

## Summary

| # | table | turn | kind | first in game | problem |
|---|---|---|---|---|---|
| 1 | 790136149 | 68 | illegal move | yes | choose_effect {'discard': ['F014', 'F015', 'F017']} not in legal_actions |
| 2 | 790136149 | 69 | illegal move | no | choose_effect {'discard': ['F003', 'F004', 'F007']} not in legal_actions |
| 3 | 790163218 | 76 | illegal move | yes | choose_effect {'discard': ['F004', 'F012', 'F016']} not in legal_actions |
| 4 | 790163218 | 77 | illegal move | no | choose_effect {'discard': ['F001', 'F008', 'F011']} not in legal_actions |
| 5 | 791338307 | 70 | illegal move | yes | choose_effect {'discard': ['F004', 'F008', 'F015']} not in legal_actions |
| 6 | 792415679 | 62 | illegal move | yes | choose_effect {'discard': ['F009', 'F014', 'F017']} not in legal_actions |
| 7 | 792538490 | 72 | illegal move | yes | choose_effect {'discard': ['F004', 'F010', 'F014']} not in legal_actions |
| 8 | 794560478 | 57 | illegal move | yes | choose_effect {'discard': ['F003', 'F010', 'F016']} not in legal_actions |
| 9 | 795240335 | 80 | illegal move | yes | choose_effect {'discard': ['F006', 'F010', 'F014']} not in legal_actions |
| 10 | 796192448 | 71 | illegal move | yes | choose_effect {'discard': ['F002', 'F005', 'F010']} not in legal_actions |
| 11 | 800560514 | 77 | illegal move | yes | choose_effect {'discard': ['F002', 'F011', 'F013']} not in legal_actions |
| 12 | 800669330 | 73 | illegal move | yes | choose_effect {'discard': ['F009', 'F010', 'F015']} not in legal_actions |
| 13 | 800980926 | 67 | illegal move | yes | choose_effect {'discard': ['F012', 'F013', 'F017']} not in legal_actions |
| 14 | 801014048 | 58 | illegal move | yes | choose_effect {'discard': ['F010', 'F011', 'F014']} not in legal_actions |
| 15 | 812408052 | 65 | illegal move | yes | choose_effect {'discard': ['F008', 'F010', 'F015']} not in legal_actions |
| 16 | 812408052 | 66 | illegal move | no | choose_effect {'discard': ['F005', 'F011', 'F016']} not in legal_actions |
| 17 | 830941401 | 79 | illegal move | yes | choose_effect {'discard': ['F002', 'F010', 'F016']} not in legal_actions |
| 18 | 830941401 | 88 | illegal move | no | choose_effect {'discard': ['F005', 'F011', 'F012']} not in legal_actions |
| 19 | 841035593 | 72 | illegal move | yes | choose_effect {'discard': ['F003', 'F009', 'F012']} not in legal_actions |
| 20 | 884514602 | 78 | illegal move | yes | choose_effect {'discard': ['F004', 'F012', 'F017']} not in legal_actions |

20 problems in 16 games (20 illegal moves, 0 state mismatches). The first problem of a game is the one to look at, the others may be consequences.


## Table 790136149  (maps ['13', '13'], Marine Worlds True; seat 0 = kelkoo, seat 1 = crossingwalls)


### 790136149 turn 68 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F014', 'F015', 'F017']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1984 | kelkoo | getBonuses | kelkoo pays 4 xtoken for increasing card strength |
| 1985 | kelkoo | chooseActionCard | kelkoo chooses action card AssociationI with strength 5 |
| 1989 | kelkoo | slideMeeples | kelkoo supports a conservation project on the first slot : Species Diversity |
| 1990 |  | discardCardsOnDisplay | The rightmost project card is discarded: Blue mountains national park |
| 1991 | kelkoo | moveProjects | kelkoo plays a new conservation project: Species Diversity |
| 1992 |  | slideMeeples |  |
| 1996 | kelkoo | endOfGame | End of game triggered: everyone except kelkoo will get a last turn to play |
| 1997 | kelkoo | getBonuses | kelkoo gains 5 conservation (Species Diversity) |
| 1999 | kelkoo | pDrawCards | You draw International Zoo, Catered Picnic Areas, Specialized Species Zoo for adapt effect |
| 2004 | kelkoo | pDiscardCards | You discard Catered Picnic Areas, Specialized Species Zoo, International Zoo for adapt effect |
| 2009 | kelkoo | actionCardCleanup | kelkoo places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1985 | 0 | choose_action_card | {'type': 'association', 'spend': 4} |
| 1992 | 0 | association_task | {'task': 'conservation', 'project': 'P101', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |
| 2004 | 0 | choose_effect | {'discard': ['F014', 'F015', 'F017']} |

### 790136149 turn 69 — ILLEGAL (later; may be a consequence)

**Error:** choose_effect {'discard': ['F003', 'F004', 'F007']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2018 | crossingwalls | getBonuses | crossingwalls pays 3 xtoken for increasing card strength |
| 2019 | crossingwalls | chooseActionCard | crossingwalls chooses action card AssociationI with strength 5 |
| 2023 | crossingwalls | slideMeeples | crossingwalls supports a conservation project on the first slot : Europe |
| 2024 | crossingwalls | discardTokens | crossingwalls uses 1 x bonus-icon |
| 2025 |  | slideMeeples |  |
| 2029 | crossingwalls | getBonuses | crossingwalls gains 5 conservation (Europe) |
| 2031 | crossingwalls | pDrawCards | You draw Research Zoo, Sponsored Zoo, Favorite Zoo for adapt effect |
| 2036 | crossingwalls | pDiscardCards | You discard Architectural Zoo, Favorite Zoo, Research Zoo for adapt effect |
| 2041 | crossingwalls | actionCardCleanup | crossingwalls places action card Association at position 1 (finishing action) |
| 2044 | kelkoo | getBonuses | kelkoo gains 3 conservation (Diverse species Zoo) |
| 2045 | crossingwalls | getBonuses | crossingwalls gains 1 conservation (Talented Communicator) |
| 2046 | crossingwalls | getBonuses | crossingwalls gains 4 appeal (Diversity Researcher) |
| 2047 | crossingwalls | getBonuses | crossingwalls gains 2 conservation (Sponsored Zoo) |
| 2048 | kelkoo | finalScoring | kelkoo has 59<APPEAL> and scores 51 for having 25<CONSERVATION>. kelkoo scores 110. |
| 2049 | crossingwalls | finalScoring | crossingwalls has 48<APPEAL> and scores 45 for having 23<CONSERVATION>. crossingwalls scores 93. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2019 | 1 | choose_action_card | {'type': 'association', 'spend': 3} |
| 2025 | 1 | association_task | {'task': 'conservation', 'project': 'P107', 'source': 'play', 'slot': 0, 'bonus': {'slot': 3}, 'icon': True} |
| 2036 | 1 | choose_effect | {'discard': ['F003', 'F004', 'F007']} |

## Table 790163218  (maps ['13', '13'], Marine Worlds True; seat 0 = Turtledude3333, seat 1 = Nushasmall)


### 790163218 turn 76 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F004', 'F012', 'F016']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2334 | Nushasmall | getBonuses | Nushasmall pays 3 xtoken for increasing card strength |
| 2335 | Nushasmall | chooseActionCard | Nushasmall chooses action card AssociationI with strength 5 |
| 2339 | Nushasmall | slideMeeples | Nushasmall supports a conservation project on the first slot : Serengeti national park |
| 2340 |  | discardCardsOnDisplay | The rightmost project card is discarded: Primate Management Plan |
| 2341 | Nushasmall | moveProjects | Nushasmall plays a new conservation project: Serengeti national park |
| 2342 |  | slideMeeples |  |
| 2346 | Nushasmall | releaseAnimal | Nushasmall releases White Rhinoceros into the wild and loses 9 appeal and frees a size-3 enclosure |
| 2350 | Nushasmall | getBonuses | Nushasmall gains 1 reputation (adding a new conservation project) |
| 2351 | Nushasmall | takeBonus | Nushasmall gets 1 x conservation (reputation track bonus) |
| 2352 | Nushasmall | getBonuses | Nushasmall gains 1 conservation (reputation track bonus) |
| 2356 | Nushasmall | getBonuses | Nushasmall gains 5 conservation (Serengeti national park) |
| 2358 | Nushasmall | pDrawCards | You draw Diverse species Zoo, Accessible Zoo, Designer Zoo for adapt effect |
| 2363 | Nushasmall | pDiscardCards | You discard Architectural Zoo, Accessible Zoo, Designer Zoo for adapt effect |
| 2368 | Nushasmall | actionCardCleanup | Nushasmall places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2335 | 1 | choose_action_card | {'type': 'association', 'spend': 3} |
| 2342 | 1 | association_task | {'task': 'conservation', 'project': 'P116', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |
| 2346 | 1 | choose_effect | {'release': 'A427', 'building': [4, 9]} |
| 2363 | 1 | choose_effect | {'discard': ['F004', 'F012', 'F016']} |

### 790163218 turn 77 — ILLEGAL (later; may be a consequence)

**Error:** choose_effect {'discard': ['F001', 'F008', 'F011']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2377 | Turtledude3333 | getBonuses | Turtledude3333 pays 1 xtoken for increasing card strength |
| 2378 | Turtledude3333 | chooseActionCard | Turtledude3333 chooses action card AssociationII with strength 5 |
| 2382 | Turtledude3333 | slideMeeples | Turtledude3333 supports a conservation project on the first slot : Primates |
| 2383 |  | slideMeeples |  |
| 2387 | Turtledude3333 | endOfGame | End of game triggered: everyone except Turtledude3333 will get a last turn to play |
| 2388 | Turtledude3333 | getBonuses | Turtledude3333 gains 5 conservation (Primates) |
| 2390 | Turtledude3333 | pDrawCards | You draw Aquatic Park, International Zoo, Sponsored Zoo for adapt effect |
| 2395 | Turtledude3333 | pDiscardCards | You discard Aquatic Park, Large Animal Zoo, Sponsored Zoo for adapt effect |
| 2402 | Turtledude3333 | donation | Turtledude3333 donates 5 money to get 1 conservation |
| 2404 | Turtledude3333 | actionCardCleanup | Turtledude3333 places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2378 | 0 | choose_action_card | {'type': 'association', 'spend': 1} |
| 2383 | 0 | association_task | {'task': 'conservation', 'project': 'P108', 'source': 'play', 'slot': 0, 'bonus': {'slot': 3}} |
| 2395 | 0 | choose_effect | {'discard': ['F001', 'F008', 'F011']} |
| 2402 | 0 | donate | {} |

## Table 791338307  (maps ['13', '13'], Marine Worlds True; seat 0 = MezzoMike, seat 1 = Laaan)


### 791338307 turn 70 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F004', 'F008', 'F015']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2237 | Laaan | getBonuses | Laaan pays 2 xtoken for increasing card strength |
| 2238 | Laaan | chooseActionCard | Laaan chooses action card AssociationI with strength 5 |
| 2242 | Laaan | slideMeeples | Laaan supports a conservation project on the first slot : Predator breeding program |
| 2243 |  | discardCardsOnDisplay | The rightmost project card is discarded: Primate breeding program |
| 2244 | Laaan | moveProjects | Laaan plays a new conservation project: Predator breeding program |
| 2245 |  | slideMeeples |  |
| 2250 | Laaan | getBonuses | Laaan gains 1 reputation (Predator breeding program) |
| 2252 | Laaan | pDrawCards | You draw Catered Picnic Areas, Sponsored Zoo, Conservation Zoo for adapt effect |
| 2257 | Laaan | pDiscardCards | You discard Sponsored Zoo, Catered Picnic Areas, Architectural Zoo for adapt effect |
| 2261 | Laaan | endOfGame | End of game triggered: everyone except Laaan will get a last turn to play |
| 2262 | Laaan | getBonuses | Laaan gains 2 conservation (Predator breeding program) |
| 2264 | Laaan | actionCardCleanup | Laaan places action card Association at position 1 (finishing action) |
| 2265 | Laaan | getBonuses | Laaan pays 2 money for Venom |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2238 | 1 | choose_action_card | {'type': 'association', 'spend': 2} |
| 2245 | 1 | association_task | {'task': 'conservation', 'project': 'P124', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |
| 2257 | 1 | choose_effect | {'discard': ['F004', 'F008', 'F015']} |

## Table 792415679  (maps ['13', '13'], Marine Worlds True; seat 0 = 0000Milktea000, seat 1 = Footloop)


### 792415679 turn 62 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F009', 'F014', 'F017']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1999 | 0000Milktea000 | getBonuses | 0000Milktea000 pays 3 xtoken for increasing card strength |
| 2000 | 0000Milktea000 | chooseActionCard | 0000Milktea000 chooses action card AssociationI with strength 5 |
| 2004 | 0000Milktea000 | slideMeeples | 0000Milktea000 supports a conservation project on the first slot : Habitat Diversity |
| 2005 |  | discardCardsOnDisplay | The rightmost project card is discarded: Species Diversity |
| 2006 | 0000Milktea000 | moveProjects | 0000Milktea000 plays a new conservation project: Habitat Diversity |
| 2007 |  | slideMeeples |  |
| 2011 | 0000Milktea000 | getBonuses | 0000Milktea000 gains 5 conservation (Habitat Diversity) |
| 2013 | 0000Milktea000 | pDrawCards | You draw Specialized Species Zoo, Favorite Zoo, International Zoo for adapt effect |
| 2018 | 0000Milktea000 | pDiscardCards | You discard International Zoo, Specialized Species Zoo, Diverse species Zoo for adapt effect |
| 2023 | 0000Milktea000 | actionCardCleanup | 0000Milktea000 places action card Association at position 1 (finishing action) |
| 2026 | 0000Milktea000 | getBonuses | 0000Milktea000 gains 3 conservation (Favorite Zoo) |
| 2027 | Footloop | getBonuses | Footloop gains 2 appeal (Diversity Researcher) |
| 2028 | Footloop | getBonuses | Footloop gains 3 conservation (Naturalists' Zoo) |
| 2029 | 0000Milktea000 | getBonuses | 0000Milktea000 gains 2 appeal (Victory Column) |
| 2030 | 0000Milktea000 | finalScoring | 0000Milktea000 has 60<APPEAL> and scores 42 for having 22<CONSERVATION>. 0000Milktea000 scores 102. |
| 2031 | Footloop | finalScoring | Footloop has 76<APPEAL> and scores 36 for having 20<CONSERVATION>. Footloop scores 112. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2000 | 0 | choose_action_card | {'type': 'association', 'spend': 3} |
| 2007 | 0 | association_task | {'task': 'conservation', 'project': 'P102', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |
| 2018 | 0 | choose_effect | {'discard': ['F009', 'F014', 'F017']} |

## Table 792538490  (maps ['13', '13'], Marine Worlds True; seat 0 = LCerr, seat 1 = tnikea)


### 792538490 turn 72 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F004', 'F010', 'F014']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2341 | tnikea | chooseActionCard | tnikea chooses action card AssociationI with strength 5 |
| 2345 | tnikea | slideMeeples | tnikea supports a conservation project on the second slot : Australia |
| 2346 |  | slideMeeples |  |
| 2350 | tnikea | endOfGame | End of game triggered: everyone except tnikea will get a last turn to play |
| 2351 | tnikea | getBonuses | tnikea gains 4 conservation (Australia) |
| 2353 | tnikea | pDrawCards | You draw Climbing Park, Favorite Zoo, Architectural Zoo for adapt effect |
| 2358 | tnikea | pDiscardCards | You discard Architectural Zoo, Climbing Park, Specialized Species Zoo for adapt effect |
| 2363 | tnikea | actionCardCleanup | tnikea places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2341 | 1 | choose_action_card | {'type': 'association', 'spend': 0} |
| 2346 | 1 | association_task | {'task': 'conservation', 'project': 'P105', 'source': 'play', 'slot': 1, 'bonus': {'slot': 3}} |
| 2358 | 1 | choose_effect | {'discard': ['F004', 'F010', 'F014']} |

## Table 794560478  (maps ['13', '13'], Marine Worlds True; seat 0 = hughieg1230, seat 1 = Amaori Renako)


### 794560478 turn 57 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F003', 'F010', 'F016']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1918 | Amaori Renako | getBonuses | Amaori Renako pays 1 xtoken for increasing card strength |
| 1919 | Amaori Renako | chooseActionCard | Amaori Renako chooses action card AssociationI with strength 5 |
| 1923 | Amaori Renako | slideMeeples | Amaori Renako supports a conservation project on the first slot : Bavarian Forest national park |
| 1924 |  | discardCardsOnDisplay | The rightmost project card is discarded: Aquatic |
| 1925 | Amaori Renako | moveProjects | Amaori Renako plays a new conservation project: Bavarian Forest national park |
| 1926 |  | slideMeeples |  |
| 1930 | Amaori Renako | releaseAnimal | Amaori Renako releases Wolf into the wild and loses 4 appeal and frees a size-4 enclosure |
| 1932 | Amaori Renako | pDrawCards | You draw Research Zoo, Accessible Zoo, Conservation Zoo for adapt effect |
| 1937 | Amaori Renako | pDiscardCards | You discard Climbing Park, Accessible Zoo, Research Zoo for adapt effect |
| 1944 | Amaori Renako | getBonuses | Amaori Renako gains 5 conservation (Bavarian Forest national park) |
| 1945 | Amaori Renako | getBonuses | Amaori Renako gains 1 reputation (adding a new conservation project) |
| 1946 | Amaori Renako | takeBonus | Amaori Renako gets 1 x conservation (reputation track bonus) |
| 1947 | Amaori Renako | getBonuses | Amaori Renako gains 1 conservation (reputation track bonus) |
| 1949 | Amaori Renako | actionCardCleanup | Amaori Renako places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1919 | 1 | choose_action_card | {'type': 'association', 'spend': 1} |
| 1926 | 1 | association_task | {'task': 'conservation', 'project': 'P113', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |
| 1930 | 1 | choose_effect | {'release': 'A417', 'building': [2, 7]} |
| 1937 | 1 | choose_effect | {'discard': ['F003', 'F010', 'F016']} |

## Table 795240335  (maps ['13', '13'], Marine Worlds True; seat 0 = DimaGraefe, seat 1 = sebgege)


### 795240335 turn 80 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F006', 'F010', 'F014']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2426 | sebgege | getBonuses | sebgege pays 2 xtoken for increasing card strength |
| 2427 | sebgege | chooseActionCard | sebgege chooses action card AssociationI with strength 5 |
| 2431 | sebgege | slideMeeples | sebgege supports a conservation project on the first slot : Species Diversity |
| 2432 |  | discardCardsOnDisplay | The rightmost project card is discarded: Sea Cave |
| 2433 | sebgege | moveProjects | sebgege plays a new conservation project: Species Diversity |
| 2434 |  | slideMeeples |  |
| 2438 | sebgege | getBonuses | sebgege gains 5 conservation (Species Diversity) |
| 2440 | sebgege | pDrawCards | You draw Specialized Species Zoo, Naturalists' Zoo, Climbing Park for adapt effect |
| 2445 | sebgege | pDiscardCards | You discard Climbing Park, Naturalists' Zoo, Specialized Species Zoo for adapt effect |
| 2450 | sebgege | actionCardCleanup | sebgege places action card Association at position 1 (finishing action) |
| 2453 | DimaGraefe | getBonuses | DimaGraefe gains 1 conservation (Federal Grants) |
| 2454 | DimaGraefe | getBonuses | DimaGraefe gains 2 conservation (Designer Zoo) |
| 2455 | sebgege | getBonuses | sebgege gains 1 conservation (Talented Communicator) |
| 2456 | sebgege | getBonuses | sebgege gains 1 conservation (Free-range New World Monkeys) |
| 2457 | sebgege | getBonuses | sebgege gains 2 conservation (Sponsored Zoo) |
| 2458 | sebgege | getBonuses | sebgege gains 4 conservation (Diverse species Zoo) |
| 2459 | DimaGraefe | finalScoring | DimaGraefe has 83<APPEAL> and scores 42 for having 22<CONSERVATION>. DimaGraefe scores 125. |
| 2460 | sebgege | finalScoring | sebgege has 76<APPEAL> and scores 45 for having 23<CONSERVATION>. sebgege scores 121. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2427 | 1 | choose_action_card | {'type': 'association', 'spend': 2} |
| 2434 | 1 | association_task | {'task': 'conservation', 'project': 'P101', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |
| 2445 | 1 | choose_effect | {'discard': ['F006', 'F010', 'F014']} |

## Table 796192448  (maps ['13', '10'], Marine Worlds False; seat 0 = Wilhelm1, seat 1 = Esening2)


### 796192448 turn 71 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F002', 'F005', 'F010']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1871 | Wilhelm1 | chooseActionCard | Wilhelm1 chooses action card AssociationI with strength 5 |
| 1875 | Wilhelm1 | slideMeeples | Wilhelm1 supports a conservation project on the second slot : Species Diversity |
| 1876 |  | slideMeeples |  |
| 1878 | Wilhelm1 | pDrawCards | You draw Large Animal Zoo, Small Animal Zoo, Climbing Park for adapt effect |
| 1883 | Wilhelm1 | pDiscardCards | You discard Conservation Zoo, Small Animal Zoo, Climbing Park for adapt effect |
| 1887 | Wilhelm1 | getBonuses | Wilhelm1 gains 3 conservation (Species Diversity) |
| 1891 | Wilhelm1 | takeBonus | Wilhelm1 gets 3 x xtoken |
| 1893 | Wilhelm1 | getBonuses | Wilhelm1 gains 2 xtoken |
| 1895 | Wilhelm1 | actionCardCleanup | Wilhelm1 places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1871 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 1876 | 0 | association_task | {'task': 'conservation', 'project': 'P101', 'source': 'play', 'slot': 1, 'bonus': {'slot': 3}} |
| 1883 | 0 | choose_effect | {'discard': ['F002', 'F005', 'F010']} |
| 1891 | 0 | choose_effect | {'bonus_type': 'xtoken', 'n': 3} |

## Table 800560514  (maps ['13', '13'], Marine Worlds True; seat 0 = triangleforce, seat 1 = Amazon-House_FSBC)


### 800560514 turn 77 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F002', 'F011', 'F013']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2190 | triangleforce | getBonuses | triangleforce pays 2 xtoken for increasing card strength |
| 2191 | triangleforce | chooseActionCard | triangleforce chooses action card AssociationII with strength 5 |
| 2198 | triangleforce | slideMeeples | triangleforce supports a conservation project on the second slot : Predators |
| 2199 | triangleforce | moveProjects | triangleforce plays a new conservation project: Predators |
| 2200 |  | slideMeeples |  |
| 2202 | triangleforce | pDrawCards | You draw Small Animal Zoo, Specialized Habitat Zoo, Aquatic Park for adapt effect |
| 2207 | triangleforce | pDiscardCards | You discard Specialized Habitat Zoo, Aquatic Park, Small Animal Zoo for adapt effect |
| 2211 | triangleforce | endOfGame | End of game triggered: everyone except triangleforce will get a last turn to play |
| 2212 | triangleforce | getBonuses | triangleforce gains 4 conservation (Predators) |
| 2216 | triangleforce | donation | triangleforce donates 5 money to get 1 conservation |
| 2218 | triangleforce | actionCardCleanup | triangleforce places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2191 | 0 | choose_action_card | {'type': 'association', 'spend': 2} |
| 2200 | 0 | association_task | {'task': 'conservation', 'project': 'P110', 'source': 'hand', 'slot': 1, 'bonus': {'slot': 3}} |
| 2207 | 0 | choose_effect | {'discard': ['F002', 'F011', 'F013']} |
| 2216 | 0 | donate | {} |

## Table 800669330  (maps ['13', '13'], Marine Worlds True; seat 0 = Relaxmyfkbrain, seat 1 = TemurB)


### 800669330 turn 73 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F009', 'F010', 'F015']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2313 | Relaxmyfkbrain | getBonuses | Relaxmyfkbrain pays 2 xtoken for increasing card strength |
| 2314 | Relaxmyfkbrain | chooseActionCard | Relaxmyfkbrain chooses action card AssociationI with strength 5 |
| 2318 | Relaxmyfkbrain | slideMeeples | Relaxmyfkbrain supports a conservation project on the first slot : Species Diversity |
| 2319 |  | discardCardsOnDisplay | The rightmost project card is discarded: Primate breeding program |
| 2320 | Relaxmyfkbrain | moveProjects | Relaxmyfkbrain plays a new conservation project: Species Diversity |
| 2321 |  | slideMeeples |  |
| 2325 | Relaxmyfkbrain | getBonuses | Relaxmyfkbrain gains 5 conservation (Species Diversity) |
| 2327 | Relaxmyfkbrain | pDrawCards | You draw Diverse species Zoo, Catered Picnic Areas, Climbing Park for adapt effect |
| 2332 | Relaxmyfkbrain | pDiscardCards | You discard Diverse species Zoo, Catered Picnic Areas, Climbing Park for adapt effect |
| 2337 | Relaxmyfkbrain | actionCardCleanup | Relaxmyfkbrain places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2314 | 0 | choose_action_card | {'type': 'association', 'spend': 2} |
| 2321 | 0 | association_task | {'task': 'conservation', 'project': 'P101', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |
| 2332 | 0 | choose_effect | {'discard': ['F009', 'F010', 'F015']} |

## Table 800980926  (maps ['13', '13'], Marine Worlds True; seat 0 = NonNewtonianNarwhal, seat 1 = yunfeiyang90)


### 800980926 turn 67 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F012', 'F013', 'F017']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2199 | NonNewtonianNarwhal | getBonuses | NonNewtonianNarwhal pays 2 xtoken for increasing card strength |
| 2200 | NonNewtonianNarwhal | chooseActionCard | NonNewtonianNarwhal chooses action card AssociationI with strength 5 |
| 2204 | NonNewtonianNarwhal | slideMeeples | NonNewtonianNarwhal supports a conservation project on the first slot : Australia |
| 2205 | NonNewtonianNarwhal | discardTokens | NonNewtonianNarwhal uses 1 token(s) from sponsor card(s) |
| 2206 |  | slideMeeples |  |
| 2210 | NonNewtonianNarwhal | getBonuses | NonNewtonianNarwhal gains 5 conservation (Australia) |
| 2212 | NonNewtonianNarwhal | pDrawCards | You draw Designer Zoo, Specialized Species Zoo, International Zoo for adapt effect |
| 2217 | NonNewtonianNarwhal | pDiscardCards | You discard Designer Zoo, Specialized Habitat Zoo, International Zoo for adapt effect |
| 2222 | NonNewtonianNarwhal | actionCardCleanup | NonNewtonianNarwhal places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2200 | 0 | choose_action_card | {'type': 'association', 'spend': 2} |
| 2206 | 0 | association_task | {'task': 'conservation', 'project': 'P105', 'source': 'play', 'slot': 0, 'bonus': {'slot': 3}, 'token': 'S215'} |
| 2217 | 0 | choose_effect | {'discard': ['F012', 'F013', 'F017']} |

## Table 801014048  (maps ['13', '13'], Marine Worlds True; seat 0 = cattyan, seat 1 = gghub)


### 801014048 turn 58 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F010', 'F011', 'F014']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1634 | cattyan | getBonuses | cattyan pays 1 xtoken for increasing card strength |
| 1635 | cattyan | chooseActionCard | cattyan chooses action card AssociationI with strength 5 |
| 1639 | cattyan | slideMeeples | cattyan supports a conservation project on the second slot : Predator Management Plan |
| 1640 |  | slideMeeples |  |
| 1644 | cattyan | getBonuses | cattyan gains 2 conservation (Predator Management Plan) |
| 1648 | cattyan | getBonuses | cattyan gains 2 reputation (Predator Management Plan) |
| 1649 | cattyan | takeBonus | cattyan gets 1 x xtoken (reputation track bonus) |
| 1650 | cattyan | getBonuses | cattyan gains 1 xtoken (reputation track bonus) |
| 1651 | cattyan | takeBonus | cattyan gets 1 x conservation (reputation track bonus) |
| 1652 | cattyan | getBonuses | cattyan gains 1 conservation (reputation track bonus) |
| 1654 | cattyan | pDrawCards | You draw Aquatic Park, Climbing Park, Specialized Species Zoo for adapt effect |
| 1659 | cattyan | pDiscardCards | You discard Aquatic Park, Climbing Park, Specialized Species Zoo for adapt effect |
| 1664 | cattyan | actionCardCleanup | cattyan places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1635 | 0 | choose_action_card | {'type': 'association', 'spend': 1} |
| 1640 | 0 | association_task | {'task': 'conservation', 'project': 'P134', 'source': 'play', 'slot': 1, 'bonus': {'slot': 3}} |
| 1659 | 0 | choose_effect | {'discard': ['F010', 'F011', 'F014']} |

## Table 812408052  (maps ['13', '13'], Marine Worlds True; seat 0 = Propaganda Panda, seat 1 = Leon Jing)


### 812408052 turn 65 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F008', 'F010', 'F015']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2012 | Propaganda Panda | getBonuses | Propaganda Panda pays 2 xtoken for increasing card strength |
| 2013 | Propaganda Panda | chooseActionCard | Propaganda Panda chooses action card AssociationI with strength 5 |
| 2017 | Propaganda Panda | slideMeeples | Propaganda Panda supports a conservation project on the third slot : Herbivores |
| 2018 |  | slideMeeples |  |
| 2022 | Propaganda Panda | endOfGame | End of game triggered: everyone except Propaganda Panda will get a last turn to play |
| 2023 | Propaganda Panda | getBonuses | Propaganda Panda gains 2 conservation (Herbivores) |
| 2025 | Propaganda Panda | pDrawCards | You draw Sponsored Zoo, Favorite Zoo, Catered Picnic Areas for adapt effect |
| 2030 | Propaganda Panda | pDiscardCards | You discard Sponsored Zoo, Catered Picnic Areas, Climbing Park for adapt effect |
| 2037 | Propaganda Panda | actionCardCleanup | Propaganda Panda places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2013 | 0 | choose_action_card | {'type': 'association', 'spend': 2} |
| 2018 | 0 | association_task | {'task': 'conservation', 'project': 'P111', 'source': 'play', 'slot': 2, 'bonus': {'slot': 3}} |
| 2030 | 0 | choose_effect | {'discard': ['F008', 'F010', 'F015']} |

### 812408052 turn 66 — ILLEGAL (later; may be a consequence)

**Error:** choose_effect {'discard': ['F005', 'F011', 'F016']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2044 | Leon Jing | chooseActionCard | Leon Jing chooses action card AssociationI with strength 5 |
| 2048 | Leon Jing | slideMeeples | Leon Jing supports a conservation project on the first slot : Reptile breeding program |
| 2049 |  | discardCardsOnDisplay | The rightmost project card is discarded: Jungle |
| 2050 | Leon Jing | moveProjects | Leon Jing plays a new conservation project: Reptile breeding program |
| 2051 |  | slideMeeples |  |
| 2055 | Leon Jing | getBonuses | Leon Jing gains 2 reputation (Reptile breeding program) |
| 2056 | Leon Jing | takeBonus | Leon Jing gets 1 x xtoken (reputation track bonus) |
| 2057 | Leon Jing | getBonuses | Leon Jing gains 1 xtoken (reputation track bonus) |
| 2058 | Leon Jing | takeBonus | Leon Jing gets 1 x conservation (reputation track bonus) |
| 2059 | Leon Jing | getBonuses | Leon Jing gains 1 conservation (reputation track bonus) |
| 2061 | Leon Jing | pDrawCards | You draw Diverse species Zoo, Aquatic Park, Conservation Zoo for adapt effect |
| 2066 | Leon Jing | pDiscardCards | You discard Conservation Zoo, Aquatic Park, Accessible Zoo for adapt effect |
| 2070 | Leon Jing | getBonuses | Leon Jing gains 2 conservation (Reptile breeding program) |

**Engine actions derived from the log:**

_no cleanup_


## Table 830941401  (maps ['13', '13'], Marine Worlds True; seat 0 = unponder, seat 1 = Isametric)


### 830941401 turn 79 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F002', 'F010', 'F016']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2072 | unponder | getBonuses | unponder pays 1 xtoken for increasing card strength |
| 2073 | unponder | chooseActionCard | unponder chooses action card AssociationI with strength 5 |
| 2080 | unponder | slideMeeples | unponder supports a conservation project on the first slot : Low Mountain Range |
| 2081 |  | discardCardsOnDisplay | The rightmost project card is discarded: Angthong national park |
| 2082 | unponder | moveProjects | unponder plays a new conservation project: Low Mountain Range |
| 2083 |  | slideMeeples |  |
| 2087 | unponder | releaseAnimal | unponder releases Secretary Bird into the wild and loses 4 appeal and frees a size-4 enclosure |
| 2091 | unponder | getBonuses | unponder gains 5 conservation (Low Mountain Range) |
| 2093 | unponder | pDrawCards | You draw Climbing Park, Accessible Zoo, Small Animal Zoo for adapt effect |
| 2098 | unponder | pDiscardCards | You discard Small Animal Zoo, Accessible Zoo, Climbing Park for adapt effect |
| 2104 | unponder | actionCardCleanup | unponder places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2073 | 0 | choose_action_card | {'type': 'association', 'spend': 1} |
| 2083 | 0 | association_task | {'task': 'conservation', 'project': 'P119', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}} |
| 2087 | 0 | choose_effect | {'release': 'A495', 'building': [3, 2]} |
| 2098 | 0 | choose_effect | {'discard': ['F002', 'F010', 'F016']} |

### 830941401 turn 88 — ILLEGAL (later; may be a consequence)

**Error:** choose_effect {'discard': ['F005', 'F011', 'F012']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2288 | Isametric | chooseActionCard | Isametric chooses action card AssociationI with strength 4 |
| 2292 | Isametric | slideMeeples | Isametric supports a conservation project on the third slot : Large Animals |
| 2293 |  | slideMeeples |  |
| 2297 | Isametric | getBonuses | Isametric gains 2 conservation (Large Animals) |
| 2299 | Isametric | pDrawCards | You draw Conservation Zoo, Aquatic Park, Designer Zoo for adapt effect |
| 2304 | Isametric | pDiscardCards | You discard Designer Zoo, Aquatic Park, Conservation Zoo for adapt effect |
| 2309 | Isametric | actionCardCleanup | Isametric places action card Association at position 1 (finishing action) |
| 2312 | unponder | getBonuses | unponder gains 6 appeal (Diversity Researcher) |
| 2313 | unponder | getBonuses | unponder gains 1 conservation (Guided School Tours) |
| 2314 | unponder | getBonuses | unponder gains 2 conservation (International Zoo) |
| 2315 | Isametric | getBonuses | Isametric gains 2 conservation (Science Lab) |
| 2316 | Isametric | getBonuses | Isametric gains 1 conservation (Veterinarian) |
| 2317 | Isametric | getBonuses | Isametric gains 1 conservation (Foreign Institute) |
| 2318 | Isametric | getBonuses | Isametric gains 3 conservation (Sponsored Zoo) |
| 2319 | unponder | finalScoring | unponder has 71<APPEAL> and scores 51 for having 25<CONSERVATION>. unponder scores 122. |
| 2320 | Isametric | finalScoring | Isametric has 60<APPEAL> and scores 57 for having 27<CONSERVATION>. Isametric scores 117. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2288 | 1 | choose_action_card | {'type': 'association', 'spend': 0} |
| 2293 | 1 | association_task | {'task': 'conservation', 'project': 'P131', 'source': 'play', 'slot': 2, 'bonus': {'slot': 3}} |
| 2304 | 1 | choose_effect | {'discard': ['F005', 'F011', 'F012']} |

## Table 841035593  (maps ['13', '13'], Marine Worlds True; seat 0 = YourMichael, seat 1 = soyeon_12)


### 841035593 turn 72 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F003', 'F009', 'F012']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2315 | soyeon_12 | getBonuses | soyeon_12 pays 3 xtoken for increasing card strength |
| 2316 | soyeon_12 | chooseActionCard | soyeon_12 chooses action card AssociationII with strength 6 |
| 2321 | soyeon_12 | slideMeeples | soyeon_12 supports a conservation project on the first slot : Angthong national park |
| 2322 |  | discardCardsOnDisplay | The rightmost project card is discarded: Savanna |
| 2323 | soyeon_12 | moveProjects | soyeon_12 plays a new conservation project: Angthong national park |
| 2324 |  | slideMeeples |  |
| 2325 | soyeon_12 | releaseAnimal | soyeon_12 releases Sumatran Tiger into the wild and loses 8 appeal and frees a size-4 enclosure |
| 2329 | soyeon_12 | getBonuses | soyeon_12 gains 1 reputation (adding a new conservation project) |
| 2330 | soyeon_12 | takeBonus | soyeon_12 gets 1 x conservation (reputation track bonus) |
| 2331 | soyeon_12 | getBonuses | soyeon_12 gains 1 conservation (reputation track bonus) |
| 2335 | soyeon_12 | getBonuses | soyeon_12 gains 5 conservation (Angthong national park) |
| 2337 | soyeon_12 | pDrawCards | You draw Diverse species Zoo, Research Zoo, Naturalists' Zoo for adapt effect |
| 2342 | soyeon_12 | pDiscardCards | You discard Research Zoo, Designer Zoo, Diverse species Zoo for adapt effect |
| 2350 | soyeon_12 | slideMeeples | soyeon_12 takes a new university |
| 2351 | soyeon_12 | slideMeeples |  |
| 2355 | soyeon_12 | getBonuses | soyeon_12 gains 1 reputation ( from university) |
| 2356 | soyeon_12 | takeBonus | soyeon_12 gets 1 x xtoken (reputation track bonus) |
| 2357 | soyeon_12 | getBonuses | soyeon_12 gains 1 xtoken (reputation track bonus) |
| 2358 | soyeon_12 | getBonuses | soyeon_12 gains 2 conservation (university) |
| 2362 | soyeon_12 | donation | soyeon_12 donates 5 money to get 1 conservation |
| 2364 | soyeon_12 | actionCardCleanup | soyeon_12 places action card Association at position 1 (finishing action) |
| 2367 | YourMichael | getBonuses | YourMichael gains 1 conservation (Meerkat Den) |
| 2368 | YourMichael | getBonuses | YourMichael gains 4 conservation (Architectural Zoo) |
| 2369 | YourMichael | getBonuses | YourMichael gains 4 conservation (Favorite Zoo) |
| 2370 | soyeon_12 | getBonuses | soyeon_12 gains 1 conservation (Talented Communicator) |
| 2371 | soyeon_12 | getBonuses | soyeon_12 gains 3 conservation (Naturalists' Zoo) |
| 2372 | YourMichael | finalScoring | YourMichael has 99<APPEAL> and scores 51 for having 25<CONSERVATION>. YourMichael scores 150. |
| 2373 | soyeon_12 | finalScoring | soyeon_12 has 58<APPEAL> and scores 72 for having 32<CONSERVATION>. soyeon_12 scores 130. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2316 | 1 | choose_action_card | {'type': 'association', 'spend': 3} |
| 2324 | 1 | association_task | {'task': 'conservation', 'project': 'P115', 'source': 'hand', 'slot': 0, 'bonus': {'slot': 3}, 'workers': 2} |
| 2325 | 1 | choose_effect | {'release': 'A407', 'building': [6, 7]} |
| 2342 | 1 | choose_effect | {'discard': ['F003', 'F009', 'F012']} |
| 2351 | 1 | association_task | {'task': 'university', 'kind': 'fac-rep-hand', 'workers': 2} |
| 2362 | 1 | donate | {} |

## Table 884514602  (maps ['13', '13'], Marine Worlds True; seat 0 = Madvegy, seat 1 = Mrhonor)


### 884514602 turn 78 — ILLEGAL (first in this game)

**Error:** choose_effect {'discard': ['F004', 'F012', 'F017']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2386 | Madvegy | chooseActionCard | Madvegy chooses action card AssociationI with strength 5 |
| 2390 | Madvegy | slideMeeples | Madvegy supports a conservation project on the third slot : Angthong national park |
| 2391 |  | discardCardsOnDisplay | The rightmost project card is discarded: Reptile breeding program |
| 2392 | Madvegy | moveProjects | Madvegy plays a new conservation project: Angthong national park |
| 2393 |  | slideMeeples |  |
| 2397 | Madvegy | releaseAnimal | Madvegy releases Chinese Water Dragon into the wild and loses 3 appeal and frees a size-1 enclosure |
| 2401 | Madvegy | getBonuses | Madvegy gains 3 conservation (Angthong national park) |
| 2403 | Madvegy | pDrawCards | You draw Architectural Zoo, Aquatic Park, International Zoo for adapt effect |
| 2408 | Madvegy | pDiscardCards | You discard Architectural Zoo, Designer Zoo, International Zoo for adapt effect |
| 2412 | Madvegy | getBonuses | Madvegy gains 1 reputation (adding a new conservation project) |
| 2413 | Madvegy | takeBonus | Madvegy gets 1 x conservation (reputation track bonus) |
| 2414 | Madvegy | getBonuses | Madvegy gains 1 conservation (reputation track bonus) |
| 2416 | Madvegy | actionCardCleanup | Madvegy places action card Association at position 1 (finishing action) |
| 2419 | Madvegy | getBonuses | Madvegy gains 1 conservation (Federal Grants) |
| 2420 | Madvegy | getBonuses | Madvegy gains 2 conservation (Aquatic Park) |
| 2421 | Mrhonor | getBonuses | Mrhonor gains 1 conservation (Franchise Business) |
| 2422 | Mrhonor | getBonuses | Mrhonor gains 1 conservation (Conference On Europe) |
| 2423 | Mrhonor | getBonuses | Mrhonor gains 3 conservation (Favorite Zoo) |
| 2424 | Madvegy | finalScoring | Madvegy has 55<APPEAL> and scores 48 for having 24<CONSERVATION>. Madvegy scores 103. |
| 2425 | Mrhonor | finalScoring | Mrhonor has 81<APPEAL> and scores 48 for having 24<CONSERVATION>. Mrhonor scores 129. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2386 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 2393 | 0 | association_task | {'task': 'conservation', 'project': 'P115', 'source': 'hand', 'slot': 2, 'bonus': {'slot': 3}} |
| 2397 | 0 | choose_effect | {'release': 'A478', 'building': [4, 3]} |
| 2408 | 0 | choose_effect | {'discard': ['F004', 'F012', 'F017']} |
