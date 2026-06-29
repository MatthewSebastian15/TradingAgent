# TradingAgent

TradingAgent is a full-stack application for multi-agent LLM-based stock analysis. The backend uses **FastAPI**, the frontend uses **React/Vite**, and the core engine wraps the TradingAgents framework with a more structured analysis pipeline for personal and development use.

The application receives a stock ticker, market, analysis date, investment horizon, analysis depth, and the user's existing position status. It then fetches market data from the configured vendors, runs several analyst agents, and returns a structured **Buy / Hold / Sell** decision with an executive summary, investment thesis, action plan, risk validation, data quality details, and HTML/PDF export options.

> This application is a research tool, not financial advice. Always validate the data, risk assumptions, and trading decisions independently before taking action.

---

## Main Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI Agent Analysis** | Async, job-based pipeline of 9 LLM agents (Market, News/Social, Fundamentals, Bull/Bear, Research Manager, Trader, Risk, Portfolio Manager) returning a Buy/Hold/Sell/Wait decision with thesis, action plan, and risk validation. `fast`/`balanced`/`deep` depth, multi-provider LLM (Google, OpenAI, Anthropic, DeepSeek). |
| 🧮 **Quant & Fundamentals** | Result tabs for risk-adjusted return (Sharpe/Sortino, beta/alpha), drawdown, volatility, and risk-reward, alongside Income/Balance/Cash Flow/Ratios tables, fundamental charts, company profile, and technical entry quality. |
| 📈 **Market Dashboard** | Overview presets, movers, ticker tape, symbol search, OHLCV charts, sparklines, and live quotes over global yfinance symbols and markets (`US`, `ID`, `IDX`, `GLOBAL`, `CRYPTO`, `ETF`, `FUND`). |
| 🌐 **Economic Dashboard** | Macro tab spanning Rates & Money, Growth, Inflation, Fiscal, Trade, and Development, sourced from multiple economic data providers. |
| 📰 **News** | General news dashboard with categories and SSE refresh, per-ticker news streams, and multi-provider aggregation (Google News Light, Marketaux, NewsData, RSS, yfinance, Finnhub). |
| 💬 **RAG Chatbot** | Scoped retrieval chatbot answering over News, Market, Analysis, Portfolio, and Economic data pools. |
| 💼 **Watchlist & Portfolio** | Browser-local watchlist groups and holdings tracking, priced with live market quotes and trend sparklines. |
| 🔎 **Research Workspace** | Command-bar and sidebar research page for ad-hoc lookups. |

---

## Architecture

```text
Frontend React/Vite
  ├─ AI Agent UI
  ├─ Market Dashboard
  ├─ News Dashboard
  ├─ Report Actions
  └─ Local history fallback
        │
        ▼
Backend FastAPI
  ├─ Session + rate limit
  ├─ Analysis job API
  ├─ SSE progress stream
  ├─ Market API
  ├─ News API
  ├─ Report HTML/PDF API
  └─ SQLite cache/history stores
        │
        ▼
packages/tradingagents
  ├─ Data vendor router
  ├─ yfinance / Finnhub / Alpha Vantage / SEC / RSS / news providers
  ├─ Multi-agent analysis pipeline
  └─ LLM provider adapters
```

Default ports:

| Service | URL |
|---|---|
| Frontend dev | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| Backend health | `http://localhost:8000/health` |

---

## Technology Stack

### Frontend

- React 18
- Vite 8
- React Router 6
- Tailwind CSS
- Radix UI
- Lucide React
- Vitest
- ESLint
- Prettier

### Backend

- Python 3.11
- FastAPI
- Uvicorn
- Pydantic
- SSE Starlette
- Jinja2
- WeasyPrint
- SQLite
- Local `tradingagents` package from `packages/`

### Data and AI

- yfinance as the primary market, fundamental, and quote data source.
- Finnhub and Alpha Vantage as optional vendors.
- SEC companyfacts for US fundamentals.
- Google News Light, Marketaux, NewsData, RSS context, and yfinance news for news data.
- LLM providers: Google, OpenAI, Anthropic, and DeepSeek.

---

## Folder Structure

```text
TradingAgent-main/
├─ backend/
│  ├─ main.py
│  ├─ config*.py
│  ├─ routes/
│  ├─ services/
│  ├─ templates/reports/
│  ├─ static/reports/
│  ├─ tests/
│  └─ scripts/
├─ packages/
│  ├─ pyproject.toml
│  ├─ tradingagents/
│  └─ tests/
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ components/results/
│  │  ├─ domain/
│  │  ├─ hooks/
│  │  ├─ pages/
│  │  ├─ services/
│  │  ├─ utils/
│  │  └─ constants/
│  ├─ package.json
│  ├─ vite.config.js
│  └─ nginx.conf
├─ ai/
├─ Dockerfile.backend
├─ Dockerfile.frontend
├─ docker-compose.yml
└─ README.md
```

---

## Analysis Pipeline

The main pipeline runs through an async job flow.

```text
POST /api/analysis/jobs
  │
  ├─ prepare_context
  ├─ collect_market_data
  │  ├─ price data
  │  ├─ quote validation
  │  ├─ company profile
  │  ├─ fundamentals
  │  ├─ financial statements
  │  ├─ normalized period rows
  │  ├─ derived fundamentals
  │  ├─ insider data
  │  ├─ recommendation trends
  │  ├─ news sentiment
  │  ├─ social sentiment
  │  ├─ event risk
  │  ├─ global news
  │  └─ data quality + field sources
  ├─ run_agents
  │  ├─ Market Analyst
  │  ├─ News/Social Analyst
  │  ├─ Fundamentals Analyst
  │  ├─ Bull Researcher
  │  ├─ Bear Researcher
  │  ├─ Research Manager
  │  ├─ Trader
  │  ├─ Risk Committee
  │  └─ Portfolio Manager
  ├─ aggregate_decision
  ├─ persist_metrics
  └─ build_response
```

### Analysis Modes

| Mode | Purpose | Behavior |
|---|---|---|
| `fast` | Faster execution with fewer LLM calls | Separate bull/bear debate is skipped, and some arguments use local fallback logic. |
| `balanced` | Default mode | 9-call pipeline with analyst, research, trader, risk, and portfolio synthesis stages. |
| `deep` | More detailed analysis | More retry/debate/risk rounds and longer process tolerance. |

---

## AI Agent Input

The AI Agent form sends a payload to the backend with these main fields.

```json
{
  "ticker": "BBCA.JK",
  "market": "ID",
  "trade_date": "2026-06-17",
  "time_horizon_months": 1,
  "max_debate_rounds": 3,
  "analysis_depth": "balanced",
  "response_detail": "full",
  "has_existing_position": false,
  "position_quantity": null,
  "average_entry_price": null
}
```

Backend validation:

| Field | Rule |
|---|---|
| `ticker` / `symbol` | 1-64 characters, normalized to a canonical yfinance symbol when available. |
| Canonical symbol | Basic format supports uppercase letters, numbers, `.`, `-`, and yfinance suffixes. |
| `market` | `IDX`, `ID`, `US`, `GLOBAL`, `CRYPTO`, `ETF`, `FUND`, `UNKNOWN`. |
| `trade_date` | Backend format is `YYYY-MM-DD`; it cannot be more than 1 day in the future. |
| UI trade date | Displayed as `DD-MM-YYYY`, then converted for backend submission. |
| `time_horizon_months` | `1`, `2`, or `3`. |
| `max_debate_rounds` | 1 to 5. |
| `analysis_depth` | `fast`, `balanced`, `deep`. |
| `response_detail` | `summary`, `full`, `debug`. |
| `position_quantity` | Non-negative number or `null`. |
| `average_entry_price` | Non-negative number or `null`. |

The backend no longer automatically appends the `.JK` suffix. The frontend search should send canonical symbols such as `BBCA.JK` for IDX tickers.

---

## Frontend Routes

| Route | Page |
|---|---|
| `/` | Redirects to `/home` |
| `/home` | Main dashboard |
| `/ai-agent` | AI Agent live analysis |
| `/ai-agent/:resourceId` | AI Agent with resource/result id |
| `/research` | Research placeholder, `Coming Soon` |
| `/news` | News dashboard |
| `/market` | Market dashboard |
| `/econ` | Economic placeholder, `Coming Soon` |
| `/economic` | Redirects to `/econ` |

---

## Backend Environment

Create the file from the example:

```bash
cp backend/.env.example backend/.env
```

Minimal LLM config:

```env
APP_ENV=development
LLM_PROVIDER=deepseek
QUICK_THINK_LLM=deepseek-chat
DEEP_THINK_LLM=deepseek-chat
LLM_API_KEY=your_key_here
```

Other providers still use `LLM_API_KEY` in the current backend logic.

```env
LLM_PROVIDER=openai
QUICK_THINK_LLM=gpt-4o-mini
DEEP_THINK_LLM=gpt-4o
LLM_API_KEY=your_openai_key
```

```env
LLM_PROVIDER=google
QUICK_THINK_LLM=gemini-2.5-flash
DEEP_THINK_LLM=gemini-2.5-pro
LLM_API_KEY=your_google_key
```

```env
LLM_PROVIDER=anthropic
QUICK_THINK_LLM=claude-haiku-4-5
DEEP_THINK_LLM=claude-sonnet-4-5
LLM_API_KEY=your_anthropic_key
```

The current startup validation expects `LLM_API_KEY` to be non-empty.

### Important Backend Env Variables

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development`, `test`, or `production`. |
| `API_KEY` | Service credential for production/proxy use. |
| `OWNER_SESSION_SECRET` | Secret for owner session cookie signing. Must be explicit in production. |
| `OWNER_SESSION_TTL_SECONDS` | Owner session TTL. |
| `CORS_ORIGINS` | Allowed frontend origins. Do not use `*`. |
| `REQUEST_BODY_MAX_BYTES` | Request body size limit. Default 16 MB. |
| `LLM_PROVIDER` | LLM provider. |
| `QUICK_THINK_LLM` | Fast model. |
| `DEEP_THINK_LLM` | Reasoning/synthesis model. |
| `LLM_API_KEY` | Main LLM API key. |
| `LLM_BASE_URL` | Custom base URL for compatible providers. |
| `ALPHA_VANTAGE_API_KEY` | Optional market/fundamental fallback. |
| `FINNHUB_API_KEY` | Optional market/news/fundamental enrichment. |
| `SEC_USER_AGENT` | User agent for SEC companyfacts. |
| `GOOGLE_NEWS_LIGHT_API_KEY` | Optional news provider. |
| `MARKETAUX_API_KEY` | Optional news provider. |
| `NEWSDATA_API_KEY` | Optional news provider. |
| `NEWS_RSS_ENABLED_FEED_IDS` | Filter for enabled RSS feeds. |
| `XDG_CACHE_HOME` | Runtime cache root. |
| `YFINANCE_CACHE_DIR` | yfinance cache. |
| `ANALYSIS_JOB_STORE_BACKEND` | Job store backend. Compose default: `sqlite`. |
| `ANALYSIS_STORAGE_BACKEND` | Analysis history backend. Compose default: `sqlite`. |
| `RATE_LIMIT_STORAGE_BACKEND` | `memory` or `sqlite`. |
| `DATA_CACHE_BACKEND` | Market data cache. Compose default: `sqlite`. |

---

## Frontend Environment

The frontend does not require a dedicated `.env` file for default Docker/dev mode.

Variables read by the frontend:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Browser API base path. |
| `VITE_API_URL` | empty | Legacy/compatibility API URL override. |
| `VITE_DEV_HOST` | `127.0.0.1` | Vite dev server host. |
| `VITE_DEV_PORT` | `3000` | Vite dev server port. |
| `VITE_BACKEND_PROXY_TARGET` | `http://backend:8000` | Proxy target for `/api` during dev. |

For local non-Docker development, set the proxy target to the local backend:

```env
VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:8000
```

The navbar clock reads the browser device timezone through `Intl.DateTimeFormat`, not from an env variable.

---

## Run with Docker

Create `backend/.env` first.

```bash
cp backend/.env.example backend/.env
```

Start the development stack:

```bash
docker compose up --build
```

URLs:

```text
Frontend: http://localhost:3000
Backend : http://localhost:8000
Health  : http://localhost:8000/health
```

The development compose stack uses:

- FastAPI backend with reload.
- Vite frontend dev server on port 3000.
- SQLite cache volume `tradingagent-cache`.
- Result volume `tradingagent-results`.
- Frontend `node_modules` volume.

---

## Run Locally Without Docker

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:8000 npm run dev
```

Windows PowerShell:

```powershell
cd frontend
npm install
$env:VITE_BACKEND_PROXY_TARGET="http://127.0.0.1:8000"
npm run dev
```

---

## Frontend Scripts

```bash
npm run dev
npm run dev:lan
npm run build
npm run preview
npm run preview:lan
npm run test
npm run lint
npm run format:check
npm run quality
```

`npm run quality` runs format check, lint, and tests.

---

## Backend Scripts

From the `backend` folder:

```bash
python -m pytest tests -q
ruff format --check .
ruff check .
```

PowerShell quality script:

```powershell
.\scripts\quality.ps1
```

The script runs:

- Ruff format check.
- Ruff lint.
- Backend pytest.
- Core package pytest.

---

## Data Vendor Routing

Default vendor order from backend config:

| Data Type | Vendor Order |
|---|---|
| Core stock APIs | `yfinance`, `finnhub`, `alpha_vantage` |
| Technical indicators | `yfinance`, `finnhub`, `alpha_vantage` |
| Fundamental data | `yfinance`, `finnhub`, `alpha_vantage` |
| News data | `google_news_light`, `marketaux`, `newsdata`, `yfinance`, `finnhub`, `alpha_vantage` |
| Quote data | `yfinance`, `finnhub`, `alpha_vantage` |
| Financial statements | `yfinance`, `sec_companyfacts`, `alpha_vantage`, `finnhub` |
| Global news | `finnhub`, `alpha_vantage`, `yfinance` |
| Sentiment data | `finnhub`, `alpha_vantage` |
| Social sentiment | `finnhub` |
| Event data | `finnhub` |
| Analyst rating | `finnhub` |
| Insider data | `finnhub`, `alpha_vantage`, `yfinance` |
| Forex data | `finnhub`, `alpha_vantage` |
| Crypto data | `finnhub`, `alpha_vantage` |

Important config:

```env
ENABLE_MULTI_SOURCE_NEWS=true
ENABLE_MULTI_SOURCE_PRICE=false
ENABLE_FINNHUB_FALLBACK=true
ENABLE_FINNHUB_ENRICHMENT=true
REQUIRE_SOURCE_METADATA=true
RETURN_PARTIAL_ON_FAILURE=true
DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE=0.35
```

If a vendor fails, the pipeline tries fallback providers and can still return a partial result when minimum data is available.

---

## Report Export

HTML/PDF reports use:

- Jinja2 template.
- CSS at `backend/static/reports/analysis_report.css`.
- WeasyPrint for PDF rendering.
- Stored job/report result.
- Server-side disclaimer.

Main export endpoints:

```http
GET /api/analysis/jobs/{job_id}/report.html
GET /api/analysis/jobs/{job_id}/report.pdf
```

Current limitations:

- Export only supports `US` and `ID` markets.
- Default PDF render timeout is 30 seconds.
- Default PDF concurrency is 2.
- Export by job id fails if the job has expired or is missing from storage.

---

## Development Checklist

Before creating a PR or patch:

```bash
cd frontend
npm run quality
```

```bash
cd backend
python -m pytest tests -q
ruff format --check .
ruff check .
```

For backend PowerShell:

```powershell
cd backend
.\scripts\quality.ps1
```

---

## Disclaimer

TradingAgent generates automated analysis from vendor data, AI models, and pipeline rules. Data can be delayed, incomplete, incorrectly parsed, or unavailable from vendors. Investment decisions remain the user's responsibility.

Use the output as research material, not as buy/sell instructions.
