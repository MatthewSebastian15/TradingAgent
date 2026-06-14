import json

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from tradingagents.agents.utils.agent_utils import (
    build_instrument_context,
    get_language_instruction,
)
from tradingagents.agents.utils.event_data_tools import get_earnings_calendar, get_recommendation_trends
from tradingagents.agents.utils.fundamental_data_tools import get_company_profile


def _normalized_fundamentals_context(state: dict) -> str:
    payload = {
        "normalized_rows": state.get("normalized_period_rows") or [],
        "metrics": state.get("derived_fundamentals") or state.get("fundamental_metrics") or [],
        "gap_report": state.get("gap_report") or state.get("fundamental_gap_report") or {},
        "field_quality": state.get("fundamental_field_quality") or {},
        "sector_classification": state.get("sector_classification") or {},
        "source_metadata": state.get("source_metadata") or {},
        "fallback_metadata": state.get("fallback_metadata") or {},
        "limitations": state.get("data_limitations") or [],
        "financial_highlights": state.get("financial_highlights") or {},
    }
    return json.dumps(payload, ensure_ascii=False, default=str)[:12000]


def create_fundamentals_analyst(llm):
    def fundamentals_analyst_node(state):
        current_date = state["trade_date"]
        instrument_context = build_instrument_context(state["company_of_interest"])

        tools = [
            get_company_profile,
            get_earnings_calendar,
            get_recommendation_trends,
        ]

        system_message = (
            "You are a researcher tasked with analyzing normalized fundamental information about a company. Use normalized FinancialRow data, FundamentalMetrics, DataGapReport, fundamental_field_quality, source metadata, fallback metadata, unavailable field reasons, estimated field limitations, and sector classification as the source of truth."
            + " Make sure to append a Markdown table at the end of the report to organize key points in the report, organized and easy to read."
            + " Use the available tools only for company context, event risk, and external recommendation comparison. Do not treat raw tool financial statements as primary data."
            + " YFinance is the primary source. Finnhub is fallback only. Fallback fields are not primary. Estimated fields are not actual reported data. Unavailable fields must be named as data limitations. ETF, FUND, and crypto instruments must not be forced to have operating financial statement metrics. Banks must not be forced to have EBITDA or interest coverage. No third provider is used in this Sprint 3 fundamental pipeline."
            + get_language_instruction()
        )

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a helpful AI assistant, collaborating with other assistants."
                    " Use the provided tools to progress towards answering the question."
                    " If you are unable to fully answer, that's OK; another assistant with different tools"
                    " will help where you left off. Execute what you can to make progress."
                    " If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable,"
                    " prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop."
                    " You have access to the following tools: {tool_names}.\n{system_message}"
                    "For your reference, the current date is {current_date}. {instrument_context}"
                    "\nNormalized fundamentals context:\n{normalized_context}",
                ),
                MessagesPlaceholder(variable_name="messages"),
            ]
        )

        prompt = prompt.partial(system_message=system_message)
        prompt = prompt.partial(tool_names=", ".join([tool.name for tool in tools]))
        prompt = prompt.partial(current_date=current_date)
        prompt = prompt.partial(instrument_context=instrument_context)
        prompt = prompt.partial(normalized_context=_normalized_fundamentals_context(state))

        chain = prompt | llm.bind_tools(tools)

        result = chain.invoke(state["messages"])

        report = ""

        if len(result.tool_calls) == 0:
            report = result.content

        return {
            "messages": [result],
            "fundamentals_report": report,
        }

    return fundamentals_analyst_node
