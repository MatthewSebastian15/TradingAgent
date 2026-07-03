from langchain_core.messages import HumanMessage

from tradingagents.agents.analysts.news_analyst import create_news_analyst

STATE = {
    "trade_date": "2026-07-03",
    "company_of_interest": "BBCA.JK",
    "messages": [HumanMessage(content="Analyze news")],
}


def test_final_answer_becomes_news_report(fake_chat_llm):
    llm = fake_chat_llm(content="news analysis text")
    result = create_news_analyst(llm)(STATE)
    assert result["news_report"] == "news analysis text"

    tool_names = [tool.name for tool in llm.bound_tools]
    assert tool_names == ["get_news", "get_global_news", "get_news_sentiment"]

    system_prompt = llm.last_prompt.messages[0].content
    assert "news researcher" in system_prompt
    assert "2026-07-03" in system_prompt
    assert "BBCA.JK" in system_prompt
    assert "get_news, get_global_news, get_news_sentiment" in system_prompt


def test_tool_call_round_leaves_report_empty(fake_chat_llm):
    llm = fake_chat_llm(
        content="", tool_calls=[{"name": "get_news", "args": {"ticker": "BBCA.JK"}, "id": "1"}]
    )
    result = create_news_analyst(llm)(STATE)
    assert result["news_report"] == ""
    assert result["messages"][0].tool_calls
