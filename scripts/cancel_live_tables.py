"""Mark live tables as `cancelled` in the BigQuery registry (an appended event, nothing is deleted): the tables that have not ended, or the ones named.

    python scripts/cancel_live_tables.py [--reason "text"] [E4 E6 ...]

Needs credentials (`gcloud auth application-default login`). The Table Durable Object of a cancelled table is deleted separately (`HttpKeeper.finalize`).
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from ark_nova.live import registry as reg  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("tables", nargs="*")
    ap.add_argument("--reason", default="cancelled: the live tables were cleaned up")
    a = ap.parse_args()
    bq = reg.BigQueryRegistry()
    if a.tables:
        ids = a.tables
    else:
        rows = bq.client.query(f"SELECT table_id FROM `{bq.project}.{bq.dataset}.{reg.VIEW}` WHERE status NOT IN UNNEST(@f) ORDER BY table_number",
                               job_config=bq.bq.QueryJobConfig(query_parameters=[bq.bq.ArrayQueryParameter("f", "STRING", list(reg.FINAL))])).result()
        ids = [r["table_id"] for r in rows]
    for t in ids:
        last = bq.latest(t)
        if last is None:
            print(t, "not in the registry")
            continue
        row = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in last.items() if v is not None and v != []}
        now = time.time()
        row.update({"event_seq": int(last["event_seq"]) + 1, "event_at": reg._ts(now * 1000), "status": "cancelled", "end_reason": a.reason, "ended_at": reg._ts(now * 1000)})
        bq.append(row)
        print(t, last["status"], "-> cancelled")


if __name__ == "__main__":
    main()
