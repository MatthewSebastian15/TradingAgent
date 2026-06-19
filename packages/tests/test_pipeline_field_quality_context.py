from tradingagents.dataflows.quality.data_quality import DataField
from tradingagents.pipeline.quality import _build_data_quality, _build_field_quality_metadata
from tradingagents.pipeline.types import FieldQualityContext


def test_field_quality_context_accepts_constructor_args():
    missing = DataField(value="", status="missing", warning=None)

    ctx = FieldQualityContext(
        trade_date="2026-06-19",
        data_sources={},
        price=missing,
        fundamentals=missing,
        balance_sheet=missing,
        cashflow=missing,
        income_statement=missing,
        company_news=missing,
        global_news=missing,
        insider_transactions=missing,
        news_sentiment=missing,
        social_sentiment=missing,
        technical_indicators=missing,
        event_risk=missing,
        recommendation_trends=missing,
        last_close_price=None,
        company_profile=None,
        price_performance=None,
    )

    assert ctx.trade_date == "2026-06-19"
    assert ctx.vendor_attempts is None

    metadata = _build_field_quality_metadata(ctx)
    assert metadata["quote"]["status"] == "source_unavailable"


def test_build_data_quality_uses_local_price_fallback_helper():
    missing = DataField(value="", status="missing", warning=None)

    report = _build_data_quality(
        trade_date="2026-06-19",
        price=missing,
        fundamentals=missing,
        balance_sheet=missing,
        cashflow=missing,
        income_statement=missing,
        company_news=missing,
        global_news=missing,
        all_fields=[missing],
        price_lookback_days=365,
    )

    assert report.price_data == "invalid_ticker"
