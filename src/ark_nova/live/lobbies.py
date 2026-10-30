"""The lobbies of the custom games: a place where a logged-in player opens a table for others, and the invitations between players.

A lobby has two seats. The host opens it (game mode, Marine Worlds or not, friendly or rated), other players join it from the list or by an invitation, the host can remove
players, and when both seats are taken the host starts the game: only then the live table is created (`LiveService.create`) and each seat is joined with its account, so the
page of every member can go straight to the table.

Where the state lives. The lobbies, the presence of the players ("online" = their page asked `inbox` in the last `ONLINE_SECONDS`), the invitations and the one-shot messages are kept
by the `Lobbies` Durable Object of the Cloudflare Worker (`cloudflare/src/lobbies.ts`), next to the table keeper: Cloud Run reaches it with signed internal calls
(`HttpLobbies`, the same signature as `HttpKeeper`). `MemoryLobbies` is its twin in memory (tests, the dev server without a Worker): the two must behave the same, the
Worker's tests (`cloudflare/test/lobbies.test.ts`) and `tests/test_lobbies.py` check the same rules. `LobbyService` is what the routes use: it checks the rules that need Cloud Run
(rated games need the account store) and makes the live table when the host starts (`begin_start` -> create the table and join the seats -> `finish_start`; a failure gives
`abort_start` and the lobby stays open).

The host's lobby disappears when the host has not been seen for `IDLE_SECONDS`; a member that is not seen for that long is taken out of the lobby.
"""
import json
import threading
import time
import urllib.error
import urllib.request
import uuid
from types import SimpleNamespace

from ark_nova.engine import ark360
from ark_nova.live.keeper import USER_AGENT, LiveError, sign

MODES = (ark360.MODE,)                       # the game modes that can be played from a lobby (the other modes are for a table made by link)
SEATS = 2
ONLINE_SECONDS = 45                          # a player who asked for the inbox this recently is online (the pages ask every few seconds)
IDLE_SECONDS = 90                            # a lobby whose host (a member) has not been seen for this long is closed (the member is taken out)
INVITE_SECONDS = 600                         # an invitation that nobody answered is dropped after this long
STARTED_KEEP_SECONDS = 600                   # a started lobby stays (members are sent to the table by it) this long
NOTICE_KEEP = 20
OPS = ("create", "list", "get", "join", "leave", "kick", "invite", "cancel_invite", "answer", "inbox", "online", "begin_start", "finish_start", "abort_start")


class LobbyError(LiveError):
    def __init__(self, message: str, status: int = 409, code: str = "lobby"):
        super().__init__(message, status)
        self.code = code


def _label(mode: str) -> str:
    from ark_nova.live.service import GAME_MODES
    return GAME_MODES.get(mode, (mode, ""))[0]


class MemoryLobbies:
    """The lobby rules on plain data in memory. An account is `{"id", "username"}`; every operation returns plain JSON data (what the Worker's Durable Object returns too)."""

    def __init__(self, clock=time.time):
        self.clock = clock
        self._lock = threading.RLock()
        self._lobbies: dict = {}
        self._seen: dict = {}                    # account id -> (username, when)
        self._notices: dict = {}                 # account id -> [one-shot messages for the pages: declined, removed, closed]
        self._next = 0

    def call(self, op: str, **args) -> dict:
        if op not in OPS:
            raise LobbyError(f"unknown operation {op}", 404, "no_op")
        with self._lock:
            return getattr(self, "op_" + op)(**args)

    # ---- presence -------------------------------------------------------------------------------------------------------------------
    def _heartbeat(self, account) -> None:
        self._seen[account["id"]] = (account["username"], self.clock())

    def _is_online(self, account_id) -> bool:
        seen = self._seen.get(account_id)
        return bool(seen) and self.clock() - seen[1] <= ONLINE_SECONDS

    def op_online(self, account, q="") -> dict:
        query = (q or "").strip().lower()
        now = self.clock()
        names = sorted(n for i, (n, t) in self._seen.items() if i != account["id"] and now - t <= ONLINE_SECONDS and n.lower().startswith(query))
        return {"names": names[:8]}

    # ---- lobbies --------------------------------------------------------------------------------------------------------------------
    def _sweep(self) -> None:
        now = self.clock()
        for lid, lob in list(self._lobbies.items()):
            if lob["status"] == "started":
                if now - lob["started_at"] > STARTED_KEEP_SECONDS:
                    del self._lobbies[lid]
                continue
            lob["invites"] = [i for i in lob["invites"] if i["status"] != "pending" or now - i["at"] <= INVITE_SECONDS]
            host = lob["seats"][0]
            if now - self._seen.get(host["id"], ("", 0))[1] > IDLE_SECONDS:
                self._close(lob, "its host left")
                continue
            for k in range(1, SEATS):
                m = lob["seats"][k]
                if m and now - self._seen.get(m["id"], ("", 0))[1] > IDLE_SECONDS:
                    lob["seats"][k] = None

    def _close(self, lob: dict, why: str) -> None:
        for m in lob["seats"][1:]:
            if m:
                self._tell(m["id"], {"type": "closed", "lobby": lob["id"], "message": f"The lobby of {lob['seats'][0]['username']} was closed: {why}."})
        self._lobbies.pop(lob["id"], None)

    def _tell(self, account_id, notice: dict) -> None:
        box = self._notices.setdefault(account_id, [])
        box.append({**notice, "at": self.clock()})
        del box[:-NOTICE_KEEP]

    def _lobby_of(self, account_id):
        for lob in self._lobbies.values():
            if lob["status"] in ("open", "starting") and any(m and m["id"] == account_id for m in lob["seats"]):
                return lob
        return None

    def _get(self, lobby_id: str) -> dict:
        lob = self._lobbies.get(lobby_id)
        if lob is None:
            raise LobbyError("No such lobby: it was closed.", 404, "no_lobby")
        return lob

    @staticmethod
    def _member(lob: dict, account) -> int:
        for k, m in enumerate(lob["seats"]):
            if m and m["id"] == account["id"]:
                return k
        raise LobbyError("You are not in this lobby.", 403, "not_member")

    def _need_host(self, lob: dict, account) -> None:
        if self._member(lob, account) != 0:
            raise LobbyError("Only the host can do that.", 403, "not_host")

    @staticmethod
    def _need_open(lob: dict) -> None:
        if lob["status"] != "open":
            raise LobbyError("This lobby has started.", 409, "started")

    def op_create(self, account, settings) -> dict:
        mode = settings.get("game_mode") or ark360.MODE
        if mode not in MODES:
            raise LobbyError(f"The game mode must be one of {list(MODES)}.", 422, "bad_mode")
        self._sweep()
        self._heartbeat(account)
        if self._lobby_of(account["id"]) is not None:
            raise LobbyError("You are in a lobby already: leave it first.", 409, "in_lobby")
        self._next += 1
        lob = {"id": f"L{self._next}", "mode": mode, "marine_worlds": bool(settings.get("marine_worlds")), "rated": bool(settings.get("rated")), "status": "open", "created_at": self.clock(),
               "seats": [{"id": account["id"], "username": account["username"]}, None], "invites": [], "game": None}
        self._lobbies[lob["id"]] = lob
        return self._view(lob, account)

    def op_list(self, account) -> dict:
        self._sweep()
        self._heartbeat(account)
        rows = [self._row(lob) for lob in self._lobbies.values() if lob["status"] == "open"]
        mine = self._lobby_of(account["id"])
        started = next((lob for lob in self._lobbies.values() if lob["status"] == "started" and any(m and m["id"] == account["id"] for m in lob["seats"])), None)
        return {"lobbies": sorted(rows, key=lambda r: -r["created_at"]), "mine": mine["id"] if mine else (started["id"] if started else None), "modes": list(MODES)}

    def _row(self, lob: dict) -> dict:
        players = sum(1 for m in lob["seats"] if m)
        return {"id": lob["id"], "host": lob["seats"][0]["username"], "players": players, "seats": SEATS, "mode": lob["mode"], "mode_label": _label(lob["mode"]),
                "marine_worlds": lob["marine_worlds"], "rated": lob["rated"], "full": players >= SEATS, "created_at": lob["created_at"]}

    def op_get(self, account, lobby_id) -> dict:
        """Any logged-in player may look at a lobby (a link to it does not seat them: they take an empty seat, `join`)."""
        self._sweep()
        self._heartbeat(account)
        return self._view(self._get(lobby_id), account)

    @staticmethod
    def _index(lob: dict, account):
        return next((k for k, m in enumerate(lob["seats"]) if m and m["id"] == account["id"]), None)

    @staticmethod
    def _pending_on(lob: dict, seat: int):
        return next((i for i in lob["invites"] if i["status"] == "pending" and i["seat"] == seat), None)

    def _view(self, lob: dict, account) -> dict:
        k = self._index(lob, account)
        detail = []
        for i, m in enumerate(lob["seats"]):
            inv = None if m else self._pending_on(lob, i)
            detail.append({"index": i, "account_id": m["id"] if m else None, "username": m["username"] if m else (inv["to_name"] if inv else None), "host": i == 0,
                           "online": bool(m) and self._is_online(m["id"]), "pending": bool(inv)})        # (a pending seat shows the invited player, not yet seated)
        out = {**self._row(lob), "status": lob["status"], "is_host": k == 0, "is_member": k is not None, "my_seat": k, "you": account["id"],
               "can_start": k == 0 and all(lob["seats"]) and lob["status"] == "open", "seats_detail": detail}
        if k == 0:
            out["invites"] = [{"id": i["id"], "username": i["to_name"], "status": i["status"], "seat": i["seat"]} for i in lob["invites"] if i["status"] in ("pending", "declined")]
        if lob["status"] == "started" and lob["game"]:
            out["game"] = {"game_id": lob["game"]["game_id"], **({"token": lob["game"]["tokens"][account["id"]]} if k is not None else {})}      # (the others may watch the table)
        return out

    def op_join(self, account, lobby_id, seat=None) -> dict:
        self._sweep()
        self._heartbeat(account)
        return self._join(self._get(lobby_id), account, seat)

    def _join(self, lob: dict, account, seat=None) -> dict:
        """The player takes an empty seat: the one they click, or (an accepted invitation) the one the host offered. A seat with an invitation out is for the invited player only."""
        if self._index(lob, account) is not None:
            return self._view(lob, account)
        self._need_open(lob)
        if self._lobby_of(account["id"]) is not None:
            raise LobbyError("You are in another lobby: leave it first.", 409, "in_lobby")
        mine = next((i for i in lob["invites"] if i["status"] == "pending" and i["to_id"] == account["id"]), None)
        if seat is None:
            seat = mine["seat"] if mine else next((k for k, m in enumerate(lob["seats"]) if m is None and self._pending_on(lob, k) is None), None)
        if not isinstance(seat, int) or isinstance(seat, bool) or not 0 <= seat < SEATS:
            raise LobbyError("This lobby is full.", 409, "full")
        if lob["seats"][seat] is not None:
            raise LobbyError("That seat is taken.", 409, "taken")
        held = self._pending_on(lob, seat)
        if held is not None and held["to_id"] != account["id"]:
            raise LobbyError("That seat has an invitation out for another player.", 409, "invited_seat")
        lob["seats"][seat] = {"id": account["id"], "username": account["username"]}
        for i in lob["invites"]:
            if i["to_id"] == account["id"] and i["status"] == "pending":
                i["status"] = "accepted"
        return self._view(lob, account)

    def op_leave(self, account) -> dict:
        lob = self._lobby_of(account["id"])
        if lob is None:
            return {"left": False}
        if lob["status"] == "starting":
            raise LobbyError("The game is starting.", 409, "starting")
        if lob["seats"][0]["id"] == account["id"]:
            self._close(lob, "the host left")
        else:
            lob["seats"][self._member(lob, account)] = None
        return {"left": True}

    def op_kick(self, account, lobby_id, target_id) -> dict:
        lob = self._get(lobby_id)
        self._need_host(lob, account)
        self._need_open(lob)
        k = next((i for i, m in enumerate(lob["seats"]) if m and m["id"] == target_id), None)
        if k is None or k == 0:
            raise LobbyError("There is nobody to remove there.", 404, "no_member")
        gone = lob["seats"][k]
        lob["seats"][k] = None
        self._tell(gone["id"], {"type": "removed", "lobby": lob["id"], "message": f"{account['username']} removed you from the lobby."})
        return self._view(lob, account)

    # ---- invitations ----------------------------------------------------------------------------------------------------------------
    def op_invite(self, account, lobby_id, username, seat=None) -> dict:
        self._sweep()
        lob = self._get(lobby_id)
        self._need_host(lob, account)
        self._need_open(lob)
        name = (username or "").strip().lower()
        target = next(((i, n) for i, (n, t) in self._seen.items() if n.lower() == name and self._is_online(i)), None)
        if not name or target is None:
            raise LobbyError("That player is not online (only players who are logged in and on the site can be invited).", 404, "not_online")
        tid, tname = target
        if tid == account["id"] or any(m and m["id"] == tid for m in lob["seats"]):
            raise LobbyError("That player is in the lobby already.", 409, "in_lobby")
        if any(i["status"] == "pending" and i["to_id"] == tid for i in lob["invites"]):
            raise LobbyError("That player has been invited already.", 409, "invited")
        if seat is None:                                                   # no seat named: the first empty seat that has no invitation out
            seat = next((k for k, m in enumerate(lob["seats"]) if m is None and self._pending_on(lob, k) is None), None)
        if not isinstance(seat, int) or isinstance(seat, bool) or not 1 <= seat < SEATS or lob["seats"][seat] is not None:
            raise LobbyError("There is no empty seat to invite a player to.", 409, "no_empty_seat")
        if self._pending_on(lob, seat) is not None:
            raise LobbyError("That seat has an invitation out: wait for the answer or cancel it.", 409, "no_empty_seat")
        lob["invites"].append({"id": uuid.uuid4().hex[:12], "to_id": tid, "to_name": tname, "seat": seat, "status": "pending", "at": self.clock()})
        return self._view(lob, account)

    def op_cancel_invite(self, account, lobby_id, invite_id) -> dict:
        lob = self._get(lobby_id)
        self._need_host(lob, account)
        lob["invites"] = [i for i in lob["invites"] if i["id"] != invite_id]
        return self._view(lob, account)

    def op_answer(self, account, invite_id, accept) -> dict:
        self._sweep()
        self._heartbeat(account)
        for lob in self._lobbies.values():
            for i in lob["invites"]:
                if i["id"] == invite_id and i["to_id"] == account["id"] and i["status"] == "pending":
                    if accept:
                        self._join(lob, account, i["seat"])            # (the seat the host chose; raises when the lobby has started: the invitation stays for the page to show it is gone)
                        return {"lobby": lob["id"], "accepted": True}
                    i["status"] = "declined"
                    self._tell(lob["seats"][0]["id"], {"type": "declined", "lobby": lob["id"], "by": account["username"], "message": f"{account['username']} declined your invitation."})
                    return {"lobby": lob["id"], "accepted": False}
        raise LobbyError("That invitation is no longer open.", 404, "no_invite")

    def op_inbox(self, account) -> dict:
        """What the page of a logged-in player needs every few seconds, and the proof that the player is online: the invitations waiting for an answer and the messages (declined,
        removed, closed) that are shown once."""
        self._heartbeat(account)
        self._sweep()
        invites = [{"id": i["id"], "lobby": lob["id"], "host": lob["seats"][0]["username"], "mode": lob["mode"], "mode_label": _label(lob["mode"]),
                    "marine_worlds": lob["marine_worlds"], "rated": lob["rated"]}
                   for lob in self._lobbies.values() if lob["status"] == "open" for i in lob["invites"] if i["status"] == "pending" and i["to_id"] == account["id"]]
        return {"invites": invites, "notices": self._notices.pop(account["id"], [])}

    # ---- starting: the table is made by Cloud Run between `begin_start` and `finish_start` ------------------------------------------------
    def op_begin_start(self, account, lobby_id) -> dict:
        self._sweep()
        lob = self._get(lobby_id)
        self._need_host(lob, account)
        self._need_open(lob)
        if not all(lob["seats"]):
            raise LobbyError("Both seats must be taken before the game can start.", 409, "not_full")
        lob["status"] = "starting"
        return {"mode": lob["mode"], "marine_worlds": lob["marine_worlds"], "rated": lob["rated"], "seats": [dict(m) for m in lob["seats"]]}

    def op_finish_start(self, lobby_id, game_id, tokens) -> dict:
        lob = self._get(lobby_id)
        lob.update(status="started", started_at=self.clock(), game={"game_id": game_id, "tokens": dict(tokens)})
        for i in lob["invites"]:
            if i["status"] == "pending":
                i["status"] = "expired"
        return {"ok": True}

    def op_abort_start(self, lobby_id) -> dict:
        lob = self._lobbies.get(lobby_id)
        if lob is not None and lob["status"] == "starting":
            lob["status"] = "open"
        return {"ok": True}


class HttpLobbies:
    """The lobbies of the Worker's `Lobbies` Durable Object, reached with signed internal calls (`POST /internal/lobbies/<op>`, the signature of `HttpKeeper`)."""

    def __init__(self, base_url: str, secret: str, timeout: float = 15.0):
        self.base, self.secret, self.timeout = base_url.rstrip("/"), secret, timeout

    def call(self, op: str, **args) -> dict:
        if op not in OPS:
            raise LobbyError(f"unknown operation {op}", 404, "no_op")
        path = f"/internal/lobbies/{op}"
        data = json.dumps(args, separators=(",", ":")).encode()
        headers = {**sign(self.secret, "POST", path, data), "Content-Type": "application/json", "User-Agent": USER_AGENT}
        req = urllib.request.Request(self.base + path, data=data, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read() or b"{}")["result"]
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read())
            except ValueError:
                body = {}
            err = body.get("error") or {}
            if isinstance(err, dict) and err.get("message"):
                raise LobbyError(str(err["message"]), int(e.code), str(err.get("code") or "lobby"))
            raise LiveError(f"the lobbies could not be reached (HTTP {e.code})", 502)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            raise LiveError(f"the lobbies did not answer: {e}", 502)


def _who(account) -> dict:
    return {"id": account.id, "username": account.username}


class LobbyService:
    """What the routes call: the lobby store (the Worker, or the twin in memory) and the live service that makes the table."""

    def __init__(self, live, store=None):
        self.live = live
        self.store = store or MemoryLobbies()

    def create(self, account, settings: dict) -> dict:
        if bool(settings.get("rated")) and getattr(self.live, "ratings", None) is None:
            raise LobbyError("Rated games are not available here.", 503, "no_ratings")
        return self.store.call("create", account=_who(account), settings={"game_mode": settings.get("game_mode"), "marine_worlds": bool(settings.get("marine_worlds")), "rated": bool(settings.get("rated"))})

    def list_open(self, account) -> dict:
        return self.store.call("list", account=_who(account))

    def get(self, lobby_id: str, account) -> dict:
        return self.store.call("get", account=_who(account), lobby_id=lobby_id)

    def join(self, lobby_id: str, account, seat=None) -> dict:
        return self.store.call("join", account=_who(account), lobby_id=lobby_id, seat=seat)

    def leave(self, account) -> dict:
        return self.store.call("leave", account=_who(account))

    def kick(self, lobby_id: str, account, target_id) -> dict:
        return self.store.call("kick", account=_who(account), lobby_id=lobby_id, target_id=target_id)

    def invite(self, lobby_id: str, account, username: str, seat=None) -> dict:
        return self.store.call("invite", account=_who(account), lobby_id=lobby_id, username=username, seat=seat)

    def cancel_invite(self, lobby_id: str, account, invite_id: str) -> dict:
        return self.store.call("cancel_invite", account=_who(account), lobby_id=lobby_id, invite_id=invite_id)

    def answer(self, account, invite_id: str, accept: bool) -> dict:
        return self.store.call("answer", account=_who(account), invite_id=invite_id, accept=bool(accept))

    def inbox(self, account) -> dict:
        return self.store.call("inbox", account=_who(account))

    def online(self, q: str, account) -> dict:
        return self.store.call("online", account=_who(account), q=q or "")

    def start(self, lobby_id: str, account) -> dict:
        """The lobby is locked (`begin_start`), the table is made and both accounts are seated, then the lobby keeps the tokens (`finish_start`); a failure opens the lobby again."""
        info = self.store.call("begin_start", account=_who(account), lobby_id=lobby_id)
        try:
            made = self.live.create(marine_worlds=info["marine_worlds"], game_mode=info["mode"], rated=info["rated"], account=account)
            tokens = {}
            for k, m in enumerate(info["seats"]):                              # the host takes the seat that the creation drew for the creator, the guest the other one
                seat = made["creator_seat"] if k == 0 else 1 - made["creator_seat"]
                tokens[m["id"]] = made["tokens"][seat]
                self.live.join(made["game_id"], made["tokens"][seat], m["username"], SimpleNamespace(id=m["id"], username=m["username"]))
            self.store.call("finish_start", lobby_id=lobby_id, game_id=made["game_id"], tokens=tokens)
        except Exception:
            self.store.call("abort_start", lobby_id=lobby_id)
            raise
        return self.get(lobby_id, account)
