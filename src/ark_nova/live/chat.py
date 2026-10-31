"""The chat of a lobby (`L12`) and of a table (`E7`): the players and the spectators write in one public room.

Who may write. A table: a player with a valid seat token (friendly games need no account), or a spectator who is logged in; anybody may read (a spectator already sees the public
view of the game only, `live/projection.py`: the chat is as public as that). A lobby: anybody may read it; writing needs an account, and the ones who have not taken a seat are shown as spectators. The text is 1 to `MAX_TEXT`
characters, one sender writes at most one message every `MIN_GAP_MS`.

The messages are kept by the `Chat` Durable Object of the Cloudflare Worker (`cloudflare/src/chat.ts`, one object per room, the last 300 messages, deleted a day after the last one);
`HttpChat` reaches it with signed internal calls, `MemoryChat` is its twin in memory for tests and the dev server (keep the two the same). `ChatService` decides who may do what.
"""
import json
import re
import threading
import time
import urllib.error
import urllib.request

from ark_nova.live.keeper import USER_AGENT, Forbidden, LiveError, sign

MAX_TEXT = 500
MIN_GAP_MS = 800
KEEP = 300
ROOM = re.compile(r"^[EL]\d{1,9}$")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


class ChatError(LiveError):
    def __init__(self, message: str, status: int = 422, code: str = "chat"):
        super().__init__(message, status)
        self.code = code


class MemoryChat:
    def __init__(self, clock=time.time):
        self.clock = clock
        self._lock = threading.Lock()
        self._rooms: dict = {}
        self._last: dict = {}

    def call(self, room: str, op: str, **args) -> dict:
        with self._lock:
            box = self._rooms.setdefault(room, {"seq": 0, "messages": []})
            if op == "list":
                since = int(args.get("since") or 0)
                return {"messages": [m for m in box["messages"] if m["seq"] > since][:200], "last": box["seq"]}
            text = _CONTROL.sub(" ", str(args.get("text") or "")).strip()
            name = str(args.get("name") or "")[:40]
            if not text or len(text) > MAX_TEXT or not name or args.get("kind") not in ("player", "spectator"):
                raise ChatError(f"Write a message of 1 to {MAX_TEXT} characters.", 422, "bad_message")
            now = int(self.clock() * 1000)
            key = (room, args.get("sender"))
            if now - self._last.get(key, 0) < MIN_GAP_MS:
                raise ChatError("You are writing too fast.", 429, "slow_down")
            self._last[key] = now
            box["seq"] += 1
            seat = args.get("seat") if isinstance(args.get("seat"), int) else None
            msg = {"seq": box["seq"], "at": now, "name": name, "kind": args["kind"], "seat": seat, "text": text}
            box["messages"].append(msg)
            del box["messages"][:-KEEP]
            return {"message": msg}


class HttpChat:
    """The chat rooms of the Worker (`POST /internal/chat/<room>/<post|list>`, the signature of `HttpKeeper`)."""

    def __init__(self, base_url: str, secret: str, timeout: float = 15.0):
        self.base, self.secret, self.timeout = base_url.rstrip("/"), secret, timeout

    def call(self, room: str, op: str, **args) -> dict:
        path = f"/internal/chat/{room}/{op}"
        data = json.dumps(args, separators=(",", ":")).encode()
        req = urllib.request.Request(self.base + path, data=data, method="POST", headers={**sign(self.secret, "POST", path, data), "Content-Type": "application/json", "User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read() or b"{}")["result"]
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read()).get("error") or {}
            except ValueError:
                err = {}
            if isinstance(err, dict) and err.get("message"):
                raise ChatError(str(err["message"]), int(e.code), str(err.get("code") or "chat"))
            raise LiveError(f"the chat could not be reached (HTTP {e.code})", 502)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            raise LiveError(f"the chat did not answer: {e}", 502)


class ChatService:
    def __init__(self, live, lobbies, store=None):
        self.live, self.lobbies = live, lobbies
        self.store = store or MemoryChat()

    @staticmethod
    def _clean(text) -> str:
        text = _CONTROL.sub(" ", text if isinstance(text, str) else "").strip()
        if not text or len(text) > MAX_TEXT:
            raise ChatError(f"Write a message of 1 to {MAX_TEXT} characters.", 422, "bad_message")
        return text

    # ---- a table ----------------------------------------------------------------------------------------------------------------------
    def _seat(self, game_id: str, token: str | None):
        """(skeleton, the seat of the token or None): a table that does not exist raises NoSuchTable; a token that is not a seat's counts as no token (a spectator)."""
        try:
            sk = self.live.skeleton(game_id, token or None)
        except Forbidden:
            sk = self.live.skeleton(game_id, None)
        return sk, sk.get("seat")

    def read_table(self, game_id: str, since: int) -> dict:
        self.live.lobby(game_id)                                           # (a table that is gone has no chat to read: NoSuchTable)
        return self.store.call(game_id, "list", since=since)

    def post_table(self, game_id: str, token: str | None, account, text) -> dict:
        text = self._clean(text)
        sk, seat = self._seat(game_id, token)
        if seat is not None:
            who = {"sender": f"seat{seat}", "name": sk["players"][seat]["name"], "kind": "player", "seat": seat}
        elif account is not None:
            who = {"sender": f"acct{account.id}", "name": account.username, "kind": "spectator", "seat": None}
        else:
            raise ChatError("Log in to write in the chat of a game you are watching.", 401, "login_needed")
        out = self.store.call(game_id, "post", text=text, **who)
        self._announce(game_id)
        return out

    # ---- a lobby ----------------------------------------------------------------------------------------------------------------------
    def read_lobby(self, lobby_id: str, account, since: int) -> dict:
        self.lobbies.get(lobby_id, account)                                # (anybody who can see the lobby, logged in or not; a lobby that is gone raises)
        return self.store.call(lobby_id, "list", since=since)

    def post_lobby(self, lobby_id: str, account, text) -> dict:
        text = self._clean(text)
        view = self.lobbies.get(lobby_id, account)
        kind = "player" if view["is_member"] else "spectator"             # (a visitor of the lobby who has not taken a seat is a spectator)
        out = self.store.call(lobby_id, "post", text=text, sender=f"acct{account.id}", name=account.username, kind=kind, seat=view["my_seat"])
        self._announce(lobby_id)
        return out

    def _announce(self, room: str) -> None:
        """The pages that have the room open are told by the lobbies' socket hub that there is something new to read (they fetch it: `chat.js`). Never raises."""
        try:
            if self.lobbies is not None:
                self.lobbies.notify("chat:" + room)
        except Exception:                                                    # noqa: BLE001 (a page that is not told still asks again within the minute)
            pass
