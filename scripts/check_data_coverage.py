"""Check that every card id seen in log_examples/*.json exists in the imported data (join key: letter+number)."""
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "ark_nova" / "data"
files = {"A": "animals", "S": "sponsors", "P": "projects", "F": "endgames"}
have = {c["key"] for f in files.values() for c in json.loads((DATA / f"{f}.json").read_text("utf8"))}
pat = re.compile(r'"id": "([ASPF])(\d+)_([A-Za-z0-9_]+)"')
seen: dict[str, set[str]] = {}
for g in glob.glob(str(ROOT / "log_examples" / "*.json")):
    for kind, num, rest in pat.findall(Path(g).read_text("utf8")):
        seen.setdefault(f"{kind}{num}", set()).add(rest)
missing = sorted(k for k in seen if k not in have)
variants = sorted(k for k, v in seen.items() if any(r.endswith("_MW") for r in v) and any(not r.endswith("_MW") for r in v))
print(f"log card keys: {len(seen)}; missing from data: {len(missing)}: {missing}")
print(f"keys with both base and _MW variants in logs (need per-variant data): {variants}")
sys.exit(1 if missing else 0)
