import logging

import pandas as pd

from tradingagents.dataflows.market.utils import save_output


def test_save_output_writes_csv_and_logs_without_stdout(tmp_path, caplog, capsys):
    output_path = tmp_path / "prices.csv"

    with caplog.at_level(logging.INFO, logger="tradingagents.dataflows.market.utils"):
        save_output(pd.DataFrame({"price": [123.45]}), "prices", str(output_path))

    assert pd.read_csv(output_path)["price"].tolist() == [123.45]
    assert f"prices saved to {output_path}" in caplog.text
    assert capsys.readouterr().out == ""
