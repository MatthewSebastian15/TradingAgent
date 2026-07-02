"""Contract guard for services/report_disclaimer.py — the disclaimer is never removed."""

from __future__ import annotations

from services.report_disclaimer import REPORT_DISCLAIMER


def test_disclaimer_present_and_substantial():
    assert isinstance(REPORT_DISCLAIMER, str)
    assert len(REPORT_DISCLAIMER) > 1000
    for phrase in (
        "informational and educational purposes only",
        "does not constitute financial advice",
        "sole responsibility of the user",
        "not a substitute for independent research",
    ):
        assert phrase in REPORT_DISCLAIMER


def test_report_service_uses_same_disclaimer():
    import services.report_service as report_service

    assert report_service.REPORT_DISCLAIMER is REPORT_DISCLAIMER


def test_analysis_response_payload_uses_same_disclaimer():
    import routes.serializers_analysis as serializers

    assert serializers.REPORT_DISCLAIMER is REPORT_DISCLAIMER
