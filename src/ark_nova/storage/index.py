"""Log index lookup (BigQuery `table_logs`). Only the interface and a not-configured default exist so far."""
from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class LoggedTable:
    table_id: int
    gcs_path: str
    player_maps: dict[str, str] = field(default_factory=dict)  # BGA player id -> map id ('1', '3a', 'T1', ...)
    marine_worlds: bool = False


class TableIndex(Protocol):
    def find(self, table_id: int) -> LoggedTable | None: ...


class NotConfiguredIndex:
    """Default until BigQuery is wired in: every table is 'not logged'."""

    def find(self, table_id: int) -> LoggedTable | None:
        return None
