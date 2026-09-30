"""Runtime configuration, read from environment variables (Cloud Run friendly)."""
import os
from dataclasses import dataclass


def _flag(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    bq_table: str = ""  # e.g. project.dataset.table_logs (log index: table_id, gcs_path, per-player map, marine_worlds, ...)
    gcs_bucket: str = ""  # raw BGA logs
    rate_limit_enabled: bool = False  # hook exists but nothing is limited yet
    rate_limit_per_minute: int = 60

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            bq_table=os.environ.get("BQ_TABLE", ""),
            gcs_bucket=os.environ.get("GCS_BUCKET", ""),
            rate_limit_enabled=_flag("RATE_LIMIT_ENABLED", False),
            rate_limit_per_minute=int(os.environ.get("RATE_LIMIT_PER_MINUTE", "60")),
        )
