"""The table info of the extension gives the same Elo as the index (checked on table 607674960, indexed: `all_games_stat.elo`)."""
import json
from pathlib import Path

from ark_nova.storage.tableinfo import elos_from_tableinfo, table_id_of

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "tableinfos_607674960.json"


def test_the_elo_before_the_game_is_the_index_elo():
    info = json.loads(FIXTURE.read_text(encoding="utf-8"))["data"]
    assert table_id_of(info) == "607674960"
    assert elos_from_tableinfo(info) == {"95347471": 358, "89641657": 391}          # the index: tonyfire02 358, SylAce10 391
