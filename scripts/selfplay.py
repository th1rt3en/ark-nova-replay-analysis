"""Self-play: random legal moves through the engine, to find where a live game could stop (docs/live_game_plan.md 5.5 and section 10, "fuzz").

    python scripts/selfplay.py [--games 30] [--budget 2500] [--seed 1] [--mw] [--mode random-mirrored] [--workers 4]

Each game is played as a live game is (`confirm_turns`: a turn waits for its confirm; undo and restart are taken now and then). It stops when the game is over, when the
move budget is used, or when the engine fails. Reported: how far the games got, the failures grouped by what failed (an unwritten rule = `NotImplementedError`, anything else =
a bug), and the broken invariants: a card in two places at once, a track out of range, a position in which nobody can move.
"""
import argparse
import collections
import random
import sys
import time
import traceback
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ark_nova.engine.actions import Action  # noqa: E402
from ark_nova.engine.game import IllegalAction, apply, legal_actions, new_game  # noqa: E402
from ark_nova.engine.state import Phase  # noqa: E402

ZONES = ("main_deck", "main_discard", "endgame_deck", "endgame_discard", "display", "projects_in_play")
PLAYER_ZONES = ("hand", "endgame_hand", "animals", "sponsors", "stored", "pouched", "rescued")      # (not `released`: a released animal is also in the discard pile)
REWIND = ("undo_last", "restart_turn")


def invariants(state) -> list[str]:
    """What must hold in every position (cheap checks)."""
    bad = []
    seen: collections.Counter = collections.Counter()
    for z in ZONES:
        seen.update(c for c in getattr(state, z) if c)
    for p in state.players:
        for z in PLAYER_ZONES:
            seen.update(getattr(p, z))
        for cards in p.under.values():
            seen.update(cards)
    dup = [c for c, n in seen.items() if n > 1]
    if dup:
        bad.append(f"a card in two places: {dup[:3]}")
    for p in state.players:
        if not 0 <= p.reputation <= 15:
            bad.append(f"reputation {p.reputation}")
        if not 0 <= p.x_tokens <= 5:
            bad.append(f"x tokens {p.x_tokens}")
        if p.money < 0:
            bad.append(f"money {p.money}")
        if p.conservation < 0:
            bad.append(f"conservation {p.conservation}")
    return bad


def play(seed: int, budget: int, mw: bool, mode: str) -> dict:
    rng = random.Random(seed)
    out = {"seed": seed, "moves": 0, "phase": None, "round": None, "turn": None, "end": None, "failure": None}
    t0 = time.time()
    try:
        st = new_game({"game_mode": mode, "marine_worlds_flag": mw, "confirm_turns": True}, ["1", "2"], seed)
        for _ in range(budget):
            if st.phase is Phase.OVER:
                out["end"] = "over"
                break
            acts = legal_actions(st)
            if not acts:
                out["end"] = "no_moves"
                out["failure"] = ("no legal move", f"phase {st.phase.value}, prompt {st.prompt.kind if st.prompt else None}")
                break
            plain = [a for a in acts if a.kind not in REWIND]
            rewind = [a for a in acts if a.kind in REWIND]
            pool = rewind if rewind and (rng.random() < 0.04 or not plain) else plain
            act = rng.choice(pool)
            try:
                st = apply(st, act)
            except IllegalAction as e:
                out["failure"] = ("legal action refused", f"{act.kind}: {e}")
                break
            out["moves"] += 1
            if out["moves"] % 25 == 0:
                bad = invariants(st)
                if bad:
                    out["failure"] = ("invariant", "; ".join(bad))
                    break
        else:
            out["end"] = "budget"
        out["phase"], out["round"], out["turn"] = st.phase.value, st.round, st.turn
    except NotImplementedError as e:
        tb = traceback.extract_tb(sys.exc_info()[2])[-1]
        out["failure"] = ("not implemented", f"{e} ({Path(tb.filename).name}:{tb.lineno})")
    except Exception as e:                                   # noqa: BLE001 (any other failure is a bug to look at)
        tb = traceback.extract_tb(sys.exc_info()[2])[-1]
        out["failure"] = ("exception", f"{type(e).__name__}: {e} ({Path(tb.filename).name}:{tb.lineno})")
    out["seconds"] = round(time.time() - t0, 1)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=30)
    ap.add_argument("--budget", type=int, default=2500)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mw", action="store_true")
    ap.add_argument("--mode", default="random-mirrored")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    seeds = [a.seed + i for i in range(a.games)]
    with ProcessPoolExecutor(a.workers) as pool:
        results = list(pool.map(play, seeds, [a.budget] * len(seeds), [a.mw] * len(seeds), [a.mode] * len(seeds)))
    ended = collections.Counter(r["end"] or "failed" for r in results)
    print(f"{len(results)} games, budget {a.budget} moves: {dict(ended)}; moves played {sum(r['moves'] for r in results)}; "
          f"the furthest game reached round {max((r['round'] or 0) for r in results)}, turn {max((r['turn'] or 0) for r in results)}")
    groups: dict = collections.defaultdict(list)
    for r in results:
        if r["failure"]:
            groups[r["failure"]].append(r["seed"])
    for (kind, text), seeds_ in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        print(f"  [{kind}] x{len(seeds_)}: {text}   seeds {seeds_[:6]}")
    if not groups:
        print("  no failure")


if __name__ == "__main__":
    main()
