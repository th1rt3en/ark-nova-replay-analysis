"""Adds the column `peaceful` (BOOL, NULL = not known) to the BigQuery appendix table of the logs the extension brings (UPLOAD_BQ_TABLE): BGA's "Peaceful mode" option (103)
from the table info. Rows from before have NULL. Run it BEFORE the code that writes the column is deployed (the insert of a row with an unknown column is refused).
Usage: python scripts/add_peaceful_column.py [--table freestyle-190711.ark_nova.base_projects_appendix] [--dry-run]"""
import argparse

DEFAULT = "freestyle-190711.ark_nova.base_projects_appendix"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", default=DEFAULT)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    sql = f"ALTER TABLE `{args.table}` ADD COLUMN IF NOT EXISTS peaceful BOOL"
    print(sql)
    if args.dry_run:
        return
    from google.cloud import bigquery

    bigquery.Client().query(sql).result()
    print("done")


if __name__ == "__main__":
    main()
