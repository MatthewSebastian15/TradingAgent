# TradingAgent

TradingAgent is a full-stack application for multi-agent LLM-based stock analysis. The backend uses **FastAPI**, the frontend uses **React/Vite**, and the core engine wraps the TradingAgents framework with a more structured analysis pipeline for personal and development use.

The application receives a stock ticker, market, analysis date, investment horizon, analysis depth, and the user's existing position status. It then fetches market data from the configured vendors, runs several analyst agents, and returns a structured **Buy / Hold / Sell** decision with an executive summary, investment thesis, action plan, risk validation, data quality details, and HTML/PDF export options.

> This application is a research tool, not financial advice. Always validate the data, risk assumptions, and trading decisions independently before taking action.

![TradingAgent Dashboard](assets/TradingAgent%20Home.png)

---

## How the Pipeline Works

The pipeline collects data first, then continues through the analysis agents.

1. **Data Collection** retrieves OHLCV, technical indicators, fundamentals, financial statements, news, sentiment, event risk, recommendation trends, insider data, and data source metadata.
2. **Market Analyst** reads price action and technical indicators.
3. **News + Social Analyst** reads company news, global/macro news, sentiment, and social signals when available.
4. **Fundamentals Analyst** reads the company profile, metrics, balance sheet, cash flow, and income statement.
5. **Bull Researcher** builds the bullish argument.
6. **Bear Researcher** builds the bearish argument.
7. **Research Manager** weighs the debate and creates the investment plan.
8. **Trader** converts the plan into a trade proposal.
9. **Risk Analysts** test downside risk, volatility, position sizing, and invalidation triggers.
10. **Portfolio Manager** produces the final backend-validated decision.

Data collection runs in parallel. The first three analyst stages also run in parallel after data collection completes. The debate, trader, risk, and portfolio manager stages run sequentially so each stage can use the output from the previous agents.

![Investment Analysis Flow](assets/Investment%20Analysis%20Flow.png)

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│ React/Vite Frontend                                             │
│ Dev port: 3000                                                  │
│ Routes: /home, /analysis, /analysis/:jobId                      │
│ UI: US/ID market form, progress log, result card, report export │
└────────────────────────┬────────────────────────────────────────┘
                         │ POST /api/session
                         │ POST /api/analysis/jobs
                         │ GET  /api/analysis/jobs/{job_id}/events
                         │ GET  /api/analysis/jobs/{job_id}
                         │ GET  /api/analysis/{request_id} (deprecated alias)
                         │ GET  /api/analysis/history
                         │ GET  /api/analysis/history/{request_id}
                         │ GET  /api/analysis/jobs/{job_id}/report.html
                         │ GET  /api/analysis/jobs/{job_id}/report.pdf
                         │ DELETE /api/analysis/jobs/{job_id}
┌────────────────────────▼────────────────────────────────────────┐
│ FastAPI Backend                                                 │
│ Port: 8000                                                      │
│ Validation, CORS whitelist, request ID, sanitized errors        │
│ Rate limit, body limit, job store, cache, SSE, report service   │
└────────────────────────┬────────────────────────────────────────┘
                         │ Python subprocess / process pool
┌────────────────────────▼────────────────────────────────────────┐
│ TradingAgents Core                                              │
│ Multi-provider LLM clients                                      │
│ Vendor router: yfinance / Finnhub / Alpha Vantage               │
│ Balanced pipeline + structured PortfolioDecision                │
│ Risk engine: current price validation, fixed R/R 1:3            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```text
TradingAgent/
├── README.md
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── assets/
│
├── backend/
│   ├── .env.example
│   ├── analysis_cache.py              # Result cache, in-flight dedupe, job store, cancellation, persistence
│   ├── body_limit.py                  # Request body limit middleware
│   ├── config.py                      # Compatibility facade for modular config
│   ├── config_defaults.py             # Default backend/dev/prod/rate/cache/vendor settings
│   ├── config_env.py                  # .env loader and parser helpers
│   ├── config_llm.py                  # LLM provider/model config builder
│   ├── config_validation.py           # Startup validation
│   ├── errors.py                      # Sanitized API error envelope
│   ├── logging_config.py              # Request ID and logging setup
│   ├── main.py                        # FastAPI app, middleware, router, health check
│   ├── persistent_cache.py            # SQLite TTL cache
│   ├── rate_limiter.py                # API-key/session/IP-aware rate limiter
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── routes/
│   │   ├── analysis.py                # Analyze, job API, SSE, status, ticker validation
│   │   ├── analysis_history.py        # Permanent SQLite history endpoints
│   │   ├── jobs.py                    # Job lifecycle helpers
│   │   ├── market.py                  # Dashboard quote endpoint
│   │   ├── pipeline_runner.py         # Worker/subprocess bridge
│   │   ├── reports.py                 # HTML/PDF report endpoints
│   │   ├── serializers.py             # Result shaping/API contract
│   │   ├── sse.py                     # SSE event helpers
│   │   └── validation.py              # Request validation and ticker normalization
│   ├── services/
│   │   ├── analysis_repository.py     # Permanent SQLite analysis snapshots
│   │   └── report_service.py          # Report context, template render, WeasyPrint PDF
│   ├── static/reports/
│   │   └── analysis_report.css
│   ├── templates/reports/
│   │   └── analysis_report.html
│   ├── scripts/
│   │   ├── quality.ps1
│   │   └── seed_mock_analysis.py      # Seed one report/history debug snapshot
│   ├── tests/
│   └── tradingagents-core/
│       ├── pyproject.toml
│       ├── tradingagents/
│       │   ├── agents/                # Agent schemas/prompts
│       │   ├── dataflows/             # yfinance, Alpha Vantage, Finnhub, router, cache, quality
│       │   ├── graph/                 # Classic graph compatibility
│       │   ├── llm_clients/           # Google/OpenAI/Anthropic/DeepSeek/OpenRouter/Ollama clients
│       │   ├── pipeline_balanced*.py  # Balanced pipeline modules
│       │   ├── trade_levels.py        # Trade level validation and fixed R/R 1:3
│       │   └── default_config.py
│       └── tests/
│
└── frontend/
    ├── .env.example
    ├── index.html
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── domain/analysisContract.js # Frontend request/result contract constants
        ├── hooks/
        │   ├── useAnalysisJob.js      # Real job API + SSE hook
        │   └── useMockAnalysisJob.js  # Mock job behavior
        ├── components/
        │   ├── AgentLog.jsx
        │   ├── AnalysisWorkspace.jsx
        │   ├── ExportReportButtons.jsx
        │   ├── Navbar.jsx
        │   ├── ResultCard.jsx         # Main result UI, action plan 4x3, data quality
        │   ├── StockForm.jsx
        │   └── StockFormMock.jsx
        ├── pages/
        │   ├── Analysis.jsx
        │   ├── AnalysisMock.jsx
        │   ├── Dashboard.jsx
        │   └── NotFound.jsx
        ├── utils/
        │   ├── api.js
        │   ├── formatting.js
        │   ├── mockReport.js
        │   ├── reportApi.js
        │   └── sse.js
    dev/
        └── mockData.js             # Dev-only fixture loaded only when VITE_ENABLE_MOCK=true
```

---

## Requirements

- Python **3.10, 3.11, and 3.12** are supported. Python **3.11 is recommended** for the backend and used by `Dockerfile.backend`.
- Node.js **22 is recommended** for the frontend, matching `Dockerfile.frontend`.
- At least one LLM API key for the selected provider, unless using local Ollama.
- For local PDF export without Docker, WeasyPrint requires system dependencies. The Docker backend already installs these dependencies.

Backend report dependencies:

- `jinja2` for HTML templates.
- `weasyprint` for PDF generation.

---

## Supported LLM Providers

Set `LLM_PROVIDER` in `backend/.env`.

| Provider | `LLM_PROVIDER` value | Required key | Notes |
|---|---|---|---|
| Google Gemini | `google` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` | Google model names are normalized to lowercase. |
| OpenAI | `openai` | `OPENAI_API_KEY` | Native OpenAI uses the Responses API. |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | Supports Claude models from the catalog. |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | OpenAI-compatible. The reasoner has fallback behavior when structured output is unavailable. |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | Open model provider with flexible model strings. |
| Ollama | `ollama` | No API key required | Set `OLLAMA_BASE_URL`. |

Minimal configuration example:

```env
LLM_PROVIDER=deepseek
DEEP_THINK_LLM=deepseek-chat
QUICK_THINK_LLM=deepseek-chat
DEEPSEEK_API_KEY=your_api_key_here
```

For Ollama:

```env
LLM_PROVIDER=ollama
DEEP_THINK_LLM=llama3:latest
QUICK_THINK_LLM=llama3:latest
OLLAMA_BASE_URL=http://localhost:11434
```

---

## Data Sources and Vendor Routing

TradingAgent uses a vendor router. Vendor order can be configured per data category. The system tries vendors from left to right, then falls back if the first vendor fails, returns empty data, returns stale data, returns invalid data, or is unavailable.

Main defaults in `.env.example`:

```env
DATA_VENDOR_CORE_STOCK_APIS=yfinance,finnhub,alpha_vantage
DATA_VENDOR_QUOTE_DATA=yfinance,finnhub,alpha_vantage
DATA_VENDOR_TECHNICAL_INDICATORS=yfinance,finnhub,alpha_vantage
DATA_VENDOR_FUNDAMENTAL_DATA=yfinance,finnhub,alpha_vantage
DATA_VENDOR_FINANCIAL_STATEMENTS=yfinance,alpha_vantage,finnhub
DATA_VENDOR_NEWS_DATA=google_news_light,marketaux,newsdata,yfinance,finnhub,alpha_vantage
DATA_VENDOR_GLOBAL_NEWS_DATA=yfinance,finnhub,alpha_vantage
DATA_VENDOR_SENTIMENT_DATA=finnhub,alpha_vantage
DATA_VENDOR_SOCIAL_SENTIMENT=finnhub
DATA_VENDOR_EVENT_DATA=finnhub
DATA_VENDOR_ANALYST_RATING=finnhub
DATA_VENDOR_INSIDER_DATA=finnhub,alpha_vantage,yfinance
```

| Data | Sources used |
|---|---|
| Quote/current price | yfinance, Finnhub, Alpha Vantage based on routing. |
| OHLCV/history | yfinance, Finnhub, Alpha Vantage based on routing. |
| Technical indicators | Calculated locally from OHLCV using local indicators. |
| Fundamentals/profile/metrics | yfinance, Finnhub, Alpha Vantage based on routing. |
| Financial statements | yfinance, Alpha Vantage, Finnhub based on routing. |
| Company news | Google News Light, MarketAux, NewsData.io, yfinance, Finnhub, Alpha Vantage based on routing. |
| Global/macro news | yfinance, Finnhub, Alpha Vantage based on routing. |
| News sentiment | Finnhub, Alpha Vantage based on routing. |
| Social sentiment | Finnhub when available. |
| Event risk / earnings / recommendation trends | Finnhub when available. |
| Insider data | Finnhub, Alpha Vantage, yfinance based on routing. |
| Forex and crypto | Environment variables exist, but the main implementation is still deferred. |

### Finnhub

Finnhub is skipped when `FINNHUB_API_KEY` is empty or the related feature is disabled. This is intentional so development does not consume quota unintentionally.

Important Finnhub variables:

```env
FINNHUB_API_KEY=
FINNHUB_BASE_URL=https://finnhub.io/api/v1
FINNHUB_ENABLED=true
FINNHUB_ENABLE_STOCK_DATA=true
FINNHUB_ENABLE_FUNDAMENTALS=true
FINNHUB_ENABLE_NEWS=false
FINNHUB_ENABLE_SENTIMENT=false
FINNHUB_ENABLE_EVENTS=false
FINNHUB_ENABLE_INSIDER=false
FINNHUB_ENABLE_FOREX=false
FINNHUB_ENABLE_CRYPTO=false
FINNHUB_ENABLE_SYMBOL_RESOLVER=true
FINNHUB_MAX_CALLS_PER_ANALYSIS=12
DATA_VENDOR_MAX_CALLS_PER_ANALYSIS=40
DATA_VENDOR_ENABLE_FINNHUB_FALLBACK=true
DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT=false
```

Recommended personal/development settings:

- Keep `DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS=false` to avoid calling multiple vendors for the same news category.
- Keep `DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT=false` unless the endpoint and Finnhub plan are ready.
- Enable Finnhub features gradually: stock/fundamentals first, then news/sentiment/event/insider data.

---

## Supported Markets

Trading analysis is limited to two main markets.

| Market | Accepted input | Backend normalization |
|---|---|---|
| `US` | `AAPL`, `NVDA`, `MSFT`, `SPY`, and other US tickers | Uppercase, without global suffixes. |
| `ID` | `BBCA`, `BBRI`, `TLKM`, `BMRI`, or `BBCA.JK` | Plain IDX codes are normalized to `.JK`, for example `BBCA.JK`. |

Important rules:

- `market` may only be `US` or `ID`.
- `trade_date` must be `YYYY-MM-DD` and cannot be more than 1 day in the future.
- `time_horizon_months` may only be `1`, `2`, or `3`.
- `max_debate_rounds` may only be `1` to `5`.
- `analysis_depth` may only be `fast`, `balanced`, or `deep`.
- `response_detail` may only be `summary`, `full`, or `debug`.
- Non-ID exchange suffixes such as `.HK`, `.T`, `.DE`, `.L`, `.AX`, and `.TO` are rejected.

---

## Analysis Depth

| Mode | LLM budget | Behavior |
|---|---:|---|
| `fast` | 6 calls | Lower cost. The debate/risk committee may be skipped. If `max_debate_rounds > 1`, a request warning is returned. |
| `balanced` | 9 calls | Default. Runs the full pipeline with the standard budget. |
| `deep` | 12 calls | Higher budget with more debate rounds and more patient retries. Useful for deeper analysis when the provider capacity allows it. |

`DEEP_THINK_LLM` is used for heavier stages such as Research Manager and Portfolio Manager. `QUICK_THINK_LLM` is used for lighter analyst/debate stages.

---

## Setup Without Docker

### 1. Clone

```bash
git clone https://github.com/MatthewSebastian15/TradingAgent.git
cd TradingAgent
```

### 2. Backend

```bash
cd backend
python -m venv venv
```

Activate the virtual environment:

```bash
# Linux/macOS
source venv/bin/activate

# Windows PowerShell
.\venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
pip install -e tradingagents-core/
```

Create the env file:

```bash
# Linux/macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Minimum required values:

```env
APP_ENV=development
LLM_PROVIDER=deepseek
DEEP_THINK_LLM=deepseek-chat
QUICK_THINK_LLM=deepseek-chat
DEEPSEEK_API_KEY=your_api_key_here
```

Run the backend:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create the env file:

```bash
# Linux/macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Minimum required values:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_ENABLE_MOCK=true
VITE_CLOCK_TIME_ZONE=Asia/Jakarta
VITE_CLOCK_LABEL=WIB
```

Run the frontend:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Setup With Docker

Create the backend env file:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`, then fill in the provider, model, and API key.

Run:

```bash
docker compose up --build
```

The main Compose build disables the mock UI. Use the mock overlay only when you need UI fixture data:

```bash
docker compose -f docker-compose.yml -f docker-compose.mock.yml up --build
```

Default URLs:

| Service | URL |
|---|---|
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:8000` |
| Health | `http://localhost:8000/health` |

The mock overlay adds `http://localhost:3000/analysis.test`.

Docker development binding:

- Backend binds to `127.0.0.1:8000`.
- Frontend binds to `127.0.0.1:3000`.
- Backend cache/results use Docker volumes.
- Frontend nginx can proxy `/api/*` to the backend.

If backend API key enforcement is enabled, set `BACKEND_API_KEY` in the host shell so nginx can inject `x-api-key` server-side. Do not put the backend API key in `VITE_*`, because all `VITE_*` values are visible in browser devtools.

The browser calls `POST /api/session` through nginx and stores the signed `x-owner-token` value in `sessionStorage`. The shared nginx `x-api-key` authenticates the proxy service only. It does not identify the browser owner.

### SQLite Analysis History

Completed analyses are stored as full JSON snapshots in SQLite. The Recent Analyses panel reads SQLite first and uses browser `localStorage` summaries only when the backend is unavailable.

The default local path is `backend/.cache/analysis_history.sqlite3`. Docker sets `ANALYSIS_DB_PATH=/root/.tradingagents/cache/analysis_history.sqlite3`, which uses the existing `tradingagent-cache` volume.

History is global for this personal app. Any valid owner session can view the same snapshots. The `CLEAR HISTORY` button deletes all SQLite history rows and local fallback summaries.

Stored results are historical snapshots. They are not live market recommendations. HTML preview and PDF export use the saved snapshot without fetching new market data or running the pipeline again.

Seed one static development snapshot without calling a provider or LLM:

```bash
cd backend
python scripts/seed_mock_analysis.py
```

### Docker + Ollama

Compose pins the Ollama image to `ollama/ollama:0.24.0`.

```bash
docker compose --profile ollama up --build
```

Pull the model:

```bash
docker exec -it tradingagent-ollama ollama pull llama3:latest
```

Set the backend env:

```env
LLM_PROVIDER=ollama
DEEP_THINK_LLM=llama3:latest
QUICK_THINK_LLM=llama3:latest
OLLAMA_BASE_URL=http://ollama:11434
```

---

## Environment Mode

The default project mode is development/personal use.

```env
APP_ENV=development
```

Production must be selected explicitly:

```env
APP_ENV=production
```

In production:

- `CORS_ORIGINS` must be explicit and cannot be `*`.
- `API_KEY` must be set.
- `REQUIRE_API_KEY_FOR_RATE_LIMIT=true` is recommended/required for secure deployment.
- `VITE_ENABLE_MOCK=false` is used by the main Compose build.

Default development CORS when `CORS_ORIGINS` is empty:

```env
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173
```

---

## Frontend Routes

| Route | Function |
|---|---|
| `/` | Redirects to `/home`. |
| `/home` | Dashboard/landing page. |
| `/analysis` | Main analysis page. |
| `/analysis/:jobId` | Opens a result from local history/backend lookup when available. |
| `/analysis-live` | Redirects to `/analysis`. |
| `/analysis.test` | Mock UI without real backend analysis. |
| `/analysis.test/:resourceId` | Mock result lookup. |
| `/analysis-mock` | Redirects to `/analysis.test` when the mock route is enabled. |
| `*` | 404 fallback. |

Mock routes are opt-in. The main Compose build uses `VITE_ENABLE_MOCK=false`. The mock overlay uses `VITE_ENABLE_MOCK=true`.

---

## API Reference

All main application routes use the `/api` prefix, except `/health`.

### GET `/health`

Lightweight liveness probe for Docker health checks.

Example response:

```json
{
  "status": "ok",
  "provider": "deepseek"
}
```

### POST `/api/session`

Creates a signed browser owner session after service authentication. The frontend stores the returned token in `sessionStorage` and sends it as `x-owner-token`.

### GET `/api/status`

Returns backend status, active model, cache, job store, circuit breaker, and worker timeout information.

### GET `/api/market/quotes`

Used by the dashboard for lightweight ticker tape quotes.

Query:

| Field | Rule |
|---|---|
| `symbols` | Optional comma-separated symbols, maximum 20 symbols. |

Example:

```http
GET /api/market/quotes?symbols=BBCA.JK,NVDA,AAPL
```

### GET `/api/ticker/validate`

Lightweight preflight validation for ticker and market data before the expensive pipeline is executed.

Query:

| Field | Rule |
|---|---|
| `ticker` | US or IDX symbol. |
| `market` | Optional `US` or `ID`. |
| `trade_date` | `YYYY-MM-DD`. |

### POST `/api/analysis/jobs`

Creates a cancellable analysis job and immediately returns a `job_id`.

Example request:

```json
{
  "ticker": "BBCA",
  "market": "ID",
  "trade_date": "2026-05-29",
  "time_horizon_months": 1,
  "max_debate_rounds": 3,
  "analysis_depth": "balanced",
  "response_detail": "full",
  "has_existing_position": false,
  "position_quantity": null,
  "average_entry_price": null
}
```

Example response:

```json
{
  "job_id": "...",
  "request_id": "...",
  "status": "queued",
  "events_url": "/api/analysis/jobs/{job_id}/events"
}
```

### GET `/api/analysis/jobs/{job_id}/events`

Server-Sent Events stream for job progress.

| Event | Content |
|---|---|
| `job` | Job summary when the stream opens. |
| `progress` | Agent started/completed events. |
| `heartbeat` | Keep-alive event when no new progress event is available. |
| `result` | Final structured result. |
| `error` | Sanitized error payload. |

### GET `/api/analysis/jobs/{job_id}`

Canonical endpoint for job status. It accepts only a real `job_id` and returns job metadata, the initial payload, timestamps, result, or error.

### GET `/api/analysis/{request_id}`

Deprecated migration alias for a completed final result. New clients must use `GET /api/analysis/jobs/{job_id}`. The alias still checks the signed browser owner session.

### DELETE `/api/analysis/jobs/{job_id}`

Canonical endpoint for cancelling a running job.

The old `DELETE /api/analysis/{job_id}` alias is kept only for backward compatibility and is hidden from OpenAPI docs.

### GET `/api/analysis/history`

Returns recent completed analysis snapshots from SQLite. The list contains compact metadata. It does not return the full result JSON.

Optional query fields:

| Field | Rule |
|---|---|
| `ticker` | Filters one normalized ticker. |
| `limit` | Number of rows from `1` to `100`. Defaults to `25`. |

History is global for this personal app. Any valid owner session can read the same stored snapshots.

### GET `/api/analysis/history/{request_id}`

Returns one full stored analysis snapshot without running the pipeline again.

### DELETE `/api/analysis/history/{request_id}`

Deletes one stored analysis snapshot.

### DELETE `/api/analysis/history`

Deletes all stored analysis snapshots. The frontend `CLEAR HISTORY` button uses this endpoint.

### POST `/api/analyze`

Legacy JSON endpoint. Runs the analysis and returns the final result directly after completion.

### POST `/api/analyze/stream`

Legacy SSE endpoint. Runs the analysis with streamed progress without using the newer job API.

---

## Request Fields

| Field | Type | Rule |
|---|---|---|
| `ticker` | string | US ticker or IDX ticker. For `market=ID`, send a plain code such as `BBCA`; the backend stores it as `BBCA.JK`. |
| `market` | string/null | Optional `US` or `ID`. |
| `trade_date` | string | Format `YYYY-MM-DD`; maximum 1 day in the future. |
| `time_horizon_months` | number | `1`, `2`, or `3`. |
| `max_debate_rounds` | number | Integer from `1` to `5`. |
| `analysis_depth` | string | `fast`, `balanced`, or `deep`. |
| `response_detail` | string | `summary`, `full`, or `debug`. |
| `has_existing_position` | boolean | `true` if the user already has a position. Default `false`. |
| `position_quantity` | number/null | Existing position quantity. Optional, non-negative. |
| `average_entry_price` | number/null | Average entry price for the existing position. Optional, non-negative. |

---

## Environment Variables

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `APP_ENV` | No | `development` or `production`. Default is development. |
| `CORS_ORIGINS` | Required in production | Explicit comma-separated origins. `*` is rejected. |
| `API_KEY` | Required in production | Backend API key for `x-api-key` or `Authorization: Bearer`. |
| `REQUIRE_API_KEY_FOR_RATE_LIMIT` | Recommended in production | If true, requests without a key are rejected. |
| `OWNER_SESSION_SECRET` | Required in production | HMAC secret for signed browser owner sessions. |
| `OWNER_SESSION_TTL_SECONDS` | No | Owner session TTL. Defaults to `ANALYSIS_JOB_TTL_SECONDS`. |
| `PIPELINE_TIMEOUT_SECONDS` / `PREFLIGHT_TIMEOUT_SECONDS` | No | Pipeline and ticker preflight timeouts. |
| `PROCESS_POOL_*` / `DATA_COLLECTION_WORKERS` / `ANALYST_PARALLEL_WORKERS` / `DEFAULT_MAX_DEBATE_ROUNDS` | No | Worker and debate limits for backend analysis. |
| `REQUEST_RATE_LIMIT_PER_MINUTE` / `STREAM_RATE_LIMIT_PER_MINUTE` / `MAX_CONCURRENT_*` / `REQUEST_BODY_MAX_BYTES` | No | Request, stream, concurrency, and body-size limits. |
| `CACHE_*` / `ANALYSIS_RESULT_CACHE_*` / `ANALYSIS_JOB_*` / `DATA_CACHE_*` | No | Result, job, and market-data cache settings. |
| `ANALYSIS_DB_PATH` / `ANALYSIS_HISTORY_MAX_ROWS` / `ANALYSIS_HISTORY_DEFAULT_LIMIT` | No | Permanent SQLite snapshot path, retained row cap, and default history list size. |
| `LLM_TIMEOUT_SECONDS` / `LLM_MAX_RETRIES` / `PROVIDER_SDK_MAX_RETRIES` / `TOOL_*` | No | LLM and tool resilience settings. |
| `XDG_CACHE_HOME` / `YFINANCE_CACHE_DIR` / `YFINANCE_TICKER_CACHE_MAX_ENTRIES` / `TRADINGAGENTS_TIMEOUT_MAX_ABANDONED_CALLS` | No | Runtime cache paths, yfinance ticker cache size, and abandoned timeout-call limit. |
| `LLM_PROVIDER` | Yes | `google`, `openai`, `anthropic`, `deepseek`, `openrouter`, or `ollama`. |
| `DEEP_THINK_LLM` | Yes | Model for heavy reasoning stages. |
| `QUICK_THINK_LLM` | Yes | Model for fast/analyst/debate stages. |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | If Google | Gemini API key. |
| `OPENAI_API_KEY` | If OpenAI | OpenAI API key. |
| `ANTHROPIC_API_KEY` | If Anthropic | Anthropic API key. |
| `DEEPSEEK_API_KEY` | If DeepSeek | DeepSeek API key. |
| `OPENROUTER_API_KEY` | If OpenRouter | OpenRouter API key. |
| `OLLAMA_BASE_URL` | If Ollama | Ollama URL. Default `http://localhost:11434`. |
| `ALPHA_VANTAGE_API_KEY` | No | Optional fallback/enrichment for market/news/fundamental data. |
| `GOOGLE_NEWS_LIGHT_API_KEY` | No | Optional SearchAPI.io key for Google News Light company news. |
| `FINNHUB_API_KEY` | No | Optional Finnhub key. If empty, Finnhub is skipped. |
| `FINNHUB_ENABLED` | No | Globally enables/disables Finnhub. |
| `FINNHUB_ENABLE_*` | No | Feature flags per Finnhub endpoint. |
| `DATA_VENDOR_*` | No | Vendor order per data category. |
| `DATA_VENDOR_MAX_CALLS_PER_ANALYSIS` | No | Vendor-call budget per analysis. |
| `DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS` | No | If true, news may be collected from multiple vendors at once. |
| `DATA_VENDOR_ENABLE_FINNHUB_FALLBACK` | No | Allows Finnhub as a fallback vendor. |
| `DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT` | No | Allows optional Finnhub enrichment. |
| `MAX_NEWS_PER_VENDOR` | No | News limit per vendor. |
| `MAX_TOTAL_NEWS_ITEMS` | No | Total news limit after deduplication. |
| `NEWS_DEDUP_BY` | No | News dedupe rule, default `url,title`. |
| `NEWS_MIN_RELEVANCE_SCORE` | No | Minimum news relevance score. |
| `DEFAULT_INDONESIA_SUFFIX` | No | Default `.JK`. |
| `DEFAULT_FOREX_EXCHANGE` | No | Default `OANDA`; still deferred. |
| `DEFAULT_CRYPTO_EXCHANGE` | No | Default `BINANCE`; still deferred. |
| `DEFAULT_US_EXCHANGE` | No | Default `US`. |

### `frontend/.env`

| Variable | Example default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Backend base URL. Docker/Nginx uses relative `/api/*`. |
| `VITE_API_URL` | Empty | Legacy alias. Use `VITE_API_BASE_URL` for new configuration. |
| `VITE_DEV_HOST` | `127.0.0.1` | Vite development and preview host. |
| `VITE_DEV_PORT` | `3000` | Vite development and preview port. |
| `VITE_CLOCK_TIME_ZONE` | `Asia/Jakarta` | Navbar clock timezone. |
| `VITE_CLOCK_LABEL` | `WIB` | Navbar clock label. |
| `VITE_ENABLE_MOCK` | `false` | Enables mock routes when explicitly set to `true` before build or local Vite startup. |

---

## Credits

- Trading engine: [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
- Backend: [FastAPI](https://fastapi.tiangolo.com/) + [sse-starlette](https://github.com/sysid/sse-starlette)
- Frontend: [React](https://react.dev/) + [Vite](https://vite.dev/)
- Main market data: [yfinance](https://github.com/ranaroussi/yfinance)
- Optional data vendors: Alpha Vantage and Finnhub
- Pipeline orchestration: LangGraph-compatible TradingAgents core

---

## Citation

```bibtex
@misc{xiao2025tradingagentsmultiagentsllmfinancial,
      title={TradingAgents: Multi-Agents LLM Financial Trading Framework},
      author={Yijia Xiao and Edward Sun and Di Luo and Wei Wang},
      year={2025},
      eprint={2412.20138},
      archivePrefix={arXiv},
      primaryClass={q-fin.TR},
      url={https://arxiv.org/abs/2412.20138},
}
```

Paper: https://arxiv.org/abs/2412.20138
