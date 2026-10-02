"""Pull a BGA table id out of what the user typed: a bare id or a boardgamearena.com URL with `?table=<id>`."""
import re
from urllib.parse import parse_qs, urlparse

_ID = re.compile(r"^\d{1,12}$")


def parse_table_id(text: str) -> int | None:
    text = text.strip()
    if _ID.match(text):
        return int(text)
    if "://" not in text:
        text = "https://" + text
    url = urlparse(text)
    host = (url.hostname or "").lower()
    if not (host == "boardgamearena.com" or host.endswith(".boardgamearena.com")):
        return None
    # the query can sit behind the SPA fragment: /#!table?table=123
    for query in (url.query, url.fragment.partition("?")[2]):
        for value in parse_qs(query).get("table", []):
            if _ID.match(value):
                return int(value)
    return None
