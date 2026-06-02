# Architecture

Detailed system architecture for TradingAgent. Read this when you need to
understand data flow, component boundaries, or how the pipeline works before
modifying any agent, route, or frontend hook.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  React/Vite Frontend  (port 3000)                           │
│                                                             │
│  /home          Dashboard.jsx   (market overview, form)     │
│  /analysis      Analysis.jsx    (form + result card)        │
│  /analysis/:id  Analysis.jsx    (resume from job ID)        │
│                                                             │
│  StockForm.jsx  →  POST /api/analyze                        │
│  useAnalysisJob.js  →  SSE /api/analysis/jobs/:id/events    │
│  ResultCard.jsx  ←  renders final analysis result           │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP + SSE
┌─────────────────────▼───────────────────────────────────────┐
│  FastAPI Backend  (port 8000)                               │
│                                                             │
│  POST   /api/analyze             submit analysis job        │
│  GET    /api/analyze/status      check job status           │
│  GET    /api/analysis/jobs/:id   get job details            │
│  GET    /api/analysis/jobs/:id/events  SSE stream           │
│  GET    /api/analysis/history    past results (SQLite)      │
│  GET    /api/market/quote/:ticker  live quote               │
│  GET    /api/news/:ticker        recent news                │
│  GET    /api/reports/:id.html    HTML report                │
│  GET    /api/reports/:id.pdf     PDF report                 │
│  GET    /health                  liveness probe             │
└─────────────────────┬───────────────────────────────────────┘
                      │ process pool (concurrent.futures)
┌─────────────────────▼───────────────────────────────────────┐
│  tradingagents-core  (editable pip package)                 │
│                                                             │
│  pipeline_balanced.py  →  LangGraph graph execution         │
│                                                             │
│  Data Collection (parallel asyncio)                         │
│    yfinance + Finnhub + Alpha Vantage + MarketAux           │
│                                                             │
│  Analyst Stage (parallel)                                   │
│    MarketAnalyst  NewsAnalyst  FundamentalsAnalyst           │
│                                                             │
│  Debate Stage (sequential)                                  │
│    BullResearcher → BearResearcher → ResearchManager        │
│                                                             │
│  Decision Stage (sequential)                                │
│    Trader → RiskAnalysts (3x) → PortfolioManager            │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Module Boundaries

### `main.py`
FastAPI app factory. Registers all routers, middleware stack, and lifespan hooks.
The lifespan hook validates startup config (LLM keys, model names, writable dirs)
and calls `sys.exit(1)` on failure so Docker healthchecks catch it immediately.

Middleware order (outermost to innermost):
1. `RequestBodyLimitMiddleware` - reject oversized payloads before parsing
2. `GZipMiddleware` - compress responses >= 1000 bytes
3. `SkipSseCompressionMiddleware` - bypass gzip on SSE paths so events flush
4. `RequestIdMiddleware` - attach `x-request-id` to every request for log tracing
5. `CORSMiddleware` - whitelist frontend origins from `CORS_ORIGINS` env var

### `config.py`
Single import point for all runtime config. Reads from environment variables
(loaded from `.env` by uvicorn or Docker). Never import from `config_llm.py`,
`config_env.py`, or `config_defaults.py` directly in routes or services.
Always import from `config.py`.

### `routes/validation.py`
All input validation before the pipeline starts. Key rules:
- Ticker: 1-10 uppercase alphanumeric + optional `.JK` or `-` suffix
- Market: `US` or `ID` only
- `trade_date`: `YYYY-MM-DD`, not more than 1 day in the future
- `time_horizon_months`: 1, 2, or 3 only
- `max_debate_rounds`: 1-5 inclusive
- `analysis_depth`: `fast`, `balanced`, or `deep`
- IDX tickers without `.JK` suffix are auto-appended for known symbols

### `routes/analysis.py`
Thin routing layer. Accepts the request, validates it, submits to the process
pool, and returns the job ID. Does not contain pipeline logic.

### `routes/pipeline_runner.py`
Runs inside the process pool worker. Imports and executes the agent graph.
This is the boundary between the FastAPI process and the agent process.

### `routes/sse.py`
SSE event streaming. Reads job events from `analysis_cache.py` and forwards
them to the browser. Supports event replay via `Last-Event-ID` header.

### `schemas.py`
Pydantic models for every public API response. Uses `extra="allow"` on
`ApiSchema` so the pipeline can add new fields without breaking existing clients.
**Do not remove fields from existing schemas without a deprecation plan.**

### `services/analysis_repository.py`
SQLite persistence for completed analyses. Stores the final result JSON so
users can retrieve past analyses without re-running the pipeline.

### `services/report_service.py`
Generates HTML and PDF reports from completed analysis results using Jinja2.
PDF is rendered via WeasyPrint from the HTML template.

---

## Agent Engine (tradingagents-core)

### Package Import Path
Always import as `from tradingagents.xxx import yyy`. Never use
`from backend.tradingagents.xxx` or any other prefix.

### Agent Roles

| Agent | Input | Output |
|---|---|---|
| MarketAnalyst | OHLCV, technical indicators | Price action summary |
| NewsAnalyst | Company news, macro news, sentiment | News + sentiment summary |
| FundamentalsAnalyst | Profile, metrics, financials | Fundamental summary |
| BullResearcher | All analyst outputs | Bull investment thesis |
| BearResearcher | All analyst outputs | Bear investment thesis |
| ResearchManager | Bull + Bear theses | Balanced investment plan |
| Trader | Investment plan | Trade proposal with levels |
| RiskAnalysts (x3) | Trade proposal | Risk-adjusted validation |
| PortfolioManager | Everything | Final BUY / HOLD / SELL + full result |

### LangGraph State
Agent state flows through LangGraph's state machine. Each agent reads from and
writes to the shared state dict. The state schema lives in
`tradingagents/agents/utils/agent_states.py`.

### LLM Configuration
Two LLM tiers are used:
- `deep_think_llm`: Research Manager and Portfolio Manager (heavier reasoning)
- `quick_think_llm`: all other agents (faster, cheaper)

The backend has no hardcoded model fallback. Both must be set in `.env`.

---

## Frontend Data Flow

```
StockForm.jsx
  → POST /api/analyze
  → { job_id, status }

useAnalysisJob.js
  → GET /api/analysis/jobs/{job_id}/events (SSE)
  → emits { type: "agent_start" | "agent_done" | "result" | "error" }

AgentLog.jsx
  ← reads agent_start / agent_done events
  ← renders real-time progress log

ResultCard.jsx
  ← reads final "result" event
  ← renders BUY/HOLD/SELL decision, tabs, financial highlights, charts
```

### Frontend Environment Variables
All env vars use the `VITE_` prefix (not `REACT_APP_`).

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL, default `http://localhost:8000` |
| `VITE_ENABLE_MOCK` | Set to `true` to enable `/analysis.test` mock route |

### Mock Route
`/analysis.test` and `/analysis.test/:id` are dev-only routes that load
`useMockAnalysisJob.js` instead of the real API hook. They are tree-shaken
out of production builds when `VITE_ENABLE_MOCK` is not `true`.

---

## Caching and Persistence

| Store | Technology | Purpose |
|---|---|---|
| Job store | SQLite (`.cache/analysis_jobs.sqlite3`) | In-flight job tracking + event replay |
| Result cache | SQLite (`.cache/analysis_jobs.sqlite3`) | Deduplicate identical requests |
| Analysis history | SQLite (`.cache/analysis_history.sqlite3`) | Past results for history tab |
| Market data cache | SQLite (`.cache/market_data.sqlite3`) | yfinance/Finnhub response cache |
| News cache | SQLite (`.cache/news_data.sqlite3`) | News provider response cache |

All SQLite files are in `.cache/` which is gitignored. The directory is created
automatically on first run.

---

## Docker Setup

Two containers defined in `docker-compose.yml`:
- `backend`: built from `Dockerfile.backend`, multi-stage build, port 8000
- `frontend`: built from `Dockerfile.frontend`, nginx, port 3000

The frontend nginx config proxies `/api/` to the backend container so the
browser never needs to know the backend port in production.

---

## Known Constraints

- Python 3.10-3.12 required. Python 3.13 is not supported by `tradingagents-core`
  dependencies (yfinance, LangChain). The Windows dev machine uses Python 3.13
  on the system but must use a conda env or venv with Python 3.12 for the backend.
- The process pool runs pipeline workers in separate processes to isolate
  LangGraph state and avoid asyncio conflicts. Use `PROCESS_POOL_WORKERS=2`
  minimum.
- SSE responses must not be compressed. `SkipSseCompressionMiddleware` handles
  this. Do not remove it.
