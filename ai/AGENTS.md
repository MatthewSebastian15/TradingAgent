# TradingAgent AI Context

Last synced: 2026-06-19.

This file is the main context for the coding agent. Read it before editing code, docs,
Docker, env, tests, or API contracts.

## Working Mode

- Answer users and implementation output in English.
- Be brief. Go straight to files, commands, tests, and results.
- Do not use filler or pleasantries.
- Do not show long reasoning.
- Do not change files outside the scope.
- Do not revert user changes.
- If you start any local process that binds to a port, stop it after the task or verification finishes.
- Track the command, port, and PID for every dev server, API server, preview server,
  Docker Compose service, or test server you start.
- Before the final response, confirm your started port-bound processes are stopped
  or state that the user explicitly asked to keep one running.
- Do not commit secrets, `.env`, cache files, SQLite databases, build output, or `node_modules`.
- If you change backend/frontend contracts, update the `ai/` docs and related tests.

Default report format after implementation:

```text
Files changed:
- path/file

Summary:
- Core changes.

Tests:
- command
- result

Risk:
- important risk, or "No major risk is visible."
```

## Project Goal

TradingAgent is a full-stack application for stock and asset research powered by
multi-agent LLMs.

- Backend: FastAPI in `backend/`.
- Agent engine: editable package `packages`, imported as `tradingagents`.
- Frontend: React 18 + Vite in `frontend/`.
- Main UI: Home dashboard with top news summary, AI Agent terminal, watchlist,
  market dashboard, general news, research placeholder, economic placeholder.
- Analysis output: Buy, Hold, Sell, Wait, risk, thesis, chart, news,
  fundamentals, HTML/PDF report.
- The report disclaimer must remain. This is a research tool, not financial advice.

## Current Important Facts

- Primary UI route: `/ai-agent`.
- Legacy `/AI-Research`, `/ai-research`, `/analysis`, and `/analysis-live`
  redirect to `/ai-agent`.
- Backend API prefix: `/api`.
- Health endpoint without prefix: `/health`.
- Frontend default API base: `/api`.
- Vite dev has a `/api` proxy.
- Local Vite needs `VITE_BACKEND_PROXY_TARGET=http://localhost:8000` if the backend
  runs on the Windows host.
- Docker Compose defaults to the frontend Vite dev stage, not the nginx runtime.
- Dockerfile frontend runtime nginx listens on `8080`, not `80`.
- `frontend/.env.example` is not in the repo right now.
- `backtest/` and `assets/` are not in the tree right now.
- `image/` contains README screenshots.
- `graphify-out/` is graph cache output, not runtime app source.
- Browser auth uses the HttpOnly `ta_owner_token` cookie from `POST /api/session`.
- The frontend does not send `x-owner-token`; `buildAuthHeaders()` only ensures
  the session cookie exists.
- The backend still accepts `x-owner-token` for tests and legacy clients.
- `validate_startup_config()` returns issues. `main.validate_config()` logs issues,
  then the server keeps running for local debugging.
- Some config errors still raise at import time, for example invalid `APP_ENV`,
  wildcard CORS, production without `API_KEY`, or production without
  `OWNER_SESSION_SECRET`.
- The primary LLM key is now `LLM_API_KEY`. Provider-specific keys are still legacy
  or SDK fallback keys.
- Market input uses the canonical yfinance symbol from `/api/market/search`.
- Plain IDX tickers are not auto-suffixed with `.JK`. Select `BBCA.JK` from search
  for IDX.
- The backend accepts these markets: `IDX`, `ID`, `US`, `GLOBAL`, `CRYPTO`, `ETF`,
  `FUND`, `UNKNOWN`.
- Non-ID suffixes such as `.HK`, `.T`, `.DE` are accepted when they are canonical yfinance symbols.
- The `/market` page is active and uses overview, presets, movers, and ticker tape.
- The `/watchlist` page is active. It stores groups in browser localStorage and
  uses market quotes plus sparklines from the backend.
- The `/home` page shows `HomeNewsSummary`, fed by `useGeneralNews()` with the
  top 3 newest articles.
- `/research` page placeholder.
- The `/econ` page is a placeholder. `/economic` redirects to `/econ`.

## Repository Map

```text
TradingAgents/
  ai/                         agent docs
  backend/
    main.py                   FastAPI app, middleware, lifespan, routers
    config_env.py             .env loader and env parsers
    config_defaults.py        defaults, limits, caches, vendors, news
    config_llm.py             LLM settings and TradingAgents config builder
    config_validation.py      startup validation
    analysis_cache.py         result cache, in-flight dedupe, job store
    rate_limiter.py           service credential, owner session, quotas
    owner_session.py          signed owner token and cookie name
    routes/
      analysis.py             analyze, jobs, SSE, status, ticker validate
      analysis_history.py     SQLite history API
      market.py               presets, validate-symbol, overview, movers, search, OHLCV, sparklines, quotes
      news.py                 company news, ticker news SSE, general news, general news SSE
      reports.py              disclaimer, HTML/PDF report
      session.py              owner session cookie
      debug.py                debug endpoints gated by env/development
    services/
      analysis_repository.py  permanent SQLite history
      market_yfinance_service.py market overview and movers helpers
      market_symbol_universe.py local ticker search universe
      report_service.py       report context, HTML, PDF
      report_disclaimer.py    canonical disclaimer
  packages/
    pyproject.toml
    tradingagents/
      pipeline_balanced.py              facade
      pipeline_balanced_data.py         deterministic data collection
      pipeline_balanced_orchestrator.py control flow
      pipeline_balanced_llm.py          LLM call, cache, fallback
      pipeline_balanced_progress.py     progress labels
      dataflows/                        vendor/data/news layer
      fundamentals/                     deterministic fundamentals
      financial_highlights/             financial table builders
      llm_clients/                      provider clients
      llm_cache/                        exact and semantic cache
    tests/
  frontend/
    vite.config.js            Vite dev server and /api proxy
    nginx.conf                production nginx template
    src/
      App.jsx                 routes
      constants/routes.js     primary and legacy routes
      config.js               frontend env resolver
      api/market.js           market dashboard API client
      domain/analysisContract.js request payload and validation
      services/watchlistStorage.js local watchlist persistence
      utils/api.js            API URL and owner session bootstrap
      hooks/useAnalysisJob.js job API and SSE stream
      hooks/useGeneralNews.js general news fetch and SSE
      hooks/useWatchlistStore.js local watchlist groups
      hooks/useWatchlistQuotes.js watchlist quote and trend polling
      components/             UI components
      components/home/         Home dashboard widgets
      components/watchlist/    Watchlist groups, input, table, trend bars
      pages/                  Dashboard, AIAgent, Watchlist, News, Market, Research, Economic
  image/                      README screenshots
```

## Active Routes

Frontend:

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
/news                     -> General News page
/market                   -> Market dashboard
/econ                     -> Economic placeholder
/economic                 -> redirect /econ
*                         -> NotFound
```

Backend canonical API:

```text
POST   /api/session
POST   /api/analysis/jobs
GET    /api/analysis/jobs/{job_id}
GET    /api/analysis/jobs/{job_id}/events
DELETE /api/analysis/jobs/{job_id}
GET    /api/status
GET    /api/ticker/validate
GET    /api/analysis/history
GET    /api/analysis/history/{request_id}
DELETE /api/analysis/history/{request_id}
DELETE /api/analysis/history
GET    /api/market/presets
GET    /api/market/validate-symbol
POST   /api/market/overview
GET    /api/market/movers
GET    /api/market/search
GET    /api/market/ohlcv
GET    /api/market/sparklines
GET    /api/market/quotes
GET    /api/news/general
GET    /api/news/general/categories
GET    /api/news/general/stream
GET    /api/news/{ticker}/stream
GET    /api/news/{ticker}
GET    /api/reports/disclaimer
GET    /api/analysis/jobs/{job_id}/report.html
GET    /api/analysis/jobs/{job_id}/report.pdf
POST   /api/analysis/report.html
POST   /api/analysis/report.pdf
```

Active legacy routes:

```text
POST   /api/analyze
POST   /api/analyze/stream
GET    /api/analysis/{request_id}
DELETE /api/analysis/{job_id}
GET    /api/analysis/{request_id}/report.html
GET    /api/analysis/{request_id}/report.pdf
```

Debug:

```text
GET /api/debug/llm-cache        development only
GET /api/debug/news/{ticker}    development only
GET /api/debug/health           DEBUG_ENDPOINTS_ENABLED=true
GET /api/debug/vendor/{vendor_name} DEBUG_ENDPOINTS_ENABLED=true
GET /api/debug/symbol/{ticker}  DEBUG_ENDPOINTS_ENABLED=true
GET /api/debug/metrics          DEBUG_ENDPOINTS_ENABLED=true
GET /api/debug/vendor-stats     DEBUG_ENDPOINTS_ENABLED=true
```

## Auth Model

Service credential:

- Header: `x-api-key: <API_KEY>` or `Authorization: Bearer <API_KEY>`.
- Optional in development when `API_KEY` blank and
  `REQUIRE_API_KEY_FOR_RATE_LIMIT=false`.
- Required when `API_KEY` is set.
- Required in production.
- Docker nginx can inject `x-api-key` from `BACKEND_API_KEY`.

Owner session:

- `POST /api/session` validates service credential.
- Response contains `owner_token` and `expires_at`.
- Response also sets cookie `ta_owner_token`.
- Cookie: HttpOnly, SameSite Lax, path `/api`, Secure only in production.
- Protected endpoints use owner identity from `x-owner-token` header or cookie.
- Frontend uses cookie. Tests often use `x-owner-token`.

## Analysis Flow

```text
Browser
  -> POST /api/session
  <- owner cookie
  -> POST /api/analysis/jobs
  <- job_id, request_id, events_url
  -> GET /api/analysis/jobs/{job_id}/events
  <- SSE job, progress, heartbeat, result, error
  -> GET /api/analysis/jobs/{job_id}
  <- status/result
  -> GET /api/analysis/jobs/{job_id}/report.html|pdf
```

Legacy `/api/analyze` and `/api/analyze/stream` remain for compatibility. Do not
use them for new frontend work.

## Pipeline

Canonical entry:

```text
packages/tradingagents/pipeline_balanced.py
```

Flow:

```text
Preflight market data
  -> Data Collection
  -> News Providers
  -> Data Quality
  -> Market Analyst, News + Social Analyst, Fundamentals Analyst
  -> Bull Researcher
  -> Bear Researcher
  -> Research Manager
  -> Trader
  -> Risk Analysts
  -> Portfolio Manager
  -> trade level normalization
  -> guardrail
  -> serializer response shaping
  -> SQLite history
```

Parallelism:

- FastAPI routes stay async.
- Full pipeline runs in `ProcessPoolExecutor`.
- Data collection inside worker uses `ThreadPoolExecutor`.
- Initial analysts run parallel, capped to 3.
- Debate and final decision run sequential.

Depth:

| Depth | LLM budget | Debate | Risk |
|---|---:|---:|---:|
| `fast` | 6 | 1 | 1 |
| `balanced` | 9 | 2 | 2 |
| `deep` | 12 | 3 | 3 |

LLM client retry count uses `LLM_MAX_RETRIES`.

## Data and News

Primary market data uses yfinance symbols.

Vendor defaults live in `backend/config_defaults.py`.

Important defaults:

- `DATA_VENDOR_CORE_STOCK_APIS=yfinance,finnhub,alpha_vantage`
- `DATA_VENDOR_FINANCIAL_STATEMENTS=yfinance,sec_companyfacts,alpha_vantage,finnhub`
- `DATA_VENDOR_NEWS_DATA=google_news_light,marketaux,newsdata,yfinance,finnhub,alpha_vantage`
- `DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS=true`
- `DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT=true`
- `DATA_VENDOR_MAX_CALLS_PER_ANALYSIS=60`

News has two paths:

- Strict company news for AI analysis: `NewsService`, exposed at
  `/api/news/{ticker}` and optional ticker update stream `/api/news/{ticker}/stream`.
- General news page: `GeneralNewsService`, exposed at `/api/news/general` and
  `/api/news/general/stream`.

Market dashboard uses:

- `GET /api/market/presets`
- `GET /api/market/validate-symbol`
- `POST /api/market/overview`
- `GET /api/market/movers`
- `GET /api/market/search`
- `GET /api/market/ohlcv`
- `GET /api/market/sparklines`
- `GET /api/market/quotes`

General news background refresh starts when:

```text
GENERAL_NEWS_ENABLED=true
GENERAL_NEWS_ENABLE_BACKGROUND_REFRESH=true
```

## Config Rules

- Import backend runtime config from `config.py`.
- Add raw defaults in `config_defaults.py` or `config_llm.py`.
- Use `config_env.py` parsers. Do not read `os.environ` in routes/services.
- Add env to `backend/.env.example` only if user should set it.
- Update `ai/setup.md` for env changes.
- Update tests when validation or behavior changes.

## Frontend Rules

- Do not hardcode backend URL in components.
- Use `buildApiUrl()` from `frontend/src/utils/api.js`.
- Use `buildHeaders()` for JSON requests and `buildAuthHeaders()` for auth
  bootstrap.
- Use `credentials: 'include'` when fetch must carry cookie.
- Do not manually manage owner token in frontend storage.
- Ticker input must use `TickerSearchBar` and `/api/market/search` unless user
  explicitly asks for manual mode.
- Keep primary route `/ai-agent`.
- Keep legacy redirects unless doing planned migration.

## Files to Check by Change Type

Analysis request/response:

```text
backend/routes/validation.py
backend/schemas.py
backend/routes/serializers.py
frontend/src/domain/analysisContract.js
frontend/src/components/StockForm.jsx
frontend/src/hooks/useAnalysisJob.js
frontend/src/components/ResultCard.jsx
backend/tests/test_analysis_contract_snapshot.py
frontend/src/domain/analysisContract.test.js
ai/api.md
```

Auth/session/rate limit:

```text
backend/owner_session.py
backend/rate_limiter.py
backend/routes/session.py
frontend/src/utils/api.js
frontend/nginx.conf
backend/tests/test_owner_session.py
backend/tests/test_rate_limiter.py
ai/architecture.md
ai/api.md
```

SSE:

```text
backend/routes/sse.py
backend/routes/jobs.py
backend/routes/analysis.py
frontend/src/hooks/useAnalysisJob.js
frontend/src/utils/sse.js
frontend/src/hooks/useGeneralNews.js
backend/main.py
ai/api.md
```

News:

```text
backend/routes/news.py
backend/config_defaults.py
packages/tradingagents/dataflows/news/news_service.py
packages/tradingagents/dataflows/news/general_news_service.py
packages/tradingagents/dataflows/news/general_news_stream.py
packages/tradingagents/dataflows/news/ticker_news_stream.py
frontend/src/components/home/HomeNewsSummary.jsx
frontend/src/pages/Dashboard.jsx
frontend/src/pages/News.jsx
frontend/src/hooks/useGeneralNews.js
frontend/src/services/generalNewsApi.js
backend/tests/test_general_news_routes.py
backend/tests/test_news_routes.py
```

Market/ticker:

```text
backend/routes/market.py
backend/routes/validation.py
backend/services/market_yfinance_service.py
backend/services/market_symbol_universe.py
frontend/src/api/market.js
frontend/src/hooks/useMarketOverviewConfig.js
frontend/src/hooks/useMarketOverviewData.js
frontend/src/hooks/useMarketMovers.js
frontend/src/hooks/useWatchlistQuotes.js
frontend/src/hooks/useWatchlistStore.js
frontend/src/components/TickerSearchBar.jsx
frontend/src/components/watchlist/WatchlistPage.jsx
frontend/src/components/watchlist/WatchlistTickerInput.jsx
frontend/src/domain/analysisContract.js
frontend/src/components/results/tabs/ChartPriceTab.jsx
backend/tests/test_market_routes.py
backend/tests/test_validation.py
frontend/src/pages/Watchlist.test.jsx
frontend/src/components/watchlist/WatchlistPage.test.jsx
```

Report:

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

Docker/setup:

```text
Dockerfile.backend
Dockerfile.frontend
docker-compose.yml
frontend/vite.config.js
frontend/nginx.conf
backend/.env.example
ai/setup.md
```

Frontend route changes:

```text
frontend/src/App.jsx
frontend/src/constants/routes.js
frontend/src/components/Navbar.jsx
frontend/src/pages/AIAgent.jsx
frontend/src/pages/Dashboard.jsx
frontend/src/pages/Watchlist.jsx
```

## Do Not

- Do not restore old IDX auto suffix behavior unless requested.
- Do not document global market as fully reliable. It is accepted as canonical
  yfinance input, but data quality depends on vendors.
- Do not put `API_KEY` or `LLM_API_KEY` into `VITE_*`.
- Do not remove `SkipSseCompressionMiddleware`.
- Do not switch frontend SSE to native `EventSource`; fetch stream is used for
  credential/cookie flow.
- Do not set response schema `extra="forbid"`.
- Do not call LLM/vendor live in unit tests.
- Do not remove report disclaimer.
- Do not assume Docker Compose uses nginx runtime. It uses Vite dev target now.
- Do not add backend persistence for watchlists unless the user asks for synced
  watchlists. Current watchlists are browser localStorage only.


