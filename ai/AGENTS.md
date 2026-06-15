# TradingAgent AI Context

Terakhir disinkronkan: 2026-06-15.

File ini konteks utama untuk coding agent. Baca dulu sebelum edit kode, docs,
Docker, env, test, atau kontrak API.

## Mode Kerja

- Jawab user dalam Bahasa Indonesia jika user memakai Bahasa Indonesia.
- Singkat. Langsung ke file, command, test, hasil.
- Jangan pakai basa-basi.
- Jangan tampilkan reasoning panjang.
- Jangan ubah file di luar scope.
- Jangan revert perubahan user.
- Jangan commit secret, `.env`, cache, SQLite, build output, atau `node_modules`.
- Jika mengubah kontrak backend/frontend, update docs `ai/` dan test terkait.

Format laporan default setelah implementasi:

```text
Files changed:
- path/file

Summary:
- Perubahan inti.

Tests:
- command
- hasil

Risk:
- risiko penting, atau "Tidak ada risiko besar yang terlihat."
```

## Tujuan Project

TradingAgent adalah aplikasi full-stack untuk riset saham dan aset berbasis
multi-agent LLM.

- Backend: FastAPI di `backend/`.
- Engine agent: package editable `backend/tradingagents-core`, import sebagai
  `tradingagents`.
- Frontend: React 18 + Vite di `frontend/`.
- Output: analisis Buy, Hold, Sell, Wait, risk, thesis, chart, news,
  fundamentals, report HTML/PDF.
- Disclaimer report wajib tetap ada. Ini alat riset, bukan financial advice.

## Fakta Penting Saat Ini

- Primary UI route: `/AI-Research`.
- Legacy `/analysis` redirect ke `/AI-Research`.
- Backend API prefix: `/api`.
- Health endpoint tanpa prefix: `/health`.
- Frontend default API base: `/api`.
- Vite dev punya proxy `/api`.
- Local Vite perlu `VITE_BACKEND_PROXY_TARGET=http://localhost:8000` jika backend
  jalan di host Windows.
- Docker Compose default memakai frontend Vite dev stage, bukan nginx runtime.
- Dockerfile frontend runtime nginx listen `8080`, bukan `80`.
- `frontend/.env.example` tidak ada di repo sekarang.
- `docker-compose.mock.yml` hanya set build arg. Dengan compose dev target,
  mock lebih aman diaktifkan lewat env `VITE_ENABLE_MOCK=true`.
- Auth browser sekarang pakai cookie HttpOnly `ta_owner_token` dari
  `POST /api/session`.
- Frontend tidak mengirim `x-owner-token`; `buildAuthHeaders()` hanya memastikan
  session cookie ada.
- Backend masih menerima `x-owner-token` untuk test dan legacy client.
- `validate_startup_config()` mengembalikan issue. `main.validate_config()`
  log issue lalu server tetap jalan untuk debug local.
- Beberapa config error tetap raise saat import, contoh invalid `APP_ENV`,
  wildcard CORS, production tanpa `API_KEY`, production tanpa
  `OWNER_SESSION_SECRET`.
- LLM key utama sekarang `LLM_API_KEY`. Provider-specific keys masih legacy atau
  fallback SDK.
- Market input memakai canonical yfinance symbol dari `/api/market/search`.
- Plain IDX ticker tidak auto suffix `.JK`. Pilih `BBCA.JK` dari search untuk
  IDX.
- Backend menerima market: `IDX`, `ID`, `US`, `GLOBAL`, `CRYPTO`, `ETF`,
  `FUND`, `UNKNOWN`.
- Non-ID suffix seperti `.HK`, `.T`, `.DE` diterima jika canonical yfinance.
- `/market` page masih shell dengan navbar dan ticker tape.
- `/economic` page masih placeholder.

## Repository Map

```text
TradingAgents/
  ai/                         agent docs
  assets/                     README screenshots
  backtest/                   env template only, no runner
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
      market.py               quotes, search, OHLCV
      news.py                 company news, general news, news SSE
      reports.py              disclaimer, HTML/PDF report
      session.py              owner session cookie
      debug.py                debug endpoints gated by flag
    services/
      analysis_repository.py  permanent SQLite history
      report_service.py       report context, HTML, PDF
      report_disclaimer.py    canonical disclaimer
    tradingagents-core/
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
  frontend/
    vite.config.js            Vite dev server and /api proxy
    nginx.conf                production nginx template
    src/
      App.jsx                 routes
      constants/routes.js     primary and legacy routes
      config.js               frontend env resolver
      domain/analysisContract.js request payload and validation
      utils/api.js            API URL and owner session bootstrap
      hooks/useAnalysisJob.js job API and SSE stream
      hooks/useGeneralNews.js general news fetch and SSE
      components/             UI components
      pages/                  Home, AI Research, News, Market, Economic
```

## Active Routes

Frontend:

```text
/                         -> /home
/home                     -> Dashboard
/AI-Research              -> Analysis
/AI-Research/:resourceId  -> Analysis lookup
/analysis                 -> redirect /AI-Research
/analysis/:resourceId     -> redirect /AI-Research/:resourceId
/analysis-live            -> redirect /AI-Research
/news                     -> General News page
/market                   -> Shell page
/economic                 -> Placeholder page
/AI-Research.test         -> mock route if VITE_ENABLE_MOCK=true
/analysis.test            -> legacy mock redirect
/analysis-mock            -> legacy mock redirect
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
GET    /api/market/search
GET    /api/market/ohlcv
GET    /api/market/quotes
GET    /api/news/general
GET    /api/news/general/categories
GET    /api/news/general/stream
GET    /api/news/{ticker}
GET    /api/reports/disclaimer
GET    /api/analysis/jobs/{job_id}/report.html
GET    /api/analysis/jobs/{job_id}/report.pdf
POST   /api/analysis/report.html
POST   /api/analysis/report.pdf
```

Legacy aktif:

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
GET /api/debug/vendor/{name}    DEBUG_ENDPOINTS_ENABLED=true
GET /api/debug/symbol/{ticker}  DEBUG_ENDPOINTS_ENABLED=true
GET /api/debug/metrics          DEBUG_ENDPOINTS_ENABLED=true
GET /api/debug/vendor-stats     DEBUG_ENDPOINTS_ENABLED=true
```

## Auth Model

Service credential:

- Header: `x-api-key: <API_KEY>` or `Authorization: Bearer <API_KEY>`.
- Optional in development when `REQUIRE_API_KEY_FOR_RATE_LIMIT=false`.
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
backend/tradingagents-core/tradingagents/pipeline_balanced.py
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

| Depth | LLM budget | Retries | Behavior |
|---|---:|---:|---|
| `fast` | 6 | 1 | Skips full debate/risk, uses conservative fallback. |
| `balanced` | 9 | 2 | Default full flow. |
| `deep` | 12 | 3 | Extra debate/risk passes when supported. |

## Data and News

Primary market data route uses yfinance symbols.

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
  `/api/news/{ticker}`.
- General news page: `GeneralNewsService`, exposed at `/api/news/general` and
  `/api/news/general/stream`.

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
- Keep primary route `/AI-Research`.
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
backend/tradingagents-core/tradingagents/dataflows/news_service.py
backend/tradingagents-core/tradingagents/dataflows/general_news_service.py
frontend/src/pages/News.jsx
frontend/src/hooks/useGeneralNews.js
frontend/src/services/generalNewsApi.js
backend/tests/test_general_news_routes.py
```

Market/ticker:

```text
backend/routes/market.py
backend/routes/validation.py
frontend/src/components/TickerSearchBar.jsx
frontend/src/domain/analysisContract.js
frontend/src/components/results/tabs/ChartPriceTab.jsx
backend/tests/test_market_routes.py
backend/tests/test_validation.py
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
docker-compose.mock.yml
frontend/vite.config.js
frontend/nginx.conf
backend/.env.example
ai/setup.md
```

## Commands

Backend local:

```powershell
cd d:\CODING\TradingAgents\backend
pip install -r requirements.txt
pip install -r requirements-dev.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend local:

```powershell
cd d:\CODING\TradingAgents\frontend
npm install
$env:VITE_API_BASE_URL="/api"
$env:VITE_BACKEND_PROXY_TARGET="http://localhost:8000"
npm run dev
```

Docker:

```powershell
docker compose up --build
```

Backend tests:

```powershell
cd d:\CODING\TradingAgents\backend
pytest tests/ -m "not integration and not live_api" -v
python -m ruff check .
python -m ruff format --check .
```

Core tests:

```powershell
cd d:\CODING\TradingAgents\backend\tradingagents-core
pytest tests/ -m "not integration and not live_api" -v
```

Frontend tests:

```powershell
cd d:\CODING\TradingAgents\frontend
npm test -- --run
npm run lint
npm run format:check
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

## Docs Index

- `ai/AGENTS.md`: main agent context.
- `ai/architecture.md`: system architecture and module boundaries.
- `ai/api.md`: current backend API contract.
- `ai/setup.md`: local, Docker, env, tests.
- `ai/conventions.md`: coding and testing rules.
- `ai/decisions.md`: technical decisions and implications.
