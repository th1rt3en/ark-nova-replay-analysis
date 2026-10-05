# Differential problems: move-by-move breakdown

Generated from the differential run (chain=False) on `log_examples/`. For each problem: the error, the log events of the turn (order, player, event, text) and the engine actions the harness derived from them. Problems after the first one of a game may be consequences of it.


## Table 722666555  (maps ['5a', '5a'], Marine Worlds True; seat 0 = Krovax27, seat 1 = yazavats)


### 722666555 turn 58 — MISMATCH (first in this game)

**Error:** player 0, tokens: only in the engine: ('bonus-ignore-conditions', 'notepad')

| order | player | event | log text |
|---|---|---|---|
| 1863 | Krovax27 | chooseActionCard | Krovax27 chooses action card AnimalsII with strength 3 |
| 1867 | Krovax27 | buyAnimal | Krovax27 plays Eurasian Brown Bear for 17 and places it in a size-5 enclosure |
| 1874 | Krovax27 | addMeeples | Krovax27 adds a multiplier token on action card AssociationI |
| 1878 | Krovax27 | getBonuses | Krovax27 gains 8 appeal (Eurasian Brown Bear) |
| 1882 | Krovax27 | slideMeeples | Krovax27 gains a new Association worker |
| 1883 | Krovax27 | getBonuses | Krovax27 gains 2 money (Explorer) |
| 1884 | Krovax27 | getBonuses | Krovax27 gains 1 appeal (Explorer) |
| 1888 | Krovax27 | discardTokens | Krovax27 uses 3 x bonus-ignore-conditions |
| 1889 | Krovax27 | buyAnimal | Krovax27 plays Sun Bear for 16 and places it in a size-2 enclosure |
| 1893 | Krovax27 | getBonuses | Krovax27 gains 5 appeal (Sun Bear) |
| 1894 | Krovax27 | getBonuses | Krovax27 gains 2 money (Explorer) |
| 1895 | Krovax27 | getBonuses | Krovax27 gains 1 appeal (Explorer) |
| 1897 | Krovax27 | actionCardCleanup | Krovax27 places action card Animals at position 1 (finishing action) |
| 1898 |  | enableMultiplier |  |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1863 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1867 | 0 | play_animal | {'card': 'A416', 'from_display': False, 'x': 1, 'y': 10} |
| 1874 | 0 | choose_effect | {'multiplier': 'association'} |
| 1878 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1889 | 0 | play_animal | {'card': 'A409', 'from_display': False, 'x': 7, 'y': 0} |
| 1893 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 750256237  (maps ['14', '14'], Marine Worlds True; seat 0 = Gordon10, seat 1 = bear1013iris)


### 750256237 turn 65 — MISMATCH (first in this game)

**Error:** player 1, tokens: only in the engine: ('bonus-ignore-conditions', 'notepad')

| order | player | event | log text |
|---|---|---|---|
| 1691 | bear1013iris | getBonuses | bear1013iris pays 1 xtoken for increasing card strength |
| 1692 | bear1013iris | chooseActionCard | bear1013iris chooses action card AnimalsII with strength 5 |
| 1693 | bear1013iris | getBonuses | bear1013iris gains 1 reputation (max strength Animals) |
| 1694 | bear1013iris | takeBonus | bear1013iris gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1698 | bear1013iris | snapCard | bear1013iris takes Predator Management Plan in reputation range from the display |
| 1702 | bear1013iris | discardTokens | bear1013iris uses 3 x bonus-ignore-conditions |
| 1703 | bear1013iris | buyAnimal | bear1013iris plays Australian Sea Lion for 18 and places it in a size-4 enclosure |
| 1708 | bear1013iris | pDiscardCards | You sell Predator Management Plan cards for 4 money |
| 1715 | bear1013iris | getBonuses | bear1013iris gains 1 conservation (Australian Sea Lion) |
| 1716 | bear1013iris | getBonuses | bear1013iris gains 7 appeal (Australian Sea Lion) |
| 1720 | bear1013iris | buyAnimal | bear1013iris buys Shoebill from display for 12 and places it in a size-2 enclosure |
| 1724 | bear1013iris | getBonuses | bear1013iris gains 1 conservation (Shoebill) |
| 1725 | bear1013iris | getBonuses | bear1013iris gains 3 appeal (Shoebill) |
| 1727 | bear1013iris | actionCardCleanup | bear1013iris places action card Animals at position 1 (finishing action) |
| 1731 |  | fillPool | The display is replenished with Explorer, Bolivian Red Howler |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1692 | 1 | choose_action_card | {'type': 'animals', 'spend': 1} |
| 1698 | 1 | take_cards | {'mode': 'range', 'card': 'P134'} |
| 1703 | 1 | play_animal | {'card': 'A422', 'from_display': False, 'x': 6, 'y': 9} |
| 1708 | 1 | choose_effect | {'cards': ['P134']} |
| 1715 | 1 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 1716 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1720 | 1 | play_animal | {'card': 'A498', 'from_display': True, 'x': 5, 'y': 0} |
| 1724 | 1 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 1725 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 798300935  (maps ['11', '11'], Marine Worlds True; seat 0 = hughieg1230, seat 1 = red123456lt)


### 798300935 turn 36 — MISMATCH (first in this game)

**Error:** player 1, tokens: only in the engine: ('bonus-ignore-conditions', 'notepad')

| order | player | event | log text |
|---|---|---|---|
| 958 | red123456lt | chooseActionCard | red123456lt chooses action card AnimalsII with strength 5 |
| 959 | red123456lt | getBonuses | red123456lt gains 1 reputation (max strength Animals) |
| 963 | red123456lt | discardTokens | red123456lt uses 3 x bonus-ignore-conditions |
| 964 | red123456lt | buyAnimal | red123456lt plays Sun Bear for 16 and places it in a size-2 enclosure |
| 968 | red123456lt | getBonuses | red123456lt gains 2 appeal (Polar Bear Exhibit) |
| 969 | red123456lt | getBonuses | red123456lt gains 5 appeal (Sun Bear) |
| 976 | red123456lt | actionCardCleanup | red123456lt places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 958 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 964 | 1 | play_animal | {'card': 'A409', 'from_display': False, 'x': 5, 'y': 4} |
| 969 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

### 798300935 turn 63 — MISMATCH (later; may be a consequence)

**Error:** player 0, money: engine 45, replay 50; player 0, x tokens: engine 3, replay 2

| order | player | event | log text |
|---|---|---|---|
| 1895 | hughieg1230 | getBonuses | hughieg1230 pays 3 xtoken for increasing card strength |
| 1896 | hughieg1230 | chooseActionCard | hughieg1230 chooses action card AssociationII with strength 5 |
| 1900 | hughieg1230 | slideMeeples | hughieg1230 supports a conservation project on the first slot : Sea Animal Management Plan |
| 1901 |  | discardCardsOnDisplay | The rightmost project card is discarded: Yosemite national park |
| 1902 | hughieg1230 | moveProjects | hughieg1230 plays a new conservation project: Sea Animal Management Plan |
| 1903 |  | slideMeeples |  |
| 1905 | hughieg1230 | getBonuses | hughieg1230 gains 12 money (map bonus space) |
| 1909 | hughieg1230 | getBonuses | hughieg1230 gains 2 appeal (Orange Clownfish) |
| 1913 | hughieg1230 | getBonuses | hughieg1230 gains 1 xtoken (Inventive) |
| 1917 | hughieg1230 | getBonuses | hughieg1230 gains 1 reputation (adding a new conservation project) |
| 1918 | hughieg1230 | takeBonus | hughieg1230 gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1922 | hughieg1230 | snapCard | hughieg1230 takes Anaconda in reputation range from the display |
| 1923 | hughieg1230 | gainMarked | hughieg1230 gains 2 money for their mark on Anaconda |
| 1927 | hughieg1230 | getBonuses | hughieg1230 gains 2 conservation (Sea Animal Management Plan) |
| 1934 | hughieg1230 | getBonuses | hughieg1230 trades 1<XTOKEN> for <MONEY:5> (Trade effect) |
| 1936 | hughieg1230 | pDrawCards | You draw Andean Condor from the deck |
| 1943 | hughieg1230 | donation | hughieg1230 donates 5 money to get 1 conservation |
| 1945 | hughieg1230 | actionCardCleanup | hughieg1230 places action card Association at position 1 (finishing action) |
| 1949 | hughieg1230 | markCard | hughieg1230 marks Gould's Monitor from display |
| 1953 |  | fillPool | The display is replenished with Shoebill |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1896 | 0 | choose_action_card | {'type': 'association', 'spend': 3} |
| 1903 | 0 | association_task | {'task': 'conservation', 'project': 'P138', 'source': 'hand', 'slot': 0, 'bonus': {'type': 'money', 'value': 12}} |
| 1909 | 0 | choose_effect | {'apply': 'reef'} |
| 1909 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1913 | 0 | choose_effect | {'apply': 'gain', 'res': 'xtoken'} |
| 1922 | 0 | take_cards | {'mode': 'range', 'card': 'A482'} |
| 1936 | 0 | take_cards | {'mode': 'deck', 'count': 1} |
| 1943 | 0 | donate | {} |
| 1949 | 0 | choose_effect | {'card': 'A490', 'mark': True} |

## Table 800311282  (maps ['12', '12'], Marine Worlds True; seat 0 = happy-oldman, seat 1 = itayor)


### 800311282 turn 64 — ILLEGAL (first in this game)

**Error:** play_animal {'card': 'A518', 'from_display': False, 'x': 6, 'y': 5} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1733 | itayor | chooseActionCard | itayor chooses action card AnimalsII with strength 5 |
| 1734 | itayor | getBonuses | itayor gains 1 reputation (max strength Animals) |
| 1735 | itayor | takeBonus | itayor gets 1 x take-in-range-or-deck (reputation track bonus) |
| 1737 | itayor | pDrawCards | You draw Short-snouted Seahorse from the deck |
| 1747 | itayor | buyAnimal | itayor plays Loggerhead Sea Turtle for 23 and places it in the small aquarium, the underwater tunnel |
| 1748 | happy-oldman | getBonuses | happy-oldman gains 3 money (Herpetologist) |
| 1752 | itayor | getBonuses | itayor gains 8 appeal (Loggerhead Sea Turtle) |
| 1757 | itayor | pDrawCards | You draw Bald Eagle, Rock Monitor, Coconut Lorikeet for scuba dive effect |
| 1759 | itayor | pDiscardCards | You discard Bald Eagle, Rock Monitor, Coconut Lorikeet (no sponsor) |
| 1767 | itayor | pDrawCards | You draw Savanna, Magnificent Sea Anemone, Indian Rock Python, Nile Crocodile for scuba dive effect |
| 1769 | itayor | pDiscardCards | You discard Savanna, Magnificent Sea Anemone, Indian Rock Python, Nile Crocodile (no sponsor) |
| 1779 | itayor | getBonuses | itayor pays 5 money for buying sponsor card |
| 1780 | itayor | playSponsor | itayor plays Expert On Australia |
| 1784 | itayor | getBonuses | itayor gains 5 appeal (Expert On Australia) |
| 1791 | itayor | increaseSize | itayor increase the size of a a size-4 enclosure |
| 1792 | itayor | getBonuses | itayor gains 1 money (Geologist) |
| 1793 | itayor | getBonuses | itayor gains 2 appeal (Conference On Australia) |
| 1798 | itayor | pDiscardCards | You pouch Short-snouted Seahorse cards for 2 appeal |
| 1805 | itayor | buyAnimal | itayor plays Lesser Bird-of-paradise for 12 and places it in a size-2 enclosure |
| 1809 | itayor | getBonuses | itayor gains 5 appeal (Lesser Bird-of-paradise) |
| 1816 | itayor | increaseSize | itayor increase the size of a a size-3 enclosure |
| 1821 | itayor | pDiscardCards | You pouch Common Wombat cards for 2 appeal |
| 1828 | itayor | buyBuilding | itayor adds a pavilion (Lesser Bird-of-paradise) |
| 1829 | itayor | getBonuses | itayor gains 1 appeal (building a pavilion) |
| 1830 | itayor | getBonuses | itayor gains 1 xtoken (placement bonus) |
| 1831 | itayor | getBonuses | itayor gains 1 money (Geologist) |
| 1833 | itayor | actionCardCleanup | itayor places action card Animals at position 1 (finishing action) |
| 1834 | itayor | getBonuses | itayor pays 2 money for Venom |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1733 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 1737 | 1 | take_cards | {'mode': 'deck', 'count': 1} |
| 1747 | 1 | play_animal | {'card': 'A551', 'from_display': False, 'x': 1, 'y': 10} |
| 1752 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1759 | 1 | choose_effect | {'keep': None} |
| 1769 | 1 | choose_effect | {'keep': None} |
| 1780 | 1 | choose_effect | {'card': 'S212'} |
| 1791 | 1 | choose_effect | {'building': [7, 2], 'x': 7, 'y': 2, 'rotation': 4} |
| 1798 | 1 | choose_effect | {'card': 'A548'} |
| 1805 | 1 | play_animal | {'card': 'A518', 'from_display': False, 'x': 6, 'y': 5} |
| 1809 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1816 | 1 | choose_effect | {'building': [7, 8], 'x': 7, 'y': 10, 'rotation': 5} |
| 1821 | 1 | choose_effect | {'card': 'A450'} |
| 1828 | 1 | place_building | {'type': 'pavilion', 'x': 5, 'y': 10, 'rotation': 0} |

## Table 800374204  (maps ['9', '9'], Marine Worlds True; seat 0 = pinuocao0930, seat 1 = Jason_0109)


### 800374204 turn 25 — MISMATCH (first in this game)

**Error:** placements after move 89: size-1: engine-only [] bga-only [(0, 1, 0), (0, 7, 0), (1, 8, 0)]

| order | player | event | log text |
|---|---|---|---|
| 606 | pinuocao0930 | chooseActionCard | pinuocao0930 chooses action card BuildII with strength 5 |
| 610 | pinuocao0930 | buyBuilding | pinuocao0930 pays 2 for building a pavilion |
| 611 | pinuocao0930 | getBonuses | pinuocao0930 gains 1 appeal (building a pavilion) |
| 612 | pinuocao0930 | getBonuses | pinuocao0930 gains 5 money (placement bonus) |
| 616 | pinuocao0930 | buyBuilding | pinuocao0930 pays 2 for building a Kiosk |
| 621 | pinuocao0930 | buyBuilding | pinuocao0930 pays 2 for building a Kiosk |
| 623 | pinuocao0930 | pDrawCards | You draw Herpetologist from the deck |
| 631 | pinuocao0930 | actionCardCleanup | pinuocao0930 places action card Build at position 1 (finishing action) |
| 632 | pinuocao0930 | getBonuses | pinuocao0930 pays 2 money for Venom |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 606 | 0 | choose_action_card | {'type': 'build', 'spend': 0} |
| 610 | 0 | place_building | {'type': 'pavilion', 'x': 2, 'y': 1, 'rotation': 0} |
| 616 | 0 | place_building | {'type': 'kiosk', 'x': 3, 'y': 0, 'rotation': 0} |
| 621 | 0 | place_building | {'type': 'kiosk', 'x': 5, 'y': 4, 'rotation': 0} |
| 623 | 0 | take_cards | {'mode': 'deck', 'count': 1} |

## Table 800980926  (maps ['13', '13'], Marine Worlds True; seat 0 = NonNewtonianNarwhal, seat 1 = yunfeiyang90)


### 800980926 turn 58 — MISMATCH (first in this game)

**Error:** player 1, hand: only in the engine: S260; only in the replay: A439; display: only in the engine: P127; only in the replay: S260; main deck: only in the engine: A439; only in the replay: P127

| order | player | event | log text |
|---|---|---|---|
| 1754 | yunfeiyang90 | getBonuses | yunfeiyang90 pays 1 xtoken for increasing card strength |
| 1755 | yunfeiyang90 | chooseActionCard | yunfeiyang90 chooses action card AssociationI with strength 5 |
| 1759 | yunfeiyang90 | slideMeeples | yunfeiyang90 supports a conservation project on the third slot : Herbivore Management Plan |
| 1760 |  | discardCardsOnDisplay | The rightmost project card is discarded: Serengeti national park |
| 1761 | yunfeiyang90 | moveProjects | yunfeiyang90 plays a new conservation project: Herbivore Management Plan |
| 1762 |  | slideMeeples |  |
| 1763 | yunfeiyang90 | getBonuses | yunfeiyang90 gains 3 xtoken (map bonus space) |
| 1767 | yunfeiyang90 | getBonuses | yunfeiyang90 gains 2 conservation (Herbivore Management Plan) |
| 1774 | yunfeiyang90 | discardCardsOnDisplay | yunfeiyang90 digs Aquarium from the display |
| 1775 |  | fillPool | The display is replenished with Chinese Water Dragon |
| 1779 | yunfeiyang90 | discardCardsOnDisplay | yunfeiyang90 digs Chinese Water Dragon from the display |
| 1780 |  | fillPool | The display is replenished with Native Farm Animals |
| 1782 | yunfeiyang90 | pDrawCards | You draw Llama with <HERBIVORE> (Herbivore Management Plan) |
| 1787 | yunfeiyang90 | actionCardCleanup | yunfeiyang90 places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1755 | 1 | choose_action_card | {'type': 'association', 'spend': 1} |
| 1762 | 1 | association_task | {'task': 'conservation', 'project': 'P137', 'source': 'hand', 'slot': 2, 'bonus': {'type': 'xtoken', 'value': 3}} |
| 1774 | 1 | choose_effect | {'display': 'S245'} |
| 1779 | 1 | choose_effect | {'display': 'A478'} |
| 1782 | 1 | choose_effect | {'apply': 'tutor'} |

## Table 801084865  (maps ['7a', '7a'], Marine Worlds True; seat 0 = shongz, seat 1 = vldkm)


### 801084865 turn 61 — MISMATCH (first in this game)

**Error:** player 1, action cards: engine: animals II v1, association v3, sponsors II, build II, cards II \| replay: animals II v1 +Venom, association v3 +Venom, sponsors II, build II, cards II

| order | player | event | log text |
|---|---|---|---|
| 1838 | shongz | getBonuses | shongz pays 1 xtoken for increasing card strength |
| 1839 | shongz | chooseActionCard | shongz chooses action card AnimalsII with strength 5 |
| 1843 | shongz | takeBonus | shongz gets 1 x bonus-extra-shift (maxing out reputation) |
| 1847 | shongz | buyAnimal | shongz plays Western Green Mamba for 10 and places it in a size-2 enclosure |
| 1851 | shongz | getBonuses | shongz gains 6 appeal (Western Green Mamba) |
| 1855 | shongz | addMeeples | shongz uses Venom effect and gives Venom token(s) to vldkm |
| 1856 | shongz | getBonuses | shongz gains 2 appeal (Waza Special Assignment) |
| 1860 | shongz | buyAnimal | shongz plays Indian Rock Python for 11 and places it in a size-2 enclosure |
| 1873 | shongz | buyBuilding | shongz adds a pavilion for free |
| 1874 | shongz | getBonuses | shongz gains 1 appeal (building a pavilion) |
| 1880 | shongz | getBonuses | shongz gains 7 appeal (Indian Rock Python) |
| 1881 | shongz | getBonuses | shongz gains 2 appeal (Waza Special Assignment) |
| 1883 | shongz | actionCardCleanup | shongz places action card Animals at position 1 (finishing action) |
| 1885 | shongz | markCard | shongz marks Wolverine from display |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1839 | 0 | choose_action_card | {'type': 'animals', 'spend': 1} |
| 1843 | 0 | choose_effect | {'bonus_type': 'bonus-extra-shift', 'n': 1} |
| 1847 | 0 | play_animal | {'card': 'A470', 'from_display': False, 'x': 6, 'y': 1} |
| 1851 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1855 | 0 | choose_effect | {'apply': 'venom'} |
| 1860 | 0 | play_animal | {'card': 'A474', 'from_display': False, 'x': 0, 'y': 9} |
| 1873 | 0 | place_building | {'type': 'pavilion', 'x': 0, 'y': 7, 'rotation': 0} |
| 1880 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1885 | 0 | choose_effect | {'card': 'A556', 'mark': True} |

## Table 801093493  (maps ['11', '11'], Marine Worlds True; seat 0 = perrylin, seat 1 = TheCorgiLady)


### 801093493 turn 71 — MISMATCH (first in this game)

**Error:** player 0, hand: only in the replay: A427; player 0, action cards: engine: animals II, association II, sponsors II v3, build II v2 +Multiplier, cards II \| replay: animals II, association II, sponsors II v3, build II v2, cards II; player 0, buildings: only in the replay: ('size-2', 3, 4, 2, False, 0)

| order | player | event | log text |
|---|---|---|---|
| 2174 | TheCorgiLady | chooseActionCard | TheCorgiLady chooses action card SponsorsII with strength 3 |
| 2179 | TheCorgiLady | advanceBreak | TheCorgiLady advances break token of 3 space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break |
| 2180 | TheCorgiLady | getBonuses | TheCorgiLady gains 1 xtoken (triggering break) |
| 2181 | TheCorgiLady | getBonuses | TheCorgiLady gains 6 money |
| 2183 | TheCorgiLady | actionCardCleanup | TheCorgiLady places action card Sponsors at position 1 (finishing action) |
| 2188 |  | startBreak | Starting a new break |
| 2190 |  | discardTokens | All tokens are removed from player cards |
| 2191 |  | slideMeeples | All workers go back to each player's reserve |
| 2192 |  | addMeeples | Replenishing partner zoos and universities |
| 2193 |  | discardCardsOnDisplay | Removing first two cards of the display: Expert In Large Animals, Expert In Herbivores |
| 2194 |  | fillPool | The display is replenished with Rhesus Monkey Park, Northern Giraffe |
| 2196 | TheCorgiLady | getBonuses | TheCorgiLady gains 24 money (appeal income) |
| 2197 | TheCorgiLady | getBonuses | TheCorgiLady gains 2 money (kiosk income) |
| 2198 | TheCorgiLady | getBonuses | TheCorgiLady gains 6 money (map income) |
| 2200 | perrylin | takeBonus | perrylin gets 5 x money (map bonus space) |
| 2201 | perrylin | getBonuses | perrylin gains 5 money (map bonus space) |
| 2205 | perrylin | takeBonus | perrylin gets 1 x Snapping (map bonus space) |
| 2209 | perrylin | snapCard | perrylin snaps White Rhinoceros from the display |
| 2213 | perrylin | takeBonus | perrylin gets 1 x size-2 (map bonus space) |
| 2217 | perrylin | buyBuilding | perrylin adds a size-2 enclosure for free |
| 2218 | perrylin | getBonuses | perrylin gains 30 money (appeal income) |
| 2219 | perrylin | getBonuses | perrylin gains 9 money (kiosk income) |
| 2222 |  | finishBreak | End of the break |
| 2223 |  | fillPool | The display is replenished with Red Deer |
| 2226 | perrylin | getBonuses | perrylin gains 4 conservation (Favorite Zoo) |
| 2227 | TheCorgiLady | getBonuses | TheCorgiLady gains 1 conservation (Quarantine Lab) |
| 2228 | TheCorgiLady | getBonuses | TheCorgiLady gains 1 conservation (Specialized Habitat Zoo) |
| 2229 | perrylin | finalScoring | perrylin has 71<APPEAL> and scores 51 for having 25<CONSERVATION>. perrylin scores 122. |
| 2230 | TheCorgiLady | finalScoring | TheCorgiLady has 45<APPEAL> and scores 12 for having 12<CONSERVATION>. TheCorgiLady scores 57. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2174 | 1 | choose_action_card | {'type': 'sponsors', 'spend': 0} |
| 2179 | 1 | sponsor_break | {} |

## Table 810221853  (maps ['11', '11'], Marine Worlds True; seat 0 = FactoryKorea, seat 1 = Laaan)


### 810221853 turn 34 — ILLEGAL (first in this game)

**Error:** choose_effect {'cards': ['A432', 'A516']} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 936 | FactoryKorea | chooseActionCard | FactoryKorea chooses action card AnimalsII with strength 5 |
| 937 | FactoryKorea | getBonuses | FactoryKorea gains 1 reputation (max strength Animals) |
| 941 | FactoryKorea | buyAnimal | FactoryKorea plays Common Agama for 6 and places it in the Reptile House |
| 946 | FactoryKorea | pUnstoreCard | You takes Indian Rhinoceros back into your hand (Map 11 Effect) |
| 954 | FactoryKorea | pDiscardCards | You sell Northern Cassowary, Indian Rhinoceros cards for 8 money |
| 958 | FactoryKorea | getBonuses | FactoryKorea gains 3 appeal (Common Agama) |
| 962 | FactoryKorea | buyAnimal | FactoryKorea buys Longhorn Cowfish from display for 9 and places it in the small aquarium |
| 964 | FactoryKorea | getBonuses | FactoryKorea gains 4 appeal (Longhorn Cowfish) |
| 966 | FactoryKorea | actionCardCleanup | FactoryKorea places action card Animals at position 1 (finishing action) |
| 973 |  | fillPool | The display is replenished with Explorer |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 936 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 941 | 0 | play_animal | {'card': 'A473', 'from_display': False, 'x': 2, 'y': 3} |
| 954 | 0 | choose_effect | {'cards': ['A432', 'A516']} |
| 958 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 962 | 0 | play_animal | {'card': 'A536', 'from_display': True, 'x': 5, 'y': 6} |
| 964 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 966 | 0 | choose_effect | {'boost': 'sponsors'} |

## Table 810599901  (maps ['4a', '4a'], Marine Worlds True; seat 0 = SometimesRaining, seat 1 = - Ash3s -)


### 810599901 turn 61 — MISMATCH (first in this game)

**Error:** player 1, x tokens: engine 2, replay 1

| order | player | event | log text |
|---|---|---|---|
| 2093 | - Ash3s - | actionCardCleanup | - Ash3s - places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2093 | 1 | skip_action | {'type': 'animals'} |

## Table 815336402  (maps ['1a', '1a'], Marine Worlds True; seat 0 = fox254, seat 1 = MrWu1open)


### 815336402 turn 66 — ILLEGAL (first in this game)

**Error:** play_animal {'card': 'A445', 'from_display': False, 'x': 5, 'y': 4} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1992 | fox254 | getBonuses | fox254 pays 1 xtoken for increasing card strength |
| 1993 | fox254 | chooseActionCard | fox254 chooses action card AnimalsII with strength 5 |
| 1994 | fox254 | getBonuses | fox254 gains 1 reputation (max strength Animals) |
| 1995 | fox254 | takeBonus | fox254 gets 1 x xtoken (reputation track bonus) |
| 1996 | fox254 | getBonuses | fox254 gains 1 xtoken (reputation track bonus) |
| 2003 | fox254 | buyAnimal | fox254 plays Golden Snub-nosed Monkey for 15 and places it in a size-3 enclosure |
| 2008 | fox254 | getBonuses | fox254 gains 6 appeal (Golden Snub-nosed Monkey) |
| 2012 | fox254 | getBonuses | fox254 gains 1 conservation (Golden Snub-nosed Monkey) |
| 2016 | fox254 | getBonuses | fox254 gains 2 appeal (Cable Car) |
| 2023 | fox254 | buyAnimal | fox254 plays Crested Porcupine for 5 and places it in a size-2 enclosure |
| 2027 | fox254 | getBonuses | fox254 gains 2 appeal (Map 1 bonus) |
| 2031 | fox254 | getBonuses | fox254 gains 3 appeal (Crested Porcupine) |
| 2036 | fox254 | actionCardCleanup | fox254 places action card Animals at position 1 (finishing action) |
| 2039 | fox254 | getBonuses | fox254 gains 3 conservation (Favorite Zoo) |
| 2040 | MrWu1open | getBonuses | MrWu1open gains 1 conservation (Foreign Institute) |
| 2041 | MrWu1open | getBonuses | MrWu1open gains 3 conservation (Accessible Zoo) |
| 2042 | fox254 | finalScoring | fox254 has 65<APPEAL> and scores 33 for having 19<CONSERVATION>. fox254 scores 98. |
| 2043 | MrWu1open | finalScoring | MrWu1open has 56<APPEAL> and scores 57 for having 27<CONSERVATION>. MrWu1open scores 113. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1993 | 0 | choose_action_card | {'type': 'animals', 'spend': 1} |
| 2003 | 0 | play_animal | {'card': 'A555', 'from_display': False, 'x': 1, 'y': 10} |
| 2008 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2012 | 0 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 2023 | 0 | play_animal | {'card': 'A445', 'from_display': False, 'x': 5, 'y': 4} |
| 2027 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2031 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 819242235  (maps ['3a', '3a'], Marine Worlds True; seat 0 = 54321048bigi, seat 1 = vuk246)


### 819242235 turn 62 — MISMATCH (first in this game)

**Error:** player 0, action cards: cards II v3 is in slot 5 in the engine but slot 1 in the replay (the other cards keep their order)  [engine: association v1, animals II, sponsors II, build, cards II v3 \| replay: cards II v3, association v1, animals II, sponsors II, build]; display: only in the engine: None; only in the replay: A436; main deck: only in the engine: A436

| order | player | event | log text |
|---|---|---|---|
| 1705 | 54321048bigi | chooseActionCard | 54321048bigi chooses action card CardsII with strength 5 |
| 1707 | 54321048bigi | advanceBreak | 54321048bigi advances break token of 2 space(s), now at 4/9 |
| 1711 | 54321048bigi | snapCard | 54321048bigi snaps Shoebill from the display |
| 1716 | 54321048bigi | actionCardCleanup | 54321048bigi places action card Cards at position 1 (finishing action) |
| 1720 |  | fillPool | The display is replenished with American Bison |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1705 | 0 | choose_action_card | {'type': 'cards', 'spend': 0} |
| 1711 | 0 | take_cards | {'mode': 'snap', 'card': 'A498'} |

## Table 821335171  (maps ['7a', '7a'], Marine Worlds True; seat 0 = jiangzh521, seat 1 = JonnyBlazin5)


### 821335171 turn 76 — ILLEGAL (first in this game)

**Error:** choose_effect {'keep': 'A472'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2497 | jiangzh521 | chooseActionCard | jiangzh521 chooses action card AssociationI with strength 5 |
| 2501 | jiangzh521 | slideMeeples | jiangzh521 supports a conservation project on the first slot : Sea Animals |
| 2502 | jiangzh521 | discardTokens | jiangzh521 uses 1 x bonus-icon |
| 2503 |  | slideMeeples |  |
| 2507 | jiangzh521 | getBonuses | jiangzh521 gains 5 conservation (Sea Animals) |
| 2509 | jiangzh521 | pDiscardCards | You pouch Field Research Type D Orcas, Coastal Manta Ray cards for 4 appeal |
| 2514 | jiangzh521 | actionCardCleanup | jiangzh521 places action card Association at position 1 (finishing action) |
| 2516 | jiangzh521 | pDrawCards | You draw Coquerel's Sifaka, Coconut Lorikeet, Rock Monitor, Devil Firefish, Sponsorship: Elephants, Veterinarian for hunter effect |
| 2522 | jiangzh521 | pDiscardCards | You keep Rock Monitor and discard Coquerel's Sifaka, Coconut Lorikeet, Devil Firefish, Sponsorship: Elephants, Veterinarian for hunter effect |
| 2529 | jiangzh521 | actionCardCleanup | jiangzh521 places Cards at position 1 (Clever effect) |
| 2531 |  | fillPool | The display is replenished with Cotton-top Tamarin |
| 2533 | jiangzh521 | getBonuses | jiangzh521 gains 6 appeal (Diversity Researcher) |
| 2534 | jiangzh521 | getBonuses | jiangzh521 gains 3 appeal (Underwater Tunnel) |
| 2535 | jiangzh521 | getBonuses | jiangzh521 gains 2 conservation (Small Animal Zoo) |
| 2536 | JonnyBlazin5 | getBonuses | JonnyBlazin5 gains 1 conservation (Meerkat Den) |
| 2537 | JonnyBlazin5 | getBonuses | JonnyBlazin5 gains 5 appeal (Conference On Australia) |
| 2538 | JonnyBlazin5 | getBonuses | JonnyBlazin5 gains 3 conservation (Sponsored Zoo) |
| 2539 | JonnyBlazin5 | getBonuses | JonnyBlazin5 gains 4 conservation (Designer Zoo) |
| 2540 | jiangzh521 | finalScoring | jiangzh521 has 99<APPEAL> and scores 42 for having 22<CONSERVATION>. jiangzh521 scores 141. |
| 2541 | JonnyBlazin5 | finalScoring | JonnyBlazin5 has 109<APPEAL> and scores 39 for having 21<CONSERVATION>. JonnyBlazin5 scores 148. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2497 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 2503 | 0 | association_task | {'task': 'conservation', 'project': 'P133', 'source': 'play', 'slot': 0, 'bonus': {'slot': 3}, 'icon': True} |
| 2509 | 0 | choose_effect | {'card': 'S277'} |
| 2509 | 0 | choose_effect | {'card': 'A543'} |
| 2522 | 0 | choose_effect | {'keep': 'A472'} |
| 2529 | 0 | choose_effect | {'type': 'cards'} |

### 821335171 turn 56 — MISMATCH (later; may be a consequence)

**Error:** placements after move 240: underwater-tunnel: engine-only [(0, 11, 5), (1, 12, 2), (1, 12, 4)] bga-only []

| order | player | event | log text |
|---|---|---|---|
| 1587 | jiangzh521 | getBonuses | jiangzh521 pays 1 xtoken for increasing card strength |
| 1588 | jiangzh521 | chooseActionCard | jiangzh521 chooses action card SponsorsII with strength 6 |
| 1592 | jiangzh521 | playSponsor | jiangzh521 plays Underwater Tunnel |
| 1599 | jiangzh521 | buyBuilding | jiangzh521 adds the underwater tunnel for free |
| 1600 | jiangzh521 | getBonuses | jiangzh521 gains 2 appeal (Underwater Tunnel) |
| 1606 | jiangzh521 | playSponsor | jiangzh521 buys Sponsorship: Reptiles from display |
| 1607 | jiangzh521 | getBonuses | jiangzh521 pays 1 money for playing sponsor from reputation range |
| 1608 | jiangzh521 | getBonuses | jiangzh521 gains 3 appeal (Sponsorship: Reptiles) |
| 1611 | jiangzh521 | actionCardCleanup | jiangzh521 places action card Sponsors at position 1 (finishing action) |
| 1615 |  | fillPool | The display is replenished with Cheetah |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1588 | 0 | choose_action_card | {'type': 'sponsors', 'spend': 1} |
| 1592 | 0 | play_sponsor | {'card': 'S279', 'from_display': False} |
| 1599 | 0 | place_building | {'type': 'underwater-tunnel', 'x': 8, 'y': 3, 'rotation': 0} |
| 1606 | 0 | play_sponsor | {'card': 'S232', 'from_display': True} |

## Table 826177225  (maps ['8a', '8a'], Marine Worlds True; seat 0 = Burgos, seat 1 = MolybdenumX)


### 826177225 turn 20 — ILLEGAL (first in this game)

**Error:** mark an animal of the display that has no mark

| order | player | event | log text |
|---|---|---|---|
| 468 | MolybdenumX | chooseActionCard | MolybdenumX chooses action card AnimalsI with strength 5 |
| 472 | MolybdenumX | buyAnimal | MolybdenumX plays European Badger for 2 and places it in a size-2 enclosure |
| 473 | MolybdenumX | getBonuses | MolybdenumX gains 3 appeal (European Badger) |
| 477 | MolybdenumX | buyAnimal | MolybdenumX plays Eurasian Lynx for 8 and places it in a size-3 enclosure |
| 481 | MolybdenumX | getBonuses | MolybdenumX gains 4 appeal (Iconic animal) |
| 482 | MolybdenumX | getBonuses | MolybdenumX gains 2 appeal (Eurasian Lynx) |
| 484 | MolybdenumX | actionCardCleanup | MolybdenumX places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 468 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 472 | 1 | play_animal | {'card': 'A419', 'from_display': False, 'x': 7, 'y': 6} |
| 473 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 477 | 1 | play_animal | {'card': 'A418', 'from_display': False, 'x': 7, 'y': 2} |
| 482 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 484 | 1 | choose_effect | {'boost': 'animals'} |

### 826177225 turn 75 — ILLEGAL (later; may be a consequence)

**Error:** use_token {'token': 'bonus-sponsor-gray'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2197 | Burgos | chooseActionCard | Burgos chooses action card AssociationI with strength 5 |
| 2201 | Burgos | slideMeeples | Burgos supports a conservation project on the first slot : Africa |
| 2202 | Burgos | moveProjects | Burgos plays a new conservation project: Africa |
| 2203 |  | slideMeeples |  |
| 2207 | Burgos | slideMeeples | Burgos gains a new Association worker |
| 2208 | Burgos | getBonuses | Burgos gains 1 conservation (last worker bonus) |
| 2209 | Burgos | getBonuses | Burgos gains 5 conservation (Africa) |
| 2211 | Burgos | actionCardCleanup | Burgos places action card Association at position 1 (finishing action) |
| 2216 | Burgos | discardTokens | Burgos uses 1 x bonus-sponsor-gray |
| 2220 | Burgos | getBonuses | Burgos pays 2 money for buying sponsor card |
| 2221 | Burgos | playSponsor | Burgos plays Guided School Tours |
| 2225 | Burgos | getBonuses | Burgos gains 1 conservation (Guided School Tours) |
| 2226 | Burgos | getBonuses | Burgos gains 1 appeal (Guided School Tours) |
| 2229 | Burgos | getBonuses | Burgos gains 1 conservation (Guided School Tours) |
| 2230 | Burgos | getBonuses | Burgos gains 3 appeal (Underwater Tunnel) |
| 2231 | Burgos | getBonuses | Burgos gains 2 conservation (Favorite Zoo) |
| 2232 | MolybdenumX | getBonuses | MolybdenumX gains 1 conservation (Veterinarian) |
| 2233 | MolybdenumX | getBonuses | MolybdenumX gains 1 conservation (Conference On Europe) |
| 2234 | MolybdenumX | getBonuses | MolybdenumX gains 4 conservation (Accessible Zoo) |
| 2235 | MolybdenumX | getBonuses | MolybdenumX gains 3 conservation (International Zoo) |
| 2236 | Burgos | finalScoring | Burgos has 92<APPEAL> and scores 30 for having 18<CONSERVATION>. Burgos scores 122. |
| 2237 | MolybdenumX | finalScoring | MolybdenumX has 78<APPEAL> and scores 57 for having 27<CONSERVATION>. MolybdenumX scores 135. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2197 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 2203 | 0 | association_task | {'task': 'conservation', 'project': 'P103', 'source': 'hand', 'slot': 0, 'bonus': {'type': 'Worker'}} |
| 2216 | 0 | use_token | {'token': 'bonus-sponsor-gray'} |

## Table 829557427  (maps ['1a', '1a'], Marine Worlds True; seat 0 = thoams, seat 1 = Rock_P)


### 829557427 turn 30 — MISMATCH (first in this game)

**Error:** player 1, action cards: engine: sponsors II v2, cards II, association, build, animals II v4 \| replay: sponsors II v2 +Venom, cards II +Venom, association, build, animals II v4

| order | player | event | log text |
|---|---|---|---|
| 862 | thoams | chooseActionCard | thoams chooses action card AnimalsII with strength 5 |
| 863 | thoams | getBonuses | thoams gains 1 reputation (max strength Animals) |
| 867 | thoams | buyAnimal | thoams plays Western Green Mamba for 10 and places it in a size-2 enclosure |
| 871 | thoams | getBonuses | thoams gains 2 appeal (Map 1 bonus) |
| 875 | thoams | addMeeples | thoams uses Venom effect and gives Venom token(s) to Rock_P |
| 876 | thoams | getBonuses | thoams gains 6 appeal (Western Green Mamba) |
| 883 | thoams | actionCardCleanup | thoams places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 862 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 867 | 0 | play_animal | {'card': 'A470', 'from_display': False, 'x': 6, 'y': 7} |
| 871 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 875 | 0 | choose_effect | {'apply': 'venom'} |
| 876 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 830223319  (maps ['8a', '8a'], Marine Worlds True; seat 0 = Akimoon, seat 1 = RhodanP)


### 830223319 turn 5 — ILLEGAL (first in this game)

**Error:** place_building {'type': 'kiosk', 'x': 4, 'y': 5, 'rotation': 0} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 147 | Akimoon | chooseActionCard | Akimoon chooses action card BuildI with strength 5 |
| 151 | Akimoon | buyBuilding | Akimoon pays 10 for building a size-5 enclosure |
| 152 | Akimoon | getBonuses | Akimoon gains 1 xtoken (placement bonus) |
| 157 | Akimoon | buyBuilding | Akimoon pays 3 for building a Kiosk |
| 158 | Akimoon | getBonuses | Akimoon gains 5 money (placement bonus) |
| 166 | Akimoon | buyBuilding | Akimoon pays 3 for building a Kiosk |
| 167 | Akimoon | getBonuses | Akimoon gains 1 reputation (placement bonus) |
| 170 | Akimoon | actionCardCleanup | Akimoon places action card Build at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 147 | 0 | choose_action_card | {'type': 'build', 'spend': 0} |
| 151 | 0 | place_building | {'type': 'size-5', 'x': 3, 'y': 2, 'rotation': 0} |
| 157 | 0 | place_building | {'type': 'kiosk', 'x': 1, 'y': 2, 'rotation': 0} |
| 166 | 0 | place_building | {'type': 'kiosk', 'x': 4, 'y': 5, 'rotation': 0} |

## Table 840844588  (maps ['3a', '14'], Marine Worlds True; seat 0 = monkeydo, seat 1 = BlanketAddict)


### 840844588 turn 61 — MISMATCH (first in this game)

**Error:** player 0, tokens: only in the engine: ('bonus-ignore-conditions', 'notepad')

| order | player | event | log text |
|---|---|---|---|
| 2130 | monkeydo | chooseActionCard | monkeydo chooses action card AnimalsII with strength 4 |
| 2134 | monkeydo | discardTokens | monkeydo uses 3 x bonus-ignore-conditions |
| 2135 | monkeydo | buyAnimal | monkeydo plays Giant Panda for 27 and places it in a size-4 enclosure |
| 2136 | BlanketAddict | getBonuses | BlanketAddict gains 3 money (Expert In Herbivores) |
| 2140 | monkeydo | getBonuses | monkeydo gains 2 conservation (Giant Panda) |
| 2144 | monkeydo | getBonuses | monkeydo gains 10 appeal (Giant Panda) |
| 2145 | monkeydo | getBonuses | monkeydo gains 1 appeal (maxing out reputation) |
| 2152 | monkeydo | actionCardCleanup | monkeydo places action card Animals at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2130 | 0 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 2135 | 0 | play_animal | {'card': 'A433', 'from_display': False, 'x': 7, 'y': 2} |
| 2140 | 0 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 2144 | 0 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |

## Table 851985853  (maps ['9', '9'], Marine Worlds True; seat 0 = pjzfcjm, seat 1 = BirdofFreedom)


### 851985853 turn 58 — ILLEGAL (first in this game)

**Error:** choose_effect {'card': 'S276'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1926 | BirdofFreedom | getBonuses | BirdofFreedom pays 2 xtoken for increasing card strength |
| 1927 | BirdofFreedom | chooseActionCard | BirdofFreedom chooses action card AnimalsII with strength 5 |
| 1928 | BirdofFreedom | getBonuses | BirdofFreedom gains 1 reputation (max strength Animals) |
| 1929 | BirdofFreedom | takeBonus | BirdofFreedom gets 1 x conservation (reputation track bonus) |
| 1930 | BirdofFreedom | getBonuses | BirdofFreedom gains 1 conservation (reputation track bonus) |
| 1934 | BirdofFreedom | buyAnimal | BirdofFreedom plays Shoebill for 9 and places it in a size-1 enclosure |
| 1938 | BirdofFreedom | getBonuses | BirdofFreedom gains 3 appeal (Shoebill) |
| 1942 | BirdofFreedom | getBonuses | BirdofFreedom gains 1 conservation (Shoebill) |
| 1943 | BirdofFreedom | getBonuses | BirdofFreedom gains 2 money (Explorer) |
| 1944 | BirdofFreedom | getBonuses | BirdofFreedom gains 1 appeal (Explorer) |
| 1948 | BirdofFreedom | buyAnimal | BirdofFreedom plays Loggerhead Sea Turtle for 23 and places it in the large aquarium, the small aquarium |
| 1949 | BirdofFreedom | getBonuses | BirdofFreedom gains 3 money (Marine Biologist) |
| 1953 | BirdofFreedom | getBonuses | BirdofFreedom gains 8 appeal (Loggerhead Sea Turtle) |
| 1955 | BirdofFreedom | pDrawCards | You draw Landscape Gardener, Angthong national park, Primate breeding program, Blackside Hawkfish, Large Animals, Coastal Manta Ray for scuba dive effect |
| 1957 | BirdofFreedom | pDiscardCards | You keep Landscape Gardener and discard Angthong national park, Primate breeding program, Blackside Hawkfish, Large Animals, Coastal Manta Ray for scuba dive ef |
| 1971 | BirdofFreedom | getBonuses | BirdofFreedom pays 6 money for buying sponsor card |
| 1972 | BirdofFreedom | playSponsor | BirdofFreedom plays Landscape Gardener |
| 1976 | BirdofFreedom | endOfGame | End of game triggered: everyone except BirdofFreedom will get a last turn to play |
| 1977 | BirdofFreedom | getBonuses | BirdofFreedom gains 4 appeal (Landscape Gardener) |
| 1981 | BirdofFreedom | getBonuses | BirdofFreedom gains 4 money (Explorer) |
| 1982 | BirdofFreedom | getBonuses | BirdofFreedom gains 2 appeal (Explorer) |
| 1984 | BirdofFreedom | actionCardCleanup | BirdofFreedom places action card Animals at position 1 (finishing action) |
| 1986 | pjzfcjm | playerConcedeGame | pjzfcjm concedes this game. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1927 | 1 | choose_action_card | {'type': 'animals', 'spend': 2} |
| 1934 | 1 | play_animal | {'card': 'A498', 'from_display': False, 'x': 3, 'y': 4} |
| 1938 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1942 | 1 | choose_effect | {'apply': 'gain', 'res': 'conservation'} |
| 1948 | 1 | play_animal | {'card': 'A551', 'from_display': False, 'x': 8, 'y': 5} |
| 1953 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 1957 | 1 | choose_effect | {'keep': 'S276'} |
| 1972 | 1 | choose_effect | {'card': 'S276'} |

## Table 888587994  (maps ['T1', 'T1'], Marine Worlds True; seat 0 = N3EE, seat 1 = 653862455)


### 888587994 turn 71 — ILLEGAL (first in this game)

**Error:** take_cards {'mode': 'deck', 'count': 1} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 1705 | 653862455 | getBonuses | 653862455 pays 2 xtoken for increasing card strength |
| 1706 | 653862455 | chooseActionCard | 653862455 chooses action card AssociationI with strength 5 |
| 1710 | 653862455 | slideMeeples | 653862455 supports a conservation project on the third slot : Habitat Diversity |
| 1711 |  | slideMeeples |  |
| 1715 | 653862455 | getBonuses | 653862455 gains 2 conservation (Habitat Diversity) |
| 1717 | 653862455 | pDrawCards | You draw Mandrill from the deck |
| 1722 | 653862455 | actionCardCleanup | 653862455 places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1706 | 1 | choose_action_card | {'type': 'association', 'spend': 2} |
| 1711 | 1 | association_task | {'task': 'conservation', 'project': 'P102', 'source': 'play', 'slot': 2, 'bonus': {'slot': 3}} |
| 1717 | 1 | take_cards | {'mode': 'deck', 'count': 1} |

### 888587994 turn 97 — ILLEGAL (later; may be a consequence)

**Error:** mark an animal of the display that has no mark

| order | player | event | log text |
|---|---|---|---|
| 2413 | N3EE | getBonuses | N3EE pays 1 xtoken for increasing card strength |
| 2414 | N3EE | chooseActionCard | N3EE chooses action card AssociationI with strength 5 |
| 2418 | N3EE | slideMeeples | N3EE supports a conservation project on the first slot : Birds |
| 2419 |  | slideMeeples |  |
| 2423 | N3EE | getBonuses | N3EE gains 5 conservation (Birds) |
| 2427 | N3EE | buyBuilding | N3EE adds a size-2 enclosure for free |
| 2429 | N3EE | actionCardCleanup | N3EE places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2414 | 0 | choose_action_card | {'type': 'association', 'spend': 1} |
| 2419 | 0 | association_task | {'task': 'conservation', 'project': 'P112', 'source': 'play', 'slot': 0, 'bonus': {'type': 'size-2'}} |
| 2427 | 0 | place_building | {'type': 'size-2', 'x': 7, 'y': 0, 'rotation': 5} |

### 888587994 turn 27 — MISMATCH (later; may be a consequence)

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

## Table 893574750  (maps ['3a', '3a'], Marine Worlds True; seat 0 = Propaganda Panda, seat 1 = 2win9)


### 893574750 turn 77 — ILLEGAL (first in this game)

**Error:** use_token {'token': 'bonus-sponsor-gray'} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 2422 | 2win9 | chooseActionCard | 2win9 chooses action card AnimalsII with strength 2 |
| 2426 | 2win9 | buyAnimal | 2win9 plays Devil Firefish for 13 and places it in the small aquarium |
| 2428 | 2win9 | getBonuses | 2win9 gains 3 money (Marine Biologist) |
| 2432 | 2win9 | getBonuses | 2win9 gains 6 appeal (Devil Firefish) |
| 2436 | 2win9 | getBonuses | 2win9 gains 1 xtoken (Inventive) |
| 2437 | 2win9 | addMeeples | 2win9 uses Venom effect and gives Venom token(s) to Propaganda Panda |
| 2439 | 2win9 | actionCardCleanup | 2win9 places action card Animals at position 1 (finishing action) |
| 2444 | 2win9 | discardTokens | 2win9 uses 1 x bonus-sponsor-gray |
| 2448 | 2win9 | getBonuses | 2win9 pays 5 money for buying sponsor card |
| 2449 | 2win9 | playSponsor | 2win9 plays Expert In Small Animals |
| 2450 | 2win9 | getBonuses | 2win9 gains 10 appeal (Expert In Small Animals) |
| 2453 | Propaganda Panda | getBonuses | Propaganda Panda gains 1 conservation (Technology Institute) |
| 2454 | Propaganda Panda | getBonuses | Propaganda Panda gains 1 conservation (Expert On The Americas) |
| 2455 | Propaganda Panda | getBonuses | Propaganda Panda gains 3 appeal (Underwater Tunnel) |
| 2456 | Propaganda Panda | getBonuses | Propaganda Panda gains 4 conservation (Favorite Zoo) |
| 2457 | 2win9 | getBonuses | 2win9 gains 4 conservation (Small Animal Zoo) |
| 2458 | Propaganda Panda | finalScoring | Propaganda Panda has 75<APPEAL> and scores 60 for having 28<CONSERVATION>. Propaganda Panda scores 135. |
| 2459 | 2win9 | finalScoring | 2win9 has 74<APPEAL> and scores 72 for having 32<CONSERVATION>. 2win9 scores 146. |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 2422 | 1 | choose_action_card | {'type': 'animals', 'spend': 0} |
| 2426 | 1 | play_animal | {'card': 'A538', 'from_display': False, 'x': 5, 'y': 2} |
| 2432 | 1 | choose_effect | {'apply': 'gain', 'res': 'appeal'} |
| 2436 | 1 | choose_effect | {'apply': 'gain', 'res': 'xtoken'} |
| 2437 | 1 | choose_effect | {'apply': 'venom'} |
| 2444 | 1 | use_token | {'token': 'bonus-sponsor-gray'} |

## Table 897585112  (maps ['1a', '7a'], Marine Worlds True; seat 0 = skälding, seat 1 = Nicolas21)


### 897585112 turn 4 — ILLEGAL (first in this game)

**Error:** place_building {'type': 'kiosk', 'x': 6, 'y': 7, 'rotation': 0, 'extra': True} not in legal_actions

| order | player | event | log text |
|---|---|---|---|
| 120 | Nicolas21 | chooseActionCard | Nicolas21 chooses action card BuildI with strength 4 |
| 124 | Nicolas21 | buyBuilding | Nicolas21 pays 6 for building a size-3 enclosure |
| 128 | Nicolas21 | buyBuilding | Nicolas21 adds a Kiosk for free |
| 133 | Nicolas21 | actionCardCleanup | Nicolas21 places action card Build at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 120 | 1 | choose_action_card | {'type': 'build', 'spend': 0} |
| 124 | 1 | place_building | {'type': 'size-3', 'x': 6, 'y': 9, 'rotation': 1} |
| 128 | 1 | place_building | {'type': 'kiosk', 'x': 6, 'y': 7, 'rotation': 0} |

### 897585112 turn 52 — MISMATCH (later; may be a consequence)

**Error:** player 0, reputation: engine 8, replay 9

| order | player | event | log text |
|---|---|---|---|
| 1579 | skälding | chooseActionCard | skälding chooses action card AssociationII with strength 5 |
| 1583 | skälding | slideMeeples | skälding supports a conservation project on the second slot : Herbivore Management Plan |
| 1584 | skälding | moveProjects | skälding plays a new conservation project: Herbivore Management Plan |
| 1585 |  | slideMeeples |  |
| 1592 | skälding | getBonuses | skälding pays 4 money for buying sponsor card |
| 1593 | skälding | playSponsor | skälding plays Science Library |
| 1594 | skälding | getBonuses | skälding gains 2 money (Science Library) |
| 1595 | skälding | getBonuses | skälding gains 2 appeal (Science Library) |
| 1599 | skälding | getBonuses | skälding gains 1 reputation (Herbivore Management Plan) |
| 1603 | skälding | getBonuses | skälding gains 2 conservation (Herbivore Management Plan) |
| 1607 | skälding | takeBonus | skälding gets 5 x money |
| 1608 | skälding | getBonuses | skälding gains 5 money |
| 1613 | skälding | discardCardsOnDisplay | skälding digs Broad-snouted Caiman from the display |
| 1614 |  | fillPool | The display is replenished with Stoat |
| 1621 | skälding | discardCardsOnDisplay | skälding digs Stoat from the display |
| 1622 |  | fillPool | The display is replenished with Common Wall Lizard |
| 1625 | skälding | actionCardCleanup | skälding places action card Association at position 1 (finishing action) |

**Engine actions derived from the log:**

| log order | seat | action | args |
|---|---|---|---|
| 1579 | 0 | choose_action_card | {'type': 'association', 'spend': 0} |
| 1585 | 0 | association_task | {'task': 'conservation', 'project': 'P137', 'source': 'hand', 'slot': 1, 'bonus': {'slot': 3}} |
| 1593 | 0 | choose_effect | {'card': 'S208'} |
| 1607 | 0 | choose_effect | {'bonus_type': 'money', 'n': 5} |
| 1613 | 0 | choose_effect | {'display': 'A480'} |
| 1621 | 0 | choose_effect | {'display': 'A420'} |

## Table 904989085  (maps ['11', '4a'], Marine Worlds True; seat 0 = Propaganda Panda, seat 1 = sorryimlikethis)


### 904989085 turn 79 — ILLEGAL (first in this game)

**Error:** choose_slot {'slot': 0, 'icon': True} not in legal_actions (project P135)

| order | player | event | log text |
|---|---|---|---|
| 2359 | sorryimlikethis | getBonuses | sorryimlikethis pays 3 xtoken for increasing card strength |
| 2360 | sorryimlikethis | chooseActionCard | sorryimlikethis chooses action card AssociationI with strength 5 |
| 2364 | sorryimlikethis | slideMeeples | sorryimlikethis supports a conservation project on the first slot : Bird Management Plan |
| 2365 |  | slideMeeples |  |
| 2369 | sorryimlikethis | getBonuses | sorryimlikethis gains 2 conservation (Bird Management Plan) |
| 2376 | sorryimlikethis | buyBuilding | sorryimlikethis adds a pavilion for free |
| 2377 | sorryimlikethis | getBonuses | sorryimlikethis gains 1 appeal (building a pavilion) |
| 2378 | sorryimlikethis | getBonuses | sorryimlikethis gains 1 xtoken (placement bonus) |
| 2379 | sorryimlikethis | slideMeeples | sorryimlikethis gains a new Association worker |
| 2380 | sorryimlikethis | getBonuses | sorryimlikethis gains 1 conservation (last worker bonus) |

**Engine actions derived from the log:**

_no cleanup_

