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

## Analysis Result Examples

The `assets/` folder includes example result screens for each final decision type: **Buy**, **Sell**, and **Hold**.

### Buy

![TradingAgent Buy Result](assets/Result%20Analyst%20Buy.png)

### Sell

![TradingAgent Sell Result](assets/Result%20Analyst%20Sell.png)

### Hold

![TradingAgent Hold Result](assets/Result%20Analyst%20Hold.png)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ React/Vite Frontend                                             │
│ Port: 3000                                                      │
│ Routes: /home, /analysis, /analysis.test, redirects             │
│ Components: StockForm, AgentLog, ResultCard, mock UI            │
└────────────────────────┬────────────────────────────────────────┘
                         │ POST /api/analysis/jobs (create job)
                         │ GET /api/analysis/jobs/{job_id}/events (SSE)
                         │ DELETE /api/analysis/jobs/{job_id} (cancel)
┌────────────────────────▼────────────────────────────────────────┐
│ FastAPI Backend                                                 │
│ Port: 8000                                                      │
│ Validation, request IDs, sanitized errors, rate limiting        │
│ Job API runs analysis asynchronously and streams job events     │
│ Legacy REST/SSE endpoints remain available for API clients      │
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
├── README.md
├── CHANGELOG.md
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── assets/
│
├── backend/
│   ├── .env.example
│   ├── config.py                  # Backend config, provider settings, model catalog, CORS, tunables
│   ├── errors.py                  # Sanitized API errors
│   ├── logging_config.py          # Request ID middleware and logging
│   ├── main.py                    # FastAPI app setup and startup validation
│   ├── rate_limiter.py            # API-key-aware in-memory rate limiter
│   ├── requirements.txt           # FastAPI wrapper dependencies
│   ├── routes/
│   │   ├── analysis.py            # Job, REST, and SSE analysis endpoints
│   │   └── validation.py          # Request validation and normalization
│   ├── tests/                     # FastAPI wrapper tests
│   └── tradingagents-core/
│       ├── pyproject.toml         # TradingAgents package dependencies
│       ├── tradingagents/
│       │   ├── agents/            # Agent prompts, schemas, managers, analysts, researchers, trader
│       │   ├── dataflows/         # yfinance and Alpha Vantage-related data modules
│       │   ├── graph/             # Classic graph orchestration
│       │   ├── llm_clients/       # Google, OpenAI, Anthropic, DeepSeek, Ollama, etc.
│       │   ├── default_config.py  # Core defaults
│       │   └── pipeline_balanced.py
│       └── tests/
│
└── frontend/
    ├── .env.example              # Copy to .env and fill your values
    ├── .env                      # Your actual frontend env — not committed
    ├── index.html
    ├── nginx.conf                 # Docker nginx proxy for /api
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx                # Frontend routes
        ├── main.jsx
        ├── mockData.js            # Sample responses for UI testing
        ├── components/
        │   ├── AnalysisWorkspace.jsx # Shared analysis layout and history sidebar
        │   ├── AgentLog.jsx       # Live progress via SSE events
        │   ├── Navbar.jsx
        │   ├── ResultCard.jsx     # Structured result display
        │   ├── StockForm.jsx      # Real analysis form (job API + SSE events)
        │   └── StockFormMock.jsx  # Mock form (no API call, for UI testing)
        └── pages/
            ├── Analysis.jsx       # Main analysis page + history sidebar
            ├── AnalysisMock.jsx   # UI testing page at /analysis.test
            ├── Dashboard.jsx      # Landing page
            └── NotFound.jsx       # 404 fallback
```

---

## Requirements

- Python 3.10+
- Node.js 18+
- An API key for at least one supported LLM provider (see below)

---

## Supported LLM Providers

Set `LLM_PROVIDER` in `backend/.env`.

| Provider | `LLM_PROVIDER` | Required key |
|---|---|---|
| Google Gemini | `google` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |
| Ollama | `ollama` | None. Set `OLLAMA_BASE_URL` |

Recommended default:

```env
LLM_PROVIDER=<provider>
DEEP_THINK_LLM=<provider-model-id>
QUICK_THINK_LLM=<provider-model-id>
<PROVIDER_API_KEY>=your_key_here
```

`DEEP_THINK_LLM` is used by heavier stages (Research Manager, Portfolio Manager). `QUICK_THINK_LLM` is used by analyst and debate stages.

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

Activate:

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

Configure:

```bash
cp .env.example .env   # Windows: Copy-Item .env.example .env
```

Edit `backend/.env` and set your provider, model names, and API key. Then start:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # Windows: Copy-Item .env.example .env
```

Set in `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
VITE_ENABLE_MOCK=false
```

Start:

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## Setup With Docker

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set your provider and API key
docker compose up --build
```

Frontend: `http://localhost:3000` — Backend: `http://localhost:8000`

Inside Docker, nginx proxies `/api/*` to the backend. You do not need to set `VITE_API_URL`.
If backend API-key enforcement is enabled, set `BACKEND_API_KEY` in your shell to the same value as backend `API_KEY`; nginx injects it server-side and the key is never bundled into browser JavaScript.

Optional Ollama:

```bash
docker compose --profile ollama up --build
docker exec -it tradingagent-ollama ollama pull <local-model-id>
```

---

## Frontend Routes

| Route | Purpose |
|---|---|
| `/` | Redirects to `/home` |
| `/home` | Landing page |
| `/analysis` | Main analysis page |
| `/analysis-live` | Redirects to `/analysis` |
| `/analysis.test` | Mock UI (no backend required) |
| `/analysis-mock` | Redirects to `/analysis.test` when mock routes are enabled |

The mock routes are always available in local dev. In production builds, they require `VITE_ENABLE_MOCK=true` at build time.

---

## API Reference

The React analysis page uses the job API below. The dashboard also calls `/api/status` and `/api/market/quotes`. `/api/analyze` and `/api/analyze/stream` remain available as compatibility endpoints for direct API clients.

### GET `/api/status`

Returns backend status metadata used by the dashboard.

### GET `/api/market/quotes`

Returns lightweight ticker-tape quotes for the dashboard.

Query parameter:

| Field | Rule |
|---|---|
| `symbols` | Optional comma-separated ticker symbols, capped at 20 symbols |

### POST `/api/analysis/jobs`

Creates an analysis job. Returns a `job_id`.

```json
{
  "ticker": "BBCA.JK",
  "trade_date": "2026-05-18",
  "max_debate_rounds": 3,
  "analysis_depth": "balanced",
  "response_detail": "full"
}
```

### GET `/api/analysis/jobs/{job_id}/events`

Streams Server-Sent Events for job progress.

| Event | Description |
|---|---|
| `progress` | Agent started or completed |
| `result` | Final structured decision |
| `error` | Sanitized error payload |

### GET `/api/analysis/jobs/{job_id}`

Returns the current job status, original payload, timestamps, and result or error if the job has finished.

### DELETE `/api/analysis/jobs/{job_id}`

Cancels a running job.

### Input rules

| Field | Rule |
|---|---|
| `ticker` | Yahoo Finance-compatible symbol, 1-10 characters. Use exchange suffixes when needed, e.g. `BBCA.JK`; common IDX tickers such as `BBCA` are auto-normalized to `.JK`. |
| `trade_date` | `YYYY-MM-DD` |
| `max_debate_rounds` | Integer 1 to 5 |
| `analysis_depth` | `fast`, `balanced`, or `deep` |
| `response_detail` | `summary`, `full`, or `debug` |

### Result shape (key fields)

```json
{
  "request_id": "...",
  "ticker": "BBCA.JK",
  "trade_date": "2026-05-18",
  "analysis_depth": "balanced",
  "response_detail": "full",
  "decision": "Buy",
  "full_decision": "...",
  "executive_summary": "...",
  "investment_thesis": "...",
  "price_target": 9800,
  "time_horizon": "3-6 months",
  "confidence_score": 0.82,
  "suggested_allocation_percent": 5,
  "entry_price": 9000,
  "stop_loss": 8400,
  "take_profit": 9800,
  "risk_reward_ratio": 2.3,
  "max_drawdown_estimate": "8-12%",
  "volatility_level": "Medium",
  "position_sizing_reason": "...",
  "rebalancing_action": "Add gradually",
  "key_catalysts": [],
  "invalidation_conditions": [],
  "data_fetched_at": "2026-05-18T10:30:00",
  "llm_call_budget": 9,
  "llm_calls_used": 9,
  "budget_exhausted": false,
  "agents_skipped": [],
  "data_quality": {
    "price_data": "ok",
    "fundamentals": "partial",
    "news": "ok",
    "warnings": []
  }
}
```

### Error codes

| Code | HTTP / Context | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | Invalid ticker, date, or parameters |
| `REQUEST_BODY_TOO_LARGE` | 413 | Request body exceeds the configured backend limit |
| `VALIDATION_ERROR` | 422 | Invalid request payload shape |
| `RATE_LIMITED` | 429 | Too many requests |
| `PIPELINE_TIMEOUT` | 504 | Analysis exceeded timeout |
| `PIPELINE_FAILED` | 500 | Internal error — check logs with `request_id` |
| `HTTP_ERROR` | Varies | FastAPI/Starlette HTTP exception surfaced through the API error envelope |
| `ANALYSIS_CANCELLED` | Job/SSE event | Analysis was cancelled by the client |

---

## Environment Variables

This section mirrors the variables currently present in `backend/.env.example` and `frontend/.env.example`.
The local `.env` files should use the same keys, with secret values filled in privately.

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | Yes | Provider name: `google`, `openai`, `anthropic`, `deepseek`, `openrouter`, or `ollama` |
| `DEEP_THINK_LLM` | Yes | Model used by heavier reasoning stages such as Research Manager and Portfolio Manager |
| `QUICK_THINK_LLM` | Yes | Model used by the faster analyst and debate stages |
| `GOOGLE_API_KEY` | Google only | Gemini API key. Either this or `GEMINI_API_KEY` is accepted |
| `GEMINI_API_KEY` | Google only | Alternate Gemini API key variable. Either this or `GOOGLE_API_KEY` is accepted |
| `OPENAI_API_KEY` | OpenAI only | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic only | Anthropic API key |
| `DEEPSEEK_API_KEY` | DeepSeek only | DeepSeek API key |
| `OPENROUTER_API_KEY` | OpenRouter only | OpenRouter API key |
| `ALPHA_VANTAGE_API_KEY` | No | Optional Alpha Vantage key for market, news, and fundamental-data enrichment or fallback |
| `DATA_VENDOR_CORE_STOCK_APIS` | No | Comma-separated vendor order for core stock data. Default: `yfinance,alpha_vantage` |
| `DATA_VENDOR_TECHNICAL_INDICATORS` | No | Comma-separated vendor order for technical indicators. Default: `yfinance,alpha_vantage` |
| `DATA_VENDOR_FUNDAMENTAL_DATA` | No | Comma-separated vendor order for fundamentals. Default: `yfinance,alpha_vantage` |
| `DATA_VENDOR_NEWS_DATA` | No | Comma-separated vendor order for news data. Default: `yfinance,alpha_vantage` |
| `OLLAMA_BASE_URL` | Ollama only | Local or Docker Ollama URL. Default: `http://localhost:11434` |
| `API_KEY` | Required when API-key rate limiting is enabled | Shared backend API key accepted from `x-api-key` or `Authorization: Bearer ...` |
| `REQUIRE_API_KEY_FOR_RATE_LIMIT` | No | Set to `true` to require `API_KEY` for rate-limited backend access. `backend/.env.example` sets `false`; when unset, production defaults to `true` |

### `frontend/.env`

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | Empty | Backend URL. Empty uses relative `/api/*` (Docker). Set to `http://localhost:8000` for local dev. |
| `VITE_CLOCK_TIME_ZONE` | `Asia/Jakarta` | IANA timezone used by the navbar clock |
| `VITE_CLOCK_LABEL` | `WIB` | Label shown next to the navbar clock |
| `VITE_ENABLE_MOCK` | `false` | Exposes `/analysis.test` in production builds |

Frontend code intentionally does not read or send any API key from Vite environment variables. For shared deployments, inject backend `x-api-key` at a private reverse proxy such as the included nginx container via `BACKEND_API_KEY`.

---

## Testing

### Backend

```bash
cd backend
pip install -r requirements-dev.txt
python -m ruff format --check .
python -m ruff check .
python -m pytest tests -q
```

On Windows PowerShell, the backend quality gate can also be run with:

```powershell
cd backend
.\scripts\quality.ps1
```

On Linux/macOS:

```bash
cd backend
./scripts/quality.sh
```

Backend coverage includes ticker validation, date validation, debate round limits, job ownership, request body limits, rate limiting (HTTP 429), SSE progress/replay events, config isolation, AgentLog de-duplication, and result schema shape.

### Frontend

```bash
cd frontend
npm install
npm run quality
```

The frontend quality gate runs ESLint, Prettier format check, and Vitest once. To run them separately:

```bash
cd frontend
npm run lint
npm run format:check
npm test -- --run
```

Frontend coverage includes stream cleanup and UI utility behavior.

---

## Credits

- Trading engine: [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
- Backend: [FastAPI](https://fastapi.tiangolo.com/) + [sse-starlette](https://github.com/sysid/sse-starlette)
- Frontend: [React](https://react.dev/) + [Vite](https://vite.dev/)
- Market data: [yfinance](https://github.com/ranaroussi/yfinance)
- Pipeline: [LangGraph](https://github.com/langchain-ai/langgraph)

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
