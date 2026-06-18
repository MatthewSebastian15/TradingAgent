from tradingagents.pipeline_balanced_prompts import (
    fundamentals_prompt,
    market_analyst_prompt,
    news_social_prompt,
)


def test_market_prompt_static_prefix_stable(sample_collected_data):
    prompt_a = market_analyst_prompt("BBCA.JK", "2026-06-02", sample_collected_data, "{}", "1 month")
    prompt_b = market_analyst_prompt("BBRI.JK", "2026-06-03", sample_collected_data, "{}", "1 month")

    prefix_a = prompt_a.split("[DYNAMIC REQUEST]", 1)[0]
    prefix_b = prompt_b.split("[DYNAMIC REQUEST]", 1)[0]

    assert prefix_a == prefix_b


def test_initial_analyst_prompts_use_compact_context(sample_collected_data):
    market_prompt = market_analyst_prompt("BBCA.JK", "2026-06-02", sample_collected_data, "{}", "1 month")
    news_prompt = news_social_prompt("BBCA.JK", "2026-06-02", sample_collected_data, "{}", "1 month")
    fundamentals = fundamentals_prompt("BBCA.JK", "2026-06-02", sample_collected_data, "{}", "1 month")

    assert "[DYNAMIC COMPACT MARKET CONTEXT]" in market_prompt
    assert "[DYNAMIC COMPACT NEWS AND SOCIAL CONTEXT]" in news_prompt
    assert "[DYNAMIC COMPACT FUNDAMENTALS CONTEXT]" in fundamentals
    assert "\nPRICE DATA:" not in market_prompt
    assert "\nCOMPANY NEWS:" not in news_prompt
    assert "\nBALANCE SHEET:" not in fundamentals

