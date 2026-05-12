from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
import logging
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

logger = logging.getLogger(__name__)
router = APIRouter()

# Timeout maksimal untuk seluruh pipeline analisis dalam detik.
# Pipeline menjalankan 4 analis + 2 putaran debat + 3 risk analis + PM,
# masing-masing minimal 1 LLM call. Jika tiap call timeout di 120s
# (dari DEFAULT_CONFIG["timeout"]), semua akan selesai jauh sebelum 600s.
# Nilai ini adalah safety net terakhir jika ada proses yang tidak tertangkap.
PIPELINE_TIMEOUT_SECONDS = 600


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
        """Synchronous pipeline — berjalan di thread pool executor."""
        try:
            ta = TradingAgentsGraph(debug=False, config=config)
            _, decision = ta.propagate(req.ticker, req.trade_date)
            return decision
        except Exception as e:
            logger.error(
                "Analysis failed for %s on %s: %s",
                req.ticker, req.trade_date, e,
                exc_info=True,
            )
            raise

    try:
        # asyncio.wait_for memastikan response HTTP dikirim ke client dalam
        # PIPELINE_TIMEOUT_SECONDS detik meskipun thread Ollama masih berjalan
        # di background (Python tidak bisa force-kill thread).
        # Timeout per LLM call (dari DEFAULT_CONFIG["timeout"]) adalah
        # mekanisme utama -- ini adalah lapisan pengaman terakhir.
        decision = await asyncio.wait_for(
            loop.run_in_executor(None, run),
            timeout=PIPELINE_TIMEOUT_SECONDS,
        )
        return {"ticker": req.ticker, "decision": decision}

    except asyncio.TimeoutError:
        logger.error(
            "Pipeline timeout untuk %s pada %s setelah %ds",
            req.ticker, req.trade_date, PIPELINE_TIMEOUT_SECONDS,
        )
        raise HTTPException(
            status_code=504,
            detail=(
                f"Analisis timeout setelah {PIPELINE_TIMEOUT_SECONDS} detik. "
                "Coba lagi atau kurangi max_debate_rounds menjadi 1."
            ),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))