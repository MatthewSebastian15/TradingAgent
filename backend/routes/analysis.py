from fastapi import APIRouter
from pydantic import BaseModel
import asyncio
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

router = APIRouter()

class AnalysisRequest(BaseModel):
    ticker: str
    trade_date: str
    llm_provider: str = "google"
    max_debate_rounds: int = 1

@router.post("/analyze")
async def analyze(req: AnalysisRequest):
    config = DEFAULT_CONFIG.copy()
    config["llm_provider"] = req.llm_provider
    config["max_debate_rounds"] = req.max_debate_rounds

    loop = asyncio.get_event_loop()

    def run():
        ta = TradingAgentsGraph(debug=False, config=config)
        _, decision = ta.propagate(req.ticker, req.trade_date)
        return decision

    decision = await loop.run_in_executor(None, run)
    return {"ticker": req.ticker, "decision": decision}