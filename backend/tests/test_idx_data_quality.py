from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "idx_golden"


def _fixtures() -> list[dict[str, Any]]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(FIXTURE_DIR.glob("*.json"))]


def _value(payload: dict[str, Any], key: str) -> Any:
    current: Any = payload
    for part in key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def assert_expected_field(value: Any, rule: str) -> None:
    if rule == "not_null":
        assert value not in (None, "", [], {})
    elif rule == "valid_percentage":
        assert value is None or isinstance(value, (int, float))
    elif rule == "list_not_empty":
        assert isinstance(value, list) and len(value) > 0
    elif rule.startswith(">="):
        threshold = int(rule.split(">=", 1)[1].strip())
        assert value >= threshold
    else:  # pragma: no cover - catches fixture authoring mistakes
        raise AssertionError(f"Unknown golden fixture rule: {rule}")


def test_idx_golden_fixture_folder_has_required_tickers():
    tickers = {fixture["ticker"] for fixture in _fixtures()}
    assert {"BBCA.JK", "BBRI.JK", "TLKM.JK", "ASII.JK", "ANTM.JK", "UNTR.JK", "GOTO.JK"} <= tickers


def test_idx_golden_expected_fields_are_present_without_live_api():
    for fixture in _fixtures():
        payload = fixture["mock_payload"]
        for field, rule in fixture["expected_fields"].items():
            assert_expected_field(_value(payload, field), rule)
