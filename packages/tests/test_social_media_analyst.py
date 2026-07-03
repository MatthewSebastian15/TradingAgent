from langchain_core.messages import HumanMessage

from tradingagents.agents.analysts.social_media_analyst import create_social_media_analyst

STATE = {
    "trade_date": "2026-07-03",
    "company_of_interest": "BBCA.JK",
    "messages": [HumanMessage(content="Analyze sentiment")],
}


def test_final_answer_becomes_sentiment_report(fake_chat_llm):
    llm = fake_chat_llm(content="sentiment analysis text")
    result = create_social_media_analyst(llm)(STATE)
    assert result["sentiment_report"] == "sentiment analysis text"

    tool_names = [tool.name for tool in llm.bound_tools]
    assert tool_names == ["get_news", "get_news_sentiment", "get_social_sentiment"]

    system_prompt = llm.last_prompt.messages[0].content
    assert "social media" in system_prompt
    assert "must not be labeled as direct social sentiment" in system_prompt
    assert "BBCA.JK" in system_prompt


def test_tool_call_round_leaves_report_empty(fake_chat_llm):
    llm = fake_chat_llm(
        content="",
        tool_calls=[{"name": "get_social_sentiment", "args": {"ticker": "BBCA.JK"}, "id": "1"}],
    )
    result = create_social_media_analyst(llm)(STATE)
    assert result["sentiment_report"] == ""
    assert result["messages"][0].tool_calls
