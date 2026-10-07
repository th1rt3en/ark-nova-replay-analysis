"""The engine version and its manifest (docs/live_game_plan.md 5.10)."""
import json
import re

from ark_nova.engine import version as v


def _manifest():
    return json.loads(v.MANIFEST.read_text(encoding="utf-8"))


def test_the_version_is_well_formed():
    assert re.fullmatch(r"\d+\.\d+\.\d+(-dev)?", v.ENGINE_VERSION)
    assert v.SCHEMA_VERSION >= 1


def test_the_fingerprints_are_stable_and_react_to_a_change():
    assert v.code_hash() == v.code_hash() and v.data_hash() == v.data_hash()
    assert len(v.code_hash()) == 64
    assert v._digest([v._PKG / "engine" / "version.py"], v._PKG) != v._digest([v._PKG / "engine" / "turns.py"], v._PKG)


def test_a_released_version_still_has_the_rules_it_was_released_with():
    """The gate: a version in the manifest must match the code and the data now. Changing a rule means a new version (a `-dev` one is the work in progress)."""
    entries = _manifest()
    assert len({e["version"] for e in entries}) == len(entries), "a version is in the manifest twice"
    for e in entries:
        assert {"version", "code_hash", "data_hash", "schema_version", "commit", "date", "notes"} <= set(e)
    released = {e["version"]: e for e in entries}
    if v.ENGINE_VERSION in released:
        e = released[v.ENGINE_VERSION]
        now = v.fingerprint()
        assert (e["code_hash"], e["data_hash"], e["schema_version"]) == (now["code_hash"], now["data_hash"], now["schema_version"]), \
            f"the rules or the data changed since {v.ENGINE_VERSION} was released: bump ENGINE_VERSION (and release it)"
    else:
        assert v.ENGINE_VERSION.endswith("-dev"), f"{v.ENGINE_VERSION} is not in engine_versions.json: run scripts/release_engine.py or make it a -dev version"
