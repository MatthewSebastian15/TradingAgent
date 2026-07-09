"""Golden-file parity: the Python engine side of the quant math contract.

The JS mirror is frontend/src/components/results/tabs/quantUtils.parity.test.js.
Both consume tests/fixtures/quant_parity.json, so a formula change on either
side fails exactly one suite instead of silently diverging (audit DUP-001).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tradingagents.dataflows.market.technical_calculator import annualized_volatility_value
from tradingagents.risk.market_risk_builder import _max_drawdown

FIXTURE = Path(__file__).parent / "fixtures" / "quant_parity.json"


@pytest.fixture(scope="module")
def parity():
    return json.loads(FIXTURE.read_text())


def test_annualized_vol_matches_golden(parity):
    vol = annualized_volatility_value(parity["closes"]) * 100
    assert vol == pytest.approx(parity["expected"]["annualized_vol_percent"], abs=1e-9)


def test_max_drawdown_matches_golden(parity):
    dd = _max_drawdown(parity["closes"])
    assert dd == pytest.approx(parity["expected"]["max_drawdown_percent"], abs=1e-9)
