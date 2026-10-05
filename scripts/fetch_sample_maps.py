"""Fetch the players' maps (and the Marine Worlds flag) of the tables in log_examples/ from the BigQuery index into data_manual/sample_maps.json.

The viewer gets them from the index at runtime (storage/index.py); the offline harness (engine_coverage etc.) reads this file instead of guessing
them from the logs. Needs the `gcp` extra and gcloud application default credentials. Run with the venv python.
"""
import json
import sys
from pathlib import Path

from google.cloud import bigquery

from ark_nova.config import Settings
from ark_nova.storage.index import map_id

ROOT = Path(__file__).resolve().parents[1]
ids = sorted(int(p.stem) for p in (ROOT / "log_examples").glob("*.json") if p.stem.isdigit())
client = bigquery.Client()
cfg = bigquery.QueryJobConfig(query_parameters=[bigquery.ArrayQueryParameter("ids", "INT64", ids)])
rows = client.query(f"SELECT table_id, player_id, map, is_mw FROM `{Settings.from_env().bq_table}` WHERE table_id IN UNNEST(@ids)", job_config=cfg).result()
out: dict = {}
for r in rows:
    t = out.setdefault(str(r["table_id"]), {"marine_worlds": False, "maps": {}})
    t["maps"][str(r["player_id"])] = map_id(str(r["map"]))
    t["marine_worlds"] = t["marine_worlds"] or bool(r["is_mw"])
(ROOT / "data_manual" / "sample_maps.json").write_text(json.dumps(out, indent=4, sort_keys=True) + "\n")
print(f"{len(out)} of {len(ids)} tables indexed", file=sys.stderr)
from quarantine_unsupported_maps import quarantine  # noqa: E402  (beginner maps without geometry: move their logs out of log_examples/)

for table, maps in quarantine():
    print(f"{table}: map {', '.join(maps)} is not supported yet, moved to log_examples_unsupported/", file=sys.stderr)
