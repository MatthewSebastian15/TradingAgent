from __future__ import annotations

from tradingagents.dataflows.validators import (
    validate_fundamental_consistency,
    validate_price_consistency,
    validate_volume_consistency,
)


def test_price_volume_and_fundamental_conflicts():
    assert validate_price_consistency({"a": 100, "b": 104})
    assert validate_volume_consistency({"a": 1_000, "b": 1_300})
    assert validate_fundamental_consistency("revenue", {"a": 100, "b": 107})
