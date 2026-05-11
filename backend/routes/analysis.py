from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
import logging
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

logger = logging.getLogger(__name__)
router = APIRouter()


class AnalysisRequest(BaseModel):
    ticker: str
    trade_date: str
    max_debate_rounds: int = 1


@router.post("/analyze")
async def analyze(req: AnalysisRequest):
    config = DEFAULT_CONFIG.copy()
    config["max_debate_rounds"] = req.max_debate_rounds

    loop = asyncio.get_event_loop()

    def run():
        try:
            ta = TradingAgentsGraph(debug=False, config=config)
            _, decision = ta.propagate(req.ticker, req.trade_date)
            return decision
        except Exception as e:
            logger.error("Analysis failed for %s on %s: %s", req.ticker, req.trade_date, e, exc_info=True)
            raise

    try:
        decision = await loop.run_in_executor(None, run)
        return {"ticker": req.ticker, "decision": decision}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))