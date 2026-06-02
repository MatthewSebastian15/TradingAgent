# Technical Decisions

A log of important technical decisions made in this project and the reasoning
behind them. Read this before proposing architectural changes. If a decision
already exists here, understand why it was made before suggesting an alternative.

---

## ADR-001: Process Pool for Pipeline Execution

**Decision:** Run the agent pipeline in a `concurrent.futures.ProcessPoolExecutor`,
not inside the FastAPI async event loop.

**Reason:** LangGraph state machines and LangChain LLM calls mix sync and async
code in ways that conflict with uvicorn's asyncio loop. Running in a separate
process isolates the LangGraph state, avoids event loop conflicts, and allows
the FastAPI process to remain responsive while long-running (2-5 min) pipeline
jobs execute.

**Implication:** Do not use `asyncio.run()` or `loop.run_until_complete()` inside
pipeline code. The pipeline runs synchronously inside the worker process.

---

## ADR-002: Gemma 4 31B Rejected for Pipeline Use

**Decision:** Gemma 4 31B is not used as a pipeline LLM.

**Reason:** Tested against IDX stock analysis tasks. Findings:
- Inconsistent structured output (fails JSON schema compliance randomly)
- Poor adversarial reasoning in Bull/Bear debate stages
- Context degradation on long agent chains
- High latency for the quality produced

**Minimum viable:** Gemini 2.5 Flash for `quick_think_llm`. Gemini 2.5 Pro
or equivalent for `deep_think_llm`.

---

## ADR-003: SQLite for All Persistence

**Decision:** Use SQLite (via Python's built-in `sqlite3`) for all persistence:
job store, result cache, analysis history, market data cache, news cache.

**Reason:** This is a personal/single-user tool. SQLite has zero ops overhead,
no separate service to run, and is perfectly adequate for the expected load
(single user, dozens of analyses per day at most). PostgreSQL adds complexity
with no benefit at this scale.

**Implication:** All `.sqlite3` files live in `backend/.cache/`. This directory
is gitignored. Do not add a migration framework. Schema changes are managed
via `CREATE TABLE IF NOT EXISTS` in the repository layer.

---

## ADR-004: SSE Instead of WebSocket for Job Streaming

**Decision:** Use Server-Sent Events (SSE) for streaming job progress to the
browser, not WebSocket.

**Reason:** SSE is simpler for server-push-only communication. The browser
never needs to send data after the initial HTTP request. SSE reconnects
automatically. SSE works cleanly with FastAPI's `StreamingResponse`. No
WebSocket library needed on either side.

**Implication:** The SSE path must bypass gzip compression (`SkipSseCompressionMiddleware`).
Do not remove this middleware.

---

## ADR-005: Two LLM Tiers (deep_think vs quick_think)

**Decision:** Use two separate LLM configurations: `deep_think_llm` and
`quick_think_llm`.

**Reason:** Research Manager and Portfolio Manager need stronger reasoning for
the synthesis and final decision steps. The three analyst agents and researchers
can use a faster, cheaper model. This reduces cost and latency while keeping
quality where it matters most.

**Implication:** Both must be set in `.env`. The backend has no hardcoded fallback.
Missing either causes startup failure by design.

---

## ADR-006: No Global State in Frontend

**Decision:** No Redux, no Zustand, no React Context for global state. Each
page component manages its own state via hooks.

**Reason:** The app has two main pages. Global state management adds complexity
that is not justified. `useAnalysisJob.js` encapsulates all the job-polling
and SSE logic. `useAnalysisHistory.js` handles history. Props drill is minimal.

**Implication:** If the app grows to 5+ pages with shared state needs, reconsider.

---

## ADR-007: Vite Over Create React App

**Decision:** Use Vite instead of Create React App.

**Reason:** CRA is unmaintained. Vite is faster to start, faster to build, and
has a cleaner config model. The migration from CRA was completed. All JSX files
use `.jsx` extension. There is only one `index.html` at `frontend/index.html`.

**Implication:** Use `import.meta.env.VITE_XXX` for env vars, not `process.env.REACT_APP_XXX`.

---

## ADR-008: yfinance as Primary Data Source

**Decision:** yfinance is the primary data vendor. Finnhub and Alpha Vantage
are secondary/fallback.

**Reason:** yfinance is free, covers Indonesian IDX stocks (`.JK` suffix), and
provides adequate OHLCV + fundamental data for the analysis use case. Paid
APIs are fallbacks for enrichment, not primary sources.

**Implication:** The pipeline can run with only yfinance if no Finnhub/Alpha Vantage
keys are configured. Data quality warnings are added to the response when
fallbacks are used or data is partial.

---

## ADR-009: Mock Route Behind Feature Flag

**Decision:** The mock route (`/analysis.test`) is only active when
`VITE_ENABLE_MOCK=true`.

**Reason:** Mock data must never appear in a production build or confuse
non-developer users. The flag is not set in `.env.example` for frontend
production builds.

**Implication:** The mock data files (`dev/mockData.js`, `src/utils/mockReport.js`)
stay in the repo for dev convenience but are tree-shaken out of production bundles.

---

## ADR-010: Multi-Stage Docker Build for Backend

**Decision:** Use a multi-stage Docker build for the backend image.

**Reason:** Single-stage builds with all dev/build tools included produced
~1.28 GB images. Multi-stage builds separate the build environment from the
runtime environment, targeting ~700-900 MB.

**Implication:** The `Dockerfile.backend` has a `builder` stage and a `runtime`
stage. When adding new dependencies, verify they are installed in the correct stage.

---

## ADR-011: Parallel Analyst Stage, Sequential Debate Stage

**Decision:** Market Analyst, News Analyst, and Fundamentals Analyst run in
parallel. Everything from Bull Researcher onward runs sequentially.

**Reason:** The three analyst agents are independent. Running them in parallel
cuts the data collection + analysis phase from ~90s to ~30s. The debate and
decision stages are sequential because each agent needs the previous agent's
full output.

**Implication:** Do not add dependencies between the analyst agents. If an agent
needs another analyst's output, it belongs in the debate or decision stage.

---

## ADR-012: `extra="allow"` on All Response Schemas

**Decision:** All Pydantic response schemas use `extra="allow"` (via `ApiSchema`
base class).

**Reason:** The pipeline output evolves. New fields get added over time.
`extra="forbid"` would cause validation errors when the pipeline adds a field
that the schema doesn't declare. `extra="allow"` lets the API grow forward-compatibly
without breaking existing clients.

**Implication:** Never set `extra="forbid"` on response models. The frontend reads
specific known fields and ignores unknown ones. This is intentional.

---

## ADR-013: Ticker Auto-Normalization for Indonesian Stocks

**Decision:** A known set of IDX ticker codes (BBCA, BMRI, TLKM, etc.) are
automatically suffixed with `.JK` when submitted without the suffix.

**Reason:** Users entering IDX tickers in a UI form should not need to know
the yfinance suffix convention. The auto-suffix list covers the most common
IDX large-cap and mid-cap stocks.

**Implication:** The auto-suffix list is in `backend/routes/validation.py`
(`_IDX_AUTO_SUFFIX`). Add new tickers to this set when expanding IDX coverage.
Tickers with explicit `.JK` suffix pass through unchanged.
