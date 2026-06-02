# API Reference

All HTTP endpoints exposed by the FastAPI backend. Use this as the source of
truth when building new frontend features, writing tests, or modifying routes.

---

## Base URL

Development: `http://localhost:8000`
Production: configured via `VITE_API_URL` on the frontend

All endpoints are prefixed with `/api/` except `/health`.

---

## Authentication

Local development: no authentication required by default.

Production (optional): pass `x-api-key: <API_KEY>` header. Enable via:
```
API_KEY=your-secret-key
REQUIRE_API_KEY_FOR_RATE_LIMIT=true
```

---

## Analysis Endpoints

### POST /api/analyze

Submit a new analysis job. Returns a job ID immediately. The actual analysis
runs asynchronously in a process pool worker.

**Request Body**
```json
{
  "ticker": "BBCA",
  "trade_date": "2025-06-01",
  "market": "ID",
  "time_horizon_months": 1,
  "max_debate_rounds": 3,
  "analysis_depth": "balanced",
  "response_detail": "full",
  "has_existing_position": false,
  "position_quantity": null,
  "average_entry_price": null
}
```

| Field | Type | Required | Valid Values | Notes |
|---|---|---|---|---|
| `ticker` | string | yes | e.g. `BBCA`, `BBCA.JK`, `AAPL` | IDX tickers auto-get `.JK` suffix |
| `trade_date` | string | yes | `YYYY-MM-DD` | Not more than 1 day in the future |
| `market` | string | no | `US`, `ID` | Helps ticker normalization |
| `time_horizon_months` | int | no | `1`, `2`, `3` | Default: `1` |
| `max_debate_rounds` | int | no | `1`-`5` | Default: `3` |
| `analysis_depth` | string | no | `fast`, `balanced`, `deep` | Default: `balanced` |
| `response_detail` | string | no | `summary`, `full`, `debug` | Default: `full` |
| `has_existing_position` | bool | no | `true`, `false` | Default: `false` |
| `position_quantity` | float | no | `>= 0` | Shares held |
| `average_entry_price` | float | no | `>= 0` | Cost basis per share |

**Response 202**
```json
{
  "job_id": "abc123",
  "status": "queued"
}
```

**Error Responses**
- `400` - invalid request body (ticker format, date, range violations)
- `429` - rate limit exceeded
- `503` - job queue full

---

### GET /api/analysis/jobs/{job_id}

Get current job status and result (if completed).

**Response 200**
```json
{
  "job_id": "abc123",
  "status": "completed",
  "ticker": "BBCA.JK",
  "trade_date": "2025-06-01",
  "created_at": "2025-06-01T10:00:00Z",
  "completed_at": "2025-06-01T10:03:00Z",
  "result": { ... }
}
```

Status values: `queued`, `running`, `completed`, `failed`, `cancelled`

---

### GET /api/analysis/jobs/{job_id}/events

SSE stream for real-time job progress and final result.

**Headers**
- `Accept: text/event-stream`
- `Last-Event-ID: <event_id>` (optional, for reconnection replay)

**Event Types**

```
event: agent_start
data: {"agent": "MarketAnalyst", "timestamp": "..."}

event: agent_done
data: {"agent": "MarketAnalyst", "timestamp": "..."}

event: result
data: { ... full analysis result ... }

event: error
data: {"message": "human-readable error", "code": "PIPELINE_FAILED"}

event: heartbeat
data: {}
```

---

### GET /api/analyze/status

Check if the service is accepting analysis requests.

**Response 200**
```json
{
  "status": "ok",
  "active_jobs": 1,
  "queue_capacity": 32
}
```

---

### POST /api/analyze/cancel/{job_id}

Cancel a running or queued job.

**Response 200**
```json
{ "cancelled": true }
```

---

## Analysis History

### GET /api/analysis/history

List past completed analyses stored in SQLite.

**Query Parameters**
- `limit` (int, default 25, max 100)
- `offset` (int, default 0)
- `ticker` (string, optional filter)

**Response 200**
```json
{
  "items": [
    {
      "id": "abc123",
      "ticker": "BBCA.JK",
      "trade_date": "2025-06-01",
      "signal": "BUY",
      "confidence": 0.82,
      "created_at": "2025-06-01T10:03:00Z"
    }
  ],
  "total": 42,
  "limit": 25,
  "offset": 0
}
```

---

### GET /api/analysis/history/{id}

Get full result for a specific historical analysis.

---

### DELETE /api/analysis/history/{id}

Delete a historical analysis record.

---

## Market Data

### GET /api/market/quote/{ticker}

Live price quote for a ticker.

**Response 200**
```json
{
  "ticker": "BBCA.JK",
  "price": 9250.0,
  "change": 50.0,
  "change_pct": 0.54,
  "volume": 18500000,
  "market_cap": null,
  "as_of": "2025-06-01T09:00:00Z"
}
```

---

## News

### GET /api/news/{ticker}

Recent news articles for a ticker.

**Query Parameters**
- `limit` (int, default 10)

**Response 200**
```json
{
  "ticker": "BBCA.JK",
  "articles": [
    {
      "title": "...",
      "url": "...",
      "source": "marketaux",
      "published_at": "2025-06-01T08:00:00Z",
      "sentiment": "positive",
      "relevance_score": 0.85
    }
  ]
}
```

---

## Reports

### GET /api/reports/{job_id}.html

HTML report for a completed analysis.

### GET /api/reports/{job_id}.pdf

PDF report for a completed analysis (rendered via WeasyPrint).

---

## Session

### GET /api/session

Check current session / owner token validity.

### POST /api/session/refresh

Refresh the owner session token.

---

## Health

### GET /health

Liveness probe. Used by Docker healthcheck.

**Response 200**
```json
{
  "status": "ok",
  "provider": "google"
}
```

---

## Error Response Shape

All errors follow this envelope:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid analysis request.",
  "details": {
    "fields": {
      "ticker": "Ticker must be a supported US or Indonesian symbol.",
      "trade_date": "Trade date must use YYYY-MM-DD format."
    }
  }
}
```

Common error codes:
- `VALIDATION_ERROR` - bad request input
- `NOT_FOUND` - resource does not exist
- `RATE_LIMIT_EXCEEDED` - too many requests
- `PIPELINE_FAILED` - agent pipeline error
- `INTERNAL_ERROR` - unhandled server error

---

## Rate Limits

Default limits (configurable via `.env`):

| Endpoint Type | Default Limit |
|---|---|
| Analysis submit | 20 requests/minute |
| SSE streams | 8 streams/minute |
| Concurrent requests per key | 2 |
| Concurrent SSE streams per key | 1 |

Rate limit responses return HTTP 429 with a `Retry-After` header.
