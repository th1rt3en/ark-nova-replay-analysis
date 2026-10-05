"""Conservation-threshold bonuses of a game (the random draws made at setup).

`takeBonus` events carry `args.conservationBonuses`: for each threshold ('2', '5', '8', '10', '99') the bonuses still on offer,
each flagged `permanent` (always available, e.g. 5 money) or not (taken away once a player chose it). Options only ever
disappear, so the union over the whole log is the initial set. The first event appears when a player first reaches 2
conservation, so it normally still shows both random bonuses of the 5 and 8 thresholds; if a player jumped past a
threshold before the first table was logged, that option is missing (see `missing_options`) and must be added by the user.
"""
import json
from dataclasses import dataclass, field

from ark_nova.parser.model import ParsedLog


@dataclass
class ConservationBonuses:
    random: dict[str, list[dict]] = field(default_factory=dict)      # threshold -> removable bonuses seen (2 expected for 5 and 8)
    always: dict[str, list[dict]] = field(default_factory=dict)      # threshold -> permanent bonuses (money 5, worker/upgrade at 2, ...)

    def missing_options(self) -> dict[str, int]:
        """Thresholds 5 and 8 with fewer than the 2 random options (how many are missing)."""
        return {th: 2 - len(self.random.get(th, [])) for th in ("5", "8") if len(self.random.get(th, [])) < 2}


def extract_conservation_bonuses(parsed: ParsedLog) -> ConservationBonuses:
    out = ConservationBonuses()
    seen: set[tuple[str, str, bool]] = set()
    for mv in parsed.moves:
        for e in mv.events:
            if e.type == "takeBonus" and isinstance(e.args, dict) and e.args.get("remove") and "-" in str(e.args["remove"]):
                bd = ((e.args.get("bonus_desc") or {}).get("args") or {})                  # the option that was just taken ("5-1": threshold 5, option 1) is no longer in the table
                th = str(e.args["remove"]).split("-")[0]
                if bd.get("bonus_type") and bd["bonus_type"] != "DISCARD_SCORING" and th != "10":
                    bonus = {bd["bonus_type"]: bd.get("bonus_n")}
                    if bonus not in out.random.get(th, []) and bonus not in out.always.get(th, []):
                        out.random.setdefault(th, []).append(bonus)
            table = e.args.get("conservationBonuses") if e.type == "takeBonus" and isinstance(e.args, dict) else None
            if not isinstance(table, dict):
                continue
            for th, options in table.items():
                if isinstance(options, dict):
                    options = list(options.values())
                for o in options:
                    if not (isinstance(o, dict) and "bonus" in o):
                        continue
                    permanent = bool(o.get("permanent"))
                    key = (th, json.dumps(o["bonus"], sort_keys=True), permanent)
                    if key in seen:
                        continue
                    seen.add(key)
                    (out.always if permanent else out.random).setdefault(th, []).append(o["bonus"])
    return out
