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
    steps = [_step(0, viewer.get("initial_label") or "The game starts", view, viewer.get("initial_options"), None, record)]
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
    out = {
        "table_id": table_id or record.get("game_id"), "marine_worlds": bool(viewer.get("marine_worlds")), "players": players, "maps": viewer["maps"],
        "base_projects": viewer.get("base_projects") or [], "result": _result(record, players), "setup_steps": setup_steps, "cards": viewer["cards"], "engine": None,
        "recorded": {"engine_version": record.get("engine_version"), "status": record.get("status"), "end_reason": record.get("end_reason"), "n_actions": record.get("n_actions")},
        "steps": steps,
    }
    if record.get("kind") == "fork":                                                    # a fork that was exported: where it began, and the statistics the engine kept
        out["fork_replay"] = {"id": record.get("fork_id"), "created_at": record.get("created_at"), **(record.get("origin") or {}), "stopped": bool((record.get("result") or {}).get("stopped"))}
        out["post_stats"] = post_stats(record)
    return out


# the numbers the engine keeps (engine/gamestats.py) in the shape of the results table of the viewer (web/js/results.js `countStats`); what the engine does not count is left out
# of `available`, and the table shows no row for it
POST_STATS_AVAILABLE = ["act", "xPass", "xGained", "xUsed", "money", "spentOther", "animals", "sponsors", "released", "projects", "partners", "universities", "reputation", "breaks", "turns"]


def post_stats(record: dict) -> dict | None:
    stats = record.get("stats")
    if not stats or len(stats) != 2:
        return None
    players = []
    for st in stats:
        assoc = st.get("assoc") or {}
        players.append({"turns": st.get("turns", 0), "act": {k: (st.get("actions") or {}).get(k, 0) for k in ("build", "animals", "cards", "association", "sponsors")},
                        "xPass": st.get("passes", 0), "xGained": st.get("x_gained", 0), "xUsed": st.get("x_used", 0), "money": st.get("money_gained", 0), "spentOther": st.get("money_spent", 0),
                        "animals": st.get("animals_played", 0), "sponsors": st.get("sponsors_played", 0), "released": st.get("animals_released", 0), "projects": assoc.get("conservation", 0),
                        "partners": assoc.get("partner", 0), "universities": assoc.get("university", 0), "reputation": assoc.get("reputation", 0), "breaks": st.get("breaks", 0),
                        "income": 0, "kioskIncome": 0, "onAnimals": 0, "onBuildings": 0, "onDonations": 0, "onRange": 0, "drawn": 0, "fromRange": 0, "snapped": 0, "discarded": 0, "workers": 0,
                        "donations": 0, "advances": 0, "manualSnaps": 0, "projectSnaps": 0, "freeTwos": 0, "clever": 0, "enclosures": 0, "kiosks": 0, "pavilions": 0, "unique": 0})
    res = record.get("result") or {}
    stopped = bool(res.get("stopped"))
    end = record.get("end") or {}
    return {"players": players, "first": None, "ender": end.get("end_triggered_by"), "conceded": res.get("conceded") if stopped else None, "synthetic": stopped, "available": POST_STATS_AVAILABLE}


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
