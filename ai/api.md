# API Reference

Terakhir disinkronkan: 2026-06-03.

Referensi ini mengikuti route aktual di `backend/main.py` dan `backend/routes/*`.
Semua route aplikasi memakai prefix `/api`, kecuali `/health`.

## Base URL

| Mode | URL |
|---|---|
| Backend local | `http://127.0.0.1:8000` atau `http://localhost:8000` |
| Frontend local Vite | `http://127.0.0.1:3000` |
| Docker frontend | `http://localhost:3000` |
| Docker backend | `http://localhost:8000` |
| Docker nginx proxy | Browser memanggil `/api/*` di port 3000, nginx meneruskan ke `backend:8000/api/*`. |

Frontend membangun URL lewat `frontend/src/utils/api.js`.

Urutan env frontend:

1. `VITE_API_BASE_URL`
2. `VITE_API_URL` sebagai legacy alias
3. kosong, lalu helper memakai `/api`

Gunakan `VITE_API_BASE_URL=http://localhost:8000` untuk local Vite tanpa nginx.
Gunakan `VITE_API_BASE_URL=/api` untuk Docker/nginx.

## Authentication

Backend memakai service credential dan owner session.

### Service Credential

Header yang diterima:

```http
x-api-key: <API_KEY>
```

atau:

```http
Authorization: Bearer <API_KEY>
```

`API_KEY` dibaca dari backend env. Di development, `API_KEY` boleh kosong jika
`REQUIRE_API_KEY_FOR_RATE_LIMIT=false`. Di production, set `API_KEY`.

### Owner Session

Frontend mengambil owner token dengan:

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

Frontend menyimpan token di `sessionStorage` dengan key `_ta_owner_token`, lalu
mengirim token ini:

```http
x-owner-token: <owner_token>
```

Endpoint yang memakai `limit_request()` membutuhkan owner token. Ini mencakup
job API, status, history, reports, market quotes, news, ticker validate, dan
legacy analyze.

## Error Envelope

Semua error dari `backend/errors.py` memakai bentuk ini:

```json
{
  "request_id": "req_...",
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid analysis request.",
    "details": {
      "fields": {
        "ticker": "Ticker must be a supported US or Indonesian symbol."
      }
    }
  }
}
```

Kode error utama:

| HTTP | Code | Sumber |
|---:|---|---|
| 400 | `BAD_REQUEST` | Input invalid, job tidak ditemukan, ticker preflight gagal. |
| 401 | `UNAUTHORIZED` | API key atau owner token hilang/invalid/expired. |
| 404 | `NOT_FOUND` atau `HTTP_ERROR` | Resource tidak ada atau debug route tertutup. |
| 422 | `VALIDATION_ERROR` | Pydantic request body invalid. |
| 429 | `RATE_LIMITED` | Rate limit atau concurrency limit kena. |
| 500 | `PIPELINE_FAILED` | Pipeline gagal. |
| 504 | `PIPELINE_TIMEOUT` | Pipeline melewati `PIPELINE_TIMEOUT_SECONDS`. |

Backend menyensor secret dan path filesystem sebelum mengirim error ke browser.

## Health dan Status

### GET /health

Liveness probe. Tidak memakai prefix `/api`.

Response:

```json
{
  "status": "ok",
  "provider": "google"
}
```

### GET /api/status

Status runtime backend. Membutuhkan owner token.

Response berisi provider, quick model, deep model, analysis mode, default depth,
pipeline timeout, result cache, in-flight registry, job store, tool cache, LLM
cache, circuit state, dan timeout worker state.

Contoh field:

```json
{
  "provider": "google",
  "quick_model": "gemini-2.5-flash",
  "deep_model": "gemini-2.5-pro",
  "analysis_mode": "balanced",
  "default_analysis_depth": "balanced",
  "limits": {
    "pipeline_timeout_seconds": 600
  },
  "jobs": {
    "active": 1,
    "max_active": 32,
    "ttl_seconds": 28800
  }
}
```

### GET /api/debug/llm-cache

Development-only route. Aktif hanya saat `APP_ENV=development`.

Response berisi statistik exact LLM cache dan semantic cache config. Saat bukan
development, route ini mengembalikan 404.

## Session

### POST /api/session

Membuat signed browser owner token. Endpoint ini memvalidasi service credential,
lalu mengembalikan `owner_token` dan `expires_at`.

Request body kosong.

Header:

```http
Accept: application/json
```

Jika `API_KEY` aktif, kirim juga `x-api-key` atau `Authorization: Bearer`.
Jangan taruh `API_KEY` di `VITE_*`. Docker nginx bisa menyisipkan `x-api-key`
dari env `BACKEND_API_KEY`.

## Analysis Request

Model request ada di `backend/routes/validation.py`.

```json
{
  "ticker": "BBCA",
  "market": "ID",
  "trade_date": "2026-05-29",
  "time_horizon_months": 1,
  "max_debate_rounds": 3,
  "analysis_depth": "balanced",
  "response_detail": "full",
  "has_existing_position": false,
  "position_quantity": null,
  "average_entry_price": null
}
```

| Field | Type | Required | Valid value | Default | Detail |
|---|---|---|---|---|---|
| `ticker` | string | yes | `AAPL`, `NVDA`, `BBCA`, `BBCA.JK` | none | Uppercase dilakukan frontend/backend. Max 12 char di model. |
| `market` | string/null | no | `US`, `ID` | `null` | `ID` memaksa suffix `.JK`. `US` tidak menambah suffix. |
| `trade_date` | string | yes | `YYYY-MM-DD` | none | Tidak boleh lebih dari 1 hari di masa depan. |
| `time_horizon_months` | int | no | `1`, `2`, `3` | `1` | Dipakai untuk window data dan prompt horizon. |
| `max_debate_rounds` | int | no | `1` sampai `5` | `3` | Deep mode bisa memakai effective rounds yang lebih tinggi sesuai depth config. |
| `analysis_depth` | string | no | `fast`, `balanced`, `deep` | `balanced` | Mengontrol budget LLM dan debate/risk behavior. |
| `response_detail` | string | no | `summary`, `full`, `debug` | `full` | Mengontrol shaping response di serializer. |
| `has_existing_position` | bool/null | no | `true`, `false` | `false` | Mengaktifkan konteks posisi user. |
| `position_quantity` | float/null | no | `>= 0` | `null` | Dipakai jika user sudah punya posisi. |
| `average_entry_price` | float/null | no | `>= 0` | `null` | Dipakai jika user sudah punya posisi. |

Ticker rules:

| Rule | Detail |
|---|---|
| Regex umum | `^[A-Z0-9]{1,10}(?:[.-][A-Z0-9]{1,5})?$` |
| Market | Hanya `US` dan `ID`. |
| IDX auto suffix | Known IDX ticker seperti `BBCA`, `BBRI`, `TLKM`, `BMRI`, `ASII`, `GOTO`, `UNVR` diubah ke `.JK`. |
| Non-ID suffix | `.HK`, `.T`, `.DE`, `.L`, `.AX`, `.TO`, dan suffix global lain ditolak. |
| Ticker validate | `GET /api/ticker/validate` menjalankan preflight data harga sebelum LLM dipanggil. |

## Canonical Analysis Job API

### POST /api/analysis/jobs

Membuat job analisis yang bisa dibatalkan. Frontend memakai endpoint ini di
`frontend/src/hooks/useAnalysisJob.js`.

Header:

```http
Content-Type: application/json
x-owner-token: <owner_token>
```

Response:

```json
{
  "job_id": "0c2c4f50-7ac1-41d7-9efe-22b824fb8745",
  "request_id": "req_...",
  "status": "queued",
  "events_url": "/api/analysis/jobs/0c2c4f50-7ac1-41d7-9efe-22b824fb8745/events"
}
```

Status yang valid: `queued`, `running`, `completed`, `failed`, `cancelled`.

Rate policy: stream policy, karena job menahan slot stream sampai selesai.
Default `STREAM_RATE_LIMIT_PER_MINUTE=8` dan
`MAX_CONCURRENT_STREAMS_PER_KEY=1`.

Jika active job penuh, backend mengembalikan 429 dengan detail
`max_active_jobs`. Default `ANALYSIS_JOB_MAX_ACTIVE=32`.

### GET /api/analysis/jobs/{job_id}

Mengambil status job. Endpoint ini juga bisa memuat job terminal dari persistent
job cache. Jika job tidak ada di job store tetapi ada di SQLite history dengan
`job_id` yang sama, backend mengembalikan summary completed dari history.

Response:

```json
{
  "job_id": "0c2c4f50-7ac1-41d7-9efe-22b824fb8745",
  "request_id": "req_...",
  "status": "completed",
  "created_at": 1760000000.1,
  "updated_at": 1760000120.2,
  "payload": {
    "ticker": "BBCA.JK",
    "market": "ID",
    "trade_date": "2026-05-29"
  },
  "result": {
    "request_id": "req_...",
    "ticker": "BBCA.JK"
  },
  "error": null
}
```

### GET /api/analysis/jobs/{job_id}/events

Membuka stream SSE untuk progress job.

Header:

```http
Accept: text/event-stream
Cache-Control: no-cache
x-owner-token: <owner_token>
```

Event yang dikirim:

| Event | Payload |
|---|---|
| `job` | Summary job saat stream dibuka. |
| `progress` | Progress agent atau cache hit. |
| `heartbeat` | Keep-alive saat tidak ada event baru selama 15 detik. |
| `result` | Final analysis response. Stream selesai setelah event ini. |
| `error` | Sanitized error response. Stream selesai setelah event ini. |

Contoh `progress`:

```text
event: progress
data: {"request_id":"req_...","ticker":"BBCA.JK","trade_date":"2026-05-29","agent_id":"market_analyst","agent_name":"Market Analyst","status":"started","status_message":"Market Analyst is reading price action and technical indicators...","timestamp":"2026-06-03T09:00:00Z"}
```

`Last-Event-ID` sudah diizinkan oleh CORS, tetapi implementation saat ini
melakukan replay dari event history job berdasarkan sequence internal, bukan
membaca header itu sebagai cursor eksplisit.

SSE tidak boleh dikompresi. `SkipSseCompressionMiddleware` menghapus
`accept-encoding` untuk path SSE.

### DELETE /api/analysis/jobs/{job_id}

Membatalkan job yang queued atau running.

Response berupa `AnalysisJobSummaryResponse`:

```json
{
  "job_id": "0c2c4f50-7ac1-41d7-9efe-22b824fb8745",
  "request_id": "req_...",
  "status": "cancelled",
  "created_at": 1760000000.1,
  "updated_at": 1760000002.2,
  "payload": {},
  "result": null,
  "error": {
    "request_id": "req_...",
    "error": {
      "code": "ANALYSIS_CANCELLED",
      "message": "Analysis was cancelled by the client."
    }
  }
}
```

### GET /api/analysis/{request_id}

Deprecated alias. Hidden from OpenAPI docs. Dipakai frontend sebagai fallback
lookup setelah `GET /api/analysis/jobs/{id}` gagal. Route ini mencari job by
`request_id`, lalu SQLite history by `request_id`.

### DELETE /api/analysis/{job_id}

Deprecated cancel alias. Hidden from OpenAPI docs. Memanggil endpoint canonical
`DELETE /api/analysis/jobs/{job_id}`.

## Legacy Analyze API

### POST /api/analyze

Legacy endpoint JSON. Route ini tetap aktif, tetapi frontend utama tidak
memakainya.

Behavior:

- Validasi request.
- Preflight market data.
- Jalankan pipeline di process pool.
- Pakai result cache dan in-flight dedupe.
- Simpan hasil ke SQLite history.
- Return final result setelah pipeline selesai.

Response memakai `AnalysisResponse`.

### POST /api/analyze/stream

Legacy SSE endpoint. Route ini membuat pipeline streaming tanpa job API baru.
Client menerima `progress`, `heartbeat`, `result`, dan `error`.

## Analysis Response

Stable envelope ada di `backend/schemas.py`. Base schema memakai
`extra="allow"`, jadi backend boleh menambahkan field baru tanpa mematahkan
client lama.

Field stabil utama:

| Field | Type | Detail |
|---|---|---|
| `request_id` | string | Request ID dari middleware. |
| `job_id` | string | Ditambahkan pada result job API. |
| `ticker` | string | Ticker hasil normalisasi, contoh `BBCA.JK`. |
| `market` | string/null | `US` atau `ID`. |
| `trade_date` | string | Tanggal analisis. |
| `analysis_created_at` | string/null | Waktu hasil dibuat. |
| `analysis_depth` | string/null | `fast`, `balanced`, `deep`. |
| `response_detail` | string/null | `summary`, `full`, `debug`. |
| `time_horizon_months` | int/null | 1, 2, atau 3. |
| `has_existing_position` | bool/null | Konteks posisi user. |
| `position_quantity` | float/null | Jumlah posisi user. |
| `average_entry_price` | float/null | Average entry posisi user. |
| `agents_used` | list | Agent yang dipakai. |
| `analysis_overview` | object/null | Recommendation, confidence, summary, thesis, action plan, risk summary. |
| `financial_highlights` | object/null | Financial table dan point-in-time metrics. |
| `financial_trends` | object/null | Trend fundamental deterministic. |
| `valuation_multiples` | object/null | Multiples valuation. |
| `fair_value_range` | object/null | Estimasi fair value. |
| `scenario_analysis` | object/null | Scenario analysis. |
| `quality_of_earnings` | object/null | Earnings quality. |
| `balance_sheet_risk` | object/null | Balance sheet risk. |
| `dividend_quality` | object/null | Dividend quality. |
| `peer_comparison` | object/null | Peer comparison. |
| `company_profile` | object/null | Profile perusahaan. |
| `price_chart` | object/null | OHLCV chart data. |
| `price_performance` | object/null | Performance summary. |
| `technical_entry` | object/null | RSI, MACD, SMA, ATR, support/resistance. |
| `related_news` | object/null | Related news list. |
| `news_impact` | object/null | News impact scoring. |
| `catalyst_tracker` | object/null | Catalyst dan upcoming events. |
| `analyst_consensus` | object/null | Analyst rating trend jika tersedia. |
| `news` | object/null | Structured news context. |
| `news_context` | object/null | Alias structured news context. |
| `risk_data_quality` | object/null | Validasi data risk/trade level. |

## History API

History memakai SQLite repository di `backend/services/analysis_repository.py`.
Default local path dari `.env.example`: `.cache/analysis_history.sqlite3`.
Docker override: `/root/.tradingagents/cache/analysis_history.sqlite3`.

### GET /api/analysis/history

Mengambil metadata hasil analisis terbaru.

Query:

| Field | Type | Default | Rule |
|---|---|---:|---|
| `ticker` | string | none | Optional exact filter setelah uppercase. |
| `limit` | int | `25` | 1 sampai 100. |

Response:

```json
{
  "items": [
    {
      "request_id": "req_...",
      "job_id": "0c2c4f50-7ac1-41d7-9efe-22b824fb8745",
      "ticker": "BBCA.JK",
      "market": "ID",
      "trade_date": "2026-05-29",
      "time_horizon_months": 1,
      "analysis_depth": "balanced",
      "response_detail": "full",
      "decision": "Buy",
      "status": "completed",
      "created_at": "2026-06-03T09:00:00+00:00",
      "analysis_created_at": "2026-06-03T09:00:00+00:00",
      "updated_at": "2026-06-03T09:05:00+00:00"
    }
  ]
}
```

Endpoint ini tidak mendukung `offset` pada kode saat ini.

### GET /api/analysis/history/{request_id}

Mengambil full result JSON dari SQLite berdasarkan `request_id`.

### DELETE /api/analysis/history/{request_id}

Menghapus satu snapshot.

Response:

```json
{
  "deleted": true,
  "request_id": "req_..."
}
```

### DELETE /api/analysis/history

Menghapus semua snapshot SQLite.

Response:

```json
{
  "deleted": true,
  "deleted_count": 10
}
```

Frontend button `CLEAR HISTORY` memakai endpoint ini.

## Market API

### GET /api/market/quotes

Quote ringan untuk dashboard ticker tape. Data diambil lewat yfinance
`fast_info`.

Query:

| Field | Type | Default | Rule |
|---|---|---|---|
| `symbols` | string | `BBCA.JK,BBRI.JK,TLKM.JK,NVDA,AAPL,TSLA,MSFT,META,GOTO.JK,ASII.JK` | Comma-separated, max 20 simbol. |

Response:

```json
{
  "quotes": [
    {
      "sym": "BBCA.JK",
      "chg": "+0.54%",
      "pos": true,
      "price": 9250.0,
      "error": false
    }
  ]
}
```

Jika satu simbol gagal, item itu tetap dikembalikan dengan `error=true` dan
`chg="N/A"`.

Tidak ada endpoint `GET /api/market/quote/{ticker}` di kode saat ini.

## Ticker Validate API

### GET /api/ticker/validate

Melakukan validasi ticker dan preflight market data.

Query:

| Field | Required | Rule |
|---|---|---|
| `ticker` | yes | US atau IDX symbol. |
| `trade_date` | yes | `YYYY-MM-DD`. |
| `market` | no | `US` atau `ID`. |

Response:

```json
{
  "ticker": "BBCA.JK",
  "trade_date": "2026-05-29",
  "valid": true,
  "message": "Ticker has usable market data."
}
```

Preflight berjalan di process pool dan tidak memanggil LLM.

## News API

### GET /api/news/{ticker}

Mengambil structured news context dari `NewsService`.

Query:

| Field | Type | Default | Rule |
|---|---|---:|---|
| `window_days` | int | `30` | 1 sampai 365. |
| `limit` | int | `20` | 1 sampai 100. |

Response mengikuti `NewsResponse`:

```json
{
  "enabled": true,
  "ticker": "BBCA.JK",
  "company_name": "Bank Central Asia Tbk",
  "window_days": 30,
  "providers_used": ["marketaux"],
  "provider_status": {
    "marketaux": "ok"
  },
  "articles_found": 5,
  "articles_used_in_prompt": 5,
  "average_sentiment": "positive",
  "articles": [
    {
      "provider": "marketaux",
      "ticker": "BBCA.JK",
      "title": "Example headline",
      "url": "https://example.com/news",
      "summary": "Example summary",
      "source": "Example Source",
      "published_at": "2026-06-03T08:00:00Z",
      "sentiment_label": "positive",
      "relevance_score": 80
    }
  ]
}
```

### GET /api/debug/news/{ticker}

Development-only news debug route. Aktif hanya saat `APP_ENV=development`.

Query:

| Field | Required | Rule |
|---|---|---|
| `provider` | yes | `marketaux` atau `newsdata`. |
| `window_days` | no | 1 sampai 365, default 30. |
| `limit` | no | 1 sampai 100, default 20. |
| `include_raw` | no | Boolean, default false. |

Jika `provider` bukan `marketaux` atau `newsdata`, backend mengembalikan
`BAD_REQUEST`.

## Reports API

Report memakai `backend/services/report_service.py`, template
`backend/templates/reports/analysis_report.html`, CSS
`backend/static/reports/analysis_report.css`, dan WeasyPrint untuk PDF.

### GET /api/analysis/jobs/{job_id}/report.html

Preview report HTML dari completed job. Membutuhkan owner token yang sama dengan
job owner.

Content-Type:

```http
text/html; charset=utf-8
```

### GET /api/analysis/jobs/{job_id}/report.pdf

Download PDF dari completed job.

Content-Type:

```http
application/pdf
```

Header:

```http
Content-Disposition: attachment; filename="TradingAgent_....pdf"
Cache-Control: no-store
```

### POST /api/analysis/report.html

Fallback preview HTML dari payload result yang dikirim client. Frontend memakai
ini jika job store tidak lagi memiliki result tetapi result masih ada di browser
state.

### POST /api/analysis/report.pdf

Fallback PDF dari payload result yang dikirim client.

### GET /api/analysis/{request_id}/report.html

Deprecated alias. Hidden from OpenAPI docs. Lookup report memakai `request_id`.

### GET /api/analysis/{request_id}/report.pdf

Deprecated alias. Hidden from OpenAPI docs. Lookup report memakai `request_id`.

Tidak ada endpoint `/api/reports/{job_id}.html` atau
`/api/reports/{job_id}.pdf` di kode saat ini.

## Rate Limits

Default berasal dari `backend/.env.example`.

| Setting | Default |
|---|---:|
| `REQUEST_RATE_LIMIT_PER_MINUTE` | `20` |
| `STREAM_RATE_LIMIT_PER_MINUTE` | `8` |
| `MAX_CONCURRENT_REQUESTS_PER_KEY` | `2` |
| `MAX_CONCURRENT_STREAMS_PER_KEY` | `1` |
| Internal limiter idle TTL | `120` detik |
| `REQUEST_BODY_MAX_BYTES` | `65536` |

Rate limit menghitung key berdasarkan owner token, bukan IP browser. Jika API
key aktif, service credential tetap divalidasi sebelum owner token dipakai.

## CORS

Default development CORS:

```env
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173
```

Allowed methods:

```text
GET, POST, DELETE, OPTIONS
```

Allowed headers:

```text
Accept, Cache-Control, Content-Type, Last-Event-ID, x-api-key, Authorization, x-owner-token
```

`CORS_ORIGINS=*` ditolak oleh config.
