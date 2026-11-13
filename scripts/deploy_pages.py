"""Deploy the static site (web/) to Cloudflare Pages, with the /api/* proxy function from pages/ (needs node, cloudflare/.env with the API token).

    python scripts/deploy_pages.py [--project ark-nova] [--branch main]

web/ is copied to a temp folder next to pages/_headers and pages/_routes.json, so Cloud Run's own copy of web/ stays free of them. The first run
needs the Pages project (`wrangler pages project create ark-nova --production-branch main`) with the variable CLOUD_RUN_URL set to the Cloud Run
service URL (the same value as in cloudflare/wrangler.jsonc).
"""
import argparse
import json
import os
import re
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


# The live site (the production branch) shows only the replay and the fork: every other feature is "coming soon" in the copy that is uploaded. The API switches the same
# features off with DISABLED_FEATURES on Cloud Run (src/ark_nova/config.py). The repository keeps every page: develop shows them all.
PRODUCTION_BRANCH = "main"
COMING_SOON = {                                             # standalone page -> (title, text)
    "play.html": ("Play a live game", "Playing a live game against a friend is coming soon."),
    "lobbies.html": ("Custom games", "Custom games and their lobbies are coming soon."),
    "lobby.html": ("Custom game lobby", "Custom games and their lobbies are coming soon."),
    "sandbox.html": ("Sandbox mode", "The sandbox is coming soon."),
    "minigames/index.html": ("Mini games", "The daily mini games are coming soon."),
    "minigames/daily_hand.html": ("Daily starting hand", "The daily starting hand puzzle is coming soon."),
    "minigames/whos_ahead.html": ("Who's ahead", "The Who's ahead puzzle is coming soon."),
    "profile.html": ("Player profile", "Player profiles are coming soon."),
    "ratings.html": ("Ratings", "The ratings board is coming soon."),
    "end.html": ("Game result", "The results of live games are coming soon."),
    "map_editor.html": ("Map editor", "The map editor is coming soon."),
    "planning.html": ("Planning", "This page is coming soon."),
    "fork.html": ("Fork", "Forking a position and playing it on is coming soon."),            # (the Fork button of the replay is paled out too: soon_fork)
    "library/index.html": ("Library", "The card library is coming soon."),
    "library/cards/index.html": ("Card library", "The card library is coming soon."),
    "library/actions/index.html": ("Action card library", "The action card library is coming soon."),
}
START_COMING_SOON = ["custom", "sandbox", "mini", "editor", "library"]    # the options of the start page (landing.js) that are coming soon on the production site
LANDING_SCRIPT = '<script type="module" src="/js/landing.js"></script>'


def coming_soon(site: Path) -> None:
    """The production copy: the pages of the features that are switched off say so; the start page marks its options as coming soon (window.ARK_COMING_SOON, read by landing.js)."""
    template = (ROOT / "pages" / "coming-soon.html").read_text(encoding="utf-8")
    for name, (title, text) in COMING_SOON.items():
        (site / name).write_text(template.replace("{{TITLE}}", title).replace("{{TEXT}}", text), encoding="utf-8")
    for page in site.rglob("*.html"):                       # the logo of the viewer pages leads to the start page (the park) only in the develop copy: here it is a plain picture
        text = page.read_text(encoding="utf-8")
        plain = re.sub(r'<a class="brand" href="/"[^>]*>(.*?)</a>', r'<span class="brand">\1</span>', text, flags=re.S)
        if plain != text:
            page.write_text(plain, encoding="utf-8")
    index = site / "index.html"
    html = index.read_text(encoding="utf-8")
    assert html.count(LANDING_SCRIPT) == 1, "start page: the landing script not found"
    html = html.replace(LANDING_SCRIPT, '<script>window.ARK_COMING_SOON = ' + json.dumps(START_COMING_SOON) + ';</script>' + chr(10) + LANDING_SCRIPT)
    index.write_text(html, encoding="utf-8")
    soon_fork(site)


# Fork is coming soon on the live site: the button is paled out and a tooltip (the "Night" look: near-black, light outline, orange label) opens on hover. The page keeps the working
# button in the repository and in develop; only the production copy is changed here. main.js switches `disabled` of #fork on every render, so the button is wrapped and cannot be clicked
# (pointer-events: none, no tab stop) instead of relying on that attribute.
FORK_BUTTON = re.compile(r'<button id="fork" class="forkbtn"[^>]*>Fork</button>')
FORK_TIP = "<b>Soon:</b> Fork this position and play it for both sides from here"
FORK_CSS = """<style>
.soonwrap { position: relative; display: inline-flex; order: 3; }
.soonwrap .forkbtn { opacity: .45; pointer-events: none; cursor: default; }
.soonwrap .soontip { position: absolute; top: calc(100% + 12px); right: 0; width: 236px; box-sizing: border-box; padding: 10px 14px; border-radius: 10px; text-align: left; white-space: normal;
  background: #0F1B1F; color: #D8E6E8; border: 2px solid #F1F5F6; box-shadow: 0 0 0 1.5px #0F1B1F, 0 6px 16px rgba(0,0,0,.5); font: 500 14px/1.35 'Barlow', system-ui, sans-serif;
  z-index: 50; opacity: 0; transform: translateY(-4px); pointer-events: none; transition: opacity .12s, transform .12s; }
.soonwrap .soontip::before { content: ''; position: absolute; top: -8px; right: 22px; width: 12px; height: 12px; transform: rotate(45deg); background: #0F1B1F; border-left: 2px solid #F1F5F6; border-top: 2px solid #F1F5F6; border-radius: 2px 0 0 0; }
.soonwrap .soontip b { font: 700 12.5px 'Park Label', 'Barlow', system-ui, sans-serif; color: #EE6C2B; text-transform: uppercase; letter-spacing: .08em; }
.soonwrap:hover .soontip { opacity: 1; transform: none; }
</style>
"""


def soon_fork(site: Path) -> None:
    """The production copy of replay.html: Fork paled out with its "Soon" tooltip."""
    page = site / "replay.html"
    text = page.read_text(encoding="utf-8")
    assert len(FORK_BUTTON.findall(text)) == 1, "replay.html: the Fork button not found"
    text = FORK_BUTTON.sub(lambda m: '<span class="soonwrap">' + re.sub(r' title="[^"]*"', "", m.group(0)).replace("<button ", '<button tabindex="-1" aria-disabled="true" ', 1)
                           + '<span class="soontip" role="tooltip">' + FORK_TIP + "</span></span>", text)
    assert text.count("</head>") == 1, "replay.html: </head> not found"
    page.write_text(text.replace("</head>", FORK_CSS + "</head>"), encoding="utf-8")


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
        if args.branch == PRODUCTION_BRANCH:
            coming_soon(site)
        subprocess.run([wrangler, "pages", "deploy", str(site), "--project-name", args.project, "--branch", args.branch, "--commit-dirty=true"],
                       env=env, cwd=ROOT / "pages", check=True)


if __name__ == "__main__":
    main()
