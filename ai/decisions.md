# Technical Decisions

Terakhir disinkronkan: 2026-06-15.

Dokumen ini mencatat keputusan teknis yang membentuk kode aktif.

## ADR-001: Process Pool untuk Pipeline

Decision: Backend menjalankan pipeline agent di `ProcessPoolExecutor`.

Reason:

- Pipeline memakai LangGraph, LangChain, provider SDK, yfinance, dan blocking
  calls.
- FastAPI event loop harus tetap responsif.
- Spawn context aman untuk Windows dan Docker.
- `PROCESS_POOL_MAX_TASKS_PER_CHILD=1` membersihkan state provider setelah task.

Implication:

- Jangan panggil pipeline blocking langsung dari route.
- Gunakan `backend/routes/pipeline_runner.py`.
- Cancellation lewat cancel event, bukan kill process manual.

## ADR-002: Job API Menjadi Flow Canonical

Decision: Frontend utama memakai:

```text
POST /api/analysis/jobs
GET  /api/analysis/jobs/{job_id}/events
GET  /api/analysis/jobs/{job_id}
DELETE /api/analysis/jobs/{job_id}
```

Reason:

- Analysis bisa lama.
- User perlu progress dan cancel.
- Result perlu bisa dibuka ulang.
- Job store punya event replay dan terminal result.

Implication:

- `/api/analyze` dan `/api/analyze/stream` legacy.
- Fitur frontend baru pakai job API.
- Report canonical memakai `job_id`.

## ADR-003: SSE, Bukan WebSocket

Decision: Progress memakai Server-Sent Events.

Reason:

- Data bergerak server to browser.
- SSE lebih sederhana.
- `fetch()` stream bisa membawa cookie dan custom header.

Implication:

- Native `EventSource` tidak dipakai.
- SSE route tidak boleh dikompresi.
- Event format harus sinkron dengan frontend hooks.

## ADR-004: Owner Session Cookie untuk Resource Isolation

Decision: Browser mendapatkan signed owner session dari `POST /api/session`,
disimpan sebagai cookie HttpOnly `ta_owner_token`.

Reason:

- API key adalah service credential, bukan identitas browser.
- Owner session membatasi job, history, report, rate limit, dan stream per
  browser session.
- Cookie HttpOnly mengurangi risiko token dibaca JavaScript.

Implication:

- Frontend harus memakai `credentials: 'include'`.
- `buildAuthHeaders()` tidak perlu mengirim `x-owner-token`.
- Backend tetap menerima `x-owner-token` untuk tests dan legacy client.
- Production wajib `OWNER_SESSION_SECRET`.

## ADR-005: Service Credential Terpisah dari Owner Session

Decision: `API_KEY` dipakai sebagai service/proxy credential. Owner identity
tetap dari owner session.

Reason:

- Nginx atau reverse proxy bisa menyisipkan API key server-side.
- Browser tidak boleh melihat API key.
- Rate/resource ownership harus per session, bukan per shared API key.

Implication:

- Jangan taruh `API_KEY` di `VITE_*`.
- Protected endpoint memanggil `limit_request()`.
- Docker nginx memakai `BACKEND_API_KEY` untuk `x-api-key` jika diperlukan.

## ADR-006: SQLite untuk Runtime Storage

Decision: Job cache, analysis history, market cache, news cache, rate limit, dan
LLM cache memakai SQLite/local shared volume.

Reason:

- Project personal/single-host.
- Tidak butuh service DB tambahan.
- Docker volume cukup untuk persistence.

Implication:

- Jangan tambah PostgreSQL atau migration framework tanpa kebutuhan nyata.
- Repository layer harus handle schema changes.
- `.sqlite3`, `.sqlite`, `.db`, dan `.cache/` tidak boleh commit.

## ADR-007: Vite Proxy untuk Local API

Decision: Vite dev server punya proxy `/api`.

Reason:

- Frontend default API base `/api`.
- Same-origin browser path lebih sederhana untuk cookie owner session.
- Compose frontend bisa proxy ke `backend:8000`.
- Host local bisa proxy ke `localhost:8000` lewat env.

Implication:

- Local host dev perlu `VITE_BACKEND_PROXY_TARGET=http://localhost:8000`.
- `VITE_API_BASE_URL=/api` adalah default.
- Direct backend URL masih bisa dipakai, tetapi proxy lebih stabil untuk cookie.

## ADR-008: Primary UI Route `/AI-Research`

Decision: Analysis UI route aktif adalah `/AI-Research`.

Reason:

- UI product naming berubah.
- Legacy `/analysis` tetap ada untuk backlink/history lama.

Implication:

- New links use `/AI-Research`.
- Keep redirects from `/analysis`, `/analysis-live`, and mock aliases.
- History/resource links should use `AI_RESEARCH_PATH`.

## ADR-009: Unified `LLM_API_KEY`

Decision: `LLM_API_KEY` adalah key utama untuk provider aktif.

Reason:

- Satu jalur config lebih sederhana.
- `config_llm.py` meneruskan key sebagai `api_key` ke client provider.
- Provider-specific keys tetap ada untuk compatibility.

Implication:

- Docs dan setup baru harus merekomendasikan `LLM_API_KEY`.
- Provider-specific keys boleh tetap disebut legacy/fallback.
- Startup validation memberi critical issue jika `LLM_API_KEY` kosong.

## ADR-010: Balanced Pipeline Saja untuk API Server

Decision: `ANALYSIS_MODE` dikunci ke `balanced`.

Reason:

- Frontend, serializer, report, dan tests memakai balanced result shape.
- `analysis_depth` sudah menyediakan fast/balanced/deep di dalam flow yang sama.

Implication:

- Jangan tambah mode pipeline API tanpa kontrak lengkap.
- User-facing mode adalah `analysis_depth`.

## ADR-011: Fast, Balanced, Deep Mengontrol Budget

Decision: `analysis_depth` mengatur budget LLM, retry, debate, dan risk rounds.

Defaults:

| Depth | Budget | Retries | Debate | Risk |
|---|---:|---:|---:|---:|
| `fast` | 6 | 1 | 1 | 1 |
| `balanced` | 9 | 2 | 2 | 2 |
| `deep` | 12 | 3 | 3 | 3 |

Reason:

- User bisa memilih latency/biaya.
- Result shape tetap stabil.

Implication:

- Fast mode boleh memakai fallback konservatif.
- Deep mode bisa menambah extra review.
- `max_debate_rounds` tetap divalidasi 1 sampai 5.

## ADR-012: Parallel Data dan Analysts, Sequential Decision

Decision: Data collection dan initial analysts parallel. Debate/decision
sequential.

Reason:

- Data sources independen.
- Market, news, fundamentals analyst membaca data sama.
- Bull/bear/manager/trader/risk/portfolio bergantung output tahap sebelumnya.

Implication:

- Jangan buat dependency antar initial analyst.
- Gunakan config worker yang ada: `DATA_COLLECTION_WORKERS` dan
  `ANALYST_PARALLEL_WORKERS`.

## ADR-013: Canonical Yfinance Symbol, No Auto Suffix

Decision: Ticker dikirim sebagai canonical yfinance symbol. Backend tidak lagi
menambahkan `.JK` otomatis.

Reason:

- Frontend punya yfinance search endpoint.
- Global, crypto, ETF, fund, and IDX symbols bisa dipilih sebagai canonical.
- Auto suffix bisa salah untuk symbol global atau search result.

Implication:

- User IDX harus memilih/input `BBCA.JK` jika butuh Yahoo IDX symbol.
- `market=ID` tidak mengubah `BBCA` menjadi `BBCA.JK`.
- Tests harus menjaga behavior ini.

## ADR-014: Broader Market Values Are Accepted

Decision: Backend menerima `IDX`, `ID`, `US`, `GLOBAL`, `CRYPTO`, `ETF`,
`FUND`, dan `UNKNOWN`.

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
- Give user symbol, name, exchange, type, and price.
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

## ADR-019: `extra="allow"` pada Response Schema

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

## ADR-023: Backtest Folder Is Env Template Only

Decision: `backtest/` is documented as env/config area, not runtime module.

Reason:

- Current folder has env files only.
- No backtest runner exists in audited code.

Implication:

- Do not document backtest command until runner exists.
- Do not read or commit `backtest/.env.backtest`.
