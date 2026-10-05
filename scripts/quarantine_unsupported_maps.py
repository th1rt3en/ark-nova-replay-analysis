"""Move the logs of tables played on a map the engine does not support (data/map_support.py: the beginner maps 0 and A) out of log_examples/ into
log_examples_unsupported/ and take them out of data_manual/sample_maps.json; the table ids stay listed in data_manual/unsupported_logs.json so that
nothing is lost. Run it after every fetch of new logs (scripts/fetch_sample_maps.py does it by itself); python scripts/quarantine_unsupported_maps.py
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from ark_nova.data.map_support import UNSUPPORTED_MAPS  # noqa: E402


def quarantine() -> list:
    sample_path = ROOT / "data_manual" / "sample_maps.json"
    ledger_path = ROOT / "data_manual" / "unsupported_logs.json"
    sample = json.loads(sample_path.read_text()) if sample_path.exists() else {}
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {}
    moved = []
    dest = ROOT / "log_examples_unsupported"
    for table, info in sorted(sample.items()):
        bad = sorted(set(info["maps"].values()) & UNSUPPORTED_MAPS)
        if not bad:
            continue
        ledger[table] = info
        del sample[table]
        src = ROOT / "log_examples" / f"{table}.json"
        if src.exists():
            dest.mkdir(exist_ok=True)
            shutil.move(str(src), str(dest / src.name))
        moved.append((table, bad))
    # logs that come back once the maps are supported
    for table, info in list(ledger.items()):
        if not set(info["maps"].values()) & UNSUPPORTED_MAPS:
            sample[table] = info
            del ledger[table]
            back = dest / f"{table}.json"
            if back.exists():
                shutil.move(str(back), str(ROOT / "log_examples" / back.name))
    sample_path.write_text(json.dumps(sample, indent=4, sort_keys=True) + "\n")
    ledger_path.write_text(json.dumps(ledger, indent=4, sort_keys=True) + "\n")
    return moved


if __name__ == "__main__":
    for table, maps in quarantine():
        print(f"{table}: map {', '.join(maps)} is not supported yet, moved to log_examples_unsupported/", file=sys.stderr)
