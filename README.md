# TradingAgent

A full-stack web application that wraps the [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents/tree/main) engine with a FastAPI backend and a React frontend. Enter a ticker and a date, nine specialized AI agents collaborate and debate, then deliver a structured trade decision: **Buy / Hold / Sell** with an executive summary, investment thesis, price target, and time horizon.

![TradingAgent Dashboard](assets/TradingAgent%20Home%20UI.png)

---

## How It Works

The system takes your stock input through six stages: market reading, news evaluation, fundamental checks, opportunity and risk comparison, and a final investment decision.

![Investment Analysis Flow](assets/Investment%20Analysis%20Flow.png)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  React Frontend  (port 3000 / 5173)                             │
│  StockForm → SSE stream → AgentLog (live) → ResultCard          │
│  Analysis history: localStorage, max 10 entries                 │
└────────────────────────┬────────────────────────────────────────┘
                         │  POST /api/analyze/stream  (SSE)
┌────────────────────────▼────────────────────────────────────────┐
│  FastAPI Backend  (port 8000)                                   │
│  Rate limit: 2 concurrent pipelines per IP                      │
│  Process pool: up to 4 workers (one per CPU core)               │
│  Timeout: 600 seconds per pipeline run                          │
└────────────────────────┬────────────────────────────────────────┘
                         │  Python subprocess
┌────────────────────────▼────────────────────────────────────────┐
│  TradingAgents Engine  (tradingagents-core)                     │
│                                                                 │
│  Market Analyst → News Researcher → Fundamentals Analyst        │
│       ↓                                                         │
│  Bull Researcher ⟷ Bear Researcher                             │
│       ↓                                                         │
│  Research Manager                                               │
│       ↓                                                         │
│  Trader → Risk Analysts (aggressive / conservative / neutral)   │
│       ↓                                                         │
│  Portfolio Manager → PortfolioDecision (structured output)      │
└─────────────────────────────────────────────────────────────────┘
```

The diagram below shows the full technical flow from user input to result displayed in the app.

![Technical Flow](assets/Technical%20Flow.png)

---

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

**Backend**

- Python 3.10+
- pip

**Frontend**

- Node.js 18+
- npm

**LLM API Key (choose one provider)**

| Provider | Variable | Notes |
|---|---|---|
| Google Gemini | `GOOGLE_API_KEY` or `GEMINI_API_KEY` | Recommended |
| OpenAI | `OPENAI_API_KEY` | GPT-4.1 or higher |
| Anthropic | `ANTHROPIC_API_KEY` | Claude Sonnet 4 or higher |
| DeepSeek | `DEEPSEEK_API_KEY` | |
| xAI Grok | `XAI_API_KEY` | |
| Qwen | `QWEN_API_KEY` | |
| GLM | `GLM_API_KEY` | |
| OpenRouter | `OPENROUTER_API_KEY` | |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` | |
| Ollama (local) | No key needed | Set `OLLAMA_BASE_URL` |

Recommended model: **Gemini 2.5 Flash** (`gemini-2.5-flash`). The pipeline sends 40-80K tokens per run across 9 agents. Models below 30B parameters or without strong structured-output support will produce inconsistent results.

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

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install FastAPI dependencies
pip install -r requirements.txt

# Install the TradingAgents engine in editable mode
pip install -e tradingagents-core/

# Create your .env from the example
cp .env.example .env
```

Open `backend/.env` and fill in your provider and key:

```env
# Choose your provider
LLM_PROVIDER=google
DEEP_THINK_LLM=gemini-2.5-flash
QUICK_THINK_LLM=gemini-2.5-flash

# Add the matching API key
GOOGLE_API_KEY=your_key_here
```

### 3. Start the backend

```bash
cd backend
source venv/bin/activate        # Windows: venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

The server runs startup validation on launch. It checks API keys, model names, and writable directories. If any check fails, it logs the exact problem and exits before accepting requests.

### 4. Frontend

```bash
cd frontend

# Create your .env from the example
cp .env.example .env

# Install dependencies and start
npm install
npm run dev
```

The app opens at `http://localhost:5173`.

> If you use Create React App instead of Vite, run `npm start` and the app opens at `http://localhost:3000`.

---

## Setup With Docker

Docker builds and runs the backend, frontend, and (optionally) Ollama in one command.

### 1. Create `backend/.env`

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add your API key:

```env
LLM_PROVIDER=google
DEEP_THINK_LLM=gemini-2.5-flash
QUICK_THINK_LLM=gemini-2.5-flash
GOOGLE_API_KEY=your_key_here
```

### 2. (Optional) Create `frontend/.env`

The Docker build passes frontend env vars as build args. You can skip this file and pass them on the command line instead. If you want key-based auth, set `VITE_API_KEY` here and match it with `API_KEY` in `backend/.env`.

### 3. Start all services

```bash
docker compose up --build
```

Backend runs at `http://localhost:8000`. Frontend runs at `http://localhost:3000`.

### 4. (Optional) Start with Ollama

```bash
docker compose --profile ollama up --build
```

Then pull a model:

```bash
docker exec -it tradingagent-ollama ollama pull qwen3:4b
```

Set `LLM_PROVIDER=ollama` and `OLLAMA_BASE_URL=http://ollama:11434` in `backend/.env`.

### 5. Stop all services

```bash
docker compose down
```

---

## Ticker Symbols

Enter tickers exactly as yfinance expects them.

| Market | Format | Example |
|---|---|---|
| US stocks | Plain ticker | `NVDA`, `AAPL`, `TSLA` |
| Indonesia (IDX) | Append `.JK` | `BBCA.JK`, `TLKM.JK`, `GOTO.JK` |
| Other markets | Standard suffix | `BARC.L` (London), `7203.T` (Tokyo) |

Indonesian stocks listed on the Indonesia Stock Exchange (IDX) use the `.JK` suffix. For example, Bank Central Asia is `BBCA.JK` and Telkom Indonesia is `TLKM.JK`.

---

## Usage

### 1. Open the Analysis page

Go to **Analysis** in the navigation bar. You will see the input form on the left and a blank result area on the right.

![Analysis Form](assets/TradingAgent%20Analysis%20UI%201.png)

### 2. Enter your parameters and run

Enter a ticker symbol (e.g. `NVDA` for Nvidia, or `BBCA.JK` for Bank Central Asia), set a trade date, and click **Execute Analysis**. The pipeline takes 2-5 minutes per run.

### 3. Read the result

When the pipeline finishes, the ResultCard shows the decision badge (Buy / Hold / Sell), price target, time horizon, confidence, action plan, key catalysts, executive summary, and full investment thesis.

![Analysis Result - Sell example](assets/TradingAgent%20Analysis%20UI%202.png)

![Analysis Result - Hold example](assets/TradingAgent%20Analysis%20UI%203.png)

Your last 10 analyses are saved automatically in the **Recent Analyses** sidebar.

---

## Mock Mode vs Real Mode

**Real mode** (default) calls the live backend SSE pipeline. It requires a running backend with a valid API key. Use the main `/analysis` page.

**Mock mode** uses static sample responses from `mockData.js`. No backend call is made. Use it to test the UI without a running backend or an API key. Navigate to `/analysis-mock`.

Available mock tickers: `NVDA` (Buy), `AAPL` (Hold), `TSLA` (Sell), `ERROR` (error state).

You can also force mock mode for the `/analysis` page by setting `VITE_ENABLE_MOCK=true` in `frontend/.env`.

---

## Engine: TauricResearch/TradingAgents

The core analysis engine lives in `backend/tradingagents-core/` and is taken from [github.com/TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents/tree/main).

| Agent | Role |
|---|---|
| Market Analyst | Fetches price data and computes technical indicators |
| News Researcher | Scans recent headlines and macro events |
| Fundamentals Analyst | Pulls financial statements, ratios, and balance sheet |
| Bull Researcher | Builds the bullish investment case |
| Bear Researcher | Builds the bearish counterarguments |
| Research Manager | Evaluates the debate and issues an investment plan |
| Trader | Translates the plan into a transaction proposal |
| Risk Analysts | Runs a three-way risk debate (aggressive / conservative / neutral) |
| Portfolio Manager | Synthesizes all inputs into the final structured decision |

The final output is a `PortfolioDecision` Pydantic object:

- `rating` — Buy / Overweight / Hold / Underweight / Sell
- `executive_summary` — 5 sentences covering decision, key data, main risk, action plan, and catalyst
- `investment_thesis` — 6+ sentence plain-language explanation of the trade rationale
- `price_target` — optional numeric target in quote currency
- `time_horizon` — optional holding period (e.g. `3-6 months`)

---

## Supported LLM Providers

| Provider | `LLM_PROVIDER` value | API Key Variable |
|---|---|---|
| Google Gemini | `google` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` |
| xAI Grok | `xai` | `XAI_API_KEY` |
| Qwen | `qwen` | `QWEN_API_KEY` |
| GLM | `glm` | `GLM_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |
| Azure OpenAI | `azure` | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` |
| Ollama (local) | `ollama` | No key — set `OLLAMA_BASE_URL` |

---

## API Reference

### `POST /api/analyze/stream`

SSE endpoint. Streams progress events while the pipeline runs, then emits the final result.

Request body:

```json
{
  "ticker": "NVDA",
  "trade_date": "2026-05-13",
  "max_debate_rounds": 1
}
```

SSE event types:

| Event | Payload |
|---|---|
| `progress` | `{ agent_id, agent_name, status_message, elapsed }` |
| `result` | Full `PortfolioDecision` + `ticker`, `trade_date`, `agents_used` |
| `error` | `{ error: "..." }` |

Rate limit: 2 concurrent pipelines per IP. A third request returns an `error` event immediately.

### `POST /api/analyze`

Standard REST endpoint. Blocks until the pipeline completes.

Request body: same as above.

Response: same fields as the `result` SSE event.

Returns HTTP 429 if the per-IP concurrent limit is reached. Returns HTTP 504 on pipeline timeout.

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | — | LLM provider name |
| `DEEP_THINK_LLM` | — | Model for Research Manager and Portfolio Manager |
| `QUICK_THINK_LLM` | — | Model for all other agents |
| `GOOGLE_API_KEY` | — | Google Gemini API key |
| `DEEPSEEK_API_KEY` | — | DeepSeek API key |
| `ANALYSIS_MODE` | `balanced` | `balanced` (9-call fixed) or `classic` (full graph) |
| `PIPELINE_TIMEOUT_SECONDS` | `600` | Hard timeout per pipeline run |
| `CORS_ORIGINS` | `*` | Comma-separated list of allowed origins |
| `API_KEY` | — | Optional: require this key on every request |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend base URL |
| `VITE_API_KEY` | — | Must match `API_KEY` in backend if auth is enabled |
| `VITE_DEFAULT_MAX_DEBATE_ROUNDS` | `1` | Default shown in the form |
| `VITE_ENABLE_MOCK` | `false` | Set `true` to use mock data on `/analysis` |

---

## Credits

- Trading engine: [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents/tree/main)
- Graph orchestration: [LangGraph](https://github.com/langchain-ai/langgraph)
- Market data: [yfinance](https://github.com/ranaroussi/yfinance)
- Backend: [FastAPI](https://fastapi.tiangolo.com) + [sse-starlette](https://github.com/sysid/sse-starlette)
- Frontend: [React 19](https://react.dev) + [Vite](https://vitejs.dev)

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
