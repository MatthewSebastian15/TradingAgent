import json

from langchain_core.messages import HumanMessage

from tradingagents.agents.analysts.fundamentals_analyst import (
    _normalized_fundamentals_context,
    create_fundamentals_analyst,
)


def _state(**overrides):
    base = {
        "trade_date": "2026-07-03",
        "company_of_interest": "BBCA.JK",
        "messages": [HumanMessage(content="Analyze BBCA.JK")],
        "normalized_period_rows": [{"period": "2025", "revenue": 100.0}],
        "derived_fundamentals": [{"metric": "roe", "value": 0.2}],
    }
    base.update(overrides)
    return base


def test_final_answer_becomes_report(fake_chat_llm):
    llm = fake_chat_llm(content="fundamentals analysis text")
    node = create_fundamentals_analyst(llm)
    result = node(_state())
    assert result["fundamentals_report"] == "fundamentals analysis text"
    assert result["messages"][0].content == "fundamentals analysis text"

    tool_names = [tool.name for tool in llm.bound_tools]
    assert tool_names == [
        "get_company_profile",
        "get_earnings_calendar",
        "get_recommendation_trends",
    ]

    system_prompt = llm.last_prompt.messages[0].content
    assert "2026-07-03" in system_prompt
    assert "BBCA.JK" in system_prompt
    assert "normalized fundamental information" in system_prompt
    assert '"revenue": 100.0' in system_prompt  # normalized context injected


def test_tool_call_round_leaves_report_empty(fake_chat_llm):
    llm = fake_chat_llm(
        content="",
        tool_calls=[{"name": "get_company_profile", "args": {"ticker": "BBCA.JK"}, "id": "1"}],
    )
    result = create_fundamentals_analyst(llm)(_state())
    assert result["fundamentals_report"] == ""
    assert result["messages"][0].tool_calls


def test_normalized_context_shape_and_truncation():
    payload = json.loads(_normalized_fundamentals_context({}))
    assert set(payload) >= {
        "normalized_rows",
        "metrics",
        "gap_report",
        "field_quality",
        "limitations",
        "financial_highlights",
    }
    assert payload["normalized_rows"] == []

    huge = _normalized_fundamentals_context({"normalized_period_rows": [{"x": "y" * 20_000}]})
    assert len(huge) <= 12_000


def test_fundamental_analysis_dict_extracted():
    context = _normalized_fundamentals_context(
        {"fundamental_analysis": {"fundamental_score": 72, "fundamental_context": {"a": 1}}}
    )
    payload = json.loads(context)
    assert payload["fundamental_score"] == 72
    assert payload["fundamental_context"] == {"a": 1}
