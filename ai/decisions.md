# Technical Decisions

Last synced: 2026-06-19.

This document records the technical decisions that shape the active code.

## ADR-001: Process Pool for Pipeline

Decision: The backend runs the agent pipeline in `ProcessPoolExecutor`.

Reason:

- The pipeline uses LangGraph, LangChain, provider SDKs, yfinance, and blocking
  calls.
- The FastAPI event loop must stay responsive.
- Spawn context is safe for Windows and Docker.
- `PROCESS_POOL_MAX_TASKS_PER_CHILD=1` clears provider state after each task.

Implication:

- Do not call the blocking pipeline directly from routes.
- Use `backend/routes/pipeline_runner.py`.
- Cancellation uses a cancel event, not manual process killing.

## ADR-002: Job API Is the Canonical Flow

Decision: The main frontend uses:

```text
POST /api/analysis/jobs
GET  /api/analysis/jobs/{job_id}/events
GET  /api/analysis/jobs/{job_id}
DELETE /api/analysis/jobs/{job_id}
```

Reason:

- Analysis can take a long time.
- Users need progress and cancellation.
- Results need to be reopenable.
- The job store has event replay and terminal results.

Implication:

- `/api/analyze` and `/api/analyze/stream` are legacy.
- New frontend features use the job API.
- Canonical reports use `job_id`.

## ADR-003: SSE, Not WebSocket

Decision: Progress uses Server-Sent Events.

Reason:

- Data moves from server to browser.
- SSE is simpler.
- `fetch()` streams can carry cookies and custom headers.

Implication:

- Native `EventSource` is not used.
- SSE routes must not be compressed.
- Event format must stay in sync with frontend hooks.

## ADR-004: Owner Session Cookie for Resource Isolation

Decision: The browser gets a signed owner session from `POST /api/session`,
stored as the HttpOnly cookie `ta_owner_token`.

Reason:

- The API key is a service credential, not a browser identity.
- Owner sessions isolate jobs, history, reports, rate limits, and streams per
  browser session.
- The HttpOnly cookie reduces the risk of JavaScript reading the token.

Implication:

- The frontend must use `credentials: 'include'`.
- `buildAuthHeaders()` does not need to send `x-owner-token`.
- The backend still accepts `x-owner-token` for tests and legacy clients.
- Production requires `OWNER_SESSION_SECRET`.

## ADR-005: Service Credential Is Separate from Owner Session

Decision: `API_KEY` is used as the service/proxy credential. Owner identity
still comes from the owner session.

Reason:

- Nginx or a reverse proxy can inject the API key server-side.
- The browser must not see the API key.
- Rate/resource ownership must be per session, not per shared API key.

Implication:

- Do not put `API_KEY` in `VITE_*`.
- Protected endpoints call `limit_request()`.
- Docker nginx uses `BACKEND_API_KEY` for `x-api-key` when needed.

## ADR-006: SQLite for Runtime Storage

Decision: Job cache, analysis history, market cache, news cache, rate limits, and
LLM cache use SQLite/local shared volume.

Reason:

- Project personal/single-host.
- No additional DB service is needed.
- A Docker volume is enough for persistence.

Implication:

- Do not add PostgreSQL or a migration framework without a real need.
- The repository layer must handle schema changes.
- `.sqlite3`, `.sqlite`, `.db`, and `.cache/` must not be committed.

## ADR-007: Vite Proxy for Local API

Decision: The Vite dev server has a `/api` proxy.

Reason:

- Frontend default API base `/api`.
- Same-origin browser paths are simpler for owner session cookies.
- The Compose frontend can proxy to `backend:8000`.
- Local host can proxy to `localhost:8000` through env.

Implication:

- Local host dev needs `VITE_BACKEND_PROXY_TARGET=http://localhost:8000`.
- `VITE_API_BASE_URL=/api` is the default.
- A direct backend URL can still be used, but the proxy is more stable for cookies.

## ADR-008: Primary UI Route `/ai-agent`

Decision: The active analysis UI route is `/ai-agent`.

Reason:

- The UI product naming is now AI Agent.
- Route constants use `AI_AGENT_PATH`.
- Old legacy routes must stay alive for old backlinks/history.

Implication:

- New links use `/ai-agent`.
- Keep redirects from `/AI-Research`, `/ai-research`, `/analysis`, and
  `/analysis-live`.
- History/resource links should use `AI_AGENT_PATH`.

## ADR-009: Unified `LLM_API_KEY`

Decision: `LLM_API_KEY` is the primary key for the active provider.

Reason:

- One config path is simpler.
- `config_llm.py` passes the key as `api_key` to the provider client.
- Provider-specific keys remain for compatibility.

Implication:

- New docs and setup must recommend `LLM_API_KEY`.
- Provider-specific keys may still be described as legacy/fallback.
- Startup validation gives a critical issue when `LLM_API_KEY` is empty.

## ADR-010: Balanced Pipeline Only for the API Server

Decision: `ANALYSIS_MODE` is locked to `balanced`.

Reason:

- Frontend, serializers, reports, and tests use the balanced result shape.
- `analysis_depth` already provides fast/balanced/deep inside the same flow.

Implication:

- Do not add pipeline API modes without a complete contract.
- The user-facing mode is `analysis_depth`.

## ADR-011: Fast, Balanced, Deep Control Budget

Decision: `analysis_depth` controls LLM budget, debate, and risk rounds.
Active LLM client retry uses `LLM_MAX_RETRIES`.

Defaults:

| Depth | Budget | Debate | Risk |
|---|---:|---:|---:|
| `fast` | 6 | 1 | 1 |
| `balanced` | 9 | 2 | 2 |
| `deep` | 12 | 3 | 3 |

Reason:

- Users can choose latency/cost.
- Result shape stays stable.

Implication:

- Fast mode may use conservative fallback.
- Deep mode can add extra review.
- `max_debate_rounds` is still validated from 1 to 5.

## ADR-012: Parallel Data and Analysts, Sequential Decision

Decision: Data collection and initial analysts run in parallel. Debate/decision
run sequentially.

Reason:

- Data sources are independent.
- Market, news, and fundamentals analysts read the same data.
- Bull/bear/manager/trader/risk/portfolio depend on previous-stage output.

Implication:

- Do not create dependencies between initial analysts.
- Use the existing worker config: `DATA_COLLECTION_WORKERS` and
  `ANALYST_PARALLEL_WORKERS`.

## ADR-013: Canonical Yfinance Symbol, No Auto Suffix

Decision: Tickers are sent as canonical yfinance symbols. The backend no longer
automatically appends `.JK`.

Reason:

- The frontend has a yfinance search endpoint.
- Global, crypto, ETF, fund, and IDX symbols can be selected as canonical.
- Auto suffixing can be wrong for global symbols or search results.

Implication:

- IDX users must select/input `BBCA.JK` when they need a Yahoo IDX symbol.
- `market=ID` does not change `BBCA` into `BBCA.JK`.
- Tests must preserve this behavior.

## ADR-014: Broader Market Values Are Accepted

Decision: The backend accepts `IDX`, `ID`, `US`, `GLOBAL`, `CRYPTO`, `ETF`,
`FUND`, and `UNKNOWN`.

Reason:

- Yfinance search can return many asset classes.
- UI no longer restricts to old US/ID tab model.

Implication:

- Do not document old US/ID-only validation.
- Data quality must communicate missing/partial vendor support.
- Vendor-specific support can still vary by asset class.

## ADR-015: yfinance Search for Ticker UX

Decision: Frontend ticker input uses `/api/market/search`.

Reason:

- Avoid manual suffix rules.
- Give user symbol, name, exchange, type, market, source, and price.
- Send selected canonical symbol to backend.

Implication:

- Keep `TickerSearchBar` as primary input.
- Keep `/api/market/search` tests.
- Do not re-add static ticker tabs as primary UX without reason.

## ADR-016: Market OHLCV Endpoint for Chart Range

Decision: Chart range fetches use `/api/market/ohlcv`.

Reason:

- Result chart tabs need range changes without rerunning analysis.
- Backend centralizes yfinance interval fallback and validation.

Implication:

- Frontend chart range controls should call `/api/market/ohlcv`.
- Range values stay `YTD`, `1Y`, `6M`, `3M`, `1M`, `1W`.
- 1W can fall back from intraday to daily.

## ADR-017: Structured Company News

Decision: Company news for analysis uses `NewsService` and strict company/news
filtering.

Reason:

- LLM prompt needs relevant, deduped, provider-tagged articles.
- Data quality needs provider status.
- UI/report need structured article lists.

Implication:

- Keep provider metadata.
- Keep decision/company news separate from market context news.
- Debug route exists only in development.

## ADR-018: General News Tab with Background Refresh

Decision: General News page uses `GeneralNewsService`, optional background
refresh, and optional SSE update stream.

Reason:

- General market/macro/crypto/Indonesia news should not depend on running stock
  analysis.
- UI can update from SSE and fallback to polling.

Implication:

- `/api/news/general` and `/api/news/general/stream` are first-class endpoints.
- Background worker starts only when enabled.
- News SSE path must stay uncompressed.

## ADR-019: `extra="allow"` on Response Schema

Decision: Public response schema inherits `ApiSchema` with `extra="allow"`.

Reason:

- Pipeline output grows over time.
- Frontend should ignore unknown fields.
- OpenAPI still documents stable envelope.

Implication:

- Do not set `extra="forbid"` for pipeline response.
- Stable fields should not be removed without migration.

## ADR-020: Report Export from Snapshot

Decision: HTML/PDF report renders from completed result snapshot or bounded
client fallback payload.

Reason:

- Export must match visible result.
- Export must not call LLM/vendor again.
- History gives reproducible snapshots.

Implication:

- Report canonical path uses `job_id`.
- Fallback POST accepts bounded payload.
- Export audit fields are best effort.
- Disclaimer is mandatory.

## ADR-021: Docker Compose Optimized for Dev

Decision: Default `docker-compose.yml` uses backend reload and frontend Vite dev
target.

Reason:

- Repo workflow favors local development.
- Bind mounts update code quickly.
- Vite proxy to backend service works inside Compose.

Implication:

- Do not document Compose frontend as nginx unless compose file changes.
- Production nginx runtime remains in Dockerfile but is separate from default
  compose.
- `docker-compose.mock.yml` build arg does not guarantee mock in dev target;
  use `VITE_ENABLE_MOCK=true` env when testing mock route.

## ADR-022: Startup Validation Logs for Debug

Decision: Startup validation issues are logged and server continues in
`main.validate_config()`.

Reason:

- Developers need UI/backend to boot while fixing env.
- Optional vendor key absence should not block unrelated work.

Implication:

- Missing LLM/vendor keys may fail only when calling affected pipeline/vendor.
- Import-time config constraints still raise for unsafe settings.
- Tests should assert validation output, not forced process exit.

## ADR-023: No Backtest Module in Current Tree

Decision: Current repo tree has no `backtest/` source folder or runner command.

Reason:

- `rg --files` and top-level tree show no backtest module.
- Core package only exposes optional `backtesting` dependency group.

Implication:

- Do not document a backtest command until runner code exists.
- Do not reference `backtest/.env.backtest.example` as active template.

## ADR-024: Market Dashboard API

Decision: `/market` is an active dashboard backed by dedicated market endpoints.

Endpoints:

```text
GET  /api/market/presets
GET  /api/market/validate-symbol
POST /api/market/overview
GET  /api/market/movers
GET  /api/market/search
GET  /api/market/ohlcv
GET  /api/market/sparklines
GET  /api/market/quotes
```

Reason:

- Market page needs configurable overview symbols, movers, and ticker tape
  without running analysis.
- Backend centralizes yfinance symbol validation and fallback behavior.

Implication:

- Keep `frontend/src/api/market.js` as client boundary.
- Keep yfinance request caps in backend route/service.
- Do not describe `/market` as shell-only.

## ADR-025: Watchlist Is Local Browser State

Decision: `/watchlist` is an active frontend page with localStorage persistence,
not a backend-synced resource.

Storage key:

```text
tradingagents:watchlists:v1
```

Reason:

- The current product need is fast personal ticker grouping.
- Existing market endpoints already provide validation, quotes, and sparklines.
- Avoiding backend CRUD keeps auth, migration, and sync complexity out until a
  synced watchlist requirement exists.

Implication:

- Use `useWatchlistStore()` and `watchlistStorage.js` for state.
- Use `/api/market/search`, `/api/market/validate-symbol`, `/api/market/quotes`,
  and `/api/market/sparklines` for data.
- Do not add database tables or watchlist routes unless requested.

## ADR-026: Home Summary Reuses General News

Decision: `/home` shows `HomeNewsSummary` from existing General News data.

Reason:

- General market news already has provider routing, cache, SSE, and polling.
- The home page only needs a compact top-news view, not a separate backend
  contract.
- Reusing `useGeneralNews()` keeps article normalization and fallback behavior
  consistent with `/news`.

Implication:

- Dashboard calls `useGeneralNews({ category: "all", windowDays: 7, limit: 100 })`.
- `HomeNewsSummary` sorts normalized articles by newest and displays top 3.
- Do not create a separate `/api/home/news` endpoint unless the backend needs a
  different aggregation contract.

## ADR-027: Ticker News SSE Is Separate from General News SSE

Decision: company-specific news can stream through `/api/news/{ticker}/stream`,
while general news still streams through `/api/news/general/stream`.

Reason:

- General news updates are category/global market oriented.
- Ticker news updates must poll `NewsService` for one normalized ticker and
  publish only changed ticker payloads.
- Separate event names keep frontend consumers simple.

Implication:

- Keep `ticker_news_stream_ready` and `ticker_news_updated` event names stable.
- Keep all `/api/news/*/stream` paths uncompressed.
- Stream availability follows `general_news.enable_sse`.
