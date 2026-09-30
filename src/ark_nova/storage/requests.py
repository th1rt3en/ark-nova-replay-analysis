"""Requests for tables that are not logged yet."""
import logging

log = logging.getLogger(__name__)


def request_log(table_id: int) -> None:
    # TODO: real mechanism (BigQuery `log_requests` insert, Pub/Sub topic for the downloader job, or Cloud Tasks).
    log.info("log requested for table %s (not persisted yet)", table_id)
