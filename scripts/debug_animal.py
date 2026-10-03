"""Why is a logged animal play not legal? python scripts/debug_animal.py GAME TURN
Prints the animal, the enclosure the log put it in and what the engine thinks of both."""
import collections
import sys

from ark_nova import data
from ark_nova.engine import animals_action as aa
from ark_nova.engine.board import board
from ark_nova.parser import parse_log
from ark_nova.replay import differential as d
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log


def main(game: str, turn: str) -> None:
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
            if f"turn {turn}:" in x and "play_animal" in x:
                print("ILLEGAL", x[:200])
                st, legal = ring[-1]
                args = eval(x[x.index("{"):x.index("}") + 1])
                p = st.players[st.prompt.player]
                k = args["card"]
                c = data.cards_by_key()[k]
                print(" animal", k, c["name"], "size", c.get("size"), "tags", c.get("tags"), "rock", c.get("rock"), "water", c.get("water"),
                      "special", c.get("specialEnclosures"), "abilities", aa.abilities(k))
                print(" cost", aa.cost(st, p.seat, k), "money", p.money, "failed conditions", aa.failed_conditions(st, p.seat, k, st.prompt.args.get("level", 1)),
                      "conditions_met", aa.conditions_met(st, p.seat, k, st.prompt.args.get("level", 1)))
                bd = board(p.map_id)
                for b in p.buildings:
                    if (b.x, b.y) == (args.get("x"), args.get("y")):
                        print(" log enclosure", b.type, (b.x, b.y), "rot", b.rotation, "animal", b.animal, "animals", b.animals, "eff size",
                              aa.effective_size(p, b, bd) if b.type.startswith("size-") else None)
                print(" engine hosts (empty)", [(b.type, b.x, b.y, ok) for b, ok in aa.hosts(st, p.seat, k)])
                print(" legal play options", [(a.args.get("x"), a.args.get("y")) for a in legal if a.kind == "play_animal" and a.args["card"] == k])
                print(" prompt", st.prompt.kind, {kk: v for kk, v in st.prompt.args.items() if kk != "resume"})
            super().append(x)

    orig_init = d.DiffReport.__init__

    def init(self, *a, **k):
        orig_init(self, *a, **k)
        self.illegal = Log()

    d.DiffReport.__init__ = init
    d.run_differential(parsed, rep, {pid: i for i, pid in enumerate(setup.seats)})


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
