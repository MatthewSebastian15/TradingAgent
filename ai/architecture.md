# Architecture

Terakhir disinkronkan: 2026-06-03.

Dokumen ini menjelaskan arsitektur aktual TradingAgent berdasarkan kode aktif.
Gunakan ini sebelum mengubah backend route, frontend hook, pipeline agent,
cache, Docker, atau konfigurasi env.

## Diagram Sistem

```text
Browser
  |
  | local Vite: http://127.0.0.1:3000
  | Docker nginx: http://localhost:3000
  v
React/Vite Frontend
  |
  | POST /api/session
  | POST /api/analysis/jobs
  | GET  /api/analysis/jobs/{job_id}/events
  | GET  /api/analysis/jobs/{job_id}
  | GET  /api/analysis/history
  | GET  /api/analysis/jobs/{job_id}/report.html
  | GET  /api/analysis/jobs/{job_id}/report.pdf
  v
FastAPI Backend, port 8000
  |
  | ProcessPoolExecutor, spawn context
  v
tradingagents-core
  |
  | ThreadPoolExecutor for data collection and initial analysts
  v
Balanced multi-agent pipeline
```

Docker path:

```text
Browser -> frontend nginx:80 inside container
        -> nginx location /api/
        -> http://backend:8000/api/
        -> FastAPI
```

Local Vite path:

```text
Browser -> Vite dev server on 127.0.0.1:3000
        -> direct fetch to http://localhost:8000/api when VITE_API_BASE_URL is set
        -> FastAPI
```

Vite local tidak menyediakan proxy `/api`.

## Runtime Ports

| Komponen | Host/port | Source |
|---|---|---|
| Backend local | `127.0.0.1:8000` | Command `uvicorn main:app --host 127.0.0.1 --port 8000 --reload`. |
| Backend Docker host | `127.0.0.1:8000` | `docker-compose.yml` maps `127.0.0.1:8000:8000`. |
| Backend container | `0.0.0.0:8000` | `Dockerfile.backend` CMD uses `${PORT:-8000}`. |
| Frontend local Vite | `127.0.0.1:3000` | `frontend/vite.config.js`, `frontend/package.json`. |
| Frontend Docker host | `127.0.0.1:3000` | `docker-compose.yml` maps `127.0.0.1:3000:80`. |
| Frontend container | `80` | `Dockerfile.frontend` and nginx. |
| Ollama local | `localhost:11434` | `OLLAMA_BASE_URL` default. |
| Ollama Docker host | `127.0.0.1:11434` | Compose profile `ollama`. |
| Ollama Docker internal | `http://ollama:11434` | Backend Docker env override. |

## Backend Top Level

`backend/main.py` membuat FastAPI app dan memasang:

| Bagian | Fungsi |
|---|---|
| Lifespan startup | Memanggil `validate_startup_config()`. Jika error, backend exit dengan `sys.exit(1)`. |
| Lifespan shutdown | Mematikan process pool dan multiprocessing manager. |
| `RequestBodyLimitMiddleware` | Menolak payload lebih besar dari `REQUEST_BODY_MAX_BYTES`. |
| `GZipMiddleware` | Compress response >= 1000 byte. |
| `SkipSseCompressionMiddleware` | Menghapus `accept-encoding` untuk SSE supaya event flush. |
| `RequestIdMiddleware` | Menempelkan request ID dan header `x-request-id`. |
| `CORSMiddleware` | Membatasi origin, method, dan header. |
| Error handlers | Mengubah `ApiError`, HTTP error, validation error, dan unhandled error menjadi envelope aman. |
| Router include | History, analysis, market, news, reports, session. |

Router prefix:

```text
analysis_history_router -> /api
analysis_router         -> /api
market_router           -> /api
news router             -> /api
reports_router          -> /api
session_router          -> /api
```

`/health` berada langsung di app, tanpa prefix `/api`.

## Config Boundary

`backend/config.py` adalah facade. Route dan service sebaiknya import runtime
setting dari file ini.

Modul config:

| File | Isi |
|---|---|
| `config_env.py` | Load `.env`, parser bool/int/float/list. Skip `.env` saat test. |
| `config_defaults.py` | APP_ENV, CORS, port, timeout, worker, rate limit, cache, vendor defaults. |
| `config_llm.py` | LLM provider, model, API key facade, TradingAgents config builder. |
| `config_validation.py` | Startup validation provider, model, key, production secret, writable dir. |
| `config.py` | Reload focused modules lalu re-export setting. |

Startup validation mengecek:

- `LLM_PROVIDER` tidak kosong.
- Provider termasuk supported provider.
- API key provider ada, kecuali `ollama`.
- `DEEP_THINK_LLM` dan `QUICK_THINK_LLM` tidak kosong.
- `API_KEY` ada jika `REQUIRE_API_KEY_FOR_RATE_LIMIT=true`.
- `OWNER_SESSION_SECRET` ada saat `APP_ENV=production`.
- `ANALYSIS_MODE` tetap `balanced`.
- `DEFAULT_ANALYSIS_DEPTH` valid.
- `results_dir` dan `data_cache_dir` writable.

## Request Flow Canonical

Frontend utama memakai job API.

```text
AnalysisWorkspace
  -> StockForm
  -> buildAnalysisPayload()
  -> useAnalysisJob.startAnalysis()
  -> POST /api/analysis/jobs
  -> GET /api/analysis/jobs/{job_id}/events
  -> handle progress/result/error
  -> navigate /analysis/{job_id}
  -> save compact summary to localStorage
  -> backend saves full result to SQLite history
```

File frontend yang terlibat:

| File | Tugas |
|---|---|
| `frontend/src/domain/analysisContract.js` | Market constants, validation, payload builder. |
| `frontend/src/components/StockForm.jsx` | Form market, ticker, date, horizon, depth, response detail, position. |
| `frontend/src/hooks/useAnalysisJob.js` | Create job, read SSE stream, cancel job. |
| `frontend/src/utils/api.js` | Build URL, owner token, auth headers, HTTP error parsing. |
| `frontend/src/utils/sse.js` | Parse SSE block dari fetch stream. |
| `frontend/src/components/AgentLog.jsx` | Tampilkan progress. |
| `frontend/src/components/ResultCard.jsx` | Render result. |
| `frontend/src/utils/reportApi.js` | HTML/PDF report export. |
| `frontend/src/utils/analysisHistoryApi.js` | Backend history API. |

## Auth dan Resource Ownership

`rate_limiter.py` memisahkan service credential dan owner token.

Flow:

```text
POST /api/session
  -> validate_service_credential()
  -> issue_owner_session()
  -> return owner_token

Protected request
  -> validate_service_credential()
  -> owner_identifier_from_token(x-owner-token)
  -> RateLimitLease(scope, owner_id)
```

Owner token berisi:

| Field | Detail |
|---|---|
| `version` | Token version, saat ini `1`. |
| `owner_id` | UUID random per session. |
| `issued_at` | Unix timestamp. |
| `expires_at` | Unix timestamp, default TTL mengikuti `ANALYSIS_JOB_TTL_SECONDS`. |
| signature | HMAC SHA-256 dengan `OWNER_SESSION_SECRET` atau random dev secret. |

Di development, secret kosong memakai process-local random secret. Token akan
invalid setelah backend restart. Di production, `OWNER_SESSION_SECRET` wajib.

## Backend Route Boundary

| Route file | Endpoint aktif | Catatan |
|---|---|---|
| `routes/analysis.py` | `/analyze`, `/analyze/stream`, `/analysis/jobs`, `/analysis/jobs/{job_id}`, `/analysis/jobs/{job_id}/events`, `/ticker/validate`, `/status` | Canonical analysis flow adalah job API. |
| `routes/jobs.py` | helper | Job lifecycle, progress forwarding, terminal persistence. |
| `routes/sse.py` | helper | SSE formatting dan streaming pipeline. |
| `routes/pipeline_runner.py` | helper | Process pool bridge, preflight, cancellation. |
| `routes/analysis_history.py` | `/analysis/history` | SQLite snapshot history. |
| `routes/market.py` | `/market/quotes` | Dashboard quote tape. |
| `routes/news.py` | `/news/{ticker}`, dev `/debug/news/{ticker}` | Structured news context. |
| `routes/reports.py` | `/analysis/jobs/{job_id}/report.html`, `.pdf`, payload fallback | HTML/PDF export. |
| `routes/session.py` | `/session` | Owner token issue. |

## Job Store dan Cache

`backend/analysis_cache.py` berisi tiga runtime object:

| Object | Fungsi |
|---|---|
| `AnalysisResultCache` | Async TTL/LRU cache untuk result analysis yang selesai. |
| `InFlightRegistry` | Menggabungkan request identik yang sedang berjalan supaya hanya satu pipeline jalan. |
| `AnalysisJobStore` | Menyimpan job queued/running/completed/failed/cancelled, event replay, owner_id, cancel event. |

Cache key result memuat:

```text
ticker
trade_date
provider
quick_model
deep_model
analysis_mode
analysis_depth
time_horizon_months
max_debate_rounds
response_detail
has_existing_position
position_quantity
average_entry_price
```

Default:

| Setting | Default |
|---|---:|
| `ANALYSIS_RESULT_CACHE_TTL_SECONDS` | `28800` |
| `ANALYSIS_RESULT_CACHE_MAX_ENTRIES` | `256` |
| `ANALYSIS_JOB_TTL_SECONDS` | `28800` |
| `ANALYSIS_JOB_MAX_ENTRIES` | `256` |
| `ANALYSIS_JOB_MAX_ACTIVE` | `32` |
| `ANALYSIS_JOB_EVENT_REPLAY_LIMIT` | `500` |
| `ANALYSIS_JOB_CACHE_DB_PATH` | `.cache/analysis_jobs.sqlite3` |

Terminal job dipersist ke SQLite TTL cache jika status `completed`, `failed`,
atau `cancelled`.

## SQLite History

`backend/services/analysis_repository.py` menyimpan completed analysis sebagai
snapshot permanen.

Table: `analyses`

Kolom penting:

```text
request_id, job_id, ticker, market, trade_date, time_horizon_months,
analysis_depth, response_detail, decision, recommendation, current_price,
entry_price, stop_loss, take_profit, rr_ratio, source_summary, status,
result_json, request_json, created_at, updated_at, exported_html_at,
exported_pdf_at
```

Default:

| Setting | Default |
|---|---:|
| `ANALYSIS_DB_PATH` | `.cache/analysis_history.sqlite3` |
| `ANALYSIS_HISTORY_MAX_ROWS` | `1000` |
| `ANALYSIS_HISTORY_DEFAULT_LIMIT` | `25` |

Repository memakai `CREATE TABLE IF NOT EXISTS`, index SQLite, WAL journal, dan
evict row lama setelah melewati max row. Tidak ada migration framework.

## Process Pool

`routes/pipeline_runner.py` membuat process pool secara lazy.

Setting:

| Setting | Default | Detail |
|---|---:|---|
| `PROCESS_POOL_WORKERS` | `2` | Dibatasi oleh CPU count. |
| `PROCESS_POOL_MAX_TASKS_PER_CHILD` | `1` | Worker diganti setelah 1 task. |
| Multiprocessing context | `spawn` | Aman untuk Windows dan Docker. |
| `PIPELINE_TIMEOUT_SECONDS` | `600` | Timeout full pipeline. |
| `PREFLIGHT_TIMEOUT_SECONDS` | `30` | Timeout ticker preflight, dibatasi <= pipeline timeout. |

Cancellation:

- Job cancel memanggil `AnalysisJob.cancel()`.
- Backend set cancel event process-safe.
- Future process pool di-cancel best effort.
- Pipeline mengecek cancel via `cancel_check`.
- SSE disconnect juga men-trigger cancellation pada stream legacy dan job flow.

## Pipeline Balanced

Facade pipeline:

```text
backend/tradingagents-core/tradingagents/pipeline_balanced.py
```

Implementasi dibagi:

| File | Fungsi |
|---|---|
| `pipeline_balanced_data.py` | Data collection, vendor routing, chart, news, data quality, fundamentals deterministic. |
| `pipeline_balanced_prompts.py` | Prompt panjang untuk agent. |
| `pipeline_balanced_llm.py` | LLM creation, structured output, fallback, cache key. |
| `pipeline_balanced_progress.py` | Progress callback dan label agent. |
| `pipeline_balanced_orchestrator.py` | Control flow pipeline. |
| `pipeline_balanced_types.py` | Dataclass/type pipeline. |

Agent labels:

| `agent_id` | Label |
|---|---|
| `data_collection` | Data Collection |
| `news_fetch` | News Providers |
| `data_quality` | Data Quality |
| `market_analyst` | Market Analyst |
| `news_analyst` | News + Social Analyst |
| `fundamentals` | Fundamentals Analyst |
| `bull_researcher` | Bull Researcher |
| `bear_researcher` | Bear Researcher |
| `research_manager` | Research Manager |
| `trader` | Trader |
| `risk_analysts` | Risk Analysts |
| `portfolio_manager` | Portfolio Manager |

## Pipeline Execution Order

```text
Preflight market data
  -> Data Collection
  -> News Providers progress
  -> Data Quality progress
  -> Market Analyst, News + Social Analyst, Fundamentals Analyst
  -> Bull Researcher
  -> Bear Researcher
  -> Research Manager
  -> Trader
  -> Risk Analysts
  -> Portfolio Manager
  -> normalize_trade_levels()
  -> parse_final_result()
  -> shape_result()
  -> persist history
```

Parallelism:

| Tahap | Executor | Setting |
|---|---|---|
| Full pipeline worker | `ProcessPoolExecutor` | `PROCESS_POOL_WORKERS`. |
| Data collection inside worker | `ThreadPoolExecutor` | `DATA_COLLECTION_WORKERS`, capped by task count. |
| Initial analyst stage | `ThreadPoolExecutor` | `ANALYST_PARALLEL_WORKERS`, capped to 3. |
| Debate/decision | sequential | Each stage reads previous output. |

Analysis depth:

| Depth | Budget | Behavior |
|---|---:|---|
| `fast` | `6` | Analyst reports tetap jalan. Bull/bear dan risk committee memakai conservative fallback/skip behavior. |
| `balanced` | `9` | Default full flow. |
| `deep` | `12` | Extra debate/risk review round sesuai depth config. |

`deep_think_llm` dipakai untuk Research Manager dan Portfolio Manager.
`quick_think_llm` dipakai untuk analyst, bull, bear, trader, dan risk committee.

## Data Collection

Data collection mengumpulkan:

| Data | Sumber/Builder |
|---|---|
| Price/OHLCV | Vendor router, default yfinance lalu fallback. |
| Technical indicators | Calculated locally from OHLCV. |
| Fundamentals | yfinance, Finnhub, Alpha Vantage via router. |
| Balance sheet, income statement, cash flow | Quarterly dan annual statement. |
| Company profile | `company_profile.builder`. |
| Company news | `NewsService`, Google News Light/MarketAux/NewsData/yfinance fallback. |
| Global news | Vendor router. |
| News impact | `news_intelligence.build_news_impact`. |
| Catalyst tracker | `build_catalyst_tracker`. |
| Analyst consensus | `build_analyst_consensus`. |
| Financial highlights | `financial_highlights.builder`. |
| Fundamental analysis | `fundamentals.builder`. |
| Related news | Dedup dan rank news. |
| Data quality | `DataQualityReport`. |

Data quality mengklasifikasi:

```text
price_data
fundamentals
news
warnings
warning_details
```

Warning detail memakai code seperti `OHLCV_FALLBACK_USED`, `OHLCV_MISSING`,
`NEWS_PARTIAL`, `NEWS_UNAVAILABLE`, `FUNDAMENTALS_PARTIAL`,
`PRICE_DATA_PARTIAL`, dan `PRICE_MISSING`.

## Vendor Routing

Vendor order dari `.env.example`:

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

Finnhub bisa aktif sebagai fallback, tetapi enrichment default false:

```env
DATA_VENDOR_ENABLE_FINNHUB_FALLBACK=true
DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT=false
```

Multi-source news default false untuk menghindari biaya/quota lebih tinggi:

```env
DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS=false
```

## LLM Clients dan Cache

Supported providers berasal dari `tradingagents.llm_clients.model_catalog`:

```text
google, openai, anthropic, deepseek, openrouter, ollama
```

Config wajib:

```env
LLM_PROVIDER=<provider>
DEEP_THINK_LLM=<model>
QUICK_THINK_LLM=<model>
```

Provider key:

| Provider | Required key |
|---|---|
| `google` | `GOOGLE_API_KEY` atau `GEMINI_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `ollama` | Tidak perlu key, butuh `OLLAMA_BASE_URL`. |

LLM exact cache:

| Setting | Default |
|---|---:|
| `LLM_EXACT_CACHE_ENABLED` | `true` |
| `LLM_EXACT_CACHE_TTL_SECONDS` | `1800` |
| `LLM_EXACT_CACHE_MAX_ENTRIES` | `1024` |
| `LLM_EXACT_CACHE_DB_PATH` | `.cache/llm_exact_cache.sqlite3` |

Semantic cache default disabled karena keputusan trading time-sensitive:

| Setting | Default |
|---|---:|
| `LLM_SEMANTIC_CACHE_ENABLED` | `false` |
| `LLM_SEMANTIC_CACHE_TTL_SECONDS` | `3600` |
| `LLM_SEMANTIC_CACHE_MAX_ENTRIES` | `2048` |
| `LLM_SEMANTIC_CACHE_SIMILARITY_THRESHOLD` | `0.97` |
| `LLM_SEMANTIC_CACHE_TARGETS` | `news_summary,company_profile` |

## Frontend Architecture

Routes di `frontend/src/App.jsx`:

```text
/                         -> redirect /home
/home                     -> Dashboard
/analysis                 -> Analysis
/analysis/:resourceId     -> Analysis result lookup
/analysis-live            -> redirect /analysis
/analysis.test            -> gated mock route
/analysis.test/:resourceId -> gated mock lookup
/analysis-mock            -> gated redirect /analysis.test
*                         -> NotFound
```

State model:

| Area | Storage |
|---|---|
| Owner token | `sessionStorage`, key `_ta_owner_token`. |
| Owner token expiry | `sessionStorage`, key `_ta_owner_token_expires_at`. |
| Local history summary | `localStorage`, key `ta_analysis_history`. |
| Mock history summary | `localStorage`, key `ta_analysis_mock_history`. |
| Full history result | Backend SQLite, not localStorage. |

Mock route:

- Enabled only when `VITE_ENABLE_MOCK=true`.
- Uses `AnalysisMock.jsx`, `StockFormMock.jsx`, `useMockAnalysisJob.js`.
- Loads fixture from `frontend/dev/mockData.js`.
- Report export uses mock helpers in `frontend/src/utils/mockReport.js`.

## Frontend API URL

`buildApiUrl(path)`:

```text
API_URL = VITE_API_BASE_URL || VITE_API_URL || ''
if API_URL empty -> /api{path}
if API_URL ends with /api -> strip /api then append /api{path}
else -> {API_URL}/api{path}
```

Examples:

| Env | `buildApiUrl('/session')` |
|---|---|
| `VITE_API_BASE_URL=http://localhost:8000` | `http://localhost:8000/api/session` |
| `VITE_API_BASE_URL=/api` | `/api/session` |
| empty | `/api/session` |

## Docker Architecture

`docker-compose.yml` services:

| Service | Image/build | Port | Detail |
|---|---|---|---|
| `backend` | `Dockerfile.backend` | `127.0.0.1:8000:8000` | Python 3.11 slim, uvicorn, cache volume. |
| `frontend` | `Dockerfile.frontend` | `127.0.0.1:3000:80` | Node 22 build, nginx runtime. |
| `ollama` | `ollama/ollama:0.24.0` | `127.0.0.1:11434:11434` | Optional profile `ollama`. |

Backend Docker env overrides:

```env
APP_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173
REQUIRE_API_KEY_FOR_RATE_LIMIT=false
OLLAMA_BASE_URL=http://ollama:11434
XDG_CACHE_HOME=/root/.tradingagents/cache
YFINANCE_CACHE_DIR=/root/.tradingagents/cache/py-yfinance
ANALYSIS_JOB_CACHE_DB_PATH=/root/.tradingagents/cache/analysis_jobs.sqlite3
ANALYSIS_DB_PATH=/root/.tradingagents/cache/analysis_history.sqlite3
DATA_CACHE_DB_PATH=/root/.tradingagents/cache/market_data.sqlite3
```

Frontend Docker build args:

```env
VITE_API_BASE_URL=/api
VITE_ENABLE_MOCK=false
```

`docker-compose.mock.yml` hanya override:

```yaml
services:
  frontend:
    build:
      args:
        VITE_ENABLE_MOCK: "true"
```

## Persistence Paths

Local default dari `.env.example`:

| Data | Path |
|---|---|
| Job cache | `.cache/analysis_jobs.sqlite3` |
| Analysis history | `.cache/analysis_history.sqlite3` |
| Market data cache | `.cache/market_data.sqlite3` |
| News cache | `.cache/news_data.sqlite3` |
| Exact LLM cache | `.cache/llm_exact_cache.sqlite3` |
| Semantic LLM cache | `.cache/llm_semantic_cache.sqlite3` |
| yfinance cache | `YFINANCE_CACHE_DIR`, blank berarti platform default |

Docker important paths:

| Data | Path |
|---|---|
| Shared cache volume | `/root/.tradingagents/cache` |
| yfinance cache | `/root/.tradingagents/cache/py-yfinance` |
| Result/log volume | `/root/.tradingagents/logs` |
| Ollama model volume | `/root/.ollama` |

`.gitignore` dan `.dockerignore` mengecualikan `.env`, `.env.*`, cache, SQLite,
build output, node_modules, coverage, logs, dan archives.

## Report Architecture

Report path:

```text
Result JSON
  -> build_report_context()
  -> render_analysis_report_html()
  -> HTMLResponse
  -> render_analysis_report_pdf()
  -> WeasyPrint PDF bytes
```

Files:

| File | Fungsi |
|---|---|
| `backend/services/report_service.py` | Build context, render HTML, render PDF, filename. |
| `backend/services/report_disclaimer.py` | Legal disclaimer text. |
| `backend/templates/reports/analysis_report.html` | HTML template. |
| `backend/static/reports/analysis_report.css` | Report CSS. |
| `frontend/src/utils/reportApi.js` | Open HTML preview, download PDF, fallback payload export. |
| `frontend/src/components/ExportReportButtons.jsx` | UI buttons. |

Report export mencatat audit best effort ke SQLite:

```text
exported_html_at
exported_pdf_at
```

## Constraints

- Python 3.13 tidak didukung oleh `tradingagents-core` karena package requires
  `>=3.10,<3.13`.
- Backend Docker memakai Python 3.11.
- Local Windows bisa punya Python global berbeda. Pakai venv/conda Python 3.11
  atau 3.12.
- Backend API server hanya mendukung `ANALYSIS_MODE=balanced`.
- `CORS_ORIGINS=*` ditolak.
- Production butuh `API_KEY` dan `OWNER_SESSION_SECRET`.
- SSE path tidak boleh dikompresi.
- Frontend local Vite butuh backend URL absolut karena tidak ada proxy.
- Market yang didukung hanya `US` dan `ID`.
- Non-ID exchange suffix ditolak.
- Unit test tidak boleh memanggil external vendor atau LLM live.
