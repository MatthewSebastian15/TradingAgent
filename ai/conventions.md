# Coding Conventions

Terakhir disinkronkan: 2026-06-03.

Ikuti aturan ini saat mengubah repo. Aturan ini mengikuti pola kode yang aktif,
bukan preferensi umum.

## Git

Gunakan Conventional Commits.

Format:

```text
<type>(<scope>): <short description>
```

Type yang dipakai:

```text
feat, fix, chore, docs, test, refactor, perf, style
```

Contoh:

```bash
git commit -m "fix(api): correct analysis job cancellation response"
git commit -m "docs(ai): sync API routes with current backend"
git commit -m "test(frontend): cover SSE result handling"
```

Stage file spesifik. Jangan pakai `git add .` kecuali semua file berubah dalam
satu unit kerja yang sama.

## Bahasa dan Dokumentasi

- Pakai bahasa jelas dan langsung.
- Tulis kalimat pendek.
- Pakai istilah yang sama dengan kode.
- Jika dokumen membahas endpoint, port, env, atau route, ambil dari file kode
  dan `.env.example`, bukan dari ingatan.
- Hindari klaim "support" untuk fitur yang belum benar-benar ada di route atau
  pipeline.
- Saat menulis dokumen repo `.md`, markdown boleh dipakai karena file memang
  markdown.

## Python Backend

### Version dan Style

| Area | Rule |
|---|---|
| Backend Docker | Python 3.11. |
| Core package | `>=3.10,<3.13`. |
| New file | Tambahkan `from __future__ import annotations`. |
| Type hints | Wajib untuk signature fungsi baru. |
| Union | Pakai `X | Y`, bukan `Optional[X]` atau `Union[X, Y]`. |
| Line length | 120 char sesuai ruff config. |
| Formatting | Ruff format, double quotes. |

### Imports

Urutan import:

1. Standard library
2. Third-party
3. Local module

Gunakan blank line antar group.

Rule khusus:

- Route dan service import runtime config dari `config.py`.
- Jangan baca `os.environ` langsung di route atau service.
- Import engine sebagai `from tradingagents...`.
- Jangan import sebagai `from backend.tradingagents...`.

### Config

Source of truth:

| Scope | File |
|---|---|
| Env parsing | `backend/config_env.py` |
| Defaults | `backend/config_defaults.py` |
| LLM config | `backend/config_llm.py` |
| Startup validation | `backend/config_validation.py` |
| Public facade | `backend/config.py` |

Jika menambah env backend:

1. Tambahkan parser/default di config module yang tepat.
2. Export lewat `backend/config.py` jika route/service perlu memakai.
3. Tambahkan ke `backend/.env.example`.
4. Update `ai/setup.md`.
5. Jika keputusan teknisnya penting, update `ai/decisions.md`.
6. Tambahkan test config jika ada validation atau behavior baru.

### Errors

Gunakan exception typed dari `backend/errors.py`.

| Error class | HTTP | Untuk |
|---|---:|---|
| `BadRequestError` | 400 | Input invalid, preflight gagal, job tidak valid. |
| `AuthenticationError` | 401 | API key atau owner token invalid. |
| `NotFoundError` | 404 | Resource tidak ada. |
| `RateLimitError` | 429 | Limit request/stream/concurrency. |
| `PipelineTimeoutError` | 504 | Pipeline timeout. |
| `PipelineExecutionError` | 500 | Pipeline gagal. |

Jangan kirim stack trace, path filesystem, atau secret ke HTTP response. Error
handler sudah melakukan sanitasi. Jangan bypass handler itu.

### Pydantic

- Response model ada di `backend/schemas.py`.
- Request model analisis ada di `backend/routes/validation.py`.
- Response schema harus inherit dari `ApiSchema`.
- `ApiSchema` memakai `extra="allow"`.
- Jangan set `extra="forbid"` pada response model pipeline.
- Jika menambah field final result, update frontend mirror yang membaca field itu.

### API Contract

Saat mengubah request atau response analisis, cek file ini sekaligus:

| File | Alasan |
|---|---|
| `backend/routes/validation.py` | Validasi request. |
| `backend/schemas.py` | Kontrak response publik. |
| `backend/routes/serializers.py` | Shaping final result. |
| `frontend/src/domain/analysisContract.js` | Frontend validation dan payload builder. |
| `frontend/src/components/ResultCard.jsx` | Rendering final result. |
| `frontend/src/utils/reportApi.js` | Payload report fallback. |
| `backend/tests/test_analysis_contract_snapshot.py` | Snapshot kontrak backend. |
| `frontend/src/domain/analysisContract.test.js` | Kontrak frontend. |

### Testing Backend

Test backend ada di:

```text
backend/tests/
backend/tradingagents-core/tests/
```

Marker:

```text
unit, integration, smoke, live_api
```

Rules:

- Unit test tidak boleh memanggil yfinance, Finnhub, Google News Light, MarketAux, NewsData, Alpha
  Vantage, atau LLM live.
- Mock external call.
- Test route pakai TestClient atau async client sesuai pola existing.
- Test file bernama `test_<module>.py`.
- Jika mengubah sanitizer atau error, test response tidak membocorkan secret.

Command utama:

```bash
cd backend
pytest tests/ -m "not integration and not live_api" -v
python -m ruff check .
python -m ruff format --check .
```

Core tests:

```bash
cd backend/tradingagents-core
pytest tests/ -m "not integration and not live_api" -v
```

## Frontend

### Component Rules

- Pakai functional component.
- Component yang menerima props harus punya `PropTypes`.
- Custom hook harus diawali `use`.
- Jangan pakai class component.
- Jangan pakai inline style kecuali ukuran dinamis kecil yang sudah jadi pola
  existing, contoh max height atau transition delay.
- Pakai Tailwind utility class.
- Pakai token warna dari `frontend/tailwind.config.js`.

Token warna:

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

| Jenis | Folder |
|---|---|
| Page | `frontend/src/pages/` |
| Shared component | `frontend/src/components/` |
| Result subcomponent | `frontend/src/components/results/` |
| Result tab | `frontend/src/components/results/tabs/` |
| Hook | `frontend/src/hooks/` |
| Utility | `frontend/src/utils/` |
| Domain contract | `frontend/src/domain/` |
| Constant | `frontend/src/constants/` |
| Dev mock fixture | `frontend/dev/` |

### API URL

Primary env saat ini adalah `VITE_API_BASE_URL`.

| Mode | Value |
|---|---|
| Local Vite | `VITE_API_BASE_URL=http://localhost:8000` |
| Docker/nginx | `VITE_API_BASE_URL=/api` |
| Legacy | `VITE_API_URL` boleh dipakai hanya sebagai fallback lama. |

Rules:

- Jangan hardcode backend URL di component.
- Pakai `buildApiUrl()` dari `frontend/src/utils/api.js`.
- Jangan pakai `process.env`.
- Pakai `import.meta.env.VITE_*`.
- Semua env browser harus diawali `VITE_`.
- Jangan taruh `API_KEY` backend ke `VITE_*`. Browser bisa melihat semua
  variable `VITE_*`.

### Owner Token

Frontend harus memakai helper ini:

| Helper | Fungsi |
|---|---|
| `getOwnerToken()` | Ambil token dari sessionStorage atau `POST /api/session`. |
| `buildAuthHeaders()` | Header `x-owner-token`. |
| `buildHeaders()` | Header JSON plus auth. |
| `readHttpError()` | Parse error envelope backend. |

Jangan membuat fetch manual yang lupa `x-owner-token` untuk endpoint protected.

### SSE

Frontend memakai `fetch()` stream, bukan native `EventSource`, karena harus
mengirim header `x-owner-token`.

Files:

| File | Fungsi |
|---|---|
| `frontend/src/hooks/useAnalysisJob.js` | Create job, stream SSE, cancel job. |
| `frontend/src/utils/sse.js` | Parse SSE block. |
| `backend/routes/sse.py` | Format event. |
| `backend/routes/jobs.py` | Stream job events. |

Event yang harus tetap sinkron:

```text
job
progress
heartbeat
result
error
```

Jangan ubah format payload progress tanpa update `AgentLog`, tests, dan docs.

### Mock Data

- Mock route hanya aktif saat `VITE_ENABLE_MOCK=true`.
- `AnalysisMock.jsx`, `StockFormMock.jsx`, dan `useMockAnalysisJob.js` hanya
  untuk mock route.
- Fixture dev ada di `frontend/dev/mockData.js`.
- Report mock helper ada di `frontend/src/utils/mockReport.js`.
- Jangan import mock fixture dari production path.

### Testing Frontend

Rules:

- Test file boleh colocated dengan component, contoh `ResultCard.test.jsx`.
- Pakai Vitest dan Testing Library.
- Test behavior user, bukan implementation detail.
- Mock fetch dan SSE.
- Jangan buat network call nyata.

Command:

```bash
cd frontend
npm test -- --run
npm run lint
npm run format:check
npm run quality
```

## API dan Endpoint

Endpoint canonical analisis:

```text
POST   /api/session
POST   /api/analysis/jobs
GET    /api/analysis/jobs/{job_id}/events
GET    /api/analysis/jobs/{job_id}
DELETE /api/analysis/jobs/{job_id}
```

Endpoint legacy:

```text
POST   /api/analyze
POST   /api/analyze/stream
GET    /api/analysis/{request_id}
DELETE /api/analysis/{job_id}
```

Jangan gunakan endpoint legacy untuk fitur frontend baru.

Endpoint yang tidak ada di kode saat ini:

```text
GET  /api/analyze/status
POST /api/analyze/cancel/{job_id}
GET  /api/market/quote/{ticker}
GET  /api/reports/{job_id}.html
GET  /api/reports/{job_id}.pdf
GET  /api/session
POST /api/session/refresh
```

Jangan dokumentasikan endpoint di atas sebagai endpoint aktif.

## Market dan Ticker

Backend hanya mendukung:

```text
US
ID
```

Rules:

- `market` harus `US`, `ID`, atau `null`.
- IDX plain code akan dinormalisasi ke `.JK`.
- Non-ID exchange suffix ditolak.
- `trade_date` format `YYYY-MM-DD`.
- `trade_date` tidak boleh lebih dari 1 hari di masa depan.
- `time_horizon_months` hanya `1`, `2`, atau `3`.
- `max_debate_rounds` hanya `1` sampai `5`.
- `analysis_depth` hanya `fast`, `balanced`, atau `deep`.
- `response_detail` hanya `summary`, `full`, atau `debug`.

Jika memperluas market, update:

```text
backend/routes/validation.py
frontend/src/domain/analysisContract.js
frontend/src/components/StockForm.jsx
frontend/src/pages/Dashboard.jsx
backend/tests/test_validation.py
frontend/src/domain/analysisContract.test.js
ai/api.md
ai/setup.md
```

## Reports dan Disclaimer

Report endpoints:

```text
GET  /api/analysis/jobs/{job_id}/report.html
GET  /api/analysis/jobs/{job_id}/report.pdf
POST /api/analysis/report.html
POST /api/analysis/report.pdf
```

Rules:

- Jangan hapus disclaimer dari `backend/services/report_disclaimer.py`.
- Jangan hilangkan disclaimer dari user-facing report.
- Jika menambah field report, update compact payload di
  `frontend/src/utils/reportApi.js`.
- Jika mengubah template, cek HTML dan PDF.

## Docker

Rules:

- Backend Docker expose port 8000.
- Frontend Docker expose port 80 dan host map 3000.
- Nginx proxy `/api/` ke `http://backend:8000/api/`.
- Nginx menyisipkan `x-api-key` dari env `BACKEND_API_KEY`.
- Jangan memakai `VITE_*` untuk secret backend.
- `docker-compose.mock.yml` hanya untuk mengaktifkan mock route.

Files:

```text
docker-compose.yml
docker-compose.mock.yml
Dockerfile.backend
Dockerfile.frontend
frontend/nginx.conf
```

## Environment Files

Files yang boleh jadi template:

```text
backend/.env.example
frontend/.env.example
backtest/.env.backtest.example
```

Files yang tidak boleh commit:

```text
.env
.env.*
backend/.env
frontend/.env
backtest/.env.backtest
*.sqlite3
*.db
backend/.cache/
frontend/node_modules/
frontend/dist/
frontend/coverage/
```

Jangan buka atau salin secret dari `.env` nyata kecuali user jelas meminta dan
tujuannya aman. Pakai `.env.example` sebagai referensi.

## Naming

| Area | Convention | Example |
|---|---|---|
| Python file | `snake_case.py` | `pipeline_runner.py` |
| Python class | `PascalCase` | `AnalysisRequest` |
| Python function | `snake_case` | `normalize_ticker` |
| React component | `PascalCase.jsx` | `ResultCard.jsx` |
| Hook | `camelCase.js`, diawali `use` | `useAnalysisJob.js` |
| Utility JS | `camelCase.js` | `analysisHistoryApi.js` |
| Backend env | `UPPER_SNAKE_CASE` | `LLM_PROVIDER` |
| Frontend env | `VITE_UPPER_SNAKE_CASE` | `VITE_API_BASE_URL` |

## Jangan Dilakukan

- Jangan hardcode API URL di React component.
- Jangan gunakan `VITE_API_URL` sebagai primary env baru. Pakai
  `VITE_API_BASE_URL`.
- Jangan bypass `normalize_and_validate_analysis_request()`.
- Jangan mengubah SSE event tanpa update backend, frontend, test, dan docs.
- Jangan menghapus `SkipSseCompressionMiddleware`.
- Jangan mengubah `ApiSchema.extra="allow"`.
- Jangan menambah dependency sebelum mengecek dependency existing.
- Jangan menambah `print()` atau `console.log()` di production path.
- Jangan commit secret, `.env`, cache, SQLite, build output, atau node_modules.
- Jangan menjalankan live vendor/LLM test sebagai unit test.
- Jangan mengklaim global market support selama backend masih menolak suffix
  non-ID.
