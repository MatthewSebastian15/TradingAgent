# Coding Conventions

Last synced: 2026-06-19.

Follow the active code patterns. Do not use generic preferences that conflict with the repo.

## Git

Use Conventional Commits:

```text
<type>(<scope>): <short description>
```

Types:

```text
feat, fix, chore, docs, test, refactor, perf, style
```

Stage specific files. Avoid `git add .` unless all changes are one unit of
work.

## Documentation

- Use English for docs under `ai/`.
- Get endpoints from `backend/routes/*`, not memory.
- Get env defaults from `backend/config_defaults.py`, `backend/config_llm.py`,
  `frontend/src/config.js`, and `frontend/vite.config.js`.
- If endpoints/env change, update `ai/api.md` and `ai/setup.md`.
- Do not document features that exist only in UI text but do not have routes
  or backend logic yet.
- Do not write that Docker Compose uses the nginx runtime. Compose currently
  uses the Vite dev target.
- Do not write that the frontend stores the owner token. The token is now in an
  HttpOnly cookie.
- Do not write `backtest/` or `assets/` as active folders. Neither exists in
  the tree right now.

## Process Hygiene

- If you start a dev server, API server, preview server, Docker Compose stack,
  or any other port-bound process, track the command, port, and PID/service.
- Stop every port-bound process after verification unless the user explicitly
  asks to keep it running.
- Before final response, state whether any started port-bound process remains.

## Python Backend

### Version and Format

| Area | Rule |
|---|---|
| Backend Docker | Python 3.11 slim. |
| Backend ruff target | Python 3.11. |
| Core package | `>=3.10,<3.13`. |
| Core ruff target | Python 3.10. |
| New Python file | Add `from __future__ import annotations`. |
| Type hints | Required for new function signatures. |
| Union | Use `X | Y`. |
| Formatting | Ruff format, double quotes. |
| Line length | Ruff config, 100 chars. |

### Imports

Order:

1. Standard library.
2. Third-party.
3. Local modules.

Rules:

- Route/service imports runtime config from `config.py`.
- Config modules may import from `config_defaults.py` and `config_llm.py`.
- Do not read `os.environ` in route/service code.
- Import engine as `from tradingagents...`.
- Do not import engine as `from backend...`.

### Config

Source files:

```text
backend/config_env.py
backend/config_defaults.py
backend/config_llm.py
backend/config_validation.py
backend/config.py
```

When adding backend env:

1. Add parser/default in correct config module.
2. Export through `backend/config.py` if used outside config.
3. Add to `backend/.env.example` only if user should set it.
4. Update `ai/setup.md`.
5. Add or update tests if validation or behavior changes.

Hard constraints can raise at config import. Startup validation warnings are
logged by `main.validate_config()` and do not stop local debug.

### Errors

Use typed errors from `backend/errors.py`.

| Class | HTTP | Use |
|---|---:|---|
| `BadRequestError` | 400 | Invalid input, invalid job, preflight failure. |
| `AuthenticationError` | 401 | API key or owner token invalid. |
| `NotFoundError` | 404 | Resource missing. |
| `RateLimitError` | 429 | Rate or concurrency limit. |
| `PipelineTimeoutError` | 504 | Pipeline timeout. |
| `PipelineExecutionError` | 500 | Pipeline failure. |

Do not return stack traces, filesystem paths, or secrets.

### Pydantic

- Public response models live in `backend/schemas.py`.
- Analysis request model lives in `backend/routes/validation.py`.
- Response models inherit `ApiSchema`.
- `ApiSchema` uses `extra="allow"`.
- Do not set pipeline response schemas to `extra="forbid"`.
- If final result field changes, update frontend readers and report payload.

### Analysis Contract

When changing analysis request or response, check:

```text
backend/routes/validation.py
backend/schemas.py
backend/routes/serializers.py
frontend/src/domain/analysisContract.js
frontend/src/components/StockForm.jsx
frontend/src/hooks/useAnalysisJob.js
frontend/src/components/ResultCard.jsx
frontend/src/utils/reportApi.js
backend/tests/test_analysis_contract_snapshot.py
frontend/src/domain/analysisContract.test.js
ai/api.md
```

### Auth and Session

- `POST /api/session` sets `ta_owner_token` cookie.
- Frontend uses cookie and `credentials: 'include'`.
- `x-owner-token` is accepted for tests and legacy clients.
- Do not reintroduce frontend token storage unless explicitly requested.
- Do not put backend `API_KEY` in browser env.
- Nginx may inject `x-api-key` server-side.

### SSE

Use fetch stream, not native `EventSource`.

Files:

```text
backend/routes/sse.py
backend/routes/jobs.py
backend/routes/analysis.py
backend/routes/news.py
frontend/src/hooks/useAnalysisJob.js
frontend/src/hooks/useGeneralNews.js
frontend/src/utils/sse.js
```

Events to keep stable:

```text
job
progress
heartbeat
result
error
general_news_updated
ticker_news_stream_ready
ticker_news_updated
```

Do not compress SSE paths. Keep `SkipSseCompressionMiddleware`.

### Backend Tests

Backend tests:

```text
backend/tests/
packages/tests/
```

Markers:

```text
backend pyproject: live_api
core pyproject: unit, integration, smoke, live_api
```

Rules:

- Unit tests do not call yfinance, Finnhub, Google News Light, MarketAux,
  NewsData, Alpha Vantage, or LLM live.
- Mock external calls.
- Test route behavior with `TestClient` patterns already in repo.
- Use `TRADINGAGENTS_SKIP_DOTENV=true` for hermetic config when needed.
- Ensure error responses do not leak secret/path data.

Commands:

```powershell
cd backend
pytest tests/ -m "not integration and not live_api" -v
python -m ruff check .
python -m ruff format --check .
```

Core:

```powershell
cd d:\CODING\TradingAgents
python -m pytest packages/tests -m "not integration and not live_api" -v
```

## Frontend

### Component Style

- Use functional components.
- Components with props must define `PropTypes`; PropTypes are the current
  JS/JSX type-checking mechanism.
- Hooks start with `use`.
- Use Tailwind utilities.
- Use tokens from `frontend/tailwind.config.js`.
- Avoid inline style unless existing pattern requires small dynamic value.
- Do not add `console.log()` in production path.
- ESLint enforces `react/prop-types`, `import/order`, single quotes, and
  semicolons.
- `import/order` groups imports as builtin, external, internal alias, then
  relative.

Sidebars:

- Every in-page sidebar (Research, Chatbot history, future tabs) MUST size from
  `frontend/src/constants/sidebar.js`: `SIDEBAR_COLLAPSED_WIDTH` (`w-12`, 48px,
  matches the global nav rail) and `SIDEBAR_EXPANDED_WIDTH` (`w-60`, 240px).
- Do not hardcode sidebar widths (`w-[200px]`, `w-7`, etc.). Change the
  constants to resize all sidebars at once.

Color tokens:

```text
bloomberg-bg
bloomberg-surface
bloomberg-card
bloomberg-border
bloomberg-border-light
bloomberg-orange
bloomberg-orange-dim
bloomberg-green
bloomberg-green-dim
bloomberg-red
bloomberg-red-dim
bloomberg-amber
bloomberg-amber-dim
bloomberg-blue
bloomberg-blue-dim
bloomberg-cyan
bloomberg-white
bloomberg-muted
bloomberg-subtle
```

### File Organization

| Type | Folder |
|---|---|
| Page | `frontend/src/pages/` |
| Shared component | `frontend/src/components/` |
| Home component | `frontend/src/components/home/` |
| Market component | `frontend/src/components/market/` |
| Watchlist component | `frontend/src/components/watchlist/` |
| Result component | `frontend/src/components/results/` |
| Result tab | `frontend/src/components/results/tabs/` |
| API client | `frontend/src/api/` |
| Hook | `frontend/src/hooks/` |
| Utility | `frontend/src/utils/` |
| Domain contract | `frontend/src/domain/` |
| Constants | `frontend/src/constants/` |

Route changes usually touch:

```text
frontend/src/App.jsx
frontend/src/constants/routes.js
frontend/src/components/Navbar.jsx
frontend/src/pages/
```

### Routes

Primary analysis route is `/ai-agent`.

Keep legacy redirects unless doing planned route migration:

```text
/AI-Research
/ai-research
/analysis
/analysis-live
```

Other routes:

```text
/home
/research
/watchlist
/news
/market
/econ
```

`/economic` redirects to `/econ`.

### API URL

Use `buildApiUrl()`.

Do not hardcode backend URL in components.

Relevant env:

```text
VITE_API_BASE_URL
VITE_API_URL
VITE_DEV_HOST
VITE_DEV_PORT
VITE_BACKEND_PROXY_TARGET
```

Recommended local Vite:

```text
VITE_API_BASE_URL=/api
VITE_BACKEND_PROXY_TARGET=http://localhost:8000
```

Default `VITE_BACKEND_PROXY_TARGET` is `http://backend:8000`, which works in
Compose but not plain host local unless `backend` resolves.

### Owner Session

Use helpers:

```text
ensureOwnerSession()
buildHeaders()
buildAuthHeaders()
readHttpError()
```

`buildHeaders()` returns JSON content type after ensuring session.
`buildAuthHeaders()` ensures session and returns `{}`.

Fetch calls that need auth should use `credentials: 'include'`.

### Ticker Search

Use `TickerSearchBar` and `/api/market/search`.

Do not add IDX auto suffix in frontend. Backend no longer does that.

Selected yfinance symbol should be sent as `ticker`.

Allowed backend markets:

```text
IDX, ID, US, GLOBAL, CRYPTO, ETF, FUND, UNKNOWN
```

### Market Dashboard

Use `frontend/src/api/market.js` helpers:

```text
getMarketPresets()
validateMarketSymbol()
searchMarketTickers()
getMarketQuotes()
getMarketSparklines()
getMarketOverview()
getMarketMovers()
```

Backend endpoints:

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

### Home Dashboard

- `/home` uses `frontend/src/pages/Dashboard.jsx`.
- Dashboard shows `HomeNewsSummary` from `frontend/src/components/home/`.
- `HomeNewsSummary` consumes `useGeneralNews({ category: 'all', windowDays: 7, limit: 100 })`.
- It normalizes articles, sorts newest first, and renders top 3.
- Do not add a separate home news endpoint unless backend requirements change.

### Watchlist

- `/watchlist` uses `frontend/src/pages/Watchlist.jsx`.
- Watchlist state is browser localStorage only.
- Storage key: `tradingagents:watchlists:v1`.
- Use `useWatchlistStore()` for groups and tickers.
- Use `useWatchlistQuotes()` for quote polling and sparkline trend data.
- Manual ticker validation must call `validateMarketSymbol()`.
- Search add should use `WatchlistTickerInput` and `searchMarketTickers()`.
- Quote data comes from `/api/market/quotes`.
- Trend bars come from `/api/market/sparklines`.
- Do not add backend watchlist persistence unless requested.


### Frontend Tests

Commands:

```powershell
cd frontend
npm test -- --run
npm run lint
npm run format:check
npm run quality
```

Rules:

- Use Vitest and Testing Library.
- Mock fetch and SSE.
- Test user behavior, not implementation details.
- Do not call network.

## API Endpoint Rules

Canonical analysis endpoints:

```text
POST   /api/session
POST   /api/analysis/jobs
GET    /api/analysis/jobs/{job_id}
GET    /api/analysis/jobs/{job_id}/events
DELETE /api/analysis/jobs/{job_id}
```

Do not use legacy endpoints for new features:

```text
POST /api/analyze
POST /api/analyze/stream
GET  /api/analysis/{request_id}
DELETE /api/analysis/{job_id}
```

Endpoints that exist and are easy to forget:

```text
GET  /api/market/presets
GET  /api/market/validate-symbol
POST /api/market/overview
GET  /api/market/movers
GET  /api/market/search
GET  /api/market/ohlcv
GET  /api/market/sparklines
GET  /api/market/quotes
GET  /api/news/general
GET  /api/news/general/categories
GET  /api/news/general/stream
GET  /api/news/{ticker}/stream
GET  /api/news/{ticker}
GET  /api/reports/disclaimer
```

Endpoints that do not exist:

```text
GET  /api/analyze/status
POST /api/analyze/cancel/{job_id}
GET  /api/market/quote/{ticker}
GET  /api/reports/{job_id}.html
GET  /api/reports/{job_id}.pdf
GET  /api/session
POST /api/session/refresh
```

## Report Rules

- Do not remove disclaimer.
- Canonical report endpoints use `job_id`.
- Fallback POST endpoints accept bounded result payload.
- If adding report fields, update:

```text
backend/services/report_service.py
backend/templates/reports/analysis_report.html
frontend/src/utils/reportApi.js
backend/tests/test_report_service.py
backend/tests/test_report_routes.py
```

## Docker Rules

- Compose default frontend is Vite dev target.
- Nginx runtime exists but default compose does not use it.
- Nginx runtime listens on container port `8080`.
- Nginx proxy `/api/` goes to `http://backend:8000/api/`.
- Backend Docker runs as user `tradingagent`.
- Backend cache path in Docker is `/home/tradingagent/.tradingagents/cache`.
- Do not use `VITE_*` for backend secrets.

## Environment Files

Allowed template:

```text
backend/.env.example
```

Current repo does not have:

```text
frontend/.env.example
backtest/.env.backtest.example
```

Do not commit:

```text
.env
.env.*
backend/.env
frontend/.env
*.sqlite3
*.sqlite
*.db
.cache/
backend/.cache/
frontend/node_modules/
frontend/dist/
frontend/coverage/
```

## Naming

| Area | Convention |
|---|---|
| Python file | `snake_case.py` |
| Python class | `PascalCase` |
| Python function | `snake_case` |
| React component | `PascalCase.jsx` |
| Hook file | `camelCase.js`, starts with `use` |
| Utility JS | `camelCase.js` |
| Backend env | `UPPER_SNAKE_CASE` |
| Frontend env | `VITE_UPPER_SNAKE_CASE` |

## Do Not

- Do not hardcode API URL in React components.
- Do not expose backend secrets through `VITE_*`.
- Do not bypass `normalize_and_validate_analysis_request()`.
- Do not change SSE format without backend, frontend, tests, and docs.
- Do not remove `SkipSseCompressionMiddleware`.
- Do not set response schema `extra="forbid"`.
- Do not add dependency before checking existing dependency set.
- Do not add production `print()` or `console.log()`.
- Do not run live vendor/LLM tests as unit tests.
- Do not claim old US/ID-only validation. Backend now accepts broader
  yfinance canonical markets.

