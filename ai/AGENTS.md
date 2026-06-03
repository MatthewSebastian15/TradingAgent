# TradingAgent AI Context

Terakhir disinkronkan: 2026-06-03.

File ini adalah konteks utama untuk asisten AI yang bekerja di repo ini. Baca
file ini sebelum mengubah kode, dokumentasi, konfigurasi, atau test.

## Tujuan Project

TradingAgent adalah aplikasi full-stack untuk analisis saham berbasis multi-agent
LLM. Backend memakai FastAPI. Frontend memakai React dan Vite. Engine analisis
ada di package editable `backend/tradingagents-core`.

Aplikasi menerima ticker saham, market, tanggal analisis, horizon investasi,
analysis depth, jumlah debate round, dan status posisi user. Backend lalu
mengambil data pasar, menjalankan pipeline agent, dan mengembalikan keputusan
Buy, Hold, atau Sell dengan ringkasan eksekutif, thesis investasi, action plan,
risk validation, data quality, chart, berita, fundamental metrics, serta export
HTML/PDF.

Project ini adalah alat riset personal. Jangan hilangkan disclaimer dari output
yang terlihat user atau dari report.

## Runtime Port

Gunakan port ini sebagai referensi saat mengubah setup, Docker, CORS, dan URL
frontend.

| Komponen | Local dev | Docker host | Container/internal | Catatan |
|---|---:|---:|---:|---|
| Backend FastAPI | `127.0.0.1:8000` | `127.0.0.1:8000` | `0.0.0.0:8000` | `Dockerfile.backend` memakai `${PORT:-8000}`. |
| Frontend Vite | `127.0.0.1:3000` | tidak dipakai | tidak dipakai | `frontend/vite.config.js` memakai `VITE_DEV_HOST` dan `VITE_DEV_PORT`, default `127.0.0.1:3000`. |
| Frontend Nginx | tidak dipakai | `127.0.0.1:3000` | `80` | `docker-compose.yml` map `3000:80`. |
| Nginx API proxy | tidak ada di Vite dev | `/api/*` di port 3000 | `backend:8000/api/*` | Hanya aktif di Docker frontend. |
| Ollama optional | `localhost:11434` | `127.0.0.1:11434` | `ollama:11434` | Hanya aktif dengan Compose profile `ollama`. |
| Health backend | `http://127.0.0.1:8000/health` | sama | `http://localhost:8000/health` | Dipakai Docker healthcheck backend. |
| Health frontend | tidak ada di Vite | `http://127.0.0.1:3000/health` | `http://127.0.0.1/health` | Dipakai healthcheck nginx. |

Local Vite tidak punya proxy `/api`. Saat menjalankan frontend dengan `npm run
dev`, set `VITE_API_BASE_URL=http://localhost:8000`. Saat menjalankan Docker,
pakai `VITE_API_BASE_URL=/api` supaya browser memanggil origin frontend dan
nginx meneruskan request ke backend.

## Repository Layout

```text
TradingAgents/
├── ai/                           # Dokumentasi dan konteks kerja AI assistant
├── assets/                       # Screenshot dan diagram README
├── backtest/                     # Env template backtest, belum ada runner kode
├── backend/                      # FastAPI app dan tradingagents-core
│   ├── main.py                   # FastAPI app, middleware, router, lifespan
│   ├── config.py                 # Facade config. Import config dari sini
│   ├── config_defaults.py        # Port, CORS, timeout, rate limit, cache
│   ├── config_llm.py             # Provider/model LLM dan config pipeline
│   ├── config_validation.py      # Startup validation
│   ├── analysis_cache.py         # Result cache, in-flight dedupe, job store
│   ├── rate_limiter.py           # API key, owner token, quota request/SSE
│   ├── owner_session.py          # Signed browser owner token
│   ├── routes/                   # HTTP API, SSE, job, report, market, news
│   ├── services/                 # SQLite history dan report service
│   ├── tests/                    # Backend pytest suite
│   ├── templates/reports/        # Jinja2 HTML report
│   ├── static/reports/           # CSS report
│   ├── scripts/                  # Dev utility scripts
│   └── tradingagents-core/       # Editable package engine agent
└── frontend/
    ├── vite.config.js            # Vite host/port
    ├── nginx.conf                # Docker nginx dan proxy /api
    ├── package.json              # React/Vite scripts
    ├── dev/mockData.js           # Mock fixture dev-only
    └── src/
        ├── App.jsx               # Frontend routes
        ├── domain/               # analysisContract.js
        ├── hooks/                # useAnalysisJob, useMockAnalysisJob
        ├── components/           # UI components
        ├── pages/                # Dashboard, Analysis, AnalysisMock
        └── utils/                # API, SSE parser, reports, history
```

## Stack Aktif

| Area | Teknologi |
|---|---|
| Backend runtime | Python 3.11 di Docker, core mendukung `>=3.10,<3.13` |
| Backend web | FastAPI 0.115.6, uvicorn 0.34.0, sse-starlette 3.0.3 |
| Report | Jinja2 3.1.6, WeasyPrint 63.1 |
| Agent engine | LangGraph, LangChain, package `tradingagents` versi 0.2.4 |
| LLM provider | Google, OpenAI, Anthropic, DeepSeek, OpenRouter, Ollama |
| Market data | yfinance, Finnhub, Alpha Vantage |
| News data | MarketAux, NewsData.io, yfinance fallback, optional Finnhub/Alpha Vantage |
| Frontend | React 18.3.1, React Router 6.28.0, Vite 8.0.13 |
| Frontend style | Tailwind CSS 3.4.17, Bloomberg-style tokens |
| Frontend test | Vitest 4.1.7, Testing Library |
| Docker frontend | Node 22 build stage, nginx 1.27 runtime |
| Persistence | SQLite files under `.cache` locally, Docker volume in Compose |

## Flow Utama Saat Ini

Flow canonical memakai job API.

```text
Browser
  -> POST /api/session
  <- owner_token

Browser
  -> POST /api/analysis/jobs
  <- { job_id, request_id, status, events_url }

Browser
  -> GET /api/analysis/jobs/{job_id}/events
  <- SSE: job, progress, heartbeat, result, error

Browser
  -> GET /api/analysis/jobs/{job_id}
  <- status, payload, result, error

Browser
  -> GET /api/analysis/jobs/{job_id}/report.html
  -> GET /api/analysis/jobs/{job_id}/report.pdf
```

`POST /api/analyze` dan `POST /api/analyze/stream` masih ada sebagai endpoint
legacy. Jangan jadikan endpoint legacy sebagai flow frontend baru.

## Auth dan Owner Session

Backend memakai dua konsep credential.

| Credential | Header | Fungsi | Sumber |
|---|---|---|---|
| Service credential | `x-api-key` atau `Authorization: Bearer <key>` | Membuktikan request datang dari service/proxy yang sah | `API_KEY` di backend |
| Browser owner token | `x-owner-token` | Membatasi job, cancel, SSE, report, dan rate limit per owner session | `POST /api/session` |

Di local development, `API_KEY` boleh kosong dan `REQUIRE_API_KEY_FOR_RATE_LIMIT=false`.
Dalam kondisi itu, `POST /api/session` tetap bisa membuat owner token. Di
production, set `API_KEY`, `OWNER_SESSION_SECRET`, dan aktifkan API key
enforcement.

Frontend menyimpan owner token di `sessionStorage` dengan key
`_ta_owner_token`. Token dipakai oleh `frontend/src/utils/api.js` untuk semua
request yang membutuhkan `x-owner-token`.

## Frontend Routes

| Route | Status | Fungsi |
|---|---|---|
| `/` | active | Redirect ke `/home`. |
| `/home` | active | Dashboard, ticker tape, system status, agent overview. |
| `/analysis` | active | Form analisis dan result workspace. |
| `/analysis/:resourceId` | active | Lookup job, request alias, lalu history fallback. |
| `/analysis-live` | active alias | Redirect ke `/analysis`. |
| `/analysis.test` | gated | Mock UI saat `VITE_ENABLE_MOCK=true`. |
| `/analysis.test/:resourceId` | gated | Mock result lookup. |
| `/analysis-mock` | gated alias | Redirect ke `/analysis.test`. |
| `*` | active | 404 page. |

Mock route tidak ikut production build normal jika `VITE_ENABLE_MOCK` tidak
bernilai `true`.

## Market Support

Backend saat ini hanya mendukung market `US` dan `ID`.

| Market | Input user | Normalisasi backend |
|---|---|---|
| `US` | `AAPL`, `NVDA`, `MSFT` | Uppercase, tanpa exchange suffix global. |
| `ID` | `BBCA`, `BBRI`, `TLKM`, `BBCA.JK` | Plain IDX code diubah ke `.JK`. |

Ticker dengan suffix non-ID seperti `.HK`, `.T`, `.DE`, `.L`, `.AX`, dan `.TO`
ditolak oleh `backend/routes/validation.py`. Jika UI menampilkan contoh market
lain, anggap itu teks stale sampai frontend diperbaiki.

## Pipeline Agent

Pipeline canonical ada di `backend/tradingagents-core/tradingagents/pipeline_balanced*.py`.

```text
Data Collection
  -> Data Quality
  -> Market Analyst, News + Social Analyst, Fundamentals Analyst
  -> Bull Researcher
  -> Bear Researcher
  -> Research Manager
  -> Trader
  -> Risk Analysts
  -> Portfolio Manager
```

Detail eksekusi:

| Tahap | Mode eksekusi | Detail |
|---|---|---|
| Preflight | process pool | Cek data harga sebelum LLM dipanggil. |
| Data collection | thread pool | Mengambil price, fundamentals, statements, news, sentiment, event risk, recommendation, insider, profile, chart, technical entry. |
| Analyst awal | thread pool | Market, news, dan fundamentals jalan paralel. |
| Debate dan decision | sequential | Bull, bear, manager, trader, risk, portfolio saling memakai output sebelumnya. |
| `fast` | reduced | Bull/bear dan risk committee dibuat lewat fallback konservatif, bukan full debate. |
| `balanced` | default | Budget 9 LLM call. |
| `deep` | extended | Budget 12 LLM call, extra debate/risk round jika tersedia. |

Progress SSE memakai event `progress` dengan field `agent_id`, `agent_name`,
`status`, `status_message`, `timestamp`, `request_id`, `ticker`, dan `trade_date`.

## File Penting

| Kebutuhan | File |
|---|---|
| FastAPI app dan middleware | `backend/main.py` |
| Config canonical | `backend/config.py` |
| Default port, CORS, timeout, cache | `backend/config_defaults.py` |
| LLM provider/model config | `backend/config_llm.py` |
| Startup validation | `backend/config_validation.py` |
| Request schema dan validation | `backend/routes/validation.py` |
| Public response schema | `backend/schemas.py` |
| Job API dan legacy analyze | `backend/routes/analysis.py` |
| Job lifecycle helper | `backend/routes/jobs.py` |
| SSE helper | `backend/routes/sse.py` |
| Worker bridge | `backend/routes/pipeline_runner.py` |
| Error envelope | `backend/errors.py` |
| Rate limit dan auth | `backend/rate_limiter.py` |
| Owner token | `backend/owner_session.py` |
| SQLite history | `backend/services/analysis_repository.py` |
| Report HTML/PDF | `backend/services/report_service.py` |
| Frontend API helper | `frontend/src/utils/api.js` |
| Frontend SSE parser | `frontend/src/utils/sse.js` |
| Real analysis hook | `frontend/src/hooks/useAnalysisJob.js` |
| Request contract mirror | `frontend/src/domain/analysisContract.js` |
| Report client | `frontend/src/utils/reportApi.js` |
| Docker nginx proxy | `frontend/nginx.conf` |

## Jangan Ubah Sembarangan

Periksa dampak sebelum mengubah file berikut.

| File | Risiko |
|---|---|
| `backend/schemas.py` | Kontrak response publik. Frontend membaca field stabil dari sini. |
| `frontend/src/domain/analysisContract.js` | Mirror kontrak request dan konstanta frontend. |
| `backend/routes/validation.py` | Gerbang validasi sebelum pipeline mahal berjalan. |
| `backend/rate_limiter.py` | Auth, owner session, rate limit, dan resource isolation. |
| `backend/routes/sse.py` | Format SSE. Harus sinkron dengan `useAnalysisJob.js`. |
| `backend/tradingagents-core/pyproject.toml` | Versi package dan dependency engine. |
| `frontend/nginx.conf` | Proxy `/api` dan header `x-api-key` Docker. |
| `backend/.env.example` | Referensi canonical env backend. |
| `frontend/.env.example` | Referensi canonical env frontend. |

## Aturan Kerja Cepat

- Import backend config dari `config.py`, bukan langsung dari `config_defaults.py`
  atau `config_llm.py`, kecuali file config sendiri memang membutuhkannya.
- Import engine sebagai `from tradingagents...`, bukan `from backend...`.
- Jangan commit `.env`, `.env.*`, `backtest/.env.backtest`, cache, database,
  hasil build, atau secret.
- Jangan hardcode URL backend di komponen React. Pakai `buildApiUrl()` dari
  `frontend/src/utils/api.js`.
- Untuk local Vite, set `VITE_API_BASE_URL=http://localhost:8000`.
- Untuk Docker frontend, set `VITE_API_BASE_URL=/api`.
- Jangan ubah format SSE tanpa update backend dan frontend sekaligus.
- Jangan hapus disclaimer dari report atau UI output.
- Unit test tidak boleh memanggil yfinance, Finnhub, vendor news, atau LLM live.
- Jika mengubah request/response analisis, update `backend/schemas.py`,
  `backend/routes/validation.py`, `frontend/src/domain/analysisContract.js`,
  test backend, dan test frontend yang terkait.

## Dokumen ai/

| File | Isi |
|---|---|
| `AGENTS.md` | Konteks utama untuk AI assistant. |
| `architecture.md` | Arsitektur, boundary modul, flow data, cache, Docker. |
| `api.md` | Referensi endpoint aktual dan kontrak request/response. |
| `setup.md` | Cara menjalankan local, Docker, test, port, env lengkap. |
| `conventions.md` | Aturan coding, testing, env, frontend, backend. |
| `decisions.md` | Keputusan teknis dan alasan desain. |
