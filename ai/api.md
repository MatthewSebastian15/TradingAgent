# API Reference

Last synced: 2026-06-19.

All app routes use the `/api` prefix, except `/health`.

## Base URL

| Mode | Browser URL | API path |
|---|---|---|
| Local backend direct | `http://localhost:8000` | `http://localhost:8000/api/*` |
| Local Vite proxy | `http://127.0.0.1:3000` | `/api/*` proxied to backend |
| Docker Compose | `http://localhost:3000` | `/api/*` proxied to `backend:8000` |
| Frontend nginx runtime | host mapped to container `8080` | `/api/*` proxied by nginx |

Frontend builds URL through `frontend/src/utils/api.js`.

Env precedence:

```text
VITE_API_BASE_URL
VITE_API_URL
default /api
```

`buildApiUrl(path)` always returns a path under `/api`. If base ends with
`/api`, it avoids double prefix.

## Authentication

### Service Credential

Accepted headers:

```http
x-api-key: <API_KEY>
Authorization: Bearer <API_KEY>
```

Rules:

- If `API_KEY` is set, request must provide matching credential.
- If `REQUIRE_API_KEY_FOR_RATE_LIMIT=true`, request must provide credential.
- Production requires `API_KEY` and rejects
  `REQUIRE_API_KEY_FOR_RATE_LIMIT=false`.
- Do not expose `API_KEY` through `VITE_*`.

### Owner Session

Create or refresh browser owner session:

```http
POST /api/session
```

Response:

```json
{
  "owner_token": "payload.signature",
  "expires_at": 1760000000
}
```

The response also sets:

```text
Set-Cookie: ta_owner_token=...; HttpOnly; SameSite=Lax; Path=/api
```

Frontend uses cookie through `credentials: 'include'`. It stores only expiry in
`sessionStorage` key `_ta_owner_session_expires_at`.

Backend protected endpoints accept owner token from:

```http
x-owner-token: <owner_token>
```

or cookie:

```http
Cookie: ta_owner_token=<owner_token>
```

## Error Envelope

Typed errors use:

```json
{
  "request_id": "req_...",
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid analysis request.",
    "details": {
      "fields": {
        "ticker": "Ticker must be a canonical yfinance symbol."
      }
    }
  }
}
```

Common codes:

| HTTP | Code |
|---:|---|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 404 | `NOT_FOUND` or `HTTP_ERROR` |
| 422 | `VALIDATION_ERROR` |
| 429 | `RATE_LIMITED` |
| 500 | `PIPELINE_FAILED` |
| 504 | `PIPELINE_TIMEOUT` |

Handlers sanitize secrets and filesystem paths.

## Health and Status

### GET /health

No `/api` prefix.

Response:

```json
{
  "status": "ok",
  "provider": "google",
  "report_assets": {
    "template": true,
    "stylesheet": true
  }
}
```

### GET /api/status

Protected. Uses status rate policy.

Response fields:

```text
provider
quick_model
deep_model
analysis_mode
default_analysis_depth
limits
result_cache
in_flight
jobs
tool_cache
llm_cache
circuits
timeout_workers
```

## Session

### POST /api/session

Creates or reuses signed owner session.

Request body: empty.

Headers:

```http
Accept: application/json
```

Add service credential only when backend requires it.

Behavior:

- If valid owner header/cookie exists, returns same session.
- If missing or invalid, creates a new owner session.
- Sets `ta_owner_token` cookie.

## Analysis Request

Model: `backend/routes/validation.py::AnalysisRequest`.

Example:

```json
{
  "ticker": "BBCA.JK",
  "market": "IDX",
  "trade_date": "2026-06-16",
  "time_horizon_months": 1,
  "max_debate_rounds": 3,
  "analysis_depth": "balanced",
  "response_detail": "full",
  "has_existing_position": false,
  "position_quantity": null,
  "average_entry_price": null,
  "search_metadata": {
    "canonical": "BBCA.JK",
    "symbol": "BBCA.JK",
    "source": "yfinance"
  }
}
```

Fields:

| Field | Type | Rule |
|---|---|---|
| `ticker` | string | Required unless alias `symbol` is used. Max 64. |
| `symbol` | string | Alias for `ticker`. |
| `input_ticker` | string/null | Original input, optional. |
| `trade_date` | string | `YYYY-MM-DD`, max 1 day in future. |
| `time_horizon_months` | int | `1`, `2`, or `3`. |
| `max_debate_rounds` | int | `1` to `5`. |
| `analysis_depth` | string | `fast`, `balanced`, `deep`. |
| `response_detail` | string | `summary`, `full`, `debug`. |
| `market` | string/null | `IDX`, `ID`, `US`, `GLOBAL`, `CRYPTO`, `ETF`, `FUND`, `UNKNOWN`. |
| `search_metadata` | object/null | Canonical search metadata from frontend. |
| `has_existing_position` | bool/null | Enables position-aware decision. |
| `position_quantity` | float/null | `>= 0` if provided. |
| `average_entry_price` | float/null | `>= 0` if provided. |

Ticker rules:

- Regex: `^[A-Z0-9]{1,15}(?:[.-][A-Z0-9]{1,10}){0,2}$`
- Values are uppercased.
- `search_metadata.canonical`, `symbol`, or `ticker` wins over raw ticker.
- Plain IDX ticker is not auto-suffixed.
- `market=ID` does not append `.JK`.
- Use `/api/market/search` to get canonical yfinance symbols.
- Global suffixes such as `.HK`, `.T`, `.DE` are accepted if regex passes.

## Canonical Analysis Job API

### POST /api/analysis/jobs

Creates cancellable job.

Headers:

```http
Content-Type: application/json
```

Cookie carries owner session.

Response:

```json
{
  "job_id": "0c2c4f50-7ac1-41d7-9efe-22b824fb8745",
  "request_id": "req_...",
  "status": "queued",
  "events_url": "/api/analysis/jobs/0c2c4f50-7ac1-41d7-9efe-22b824fb8745/events"
}
```

Status values:

```text
queued, running, completed, failed, cancelled
```

Rate policy: stream.

### GET /api/analysis/jobs/{job_id}

Returns job summary. Owner must match.

If job is not active, backend tries persisted job cache and SQLite history.

Response:

```json
{
  "job_id": "0c2c4f50-7ac1-41d7-9efe-22b824fb8745",
  "request_id": "req_...",
  "status": "completed",
  "created_at": 1760000000.1,
  "updated_at": 1760000120.2,
  "payload": {},
  "result": {},
  "error": null
}
```

### GET /api/analysis/jobs/{job_id}/events

SSE stream. Owner must match.

Headers:

```http
Accept: text/event-stream
Cache-Control: no-cache
```

Events:

| Event | Payload |
|---|---|
| `job` | Public job summary on connect. |
| `progress` | Agent progress. |
| `heartbeat` | Keep-alive every idle 15 seconds. |
| `result` | Final analysis result, stream ends. |
| `error` | Error envelope, stream ends. |

Progress payload:

```json
{
  "request_id": "req_...",
  "ticker": "BBCA.JK",
  "trade_date": "2026-06-16",
  "agent_id": "market_analyst",
  "agent_name": "Market Analyst",
  "status": "started",
  "status_message": "Market Analyst is reading price action and technical indicators...",
  "timestamp": "2026-06-16T09:00:00Z"
}
```

Agent ids:

```text
data_collection
news_fetch
data_quality
market_analyst
news_analyst
fundamentals
bull_researcher
bear_researcher
research_manager
trader
risk_analysts
portfolio_manager
```

### DELETE /api/analysis/jobs/{job_id}

Cancels queued/running job.

Response is `AnalysisJobSummaryResponse`.

Error payload for cancellation:

```json
{
  "request_id": "req_...",
  "error": {
    "code": "ANALYSIS_CANCELLED",
    "message": "Analysis was cancelled by the client."
  }
}
```

## Legacy Analysis API

### POST /api/analyze

Runs analysis and returns JSON after completion.

Uses validation, preflight, process pool, result cache, in-flight dedupe, and
SQLite history.

### POST /api/analyze/stream

Legacy SSE. Streams progress/result/error without job API.

### GET /api/analysis/{request_id}

Deprecated hidden alias. Looks up active job by request id, then SQLite history.

### DELETE /api/analysis/{job_id}

Deprecated hidden cancel alias.

## Analysis Response

Stable schema: `backend/schemas.py::AnalysisResponse`.

`ApiSchema` uses `extra="allow"` so pipeline can add fields.

Core fields:

```text
request_id
job_id
ticker
market
trade_date
analysis_created_at
analysis_depth
response_detail
time_horizon_months
has_existing_position
position_quantity
average_entry_price
agents_used
analysis_overview
key_reasons_paragraph
financial_highlights
normalized_period_rows
derived_fundamentals
financial_trends
valuation_multiples
fair_value_range
scenario_analysis
quality_of_earnings
balance_sheet_risk
dividend_quality
peer_comparison
company_profile
price_chart
price_performance
technical_entry
related_news
news_impact
catalyst_tracker
analyst_consensus
news
news_context
risk_data_quality
```

Pipeline also returns debug/budget/source fields when available:

```text
company_of_interest
time_horizon
market_report
sentiment_report
news_report
fundamentals_report
investment_debate_state
investment_plan
trader_investment_plan
risk_debate_state
portfolio_decision
data_quality
data_sources
data_limitations
limitations
field_sources
validation_summary
warnings
vendor_attempts
request_budget
vendor_budget
data_freshness
data_completeness
fundamental_gap_report
data_fetched_at
last_close_price
last_close_price_as_of
last_close_price_source
price_source
price_timestamp
price_is_fallback
analysis_depth_config
analysis_depth_debate_rounds
analysis_depth_risk_rounds
balanced_gemini_request_budget
balanced_gemini_calls_used
llm_call_budget
llm_calls_used
budget_exhausted
agents_skipped
agent_pipeline
total_pipeline_seconds
is_partial
partial_reason
completed_stages
missing_stages
partial_signal
partial_confidence
available_data
```

## History API

SQLite repository: `backend/services/analysis_repository.py`.

Default path: `.cache/analysis_history.sqlite3`.

### GET /api/analysis/history

Query:

| Field | Rule |
|---|---|
| `ticker` | Optional exact uppercase filter. |
| `limit` | 1 to 100, default `ANALYSIS_HISTORY_DEFAULT_LIMIT` or 25. |

Response:

```json
{
  "items": []
}
```

### GET /api/analysis/history/{request_id}

Returns full result JSON.

### DELETE /api/analysis/history/{request_id}

Deletes one snapshot.

### DELETE /api/analysis/history

Deletes all history rows.

## Market API

### GET /api/market/presets

Returns categories and exchange presets used by Market page.

Response fields:

```text
categories
exchanges
```

### GET /api/market/validate-symbol

Query:

| Field | Rule |
|---|---|
| `symbol` | Required yfinance symbol. |

Response:

```text
symbol
valid
label
source
reason
```

### POST /api/market/overview

Request:

```json
{
  "symbols": ["^GSPC", "^IXIC", "^JKSE"]
}
```

Rules:

- `symbols` must be array.
- After normalization/dedupe, min 3 and max 6 symbols.
- Each symbol must be canonical yfinance quote syntax.

Response:

```text
items[]
  symbol
  label
  last
  change
  change_percent
  currency
  sparkline
  status
  updated_at
  reason
message
```

### GET /api/market/movers

Query:

| Field | Rule |
|---|---|
| `country` | Required. |
| `exchange` | Required. |
| `limit` | One of `5`, `10`, `15`, `20`. Default 5. |

Response:

```text
country
exchange
limit
updated_at
gainers[]
losers[]
source
message
```

### GET /api/market/search

Yfinance symbol search for autocomplete.

Query:

| Field | Rule |
|---|---|
| `q` | Required, min length 2. |
| `limit` | 1 to 20, default 10. |

Response:

```json
{
  "results": [
    {
      "symbol": "BBCA.JK",
      "name": "Bank Central Asia Tbk PT",
      "exchange": "IDX",
      "type": "EQUITY",
      "market": "ID",
      "source": "local_universe",
      "price": null
    }
  ]
}
```

Local universe returns first. Remote yfinance search refresh runs in background
when local result count is below limit. Cache TTL is 60 seconds.

### GET /api/market/ohlcv

OHLCV chart data for result chart range controls.

Query:

| Field | Rule |
|---|---|
| `ticker` | Required yfinance quote symbol. |
| `range` | `YTD`, `1Y`, `6M`, `3M`, `1M`, `1W`. Default `1Y`. |
| `trade_date` | Optional `YYYY-MM-DD` upper bound. |

Response includes:

```text
available
source
ticker
range
interval
fallback_to_daily
requested_trade_date
start_date
end_date
last_trade_date
points
data
data_quality
warning
```

For `1W`, backend tries `5m`, `15m`, `30m`, `60m`, then `1d`.

### GET /api/market/sparklines

Compact close-price series for watchlist trend bars.

Query:

| Field | Rule |
|---|---|
| `symbols` | Required comma-separated yfinance quote symbols, max 20. |
| `range` | `YTD`, `1Y`, `6M`, `3M`, `1M`, `1W`. Default `1M`. |

Response:

```json
{
  "sparklines": {
    "AAPL": [190.1, 191.2, 189.7],
    "BBCA.JK": [9250.0, 9300.0, 9225.0]
  }
}
```

Behavior:

- Symbols use the same quote normalization as `/api/market/quotes`.
- Backend fetches OHLCV data and returns the last close values, capped to the
  final 20 values per symbol.
- In-process cache TTL is 300 seconds.

### GET /api/market/quotes

Ticker tape quotes.

Query:

| Field | Rule |
|---|---|
| `symbols` | Comma-separated yfinance quote symbols, max 20. |

Default symbols:

```text
ES=F,NQ=F,^VIX,DX-Y.NYB,^TNX,BTC-USD,CL=F,GC=F,^N225,^JKSE
```

Response:

```json
{
  "quotes": [
    {
      "sym": "BTC-USD",
      "chg": "+1.25%",
      "pos": true,
      "price": 65000.0,
      "volume": 1234567,
      "error": false
    }
  ]
}
```

## Ticker Validate API

### GET /api/ticker/validate

Runs validation and market-data preflight without LLM.

Query:

| Field | Rule |
|---|---|
| `ticker` | Required. |
| `trade_date` | Required `YYYY-MM-DD`. |
| `market` | Optional supported market. |

Response:

```json
{
  "ticker": "BBCA.JK",
  "trade_date": "2026-06-16",
  "valid": true,
  "message": "Ticker has usable market data."
}
```

## News API

### GET /api/news/general

General news page data.

Query:

| Field | Rule |
|---|---|
| `category` | Default `all`. |
| `window_days` | 1 to 365, default 14. |
| `limit` | 1 to 2000, default 2000 (capped at stored-article ceiling). |
| `provider` | Optional: `google_news_light`, `marketaux`, `rss_context`, `newsdata`. |
| `force_refresh` | Optional bool, default false. |

Response shape:

```text
enabled
mode
category
window_days
limit
last_updated
refresh_interval_seconds
cache
provider_status
articles_found
articles
```

### GET /api/news/general/categories

Returns category list from `general_news_categories.py`.

Current allowed categories from config:

```text
all, markets, world, finance, tech, macro, central_bank, regulatory, forex, crypto
```

### GET /api/news/general/stream

SSE updates for General News page.

Event:

```text
general_news_updated
```

Returns 404 if `general_news.enable_sse` is false.

### GET /api/news/{ticker}/stream

SSE updates for ticker-specific company news.

Query:

| Field | Rule |
|---|---|
| `window_days` | 1 to 365, default 30. |
| `limit` | 1 to 100, default 20. |
| `poll_seconds` | 30 to 900, default 120. |

Events:

| Event | Payload |
|---|---|
| `ticker_news_stream_ready` | `{ "ticker": "...", "poll_seconds": 120 }` |
| `ticker_news_updated` | Latest ticker news event from `ticker_news_event_bus`. |

Returns 404 if `general_news.enable_sse` is false.

### GET /api/news/{ticker}

Company news context used by analysis.

Query:

| Field | Rule |
|---|---|
| `window_days` | 1 to 365, default 30. |
| `limit` | 1 to 100, default 20. |

Response model: `NewsResponse`.

Important fields:

```text
enabled
ticker
company_name
window_days
providers_used
provider_status
provider_health
articles_found
articles_used_in_prompt
average_sentiment
articles
empty_reason
cache
```

### GET /api/debug/news/{ticker}

Development-only debug route.

Query:

| Field | Rule |
|---|---|
| `provider` | Optional: `google_news_light`, `marketaux`, `rss_context`, `newsdata`, `yfinance`. |
| `window_days` | 1 to 365, default 30. |
| `limit` | 1 to 100, default 20. |
| `include_raw` | Boolean, default false. |

## Frontend-Only Watchlist API Usage

No backend watchlist CRUD API exists right now.

The `/watchlist` page stores groups in browser localStorage:

```text
tradingagents:watchlists:v1
```

It uses existing market endpoints:

```text
GET /api/market/search
GET /api/market/validate-symbol
GET /api/market/quotes
GET /api/market/sparklines
```

## Reports API

### GET /api/reports/disclaimer

Returns canonical report disclaimer.

```json
{
  "disclaimer": "This analysis report is provided..."
}
```

### GET /api/analysis/jobs/{job_id}/report.html

HTML report preview for completed job. Owner must match.

### GET /api/analysis/jobs/{job_id}/report.pdf

PDF report download for completed job. Owner must match.

Headers:

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="TradingAgent_....pdf"
Cache-Control: no-store
```

### POST /api/analysis/report.html

Fallback HTML render from bounded result payload supplied by client.

### POST /api/analysis/report.pdf

Fallback PDF render from bounded result payload supplied by client.

Bounded payload limits:

```text
max depth 12
max list items 750
max dict keys 300
max string length 20000
max total nodes 20000
```

### GET /api/analysis/{request_id}/report.html

Deprecated hidden alias.

### GET /api/analysis/{request_id}/report.pdf

Deprecated hidden alias.

## Debug API

### GET /api/debug/llm-cache

Development only. Returns exact and semantic cache stats/config.

### GET /api/debug/health

Requires `DEBUG_ENDPOINTS_ENABLED=true`.

Returns vendor health, LLM model info, and feature flags.

### GET /api/debug/vendor/{vendor_name}

Requires `DEBUG_ENDPOINTS_ENABLED=true`.

Returns vendor capabilities and key status.

### GET /api/debug/symbol/{ticker}

Requires `DEBUG_ENDPOINTS_ENABLED=true`.

Returns canonical symbol resolution and source priority.

### GET /api/debug/metrics

Requires `DEBUG_ENDPOINTS_ENABLED=true`.

Returns observability summary.

### GET /api/debug/vendor-stats

Requires `DEBUG_ENDPOINTS_ENABLED=true`.

Returns vendor stats.

## Rate Limits and Body Limit

Defaults:

| Setting | Default |
|---|---:|
| `REQUEST_RATE_LIMIT_PER_MINUTE` | 20 |
| `STATUS_RATE_LIMIT_PER_MINUTE` | 120 |
| `STREAM_RATE_LIMIT_PER_MINUTE` | 8 |
| `MAX_CONCURRENT_REQUESTS_PER_KEY` | 2 |
| `MAX_CONCURRENT_STATUS_REQUESTS_PER_KEY` | 8 |
| `MAX_CONCURRENT_STREAMS_PER_KEY` | 1 |
| `REQUEST_BODY_MAX_BYTES` | 16777216 |

Market endpoints use a separate in-code policy:

| Scope | Limit |
|---|---:|
| `market` per minute | 180 |
| `market` concurrent | 16 |

Rate limit key is owner session, not browser IP.

## CORS

Default development origins:

```text
http://localhost:3000
http://localhost:5173
http://127.0.0.1:3000
http://127.0.0.1:5173
```

Allowed methods:

```text
GET, POST, DELETE, OPTIONS
```

Allowed headers:

```text
Accept
Cache-Control
Content-Type
Last-Event-ID
x-api-key
Authorization
x-owner-token
```

Credentials are enabled.

`CORS_ORIGINS=*` is rejected.
