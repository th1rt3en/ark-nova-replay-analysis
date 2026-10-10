-- Who's ahead: the tables a puzzle may come from. Edit the filters here (docs/accounts_plan.md, "Daily rollover and picking the table"); it ships with the code, so redeploy Cloud Run after a change.
-- Parameters: @exclude = the table ids this game has already used, @k = how many candidates to return. Must return `table_id` rows in random order, at most @k.
-- For now: a table with two players, no concession, and a log in GCS that this game has not used yet.
SELECT s.table_id
FROM `freestyle-190711.ark_nova.all_games_stat` AS s
WHERE CAST(s.table_id AS STRING) IN (SELECT table_id FROM `freestyle-190711.ark_nova_processing.logs_archive_mapping`)
  AND s.table_id NOT IN UNNEST(@exclude)
GROUP BY s.table_id
HAVING COUNT(*) = 2 AND MAX(COALESCE(s.concede, 0)) = 0
ORDER BY RAND()
LIMIT @k
