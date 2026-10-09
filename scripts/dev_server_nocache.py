"""Local development only (not part of the live site): the same server as dev_server.py, but the browser is told never to keep a copy of the page, script and stylesheet
files, so a normal reload (F5) always shows the latest frontend files - no Ctrl+Shift+R needed.

Usage: python scripts/dev_server_nocache.py [--port 8000]   (what `Start Ark Nova.bat` runs)
"""
import argparse
import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dev_server import build_app  # noqa: E402

NO_CACHE_SUFFIXES = (".html", ".js", ".css", ".json")


def build_nocache_app():
    app = build_app()

    @app.middleware("http")
    async def no_cache(request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.endswith(NO_CACHE_SUFFIXES):
            if not path.startswith("/api/"):
                response.headers["Cache-Control"] = "no-store"
        return response

    return app


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    uvicorn.run(build_nocache_app(), host=args.host, port=args.port)
