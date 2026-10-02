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

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            bq_table=os.environ.get("BQ_TABLE", DEFAULT_BQ_TABLE),
            bq_logs_table=os.environ.get("BQ_LOGS_TABLE", DEFAULT_BQ_LOGS_TABLE),
            gcs_bucket=os.environ.get("GCS_BUCKET", DEFAULT_GCS_BUCKET),
            rate_limit_enabled=_flag("RATE_LIMIT_ENABLED", False),
            rate_limit_per_minute=int(os.environ.get("RATE_LIMIT_PER_MINUTE", "60")),
        )
