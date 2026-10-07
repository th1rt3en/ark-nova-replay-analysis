"""Compare the map that the BigQuery index gives for every player of every table in log_examples/ (data_manual/sample_maps.json) with the map that the log's own
first-building lists fingerprint (replay/config.py `infer_maps`). Prints the tables where they differ: BGA labelled T1 as "Map 0" in some tables.
Needs data_manual/sample_maps.json (scripts/fetch_sample_maps.py). Run with the venv python: python scripts/find_mislabeled_maps.py [out.json]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from ark_nova.parser import parse_log  # noqa: E402
from ark_nova.parser.setup import extract_setup  # noqa: E402
from ark_nova.replay.batch import parallel_map  # noqa: E402
from ark_nova.replay.config import infer_maps  # noqa: E402


def check(path: str):
    table = Path(path).stem
    sample = json.loads((ROOT / "data_manual" / "sample_maps.json").read_text()).get(table)
    if not sample:
        return table, None
    try:
        parsed = parse_log(path)
        seats = extract_setup(parsed).seats
        seen = infer_maps(parsed, seats)
    except Exception as ex:                                   # (an aborted table)
        return table, f"{type(ex).__name__}: {ex}"
    return table, [(pid, sample["maps"].get(pid), s) for pid, s in zip(seats, seen)]


if __name__ == "__main__":
    paths = sorted(str(p) for p in (ROOT / "log_examples").glob("*.json"))
    rows = parallel_map(check, paths)
    wrong = {}
    for table, res in rows:
        if not isinstance(res, list):
            continue
        for pid, label, seen in res:
            if seen is not None and label is not None and seen != label and not label.endswith("-legacy"):
                wrong.setdefault(table, {})[pid] = {"label": label, "log": seen}
    for table, v in sorted(wrong.items()):
        print(table, v)
    print(len(wrong), "tables where the log's fingerprint differs from the index label", file=sys.stderr)
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(json.dumps(wrong, indent=4, sort_keys=True) + "\n")
