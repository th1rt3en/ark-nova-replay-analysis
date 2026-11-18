"""Test options shared by the whole suite.

  pytest -n auto            everyday run: the fast tests, the sweeps over a fixed subset of the logs (tests/_logsel.py), on every CPU (pytest-xdist)
  pytest --full -n auto     everything: every log in log_examples/ and the tests marked `slow`
"""
import os


def pytest_addoption(parser):
    parser.addoption("--full", action="store_true", default=False, help="run all the logs of log_examples/ and the tests marked slow")


def pytest_configure(config):
    if config.getoption("--full"):
        os.environ["ARK_FULL_LOGS"] = "1"          # (read by tests/_logsel.py when the test modules are imported; the xdist workers inherit it)


def pytest_collection_modifyitems(config, items):
    if config.getoption("--full") or config.getoption("-m"):
        return
    slow = [i for i in items if i.get_closest_marker("slow")]
    if slow:
        config.hook.pytest_deselected(items=slow)
        items[:] = [i for i in items if not i.get_closest_marker("slow")]
