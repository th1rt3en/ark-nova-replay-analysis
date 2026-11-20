"""Google Cloud Storage buckets with an optional billing project (Requester Pays).

`GCS_USER_PROJECT` (env, empty = off): the project that is billed for the requests when a bucket has Requester Pays on. Off, nothing is sent, so the calls are the same as before.
The caller (the Cloud Run service account) needs `serviceusage.services.use` on that project (e.g. roles/serviceusage.serviceUsageConsumer).
"""
import os


def user_project() -> str | None:
    return os.environ.get("GCS_USER_PROJECT") or None


def bucket(client, name: str):
    """`client.bucket(name)`, with the billing project when `GCS_USER_PROJECT` is set."""
    project = user_project()
    return client.bucket(name, user_project=project) if project else client.bucket(name)


def list_blobs(client, bucket_name: str, **kw):
    project = user_project()
    return client.list_blobs(bucket_name, user_project=project, **kw) if project else client.list_blobs(bucket_name, **kw)
