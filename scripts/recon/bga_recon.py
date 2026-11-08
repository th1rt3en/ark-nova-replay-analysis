"""Recon on BGA's pages for the browser extension: logs in (once), opens the review and replay pages of some tables and saves what the extension would read.

Run it with the system python (needs `pip install playwright` and `python -m playwright install chromium`):

    python scripts/recon/bga_recon.py 123456789:rated 987654321:friendly

Each argument is a table id, optionally `:label` (rated / friendly / anything: only a folder name part). Options:
    --out DIR        where to save (default build/recon)
    --profile DIR    the browser profile that keeps the BGA login (default build/recon_profile, never commit it)
    --players N      replay pages to open per table (default 2: each player's own replay page may differ)
    --wait SECONDS   how long to wait for the game to appear on a replay page (default 40)

The first run opens a browser window: log in to BGA there by hand (the script waits for you and presses on when you hit Enter in the terminal). The login stays in the profile
folder, so the next runs go straight on. Nothing is sent anywhere; the password is never read by this script.

For every table <out>/<table>_<label>/ gets:
    review.html, review.png      the game review page (gamereview?table=)
    review_links.json            the replay links found on it (div.playerselection)
    replay_<n>.json              the recon report (scripts/recon/bga_replay_elo.js) of the replay page, of its main page and of every frame separately
    replay_<n>_<frame>.html      the HTML of the main page and of each frame (the game lives in one)
    replay_<n>.png               a screenshot
Send the folders (zip them) back; the numbers and ids in them are public game data.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BGA = "https://boardgamearena.com"
RECON_JS = (HERE / "bga_replay_elo.js").read_text(encoding="utf-8")


def slug(text):
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")[:60] or "frame"


def save_json(path, data):
    path.write_text(json.dumps(data, indent=4, ensure_ascii=False), encoding="utf-8")


def logged_in(page):
    """True when the page shows a logged-in BGA user (its own data says who)."""
    try:
        return bool(page.evaluate("() => !!(window.globalUserInfos && window.globalUserInfos.is_logged) "
                                  "|| !!document.querySelector('#connected_username, .bga-user-menu, #pageheader_user')"))
    except Exception:
        return False


def ensure_login(page):
    page.goto(BGA + "/account", wait_until="domcontentloaded")
    page.wait_for_timeout(3000)
    if logged_in(page):
        print("logged in")
        return
    print("\nLog in to BGA in the browser window, then press Enter here.")
    input()
    page.goto(BGA + "/account", wait_until="domcontentloaded")
    page.wait_for_timeout(2000)
    print("logged in" if logged_in(page) else "could not tell whether you are logged in; going on anyway")


def run_recon(target):
    try:
        return target.evaluate(RECON_JS)
    except Exception as e:  # a frame that is gone or cannot run scripts
        return {"error": str(e)}


def wait_for_game(page, seconds):
    """Wait until a zoo board or a player panel is in the page or one of its frames."""
    probe = "() => !!document.querySelector('.zoo-map-board-background, [id^=\"player_board_\"], [id^=\"overall_player_board_\"]')"
    end = time.time() + seconds
    while time.time() < end:
        for frame in page.frames:
            try:
                if frame.evaluate(probe):
                    page.wait_for_timeout(4000)           # (the Elo and the boards are drawn a little later)
                    return True
            except Exception:
                pass
        page.wait_for_timeout(1000)
    return False


def do_table(context, table, label, args, out_root):
    out = out_root / f"{table}_{slug(label)}"
    out.mkdir(parents=True, exist_ok=True)
    page = context.new_page()
    print(f"[{table}] review page")
    page.goto(f"{BGA}/gamereview?table={table}", wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    (out / "review.html").write_text(page.content(), encoding="utf-8")
    page.screenshot(path=str(out / "review.png"), full_page=True)
    links = page.evaluate("""() => [...document.querySelectorAll('a[href*="/archive/replay/"]')]
        .map((a) => ({ href: new URL(a.getAttribute('href'), location.href).href, text: (a.textContent || '').trim().slice(0, 60),
                       inPlayerselection: !!a.closest('.playerselection') }))""")
    save_json(out / "review_links.json", links)
    urls = []
    for link in links:
        if link["href"] not in urls:
            urls.append(link["href"])
    print(f"[{table}] {len(urls)} replay link(s)")
    if not urls:
        print(f"[{table}] no replay link on the review page (see review.html); is the table id right and are you logged in?")
    for n, url in enumerate(urls[: args.players], start=1):
        print(f"[{table}] replay page {n}: {url}")
        rp = context.new_page()
        rp.goto(url, wait_until="domcontentloaded")
        shown = wait_for_game(rp, args.wait)
        print(f"[{table}]   game {'on screen' if shown else 'NOT seen within the wait (saving what is there)'}")
        reports = {"url": url, "game_seen": shown, "top": run_recon(rp), "frames": []}
        for i, frame in enumerate(rp.frames):
            name = "main" if frame == rp.main_frame else f"{i}_{slug(frame.url.split('?')[0].rsplit('/', 1)[-1])}"
            try:
                (out / f"replay_{n}_{name}.html").write_text(frame.content(), encoding="utf-8")
            except Exception as e:
                print(f"[{table}]   frame {name}: no html ({e})")
            if frame != rp.main_frame:
                reports["frames"].append({"name": name, "url": frame.url, "report": run_recon(frame)})
        save_json(out / f"replay_{n}.json", reports)
        rp.screenshot(path=str(out / f"replay_{n}.png"), full_page=False)
        rp.close()
    page.close()
    print(f"[{table}] saved in {out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tables", nargs="+", help="table id, optionally :label (rated / friendly)")
    ap.add_argument("--out", default=str(ROOT / "build" / "recon"))
    ap.add_argument("--profile", default=str(ROOT / "build" / "recon_profile"))
    ap.add_argument("--players", type=int, default=2)
    ap.add_argument("--wait", type=int, default=40)
    args = ap.parse_args()
    tables = []
    for item in args.tables:
        table, _, label = item.partition(":")
        if not table.isdigit():
            sys.exit(f"not a table id: {item}")
        tables.append((table, label or "table"))
    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(args.profile, headless=False, viewport={"width": 1600, "height": 1000})
        ensure_login(context.pages[0] if context.pages else context.new_page())
        for table, label in tables:
            try:
                do_table(context, table, label, args, out_root)
            except Exception as e:
                print(f"[{table}] failed: {e}")
        context.close()
    print(f"\nDone. Zip the folders in {out_root} and send them.")


if __name__ == "__main__":
    main()
