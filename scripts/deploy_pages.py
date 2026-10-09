"""Deploy the static site (web/) to Cloudflare Pages, with the /api/* proxy function from pages/ (needs node, cloudflare/.env with the API token).

    python scripts/deploy_pages.py [--project ark-nova] [--branch main]

web/ is copied to a temp folder next to pages/_headers and pages/_routes.json, so Cloud Run's own copy of web/ stays free of them. The first run
needs the Pages project (`wrangler pages project create ark-nova --production-branch main`) with the variable CLOUD_RUN_URL set to the Cloud Run
service URL (the same value as in cloudflare/wrangler.jsonc).
"""
import argparse
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CF = ROOT / "cloudflare"


def load_env() -> dict:
    env = dict(os.environ)
    for line in (CF / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    env["PATH"] = r"C:\Program Files\nodejs" + os.pathsep + env["PATH"]
    return env


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default="ark-nova")
    ap.add_argument("--branch", default="main")
    args = ap.parse_args()
    env = load_env()
    wrangler = str(CF / "node_modules" / ".bin" / ("wrangler.cmd" if os.name == "nt" else "wrangler"))
    with tempfile.TemporaryDirectory() as tmp:
        site = Path(tmp) / "site"
        shutil.copytree(ROOT / "web", site)
        for name in ("_headers", "_routes.json"):
            shutil.copy(ROOT / "pages" / name, site / name)
        subprocess.run([wrangler, "pages", "deploy", str(site), "--project-name", args.project, "--branch", args.branch, "--commit-dirty=true"],
                       env=env, cwd=ROOT / "pages", check=True)


if __name__ == "__main__":
    main()
