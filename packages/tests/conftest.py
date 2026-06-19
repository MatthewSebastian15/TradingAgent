"""Shared pytest fixtures that prevent CI hangs when API keys are absent."""

import os
from unittest.mock import MagicMock, patch

import pytest

_API_KEY_ENV_VARS = (
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
    "LLM_API_KEY",
    "ALPHA_VANTAGE_API_KEY",
    "FINNHUB_API_KEY",
    "GOOGLE_NEWS_LIGHT_API_KEY",
    "MARKETAUX_API_KEY",
    "NEWSDATA_API_KEY",
)
_API_KEY_PLACEHOLDER = "test-placeholder"

os.environ["TRADINGAGENTS_SKIP_DOTENV"] = "true"
for _env_var in _API_KEY_ENV_VARS:
    os.environ[_env_var] = _API_KEY_PLACEHOLDER

from tradingagents.dataflows.quality.data_quality import DataQualityReport  # noqa: E402
from tradingagents.llm_clients.model_catalog import MODEL_CATALOG  # noqa: E402
from tradingagents.pipeline_balanced_types import CollectedData  # noqa: E402
from tradingagents.prompt_context import build_prompt_context  # noqa: E402

_GOOGLE_QUICK_LLM = MODEL_CATALOG["google"]["quick"][0][1]
_GOOGLE_DEEP_LLM = MODEL_CATALOG["google"]["deep"][0][1]
os.environ["LLM_PROVIDER"] = "google"
os.environ["QUICK_THINK_LLM"] = _GOOGLE_QUICK_LLM
os.environ["DEEP_THINK_LLM"] = _GOOGLE_DEEP_LLM


def pytest_configure(config):
    for marker in ("unit", "integration", "smoke"):
        config.addinivalue_line("markers", f"{marker}: {marker}-level tests")


@pytest.fixture(autouse=True)
def _dummy_api_keys(monkeypatch):
    for env_var in _API_KEY_ENV_VARS:
        monkeypatch.setenv(env_var, _API_KEY_PLACEHOLDER)
    monkeypatch.setenv("TRADINGAGENTS_SKIP_DOTENV", "true")
    monkeypatch.setenv("LLM_PROVIDER", "google")
    monkeypatch.setenv("QUICK_THINK_LLM", _GOOGLE_QUICK_LLM)
    monkeypatch.setenv("DEEP_THINK_LLM", _GOOGLE_DEEP_LLM)


@pytest.fixture()
def mock_llm_client():
    client = MagicMock()
    client.get_llm.return_value = MagicMock()
    with patch(
        "tradingagents.llm_clients.factory.create_llm_client",
        return_value=client,
    ):
        yield client


@pytest.fixture()
def sample_collected_data():
    price_rows = ["Date,Open,High,Low,Close,Volume"]
    for index in range(70):
        day = index + 1
        month = 3 if day <= 31 else 4 if day <= 61 else 5
        month_day = day if day <= 31 else day - 31 if day <= 61 else day - 61
        close = 100 + index
        price_rows.append(
            f"2026-{month:02d}-{month_day:02d},{close - 1},{close + 2},"
            f"{close - 2},{close},{1000 + index * 10}"
        )

    data = CollectedData(
        ticker="BBCA.JK",
        trade_date="2026-05-10",
        time_horizon_months=1,
        price_data="\n".join(price_rows),
        technical_indicators='{"rsi": 58, "macd_signal": "bullish", "sma_20": 158.5}',
        fundamentals='{"market_cap": 1000000, "pe_ratio": 18.5, "source": "test"}',
        balance_sheet='{"total_assets": 5000000, "total_liabilities": 2000000}',
        cashflow='{"operating_cash_flow": 120000, "free_cash_flow": 90000}',
        income_statement='{"revenue": 800000, "net_income": 180000}',
        company_news=(
            "### BBCA earnings beat\n"
            + "Published: 2026-05-08\n"
            + "Revenue and profit improved.\n"
            + "Link: https://example.com/a"
        ),
        global_news="### Indonesia rate outlook stable\nMacro context remains supportive.",
        insider_transactions="No major insider transactions returned.",
        data_quality=DataQualityReport(price_data="ok", fundamentals="ok", news="ok", warnings=[]),
        last_close_price=169.0,
        news_sentiment='{"label": "positive"}',
        social_sentiment='{"label": "neutral"}',
        event_risk='{"next_earnings_date": "2026-06-20", "risk_level": "medium"}',
        recommendation_trends='{"buy": 8, "hold": 4, "sell": 1}',
        last_close_price_as_of="2026-05-10",
        last_close_price_source="test:ohlcv",
        company_profile={
            "available": True,
            "company_name": "Bank Central Asia",
            "exchange": "IDX",
            "currency": "IDR",
            "sector": "Financial Services",
            "industry": "Banks",
            "business_summary": "A large Indonesian private bank.",
            "market_cap": 1000000,
        },
        price_chart={
            "available": True,
            "source": "test",
            "currency": "IDR",
            "summary": {"period_return_percent": 8.2, "average_volume": 1300},
            "points": [{"date": "2026-05-10", "close": 169.0, "volume": 1690}],
        },
        price_performance={"period_return_percent": 8.2},
        technical_entry={"available": True, "support": 155.0, "resistance": 175.0, "rsi": 58.0},
        news_context={
            "providers_used": ["marketaux"],
            "provider_status": {"marketaux": "ok"},
            "articles_found": 2,
            "articles_used_in_prompt": 2,
            "average_sentiment": "positive",
        },
        related_news={
            "available": True,
            "summary": "Two relevant articles returned.",
            "items": [
                {
                    "title": "BBCA earnings beat expectations",
                    "publisher": "Example",
                    "published_at": "2026-05-08T10:00:00Z",
                    "source": "marketaux",
                    "event_type": "earnings",
                    "summary": "Revenue and profit improved.",
                    "url": "https://example.com/a",
                    "relevance_reason": "Earnings news for BBCA.JK.",
                }
            ],
        },
        news_impact={"available": True, "overall_sentiment": "positive", "news_count": 1},
        catalyst_tracker={"positive_catalysts": [{"type": "earnings", "impact": "positive"}]},
        analyst_consensus={"available": True, "consensus_label": "positive", "total": 13},
        financial_highlights={
            "currency": "IDR",
            "scale": "millions",
            "analysis_date": "2026-05-10",
            "periods": [{"key": "2026Q1", "label": "Q1 2026"}],
            "rows": [
                {"key": "revenue", "label": "Revenue", "values": {"2026Q1": {"display": "800,000"}}}
            ],
            "data_quality": {"available": True},
        },
        fundamental_analysis={
            "financial_trends": {"available": True, "revenue_growth": "positive"},
            "valuation_multiples": {"pe_ratio": 18.5},
        },
    )
    data.prompt_context = build_prompt_context(data)
    return data
