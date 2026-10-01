"""Compare the engine's final scoring (`engine/endgame.py`) with the endgame bonuses in every log (card getBonuses after the last action)."""
import collections
import copy
import glob
import sys
from pathlib import Path

from ark_nova.engine import endgame
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log

ROOT = Path(__file__).resolve().parents[1]


def main(limit=None, verbose=False):
    from ark_nova import data
    byname = {c['name'].lower(): k for k, c in data.cards_by_key().items() if k.startswith('S')}
    bad = collections.Counter()
    ok = collections.Counter()
    examples = {}
    for path in sorted(glob.glob(str(ROOT / "log_examples" / "*.json")))[:limit]:
        parsed = parse_log(path)
        if not parsed.final_scores:
            continue
        setup, cfg, seed = game_from_log(parsed)
        try:
            rep = build_replay(parsed, setup, cfg, seed)
        except ValueError:
            continue
        seat_of = {pid: i for i, pid in enumerate(setup.seats)}
        fm = next(m for m in parsed.moves if any(e.type == "finalScoring" for e in m.events))
        pre = copy.deepcopy(rep.states[fm.index - 1])
        want = collections.Counter()
        for e in fm.events:
            if e.type == "getBonuses":
                key = (e.args.get("card_id") or "")[:4] or byname.get((e.args.get("source") or "").lower())
                if key and key[0] in "SF":
                    for res, n in e.args["bonuses"].items():
                        want[(seat_of[str(e.args["player_id"])], key, res)] += n
        got = collections.Counter()
        for seat, src, res, n in endgame.final_scoring(pre):
            got[(seat, src, res)] += n
        for k in set(want) | set(got):
            if want[k] == got[k]:
                ok[k[1]] += 1
            else:
                bad[k[1]] += 1
                examples.setdefault(k[1], []).append((Path(path).name, k[0], k[2], "log", want[k], "engine", got[k]))
    print("ok", dict(sorted(ok.items())))
    print("bad", dict(sorted(bad.items())))
    for k, v in sorted(examples.items()):
        print(k, v[:4])


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
