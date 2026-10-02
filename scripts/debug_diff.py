"""Run the differential test on one game and show, for every illegal action, the prompt and the legal actions at that moment:
python scripts/debug_diff.py GAME [TURN]"""
import collections
import sys

from ark_nova.parser import parse_log
from ark_nova.replay import differential as d
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log


def main(game: str, turn: str = None) -> None:
    parsed = parse_log(f"log_examples/{game}.json")
    setup, cfg, seed = game_from_log(parsed)
    rep = build_replay(parsed, setup, cfg, seed)
    orig = d.legal_actions
    ring = collections.deque(maxlen=1)

    def la(state):
        r = orig(state)
        ring.append((state, r))
        return r

    d.legal_actions = la

    class Log(list):
        def append(self, x):
            if turn is None or f"turn {turn}:" in x:
                print("ILLEGAL", x[:300])
                st, r = ring[-1]
                pr = st.prompt
                print("  prompt", pr.kind if pr else None, {k: v for k, v in (pr.args.items() if pr else []) if k != "resume"})
                print("  legal", [(a.kind, a.args) for a in r][:10])
            super().append(x)

    orig_init = d.DiffReport.__init__

    def init(self, *a, **k):
        orig_init(self, *a, **k)
        self.illegal = Log()

    d.DiffReport.__init__ = init
    if turn is not None:                                        # trace every action applied in that turn
        from ark_nova.replay.actions import turn_events
        want_order = turn_events(parsed)[int(turn)][0].order
        cur = {"k": False}
        orig_ta = d.turn_actions
        orig_apply = d.apply

        def ta(events, *a, **k):
            cur["k"] = bool(events) and events[0].order == want_order
            return orig_ta(events, *a, **k)

        def ap(state, act):
            out = orig_apply(state, act)
            if cur["k"]:
                pl = out.players[act.player]
                print("  apply", act.kind, act.args, "->", out.prompt.kind if out.prompt else None, (pl.money, pl.appeal, pl.reputation, pl.conservation, pl.x_tokens))
            return out

        d.turn_actions, d.apply = ta, ap
        from ark_nova.engine import game as _game
        orig_gain = _game._gain
        import traceback

        def gain(state, seat, *a, **k):
            if cur["k"] and (k.get("conservation") or k.get("reputation")):
                print("    _gain", seat, {x: y for x, y in k.items() if y}, "from", [f.name for f in traceback.extract_stack()[-4:-1]])
            return orig_gain(state, seat, *a, **k)

        _game._gain = gain
    r = d.run_differential(parsed, rep, {pid: i for i, pid in enumerate(setup.seats)})
    for m in r.mismatches:
        if turn is None or f"turn {turn}:" in m:
            print("MISMATCH", m[:1500])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
