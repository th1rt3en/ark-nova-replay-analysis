"""Build the table of BGA players that a new account's Elo is copied from (docs/accounts_plan.md, "Signup and the BGA Elo copy").

    python scripts/setup_bga_player_elo.py [--dry-run] [--table freestyle-190711.ark_nova.bga_player_elo]

One row per (username, BGA player id): the latest `post_match_elo` and arena rating, the number of games and the date of the last one. Signup reads a few rows of this small
table instead of scanning the `all_games_stat` view (about 370 MB). It replaces the table, so it can run daily as a BigQuery scheduled query (the SQL below is the query);
with `--dry-run` it only reports what the query would read. Needs credentials (`gcloud auth application-default login`).
"""
import argparse

SOURCE = "freestyle-190711.ark_nova.all_games_stat"
SQL = """
CREATE OR REPLACE TABLE `{table}` AS
SELECT
  LOWER(player) AS player_lower,
  ANY_VALUE(player) AS player,
  CAST(player_id AS STRING) AS bga_player_id,
  COUNT(*) AS games,
  MAX(game_ended_at) AS last_game_at,
  ARRAY_AGG(post_match_elo ORDER BY game_ended_at DESC LIMIT 1)[OFFSET(0)] AS elo,
  ARRAY_AGG(post_match_arena_rating ORDER BY game_ended_at DESC LIMIT 1)[OFFSET(0)] AS arena_rating,
  CURRENT_TIMESTAMP() AS as_of
FROM `{source}`
WHERE post_match_elo IS NOT NULL AND player IS NOT NULL AND player_id IS NOT NULL
GROUP BY player_lower, player_id
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", default="freestyle-190711.ark_nova.bga_player_elo")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    from google.cloud import bigquery

    client = bigquery.Client()
    sql = SQL.format(table=a.table, source=SOURCE)
    job = client.query(sql, job_config=bigquery.QueryJobConfig(dry_run=a.dry_run))
    if a.dry_run:
        print(f"dry run: the query would read {job.total_bytes_processed / 1e6:.0f} MB and write {a.table}")
        return
    job.result()
    n = next(iter(client.query(f"SELECT COUNT(*) n FROM `{a.table}`").result()))["n"]
    print(f"{a.table}: {n} rows")


if __name__ == "__main__":
    main()
