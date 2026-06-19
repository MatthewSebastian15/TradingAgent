# Architecture

Last synced: 2026-06-19.

This document explains the active code architecture. Use it when changing routes,
frontend flow, pipeline, cache, Docker, env, market, news, or reports.

## System View

```text
Browser
  -> React/Vite frontend
  -> /api through Vite proxy, nginx proxy, or direct backend URL
  -> FastAPI backend
  -> ProcessPoolExecutor worker
  -> tradingagents balanced pipeline
  -> vendor data + LLM clients
  -> result cache + SQLite history + report service
```

Local Vite recommended:

```text
Browser http://127.0.0.1:3000
  -> /api/*
  -> Vite proxy target VITE_BACKEND_PROXY_TARGET=http://localhost:8000
  -> FastAPI
```

Docker Compose default:

```text
Browser http://localhost:3000
  -> frontend container Vite dev server
  -> /api proxy target http://backend:8000
  -> backend container FastAPI
```

Production image path:

```text
Browser
  -> frontend nginx runtime listen 8080
  -> /api/ proxy_pass http://backend:8000/api/
```

## Ports

| Component | Host | Container/internal | Source |
|---|---:|---:|---|
| Backend local | `127.0.0.1:8000` | none | uvicorn command |
| Backend Compose | `127.0.0.1:8000` | `0.0.0.0:8000` | `docker-compose.yml` |
| Frontend local Vite | `127.0.0.1:3000` | none | `frontend/vite.config.js` |
| Frontend Compose Vite | `127.0.0.1:3000` | `0.0.0.0:3000` | compose command `npm run dev:lan` |
| Frontend nginx runtime | depends on run command | `8080` | `Dockerfile.frontend`, `nginx.conf` |
| Ollama Compose | `127.0.0.1:11434` | `ollama:11434` | compose profile `ollama` |

## Backend App

`backend/main.py` owns app setup.

Lifespan:

- Installs fresh `AnalysisRuntimeState` into `app.state.analysis_runtime`.
- Installs rate limiter state for tests/dev.
- Runs startup validation and logs issues.
- Starts general news background worker when enabled.
- Stops news worker and process pool on shutdown.

Middleware registration order in `main.py`:

```text
RequestBodyLimitMiddleware
GZipMiddleware
SkipSseCompressionMiddleware
RequestIdMiddleware
CORSMiddleware
```

SSE compression skip paths:

```text
/api/analyze/stream
/api/news/general/stream
/api/news/{ticker}/stream
/api/analysis/jobs/{job_id}/events
```

Routers:

```text
analysis_history_router -> /api
analysis_router         -> /api
debug_router            -> /api
market_router           -> /api
news routers            -> /api
reports_router          -> /api
session_router          -> /api
```

`/health` is direct on app. It returns status, provider, and report asset health.
`/api/debug/llm-cache` is direct on app and development-only.

## Config Boundary

Use `backend/config.py` as public facade.

| File | Role |
|---|---|
| `config_env.py` | Loads `backend/.env` outside tests, parses bool/int/float/list. |
| `config_defaults.py` | App defaults, CORS, timeout, workers, rate limit, cache, vendors, news. |
| `config_llm.py` | `LLMSettings`, model/provider config, `build_tradingagents_config()`. |
| `config_validation.py` | Startup config issues and writable path checks. |
| `config.py` | Reload helper and re-exports. |

Config can fail at import for hard constraints:

- `APP_ENV` not `development` or `production`.
- `CORS_ORIGINS=*`.
- Production without `API_KEY`.
- Production without `OWNER_SESSION_SECRET`.
- Production with `REQUIRE_API_KEY_FOR_RATE_LIMIT=false`.
- Invalid storage backend enum.

Startup validation logs and continues in `main.validate_config()`:

- Missing `LLM_PROVIDER`.
- Unsupported `LLM_PROVIDER`.
- Missing `LLM_API_KEY`.
- Missing quick/deep model.
- Missing optional vendor keys.
- Debug endpoints enabled.
- Writable path failures.

## Auth and Rate Limit

Two credentials exist.

Service credential:

- Headers: `x-api-key` or `Authorization: Bearer`.
- Validates against `API_KEY`.
- Optional only in development when `API_KEY` is blank and
  `REQUIRE_API_KEY_FOR_RATE_LIMIT=false`.

Owner session:

- `POST /api/session` issues signed owner token.
- Response sets cookie `ta_owner_token`.
- Cookie path is `/api`.
- Cookie is HttpOnly and SameSite Lax.
- Backend accepts owner token from `x-owner-token` header or cookie.
- Frontend uses cookie only.
- Development blank `OWNER_SESSION_SECRET` uses persistent cache secret
  `.owner_session_secret` under `XDG_CACHE_HOME` or user cache.

Rate limiter:

| Policy | Default per minute | Default concurrent |
|---|---:|---:|
| request | 20 | 2 |
| status | 120 | 8 |
| stream | 8 | 1 |
| market | 180 | 16 |

Storage:

- Default `RATE_LIMIT_STORAGE_BACKEND=sqlite`.
- SQLite path default `.cache/rate_limits.sqlite3`.
- `memory` allowed only outside production.

## Analysis Runtime

`backend/routes/jobs.py` creates runtime state:

```text
AnalysisRuntimeState
  result_cache: AnalysisResultCache
  in_flight: InFlightRegistry
  job_store: AnalysisJobStore
```

Result cache:

- TTL/LRU in memory.
- Adds `cache.hit` and source metadata.
- Cache key includes ticker, date, provider, models, mode, depth, horizon,
  debate rounds, response detail, position fields, and cache version.

In-flight registry:

- Deduplicates identical running analysis requests.
- Joined calls receive cache source `in_flight`.

Job store:

- Tracks queued/running/completed/failed/cancelled.
- Stores bounded event replay.
- Persists active and terminal snapshots into SQLite TTL cache when backend
  storage is sqlite.
- Live cancellation still needs same worker/process.

## Canonical Analysis Flow

```text
POST /api/session
  -> cookie owner session

POST /api/analysis/jobs
  -> validate request
  -> apply stream rate policy
  -> create job with owner_id
  -> start background task
  -> return job_id

GET /api/analysis/jobs/{job_id}/events
  -> apply stream rate policy
  -> owner-check job
  -> replay job event history
  -> stream job/progress/heartbeat/result/error

GET /api/analysis/jobs/{job_id}
  -> owner-check job
  -> fallback to persisted job/history when possible

DELETE /api/analysis/jobs/{job_id}
  -> owner-check job
  -> set cancel event and cancel task best effort
```

Legacy `/api/analyze` and `/api/analyze/stream` still share cache/pipeline
helpers, but new frontend work must use job API.

## Process Pool

`backend/routes/pipeline_runner.py` owns process pool.

| Setting | Default |
|---|---:|
| `PROCESS_POOL_WORKERS` | 2 |
| `PROCESS_POOL_MAX_TASKS_PER_CHILD` | 1 |
| `PIPELINE_TIMEOUT_SECONDS` | 600 |
| `PREFLIGHT_TIMEOUT_SECONDS` | min(30, pipeline timeout) |

Multiprocessing uses spawn context for Windows and Docker safety.

Cancellation:

- Job cancel sets an async job cancel event.
- Worker receives process-safe cancel event.
- Pipeline checks `cancel_check`.
- Future cancel is best effort.
- SSE disconnect returns from stream; job cancel is explicit through DELETE.

## Balanced Pipeline

Facade:

```text
packages/tradingagents/pipeline_balanced.py
```

Implementation split:

| File | Role |
|---|---|
| `pipeline_balanced_data.py` | Data collection, vendor routing, chart, deterministic builders. |
| `pipeline_balanced_prompts.py` | Prompt templates. |
| `pipeline_balanced_llm.py` | LLM calls, exact cache, fallbacks, usage logging. |
| `pipeline_balanced_progress.py` | Progress event labels. |
| `pipeline_balanced_orchestrator.py` | Stage orchestration and response assembly. |
| `pipeline_balanced_types.py` | Dataclasses and types. |

Execution:

```text
Preflight
  -> collect_market_data
  -> initial analysts in parallel
  -> bull
  -> bear
  -> research manager
  -> trader
  -> risk committee
  -> portfolio manager
  -> normalize_trade_levels
  -> guardrail
  -> build_response
  -> route serializer
```

Progress agent ids:

```text
data_collection
news_fetch
data_quality
market_analyst
news_analyst
fundamentals
bull_researcher
bear_researcher
research_manager
trader
risk_analysts
portfolio_manager
```

Depth behavior:

| Depth | Budget | Debate | Risk |
|---|---:|---:|---:|
| `fast` | 6 | 1 | 1 |
| `balanced` | 9 | 2 | 2 |
| `deep` | 12 | 3 | 3 |

`deep_think_llm` is used for Research Manager and Portfolio Manager.
`quick_think_llm` is used for other agent calls.
LLM client retry count uses `LLM_MAX_RETRIES`.

## LLM Clients and Cache

Supported providers:

```text
google, openai, anthropic, deepseek, openrouter, ollama
```

OpenAI-compatible providers share `OpenAIClient`:

```text
openai, deepseek, openrouter, ollama
```

Primary env:

```text
LLM_PROVIDER
LLM_API_KEY
QUICK_THINK_LLM
DEEP_THINK_LLM
LLM_BASE_URL optional
OLLAMA_BASE_URL optional
```

Provider-specific key envs still exist for compatibility:

```text
GOOGLE_API_KEY
GEMINI_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
DEEPSEEK_API_KEY
OPENROUTER_API_KEY
```

Exact cache:

- Enabled by default.
- SQLite path `.cache/llm_exact_cache.sqlite3`.
- Key uses provider, model, agent name, schema name, prompt hash.

Semantic cache:

- Disabled by default.
- Used only for configured targets if enabled.

## Market and Ticker Model

Frontend ticker input uses yfinance search:

```text
TickerSearchBar -> GET /api/market/search?q=...&limit=10
```

The selected canonical symbol becomes request `ticker`.

Validation:

- `ticker` or `symbol` accepted.
- `search_metadata.canonical`, `symbol`, or `ticker` can override raw ticker.
- Plain IDX ticker is not auto-suffixed.
- `market=ID` does not append `.JK`.
- Accepted market values: `IDX`, `ID`, `US`, `GLOBAL`, `CRYPTO`, `ETF`,
  `FUND`, `UNKNOWN`.
- Global suffixes such as `.HK`, `.T`, `.DE` are accepted when symbol regex
  passes.

## Market Dashboard

Frontend path:

```text
/market -> frontend/src/pages/Market.jsx
```

Frontend client:

```text
frontend/src/api/market.js
```

Backend endpoints:

```text
GET  /api/market/presets
GET  /api/market/validate-symbol
POST /api/market/overview
GET  /api/market/movers
GET  /api/market/search
GET  /api/market/ohlcv
GET  /api/market/sparklines
GET  /api/market/quotes
```

UI components:

```text
frontend/src/components/market/MarketTab.jsx
frontend/src/components/market/GlobalMarketOverview.jsx
frontend/src/components/market/MarketMoversPanel.jsx
frontend/src/components/market/MarketOverviewPicker.jsx
frontend/src/components/market/MarketMoversTable.jsx
```

Data comes from yfinance through `backend/services/market_yfinance_service.py`.
Quote, OHLCV, search, and sparkline endpoints also use short in-process caches
inside `backend/routes/market.py`.

Market endpoint limits:

| Endpoint | Main cap |
|---|---|
| `/market/overview` | 3 to 6 normalized symbols. |
| `/market/movers` | limit is one of 5, 10, 15, 20. |
| `/market/search` | query min 2, limit 1 to 20. |
| `/market/ohlcv` | ranges `YTD`, `1Y`, `6M`, `3M`, `1M`, `1W`. |
| `/market/sparklines` | max 20 symbols, same range set as OHLCV. |
| `/market/quotes` | max 20 symbols. |

## Data Collection

Collected payload areas:

- Price and OHLCV.
- Technical indicators and technical entry.
- Fundamentals, statements, highlights, trends, valuation, scenarios.
- Company profile.
- Company news and market context news.
- News impact, catalysts, analyst consensus.
- Insider, event, sentiment when vendor supports it.
- Data quality, data freshness, completeness, lineage/source metadata.

Vendor defaults:

```text
core stock: yfinance,finnhub,alpha_vantage
quote: yfinance,finnhub,alpha_vantage
technical: yfinance,finnhub,alpha_vantage
fundamental: yfinance,finnhub,alpha_vantage
statements: yfinance,sec_companyfacts,alpha_vantage,finnhub
company news: google_news_light,marketaux,newsdata,yfinance,finnhub,alpha_vantage
global news: finnhub,alpha_vantage,yfinance
sentiment: finnhub,alpha_vantage
social sentiment: finnhub
events: finnhub
analyst rating: finnhub
insider: finnhub,alpha_vantage,yfinance
forex: finnhub,alpha_vantage
crypto: finnhub,alpha_vantage
```

## News Architecture

Company news:

```text
GET /api/news/{ticker}
  -> normalize_ticker_symbol
  -> NewsService.fetch_news
  -> providers: google_news_light, marketaux, rss_context, newsdata, yfinance

GET /api/news/{ticker}/stream
  -> normalize_ticker_symbol
  -> poll NewsService.fetch_news(force_refresh=True)
  -> ticker_news_event_bus
```

General news:

```text
GET /api/news/general
GET /api/news/general/categories
GET /api/news/general/stream
  -> GeneralNewsService
  -> rss_context first by default
  -> optional SSE updates from background worker
```

General news stream event:

```text
event: general_news_updated
data: {...}
```

Ticker news stream events:

```text
event: ticker_news_stream_ready
data: {"ticker": "...", "poll_seconds": 120}

event: ticker_news_updated
data: {...}
```

Frontend `useGeneralNews()` connects to stream. If stream fails, it polls every
60 seconds.

## Persistence

Local defaults:

| Data | Path |
|---|---|
| Analysis history | `.cache/analysis_history.sqlite3` |
| Analysis job TTL cache | `.cache/analysis_jobs.sqlite3` |
| Rate limits | `.cache/rate_limits.sqlite3` |
| Market data cache | `.cache/market_data.sqlite3` |
| News cache | `.cache/news_data.sqlite3` |
| General news cache | `.cache/general_news.sqlite3` |
| Exact LLM cache | `.cache/llm_exact_cache.sqlite3` |
| Semantic LLM cache | `.cache/llm_semantic_cache.sqlite3` |

Compose backend overrides these under:

```text
/home/tradingagent/.tradingagents/cache
```

## Frontend Architecture

Routes in `frontend/src/App.jsx`:

```text
/                         -> /home
/home                     -> Dashboard
/ai-agent                 -> AIAgent
/ai-agent/:resourceId     -> AIAgent lookup
/AI-Research              -> redirect /ai-agent
/AI-Research/:resourceId  -> redirect /ai-agent/:resourceId
/ai-research              -> redirect /ai-agent
/ai-research/:resourceId  -> redirect /ai-agent/:resourceId
/analysis                 -> redirect /ai-agent
/analysis/:resourceId     -> redirect /ai-agent/:resourceId
/analysis-live            -> redirect /ai-agent
/research                 -> Research placeholder
/watchlist                -> Watchlist
/news                     -> News
/market                   -> Market dashboard
/econ                     -> Economic placeholder
/economic                 -> redirect /econ
/ai-agent.test            -> mock AIAgent if enabled
/ai-agent.test/:resourceId -> mock AIAgent lookup if enabled
/AI-Research.test         -> legacy mock redirect if enabled
/AI-Research.test/:resourceId -> legacy mock redirect if enabled
/ai-research.test         -> legacy mock redirect if enabled
/ai-research.test/:resourceId -> legacy mock redirect if enabled
/analysis.test            -> legacy mock redirect if enabled
/analysis.test/:resourceId -> legacy mock redirect if enabled
/analysis-mock            -> legacy mock redirect if enabled
*                         -> NotFound
```

State/storage:

| Area | Storage |
|---|---|
| Owner session token | HttpOnly cookie from backend |
| Owner session expiry | `sessionStorage` key `_ta_owner_session_expires_at` |
| Watchlist groups | `localStorage` key `tradingagents:watchlists:v1` |
| Local history summary | `localStorage` key `ta_analysis_history` |
| Mock history summary | `localStorage` key `ta_analysis_mock_history` |
| Full history | Backend SQLite |

API helper:

```text
buildApiUrl(path)
  base = VITE_API_BASE_URL or VITE_API_URL or /api default
  if base ends /api, avoid double /api
```

`buildHeaders()` and `buildAuthHeaders()` call `ensureOwnerSession()`.
They rely on cookie for auth.

## Home Dashboard

Frontend path:

```text
/home -> frontend/src/pages/Dashboard.jsx
```

Current behavior:

- Renders `Navbar`.
- Calls `useGeneralNews({ category: "all", windowDays: 7, limit: 100 })`.
- Passes `data.articles` into `HomeNewsSummary`.
- `HomeNewsSummary` normalizes article shape, sorts by newest, and shows top 3.
- Empty, loading, and error states are local UI states. No separate home API
  exists.

Files:

```text
frontend/src/pages/Dashboard.jsx
frontend/src/components/home/HomeNewsSummary.jsx
frontend/src/lib/news/normalizeNewsItem.js
frontend/src/lib/news/sortNewsItemsByNewest.js
frontend/src/lib/news/formatNewsTime.js
frontend/src/hooks/useGeneralNews.js
```

## Watchlist

Frontend path:

```text
/watchlist -> frontend/src/pages/Watchlist.jsx
```

State model:

```text
localStorage key: tradingagents:watchlists:v1
shape:
  version
  activeGroupId
  groups[]
    id
    name
    createdAt
    updatedAt
    items[]
      symbol
      name
      exchange
      market
      type
      source
      addedAt
```

Behavior:

- Watchlist groups are local browser state only.
- Group names are required, unique case-insensitively, and max 40 characters.
- Manual ticker add validates through `GET /api/market/validate-symbol`.
- Search-backed ticker add uses `WatchlistTickerInput` and market search data.
- Quotes poll every 100 seconds through `GET /api/market/quotes`.
- Trend mini-series use `GET /api/market/sparklines?range=1M`.
- Trend cache TTL in the browser is 5 minutes.

Files:

```text
frontend/src/pages/Watchlist.jsx
frontend/src/components/watchlist/WatchlistPage.jsx
frontend/src/components/watchlist/WatchlistTickerInput.jsx
frontend/src/components/watchlist/WatchlistTable.jsx
frontend/src/components/watchlist/WatchlistGroupBar.jsx
frontend/src/components/watchlist/WatchlistGroupDialog.jsx
frontend/src/services/watchlistStorage.js
frontend/src/hooks/useWatchlistStore.js
frontend/src/hooks/useWatchlistQuotes.js
frontend/src/utils/watchlistFormatters.js
```

## Docker Architecture

`docker-compose.yml` default services:

| Service | Build/runtime | Host port | Detail |
|---|---|---:|---|
| backend | `Dockerfile.backend` runtime + bind mount + reload | 8000 | Python 3.11, FastAPI |
| frontend | `Dockerfile.frontend` target `dev` | 3000 | Vite dev server |
| ollama | `ollama/ollama:0.24.0` profile | 11434 | Optional local LLM |

Default compose frontend is not nginx. It runs:

```text
npm run dev:lan
```

Production frontend runtime exists in `Dockerfile.frontend`:

- Build target `runtime`.
- Nginx listens `8080`.
- `/api/` proxies to `http://backend:8000/api/`.
- `/health` returns `ok`.

## Report Architecture

```text
completed result
  -> get_analysis_result_for_report
  -> build_report_context
  -> render_analysis_report_html
  -> render_analysis_report_pdf
  -> mark_exported best effort
```

Files:

```text
backend/routes/reports.py
backend/services/report_service.py
backend/services/report_disclaimer.py
backend/templates/reports/analysis_report.html
backend/static/reports/analysis_report.css
frontend/src/utils/reportApi.js
frontend/src/utils/reportDisclaimer.js
frontend/src/components/ExportReportButtons.jsx
```

Direct POST report fallback validates bounded payload size/depth before render.
PDF rendering is limited by semaphore and timeout.
