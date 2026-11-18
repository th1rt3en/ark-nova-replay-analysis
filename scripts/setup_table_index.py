"""Build the small, clustered copy of the stats rows that the replay reads for every table (`BigQueryIndex`, env `BQ_INDEX_TABLE`).

    python scripts/setup_table_index.py [--dry-run] [--table freestyle-190711.ark_nova.table_index]

`all_games_stat` is a view over `all_games_stat_raw` (a window function and a self-join), so a lookup of one `table_id` is billed for the whole raw table (about 450 MB)
however selective the filter is. This table has one row per (table, player) with only the columns the app reads and is clustered by `table_id`: a lookup reads a few KB.
It replaces the table, so it can run as a BigQuery scheduled query (the SQL below is the query; every 6 hours is plenty; about 640 MB per run without `--with-options`: the copy only has to be fresh for finished games,
a table that is not in it yet is still looked up in the view while its id is recent, see `BigQueryIndex.MISS_WINDOW`). With `--dry-run` it only reports what the query would read.
Needs credentials (`gcloud auth application-default login`). Then set `BQ_INDEX_TABLE` on Cloud Run (`--update-env-vars BQ_INDEX_TABLE=<the table>`); without it the app reads the view.
"""
import argparse

SOURCE = "freestyle-190711.ark_nova.all_games_stat"
RAW = "freestyle-190711.ark_nova.all_games_stat_raw"
SQL = """
CREATE OR REPLACE TABLE `{table}`
CLUSTER BY table_id AS
{options_cte}
SELECT
  v.table_id,
  v.player_id,
  v.Map AS map,
  v.is_mw,
  v.elo,
  v.Thinking_time AS thinking_time,
  v.pre_match_elo,
  v.post_match_elo,
  v.pre_match_arena_rating,
  {peaceful} AS peaceful_option,
  v.processed_at,
  CURRENT_TIMESTAMP() AS as_of
FROM `{source}` AS v
{options_join}
"""
OPTIONS_CTE = """WITH options AS (
  SELECT table_id, player_id, JSON_VALUE(options, '$."103".value') AS peaceful_option
  FROM `{raw}`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY table_id, player_id ORDER BY processed_at DESC) = 1
)"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", default="freestyle-190711.ark_nova.table_index")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--with-options", action="store_true", help="also read BGA's Peaceful mode option from the raw table's `options` column (reads about 1.9 GB more per run; "
                    "the app falls back to the extension's table info and the log when it is empty)")
    a = ap.parse_args()
    from google.cloud import bigquery

    client = bigquery.Client()
    sql = SQL.format(table=a.table, source=SOURCE,
                     options_cte=OPTIONS_CTE.format(raw=RAW) if a.with_options else "",
                     peaceful="o.peaceful_option" if a.with_options else "CAST(NULL AS STRING)",
                     options_join="LEFT JOIN options AS o USING (table_id, player_id)" if a.with_options else "")
    job = client.query(sql, job_config=bigquery.QueryJobConfig(dry_run=a.dry_run))
    if a.dry_run:
        print(f"dry run: the query would read {job.total_bytes_processed / 1e6:.0f} MB and write {a.table}")
        return
    job.result()
    row = next(iter(client.query(f"SELECT COUNT(*) n, MAX(table_id) newest FROM `{a.table}`").result()))
    print(f"{a.table}: {row['n']} rows, newest table {row['newest']}")


if __name__ == "__main__":
    main()
