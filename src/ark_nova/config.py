"""Runtime configuration, read from environment variables (Cloud Run friendly)."""
import os
from dataclasses import dataclass


DEFAULT_BQ_TABLE = "freestyle-190711.ark_nova.all_games_stat"
DEFAULT_BQ_LOGS_TABLE = "freestyle-190711.ark_nova_processing.logs_archive_mapping"
DEFAULT_GCS_BUCKET = "temp-common-storage"


def _flag(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    bq_table: str = DEFAULT_BQ_TABLE  # indexed games, e.g. freestyle-190711.ark_nova.all_games_stat (table_id, player_id, map)
    bq_logs_table: str = DEFAULT_BQ_LOGS_TABLE  # e.g. freestyle-190711.ark_nova_processing.logs_archive_mapping (table_id, file_name)
    gcs_bucket: str = DEFAULT_GCS_BUCKET  # raw BGA logs, e.g. temp-common-storage
    rate_limit_enabled: bool = False  # hook exists but nothing is limited yet
    rate_limit_per_minute: int = 60
    cache_mb: int = 256  # memory kept for raw logs and built replays (the rest of what was read stays in files)
    cache_dir: str = ""  # where the files go; empty = a folder in the temp directory, "off" = no files
    cache_disk_mb: int = 2048  # the most the files may take (the least recently used go first)
    live_keeper_url: str = ""  # the Cloudflare Worker of the live games (cloudflare/); empty = the live game routes are off
    internal_secret: str = ""  # signs the calls to it (the Worker's INTERNAL_SECRET)
    live_bq_project: str = "freestyle-190711"  # the registry of the live tables (docs/live_game_plan.md 9.2): dataset ark_nova_engine, table live_table_events, view live_tables
    live_bq_dataset: str = "ark_nova_engine"
    turnstile_site_key: str = ""  # Cloudflare Turnstile on the signup form (empty = no check)
    turnstile_secret: str = ""
    store_backend: str = ""  # "d1": the accounts and the mini games live in Cloudflare D1 through the Worker (LIVE_KEEPER_URL + INTERNAL_SECRET); empty: see ACCOUNTS_DB / MINIGAMES_DB
    accounts_db: str = ""  # a SQLite file for the accounts; empty = the accounts are off (an in-memory store would lose every account on a restart; the production store is D1)
    bga_seed_table: str = "freestyle-190711.ark_nova.bga_player_elo"  # the BGA players and their latest Elo (scripts/setup_bga_player_elo.py)
    allowed_origins: str = "https://ark-nova.pages.dev,https://engine.emufriends.pet"  # sites whose browsers may post to /api/auth (besides the request's own host)
    minigames_db: str = ""  # a SQLite file for the mini games' puzzles and submissions; empty = in memory (lost on restart: the production store is D1, written with the accounts)
    live_gcs_bucket: str = "temp-common-storage"  # where the records of finished / conceded games go (live/<yyyy>/<mm>/E12.json.gz); empty = nothing is exported and the keeper keeps the tables

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            bq_table=os.environ.get("BQ_TABLE", DEFAULT_BQ_TABLE),
            bq_logs_table=os.environ.get("BQ_LOGS_TABLE", DEFAULT_BQ_LOGS_TABLE),
            gcs_bucket=os.environ.get("GCS_BUCKET", DEFAULT_GCS_BUCKET),
            rate_limit_enabled=_flag("RATE_LIMIT_ENABLED", False),
            rate_limit_per_minute=int(os.environ.get("RATE_LIMIT_PER_MINUTE", "60")),
            cache_mb=int(os.environ.get("CACHE_MB", "256")),
            cache_dir=os.environ.get("CACHE_DIR", ""),
            cache_disk_mb=int(os.environ.get("CACHE_DISK_MB", "2048")),
            live_keeper_url=os.environ.get("LIVE_KEEPER_URL", ""),
            internal_secret=os.environ.get("INTERNAL_SECRET", ""),
            live_bq_project=os.environ.get("LIVE_BQ_PROJECT", "freestyle-190711"),
            live_bq_dataset=os.environ.get("LIVE_BQ_DATASET", "ark_nova_engine"),
            live_gcs_bucket=os.environ.get("LIVE_GCS_BUCKET", "temp-common-storage"),
            turnstile_site_key=os.environ.get("TURNSTILE_SITE_KEY", ""),
            turnstile_secret=os.environ.get("TURNSTILE_SECRET", ""),
            store_backend=os.environ.get("STORE_BACKEND", "").strip().lower(),
            accounts_db=os.environ.get("ACCOUNTS_DB", ""),
            bga_seed_table=os.environ.get("BGA_SEED_TABLE", "freestyle-190711.ark_nova.bga_player_elo"),
            allowed_origins=os.environ.get("ALLOWED_ORIGINS", "https://ark-nova.pages.dev,https://engine.emufriends.pet"),
            minigames_db=os.environ.get("MINIGAMES_DB", ""),
        )
