# TradingAgent - AI Assistant Context

This file is the primary context document for any AI coding assistant (Claude Code,
Cursor, GitHub Copilot, Windsurf, Aider, etc.). Read this file first before making
any change to the codebase.

---

## What This Project Is

TradingAgent is a full-stack AI-powered stock analysis platform. It wraps the
`tradingagents-core` multi-agent engine with a FastAPI backend and a React/Vite
frontend. The primary use case is analyzing Indonesian IDX stocks and US stocks,
producing structured BUY / HOLD / SELL signals with confidence scores, investment
theses, price targets, entry/exit levels, and HTML/PDF report exports.

This is a personal research tool, not a licensed financial product. Always include
appropriate disclaimers in any output visible to users.

---

## Repository Layout

```
TradingAgent/
├── .ai/                          # AI assistant context (this folder)
├── assets/                       # Screenshots and diagrams for README
├── backend/                      # FastAPI application
│   ├── routes/                   # HTTP and SSE endpoints
│   ├── services/                 # Business logic (repository, report service)
│   ├── tests/                    # pytest test suite
│   ├── templates/reports/        # Jinja2 HTML report template
│   ├── static/reports/           # CSS for HTML reports
│   ├── scripts/                  # Dev utilities and seed scripts
│   ├── tradingagents-core/       # Editable pip package (the agent engine)
│   │   ├── tradingagents/        # Core agent package
│   │   │   ├── agents/           # All agent implementations
│   │   │   ├── dataflows/        # Data fetching layer (yfinance, Finnhub, etc.)
│   │   │   └── graph/            # LangGraph pipeline definitions
│   │   ├── cli/                  # CLI entry point (separate from web backend)
│   │   └── tests/                # Core package tests
│   ├── main.py                   # FastAPI app factory and lifespan
│   ├── config.py                 # Unified config (reads from .env)
│   ├── schemas.py                # Pydantic response schemas (public API contract)
│   └── requirements.txt          # Backend pip dependencies
└── frontend/                     # React/Vite application
    ├── src/
    │   ├── pages/                # Route-level page components
    │   ├── components/           # Shared UI components
    │   │   └── results/tabs/     # Result card tab components
    │   ├── hooks/                # Custom React hooks
    │   ├── domain/               # analysisContract.js (frontend schema mirror)
    │   ├── utils/                # API clients, formatting, SSE helper
    │   └── constants/            # Static content (disclaimers, etc.)
    ├── dev/                      # mockData.js (dev-only, never imported in prod)
    └── package.json
```

---

## Architecture Overview

### Pipeline Execution Order

```
Data Collection (parallel)
    └── Market Analyst + News Analyst + Fundamentals Analyst (parallel)
            └── Bull Researcher
                └── Bear Researcher
                    └── Research Manager
                        └── Trader
                            └── Risk Analysts (aggressive / conservative / neutral)
                                └── Portfolio Manager  →  Final BUY / HOLD / SELL
```

Data collection and the first three analyst stages run in parallel. Everything
from Bull Researcher onward is sequential so each agent can read the previous
agent's output.

### Request Flow

```
Browser  →  POST /api/analyze  →  FastAPI  →  Job queued in process pool
                                                  ↓
Browser  →  GET /api/analysis/jobs/{id}/events  →  SSE stream (progress + result)
```

The frontend submits an analysis request, gets a job ID, then opens an SSE
connection to stream progress events and the final result in real time.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend language | Python 3.10-3.12 |
| Backend framework | FastAPI + uvicorn |
| Agent engine | LangGraph + LangChain |
| LLM provider (default) | Google Gemini (gemini-2.5-flash / gemini-2.5-pro) |
| Market data | yfinance (primary), Finnhub, Alpha Vantage |
| News data | MarketAux, NewsData.io, yfinance fallback |
| Backend test runner | pytest |
| Frontend framework | React 18 + Vite |
| Frontend styling | Tailwind CSS (Bloomberg Terminal aesthetic) |
| Frontend test runner | Vitest + Testing Library |
| Fonts | IBM Plex Mono, Barlow Condensed |
| Containerization | Docker + docker-compose |
| Dev OS | Windows + Anaconda (Python 3.13 on host) |

---

## Key Conventions

See `conventions.md` for the full list. Summary:

- Python: follow existing module patterns, add type hints, write docstrings.
- React: functional components only, PropTypes on every component, no class components.
- Commits: Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- No hardcoded URLs. Use `VITE_API_URL` in frontend, config module in backend.
- Never commit `.env` files. Use `.env.example` as the template.
- Mock data lives in `frontend/dev/` and `frontend/src/utils/mockReport.js` only.
  The mock route (`/analysis.test`) activates only when `VITE_ENABLE_MOCK=true`.

---

## Where to Find Things

| What you need | Where to look |
|---|---|
| API request/response shapes | `backend/schemas.py` and `backend/routes/validation.py` |
| Ticker normalization rules | `backend/routes/validation.py` → `normalize_ticker` |
| LLM / provider config | `backend/config_llm.py` and `backend/.env.example` |
| Agent pipeline entry point | `backend/tradingagents-core/tradingagents/graph/` |
| Individual agent logic | `backend/tradingagents-core/tradingagents/agents/` |
| Data fetching layer | `backend/tradingagents-core/tradingagents/dataflows/` |
| Frontend API client | `frontend/src/utils/api.js` and `frontend/src/utils/sse.js` |
| Frontend data contract | `frontend/src/domain/analysisContract.js` |
| SSE event handling | `backend/routes/sse.py` and `frontend/src/hooks/useAnalysisJob.js` |
| Report generation | `backend/services/report_service.py` |
| All environment variables | `backend/.env.example` (canonical reference) |

---

## Files Never to Touch Blindly

- `backend/schemas.py` - public API contract. Changes here break the frontend.
- `frontend/src/domain/analysisContract.js` - frontend mirror of the API contract.
  Must stay in sync with `schemas.py`.
- `backend/tradingagents-core/pyproject.toml` - package version and dependencies
  for the core agent engine.
- `backend/routes/validation.py` - input validation. Wrong changes allow bad data
  into the expensive LLM pipeline.

---

## Related Context Files

- `architecture.md` - detailed system architecture with data flow diagrams
- `conventions.md` - coding standards, naming rules, commit format
- `api.md` - full API reference (endpoints, request/response schemas)
- `setup.md` - how to run the project locally and with Docker
- `decisions.md` - important technical decisions and the reasoning behind them
