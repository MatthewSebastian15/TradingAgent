from __future__ import annotations

from tradingagents.agents.schemas import DebateArgument, render_debate_argument
from tradingagents.agents.utils.agent_utils import get_language_instruction
from tradingagents.pipeline_balanced_types import CollectedData


def _horizon_instruction(time_horizon_text: str) -> str:
    return f"""
ANALYSIS HORIZON:
The selected analysis horizon is exactly {time_horizon_text}.
All conclusions, confidence, catalysts, entry price, stop loss, take profit, allocation, and risk controls must fit this holding period.
Do not invent a different horizon such as "short term", "3-6 months", or "6-12 months"."""


def market_analyst_prompt(
    ticker: str,
    trade_date: str,
    data: CollectedData,
    data_quality_json: str,
    time_horizon_text: str,
) -> str:
    return f"""
You are the Market Analyst for {ticker} on {trade_date}.
Use only the supplied price and technical data. Produce a practical technical/market report.
Focus on trend, momentum, volatility, volume, support/resistance, and what the setup implies.
{_horizon_instruction(time_horizon_text)}

DATA QUALITY INSTRUCTION:
Review the DATA QUALITY block below before writing your report.
If any field shows status "partial" or "missing", explicitly state that limitation
in your report and lower your confidence score accordingly. Do not present conclusions
as certain when the underlying data is incomplete.

PRICE DATA:
{data.price_data}

TECHNICAL INDICATORS:
{data.technical_indicators}

DATA QUALITY:
{data_quality_json}
{get_language_instruction()}"""


def news_social_prompt(
    ticker: str,
    trade_date: str,
    data: CollectedData,
    data_quality_json: str,
    time_horizon_text: str,
) -> str:
    return f"""
You are the combined News and Social Sentiment Analyst for {ticker} on {trade_date}.
Use the company news, macro news, and insider activity. Produce a sentiment and catalyst report.
Separate company-specific catalysts from broad market/macroeconomic pressure.
{_horizon_instruction(time_horizon_text)}

DATA QUALITY INSTRUCTION:
Review the DATA QUALITY block below before writing your report.
If news shows status "partial" or "missing", explicitly state that the sentiment assessment
is limited. Do not assert market sentiment with confidence when news data is incomplete.
Lower your confidence score when news data coverage is partial or missing.

COMPANY NEWS:
{data.company_news}

GLOBAL/MACRO NEWS:
{data.global_news}

INSIDER TRANSACTIONS:
{data.insider_transactions}

NEWS SENTIMENT:
{data.news_sentiment}

SOCIAL SENTIMENT:
{data.social_sentiment}

DATA QUALITY:
{data_quality_json}
{get_language_instruction()}"""


def fundamentals_prompt(
    ticker: str,
    trade_date: str,
    data: CollectedData,
    data_quality_json: str,
    time_horizon_text: str,
) -> str:
    return f"""
You are the Fundamentals Analyst for {ticker} on {trade_date}.
Use only the supplied company fundamentals and financial statements.
Focus on revenue quality, profitability, balance sheet strength, cash flow, valuation signals, and financial risk.
Quote specific metrics when available.
{_horizon_instruction(time_horizon_text)}

DATA QUALITY INSTRUCTION:
Review the DATA QUALITY block below before writing your report.
If fundamentals show status "partial" or "missing", explicitly name which statements
are unavailable, state that your analysis is limited to what is present, and lower
your confidence score to reflect the gap. Do not extrapolate from absent data.

FUNDAMENTALS:
{data.fundamentals}

BALANCE SHEET:
{data.balance_sheet}

CASH FLOW:
{data.cashflow}

INCOME STATEMENT:
{data.income_statement}

EVENT RISK CONTEXT:
{data.event_risk}

ANALYST RECOMMENDATION TRENDS (external comparison only, not final decision):
{data.recommendation_trends}

DATA QUALITY:
{data_quality_json}
{get_language_instruction()}"""


def bull_prompt(
    ticker: str,
    trade_date: str,
    time_horizon_text: str,
    data_quality_json: str,
    market_md: str,
    news_social_md: str,
    fundamentals_md: str,
) -> str:
    return f"""
    You are the Bull Researcher for {ticker} on {trade_date}.
    Build the strongest bullish case from the analyst reports. Do not ignore risks, but argue why upside outweighs downside.
    {_horizon_instruction(time_horizon_text)}
    If DATA QUALITY shows any field as "partial" or "missing", acknowledge this as a risk_flag
    and lower your confidence score accordingly. Do not present bullish claims as certain when data is incomplete.

    DATA QUALITY:
    {data_quality_json}

    MARKET REPORT:
    {market_md}

    NEWS/SOCIAL REPORT:
    {news_social_md}

    FUNDAMENTALS REPORT:
    {fundamentals_md}
    {get_language_instruction()}"""


def bear_prompt(
    ticker: str,
    trade_date: str,
    time_horizon_text: str,
    data_quality_json: str,
    market_md: str,
    news_social_md: str,
    fundamentals_md: str,
    bull: DebateArgument,
) -> str:
    return f"""
    You are the Bear Researcher for {ticker} on {trade_date}.
    Build the strongest bearish case from the analyst reports. Be specific about downside, missing data, valuation risk, execution risk, and market risk.
    {_horizon_instruction(time_horizon_text)}
    If DATA QUALITY shows any field as "partial" or "missing", treat this as a direct risk factor
    and include it as a risk_flag. Incomplete data weakens any high-conviction bull case.

    DATA QUALITY:
    {data_quality_json}

    MARKET REPORT:
    {market_md}

    NEWS/SOCIAL REPORT:
    {news_social_md}

    FUNDAMENTALS REPORT:
    {fundamentals_md}

    BULL CASE TO CHALLENGE:
    {render_debate_argument(bull, "Bull Researcher")}
    {get_language_instruction()}"""


def research_manager_prompt(
    ticker: str,
    trade_date: str,
    time_horizon_text: str,
    market_md: str,
    news_social_md: str,
    fundamentals_md: str,
    debate_md: str,
    data_quality_json: str,
) -> str:
    return f"""
You are the Research Manager for {ticker} on {trade_date}.
Weigh the analyst reports and the bull/bear debate. Produce one investment plan.
Commit to Buy, Overweight, Hold, Underweight, or Sell based on evidence quality.
{_horizon_instruction(time_horizon_text)}

MARKET REPORT:
{market_md}

NEWS/SOCIAL REPORT:
{news_social_md}

FUNDAMENTALS REPORT:
{fundamentals_md}

BULL/BEAR DEBATE:
{debate_md}

DATA QUALITY:
{data_quality_json}
"""


def trader_prompt(
    ticker: str,
    trade_date: str,
    time_horizon_text: str,
    market_md: str,
    investment_plan: str,
    data_quality_json: str,
) -> str:
    return f"""
You are the Trader for {ticker} on {trade_date}.
Translate the research manager plan into a trade proposal.
Use the market report for entry/stop context. Provide practical sizing guidance. Return suggested_allocation_percent, max_drawdown_estimate, volatility_level, position_sizing_reason, rebalancing_action, key_catalysts, and invalidation_conditions when data supports them. Backend validation is the final source of entry_price, stop_loss, take_profit, risk_reward_ratio, risk_reward_display, and actionability.
For Buy and Sell recommendations, any proposed trade levels must use Risk:Reward exactly 1:3. In numeric fields, risk_reward_ratio means reward divided by risk, so the only valid value is 3.0. Do not use any higher Risk:Reward variant. For Buy, stop_loss must be below entry_price and take_profit must be entry_price + ((entry_price - stop_loss) * 3). For Sell, stop_loss must be above entry_price and take_profit must be entry_price - ((stop_loss - entry_price) * 3). For Buy and Sell, risk_reward_display must be "1:3". Use price_target as an analyst/fair target and take_profit as the trade execution target. If a setup cannot support a valid 1:3 Risk:Reward structure, recommend Hold, Wait for better entry, or Avoid new entry instead of forcing a weak Buy/Sell. Do not invent current_price. Allowed volatility_level values are only Low, Medium, High, or Very High. Allowed rebalancing_action values are only Open new position, Add position, Maintain position, Trim position, Exit position, or Avoid new entry.
{_horizon_instruction(time_horizon_text)}

MARKET REPORT:
{market_md}

RESEARCH PLAN:
{investment_plan}

DATA QUALITY:
{data_quality_json}
"""


def risk_committee_prompt(
    ticker: str,
    trade_date: str,
    time_horizon_text: str,
    market_md: str,
    news_social_md: str,
    fundamentals_md: str,
    debate_md: str,
    investment_plan: str,
    trader_plan: str,
    data_quality_json: str,
) -> str:
    return f"""
    You are a combined Risk Committee for {ticker} on {trade_date}.
    Simulate three perspectives in one call: aggressive, neutral, and conservative.
    Evaluate the trader proposal, downside risk, invalidation triggers, position sizing, stop-loss logic, liquidity, volatility, and headline risk.
    {_horizon_instruction(time_horizon_text)}

    ANALYST REPORTS:
    {market_md}

    {news_social_md}

    {fundamentals_md}

    DEBATE:
    {debate_md}

    RESEARCH PLAN:
    {investment_plan}

    TRADER PROPOSAL:
    {trader_plan}

    DATA QUALITY:
    {data_quality_json}
    """


def portfolio_manager_prompt(
    ticker: str,
    trade_date: str,
    time_horizon_text: str,
    last_close_text: str,
    market_md: str,
    news_social_md: str,
    fundamentals_md: str,
    debate_md: str,
    investment_plan: str,
    trader_plan: str,
    risk_md: str,
    data_quality_json: str,
) -> str:
    return f"""
You are the Portfolio Manager for {ticker} on {trade_date}.
Make the final decision using every prior report. The final answer must be usable by a frontend investment dashboard.
Keep language simple and practical. Include an action plan, risk controls, price target when data supports it, and time horizon. Return all actionable dashboard fields: suggested_allocation_percent, max_drawdown_estimate, volatility_level, position_sizing_reason, rebalancing_action, key_reasons, key_catalysts, and invalidation_conditions. Use key_reasons for the primary reasons supporting the recommendation. Backend validation is the final source of entry_price, stop_loss, take_profit, risk_reward_ratio, risk_reward_display, and actionability. Reduce confidence and allocation when data_quality has partial, unavailable, or missing inputs.
Use LAST CLOSE PRICE as the current market price anchor in reasoning only. If LAST CLOSE PRICE is unavailable or data quality is not usable, leave unsupported price fields null instead of inventing numbers. Do not invent current_price.
For Buy and Sell, max_drawdown_estimate, volatility_level, rebalancing_action, and risk_reward_ratio should be non-null when the data supports an actionable decision; backend validation will recompute final execution levels. For Buy, stop_loss must be below entry_price and take_profit above entry_price. For Sell, stop_loss must be above entry_price and take_profit below entry_price. For Hold, include only current_price, volatility_level, and rebalancing_action for user-facing display.
For Buy and Sell recommendations, final trade levels must use Risk:Reward exactly 1:3. In numeric fields, risk_reward_ratio means reward divided by risk, so the only valid value is 3.0. Do not use any higher Risk:Reward variant. For Buy, take_profit must be entry_price + ((entry_price - stop_loss) * 3). For Sell, take_profit must be entry_price - ((stop_loss - entry_price) * 3). For Buy and Sell, risk_reward_display must be "1:3". If a setup cannot support a valid 1:3 Risk:Reward structure, recommend Hold, Wait for better entry, or Avoid new entry instead of forcing a weak Buy/Sell. Use price_target as the analyst/fair target. Use take_profit as the trade execution target based on risk/reward. Allowed volatility_level values only: Low, Medium, High, Very High. Allowed rebalancing_action values only: Open new position, Add position, Maintain position, Trim position, Exit position, Avoid new entry. Use Hold when no safe actionable setup exists.
{_horizon_instruction(time_horizon_text)}
Set the structured time_horizon field exactly to "{time_horizon_text}".

OUTPUT LENGTH REQUIREMENTS:
- executive_summary must be 150-200 words in one paragraph. No bullet points.
- investment_thesis must be 250-350 words as flowing paragraphs. No bullet points and no headers.
- Do not return short placeholder text. These fields are displayed directly in the analysis dashboard and report.

LAST CLOSE PRICE:
{last_close_text}

MARKET REPORT:
{market_md}

NEWS/SOCIAL REPORT:
{news_social_md}

FUNDAMENTALS REPORT:
{fundamentals_md}

BULL/BEAR DEBATE:
{debate_md}

RESEARCH PLAN:
{investment_plan}

TRADER PROPOSAL:
{trader_plan}

RISK COMMITTEE REPORT:
{risk_md}

DATA QUALITY:
{data_quality_json}
"""
