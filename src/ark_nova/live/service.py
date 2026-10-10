"""The live game service: creates tables, seats players, validates and applies moves with the engine and hands the results to the table keeper.

Cloud Run is the only place that knows the rules: a move is accepted when it is among `legal_actions(state)` for the seat that holds the token. The accepted move, the
views of both seats and of the spectators and the next decision are appended to the table's Durable Object with the version the move was made on (docs/live_game_plan.md
3.5); the keeper refuses a stale version, so two moves on the same state can never both get in. The state itself is a fold of the stored snapshot and actions, kept in a
small cache; a cache that is behind is rebuilt from the keeper.
"""
import dataclasses
import hashlib
import json
import logging
import os
import secrets
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

from ark_nova import data as card_data
from ark_nova.accounts import rating as elo
from ark_nova.engine import endgame, gamestats, map_select, turns
from ark_nova.engine.actions import Action
from ark_nova.engine.game import IllegalAction, apply, legal_actions, new_game
from ark_nova.engine.state import GameState, Phase
from ark_nova.engine.version import ENGINE_VERSION, fingerprint
from ark_nova.live import archive as arch
from ark_nova.live import bgalog
from ark_nova.live import clock as tc
from ark_nova.live import projection, stepdata
from ark_nova.live import registry as reg
from ark_nova.live.keeper import Forbidden, Keeper, LiveError, NoSuchTable, StaleVersion
from ark_nova.replay import fork
from ark_nova.replay.view import PICTURE_OF, map_view

SNAPSHOT_EVERY = 25
ABANDON_COOLDOWN = int(os.environ.get("ABANDON_COOLDOWN_SECONDS", "600"))      # after a rejected proposal to abandon the proposer waits this long (10 minutes)
log = logging.getLogger(__name__)
CACHE_GAMES = 64


class NotStarted(LiveError):
    pass


class IllegalMove(LiveError):
    pass


class RatedRefused(IllegalMove):
    """A rated game that cannot be created or joined (log in first, not against yourself, the seat is another player's, no ratings here): answered with its own status."""


class NotYourSeat(Forbidden):
    pass


class AbandonRefused(LiveError):
    """A proposal to abandon that cannot be made or answered now (the cooldown after a rejection, nothing to answer, a game that is not running)."""


class EngineStopped(LiveError):
    pass


def stats_of(record: dict) -> dict:
    """The statistics of a stored game: the engine keeps them in the state, so playing the record again gives them (`GameState.stats`)."""
    return {"schema": 1, "players": gamestats.final(arch.refold(record))}


def simultaneous(state: GameState) -> bool:
    """A position in which both players decide at the same time (the choices of the setup, the discards of a break or of the endgame): a move made on the position
    just before the other player's move is still good."""
    pr = state.prompt
    if state.phase is Phase.SETUP:
        return True
    return pr is not None and pr.kind == "effects" and any(e.get("kind") in ("break_discard", "endgame_discard") for e in pr.args.get("pending", []))


def simultaneous_match(state: GameState, act: Action) -> Action | None:
    """The legal action of the position now that is the one the player meant on the older position (the same move; the index of an effect moves up when another one
    is done), None when there is none or the position is not a simultaneous one."""
    if not simultaneous(state):
        return None
    mine = [a for a in legal_actions(state) if a.player == act.player and a.kind == act.kind]
    wanted = {k: v for k, v in act.args.items() if k != "index"}
    hits = [a for a in mine if {k: v for k, v in a.args.items() if k != "index"} == wanted]
    exact = [a for a in hits if fork._canon(a) == fork._canon(act)]
    if exact:
        return exact[0]
    return hits[0] if len(hits) == 1 else None


class NotReplayable(LiveError):
    """The table has no record to show: it is not over yet, or it ended without one (abandoned, error)."""
    def __init__(self, game_status: str):
        super().__init__(f"no replay for a game that is {game_status}", 409)
        self.game_status = game_status


@dataclass
class Cached:
    version: int
    state: GameState
    hashes: list
    status: str
    names: list
    eff: list = dataclasses.field(default_factory=list)      # the numbers of the effective steps (what an undo or a restart has not taken back)
    clock: dict | None = None                                # the time control's clocks (live/clock.py; None = a table without one)


GAME_MODES = {
    "random-mirrored": ("Same random map", "Both players play on the same map, drawn at random: nothing to choose."),
    "original": ("Original: pick one of two", "Each player is dealt two maps and keeps the one they like better."),
    "free-select": ("Free choice", "Each player picks any map (the same one is allowed)."),
}


def options() -> dict:
    """The game modes of the engine (`engine/map_select.py` is the list), with a name and a line of text each."""
    return {"default": map_select.DEFAULT_MODE, "time_control": tc.options(), "game_modes": [{"id": m, "label": GAME_MODES.get(m, (m, ""))[0], "description": GAME_MODES.get(m, (m, ""))[1]} for m in map_select.MODES]}


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class LiveService:
    def __init__(self, keeper: Keeper, engine_version: str = ENGINE_VERSION, registry=None, archive=None, ratings=None):
        self.keeper, self.engine_version = keeper, engine_version
        self.ratings = ratings                                      # the account store (accounts/store.py): the ratings of rated games; None = no rated games
        self.registry, self.archive = registry, archive            # (None: the registry rows stay in the table's keeper; nothing is exported or deleted)
        self._cache: OrderedDict[str, Cached] = OrderedDict()
        self._lock = threading.Lock()
        self._replays: dict = {}                                    # gcs path -> the replay built from that record (a record never changes)
        self._stat_cache: dict = {}                                 # gcs path -> the statistics of that record
        self._wrap_tried: dict = {}                                 # game id -> when a failed wrap-up was last tried again (see `_retry_wrap_up`)
        self._wrapping: set = set()                                 # the games whose wrap-up is running

    # ---- creating and joining -----------------------------------------------------------------------------------------------------------
    def create(self, marine_worlds: bool = False, tail_seed: int | None = None, game_mode: str | None = None, time_control: dict | None = None, rated: bool = False, account=None) -> dict:
        """A new table: returns its id and the secret token of each seat (the tokens are never stored, only their hashes). Seat 0 plays first; the creator gets seat 0 or 1 by chance (`creator_seat`)."""
        if rated and self.ratings is None:
            raise RatedRefused("rated games are not available here", 503)
        if rated and account is None:
            raise RatedRefused("log in to create a rated game; a friendly game needs no account", 401)
        seed = secrets.randbits(52) if tail_seed is None else tail_seed         # (52 bits: the largest whole number a browser reads exactly; 31 bits could be tried out one by one to learn the deck order)
        mode = game_mode or map_select.DEFAULT_MODE
        if mode not in map_select.MODES:
            raise IllegalMove(f"the game mode must be one of {list(map_select.MODES)}", 422)
        options = {"game_mode": mode, "marine_worlds_flag": bool(marine_worlds), "confirm_turns": True}
        try:
            clock0 = tc.create(time_control)
        except tc.ClockError as e:
            raise IllegalMove(str(e), 422)
        state = new_game(options, ["1", "2"], seed)
        table_id = f"E{self.keeper.next_number()}"
        tokens = [secrets.token_urlsafe(24), secrets.token_urlsafe(24)]
        config = {"game_id": table_id, "options": options, "tail_seed": seed, "player_ids": ["1", "2"], "maps": list(state.config.maps), **fingerprint(), "engine_version": self.engine_version,
                  "viewer": stepdata.viewer_header(state), "clock": clock0, "rated": bool(rated)}
        self.keeper.init(table_id, config, self.engine_version, [token_hash(t) for t in tokens], views=projection.views(state, {r: "The game starts" for r in projection.ROLES}), snapshot={"engine": state.to_dict(), "eff": []},
                         registry_event={"status": "waiting", "n_actions": 0})
        self._remember(table_id, Cached(0, state, [token_hash(t) for t in tokens], "waiting", [None, None], clock=clock0))
        self.sync_registry(table_id)
        return {"game_id": table_id, "tokens": tokens, "creator_seat": secrets.randbelow(2)}

    def join(self, game_id: str, token: str, name: str, account=None) -> dict:
        """The holder of a seat link gives their name; the game starts when both seats have one. A rated game needs a logged-in account on each seat (two different ones): its name is the account's."""
        c = self._load(game_id)
        seat = self._seat_of(c, token)
        cfg = self.keeper.state(game_id)["config"]
        if cfg.get("rated"):
            if account is None:
                raise RatedRefused("log in to play this rated game", 401)
            if cfg.get(f"account_{1 - seat}") == account.id:
                raise RatedRefused("you cannot play a rated game against yourself", 409)
            if cfg.get(f"account_{seat}") not in (None, account.id):
                raise RatedRefused("this seat already belongs to another player", 409)
            self.keeper.update_config(game_id, {f"account_{seat}": account.id})
            name = account.username
        if not name or not name.strip():
            raise IllegalMove("type a name", 422)
        names = self.keeper.seat(game_id, seat, name)
        c.names = list(names)
        if all(names) and c.status == "waiting":
            if c.clock is not None:                                      # the clocks start when both players are in and the first choices (the maps) are open; stored before the status push
                c.clock = tc.advance(c.clock, int(time.time() * 1000), self._to_act(c.state), self._turn_key(c.state), False)
                self.keeper.update_config(game_id, {"clock": c.clock})
            self.keeper.set_status(game_id, "playing", registry_event={"status": "playing", "started_at": int(time.time() * 1000), "n_actions": c.version})
            c.status = "playing"
            self.sync_registry(game_id)
        return {"seat": seat, "names": names, "status": c.status}

    def lobby(self, game_id: str) -> dict:
        s = self.keeper.state(game_id)
        return {"game_id": game_id, "status": s["status"], "version": s["version"], "names": [x["name"] for x in s["seats"]], "rated": bool(s["config"].get("rated"))}

    def _complete_header(self, game_id: str, state: GameState) -> bool:
        try:
            s = self.keeper.state(game_id)
            viewer = dict(s["config"].get("viewer") or {})
            viewer["maps"] = stepdata.viewer_header(state)["maps"]
            self.keeper.update_config(game_id, {"maps": list(state.config.maps), "viewer": viewer})
            return True
        except Exception:                                    # noqa: BLE001
            log.exception("the header of %s could not get its maps (skeleton() tries again)", game_id)
            return False

    def skeleton(self, game_id: str, token: str | None = None) -> dict:
        """What the play page needs besides the views: the maps, the card catalog, the colours, the names and the seat of the token."""
        s = self.keeper.state(game_id)
        v = s["config"].get("viewer") or {}
        cached = self._cache.get(game_id)
        if not v.get("maps") and cached is not None and cached.state.config.maps and self._complete_header(game_id, cached.state):
            s = self.keeper.state(game_id)
            v = s["config"].get("viewer") or {}
        seat = None
        if token:
            seat = self._seat_of(Cached(s["version"], None, [x["token_hash"] for x in s["seats"]], s["status"], []), token)
        return {"game_id": game_id, "clock": tc.view(s["config"]["clock"], int(time.time() * 1000)) if s["config"].get("clock") else None, "status": s["status"], "version": s["version"], "seat": seat, "rated": bool(s["config"].get("rated")), "named": [bool(x["name"]) for x in s["seats"]], "marine_worlds": bool(v.get("marine_worlds")),
                "first_player": 0, "players": [{"seat": i, "id": str(i + 1), "name": x["name"] or f"Seat {i + 1}", "color": (v.get("colors") or [None, None])[i]} for i, x in enumerate(s["seats"])],
                "maps": v.get("maps") or [], "map_names": {m["id"]: m["name"] for m in card_data.maps() if m.get("geometry")}, "map_images": {m["id"]: f"/maps/map-{PICTURE_OF.get(m['id'], m['id'])}.jpg" for m in card_data.maps() if m.get("geometry")}, "map_views": self._map_views() if not v.get("maps") else {}, "cards": v.get("cards"), "base_projects": v.get("base_projects") or [], "shapes": fork.shapes(), "engine_version": s["engine_version"],
                "abandon": self.abandon_view(s["config"])}

    def _map_views(self) -> dict:
        """The boards of the maps (picture, placement bonuses, bonus slots) for the map pick, which shows each map as it looks in play."""
        if not hasattr(self, "_map_view_cache"):
            self._map_view_cache = {m["id"]: map_view(m["id"]) for m in card_data.maps() if m.get("geometry")}
        return self._map_view_cache

    def preview(self, game_id: str, token: str, version: int, action: dict) -> dict:
        """Check a move without playing it: is it legal now, and does it make the turn impossible to take back (the page asks the player before sending it)."""
        c = self._load(game_id)
        seat = self._seat_of(c, token)
        if c.version != version:
            c = self._load(game_id, fresh=True)
        if c.version != version:
            raise StaleVersion("stale version", c.version)
        act = Action(int(action.get("player", -1)), str(action.get("kind", "")), dict(action.get("args") or {}))
        if act.player != seat:
            raise NotYourSeat("that move is not yours", 403)
        if fork._canon(act) not in {fork._canon(a) for a in legal_actions(c.state)}:
            raise IllegalMove("that move is not legal now", 422)
        try:
            new = apply(c.state, act)
        except IllegalAction as e:
            raise IllegalMove(str(e), 422)
        except NotImplementedError:
            raise EngineStopped("game stopped, please report", 503)
        reason = turns.irreversible(c.state, act, new) if c.state.phase in turns.PLAYING and act.kind not in ("confirm_turn", "undo_last", "restart_turn") else ""
        return {"irreversible": bool(reason), "reason": reason}

    # ---- reading --------------------------------------------------------------------------------------------------------------------------
    def view(self, game_id: str, token: str | None) -> dict:
        """The stored view of the token's seat (a spectator without a token) with its decision."""
        role = "spectator"
        if token:
            role = str(self._seat_of(self._load(game_id), token))
        out = self.keeper.view(game_id, role)
        self._retry_wrap_up(game_id)
        return out

    def _retry_wrap_up(self, game_id: str) -> None:
        """A finished table whose export or registry row failed (storage or BigQuery was down) is still in the keeper: the players' next requests try it again, at most once a
        minute and out of the request. A table whose wrap-up worked is gone from the cache."""
        c = self._cache.get(game_id)
        if c is None or c.status not in ("finished", "conceded", "abandoned") or (self.archive is None and self.registry is None):
            return
        now = time.monotonic()
        with self._lock:
            if game_id in self._wrapping or now - self._wrap_tried.get(game_id, -1e9) < 60:
                return
            self._wrapping.add(game_id)
            self._wrap_tried[game_id] = now

        def run() -> None:
            try:
                self.wrap_up(game_id)
            finally:
                with self._lock:
                    self._wrapping.discard(game_id)
        threading.Thread(target=run, daemon=True).start()

    # ---- moves ----------------------------------------------------------------------------------------------------------------------------
    def move(self, game_id: str, token: str, version: int, action: dict, request_id: str | None = None) -> dict:
        c = self._load(game_id)
        seat = self._seat_of(c, token)
        if c.version != version:                                             # the cache may be behind: ask the keeper before refusing
            c = self._load(game_id, fresh=True)
        if c.status == "waiting":
            c = self._load(game_id, fresh=True)                              # (the second player may have joined through another instance: the cache is behind)
            if c.status == "waiting":
                raise NotStarted("the game starts when both players have joined", 409)
        act = Action(int(action.get("player", -1)), str(action.get("kind", "")), dict(action.get("args") or {}))
        if c.version != version:
            if request_id and (done := self.keeper.request_result(game_id, request_id)) is not None:        # a retry after a lost answer: the move is in already
                return {"version": done, "duplicate": True, "status": c.status, **self.keeper.view(game_id, str(seat))}
            same = simultaneous_match(c.state, act) if act.player == seat else None
            if same is None:
                raise StaleVersion("stale version", c.version)
            act = same                                                      # the other player's move came first, this one is still what the player chose
        if act.player != seat:
            raise NotYourSeat("that move is not yours", 403)
        if fork._canon(act) not in {fork._canon(a) for a in legal_actions(c.state)}:
            raise IllegalMove("that move is not legal now", 422)
        try:
            new = apply(c.state, act)
        except IllegalAction as e:
            raise IllegalMove(str(e), 422)
        except NotImplementedError as e:
            self.keeper.set_status(game_id, "error", end_reason=f"rule not implemented: {e}", registry_event={"status": "error", "n_actions": c.version})
            self.wrap_up(game_id)
            raise EngineStopped("game stopped, please report", 503)
        return self._commit(game_id, c, seat, act, new, request_id)

    def _commit(self, game_id: str, c: "Cached", seat: int, act: Action, new: GameState, request_id: str | None, timeout: bool = False) -> dict:
        """Store the move that took the state `c.state` to `new`: the step with the views of both players and, when the game is over, its end (played out or conceded)."""
        n = c.version + 1
        names = [nm or f"Player {i + 1}" for i, nm in enumerate(c.names)]
        over = new.phase is Phase.OVER
        conceded = over and act.kind == "concede"
        eff = list(c.eff)
        step = stepdata.step_for(c.state, act, new, n, eff, names[seat])
        written = bgalog.texts(c.state, act, new, names)                     # (the log of the step in BGA's words, one text per viewer)
        labels = {role: written[role] for role in bgalog.ROLES}
        step["label"] = written["full"]
        if timeout:                                                        # (`seat` is the player who ran out of time)
            labels = {role: f"{names[seat]} ran out of time" for role in labels}
            step["label"] = f"{names[seat]} ran out of time"
        if over:                                                           # the end is announced in the game log of both players
            end = stepdata.announcement(new, names)
            labels = {role: f"{text}" + chr(10) + end for role, text in labels.items()}
            step["label"] = step["label"] + chr(10) + end
        end_status = "conceded" if conceded else "finished"
        all_views = projection.views(new, labels)
        clock_now = None
        if c.clock is not None:                                            # the time used by this move comes off the clocks that ran; a new turn brings the increment
            now = int(time.time() * 1000)
            clock_now = tc.advance(c.clock, now, all_views["spectator"]["view"].get("to_act") or [], self._turn_key(new), over)
            for item in all_views.values():
                item["view"]["clock"] = tc.view(clock_now, now)
        if timeout and over:
            for item in all_views.values():
                item["view"]["end"]["reason"] = "overtime"                 # (the end screen says why the other player won)
        result = self.keeper.append(
            game_id, c.version, request_id or uuid.uuid4().hex, {"player": act.player, "kind": act.kind, "args": act.args}, step, all_views,
            snapshot={"engine": new.to_dict(), "eff": eff} if n % SNAPSHOT_EVERY == 0 or over else None, status=end_status if over else None,
            end_reason=((f"seat {seat + 1} ran out of time (overtime)" if timeout else f"seat {seat + 1} conceded") if conceded else "the game was played to the end") if over else None,
            registry_event={"status": end_status, "n_actions": n, "result": ({**dataclasses.asdict(new.result), **({"reason": "overtime"} if timeout else {})}) if new.result is not None else None} if over else None)
        if not result.get("duplicate"):
            had_maps = bool(c.state.config.maps)
            c.version, c.state, c.eff = result["version"], new, eff
            if clock_now is not None:
                c.clock = clock_now
                self.keeper.update_config(game_id, {"clock": clock_now})
            if not had_maps and new.config.maps:
                self._complete_header(game_id, new)                # (the players have chosen their maps: the viewer header gets them)
            if over:
                c.status = end_status
        out = {"version": result["version"], "duplicate": bool(result.get("duplicate")), "status": c.status, **self.keeper.view(game_id, str(seat))}
        if over and not result.get("duplicate"):
            self.wrap_up(game_id)                              # (after the answer is read: the keeper deletes the table once the record is exported)
        return out

    # ---- the time control -------------------------------------------------------------------------------------------------------------
    @staticmethod
    def _to_act(state: GameState) -> list:
        return [s for s in (0, 1) if projection.decision(state, s) is not None]

    @staticmethod
    def _turn_key(state: GameState) -> list | None:
        """[turns completed, the player to move] while a turn is on (the clock's increment is given when it changes), None otherwise."""
        return [state.turn, state.active_player] if state.phase in turns.PLAYING else None

    def _flag(self, game_id: str, c: "Cached", seat: int) -> dict:
        """The player's clock is at zero or below and the opponent claims the win: a concession of the player (the other wins with the scores of the position), announced as overtime."""
        act = Action(seat, "concede", {})
        try:
            new = apply(c.state, act)
        except IllegalAction as e:
            raise IllegalMove(str(e), 422)
        out = self._commit(game_id, c, seat, act, new, None, timeout=True)
        return {**out, "status": "conceded", "seat": seat, "timeout": True}

    def timeout(self, game_id: str, token: str) -> dict:
        """The player ends the game and wins on overtime; allowed while the opponent's clock is at zero or below, whether it runs or not."""
        c = self._load(game_id, fresh=True)
        seat = self._seat_of(c, token)
        if c.status != "playing" or c.clock is None:
            raise IllegalMove("this game has no clock running", 409)
        if not tc.overtime(c.clock, int(time.time() * 1000), 1 - seat):
            raise IllegalMove("your opponent still has time on their clock", 409)
        return self._flag(game_id, c, 1 - seat)

    # ---- abandoning by agreement ---------------------------------------------------------------------------------------------------------
    # One player proposes, the other agrees (the game ends as `abandoned`: no winner, no record) or rejects (the proposer may not propose again for ABANDON_COOLDOWN seconds).
    # The proposal and the cooldowns live in the keeper's config (`abandon`), so every server instance sees them; the Table DO tells the sockets when it changes.
    def _abandon_state(self, game_id: str) -> tuple[dict, dict]:
        s = self.keeper.state(game_id)
        a = dict(s["config"].get("abandon") or {})
        return s, {"proposal": a.get("proposal"), "cooldown": dict(a.get("cooldown") or {})}

    def abandon_view(self, config: dict, now: float | None = None) -> dict:
        """What the page needs: the open proposal (who made it) and until when each seat may not propose (milliseconds), with the server's clock."""
        a = config.get("abandon") or {}
        return {"proposal": a.get("proposal"), "cooldown": a.get("cooldown") or {}, "now": int((now if now is not None else time.time()) * 1000), "cooldown_seconds": ABANDON_COOLDOWN}

    def _abandon_store(self, game_id: str, state: dict) -> dict:
        self.keeper.update_config(game_id, {"abandon": state})
        return self.abandon_view({"abandon": state})

    def abandon_propose(self, game_id: str, token: str) -> dict:
        c = self._load(game_id, fresh=True)
        seat = self._seat_of(c, token)
        s, a = self._abandon_state(game_id)
        if s["status"] != "playing":
            raise AbandonRefused("only a running game can be abandoned", 409)
        if a["proposal"] and a["proposal"]["by"] != seat:             # both players want to stop: the other's proposal is answered by this one, the table is abandoned at once
            return self._abandon_now(game_id, c, a)
        if a["proposal"]:
            raise AbandonRefused("a proposal to abandon is already open", 409, {"proposal": a["proposal"]})
        now_ms = int(time.time() * 1000)
        wait = int(a["cooldown"].get(str(seat), 0)) - now_ms
        if wait > 0:
            raise AbandonRefused(f"you cannot propose to abandon again for {-(-wait // 60000)} minute(s)", 429, {"retry_after": -(-wait // 1000)})
        a["proposal"] = {"by": seat, "at": now_ms}
        return self._abandon_store(game_id, a)

    def _abandon_now(self, game_id: str, c: "Cached", a: dict) -> dict:
        a["proposal"] = None
        self._abandon_store(game_id, a)
        self.keeper.set_status(game_id, "abandoned", end_reason="abandoned by agreement", registry_event={"status": "abandoned", "n_actions": c.version})
        c.status = "abandoned"
        self.wrap_up(game_id)
        return {"status": "abandoned"}

    def abandon_status(self, game_id: str) -> dict:
        """The open proposal and the cooldowns with the game's status (for the pages that poll: no socket server pushes them)."""
        s = self.keeper.state(game_id)
        return {"status": s["status"], **self.abandon_view(s["config"])}

    def abandon_withdraw(self, game_id: str, token: str) -> dict:
        c = self._load(game_id, fresh=True)
        seat = self._seat_of(c, token)
        s, a = self._abandon_state(game_id)
        if not a["proposal"] or a["proposal"]["by"] != seat:
            raise AbandonRefused("you have no open proposal", 409)
        a["proposal"] = None
        return self._abandon_store(game_id, a)

    def abandon_answer(self, game_id: str, token: str, agree: bool) -> dict:
        c = self._load(game_id, fresh=True)
        seat = self._seat_of(c, token)
        s, a = self._abandon_state(game_id)
        prop = a["proposal"]
        if s["status"] != "playing" or not prop:
            raise AbandonRefused("there is no proposal to answer", 409)
        if prop["by"] == seat:
            raise AbandonRefused("the other player answers your proposal", 403)
        if agree:
            return self._abandon_now(game_id, c, a)
        a["proposal"] = None
        a["cooldown"][str(prop["by"])] = int(time.time() * 1000) + ABANDON_COOLDOWN * 1000
        return {"status": "playing", **self._abandon_store(game_id, a)}

    def concede(self, game_id: str, token: str) -> dict:
        """The player gives up: a move of the game like any other (the engine ends it, the other player wins with the scores of the position), announced in both game logs."""
        c = self._load(game_id, fresh=True)
        seat = self._seat_of(c, token)
        if c.status == "waiting":                                         # nobody to play against yet: the table is just closed
            self.keeper.set_status(game_id, "conceded", end_reason=f"seat {seat + 1} conceded", registry_event={"status": "conceded", "n_actions": c.version})
            c.status = "conceded"
            self.wrap_up(game_id)
            return {"status": "conceded", "seat": seat}
        if c.status != "playing":
            raise IllegalMove("this game has ended", 409)
        act = Action(seat, "concede", {})
        try:
            new = apply(c.state, act)
        except IllegalAction as e:
            raise IllegalMove(str(e), 422)
        out = self._commit(game_id, c, seat, act, new, None)
        return {**out, "status": "conceded", "seat": seat}

    # ---- a finished game, read back ----------------------------------------------------------------------------------------------------
    def registry_row(self, game_id: str) -> dict | None:
        return self.registry.latest(game_id) if self.registry is not None else None

    def outcome(self, game_id: str) -> dict:
        """The end page's data: who played, how the game ended, the scores. From the registry, so it also works after the keeper has deleted the table."""
        row = self.registry_row(game_id)
        if row is None:
            raise NoSuchTable("no such game", 404)
        if row.get("status") not in reg.FINAL:
            raise NotReplayable(row.get("status", "unknown"))
        result = row.get("result")
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except ValueError:
                result = None
        stamp = lambda v: v.isoformat() if hasattr(v, "isoformat") else v        # noqa: E731 (BigQuery returns datetimes)
        try:
            rated = bool(json.loads(row.get("config") or "{}").get("rated"))
        except ValueError:
            rated = False
        return {"game_id": game_id, "status": row["status"], "end_reason": row.get("end_reason"), "names": list(row.get("player_names") or []), "maps": list(row.get("maps") or []),
                "marine_worlds": row.get("marine_worlds"), "result": result, "n_actions": row.get("n_actions"), "started_at": stamp(row.get("started_at")), "ended_at": stamp(row.get("ended_at")),
                "replayable": bool(row.get("gcs_path")), "engine_version": row.get("engine_version"), "stats": self._stats(row), "rated": rated, "ratings": self.rating_changes(game_id) if rated else []}

    def _stats(self, row: dict) -> dict | None:
        """The statistics stored in the record of the game (computed now for a record that has none)."""
        path = row.get("gcs_path")
        if not path or self.archive is None:
            return None
        hit = self._stat_cache.get(path)
        if hit is None:
            try:
                record = arch.decode(self.archive.read(path))
                hit = record.get("stats") or stats_of(record)
            except Exception:                                    # noqa: BLE001 (the end page works without the numbers)
                log.exception("the statistics of %s could not be read", path)
                return None
            self._stat_cache[path] = hit
            while len(self._stat_cache) > 32:
                self._stat_cache.pop(next(iter(self._stat_cache)))
        return hit

    def recorded_replay(self, game_id: str) -> dict:
        """The replay JSON of a finished / conceded table, from its record in GCS (no engine: replay/from_record.py)."""
        from ark_nova.replay.from_record import replay_from_record
        row = self.registry_row(game_id)
        if row is None:
            raise NoSuchTable("no such game", 404)
        if row.get("status") not in ("finished", "conceded") or not row.get("gcs_path") or self.archive is None:
            raise NotReplayable(row.get("status", "unknown"))
        path = row["gcs_path"]
        hit = self._replays.get(path)
        if hit is None:
            hit = replay_from_record(arch.decode(self.archive.read(path)), game_id)
            self._replays[path] = hit
            while len(self._replays) > 8:
                self._replays.pop(next(iter(self._replays)))
        return hit

    # ---- the registry and the record ----------------------------------------------------------------------------------------------------
    def sync_registry(self, game_id: str, patch: dict | None = None) -> bool:
        """Append the keeper's pending registry events to BigQuery as complete rows, then acknowledge them. Never raises: a failure leaves the events in the keeper for the next
        try (BigQuery is not on the path of a move). `patch`: fields added to the last event (the path of the exported record)."""
        if self.registry is None:
            return True
        try:
            kept = self.keeper.state(game_id)
            events = self.keeper.registry(game_id)
            if patch and events:
                events[-1]["event"].update(patch)
            for item in events:
                self.registry.append(reg.build_row(game_id, item["seq"], kept, item["event"]))
            if events:
                self.keeper.ack_registry(game_id, events[-1]["seq"])
            return True
        except Exception:                                    # noqa: BLE001 (any failure of BigQuery or of the keeper)
            log.exception("registry sync of %s failed; the events stay in the keeper", game_id)
            return False

    def wrap_up(self, game_id: str) -> bool:
        """An ended table: export its record (finished and conceded games only), write the final registry row with the path, then let the keeper delete the table. Safe to call
        again after a failure. An abandoned table is not exported; a table in error is kept for a look. Never raises."""
        try:
            kept = self.keeper.state(game_id)
            status = kept["status"]
            if status not in reg.FINAL:
                return False
            patch = None
            if status in ("finished", "conceded"):
                if self.archive is None:
                    return False
                rec = self.keeper.record(game_id)
                last = self.keeper.registry(game_id)
                result = next((e["event"].get("result") for e in reversed(last) if e["event"].get("result") is not None), None)
                record = arch.build_record(kept, rec, result)
                try:
                    record["stats"] = stats_of(record)                      # the end page's numbers (a failure here must not lose the record)
                except Exception:                                    # noqa: BLE001
                    log.exception("the statistics of %s could not be computed", game_id)
                data = arch.encode(record)
                now = datetime_now()
                path = self.archive.write(arch.path_for(game_id, now), data)
                patch = {"gcs_path": path, "exported_at": int(now.timestamp() * 1000), "record_bytes": len(data), "ended_at": kept.get("ended_at")}
            if status in ("finished", "conceded"):
                self._rate(game_id, kept)                           # (before the keeper forgets the table; it is applied once, a failure here is tried again with the wrap-up)
            if not self.sync_registry(game_id, patch):
                return False
            if status != "error":
                self.keeper.finalize(game_id)
                with self._lock:
                    self._cache.pop(game_id, None)
            return True
        except Exception:                                    # noqa: BLE001
            log.exception("wrap-up of %s failed; it can be run again", game_id)
            return False

    def _rate(self, game_id: str, kept: dict) -> None:
        """The ratings of a rated game that has ended: the winner (a draw counts half) by the scores, the loser of a concession or of overtime. A concession before MIN_RATED_TURNS turns were
        played, a game without two different accounts, an abandoned or a friendly game: nothing changes. Written once (the store refuses a game that is already rated)."""
        cfg = kept.get("config") or {}
        if not cfg.get("rated") or self.ratings is None:
            return
        ids = [cfg.get("account_0"), cfg.get("account_1")]
        if None in ids or ids[0] == ids[1]:
            return
        c = self._load(game_id, fresh=True)
        res = c.state.result
        if res is None:
            return
        if kept["status"] == "conceded":
            if c.state.turn < elo.MIN_RATED_TURNS:
                return
            score_a = 0.0 if res.conceded == 0 else 1.0
        else:
            score_a = 0.5 if res.winner is None else (1.0 if res.winner == 0 else 0.0)
        at = datetime_now().isoformat()
        for _ in range(4):
            now = self.ratings.ratings_of(ids)
            if len(now) < 2:
                return
            ra, rb = now[ids[0]][0], now[ids[1]][0]
            na, nb = elo.updated(ra, rb, score_a)
            out = self.ratings.commit_ratings(game_id, [elo.RatingChange(game_id, ids[0], 0, ids[1], score_a, ra, na, at), elo.RatingChange(game_id, ids[1], 1, ids[0], 1.0 - score_a, rb, nb, at)])
            if out != "changed":
                return
        raise RuntimeError(f"the ratings of {game_id} kept changing while it was rated")

    def rating_changes(self, game_id: str) -> list:
        """The rating changes of a rated game, for the end page: who, before, after, with the account names."""
        if self.ratings is None:
            return []
        rows = self.ratings.rating_changes(game_id)
        names = self.ratings.usernames([r.account_id for r in rows]) if rows else {}
        return [{"seat": r.seat, "account_id": r.account_id, "name": names.get(r.account_id, r.account_id), "result": r.result, "before": round(r.before), "after": round(r.after), "delta": round(r.after - r.before, 1)}
                for r in rows]

    # ---- the cache ------------------------------------------------------------------------------------------------------------------------
    def _remember(self, game_id: str, c: Cached) -> None:
        with self._lock:
            self._cache[game_id] = c
            self._cache.move_to_end(game_id)
            while len(self._cache) > CACHE_GAMES:
                self._cache.popitem(last=False)

    def _load(self, game_id: str, fresh: bool = False) -> Cached:
        with self._lock:
            hit = self._cache.get(game_id)
        if hit is not None and not fresh:
            return hit
        s = self.keeper.state(game_id)
        if s["snapshot"] is None:
            raise NoSuchTable("the table has no snapshot", 404)
        snap = s["snapshot"]["state"]
        state = GameState.from_dict(snap["engine"])
        eff, n = list(snap.get("eff") or []), int(s["snapshot"]["version"])
        for item in s["actions"]:
            a = item["action"]
            before = state
            state = apply(state, Action(int(a["player"]), a["kind"], dict(a.get("args") or {})))
            n += 1
            if a["kind"] == "undo_last":
                del eff[-1:]
            elif a["kind"] == "restart_turn":
                took = len((before.checkpoint or {}).get("actions") or [])
                if took:
                    del eff[-took:]
            else:
                eff.append(n)
        c = Cached(s["version"], state, [x["token_hash"] for x in s["seats"]], s["status"], [x["name"] for x in s["seats"]], eff, s["config"].get("clock"))
        self._remember(game_id, c)
        return c

    @staticmethod
    def _seat_of(c: Cached, token: str | None) -> int:
        h = token_hash(token or "")
        for seat, want in enumerate(c.hashes):
            if secrets.compare_digest(h, want):
                return seat
        raise Forbidden("unknown seat token", 403)


def datetime_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


def new_request_id() -> str:
    return uuid.uuid4().hex


__all__ = ["LiveService", "IllegalMove", "NotStarted", "NotYourSeat", "EngineStopped", "token_hash", "new_request_id", "Any"]
