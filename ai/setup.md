# Setup Guide

Terakhir disinkronkan: 2026-06-03.

Dokumen ini menjelaskan cara menjalankan TradingAgent secara local, Docker,
mock mode, test, dan konfigurasi env. Port dan endpoint mengikuti kode aktif.

## Port Map

| Komponen | Local dev | Docker host | Internal container | Source |
|---|---:|---:|---:|---|
| Backend FastAPI | `127.0.0.1:8000` | `127.0.0.1:8000` | `0.0.0.0:8000` | `Dockerfile.backend`, `docker-compose.yml`. |
| Frontend Vite | `127.0.0.1:3000` | tidak dipakai | tidak dipakai | `frontend/vite.config.js`. |
| Frontend nginx | tidak dipakai | `127.0.0.1:3000` | `80` | `Dockerfile.frontend`, `docker-compose.yml`. |
| Ollama | `localhost:11434` | `127.0.0.1:11434` | `ollama:11434` | Compose profile `ollama`. |
| Backend health | `http://127.0.0.1:8000/health` | sama | `http://localhost:8000/health` | Backend healthcheck. |
| Frontend health | tidak ada di Vite | `http://127.0.0.1:3000/health` | `http://127.0.0.1/health` | Nginx healthcheck. |

## Requirements

| Tool | Version | Catatan |
|---|---|---|
| Python | 3.10, 3.11, atau 3.12 | Core package menolak Python 3.13. Docker backend memakai 3.11. |
| Node.js | 22 recommended | Docker frontend memakai Node 22 alpine. |
| npm | Versi bawaan Node | `npm ci` dipakai Docker build. |
| Git | Any current version | Untuk clone dan branch. |
| Docker | Current Docker Desktop | Untuk Compose. |
| Conda atau venv | Optional | Disarankan di Windows agar Python tidak bentrok. |

## Local Setup di Windows

Jika Python global kamu 3.13, buat environment khusus.

Conda:

```powershell
conda create -n tradingagents python=3.11 -y
conda activate tradingagents
python --version
```

venv dengan Python launcher:

```powershell
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python --version
```

Versi yang valid harus 3.10, 3.11, atau 3.12.

## Backend Local

Masuk ke folder backend:

```powershell
cd d:\CODING\TradingAgents\backend
```

Install dependency:

```powershell
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

`requirements.txt` sudah berisi:

```text
-e ./tradingagents-core
fastapi==0.115.6
uvicorn[standard]==0.34.0
python-dotenv==1.2.2
sse-starlette==3.0.3
python-multipart==0.0.28
jinja2==3.1.6
weasyprint==63.1
```

Buat env:

```powershell
Copy-Item .env.example .env
```

Minimum env untuk Google:

```env
APP_ENV=development
LLM_PROVIDER=google
DEEP_THINK_LLM=gemini-2.5-pro
QUICK_THINK_LLM=gemini-2.5-flash
GOOGLE_API_KEY=your_key_here
```

Minimum env untuk DeepSeek:

```env
APP_ENV=development
LLM_PROVIDER=deepseek
DEEP_THINK_LLM=deepseek-chat
QUICK_THINK_LLM=deepseek-chat
DEEPSEEK_API_KEY=your_key_here
```

Minimum env untuk Ollama local:

```env
APP_ENV=development
LLM_PROVIDER=ollama
DEEP_THINK_LLM=llama3:latest
QUICK_THINK_LLM=llama3:latest
OLLAMA_BASE_URL=http://localhost:11434
```

Jalankan backend:

```powershell
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Health check:

```powershell
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{
  "status": "ok",
  "provider": "google"
}
```

Startup akan gagal jika:

- `LLM_PROVIDER` kosong atau invalid.
- API key provider tidak ada, kecuali provider `ollama`.
- `DEEP_THINK_LLM` kosong.
- `QUICK_THINK_LLM` kosong.
- Production tidak punya `API_KEY`.
- Production tidak punya `OWNER_SESSION_SECRET`.
- `CORS_ORIGINS=*`.
- Directory result/cache tidak writable.

## Frontend Local

Masuk ke folder frontend:

```powershell
cd d:\CODING\TradingAgents\frontend
```

Install dependency:

```powershell
npm install
```

Buat env:

```powershell
Copy-Item .env.example .env
```

Untuk local Vite, ubah `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_API_URL=
VITE_DEV_HOST=127.0.0.1
VITE_DEV_PORT=3000
VITE_ENABLE_MOCK=false
VITE_CLOCK_TIME_ZONE=Asia/Jakarta
VITE_CLOCK_LABEL=WIB
```

Alasan: Vite config saat ini tidak punya proxy `/api`. Jika kamu membiarkan
`VITE_API_BASE_URL=/api`, browser akan memanggil Vite di port 3000 untuk API dan
request gagal.

Jalankan frontend:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

NPM scripts:

| Script | Command | Fungsi |
|---|---|---|
| `start` | `vite --host 127.0.0.1 --port 3000` | Alias dev. |
| `dev` | `vite --host 127.0.0.1 --port 3000` | Local dev server. |
| `build` | `vite build` | Production build. |
| `preview` | `vite preview --host 127.0.0.1 --port 3000` | Preview build. |
| `test` | `vitest --environment jsdom` | Test watch. |
| `lint` | `eslint .` | ESLint. |
| `format:check` | `prettier --check ...` | Format check. |
| `quality` | lint, format check, tests | Full frontend quality. |
| `dev:lan` | `vite --host 0.0.0.0 --port 3000` | LAN dev. |
| `preview:lan` | `vite preview --host 0.0.0.0 --port 3000` | LAN preview. |

## Local Mock UI

Mock UI tidak memanggil backend analysis. Ini berguna untuk UI debugging.

Set:

```env
VITE_ENABLE_MOCK=true
```

Jalankan:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:3000/analysis.test
```

Mock files:

| File | Fungsi |
|---|---|
| `frontend/src/pages/AnalysisMock.jsx` | Mock page. |
| `frontend/src/components/StockFormMock.jsx` | Mock form. |
| `frontend/src/hooks/useMockAnalysisJob.js` | Simulasi job progress/result. |
| `frontend/dev/mockData.js` | Fixture result. |
| `frontend/src/utils/mockReport.js` | Mock HTML/PDF export. |

## Docker Setup

Buat backend env:

```powershell
Copy-Item backend\.env.example backend\.env
```

Isi provider dan API key di `backend/.env`.

Jalankan:

```powershell
docker compose up --build
```

URL:

| Service | URL |
|---|---|
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:8000` |
| Backend health | `http://localhost:8000/health` |
| Frontend health | `http://localhost:3000/health` |

Stop:

```powershell
docker compose down
```

Lihat log backend:

```powershell
docker compose logs -f backend
```

Lihat log frontend:

```powershell
docker compose logs -f frontend
```

Docker binding:

| Service | Binding |
|---|---|
| backend | `127.0.0.1:8000:8000` |
| frontend | `127.0.0.1:3000:80` |
| ollama | `127.0.0.1:11434:11434` |

Docker volumes:

| Volume | Path | Fungsi |
|---|---|---|
| `tradingagent-cache` | `/root/.tradingagents/cache` | SQLite cache/history, yfinance cache. |
| `tradingagent-results` | `/root/.tradingagents/logs` | Result/log runtime. |
| `ollama-data` | `/root/.ollama` | Model Ollama. |

Docker frontend memakai build arg:

```env
VITE_API_BASE_URL=/api
VITE_ENABLE_MOCK=false
```

Nginx proxy:

```text
/api/* -> http://backend:8000/api/*
```

Jika backend API key enforcement aktif, set host env:

```powershell
$env:BACKEND_API_KEY="your_backend_api_key"
docker compose up --build
```

Nginx akan menyisipkan header `x-api-key`. Browser tetap mengambil
`x-owner-token` dari `POST /api/session`.

## Docker Mock Overlay

Jalankan:

```powershell
docker compose -f docker-compose.yml -f docker-compose.mock.yml up --build
```

Open:

```text
http://localhost:3000/analysis.test
```

Overlay ini hanya mengubah frontend build arg:

```yaml
VITE_ENABLE_MOCK: "true"
```

## Docker dengan Ollama

Jalankan Compose dengan profile:

```powershell
docker compose --profile ollama up --build
```

Pull model:

```powershell
docker exec -it tradingagent-ollama ollama pull llama3:latest
```

Backend env untuk Docker Ollama:

```env
LLM_PROVIDER=ollama
DEEP_THINK_LLM=llama3:latest
QUICK_THINK_LLM=llama3:latest
OLLAMA_BASE_URL=http://ollama:11434
```

Compose sudah override `OLLAMA_BASE_URL=http://ollama:11434` untuk container
backend.

## Backend Tests

Unit tests:

```powershell
cd d:\CODING\TradingAgents\backend
pytest tests/ -m "not integration and not live_api" -v
```

Coverage:

```powershell
pytest tests/ -m "not integration and not live_api" --cov=. --cov-report=term-missing
```

Core package tests:

```powershell
cd d:\CODING\TradingAgents\backend\tradingagents-core
pytest tests/ -m "not integration and not live_api" -v
```

Backend lint/format:

```powershell
cd d:\CODING\TradingAgents\backend
python -m ruff check .
python -m ruff format --check .
```

PowerShell quality script:

```powershell
cd d:\CODING\TradingAgents\backend
.\scripts\quality.ps1
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

Format check:

```powershell
npm run format:check
```

Full quality:

```powershell
npm run quality
```

## Seed Development History Snapshot

Untuk menambahkan satu snapshot mock ke SQLite history tanpa memanggil provider
atau LLM:

```powershell
cd d:\CODING\TradingAgents\backend
python scripts\seed_mock_analysis.py
```

Snapshot masuk ke `ANALYSIS_DB_PATH`.

## Backtest Folder

Folder `backtest/` saat ini berisi env template dan env local. Belum ada runner
kode backtest di repo audit ini.

Gunakan template:

```text
backtest/.env.backtest.example
```

Jangan commit:

```text
backtest/.env.backtest
```

Backtest env template:

| Variable | Default contoh | Fungsi |
|---|---|---|
| `LLM_PROVIDER` | `google` | Provider LLM. |
| `LLM_MODEL` | `gemini-3.5-flash` | Legacy single model setting untuk backtest. |
| `QUICK_THINK_LLM` | `gemini-3.1-flash-lite` | Model cepat. |
| `DEEP_THINK_LLM` | `gemini-3.5-flash` | Model reasoning. |
| `GOOGLE_API_KEY` | placeholder | Google key. |
| `GEMINI_API_KEY` | placeholder | Gemini key alias. |
| `MAX_PIPELINE_RETRIES` | `3` | Retry pipeline. |
| `RETRY_BASE_DELAY_SECONDS` | `5.0` | Delay dasar retry. |
| `DELAY_BETWEEN_CALLS_SECONDS` | `3` | Delay antar call. |
| `BACKTEST_LOG_LEVEL` | `INFO` | Log level. |
| `FORCE_REGENERATE_SIGNALS` | `false` | Regenerate signal. |
| `BACKTEST_START` | `2022-01-03` | Periode mulai. |
| `BACKTEST_END` | `2024-12-31` | Periode selesai. |
| `TARGET_TRADES_PER_TICKER` | `50` | Target jumlah trade. |
| `SIGNAL_FREQUENCY` | `weekly` | Frekuensi signal. |
| `ENTRY_SIGNAL` | `BUY` | Signal entry. |
| `EXIT_RULE` | `A` | Rule exit. |
| `HOLD_WEEKS` | `4` | Lama hold default. |
| `MAX_HOLD_WEEKS` | `8` | Lama hold maksimum. |
| `DEFAULT_SL_PCT` | `-0.05` | Stop loss default. |
| `DEFAULT_TP_PCT` | `0.10` | Take profit default. |
| `BREAKEVEN_THRESHOLD` | `0.005` | Threshold breakeven. |
| `ANALYSIS_DEPTH` | `fast` | Depth analisis backtest. |
| `RESPONSE_DETAIL` | `summary` | Detail response. |
| `TIME_HORIZON_MONTHS` | `1` | Horizon bulan. |
| `MAX_DEBATE_ROUNDS` | `1` | Debate round. |
| `MAX_GEMINI_CALLS` | `5` | Budget Gemini. |
| `OUTPUT_LANGUAGE` | `English` | Bahasa output. |

## Backend Env Reference

File canonical:

```text
backend/.env.example
```

### Server dan Security

| Variable | Default | Fungsi |
|---|---|---|
| `APP_ENV` | `development` | Mode runtime. Valid: `development`, `production`. |
| `CORS_ORIGINS` | local origins | Origin frontend yang diizinkan. `*` ditolak. |
| `API_KEY` | blank | Service credential untuk `x-api-key` atau bearer token. Wajib production. |
| `REQUIRE_API_KEY_FOR_RATE_LIMIT` | `false` | Jika true, request tanpa API key ditolak. |
| `OWNER_SESSION_SECRET` | blank | HMAC secret owner token. Wajib production. |
| `OWNER_SESSION_TTL_SECONDS` | blank | Default mengikuti `ANALYSIS_JOB_TTL_SECONDS`. |

### Runtime dan Worker

| Variable | Default | Fungsi |
|---|---:|---|
| `PIPELINE_TIMEOUT_SECONDS` | `600` | Timeout full analysis. |
| `PREFLIGHT_TIMEOUT_SECONDS` | `30` | Timeout preflight market data. |
| `PROCESS_POOL_WORKERS` | `2` | Jumlah process worker, capped CPU count. |
| `PROCESS_POOL_MAX_TASKS_PER_CHILD` | `1` | Worker diganti setelah task selesai. |
| `DATA_COLLECTION_WORKERS` | `3` | Thread worker data collection. |
| `ANALYST_PARALLEL_WORKERS` | `3` | Thread worker analyst awal, capped to 3. |
| `DEFAULT_MAX_DEBATE_ROUNDS` | `3` | Default debate round. |

### Rate Limit dan Body Limit

| Variable | Default | Fungsi |
|---|---:|---|
| `REQUEST_RATE_LIMIT_PER_MINUTE` | `20` | Limit request biasa per owner. |
| `STREAM_RATE_LIMIT_PER_MINUTE` | `8` | Limit stream/job submit per owner. |
| `MAX_CONCURRENT_REQUESTS_PER_KEY` | `2` | Concurrent request biasa per owner. |
| `MAX_CONCURRENT_STREAMS_PER_KEY` | `1` | Concurrent stream/job per owner. |
| `REQUEST_BODY_MAX_BYTES` | `65536` | Batas payload request. |

### LLM dan Tool Resilience

| Variable | Default | Fungsi |
|---|---:|---|
| `LLM_TIMEOUT_SECONDS` | `60` | Timeout per LLM call. |
| `LLM_MAX_RETRIES` | `2` | Retry LLM default. |
| `PROVIDER_SDK_MAX_RETRIES` | `0` | Retry internal provider SDK. |
| `TOOL_TIMEOUT_SECONDS` | `45` | Timeout tool/data helper. |
| `TOOL_MAX_RETRIES` | `2` | Retry tool/data helper. |

### Result, Job, dan Data Cache

| Variable | Default | Fungsi |
|---|---:|---|
| `CACHE_TTL_SECONDS` | `900` | Default TTL cache umum. |
| `CACHE_MAX_ENTRIES` | `512` | Default max entry cache umum. |
| `ANALYSIS_RESULT_CACHE_TTL_SECONDS` | `28800` | TTL result cache in-memory. |
| `ANALYSIS_RESULT_CACHE_MAX_ENTRIES` | `256` | Max result cache. |
| `ANALYSIS_JOB_TTL_SECONDS` | `28800` | TTL job terminal. |
| `ANALYSIS_JOB_MAX_ENTRIES` | `256` | Max job store. |
| `ANALYSIS_JOB_MAX_ACTIVE` | `32` | Max queued/running job. |
| `ANALYSIS_JOB_EVENT_REPLAY_LIMIT` | `500` | Max event history per job. |
| `ANALYSIS_JOB_CACHE_DB_PATH` | `.cache/analysis_jobs.sqlite3` | SQLite TTL cache job terminal. |
| `ANALYSIS_DB_PATH` | `.cache/analysis_history.sqlite3` | SQLite permanent analysis history. |
| `ANALYSIS_HISTORY_MAX_ROWS` | `1000` | Max row history. |
| `ANALYSIS_HISTORY_DEFAULT_LIMIT` | `25` | Default list history limit. |
| `DATA_CACHE_DB_PATH` | `.cache/market_data.sqlite3` | SQLite market data cache. |
| `DATA_CACHE_TTL_SECONDS` | `900` | TTL market data cache. |
| `DATA_CACHE_MAX_ENTRIES` | `512` | Max market data cache. |

### LLM Cache

| Variable | Default | Fungsi |
|---|---:|---|
| `LLM_EXACT_CACHE_ENABLED` | `true` | Exact prompt/schema/model cache. |
| `LLM_EXACT_CACHE_TTL_SECONDS` | `1800` | TTL exact LLM cache. |
| `LLM_EXACT_CACHE_MAX_ENTRIES` | `1024` | Max exact cache. |
| `LLM_EXACT_CACHE_DB_PATH` | `.cache/llm_exact_cache.sqlite3` | SQLite exact cache path. |
| `LLM_SEMANTIC_CACHE_ENABLED` | `false` | Semantic cache. Default off. |
| `LLM_SEMANTIC_CACHE_TTL_SECONDS` | `3600` | TTL semantic cache. |
| `LLM_SEMANTIC_CACHE_MAX_ENTRIES` | `2048` | Max semantic cache. |
| `LLM_SEMANTIC_CACHE_DB_PATH` | `.cache/llm_semantic_cache.sqlite3` | SQLite semantic cache path. |
| `LLM_SEMANTIC_CACHE_SIMILARITY_THRESHOLD` | `0.97` | Similarity threshold. |
| `LLM_SEMANTIC_CACHE_TARGETS` | `news_summary,company_profile` | Semantic cache targets. |

### Runtime Cache Path

| Variable | Default | Fungsi |
|---|---|---|
| `XDG_CACHE_HOME` | blank | Runtime cache home. Docker override ke `/root/.tradingagents/cache`. |
| `YFINANCE_CACHE_DIR` | blank | yfinance cache dir. Docker override ke `/root/.tradingagents/cache/py-yfinance`. |
| `YFINANCE_TICKER_CACHE_MAX_ENTRIES` | `512` | Max yfinance ticker cache. |
| `TRADINGAGENTS_TIMEOUT_MAX_ABANDONED_CALLS` | blank | Max abandoned timeout call, blank memakai default core. |

### LLM Provider

| Variable | Default | Fungsi |
|---|---|---|
| `LLM_PROVIDER` | blank | Wajib. Valid: `google`, `openai`, `anthropic`, `deepseek`, `openrouter`, `ollama`. |
| `DEEP_THINK_LLM` | blank | Wajib. Research Manager dan Portfolio Manager. |
| `QUICK_THINK_LLM` | blank | Wajib. Analyst, debate, trader, risk. |
| `GOOGLE_API_KEY` | blank | Google/Gemini key. |
| `GEMINI_API_KEY` | blank | Alias Google/Gemini key. |
| `OPENAI_API_KEY` | blank | OpenAI key. |
| `ANTHROPIC_API_KEY` | blank | Anthropic key. |
| `DEEPSEEK_API_KEY` | blank | DeepSeek key. |
| `OPENROUTER_API_KEY` | blank | OpenRouter key. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint. |

### Optional Data Provider Keys

| Variable | Default | Fungsi |
|---|---|---|
| `ALPHA_VANTAGE_API_KEY` | blank | Optional market/news/fundamental fallback. |
| `GOOGLE_NEWS_LIGHT_API_KEY` | blank | SearchAPI.io Google News Light primary. |
| `MARKETAUX_API_KEY` | blank | Structured company news fallback. |
| `NEWSDATA_API_KEY` | blank | Structured company news secondary fallback. |
| `FINNHUB_API_KEY` | blank | Optional Finnhub fallback/enrichment. |

### News Provider

| Variable | Default | Fungsi |
|---|---:|---|
| `NEWS_PROVIDER_PRIORITY` | `google_news_light,marketaux,newsdata` | Urutan provider structured news. |
| `NEWS_ENABLED_PROVIDERS` | `google_news_light,marketaux,newsdata` | Provider news aktif. |
| `NEWS_DEFAULT_WINDOW_DAYS` | `30` | Window default news. |
| `NEWS_MAX_ARTICLES_PER_PROVIDER` | `10` | Limit artikel per provider. |
| `NEWS_MAX_ARTICLES_FOR_PROMPT` | `5` | Artikel masuk prompt. |
| `NEWS_MAX_ARTICLES_FOR_UI` | `20` | Artikel tampil UI. |
| `NEWS_MIN_RELEVANCE_SCORE` | `50` | Min relevance umum. |
| `NEWS_PROMPT_MIN_RELEVANCE_SCORE` | `65` | Min relevance untuk prompt. |
| `NEWS_CACHE_ENABLED` | `true` | Enable news cache. |
| `NEWS_CACHE_TTL_MINUTES` | `360` | TTL news cache. |
| `NEWS_CACHE_DB_PATH` | `.cache/news_data.sqlite3` | SQLite news cache. |
| `NEWS_CACHE_MAX_ENTRIES` | `512` | Max news cache. |
| `NEWS_DEBUG_RAW_RESPONSE` | `false` | Include raw debug response. |
| `NEWS_LOG_PROVIDER_REQUESTS` | `true` | Log provider request. |
| `NEWS_VENDOR_TIMEOUT_SECONDS` | `15` | Timeout news vendor. |
| `NEWS_VENDOR_MAX_RETRIES` | `2` | Retry news vendor. |
| `NEWS_FETCH_SECONDARY_ALWAYS` | `false` | Fetch secondary walau primary cukup. |
| `NEWS_SECONDARY_FETCH_THRESHOLD` | `5` | Fetch secondary jika artikel di bawah threshold. |
| `NEWS_ENABLE_YFINANCE_FALLBACK` | `true` | yfinance fallback untuk news. |

### Finnhub

| Variable | Default | Fungsi |
|---|---:|---|
| `FINNHUB_BASE_URL` | `https://finnhub.io/api/v1` | Finnhub API base. |
| `FINNHUB_ENABLED` | `true` | Enable Finnhub globally, tetap skip jika key kosong. |
| `FINNHUB_TIMEOUT_SECONDS` | `15` | Timeout Finnhub. |
| `FINNHUB_MAX_RETRIES` | `1` | Retry Finnhub. |
| `FINNHUB_RETRY_BACKOFF_SECONDS` | `1` | Backoff retry. |
| `FINNHUB_ENABLE_STOCK_DATA` | `true` | Stock quote/candle. |
| `FINNHUB_ENABLE_FUNDAMENTALS` | `true` | Fundamentals. |
| `FINNHUB_ENABLE_NEWS` | `false` | News endpoint. |
| `FINNHUB_ENABLE_SENTIMENT` | `false` | Sentiment endpoint. |
| `FINNHUB_ENABLE_EVENTS` | `false` | Events/earnings. |
| `FINNHUB_ENABLE_INSIDER` | `false` | Insider endpoint. |
| `FINNHUB_ENABLE_FOREX` | `false` | Forex endpoint. |
| `FINNHUB_ENABLE_CRYPTO` | `false` | Crypto endpoint. |
| `FINNHUB_ENABLE_SYMBOL_RESOLVER` | `true` | Symbol resolver. |
| `FINNHUB_QUOTE_CACHE_TTL_SECONDS` | `120` | Quote cache TTL. |
| `FINNHUB_OHLCV_CACHE_TTL_SECONDS` | `21600` | OHLCV cache TTL. |
| `FINNHUB_PROFILE_CACHE_TTL_SECONDS` | `604800` | Profile cache TTL. |
| `FINNHUB_METRICS_CACHE_TTL_SECONDS` | `604800` | Metrics cache TTL. |
| `FINNHUB_FINANCIAL_STATEMENT_CACHE_TTL_SECONDS` | `2592000` | Statements cache TTL. |
| `FINNHUB_NEWS_CACHE_TTL_SECONDS` | `3600` | News cache TTL. |
| `FINNHUB_SENTIMENT_CACHE_TTL_SECONDS` | `3600` | Sentiment cache TTL. |
| `FINNHUB_EVENT_CACHE_TTL_SECONDS` | `43200` | Event cache TTL. |
| `FINNHUB_INSIDER_CACHE_TTL_SECONDS` | `43200` | Insider cache TTL. |
| `FINNHUB_FOREX_CACHE_TTL_SECONDS` | `300` | Forex cache TTL. |
| `FINNHUB_CRYPTO_CACHE_TTL_SECONDS` | `120` | Crypto cache TTL. |
| `FINNHUB_SYMBOL_CACHE_TTL_SECONDS` | `2592000` | Symbol cache TTL. |
| `FINNHUB_MAX_CALLS_PER_ANALYSIS` | `12` | Per-analysis Finnhub budget. |

### Vendor Routing

| Variable | Default | Fungsi |
|---|---|---|
| `DATA_VENDOR_MAX_CALLS_PER_ANALYSIS` | `40` | Total vendor call budget. |
| `DATA_VENDOR_CORE_STOCK_APIS` | `yfinance,finnhub,alpha_vantage` | Core stock APIs. |
| `DATA_VENDOR_QUOTE_DATA` | `yfinance,finnhub,alpha_vantage` | Quote/current price. |
| `DATA_VENDOR_TECHNICAL_INDICATORS` | `yfinance,finnhub,alpha_vantage` | Technical data source before local calculation. |
| `DATA_VENDOR_FUNDAMENTAL_DATA` | `yfinance,finnhub,alpha_vantage` | Fundamental data. |
| `DATA_VENDOR_FINANCIAL_STATEMENTS` | `yfinance,alpha_vantage,finnhub` | Financial statements. |
| `DATA_VENDOR_NEWS_DATA` | `google_news_light,marketaux,newsdata,yfinance,finnhub,alpha_vantage` | Company news. |
| `DATA_VENDOR_GLOBAL_NEWS_DATA` | `yfinance,finnhub,alpha_vantage` | Global/macro news. |
| `DATA_VENDOR_SENTIMENT_DATA` | `finnhub,alpha_vantage` | News sentiment. |
| `DATA_VENDOR_SOCIAL_SENTIMENT` | `finnhub` | Social sentiment. |
| `DATA_VENDOR_EVENT_DATA` | `finnhub` | Event/earnings. |
| `DATA_VENDOR_ANALYST_RATING` | `finnhub` | Analyst rating. |
| `DATA_VENDOR_INSIDER_DATA` | `finnhub,alpha_vantage,yfinance` | Insider data. |
| `DATA_VENDOR_FOREX_DATA` | `finnhub,alpha_vantage` | Forex, deferred in main app. |
| `DATA_VENDOR_CRYPTO_DATA` | `finnhub,alpha_vantage` | Crypto, deferred in main app. |

### Vendor Guards dan Symbols

| Variable | Default | Fungsi |
|---|---:|---|
| `DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS` | `false` | Fetch multiple news vendors at once. |
| `DATA_VENDOR_ENABLE_MULTI_SOURCE_PRICE` | `false` | Multi-source price. |
| `DATA_VENDOR_ENABLE_FINNHUB_FALLBACK` | `true` | Allow Finnhub fallback. |
| `DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT` | `false` | Optional Finnhub enrichment. |
| `DATA_VENDOR_REQUIRE_SOURCE_METADATA` | `true` | Require source metadata. |
| `DATA_VENDOR_RETURN_PARTIAL_ON_FAILURE` | `true` | Return partial data when vendor fails. |
| `MAX_NEWS_PER_VENDOR` | `10` | News limit per vendor. |
| `MAX_TOTAL_NEWS_ITEMS` | `25` | Total news limit. |
| `NEWS_DEDUP_BY` | `url,title` | News dedupe key. |
| `DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE` | `0.35` | Min relevance for vendor news. |
| `DEFAULT_INDONESIA_SUFFIX` | `.JK` | IDX suffix. |
| `DEFAULT_FOREX_EXCHANGE` | `OANDA` | Forex default, deferred. |
| `DEFAULT_CRYPTO_EXCHANGE` | `BINANCE` | Crypto default, deferred. |
| `DEFAULT_US_EXCHANGE` | `US` | US exchange default. |

## Frontend Env Reference

File canonical:

```text
frontend/.env.example
```

| Variable | Default | Fungsi |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Primary backend base. Docker/nginx memakai `/api`. Local Vite harus override ke `http://localhost:8000`. |
| `VITE_API_URL` | blank | Legacy alias. Jangan pakai untuk config baru. |
| `VITE_DEV_HOST` | `127.0.0.1` | Vite dev/preview host. |
| `VITE_DEV_PORT` | `3000` | Vite dev/preview port. |
| `VITE_CLOCK_TIME_ZONE` | `Asia/Jakarta` | Timezone navbar clock. |
| `VITE_CLOCK_LABEL` | `WIB` | Label navbar clock. |
| `VITE_ENABLE_MOCK` | `false` | Enable mock routes jika `true`. |

## Common Problems

### Backend startup gagal

Cek log `STARTUP CONFIG ERROR`.

Penyebab umum:

- `LLM_PROVIDER` kosong.
- Provider key kosong.
- `DEEP_THINK_LLM` kosong.
- `QUICK_THINK_LLM` kosong.
- `APP_ENV=production` tetapi `API_KEY` kosong.
- `APP_ENV=production` tetapi `OWNER_SESSION_SECRET` kosong.
- `CORS_ORIGINS=*`.
- Cache/results directory tidak writable.

### Frontend local memanggil /api di port 3000

Gejala:

```text
POST http://127.0.0.1:3000/api/session 404
```

Fix:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Restart Vite setelah mengubah env.

### CORS error

Fix:

```env
APP_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173
```

Pastikan frontend memakai host yang ada di CORS.

### Missing owner session token

Gejala:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing owner session token. Call POST /api/session first."
  }
}
```

Fix:

- Pakai helper `buildAuthHeaders()` atau `buildHeaders()`.
- Pastikan `POST /api/session` berhasil.
- Hapus `sessionStorage` jika token expired setelah backend restart.

### `tradingagents` module not found

Fix:

```powershell
cd d:\CODING\TradingAgents\backend
pip install -e .\tradingagents-core
```

### WeasyPrint PDF gagal local

Docker backend sudah memasang library system untuk WeasyPrint. Local Windows
bisa butuh dependency tambahan. Jika PDF penting dan local gagal, jalankan via
Docker backend.

### yfinance atau vendor timeout

Cek:

- `PREFLIGHT_TIMEOUT_SECONDS`
- `TOOL_TIMEOUT_SECONDS`
- `DATA_VENDOR_*`
- API key optional vendor
- quota vendor
- network/DNS

### Python 3.13 error

Core package requires:

```text
>=3.10,<3.13
```

Gunakan Python 3.11 atau 3.12.
