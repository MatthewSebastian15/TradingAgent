from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "idx_golden"

TARGETS = {
    "price": 95,
    "fundamental": 80,
    "news": 85,
    "valuation": 70,
    "risk": 80,
}

VALID_DIVIDEND_STATUSES = {
    "available",
    "no_dividend_history",
    "not_applicable_negative_earnings",
    "source_unavailable",
}


def _fixtures() -> list[dict[str, Any]]:
    return [
        json.loads(path.read_text(encoding="utf-8")) for path in sorted(FIXTURE_DIR.glob("*.json"))
    ]


def test_idx_payloads_meet_minimum_acceptance_without_live_api():
    assert _fixtures(), "IDX golden fixtures are required for acceptance tests"
    for fixture in _fixtures():
        payload: dict[str, Any] = fixture["mock_payload"]
        quality = payload["data_quality_summary"]
        for area, minimum in TARGETS.items():
            assert quality[area] >= minimum, (
                f"{fixture['ticker']} {area} quality dropped below {minimum}"
            )

        dividend_status = payload.get("fundamental", {}).get("dividend_status")
        assert dividend_status in VALID_DIVIDEND_STATUSES
