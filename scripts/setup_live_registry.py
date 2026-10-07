"""Create the BigQuery objects of the live table registry (idempotent): dataset `ark_nova_engine`, the append-only table `live_table_events` and the view `live_tables`.

    python scripts/setup_live_registry.py [--project freestyle-190711] [--dataset ark_nova_engine]

Needs `google-cloud-bigquery` and credentials (`gcloud auth application-default login`). See docs/live_game_plan.md 9.2.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from ark_nova.live.registry import DATASET, PROJECT, BigQueryRegistry  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=PROJECT)
    ap.add_argument("--dataset", default=DATASET)
    a = ap.parse_args()
    reg = BigQueryRegistry(a.project, a.dataset)
    reg.ensure()
    print(f"ready: {reg.events_table} and the view {a.project}.{a.dataset}.live_tables")


if __name__ == "__main__":
    main()
