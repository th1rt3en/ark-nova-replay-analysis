# Environments: production and develop

Two complete stacks. Nothing that writes is shared: production never sees develop data and develop never writes to production.

| Piece | Production | Develop |
|---|---|---|
| Git branch | `main` | `develop` (deployed from its own checkout, a git worktree) |
| Site | `ark-nova.pages.dev` (Pages production) | `develop.ark-nova.pages.dev` (Pages branch preview of the same project) |
| API | Cloud Run `ark-nova-replay-analysis` | Cloud Run `ark-nova-replay-analysis-dev` |
| Table keeper | Worker `ark-nova-live`, its Durable Objects, D1 `ark-nova-accounts` | Worker `ark-nova-live-dev` (`cloudflare/wrangler.dev.jsonc`), its own Durable Objects, D1 `ark-nova-accounts-dev` |
| Live registry | BigQuery `freestyle-190711.ark_nova_engine` | `freestyle-190711.ark_nova_engine_dev` |
| Live game archive | GCS `temp-common-storage/live/` | GCS `ark-nova-dev-live` |
| Identity | default compute service account | `ark-nova-dev@freestyle-190711.iam.gserviceaccount.com` |
| Internal secret | production `INTERNAL_SECRET` | its own (not in git, see below) |

## What develop may read
Read-only, shared with production: the BigQuery index (`ark_nova.all_games_stat`, `ark_nova_processing.logs_archive_mapping`, the BGA ratings seed) and the raw log bucket `temp-common-storage` (`GCS_BUCKET`). The develop service account has `bigquery.dataViewer` and `jobUser` on the project and `storage.objectViewer` on `temp-common-storage` only.

The only writes of the app go to the live archive bucket (`LIVE_GCS_BUCKET`) and the live registry dataset (`LIVE_BQ_DATASET`); develop points both at its own resources. The develop service account has write access to `ark_nova_engine_dev` and `ark-nova-dev-live` and to nothing else.

## Deploy develop
```
git worktree add ../ark-nova-develop develop        # once
cd ../ark-nova-develop && git pull                 # then:
# Cloud Run (env in the command: see the variables below)
gcloud run deploy ark-nova-replay-analysis-dev --source . --region us-central1 --max-instances 1 --min-instances 0 \
  --service-account ark-nova-dev@freestyle-190711.iam.gserviceaccount.com --allow-unauthenticated \
  --set-env-vars LIVE_KEEPER_URL=https://ark-nova-live-dev.tobiko11.workers.dev,INTERNAL_SECRET=<dev secret>,LIVE_GCS_BUCKET=ark-nova-dev-live,LIVE_BQ_DATASET=ark_nova_engine_dev,PAGES_URL=https://develop.ark-nova.pages.dev,ALLOWED_ORIGINS=https://develop.ark-nova.pages.dev,STORE_BACKEND=d1
# Worker (after a change under cloudflare/)
cd cloudflare && npx wrangler deploy -c wrangler.dev.jsonc
# Pages (site + the /api proxy)
python scripts/deploy_pages.py --branch develop
```
The Pages preview variable `CLOUD_RUN_URL` (the develop service URL) is set on the project's preview environment, not the production one.

## Secrets
Not in git. `INTERNAL_SECRET` of develop is in a local file outside the repository and was put into the Worker with `npx wrangler secret put INTERNAL_SECRET -c wrangler.dev.jsonc`. `cloudflare/.env` (the Cloudflare API token) is untracked: copy it into the worktree before `deploy_pages.py` runs there.

## Limits
Turnstile is off on develop (no develop site key), so signup works without the challenge. Develop shares the BGA index, so its tables are the production tables.
