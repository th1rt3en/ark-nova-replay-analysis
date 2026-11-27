"""The production copy of the static site (scripts/deploy_pages.py): while ONLY_REPLAY is on (owner, 2026-11-27) only the extension's way in (import.html) and the
replay are shown; every other page, the start page included, is the plain hidden page."""
import importlib.util
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _deploy():
    spec = importlib.util.spec_from_file_location("deploy_pages", ROOT / "scripts" / "deploy_pages.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_production_shows_only_the_replay_and_the_import_page(tmp_path):
    d = _deploy()
    assert d.ONLY_REPLAY and d.PUBLIC_PAGES == {"replay.html", "import.html"}
    site = tmp_path / "site"
    for name in [p.relative_to(ROOT / "web").as_posix() for p in (ROOT / "web").rglob("*.html")]:
        (site / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / "web" / name, site / name)
    d.only_replay(site)
    hidden = (ROOT / "pages" / "hidden.html").read_text(encoding="utf-8")
    assert "href=\"/" not in hidden.replace('href="/brand/', "").replace('href="/style.css"', "")       # (no way on from the hidden page)
    for page in site.rglob("*.html"):
        name = page.relative_to(site).as_posix()
        text = page.read_text(encoding="utf-8")
        if name in d.PUBLIC_PAGES:
            assert text != hidden and '<a class="brand" href="/"' not in text, name
        else:
            assert text == hidden, name
    replay = (site / "replay.html").read_text(encoding="utf-8")
    assert 'class="soonwrap"' in replay                                                  # Fork stays paled out
    assert (site / "index.html").read_text(encoding="utf-8") == hidden
