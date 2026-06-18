# Setup Guide

Last synced: 2026-06-18.

This guide follows the active code for local dev, Docker, env, tests, and common
problems.

## Requirements

| Tool | Version |
|---|---|
| Python | 3.10, 3.11, or 3.12 |
| Backend Docker Python | 3.11 |
| Node.js | 22 recommended |
| npm | Version bundled with Node |
| Docker | Docker Desktop current |
| Git | Current |

Python 3.13 is not supported by the core package in `packages/`.

## Port Map

| Component | Local host | Compose host | Container/internal |
|---|---:|---:|---:|
| Backend FastAPI | `127.0.0.1:8000` | `127.0.0.1:8000` | `0.0.0.0:8000` |
| Frontend Vite | `127.0.0.1:3000` | `127.0.0.1:3000` | `0.0.0.0:3000` |
| Frontend nginx runtime | manual mapping | not used by default compose | `8080` |
| Ollama | `localhost:11434` | `127.0.0.1:11434` | `ollama:11434` |
| Backend health | `http://127.0.0.1:8000/health` | same | `http://localhost:8000/health` |
| Frontend Compose health | root page | `http://127.0.0.1:3000/` | `http://127.0.0.1:3000/` |
| Nginx runtime health | manual mapping | not used by default compose | `http://127.0.0.1:8080/health` |

## Local Backend Setup

Create Python env:

```powershell
cd d:\CODING\TradingAgents
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python --version
```

Install:

```powershell
cd d:\CODING\TradingAgents\backend
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

`requirements-dev.txt` installs editable `../packages`.

Create backend env:

```powershell
Copy-Item backend\.env.example backend\.env
```

Minimum Google:

```env
APP_ENV=development
LLM_PROVIDER=google
LLM_API_KEY=your_google_or_gemini_key
QUICK_THINK_LLM=gemini-3.1-flash-lite
DEEP_THINK_LLM=gemini-3.5-flash
GOOGLE_API_KEY=your_google_or_gemini_key
```

Minimum OpenAI:

```env
APP_ENV=development
LLM_PROVIDER=openai
LLM_API_KEY=your_openai_key
QUICK_THINK_LLM=gpt-4o-mini
DEEP_THINK_LLM=gpt-4o
```

Minimum DeepSeek:

```env
APP_ENV=development
LLM_PROVIDER=deepseek
LLM_API_KEY=your_deepseek_key
DEEPSEEK_API_KEY=your_deepseek_key
QUICK_THINK_LLM=deepseek-chat
DEEP_THINK_LLM=deepseek-reasoner
```

Minimum OpenRouter:

```env
APP_ENV=development
LLM_PROVIDER=openrouter
LLM_API_KEY=your_openrouter_key
OPENROUTER_API_KEY=your_openrouter_key
QUICK_THINK_LLM=your-openrouter-model
DEEP_THINK_LLM=your-openrouter-model
```

Minimum Ollama:

```env
APP_ENV=development
LLM_PROVIDER=ollama
LLM_API_KEY=ollama
QUICK_THINK_LLM=llama3:latest
DEEP_THINK_LLM=llama3:latest
OLLAMA_BASE_URL=http://localhost:11434
```

Run backend:

```powershell
cd d:\CODING\TradingAgents\backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Health:

```powershell
curl http://127.0.0.1:8000/health
```

Expected shape:

```json
{
  "status": "ok",
  "provider": "google",
  "report_assets": {}
}
```

Startup validation logs issues and continues for local debug. Config import still
fails for unsafe hard constraints like wildcard CORS or invalid `APP_ENV`.

## Local Frontend Setup

Install:

```powershell
cd d:\CODING\TradingAgents\frontend
npm install
```

There is no `frontend/.env.example` in current repo. Create `frontend/.env`
manually if needed.

Recommended local Vite env:

```env
VITE_API_BASE_URL=/api
VITE_BACKEND_PROXY_TARGET=http://localhost:8000
VITE_DEV_HOST=127.0.0.1
VITE_DEV_PORT=3000
VITE_ENABLE_MOCK=false
```

Run:

```powershell
cd d:\CODING\TradingAgents\frontend
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Primary analysis page:

```text
http://127.0.0.1:3000/ai-agent
```

Alternative direct API env:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Proxy mode is preferred because browser stays on same origin `/api`.

Frontend scripts:

| Script | Command |
|---|---|
| `start` | `vite --host 127.0.0.1 --port 3000` |
| `dev` | `vite --host 127.0.0.1 --port 3000` |
| `build` | `vite build` |
| `preview` | `vite preview --host 127.0.0.1 --port 3000` |
| `test` | `vitest --environment jsdom` |
| `lint` | `eslint .` |
| `format:check` | `prettier --check "src/**/*.{js,jsx,css}" "dev/**/*.{js,jsx,css}" "*.{js,json,html}"` |
| `quality` | lint, format check, tests |
| `dev:lan` | `vite --host 0.0.0.0 --port 3000` |
| `preview:lan` | `vite preview --host 0.0.0.0 --port 3000` |

## Mock UI

Enable:

```env
VITE_ENABLE_MOCK=true
```

Open:

```text
http://127.0.0.1:3000/ai-agent.test
```

Files:

```text
frontend/src/pages/AIAgentMock.jsx
frontend/src/components/StockFormMock.jsx
frontend/src/hooks/useMockAnalysisJob.js
frontend/dev/mockData.js
frontend/src/utils/mockReport.js
```

Legacy mock routes redirect:

```text
/AI-Research.test
/AI-Research.test/:resourceId
/ai-research.test
/ai-research.test/:resourceId
/analysis.test
/analysis.test/:resourceId
/analysis-mock
```

## Docker Compose Setup

Create backend env:

```powershell
Copy-Item backend\.env.example backend\.env
```

Fill LLM provider and keys in `backend/.env`.

Run:

```powershell
docker compose up --build
```

URLs:

| Service | URL |
|---|---|
| Frontend Vite | `http://localhost:3000` |
| Backend | `http://localhost:8000` |
| Backend health | `http://localhost:8000/health` |

Stop:

```powershell
docker compose down
```

Logs:

```powershell
docker compose logs -f backend
docker compose logs -f frontend
```

Compose details:

- Backend uses Dockerfile runtime, bind-mounts `./backend`, and runs uvicorn
  reload.
- Frontend uses `Dockerfile.frontend` target `dev`, bind-mounts `./frontend`,
  and runs Vite dev server.
- Frontend `/api` proxy target defaults to `http://backend:8000`.
- Compose does not use frontend nginx runtime by default.

Volumes:

| Volume | Path |
|---|---|
| `tradingagent-cache` | `/home/tradingagent/.tradingagents/cache` |
| `tradingagent-results` | `/home/tradingagent/.tradingagents/logs` |
| `frontend-node-modules` | `/app/node_modules` |
| `ollama-data` | `/root/.ollama` |

## Docker with Ollama

Run:

```powershell
docker compose --profile ollama up --build
```

Pull model:

```powershell
docker exec -it tradingagent-ollama ollama pull llama3:latest
```

Backend env:

```env
LLM_PROVIDER=ollama
LLM_API_KEY=ollama
QUICK_THINK_LLM=llama3:latest
DEEP_THINK_LLM=llama3:latest
OLLAMA_BASE_URL=http://ollama:11434
```

Compose already sets `OLLAMA_BASE_URL=http://ollama:11434` for backend.

## Docker Frontend Runtime Image

Manual production-style build:

```powershell
docker build -f Dockerfile.frontend --target runtime -t tradingagent-frontend-runtime .
```

Runtime nginx listens on container port `8080`.

`frontend/nginx.conf`:

```text
/api/* -> http://backend:8000/api/*
/health -> ok
```

Default compose does not run this target.

## Docker Mock Overlay

Current `docker-compose.mock.yml` only sets build arg `VITE_ENABLE_MOCK=true`.
Default compose frontend target is `dev`, so use frontend environment
`VITE_ENABLE_MOCK=true` when you need mock route in Compose.

Local reliable command:

```powershell
cd frontend
$env:VITE_ENABLE_MOCK="true"
npm run dev
```

Open:

```text
http://localhost:3000/ai-agent.test
```

## Backend Tests

Repo Python checks:

```powershell
cd d:\CODING\TradingAgents
python -m pip install -e packages
python -c "import tradingagents; print(tradingagents.__file__)"
python -m ruff check backend packages
python -m ruff format --check backend packages
python -m pytest backend/tests packages/tests
```

Backend unit:

```powershell
cd d:\CODING\TradingAgents\backend
pytest tests/ -m "not integration and not live_api" -v
```

Backend coverage:

```powershell
pytest tests/ -m "not integration and not live_api" --cov=. --cov-report=term-missing
```

Backend lint/format:

```powershell
python -m ruff check .
python -m ruff format --check .
```

PowerShell quality script:

```powershell
.\scripts\quality.ps1
```

Core package:

```powershell
cd d:\CODING\TradingAgents
python -m pytest packages/tests -m "not integration and not live_api" -v
```

## Frontend Tests

Run once:

```powershell
cd d:\CODING\TradingAgents\frontend
npm test -- --run
```

Lint:

```powershell
npm run lint
```

Format:

```powershell
npm run format:check
```

Full quality:

```powershell
npm run quality
```

## Seed Development History

Add one mock snapshot to SQLite history without provider/LLM call:

```powershell
cd d:\CODING\TradingAgents\backend
python scripts\seed_mock_analysis.py
```

Snapshot goes to `ANALYSIS_DB_PATH`.

## Backend Env Reference

Canonical template:

```text
backend/.env.example
```

### Server and Security

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `development` or `production`. |
| `CORS_ORIGINS` | local origins | Explicit frontend origins. `*` rejected. |
| `API_KEY` | blank | Service credential. Required production. |
| `REQUIRE_API_KEY_FOR_RATE_LIMIT` | `false` dev, true required production | Require service credential. |
| `OWNER_SESSION_SECRET` | blank | Owner token signing secret. Required production. |
| `OWNER_SESSION_TTL_SECONDS` | `ANALYSIS_JOB_TTL_SECONDS` | Cookie/session TTL. |
| `REQUEST_BODY_MAX_BYTES` | `16777216` | Request body limit. |

### Runtime and Workers

| Variable | Default | Purpose |
|---|---:|---|
| `PIPELINE_TOTAL_TIMEOUT_SECONDS` | `PIPELINE_TIMEOUT_SECONDS` or 600 | Main pipeline timeout. |
| `PIPELINE_TIMEOUT_SECONDS` | 600 | Backward-compatible timeout. |
| `PIPELINE_STAGE_TIMEOUT_SECONDS` | 30 | Stage timeout. |
| `PIPELINE_LLM_CALL_TIMEOUT_SECONDS` | 45 | LLM call timeout. |
| `PREFLIGHT_TIMEOUT_SECONDS` | 30 capped by pipeline timeout | Ticker preflight timeout. |
| `PROCESS_POOL_WORKERS` | 2 | Pipeline process workers. |
| `PROCESS_POOL_MAX_TASKS_PER_CHILD` | 1 | Replace worker after task. |
| `DATA_COLLECTION_WORKERS` | 12 | Data collection thread workers. |
| `PRICE_MAX_FALLBACK_DAYS` | 7 | Price fallback search window. |
| `ANALYST_PARALLEL_WORKERS` | 3 | Initial analyst workers, capped to 3. |
| `DEFAULT_MAX_DEBATE_ROUNDS` | 3 | Default debate rounds. |

### Analysis Depth

| Variable | Default |
|---|---:|
| `LLM_BUDGET_FAST` | 6 |
| `LLM_BUDGET_BALANCED` | 9 |
| `LLM_BUDGET_DEEP` | 12 |

Fixed values:

```text
ANALYSIS_MODE=balanced
DEFAULT_ANALYSIS_DEPTH=balanced
ANALYSIS_DEPTHS=fast,balanced,deep
RESPONSE_DETAILS=summary,full,debug
```

### Rate Limit

| Variable | Default |
|---|---:|
| `REQUEST_RATE_LIMIT_PER_MINUTE` | 20 |
| `STATUS_RATE_LIMIT_PER_MINUTE` | 120 |
| `STREAM_RATE_LIMIT_PER_MINUTE` | 8 |
| `MAX_CONCURRENT_REQUESTS_PER_KEY` | 2 |
| `MAX_CONCURRENT_STATUS_REQUESTS_PER_KEY` | 8 |
| `MAX_CONCURRENT_STREAMS_PER_KEY` | 1 |
| `RATE_LIMIT_STORAGE_BACKEND` | `sqlite` |
| `RATE_LIMIT_DB_PATH` | `.cache/rate_limits.sqlite3` |

### Cache and Persistence

| Variable | Default |
|---|---|
| `CACHE_TTL_SECONDS` | `900` |
| `CACHE_MAX_ENTRIES` | `512` |
| `ANALYSIS_RESULT_CACHE_TTL_SECONDS` | `28800` |
| `ANALYSIS_RESULT_CACHE_MAX_ENTRIES` | `256` |
| `ANALYSIS_JOB_TTL_SECONDS` | `28800` |
| `ANALYSIS_JOB_MAX_ENTRIES` | `256` |
| `ANALYSIS_JOB_MAX_ACTIVE` | min(`32`, max entries) |
| `ANALYSIS_JOB_EVENT_REPLAY_LIMIT` | `500` |
| `ANALYSIS_JOB_CACHE_DB_PATH` | `.cache/analysis_jobs.sqlite3` |
| `ANALYSIS_JOB_STORE_BACKEND` | `sqlite` |
| `ANALYSIS_JOB_ROUTING_MODE` | `sticky_sessions` |
| `ANALYSIS_DB_PATH` | `.cache/analysis_history.sqlite3` |
| `ANALYSIS_STORAGE_BACKEND` | `sqlite` |
| `ANALYSIS_HISTORY_MAX_ROWS` | `1000` |
| `ANALYSIS_HISTORY_DEFAULT_LIMIT` | `25` |
| `DATA_CACHE_BACKEND` | `sqlite` |
| `DATA_CACHE_DB_PATH` | `.cache/market_data.sqlite3` |
| `DATA_CACHE_TTL_SECONDS` | `900` |
| `DATA_CACHE_MAX_ENTRIES` | `512` |

### LLM

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | blank | `google`, `openai`, `anthropic`, `deepseek`, `openrouter`, `ollama`. |
| `LLM_API_KEY` | blank | Primary key for active provider. |
| `LLM_BASE_URL` | blank | Optional provider/gateway base URL. |
| `QUICK_THINK_LLM` | blank | Analysts, debate, trader, risk. |
| `DEEP_THINK_LLM` | blank | Research Manager and Portfolio Manager. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint. |
| `LLM_TIMEOUT_SECONDS` | 60 | LLM timeout. |
| `LLM_MAX_RETRIES` | 1 | LLM retry attempts. |
| `PROVIDER_SDK_MAX_RETRIES` | 0 | SDK internal retries. |
| `MAX_CONCURRENT_LLM_CALLS` | 3 | LLM concurrency limit. |

Provider-specific legacy/fallback keys:

```text
GOOGLE_API_KEY
GEMINI_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
DEEPSEEK_API_KEY
OPENROUTER_API_KEY
```

### LLM Cache

| Variable | Default |
|---|---|
| `LLM_EXACT_CACHE_ENABLED` | `true` |
| `LLM_EXACT_CACHE_TTL_SECONDS` | `1800` |
| `LLM_EXACT_CACHE_MAX_ENTRIES` | `1024` |
| `LLM_EXACT_CACHE_DB_PATH` | `.cache/llm_exact_cache.sqlite3` |
| `LLM_SEMANTIC_CACHE_ENABLED` | `false` |
| `LLM_SEMANTIC_CACHE_TTL_SECONDS` | `3600` |
| `LLM_SEMANTIC_CACHE_MAX_ENTRIES` | `2048` |
| `LLM_SEMANTIC_CACHE_DB_PATH` | `.cache/llm_semantic_cache.sqlite3` |
| `LLM_SEMANTIC_CACHE_SIMILARITY_THRESHOLD` | `0.97` |
| `LLM_SEMANTIC_CACHE_TARGETS` | `news_summary,company_profile` |

### Runtime Cache Path

| Variable | Default |
|---|---|
| `XDG_CACHE_HOME` | blank, platform default |
| `YFINANCE_CACHE_DIR` | blank, yfinance default |
| `YFINANCE_TICKER_CACHE_MAX_ENTRIES` | `512` |
| `TRADINGAGENTS_TIMEOUT_MAX_ACTIVE_CALLS` | blank |
| `TRADINGAGENTS_TIMEOUT_MAX_ABANDONED_CALLS` | blank |
| `TRADINGAGENTS_TIMEOUT_CAPACITY_WAIT_SECONDS` | `5` |

### Vendor Keys

| Variable | Purpose |
|---|---|
| `ALPHA_VANTAGE_API_KEY` | Optional fundamentals/news/price fallback. |
| `SEC_USER_AGENT` | Required by SEC fair-access policy for US companyfacts fallback. |
| `GOOGLE_NEWS_LIGHT_API_KEY` | Google News Light provider. |
| `MARKETAUX_API_KEY` | MarketAux provider. |
| `NEWSDATA_API_KEY` | NewsData provider. |
| `FINNHUB_API_KEY` | Finnhub fallback/enrichment. |
| `FINNHUB_BASE_URL` | Finnhub API base. |
| `FINNHUB_ENABLED` | Enables Finnhub when key exists. |

### Vendor Routing

| Variable | Default |
|---|---|
| `DATA_VENDOR_CORE_STOCK_APIS` | `yfinance,finnhub,alpha_vantage` |
| `DATA_VENDOR_QUOTE_DATA` | `yfinance,finnhub,alpha_vantage` |
| `DATA_VENDOR_TECHNICAL_INDICATORS` | `yfinance,finnhub,alpha_vantage` |
| `DATA_VENDOR_FUNDAMENTAL_DATA` | `yfinance,finnhub,alpha_vantage` |
| `DATA_VENDOR_FINANCIAL_STATEMENTS` | `yfinance,sec_companyfacts,alpha_vantage,finnhub` |
| `DATA_VENDOR_NEWS_DATA` | `google_news_light,marketaux,newsdata,yfinance,finnhub,alpha_vantage` |
| `DATA_VENDOR_GLOBAL_NEWS_DATA` | `finnhub,alpha_vantage,yfinance` |
| `DATA_VENDOR_SENTIMENT_DATA` | `finnhub,alpha_vantage` |
| `DATA_VENDOR_SOCIAL_SENTIMENT` | `finnhub` |
| `DATA_VENDOR_EVENT_DATA` | `finnhub` |
| `DATA_VENDOR_ANALYST_RATING` | `finnhub` |
| `DATA_VENDOR_INSIDER_DATA` | `finnhub,alpha_vantage,yfinance` |
| `DATA_VENDOR_FOREX_DATA` | `finnhub,alpha_vantage` |
| `DATA_VENDOR_CRYPTO_DATA` | `finnhub,alpha_vantage` |
| `DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE` | `0.35` |
| `DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS` | `true` |
| `DATA_VENDOR_ENABLE_MULTI_SOURCE_PRICE` | `false` |
| `DATA_VENDOR_ENABLE_FINNHUB_FALLBACK` | `true` |
| `DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT` | `true` |
| `DATA_VENDOR_REQUIRE_SOURCE_METADATA` | `true` |
| `DATA_VENDOR_RETURN_PARTIAL_ON_FAILURE` | `true` |
| `DATA_VENDOR_MAX_CALLS_PER_ANALYSIS` | `60` |

### Company News

| Variable | Default |
|---|---|
| `NEWS_STRICT_AI_ANALYSIS_MODE` | `true` |
| `NEWS_FORCE_ALL_PROVIDERS` | `true` |
| `NEWS_PROVIDER_PRIORITY` | `google_news_light,marketaux,rss_context,newsdata,yfinance` |
| `NEWS_ENABLED_PROVIDERS` | `google_news_light,marketaux,rss_context,newsdata,yfinance` |
| `NEWS_DEFAULT_WINDOW_DAYS` | `30` |
| `NEWS_MAX_ARTICLES_PER_PROVIDER` | `20` |
| `NEWS_MAX_ARTICLES_FOR_PROMPT` | `8` |
| `NEWS_MAX_ARTICLES_FOR_UI` | `30` |
| `NEWS_MIN_RELEVANCE_SCORE` | `55` |
| `NEWS_PROMPT_MIN_RELEVANCE_SCORE` | `70` |
| `NEWS_DECISION_MIN_RELEVANCE_SCORE` | `70` |
| `NEWS_RSS_DECISION_MIN_RELEVANCE_SCORE` | `80` |
| `NEWS_RSS_ENABLED` | `true` |
| `NEWS_RSS_MAX_FEEDS` | `10` |
| `NEWS_RSS_MAX_ITEMS_PER_FEED` | `20` |
| `NEWS_RSS_INCLUDE_TRIAL_FEEDS` | `false` |
| `NEWS_RSS_GOOGLE_NEWS_FALLBACK_ENABLED` | `true` |
| `NEWS_RSS_ENABLED_FEED_IDS` | blank |
| `NEWS_RSS_DISABLED_FEED_IDS` | `theblock-trial` |
| `NEWS_RSS_USER_AGENT` | `TradingAgent/0.1 RSS Reader` |
| `NEWS_CACHE_ENABLED` | `true` |
| `NEWS_CACHE_TTL_MINUTES` | `60` |
| `NEWS_CACHE_DB_PATH` | backend `.cache/news_data.sqlite3` |
| `NEWS_CACHE_MAX_ENTRIES` | `512` |
| `NEWS_DEBUG_RAW_RESPONSE` | `false` |
| `NEWS_LOG_PROVIDER_REQUESTS` | `true` |
| `NEWS_VENDOR_TIMEOUT_SECONDS` | `10` |
| `NEWS_VENDOR_MAX_RETRIES` | `1` |
| `NEWS_FETCH_SECONDARY_ALWAYS` | `true` |
| `NEWS_SECONDARY_FETCH_THRESHOLD` | `3` |
| `NEWS_ENABLE_YFINANCE_FALLBACK` | `true` |

### General News

| Variable | Default |
|---|---|
| `GENERAL_NEWS_ENABLED` | `true` |
| `GENERAL_NEWS_PROVIDER_PRIORITY` | `rss_context,google_news_light,marketaux,newsdata` |
| `GENERAL_NEWS_ENABLED_PROVIDERS` | `rss_context,google_news_light,marketaux,newsdata` |
| `GENERAL_NEWS_ENABLE_BACKGROUND_REFRESH` | `true` |
| `GENERAL_NEWS_REFRESH_INTERVAL_SECONDS` | `120` |
| `GENERAL_NEWS_CACHE_TTL_SECONDS` | `120` |
| `GENERAL_NEWS_FRONTEND_POLL_SECONDS` | `60` |
| `GENERAL_NEWS_ENABLE_SSE` | `true` |
| `GENERAL_NEWS_DEFAULT_WINDOW_DAYS` | `7` |
| `GENERAL_NEWS_MAX_ARTICLES_PER_PROVIDER` | `30` |
| `GENERAL_NEWS_MAX_ARTICLES_FOR_UI` | `100` |
| `GENERAL_NEWS_DEFAULT_LIMIT` | `50` |
| `GENERAL_NEWS_DEFAULT_CATEGORY` | `all` |
| `GENERAL_NEWS_ALLOWED_CATEGORIES` | `all,market,macro,crypto,forex,commodities,regulatory,indonesia` |
| `GENERAL_NEWS_RSS_PRIMARY` | `true` |
| `GENERAL_NEWS_RSS_MAX_FEEDS` | `20` |
| `GENERAL_NEWS_RSS_MAX_ITEMS_PER_FEED` | `30` |
| `GENERAL_NEWS_VENDOR_TIMEOUT_SECONDS` | `10` |
| `GENERAL_NEWS_VENDOR_MAX_RETRIES` | `1` |
| `GENERAL_NEWS_CACHE_ENABLED` | `true` |
| `GENERAL_NEWS_CACHE_DB_PATH` | `.cache/general_news.sqlite3` |
| `GENERAL_NEWS_CACHE_MAX_ENTRIES` | `1000` |

### Tool and Debug

| Variable | Default |
|---|---|
| `TOOL_TIMEOUT_SECONDS` | `45` |
| `TOOL_MAX_RETRIES` | `2` |
| `DEBUG_ENDPOINTS_ENABLED` | `false` |

## Frontend Env Reference

Resolved by `frontend/src/config.js`:

| Variable | Default |
|---|---|
| `VITE_API_BASE_URL` | `/api` |
| `VITE_API_URL` | blank legacy fallback |
| `VITE_ENABLE_MOCK` | `false` |

Used by `frontend/vite.config.js`:

| Variable | Default |
|---|---|
| `VITE_DEV_HOST` | `127.0.0.1` |
| `VITE_DEV_PORT` | `3000` |
| `VITE_BACKEND_PROXY_TARGET` | `http://backend:8000` |

## Common Problems

### Frontend `/api` calls fail in local Vite

Cause: default proxy target is `http://backend:8000`.

Fix:

```env
VITE_API_BASE_URL=/api
VITE_BACKEND_PROXY_TARGET=http://localhost:8000
```

Restart Vite.

### Missing owner session token

Error:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing owner session token. Call POST /api/session first."
  }
}
```

Fix frontend fetch:

```text
call buildHeaders() or buildAuthHeaders()
set credentials: 'include'
```

For manual curl, call `POST /api/session` first and reuse cookie or
`x-owner-token`.

### Backend logs startup config issues

Cause examples:

- `LLM_PROVIDER` blank.
- `LLM_API_KEY` blank.
- `QUICK_THINK_LLM` blank.
- `DEEP_THINK_LLM` blank.
- Optional vendor keys blank.

Local debug server continues. Pipeline/vendor calls can still fail later.

### Production config fails

Required production values:

```env
APP_ENV=production
API_KEY=...
OWNER_SESSION_SECRET=...
REQUIRE_API_KEY_FOR_RATE_LIMIT=true
CORS_ORIGINS=https://your.domain
```

`CORS_ORIGINS=*` is rejected.

### `tradingagents` module not found

Fix:

```powershell
cd d:\CODING\TradingAgents\backend
pip install -r requirements-dev.txt
```

or:

```powershell
cd d:\CODING\TradingAgents
pip install -e packages
```

### WeasyPrint PDF fails local Windows

Docker backend includes required system libraries. Use Docker backend when local
Windows system libraries are missing.

### yfinance or vendor timeout

Check:

```text
PREFLIGHT_TIMEOUT_SECONDS
TOOL_TIMEOUT_SECONDS
DATA_VENDOR_*
FINNHUB_API_KEY
ALPHA_VANTAGE_API_KEY
GOOGLE_NEWS_LIGHT_API_KEY
MARKETAUX_API_KEY
NEWSDATA_API_KEY
network/DNS/quota
```

### Python 3.13 error

Core requires:

```text
>=3.10,<3.13
```

Use Python 3.11 or 3.12.
