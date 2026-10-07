"""The replay of a recorded live game (docs/live_game_plan.md 9.3). THIS MODULE AND WHAT IT IMPORTS NEVER IMPORT THE ENGINE: a record holds what the viewer shows
(the full-information view of every step as a patch chain, the decision bar, the text), so it opens on any later engine version. A test imports this module with
`ark_nova.engine` made unimportable.

`replay_from_record(record)` returns the same JSON as `build_replay_view` makes from a BGA log (players, maps, cards, one state per step), with the *effective history*:
a move that was taken back by an undo or a restart is not in it, and the numbers run 0..N without gaps.
"""
from ark_nova.live import jsonpatch

SUPPORTED_VIEWER_SCHEMAS = (1,)


class RecordError(ValueError):
    pass


def effective_steps(steps: list) -> list:
    """The steps that stay after the undo and restart steps have taken theirs back (a plain stack walk over the record, nothing recomputed)."""
    stack: list = []
    for item in steps:
        control = (item["step"] or {}).get("control")
        if control:
            took = int(control.get("took_back") or 0)
            if took:
                if took > len(stack):
                    raise RecordError(f"step {item['n']} takes back {took} steps but only {len(stack)} are there")
                del stack[-took:]
        else:
            stack.append(item)
    return stack


def replay_from_record(record: dict, table_id: str | None = None) -> dict:
    viewer = record.get("viewer") or {}
    version = viewer.get("viewer_schema_version", record.get("viewer_schema_version"))
    if version not in SUPPORTED_VIEWER_SCHEMAS:
        raise RecordError(f"this record has the viewer format {version!r}, which this version cannot read")
    names = record.get("names") or []
    players = [{"seat": i, "id": str((record.get("player_ids") or ["1", "2"])[i]), "name": names[i] if i < len(names) and names[i] else f"Player {i + 1}",
                "color": (viewer.get("colors") or [None, None])[i]} for i in (0, 1)]
    view = viewer["initial_view"]
    steps = [_step(0, "The game starts", view, None, None, record)]
    prev_n = 0
    for item in effective_steps(record["steps"]):
        s = item["step"]
        if s.get("base") != prev_n:
            raise RecordError(f"step {item['n']} follows step {s.get('base')} but the replay is at step {prev_n}")
        view = jsonpatch.apply(view, s.get("patch"))
        if s.get("full") is not None and s["full"] != view:
            raise RecordError(f"the patches of the record do not reproduce its checkpoint at step {item['n']}")
        steps.append(_step(len(steps), s.get("label") or "", view, s.get("options"), s.get("actor"), record))
        prev_n = item["n"]
    setup_steps = sum(1 for st in steps if st["state"].get("phase") == "setup")
    return {
        "table_id": table_id or record.get("game_id"), "marine_worlds": bool(viewer.get("marine_worlds")), "players": players, "maps": viewer["maps"],
        "base_projects": viewer.get("base_projects") or [], "result": _result(record, players), "setup_steps": setup_steps, "cards": viewer["cards"], "engine": None,
        "recorded": {"engine_version": record.get("engine_version"), "status": record.get("status"), "end_reason": record.get("end_reason"), "n_actions": record.get("n_actions")},
        "steps": steps,
    }


def _step(index: int, label: str, view: dict, options, actor, record: dict) -> dict:
    state = dict(view)
    state["main_deck_known"] = len(state.get("main_deck") or [])                        # (the whole draw pile order is in the record)
    return {"index": index, "move_id": None, "label": label, "state": state, "engine": {"source": "engine", "status": "ok", "detail": ""}, "options": options, "actor": actor,
            "label_pov": None, "fork": False}


def _result(record: dict, players: list) -> list:
    res = record.get("result")
    if not res or not res.get("scores"):
        return []
    scores, winner = res["scores"], res.get("winner")
    return [{"id": p["id"], "name": p["name"], "score": scores[i], "rank": 1 if (winner == i or winner is None) else 2} for i, p in enumerate(players)]
