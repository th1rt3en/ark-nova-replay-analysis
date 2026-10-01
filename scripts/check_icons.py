"""Compare `engine.icons.icon_counts` with BGA's `infos.icons` oracle (events carrying it) over all logs in log_examples/."""
import collections
import glob
import sys
from pathlib import Path

from ark_nova.engine.icons import icon_counts
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log

ROOT = Path(__file__).resolve().parents[1]


def main(limit=None):
    checked = bad = 0
    diffs = collections.Counter()
    examples = {}
    for path in sorted(glob.glob(str(ROOT / "log_examples" / "*.json")))[:limit]:
        parsed = parse_log(path)
        setup, cfg, seed = game_from_log(parsed)
        try:
            rep = build_replay(parsed, setup, cfg, seed)
        except ValueError:                      # not a 2 player game
            continue
        seat_of = {pid: i for i, pid in enumerate(setup.seats)}
        for m in parsed.moves:
            for e in m.events:
                ic = (e.args.get("infos") or {}).get("icons") if isinstance(e.args, dict) and e.type in ("playSponsor", "buyAnimal") else None
                for pid, want in (ic or {}).items():
                    got = icon_counts(rep.states[m.index], seat_of[str(pid)])
                    d = {k: (got.get(k, 0), v) for k, v in want.items() if k in got or v} if False else {
                        k: (got.get(k, 0), v) for k, v in want.items() if got.get(k, 0) != v and k not in ("Fac", "Partner-Zoo", "AnimalsII", "CardsII")}      # BGA never fills these four
                    checked += 1
                    if d:
                        bad += 1
                        for k in d:
                            diffs[k] += 1
                            examples.setdefault(k, (Path(path).name, m.index, e.type, d[k]))
    print(f"checked {checked}, differing {bad}", dict(diffs))
    for k, v in examples.items():
        print(" ", k, v)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
