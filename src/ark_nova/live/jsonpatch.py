"""A small JSON diff / patch for the viewer steps of a record (docs/live_game_plan.md 9.1.5). Pure Python, no imports from the engine.

`diff(old, new)` -> None when equal, else a patch:
- `{"=": value}`: replace;
- `{"~": {key: patch}, "-": [deleted keys]}`: the dicts differ in some keys (either part may be missing);
- `{"[]": {index: patch}}`: two lists of the same length that differ in some items.
`apply(old, patch)` returns the new value (the old one is not changed).
"""
import copy
from typing import Any


def diff(old: Any, new: Any) -> dict | None:
    if old == new and type(old) is type(new):
        return None
    if isinstance(old, dict) and isinstance(new, dict):
        changed = {}
        for k, v in new.items():
            if k not in old:
                changed[k] = {"=": v}
            else:
                sub = diff(old[k], v)
                if sub is not None:
                    changed[k] = sub
        gone = [k for k in old if k not in new]
        out: dict = {}
        if changed:
            out["~"] = changed
        if gone:
            out["-"] = gone
        return out if len(json_len(out)) < len(json_len({"=": new})) else {"=": new}
    if isinstance(old, list) and isinstance(new, list) and len(old) == len(new):
        items = {}
        for i, (a, b) in enumerate(zip(old, new)):
            sub = diff(a, b)
            if sub is not None:
                items[str(i)] = sub
        return {"[]": items} if len(json_len(items)) < len(json_len({"=": new})) else {"=": new}
    return {"=": new}


def json_len(value: Any) -> str:
    import json
    return json.dumps(value, separators=(",", ":"))


def apply(old: Any, patch: dict | None) -> Any:
    if patch is None:
        return copy.deepcopy(old)
    if "=" in patch:
        return copy.deepcopy(patch["="])
    if "[]" in patch:
        out = copy.deepcopy(old)
        for i, sub in patch["[]"].items():
            out[int(i)] = apply(old[int(i)], sub)
        return out
    out = copy.deepcopy(old)
    for k, sub in patch.get("~", {}).items():
        out[k] = apply(old.get(k), sub) if k in old else copy.deepcopy(sub["="])
    for k in patch.get("-", []):
        out.pop(k, None)
    return out
