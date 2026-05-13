# TradingAgent

A full-stack web application that wraps the [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents/tree/main) engine with a FastAPI backend and a React frontend. You enter a ticker and a date, nine specialized AI agents collaborate and debate, then deliver a structured trade decision: **Buy / Hold / Sell** with an executive summary, investment thesis, price target, and time horizon.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  React Frontend  (port 3000)                                    │
│  StockForm → SSE stream → AgentLog (live) → ResultCard         │
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
│  Source: TauricResearch/TradingAgents                           │
│                                                                  │
│  Market Analyst → News Researcher → Fundamentals Analyst        │
│       ↓                                                          │
│  Bull Researcher ⟷ Bear Researcher                              │
│       ↓                                                          │
│  Research Manager                                                │
│       ↓                                                          │
│  Trader → Risk Analysts (aggressive / conservative / neutral)   │
│       ↓                                                          │
│  Portfolio Manager → PortfolioDecision (structured output)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
TradingAgent/
├── backend/
│   ├── main.py                   # FastAPI app, CORS, startup validation
│   ├── requirements.txt          # FastAPI, uvicorn, sse-starlette, dotenv
│   ├── .env                      # API keys (not committed)
│   └── routes/
│       └── analysis.py           # SSE + REST endpoints, pipeline runner
│
├── backend/tradingagents-core/   # TradingAgents engine (from TauricResearch)
│   ├── tradingagents/
│   │   ├── agents/               # 9 agent implementations + schemas
│   │   ├── graph/                # LangGraph orchestration
│   │   ├── llm_clients/          # Provider adapters (Google, OpenAI, Anthropic, etc.)
│   │   └── dataflows/            # yfinance, Alpha Vantage data connectors
│   └── pyproject.toml
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── StockForm.jsx      # Input form, real SSE only
    │   │   ├── StockFormMock.jsx  # Testing form (mock data, no API call)
    │   │   ├── AgentLog.jsx       # Live progress via SSE events
    │   │   ├── ResultCard.jsx     # Structured result display
    │   │   └── Navbar.jsx
    │   ├── pages/
    │   │   ├── Dashboard.jsx      # Landing page
    │   │   ├── Analysis.jsx       # Main analysis page + history sidebar
    │   │   └── AnalysisMock.jsx   # UI testing page (/analysis-mock)
    │   └── mockData.js            # Sample responses for UI testing
    └── package.json
```

---

## Engine: TauricResearch/TradingAgents

The core analysis engine is taken from [github.com/TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents/tree/main) and lives in `backend/tradingagents-core/`.

The engine runs a multi-agent pipeline powered by LangGraph:

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

The final output is a `PortfolioDecision` Pydantic object with five fields:

- `rating` — Buy / Overweight / Hold / Underweight / Sell
- `executive_summary` — exactly 5 sentences covering decision, key data, main risk, action plan, and catalyst
- `investment_thesis` — 6+ sentence plain-language explanation of the trade rationale
- `price_target` — optional numeric target in quote currency
- `time_horizon` — optional holding period (e.g. `3-6 months`)

---

## Requirements

**Backend**

- Python 3.10+
- pip

**Frontend**

- Node.js 18+
- npm

**LLM API Key (one of)**

| Provider | Environment Variable |
|---|---|
| Google Gemini | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Ollama (local) | No key needed, set `backend_url` in `default_config.py` |

> Recommended model: **Gemini 2.5 Flash** (`gemini-2.5-flash`). The pipeline sends 40–80K tokens per run across 9 agents. Models below 30B parameters or without strong structured-output support will produce inconsistent results and long latency.

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/MatthewSebastian15/TradingAgent.git
cd TradingAgent
```

### 2. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install FastAPI dependencies
pip install -r requirements.txt

# Install the TradingAgents engine
pip install -e tradingagents-core/

# Create your .env file
cp .env.example .env            # or create manually
```

Add your API key to `backend/.env`:

```env
# Google Gemini (recommended)
GOOGLE_API_KEY=your_key_here

# Or OpenAI
# OPENAI_API_KEY=your_key_here

# Or Anthropic
# ANTHROPIC_API_KEY=your_key_here
```

### 3. Configure the LLM model

Open `backend/tradingagents-core/tradingagents/default_config.py` and set your provider and model:

```python
DEFAULT_CONFIG = {
    "llm_provider":    "google",           # google | openai | anthropic | ollama | xai | deepseek
    "deep_think_llm":  "gemini-2.5-flash", # used by Research Manager and Portfolio Manager
    "quick_think_llm": "gemini-2.5-flash", # used by all other agents
    ...
}
```

### 4. Start the backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

The server runs startup validation on launch. It checks for API keys, model names, and writable directories. If any check fails, it logs the exact problem and exits before accepting requests.

### 5. Frontend

```bash
cd frontend
npm install
npm start
```

The app opens at `http://localhost:3000`.

---

## Usage

1. Go to **Analysis** in the navigation bar.
2. Enter a ticker symbol (e.g. `NVDA`) and a trade date.
3. Click **Run Agent Analysis**.
4. Watch the **AgentLog** update live via SSE as each agent completes.
5. Read the **ResultCard** when the pipeline finishes. It shows the decision badge, price target, time horizon, executive summary, and full investment thesis.
6. Your last 10 analyses are saved automatically in the **Recent Analyses** sidebar. Click any entry to reload that result.

### Testing the UI without a backend

Navigate to `/analysis-mock` to run the full UI with mock data. This uses `StockFormMock.jsx` and `mockData.js`. No API call is made. Useful for testing `AgentLog`, `ResultCard`, and the history sidebar without waiting for a real pipeline run.

Available mock tickers: `NVDA` (Buy), `AAPL` (Hold), `TSLA` (Sell), `ERROR` (error state).

---

## API Reference

### `POST /api/analyze/stream`

SSE endpoint. Streams progress events while the pipeline runs, then emits the final result.

**Request body**

```json
{
  "ticker": "NVDA",
  "trade_date": "2026-05-13",
  "max_debate_rounds": 1
}
```

**SSE event types**

| Event | Payload |
|---|---|
| `progress` | `{ agent_id, agent_name, status_message, elapsed }` |
| `result` | Full `PortfolioDecision` + `ticker`, `trade_date`, `agents_used` |
| `error` | `{ error: "..." }` |

**Rate limit:** 2 concurrent pipelines per IP. A third request returns an `error` event immediately.

---

### `POST /api/analyze`

Standard REST endpoint. Blocks until the pipeline completes.

**Request body:** same as above.

**Response:** same fields as the `result` SSE event.

Returns HTTP 429 if the per-IP concurrent limit is reached. Returns HTTP 504 on pipeline timeout (600 seconds).

---

## Supported LLM Providers

| Provider | Key in `llm_provider` | Notes |
|---|---|---|
| Google Gemini | `google` | Recommended. Gemini 2.5 Flash or higher. |
| OpenAI | `openai` | GPT-4.1 or higher for consistent structured output. |
| Anthropic | `anthropic` | Claude Sonnet 4.6 or higher. |
| xAI Grok | `xai` | |
| DeepSeek | `deepseek` | |
| Qwen | `qwen` | |
| GLM | `glm` | |
| Ollama (local) | `ollama` | Set `backend_url` to your Ollama endpoint. |
| Azure OpenAI | `azure` | Set `backend_url` to your Azure endpoint. |
| OpenRouter | `openrouter` | Models fetched dynamically. |

---

## Environment Variables

| Variable | Required for | Description |
|---|---|---|
| `GOOGLE_API_KEY` | Google Gemini | Gemini API key |
| `GEMINI_API_KEY` | Google Gemini | Alternative name for the same key |
| `OPENAI_API_KEY` | OpenAI | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic | Anthropic API key |

---

## Troubleshooting

**Backend exits immediately on startup**
The startup validator found a missing API key or unwritable directory. Read the `STARTUP CONFIG ERROR` lines in the logs and fix each item.

**`429 RESOURCE_EXHAUSTED` in the result**
You hit the Gemini rate limit. The backend retries up to 3 times automatically with the delay Gemini specifies. If the error persists, wait 60 seconds and try again, or reduce `max_debate_rounds` to 1 in the request.

**Pipeline timeout after 600 seconds**
The model is too slow or the Gemini API is under heavy load. Try `gemini-2.5-flash` instead of a larger model, or reduce `max_debate_rounds` to 1.

**Frontend shows no live updates (LIVE badge missing)**
The SSE connection is working but no `progress` events arrived before the result. This happens when the backend is very fast (mock mode) or the first event is delayed. The timer fallback in `AgentLog` will keep the UI animated.

**`StockFormMock` is not available on the main Analysis page**
Correct. Mock mode is only at `/analysis-mock`. The main `/analysis` page always calls the real backend.

---

## Credits

- Trading engine: [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents/tree/main)
- Graph orchestration: [LangGraph](https://github.com/langchain-ai/langgraph)
- Market data: [yfinance](https://github.com/ranaroussi/yfinance)
- Backend: [FastAPI](https://fastapi.tiangolo.com) + [sse-starlette](https://github.com/sysid/sse-starlette)
- Frontend: [React 19](https://react.dev) + [React Router 7](https://reactrouter.com)

## Citation

If you use this project or the underlying TradingAgents engine, please cite the original paper:

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