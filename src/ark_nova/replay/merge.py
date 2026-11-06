"""Runs of draws of one player, for the player who is not the point of view (the viewer, `web/js/pov.js` `mergedAway`).

BGA logs the draws of an upgraded Cards action one per move. The opponent's hand is hidden, so for a viewer who follows the other player such a run is one step: the replay skips the
steps of the run but the last, the Log shows one line (`label_pov[viewer]` of the last step: "X draws 4 cards from the deck") under the number of the first move. The point of view of
the acting player keeps every step (the cards he drew are his to see one by one).

Only draws are merged. Digs, snaps and the takes in the reputation range never are: each of them changes the display, which is replenished step by step, and the money a mark pays is a step
of its own. A draw that is the second half of a dig from the hand (the same move: "digs 1 card from their hand", then "draws 1 card from the deck", the Digging Cards action) does not
belong to a run of draws; the draws after it do.

Every step of a run gets `merge = {seat, kind, id, last, from}` (`from`: the first BGA move of the run); the last one also has `label`, the same text as its `label_pov[viewer]`.
Nothing is removed from the step list: forks, indices and the engine states stay as they are."""
from __future__ import annotations

import re

_DRAW_N = re.compile(r"draws (\d+) cards? from the deck$")


def _draws(step: dict, name: str, other_label: str | None) -> int | None:
    """How many cards the step "X draws ... from the deck" of the player `name` draws (the count is in the hidden text of the other point of view), None for any other step."""
    text = str(step.get("label") or "").strip()
    if "·" in text or not text.startswith(name + " ") or not text.endswith(" from the deck") or " draws " not in text:
        return None
    for t in (other_label, text):
        m = _DRAW_N.search(t or "")
        if m:
            return int(m.group(1))
    return None


def _after_dig(steps: list, i: int) -> bool:
    """The step is the second half of a dig in the same BGA move (Digging Cards: "X digs 1 card from their hand", then "X draws 1 card from the deck")."""
    return i > 0 and steps[i - 1].get("move_id") == steps[i].get("move_id") and " digs " in str(steps[i - 1].get("label") or "")


def _ctx(step: dict):
    return step["state"].get("turn_context")


def mark_merges(steps: list, names: list) -> int:
    """Marks the runs (see the module text); returns how many there are."""
    runs = 0
    i, n = 0, len(steps)
    hidden = lambda x, seat: (steps[x].get("label_pov") or [None, None])[1 - seat]          # (the text of the other player's point of view)
    while i < n:
        st = steps[i]
        seat = next((s for s, nm in enumerate(names) if nm and str(st.get("label") or "").startswith(nm + " ")), None)
        if seat is None or len(names) != 2 or st["state"].get("phase") == "setup" or _after_dig(steps, i):
            i += 1
            continue
        count = _draws(st, names[seat], hidden(i, seat))
        if count is None:
            i += 1
            continue
        group, total = [i], count
        j = i + 1
        while j < n and _ctx(steps[j]) == _ctx(steps[i]) and not _after_dig(steps, j):
            c = _draws(steps[j], names[seat], hidden(j, seat))
            if c is None:
                break
            group.append(j)
            total += c
            j += 1
        if len(group) < 2:
            i += 1
            continue
        label = f"{names[seat]} draws {total} card{'' if total == 1 else 's'} from the deck"
        first = min(int(steps[x].get("move_from", steps[x]["move_id"])) for x in group)
        runs += 1
        for x in group:
            steps[x]["merge"] = {"seat": seat, "kind": "draw", "id": runs, "last": x == group[-1], "from": first}
        last = steps[group[-1]]
        last["merge"]["label"] = label
        pov = list(last.get("label_pov") or [None, None])
        pov[1 - seat] = label
        last["label_pov"] = pov
        i = group[-1] + 1
    return runs
