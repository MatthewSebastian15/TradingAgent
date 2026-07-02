"""Unit tests for schemas.py — ADR-019: pipeline responses keep extra="allow"."""

from __future__ import annotations

import inspect

import pydantic
import pytest

import schemas
from schemas import AnalysisResponse, ApiSchema, MarketQuote


def _api_schema_subclasses() -> list[type[ApiSchema]]:
    return [
        obj
        for _, obj in inspect.getmembers(schemas, inspect.isclass)
        if issubclass(obj, ApiSchema) and obj is not ApiSchema
    ]


def test_every_public_schema_allows_extra_fields():
    # ADR-019: never extra="forbid" on pipeline responses.
    assert _api_schema_subclasses()  # sanity: reflection found the models
    for model in _api_schema_subclasses():
        assert model.model_config.get("extra") == "allow", model.__name__


def test_unknown_extra_field_is_preserved_not_dropped():
    quote = MarketQuote.model_validate(
        {"sym": "AAPL", "chg": "+1%", "pos": True, "brand_new_field": 123}
    )
    assert quote.model_dump()["brand_new_field"] == 123


def test_analysis_response_round_trip_known_payload():
    payload = {
        "request_id": "req-1",
        "ticker": "AAPL",
        "trade_date": "2026-07-01",
        "decision": "Hold",
        "disclaimer": "text",
        "some_pipeline_extra": {"nested": True},
    }
    parsed = AnalysisResponse.model_validate(payload)
    dumped = parsed.model_dump()
    for key, value in payload.items():
        assert dumped[key] == value


def test_required_fields_enforced():
    with pytest.raises(pydantic.ValidationError):
        AnalysisResponse.model_validate({"ticker": "AAPL"})  # request_id/trade_date required
