"""The saved maps of an account: maps made in the map editor (`web/map_editor.html`), at most MAX_MAPS per account, each with a name and an id `M{n}`.

The store keeps the editor's own export (as JSON text) so the editor can open it again; `engine/custom_map.normalize` checks it on every save and again when a game is made from it,
and that is the map the engine plays. A map may be played by anybody the owner invites to a game (the game carries a copy), so the maps themselves are private: only the owner reads them.
"""
import datetime
import json

from ark_nova.accounts.service import AccountError
from ark_nova.engine import custom_map

MAX_MAPS = 3
MAX_BYTES = 40_000


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _view(row: dict, with_data: bool = False) -> dict:
    out = {"id": row["id"], "name": row["name"], "created_at": row["created_at"], "updated_at": row["updated_at"]}
    if with_data:
        out["data"] = json.loads(row["data"])
    return out


class MapService:
    def __init__(self, store, now=_now):
        self.store, self.now = store, now

    def _checked(self, name, raw) -> tuple[str, str]:
        """The name and the JSON text to keep; a map that cannot be played is refused with the reason."""
        if not isinstance(raw, dict):
            raise AccountError(422, "bad_map", "The map must be a JSON object.")
        text = json.dumps(raw, separators=(",", ":"), sort_keys=True)
        if len(text) > MAX_BYTES:
            raise AccountError(413, "too_large", "That map is too large.")
        try:
            rec = custom_map.normalize(raw, name if isinstance(name, str) else "")
        except custom_map.CustomMapError as e:
            raise AccountError(422, "bad_map", f"This map cannot be saved: {e}.")
        return rec["name"], text

    def list(self, account) -> list[dict]:
        return [_view(r) for r in self.store.maps_of(account.id)]

    def get(self, account, map_id: str) -> dict:
        row = self.store.map_by_id(str(map_id))
        if row is None or row["account_id"] != account.id:
            raise AccountError(404, "no_map", "No such map among yours.")
        return _view(row, True)

    def create(self, account, name, raw) -> dict:
        name, text = self._checked(name, raw)
        row = self.store.create_map(account.id, name, text, self.now(), MAX_MAPS)
        if row is None:
            raise AccountError(409, "map_limit", f"You can keep {MAX_MAPS} maps: delete one first.")
        return _view(row, True)

    def update(self, account, map_id: str, name, raw) -> dict:
        name, text = self._checked(name, raw)
        row = self.store.update_map(account.id, str(map_id), name, text, self.now())
        if row is None:
            raise AccountError(404, "no_map", "No such map among yours.")
        return _view(row, True)

    def rename(self, account, map_id: str, name) -> dict:
        row = self.get(account, map_id)
        return self.update(account, map_id, name, row["data"])

    def delete(self, account, map_id: str) -> None:
        if not self.store.delete_map(account.id, str(map_id)):
            raise AccountError(404, "no_map", "No such map among yours.")

    def record_for_game(self, account_id: str, map_id: str) -> dict:
        """The normalized map of one of the account's maps, for a new game (`GameConfig.custom_map`)."""
        row = self.store.map_by_id(str(map_id))
        if row is None or row["account_id"] != account_id:
            raise AccountError(404, "no_map", "Choose one of your saved maps.")
        try:
            return custom_map.normalize(json.loads(row["data"]), row["name"])
        except custom_map.CustomMapError as e:                  # (a saved map that the engine no longer accepts)
            raise AccountError(422, "bad_map", f"This map cannot be played: {e}.")
