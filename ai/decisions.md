# Technical Decisions

Terakhir disinkronkan: 2026-06-03.

Dokumen ini mencatat keputusan teknis yang membentuk kode saat ini. Baca ini
sebelum mengusulkan perubahan arsitektur.

## ADR-001: Process Pool untuk Pipeline

Decision: Backend menjalankan pipeline agent di `concurrent.futures.ProcessPoolExecutor`,
bukan langsung di event loop FastAPI.

Reason:

- Pipeline memakai LangGraph, LangChain, provider SDK, dan blocking call.
- Proses terpisah menjaga FastAPI tetap responsif.
- Process pool mengurangi konflik event loop.
- Spawn context cocok untuk Windows dan Docker.
- `PROCESS_POOL_MAX_TASKS_PER_CHILD=1` membantu membersihkan state provider/LLM
  setelah satu task.

Implication:

- Jangan panggil pipeline blocking langsung dari route.
- Gunakan helper di `backend/routes/pipeline_runner.py`.
- Cancellation harus lewat cancel event, bukan kill process manual.
- Timeout utama tetap `PIPELINE_TIMEOUT_SECONDS`.

## ADR-002: Job API Menjadi Flow Canonical

Decision: Flow frontend utama memakai job API:

```text
POST /api/analysis/jobs
GET  /api/analysis/jobs/{job_id}/events
GET  /api/analysis/jobs/{job_id}
DELETE /api/analysis/jobs/{job_id}
```

Reason:

- Analysis bisa berjalan beberapa menit.
- User perlu melihat progress.
- User perlu membatalkan job.
- Browser perlu membuka ulang hasil lewat `/analysis/:resourceId`.
- Job store bisa menyimpan event replay dan terminal result.

Implication:

- `POST /api/analyze` dan `POST /api/analyze/stream` hanya legacy.
- Fitur frontend baru harus memakai job API.
- Report canonical memakai `job_id`.
- History tetap memakai `request_id` sebagai primary key SQLite, dan menyimpan
  `job_id` saat tersedia.

## ADR-003: SSE, Bukan WebSocket

Decision: Backend memakai Server-Sent Events untuk progress streaming.

Reason:

- Komunikasi hanya server-to-browser setelah request dimulai.
- SSE lebih sederhana dari WebSocket.
- SSE cocok dengan `StreamingResponse` dan `sse-starlette`.
- Frontend bisa membaca SSE lewat `fetch()` stream agar tetap bisa mengirim
  header `x-owner-token`.

Implication:

- Event format harus tetap sinkron dengan `frontend/src/hooks/useAnalysisJob.js`.
- SSE path tidak boleh dikompresi.
- `SkipSseCompressionMiddleware` harus tetap ada.
- Native `EventSource` tidak dipakai karena tidak bisa mengirim custom auth
  header dengan aman.

## ADR-004: Owner Session untuk Resource Isolation

Decision: Browser mendapat signed owner token dari `POST /api/session`, lalu
mengirim `x-owner-token` untuk job, SSE, cancel, report, history, market, news,
dan status.

Reason:

- Aplikasi personal tetap butuh memisahkan job antar browser session.
- API key adalah credential service/proxy, bukan identitas browser.
- Owner token memberi scope untuk rate limit dan resource access tanpa login.
- Token bisa disimpan di `sessionStorage`.

Implication:

- Protected endpoint harus memakai `limit_request()`.
- Frontend fetch harus memakai `buildAuthHeaders()` atau `buildHeaders()`.
- Production wajib mengisi `OWNER_SESSION_SECRET`.
- Docker nginx boleh menyisipkan `x-api-key`, tetapi browser tetap memakai
  owner token.

## ADR-005: SQLite untuk Persistence

Decision: Backend memakai SQLite untuk job cache, analysis history, market cache,
news cache, dan LLM cache.

Reason:

- Project ini personal/single-user.
- SQLite tidak perlu service tambahan.
- SQLite cukup untuk puluhan analisis per hari.
- Docker volume bisa menyimpan database antar restart.

Implication:

- Jangan tambahkan PostgreSQL atau migration framework tanpa kebutuhan nyata.
- Repository memakai `CREATE TABLE IF NOT EXISTS`.
- Schema change harus ditangani di repository layer dan test.
- `.sqlite3`, `.sqlite`, `.db`, dan `.cache/` tidak boleh commit.

## ADR-006: `VITE_API_BASE_URL` Menjadi Env Frontend Utama

Decision: Frontend memakai `VITE_API_BASE_URL` sebagai env utama. `VITE_API_URL`
tetap ada sebagai legacy alias.

Reason:

- Nama `API_BASE_URL` lebih jelas untuk local dev dan Docker.
- Docker/nginx memakai relative `/api`.
- Local Vite butuh absolute backend URL karena tidak ada proxy.
- Backward compatibility tetap dijaga.

Implication:

- Dokumentasi baru harus memakai `VITE_API_BASE_URL`.
- Untuk local Vite, set `VITE_API_BASE_URL=http://localhost:8000`.
- Untuk Docker, pakai `VITE_API_BASE_URL=/api`.
- Jangan menaruh backend `API_KEY` ke `VITE_*`.

## ADR-007: Nginx Proxy di Docker Frontend

Decision: Docker frontend memakai nginx runtime. Nginx serve static build dan
proxy `/api/` ke `http://backend:8000/api/`.

Reason:

- Browser cukup mengakses `http://localhost:3000`.
- Frontend tidak perlu tahu backend container hostname.
- Nginx bisa menyisipkan server-side `x-api-key` dari `BACKEND_API_KEY`.
- Nginx bisa mematikan buffering untuk SSE.

Implication:

- Docker frontend host port adalah 3000, container port 80.
- Backend host port tetap 8000 untuk direct debug.
- `frontend/nginx.conf` harus dijaga saat mengubah auth/proxy/SSE.
- `proxy_read_timeout` harus cukup panjang untuk pipeline. Saat ini 900 detik.

## ADR-008: Dua Tier LLM

Decision: Pipeline memakai `quick_think_llm` dan `deep_think_llm`.

Reason:

- Research Manager dan Portfolio Manager butuh reasoning lebih kuat.
- Analyst, debate awal, trader, dan risk bisa memakai model lebih cepat.
- Biaya dan latency turun tanpa mengorbankan final synthesis.

Implication:

- `DEEP_THINK_LLM` dan `QUICK_THINK_LLM` wajib.
- Backend tidak punya hardcoded model fallback.
- Startup gagal jika model kosong.
- Google model dinormalisasi lowercase.

## ADR-009: Balanced Pipeline Saja untuk API Server

Decision: API server hanya mendukung `ANALYSIS_MODE=balanced`.

Reason:

- Frontend, serializer, report, dan tests disusun untuk balanced result shape.
- Balanced pipeline sudah memuat fast/balanced/deep depth di dalam satu flow.
- Mode lain akan membuat kontrak result lebih sulit dijaga.

Implication:

- `config_validation.py` menolak `ANALYSIS_MODE` selain `balanced`.
- Jangan tambah mode pipeline baru tanpa kontrak API dan frontend lengkap.
- `analysis_depth` adalah pilihan user yang valid, bukan `ANALYSIS_MODE`.

## ADR-010: Parallel Data dan Analyst, Sequential Decision

Decision: Data collection berjalan paralel. Market, news, dan fundamentals analyst
juga berjalan paralel. Debate dan decision berjalan sequential.

Reason:

- Data source independen bisa dikumpulkan bersamaan.
- Tiga analyst awal membaca data yang sama dan tidak saling bergantung.
- Bull, bear, manager, trader, risk, dan portfolio perlu membaca output tahap
  sebelumnya.

Implication:

- Jangan buat dependency antar analyst awal.
- Jika agent butuh output analyst lain, logic itu masuk debate atau decision.
- `DATA_COLLECTION_WORKERS` dan `ANALYST_PARALLEL_WORKERS` mengontrol parallelism.

## ADR-011: Fast, Balanced, Deep Mengontrol Budget dan Debate

Decision: `analysis_depth` mengatur LLM budget, retry, debate round, dan risk
round.

Defaults:

| Depth | Budget | Retries | Debate rounds | Risk rounds |
|---|---:|---:|---:|---:|
| `fast` | 6 | 1 | 1 | 1 |
| `balanced` | 9 | 2 | 2 | 2 |
| `deep` | 12 | 3 | 3 | 3 |

Reason:

- User bisa memilih biaya/latency.
- Fast mode tetap mengembalikan result shape yang sama.
- Deep mode memberi ruang untuk review tambahan.

Implication:

- Fast mode boleh skip debate/risk committee penuh dan memakai fallback
  konservatif.
- Deep mode bisa menambah extra bull/bear/risk review.
- `max_debate_rounds` tetap divalidasi 1 sampai 5.

## ADR-012: `extra="allow"` pada Response Schema

Decision: Semua response schema inherit dari `ApiSchema` yang memakai
`extra="allow"`.

Reason:

- Pipeline output berkembang.
- Field tambahan tidak boleh mematahkan response validation.
- Frontend membaca field yang dikenal dan mengabaikan field baru.

Implication:

- Jangan set `extra="forbid"` pada response model pipeline.
- Jangan hapus field stabil tanpa rencana migrasi.
- Test kontrak harus fokus pada field yang wajib stabil.

## ADR-013: IDX Auto-Normalization

Decision: Backend menambahkan suffix `.JK` untuk daftar ticker IDX umum saat
user mengirim plain code.

Reason:

- User IDX tidak perlu tahu konvensi yfinance.
- UI market `ID` mengarahkan user untuk input kode plain seperti `BBCA`.
- yfinance butuh `.JK` untuk saham IDX.

Implication:

- Daftar auto suffix ada di `backend/routes/validation.py`.
- Ticker dengan `market=ID` akan dipaksa menjadi `.JK`.
- Jika menambah ticker IDX populer, update `_IDX_AUTO_SUFFIX` dan test.

## ADR-014: Market Support Dibatasi ke US dan ID

Decision: Backend menolak exchange suffix non-ID seperti `.HK`, `.T`, `.DE`,
`.L`, `.AX`, dan `.TO`.

Reason:

- Data vendor, validation, UI contract, dan result assumptions saat ini hanya
  stabil untuk US dan IDX.
- Global exchange suffix memerlukan mapping vendor dan rules yang berbeda.
- Mengizinkan suffix global tanpa support penuh akan membuat data quality dan
  report menyesatkan.

Implication:

- `market` valid hanya `US` dan `ID`.
- Dashboard atau UI yang masih menyebut market lain harus dianggap stale.
- Untuk menambah market baru, update backend validation, frontend contract,
  vendor routing, tests, docs, dan report assumptions.

## ADR-015: yfinance Tetap Primary Data Source

Decision: yfinance menjadi primary source untuk price/OHLCV dan banyak data
fundamental. Finnhub dan Alpha Vantage menjadi fallback/enrichment sesuai env.

Reason:

- yfinance gratis.
- yfinance mendukung IDX dengan suffix `.JK`.
- yfinance cukup untuk personal research.
- Paid vendor quota harus dijaga.

Implication:

- Finnhub dilewati jika `FINNHUB_API_KEY` kosong.
- `DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS=false` default untuk hemat quota.
- Data quality warning wajib dipertahankan saat fallback/partial data terjadi.

## ADR-016: Structured News Service

Decision: Company news memakai `NewsService` dengan Google News Light sebagai
provider structured utama, MarketAux/NewsData.io sebagai fallback, lalu
yfinance fallback jika diaktifkan.

Reason:

- LLM prompt butuh news yang relevan dan deduplicated.
- Provider status dan relevance score penting untuk data quality.
- UI perlu structured article list.

Implication:

- `NEWS_PROVIDER_PRIORITY` dan `NEWS_ENABLED_PROVIDERS` mengontrol provider.
- `NEWS_MAX_ARTICLES_FOR_PROMPT` membatasi prompt cost.
- `NEWS_MAX_ARTICLES_FOR_UI` membatasi UI payload.
- Debug news route hanya aktif di development.

## ADR-017: Report Export dari Snapshot

Decision: HTML dan PDF report dibuat dari completed result snapshot, bukan
menjalankan pipeline ulang.

Reason:

- Report harus merepresentasikan hasil yang user lihat.
- Export tidak boleh memicu biaya LLM/vendor tambahan.
- History snapshot memberi hasil reproducible.

Implication:

- Report canonical memakai `job_id`.
- Fallback report menerima compact payload dari frontend.
- Export mencatat `exported_html_at` dan `exported_pdf_at` best effort.
- Disclaimer tidak boleh dihapus.

## ADR-018: Mock Route Gated by Build-Time Env

Decision: Mock UI route hanya aktif saat `VITE_ENABLE_MOCK=true`.

Reason:

- Mock data tidak boleh muncul di production build normal.
- UI development tetap bisa berjalan tanpa backend/LLM/vendor.
- Docker mock overlay bisa mengaktifkan fixture dengan eksplisit.

Implication:

- `AnalysisMock` diload lazy hanya jika flag true.
- `docker-compose.mock.yml` hanya override `VITE_ENABLE_MOCK=true`.
- Jangan import mock fixture dari production component.

## ADR-019: Multi-Stage Docker Build

Decision: Backend dan frontend memakai multi-stage Docker build.

Reason:

- Backend perlu build wheels dan runtime dependencies terpisah.
- Frontend perlu Node untuk build, tetapi runtime cukup nginx.
- Image runtime lebih kecil dan lebih jelas.

Implication:

- `Dockerfile.backend` punya stage `builder` dan `runtime`.
- `Dockerfile.frontend` punya stage `build` dan `runtime`.
- Dependency baru harus dipasang di stage yang tepat.
- WeasyPrint system libraries harus tetap ada di backend runtime.

## ADR-020: Backtest Folder Saat Ini Hanya Env Template

Decision: Folder `backtest/` saat ini didokumentasikan sebagai konfigurasi
backtest, bukan sebagai modul runtime aplikasi.

Reason:

- Folder hanya berisi `.env.backtest.example` dan `.env.backtest`.
- Tidak ada runner kode backtest di repo saat audit ini.
- `.env.backtest` bisa berisi secret dan tidak boleh dipakai sebagai sumber docs.

Implication:

- Gunakan `backtest/.env.backtest.example` untuk dokumentasi.
- Jangan mengklaim ada command backtest sebelum runner tersedia.
- Jika menambah runner, update `ai/setup.md`, README, dan tests.
