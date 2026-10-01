"""Debug one turn of the differential test: python scripts/debug_turn.py GAME TURN [events]

Prints the log events of the turn (with `events`), the engine actions derived from them and the engine's resources after every action
next to the replay state at the end of the turn."""
import copy
import sys

from ark_nova.engine.game import IllegalAction, apply, legal_actions
from ark_nova.engine.state import Phase, Prompt
from ark_nova.parser import parse_log
from ark_nova.replay import differential as d
from ark_nova.replay.actions import turn_actions, turn_events
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log


def main(game: str, k: int, show_events: bool) -> None:
    parsed = parse_log(f"log_examples/{game}.json")
    setup, cfg, seed = game_from_log(parsed)
    rep = build_replay(parsed, setup, cfg, seed)
    seat_of = {pid: i for i, pid in enumerate(setup.seats)}
    move_of = {e.order: m.index for m in parsed.moves for e in m.events}
    ev = turn_events(parsed)[k]
    if show_events:
        for e in ev:
            a = e.args if isinstance(e.args, dict) else {}
            if e.type != "fillPool":
                print("  ", e.type, "|", e.log[:55], "|", str({x: y for x, y in a.items() if x in ("bonuses", "card_id", "source", "actionCard", "strength", "cards", "card", "meeples")})[:200])
    seat = seat_of[str(next(e.args["player_id"] for e in ev if e.type in ("chooseActionCard", "actionCardCleanup")))]
    plan = turn_actions(ev, seat, seat_of, move_of, rep.turn_snapshots[k].config.peaceful)
    if isinstance(plan, str):
        print("skipped:", plan)
        return
    st = copy.deepcopy(rep.turn_snapshots[k])
    st.phase, st.current_action, st.active_player = Phase.TURN, None, seat
    st.prompt = Prompt(kind="choose_action_card", player=seat)
    end = rep.turn_snapshots[k + 1] if k + 1 < len(rep.turn_snapshots) else rep.states[-1]

    def res(s):
        p = s.players[seat]
        return (p.money, p.appeal, p.reputation, p.conservation, p.x_tokens, len(p.hand))

    print("start", res(st), "cards", [(c.type, c.tokens) for c in st.players[seat].action_cards], "opp", [(c.type, c.tokens) for c in st.players[1 - seat].action_cards])
    try:
        for act in plan.actions:
            act = d._normalise(st, act, end)
            while st.prompt and st.prompt.kind == "effects" and d._plain(act) not in legal_actions(st):
                sym = d._symbiosis_for(st, act)
                if sym is not None:
                    st = apply(st, sym)
                    act = d._normalise(st, act, end)
                    continue
                sk = d._skip_unneeded(st, act)
                if sk is None:
                    break
                e = st.prompt.args["pending"][sk.args["index"]]
                print("   skip", e["kind"], e.get("source"))
                st = apply(st, sk)
            st = apply(st, act)
            print(act.kind, act.args, "->", res(st), st.prompt.kind if st.prompt else None)
        while st.prompt and st.prompt.kind == "effects":
            sk = d._skip_unneeded(st, None)
            if sk is None:
                print("pending:", st.prompt.args["pending"])
                break
            e = st.prompt.args["pending"][sk.args["index"]]
            print("   skip", e["kind"], e.get("source"))
            st = apply(st, sk)
    except IllegalAction as ex:
        print("ILLEGAL:", ex, "| legal:", [(a.kind, a.args) for a in legal_actions(st)][:8])
    print("engine", res(st), [(c.type, c.tokens) for c in st.players[seat].action_cards], [(c.type, c.tokens) for c in st.players[1 - seat].action_cards])
    pe = end.players[seat]
    print("replay", (pe.money, pe.appeal, pe.reputation, pe.conservation, pe.x_tokens, len(pe.hand)), [(c.type, c.tokens) for c in pe.action_cards], [(c.type, c.tokens) for c in end.players[1 - seat].action_cards])


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), "events" in sys.argv[3:])
