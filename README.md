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
                         │ POST /api/analysis/jobs (create job)
                         │ GET /api/analysis/jobs/{job_id}/events (SSE)
                         │ DELETE /api/analysis/jobs/{job_id} (cancel)
┌────────────────────────▼────────────────────────────────────────┐
│ FastAPI Backend                                                 │
│ Port: 8000                                                      │
│ Validation, request IDs, sanitized errors, rate limiting        │
│ Job API runs analysis asynchronously and streams job events      │
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
        │   ├── AgentLog.jsx       # Live progress via SSE events
        │   ├── Navbar.jsx
        │   ├── ResultCard.jsx     # Structured result display
        │   ├── StockForm.jsx      # Real analysis form (job API + SSE events)
        │   └── StockFormMock.jsx  # Mock form (no API call, for UI testing)
        └── pages/
            ├── Analysis.jsx       # Main analysis page + history sidebar
            ├── AnalysisMock.jsx   # UI testing page at /analysis-mock
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
| Google Gemini | `google` | `GOOGLE_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` |
| xAI | `xai` | `XAI_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |
| Azure OpenAI | `azure` | `AZURE_OPENAI_API_KEY` + endpoint + deployment |
| Ollama | `ollama` | None. Set `OLLAMA_BASE_URL` |

Recommended default:

```env
LLM_PROVIDER=google
DEEP_THINK_LLM=gemini-2.5-flash
QUICK_THINK_LLM=gemini-2.5-flash
GOOGLE_API_KEY=your_key_here
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
VITE_API_KEY=
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

Optional Ollama:

```bash
docker compose --profile ollama up --build
docker exec -it tradingagent-ollama ollama pull qwen3:latest
```

---

## Frontend Routes

| Route | Purpose |
|---|---|
| `/home` | Landing page |
| `/analysis` | Main analysis page |
| `/analysis.test` | Mock UI (no backend required) |

The mock route is always available in local dev. In production builds, it requires `VITE_ENABLE_MOCK=true` at build time.

---

## API Reference

The React UI uses the job API below. `/api/analyze` and `/api/analyze/stream` remain available as compatibility endpoints for direct API clients.

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

Returns the current job status, events seen so far, and result or error if the job has finished.

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
  "ticker": "BBCA.JK",
  "decision": "Buy",
  "executive_summary": "...",
  "investment_thesis": "...",
  "price_target": 9800,
  "time_horizon": "3-6 months",
  "confidence_score": 0.82,
  "entry_price": 9000,
  "stop_loss": 8400,
  "take_profit": 9800,
  "risk_reward_ratio": 2.3,
  "suggested_allocation_percent": 5,
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

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | Invalid ticker, date, or parameters |
| `RATE_LIMITED` | 429 | Too many requests |
| `PIPELINE_TIMEOUT` | 504 | Analysis exceeded timeout |
| `PIPELINE_FAILED` | 500 | Internal error — check logs with `request_id` |

---

## Environment Variables

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | Yes | Provider name |
| `DEEP_THINK_LLM` | Yes | Model for heavier reasoning stages |
| `QUICK_THINK_LLM` | Yes | Model for faster stages |
| `GOOGLE_API_KEY` | Google only | Gemini API key |
| `OPENAI_API_KEY` | OpenAI only | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic only | Anthropic API key |
| `DEEPSEEK_API_KEY` | DeepSeek only | DeepSeek API key |
| `OLLAMA_BASE_URL` | Ollama only | Local or Docker Ollama URL |
| `API_KEY` | Optional locally; required when `REQUIRE_API_KEY_FOR_RATE_LIMIT=true` | Shared API key accepted from `x-api-key` or `Authorization: Bearer ...` |
| `APP_ENV` | No | Defaults to `production`; set `development` or `test` explicitly for local relaxed defaults |
| `REQUEST_BODY_MAX_BYTES` | No | Maximum request body accepted by FastAPI; default `65536` |
| `ANALYSIS_JOB_MAX_ACTIVE` | No | Maximum queued/running analysis jobs kept in memory; default `32` |

### `frontend/.env`

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | Empty | Backend URL. Empty uses relative `/api/*` (Docker). Set to `http://localhost:8000` for local dev. |
| `VITE_API_KEY` | Empty | Browser-visible key. Only sent when `VITE_ENABLE_BROWSER_API_KEY=true`; prefer a private proxy for shared deployments. |
| `VITE_ENABLE_BROWSER_API_KEY` | `false` | Explicit opt-in to send `VITE_API_KEY` from the browser |
| `VITE_ENABLE_MOCK` | `false` | Exposes `/analysis.test` in production builds |

---

## Testing

```bash
cd backend
python -m pytest tests -q
```

Coverage includes ticker validation, date validation, debate round limits, rate limiting (HTTP 429), SSE progress events, and result schema shape.

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
