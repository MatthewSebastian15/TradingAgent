# TradingAgent

A full-stack web application that wraps the [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents/tree/main) engine with a FastAPI backend and a React frontend. Enter a ticker and a date, nine specialized AI agents collaborate and debate, then deliver a structured trade decision: **Buy / Hold / Sell** with an executive summary, investment thesis, price target, and time horizon.

![TradingAgent Dashboard](assets/TradingAgent%20Home%20UI.png)

---

## How It Works

The app runs a data collection step and then a balanced 9-agent LLM pipeline.

1. Data Collection fetches yfinance-backed price data, technical indicators, fundamentals, financial statements, company news, macro news, and insider transactions.
2. Market Analyst reviews price action and technical setup.
3. News + Social Analyst reviews company news, macro news, sentiment, and insider activity.
4. Fundamentals Analyst reviews financial statements and ratios.
5. Bull Researcher builds the upside case.
6. Bear Researcher builds the downside case.
7. Research Manager weighs the debate and creates an investment plan.
8. Trader converts the plan into actionable trade guidance.
9. Risk Analysts review downside, volatility, sizing, and invalidation triggers.
10. Portfolio Manager produces the final structured decision.

The first three analyst LLM calls run in parallel after data collection. Later decision stages run sequentially so each stage can use the output from the prior stage.

![Investment Analysis Flow](assets/Investment%20Analysis%20Flow.png)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ React/Vite Frontend                                             │
│ Port: 3000                                                      │
│ Routes: /home, /analysis, /analysis.test                        │
│ Components: StockForm, AgentLog, ResultCard, mock UI            │
└────────────────────────┬────────────────────────────────────────┘
                         │ POST /api/analyze/stream (SSE)
                         │ POST /api/analyze (JSON)
┌────────────────────────▼────────────────────────────────────────┐
│ FastAPI Backend                                                 │
│ Port: 8000                                                      │
│ Validation, request IDs, sanitized errors, rate limiting        │
│ REST uses ProcessPoolExecutor                                   │
│ SSE uses real progress callbacks from the balanced pipeline     │
└────────────────────────┬────────────────────────────────────────┘
                         │  Python subprocess
┌────────────────────────▼────────────────────────────────────────┐
│ TradingAgents Core                                              │
│ yfinance data collection                                        │
│ Multi-provider LLM clients                                      │
│ Balanced pipeline with structured Pydantic outputs              │
│ Final PortfolioDecision response                                │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
TradingAgent/
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
│
├── backend/
│   ├── .env.example              # Copy to .env and fill your keys
│   ├── .env                      # Your actual keys — not committed
│   ├── main.py                   # FastAPI app, CORS, middleware, startup validation
│   ├── config.py                 # Centralized settings and startup config validation
│   ├── errors.py                 # Consistent API exceptions and sanitized error responses
│   ├── logging_config.py         # Request-scoped logging and RequestIdMiddleware
│   ├── rate_limiter.py           # API-key aware in-memory rate limiting
│   ├── requirements.txt          # FastAPI, uvicorn, sse-starlette, python-dotenv
│   └── routes/
│       ├── analysis.py           # SSE + REST endpoints, pipeline runner
│       └── validation.py         # Input validation helpers
│
├── backend/tradingagents-core/   # TradingAgents engine (TauricResearch)
│   ├── tradingagents/
│   │   ├── agents/               # 9 agent implementations + schemas
│   │   ├── graph/                # LangGraph orchestration
│   │   ├── llm_clients/          # Provider adapters (google, openai, anthropic, etc.)
│   │   ├── dataflows/            # yfinance, Alpha Vantage data connectors
│   │   ├── default_config.py     # Engine defaults (overridden by backend .env)
│   │   └── pipeline_balanced.py  # Fixed 9-call balanced pipeline
│   └── pyproject.toml
│
└── frontend/
    ├── .env.example              # Copy to .env and fill your values
    ├── .env                      # Your actual frontend env — not committed
    ├── vite.config.js
    ├── nginx.conf                # Used inside Docker
    └── src/
        ├── components/
        │   ├── StockForm.jsx      # Real analysis form (calls backend SSE)
        │   ├── StockFormMock.jsx  # Mock form (no API call, for UI testing)
        │   ├── AgentLog.jsx       # Live progress via SSE events
        │   ├── ResultCard.jsx     # Structured result display
        │   └── Navbar.jsx
        ├── pages/
        │   ├── Dashboard.jsx      # Landing page
        │   ├── Analysis.jsx       # Main analysis page + history sidebar
        │   ├── AnalysisMock.jsx   # UI testing page at /analysis-mock
        │   └── NotFound.jsx       # 404 fallback
        └── mockData.js            # Sample responses for UI testing
```

---

## Requirements

Backend:

- Python 3.10+
- pip

Frontend:

- Node.js 18+
- npm

Recommended for Docker:

- Docker
- Docker Compose

---

## Supported LLM Providers

Set `LLM_PROVIDER` in `backend/.env`.

| Provider | `LLM_PROVIDER` | Required key or setting |
|---|---:|---|
| Google Gemini | `google` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` |
| xAI | `xai` | `XAI_API_KEY` |
| Qwen | `qwen` | `DASHSCOPE_API_KEY` or `QWEN_API_KEY` |
| GLM | `glm` | `ZHIPU_API_KEY` or `GLM_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |
| Azure OpenAI | `azure` | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT_NAME` |
| Ollama | `ollama` | No API key. Set `OLLAMA_BASE_URL` |

Default recommended local config:

```env
LLM_PROVIDER=google
DEEP_THINK_LLM=gemini-2.5-flash
QUICK_THINK_LLM=gemini-2.5-flash
GOOGLE_API_KEY=your_key_here
```

Notes:

- `DEEP_THINK_LLM` is used by heavier reasoning stages such as Research Manager and Portfolio Manager.
- `QUICK_THINK_LLM` is used by faster analyst and debate stages.
- `ollama`, `openrouter`, and `azure` accept custom model strings.
- Other providers warn when the model is outside the known catalog, but the code continues.

---

## Setup Without Docker

### 1. Clone the repository

```bash
git clone https://github.com/MatthewSebastian15/TradingAgent.git
cd TradingAgent
```

### 2. Configure the backend

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

Linux/macOS:

```bash
source venv/bin/activate
```

Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
pip install -e tradingagents-core/
```

Create the backend env file:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `backend/.env` and set your provider, model names, and API key.

Example for Google Gemini:

```env
LLM_PROVIDER=google
DEEP_THINK_LLM=gemini-2.5-flash
QUICK_THINK_LLM=gemini-2.5-flash
GOOGLE_API_KEY=your_key_here
API_KEY=
```

In the current code, `API_KEY` is not enforced as authentication. `x-api-key` is used by the rate limiter as a client identity when the frontend sends it.

Start the backend:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend URL:

```text
http://localhost:8000
```

### 3. Configure the frontend

Open a new terminal:

```bash
cd frontend
npm install
cp .env.example .env
```

Windows PowerShell:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
```

For local development without Docker, set this in `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
VITE_API_KEY=
VITE_ENABLE_MOCK=false
```

Start the frontend:

```bash
npm run dev
```

Frontend URL:

```text
http://localhost:3000
```

---

## Setup With Docker

Docker runs the backend, frontend, and optional Ollama service.

### 1. Create backend env

```bash
cp backend/.env.example backend/.env
```

Windows PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env` and set your provider and API key.

Example:

```env
LLM_PROVIDER=google
DEEP_THINK_LLM=gemini-2.5-flash
QUICK_THINK_LLM=gemini-2.5-flash
GOOGLE_API_KEY=your_key_here
API_KEY=
```

### 2. Start the stack

```bash
docker compose up --build
```

Service URLs:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:8000
```

Inside Docker, the frontend uses nginx to proxy `/api/*` to the backend container. You do not need to set `VITE_API_URL` for the Docker build.

### 3. Optional Ollama profile

Start with Ollama:

```bash
docker compose --profile ollama up --build
```

Pull a model:

```bash
docker exec -it tradingagent-ollama ollama pull qwen3:latest
```

Use this in `backend/.env`:

```env
LLM_PROVIDER=ollama
DEEP_THINK_LLM=qwen3:latest
QUICK_THINK_LLM=qwen3:latest
OLLAMA_BASE_URL=http://ollama:11434
```

Stop the stack:

```bash
docker compose down
```

---

## Frontend Routes

| Route | Purpose |
|---|---|
| `/` | Redirects to `/home` |
| `/home` | Landing/dashboard page |
| `/analysis` | Real backend-powered analysis page |
| `/analysis-live` | Redirects to `/analysis` |
| `/analysis.test` | Mock UI page using `frontend/src/mockData.js` |
| `/analysis-mock` | Redirects to `/analysis.test` when mock route is enabled |
| `*` | 404 page |

Mock route behavior:

- In Vite local dev, `/analysis.test` is always available.
- In production builds, `/analysis.test` is available only when `VITE_ENABLE_MOCK=true` at build time.
- `VITE_ENABLE_MOCK=true` does not convert `/analysis` into mock mode. It only exposes the mock route in production.

---

## Mock Mode

Mock mode lets you debug the UI without running the backend or spending LLM quota.

Open:

```text
http://localhost:3000/analysis.test
```

Mock source file:

```text
frontend/src/mockData.js
```

Available mock cases include:

| Ticker | Scenario |
|---|---|
| `NVDA` | Buy |
| `AAPL` | Hold |
| `TSLA` | Sell |
| `BBCA.JK` | IDX Buy |
| `BBRI.JK` | IDX Buy |
| `TLKM.JK` | IDX Hold |
| `BMRI.JK` | IDX Buy |
| `ASII.JK` | IDX Hold |
| `GOTO.JK` | IDX Sell |
| `ERROR` | Error state |

Mock mode uses the same `AnalysisMock`, `StockFormMock`, `AgentLog`, and `ResultCard` UI structure as the live page, but all data comes from `mockData.js`.

---

## API Reference

### POST `/api/analyze/stream`

Streams Server-Sent Events while the pipeline runs.

Request body:

```json
{
  "ticker": "BBCA.JK",
  "trade_date": "2026-05-18",
  "max_debate_rounds": 3
}
```

Events:

| Event | Description |
|---|---|
| `progress` | Agent started, completed, or failed |
| `result` | Final analysis result |
| `error` | Sanitized error payload |

Example progress payload:

```json
{
  "request_id": "abc123def456",
  "ticker": "BBCA.JK",
  "trade_date": "2026-05-18",
  "agent_id": "market_analyst",
  "agent_name": "Market Analyst",
  "status": "completed",
  "status_message": "Market Analyst completed.",
  "timestamp": "2026-05-18T08:00:00Z"
}
```

### POST `/api/analyze`

Runs the same analysis and returns JSON after completion.

Request body:

```json
{
  "ticker": "NVDA",
  "trade_date": "2026-05-18",
  "max_debate_rounds": 3
}
```

Example response shape:

```json
{
  "request_id": "abc123def456",
  "ticker": "NVDA",
  "trade_date": "2026-05-18",
  "agents_used": [
    "Market Analyst",
    "News + Social Analyst",
    "Fundamentals Analyst",
    "Bull Researcher",
    "Bear Researcher",
    "Research Manager",
    "Trader",
    "Risk Analysts",
    "Portfolio Manager"
  ],
  "decision": "Buy",
  "full_decision": "...",
  "executive_summary": "...",
  "investment_thesis": "...",
  "price_target": 1050,
  "time_horizon": "3-6 months",
  "confidence_score": 0.86,
  "suggested_allocation_percent": 6,
  "entry_price": 920,
  "stop_loss": 850,
  "take_profit": 1050,
  "risk_reward_ratio": 2.6,
  "max_drawdown_estimate": "8-12%",
  "volatility_level": "High",
  "position_sizing_reason": "...",
  "rebalancing_action": "Add gradually",
  "key_catalysts": [],
  "invalidation_conditions": [],
  "data_quality": {
    "price_data": "ok",
    "fundamentals": "partial",
    "news": "ok",
    "warnings": []
  }
}
```

### Error response shape

```json
{
  "request_id": "abc123def456",
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid analysis request.",
    "details": {
      "fields": {
        "trade_date": "Trade date must be a valid date in YYYY-MM-DD format."
      }
    }
  }
}
```

Common error codes:

| Code | HTTP status | Meaning |
|---|---:|---|
| `BAD_REQUEST` | 400 | Invalid ticker, date, or debate rounds |
| `RATE_LIMITED` | 429 | Too many requests or active analyses |
| `PIPELINE_TIMEOUT` | 504 | Analysis exceeded timeout |
| `PIPELINE_FAILED` | 500 | Pipeline failed. Check backend logs with `request_id` |
| `VALIDATION_ERROR` | 422 | Invalid JSON payload shape |

---

## Input Rules

| Field | Rule |
|---|---|
| `ticker` | Yahoo Finance-compatible symbol, normalized to uppercase |
| `trade_date` | Valid `YYYY-MM-DD` date |
| `max_debate_rounds` | Integer from 1 to 5 |

Ticker examples:

| Market | Example |
|---|---|
| US stocks | `NVDA`, `AAPL`, `TSLA`, `MSFT` |
| Indonesia IDX | `BBCA.JK`, `BBRI.JK`, `TLKM.JK`, `GOTO.JK` |
| Hong Kong | `0700.HK` |
| Tokyo | `7203.T` |
| Hyphenated tickers | `BRK-B` |

In the current balanced pipeline, `max_debate_rounds` is accepted and passed into config, but the balanced path keeps a fixed request budget. It does not expand into extra LLM debate loops per round.

---

## Environment Variables

### Backend: `backend/.env`

The backend `.env.example` contains provider and secret-related values.

| Variable | Required | Description |
|---|---:|---|
| `LLM_PROVIDER` | Yes | Provider name: `google`, `openai`, `anthropic`, `deepseek`, `xai`, `qwen`, `glm`, `openrouter`, `ollama`, or `azure` |
| `DEEP_THINK_LLM` | Yes | Model for heavier reasoning stages |
| `QUICK_THINK_LLM` | Yes | Model for faster stages |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | Google only | Gemini API key |
| `OPENAI_API_KEY` | OpenAI only | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic only | Anthropic API key |
| `DEEPSEEK_API_KEY` | DeepSeek only | DeepSeek API key |
| `XAI_API_KEY` | xAI only | xAI API key |
| `QWEN_API_KEY` / `DASHSCOPE_API_KEY` | Qwen only | Qwen/DashScope key |
| `GLM_API_KEY` / `ZHIPU_API_KEY` | GLM only | GLM/Zhipu key |
| `OPENROUTER_API_KEY` | OpenRouter only | OpenRouter key |
| `AZURE_OPENAI_API_KEY` | Azure only | Azure OpenAI key |
| `AZURE_OPENAI_ENDPOINT` | Azure only | Azure OpenAI endpoint |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Azure only | Azure deployment name |
| `OLLAMA_BASE_URL` | Ollama only | Local or Docker Ollama URL |
| `API_KEY` | Optional | Loaded into config, but current request handling does not enforce key matching. Rate limiting uses the incoming `x-api-key` or bearer token as client identity when present. |

Backend values currently defined in `backend/config.py` instead of `.env`:

| Setting | Current value |
|---|---:|
| `BACKEND_PORT` | `8000` |
| `FRONTEND_PORT` | `3000` |
| `CORS_ORIGINS` | `http://localhost:3000`, `http://localhost:5173` |
| `PIPELINE_TIMEOUT_SECONDS` | `600` |
| `PROCESS_POOL_WORKERS` | `min(4, os.cpu_count() or 2)` |
| `DEFAULT_MAX_DEBATE_ROUNDS` | `3` |
| `MAX_RISK_DISCUSS_ROUNDS` | `1` |
| `ANALYSIS_MODE` | `balanced` |
| `MAX_GEMINI_CALLS` | `9` |
| `REQUEST_RATE_LIMIT_PER_MINUTE` | `20` |
| `STREAM_RATE_LIMIT_PER_MINUTE` | `8` |
| `MAX_CONCURRENT_REQUESTS_PER_KEY` | `2` |
| `MAX_CONCURRENT_STREAMS_PER_KEY` | `1` |
| `LLM_TIMEOUT_SECONDS` | `60` |
| `LLM_MAX_RETRIES` | `1` |
| `CACHE_TTL_SECONDS` | `900` |
| `CACHE_MAX_ENTRIES` | `512` |

To change local frontend origins, edit `CORS_ORIGINS` in `backend/config.py`.

### Frontend: `frontend/.env`

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | Empty string | Backend base URL. Empty uses relative `/api/*`, useful in Docker nginx. Local dev should use `http://localhost:8000`. |
| `VITE_API_KEY` | Empty string | Sent as `x-api-key`. The backend currently uses this header for rate-limit identity, not strict authentication. |
| `VITE_ENABLE_MOCK` | `false` | Exposes `/analysis.test` in production builds when set to `true`. |

---

## Rate Limiting

Rate limiting is in memory and grouped by the incoming `x-api-key` or bearer token when available. The current code does not compare this header against `API_KEY`; it uses the header as a client identity for limiting. If no key is sent, the backend falls back to IP/user-agent-derived identity.

| Endpoint type | Limit per minute | Max concurrent |
|---|---:|---:|
| REST `/api/analyze` | 20 | 2 |
| SSE `/api/analyze/stream` | 8 | 1 |

When the limit is exceeded, the API returns `RATE_LIMITED` with HTTP 429 or an SSE `error` event.

---

## Data Quality

The backend adds a `data_quality` object to the API result:

```json
{
  "price_data": "ok",
  "fundamentals": "partial",
  "news": "missing",
  "warnings": [
    "Partial fundamentals from yfinance; missing: cashflow."
  ]
}
```

Possible `price_data` values:

- `ok`
- `partial`
- `missing`
- `invalid_ticker`
- `market_closed`

Possible `fundamentals` and `news` values:

- `ok`
- `partial`
- `missing`

The frontend renders these fields in the ResultCard so you can see whether the recommendation used complete data or a sad pile of partial market scraps.

---

## Frontend Behavior

### Real analysis page

Route:

```text
/analysis
```

Behavior:

- Sends `POST /api/analyze/stream`.
- Reads SSE events manually from `fetch()` response body.
- Updates the AgentLog with real backend progress events.
- Stores successful results in `localStorage` under `ta_analysis_history`.
- Keeps up to 10 recent results.
- Prunes entries older than 30 days.

### Mock analysis page

Route:

```text
/analysis.test
```

Behavior:

- Uses `frontend/src/mockData.js` only.
- Simulates pipeline progress with timers.
- Stores mock results under `ta_analysis_mock_history`.
- Includes a stop button for the mock pipeline.

### Result rendering

`ResultCard.jsx` displays:

- Decision badge: Buy, Hold, Sell, Overweight, or Underweight.
- Price target.
- Time horizon.
- Confidence.
- Suggested allocation.
- Entry price.
- Stop loss.
- Take profit.
- Risk/reward ratio.
- Max drawdown estimate.
- Volatility level.
- Rebalancing action.
- Data quality.
- Key catalysts.
- Invalidation conditions.
- Executive summary.
- Expandable investment thesis.
- Raw JSON debug panel.

---

## Backend Behavior

### Startup validation

On startup, the backend validates:

- `LLM_PROVIDER` is supported.
- Required API key exists for the selected provider.
- `DEEP_THINK_LLM` is set.
- `QUICK_THINK_LLM` is set.
- TradingAgents result and cache directories are writable.

If validation fails, the backend logs every issue and exits.

### Request IDs

Every request gets an `x-request-id` response header. Error payloads also include `request_id` so you can match frontend errors to backend logs.

### Sanitized errors

The backend removes common secrets and local file paths from user-facing error messages before returning them.

### Execution model

- REST endpoint runs the blocking pipeline in a `ProcessPoolExecutor`.
- SSE endpoint runs the balanced pipeline with progress callbacks so the frontend can show real agent events.
- The hard timeout is `600` seconds by default.

---

## Testing

Run FastAPI wrapper tests:

```bash
cd backend
python -m pytest tests -q
```

Current backend wrapper coverage includes:

- Valid `BBCA.JK` ticker.
- Valid normalized `BBCA` ticker.
- Invalid date rejection.
- `max_debate_rounds` above 5 rejection.
- DeepSeek provider validation when API key exists.
- REST analysis route response shape.
- SSE progress and final result events.
- Rate limit HTTP 429 behavior.

Run frontend build check:

```bash
cd frontend
npm run build
```

Run frontend tests when test files are present:

```bash
cd frontend
npm test
```

---

## Common Commands

Backend local run:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend local run:

```bash
cd frontend
npm run dev
```

Full Docker run:

```bash
docker compose up --build
```

Stop Docker stack:

```bash
docker compose down
```

Build frontend:

```bash
cd frontend
npm run build
```

Run backend tests:

```bash
cd backend
python -m pytest tests -q
```

---

## Troubleshooting

### CORS error in browser

Current allowed origins live in `backend/config.py`:

```python
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]
```

If your frontend runs on another host or port, add it there and restart the backend.

### Frontend cannot reach backend locally

Set this in `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

Then restart Vite.

### Docker frontend cannot reach backend

Leave `VITE_API_URL` empty for Docker. The nginx config proxies `/api/*` to `http://backend:8000/api/*`.

### Backend exits on startup

Check the startup logs. The most common causes are:

- Missing API key for selected `LLM_PROVIDER`.
- Empty `DEEP_THINK_LLM` or `QUICK_THINK_LLM`.
- Non-writable TradingAgents cache or logs directory.

### 429 rate limit

The backend allows one active SSE stream per API-key identity or fallback client identity. Wait for the current analysis to finish or use a different client key for separate rate-limit grouping.

### yfinance returns missing or partial data

Check the `data_quality` block in the UI or raw JSON. Common causes:

- Wrong ticker format.
- Market was closed on the selected trade date.
- Fundamentals are unavailable for that symbol.
- News coverage is empty or limited.

### Google Gemini quota error

The app will show the provider error as a sanitized pipeline error. Reduce runs, use a cheaper model, switch providers, or test UI with `/analysis.test` until quota resets. Machines also enjoy budgeting, sadly.

---

## Known Constraints

- The app is for analysis support and UI experimentation, not automated order execution.
- yfinance data can be delayed, incomplete, or unavailable for some tickers.
- Mock mode uses synthetic data and never calls the backend.
- The balanced pipeline keeps a fixed LLM request budget and does not perform unlimited debate loops.
- In-memory rate limiting resets when the backend process restarts.
- This repository currently stores analysis history in browser `localStorage`, not a shared database.

---

## Credits

- Trading engine foundation: [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
- Backend: [FastAPI](https://fastapi.tiangolo.com/)
- Streaming: [sse-starlette](https://github.com/sysid/sse-starlette)
- Frontend: [React](https://react.dev/) + [Vite](https://vite.dev/)
- Market data: [yfinance](https://github.com/ranaroussi/yfinance)
- Graph orchestration: [LangGraph](https://github.com/langchain-ai/langgraph)

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
