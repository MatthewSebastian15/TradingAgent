# Audit Report - TradingAgents

**Tanggal Audit:** 2026-06-01
**Auditor:** Codex (Senior Software Engineer & System Architect)
**Versi Prompt:** 3.0
**Cakupan Audit:**
- `Dockerfile.backend`
- `Dockerfile.frontend`
- `docker-compose.yml`
- `docker-compose.mock.yml`
- `.dockerignore`
- `backend/.env.example`
- `backend/pyproject.toml`
- `backend/requirements.txt`
- `backend/requirements-dev.txt`
- `backend/scripts/quality.ps1`
- `backend/**/*.py` (181 file Python, termasuk API, core package, dan test)
- `frontend/.env.example`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/eslint.config.js`
- `frontend/.prettierrc.json`
- `frontend/vite.config.js`
- `frontend/nginx.conf`
- `frontend/index.html`
- `frontend/src/**/*.{js,jsx,css}`
- `frontend/dev/mockData.js`
**Total Temuan:** 16

---

## Konteks Arsitektur

- `backend/main.py` adalah entry point FastAPI. File ini memasang middleware, exception handler, dan route API.
- `backend/routes/*.py` adalah route layer. Route ini memanggil limiter, job store, report service, dan process-pool pipeline.
- `backend/analysis_cache.py` adalah cache dan registry job analisis.
- `backend/config*.py` adalah facade konfigurasi API, parser environment, default operasional, validasi startup, dan builder konfigurasi core.
- `backend/tradingagents-core/tradingagents/pipeline_balanced*.py` adalah pipeline agent. Pipeline mengumpulkan data, menjalankan tiga analis awal secara paralel, lalu menjalankan tahap riset, trader, risk, dan portfolio manager.
- `backend/tradingagents-core/tradingagents/dataflows/*.py` adalah router vendor market data dan news.
- `frontend/src/App.jsx` adalah route root React.
- `frontend/src/components/AnalysisWorkspace.jsx` adalah state, history, lookup result, dan navigasi hasil analisis.
- `frontend/src/utils/reportApi.js` adalah client HTML/PDF export.
- `Dockerfile.*`, `docker-compose*.yml`, dan `frontend/nginx.conf` adalah deployment layer.

Dependensi penting yang ditelusuri:

- `frontend/src/components/AnalysisWorkspace.jsx` memanggil `GET /api/analysis/{request_id}` dari `backend/routes/analysis.py`.
- `frontend/src/utils/reportApi.js` memanggil route export dari `backend/routes/reports.py`, lalu route memanggil `backend/services/report_service.py`.
- `backend/routes/analysis.py` memakai `backend/analysis_cache.py` dan `backend/rate_limiter.py`.
- `backend/config_llm.py` membangun konfigurasi untuk `tradingagents.default_config.DEFAULT_CONFIG`.
- `tradingagents.dataflows.interface` membaca konfigurasi vendor yang dibangun oleh `backend/config_llm.py`.

## Verifikasi Yang Dijalankan

| Perintah | Hasil |
|---|---|
| `python -m pytest tests -q` dari `backend/` | Lulus: 193 passed, 1 skipped |
| `python -m pytest tests -q` dari `backend/tradingagents-core/` | Gagal: 2 failed, 154 passed, 24 subtests passed |
| `npm run lint` dari `frontend/` | Lulus |
| `npm test -- --run` dari `frontend/` | Lulus: 12 file, 82 test |
| `npm run build` dari `frontend/` | Lulus |
| `npm run quality` dari `frontend/` | Gagal pada Prettier check: 8 file |
| `powershell -ExecutionPolicy Bypass -File scripts/quality.ps1` dari `backend/` | Gagal pada Ruff format check: 41 file |
| `python -m ruff check . --statistics` dari `backend/` | Gagal: 80 lint errors, 64 auto-fixable |
| `docker compose config --quiet` ekuivalen validasi compose | Struktur compose valid |
| Pencarian credential pada file tracked | Tidak menemukan API key hardcoded pada source tracked |
| `git check-ignore -v backend/.env frontend/.env` | Kedua file local environment di-ignore |

Catatan audit:

- Ruff menandai closure lambda dalam loop pada `pipeline_balanced_orchestrator.py`. Audit memeriksa `_run_tracked()` dan memastikan lambda dipanggil langsung secara sinkron. Peringatan tersebut tidak dicatat sebagai bug runtime.
- Audit tidak menandai facade import `backend/config.py` sebagai dead code. File itu sengaja mempertahankan API `from config import ...` untuk pemanggil lain.

---

## Daftar Temuan

### Pilar 1: Readability

#### F11 - Menengah: Quality gate format gagal pada backend dan frontend

**Lokasi:** `backend/**/*.py`, `frontend/src/**/*.{js,jsx}`

**Pilar:** Readability

**Auto-fixable:** Ya (`ruff format .`, `prettier --write`)

**Masalah:**

- Backend format check gagal pada 41 file.
- Frontend Prettier check gagal pada 8 file:
  - `frontend/src/App.jsx`
  - `frontend/src/components/AnalysisWorkspace.jsx`
  - `frontend/src/components/ExportReportButtons.jsx`
  - `frontend/src/components/ExportReportButtons.test.jsx`
  - `frontend/src/components/StockForm.jsx`
  - `frontend/src/components/StockForm.test.jsx`
  - `frontend/src/hooks/useMockAnalysisJob.js`
  - `frontend/src/pages/Dashboard.jsx`
- Quality script berhenti sebelum test saat format drift muncul.

**Solusi:**

Jalankan formatter repo. Commit perubahan format terpisah dari perubahan perilaku agar review tetap jelas.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

### Pilar 2: Modularity dan Prinsip Desain

#### F07 - Menengah: Shallow update menghapus konfigurasi kategori vendor

**Lokasi:** `backend/config_llm.py:120`, `backend/config_llm.py:178`, `backend/tradingagents-core/tradingagents/default_config.py:115`, `backend/tradingagents-core/tradingagents/dataflows/interface.py:379`

**Pilar:** Modularity dan Prinsip Desain

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`build_tradingagents_config()` membuat shallow copy lalu menjalankan `config.update(...)`. Override `data_vendors` hanya membawa empat kategori:

- `core_stock_apis`
- `technical_indicators`
- `fundamental_data`
- `news_data`

Kategori lain dari `DEFAULT_CONFIG` hilang:

- `quote_data`
- `financial_statements`
- `global_news_data`
- `sentiment_data`
- `social_sentiment`
- `event_data`
- `analyst_rating`
- `insider_data`
- `forex_data`
- `crypto_data`

Router masih menambahkan implementasi vendor yang tersedia sebagai fallback. Namun urutan environment untuk kategori yang hilang tidak lagi bekerja. Contoh nyata: `DATA_VENDOR_GLOBAL_NEWS_DATA=yfinance,finnhub,alpha_vantage` berubah menjadi urutan implementasi `finnhub,alpha_vantage,yfinance`.

**Solusi:**

Lakukan deep merge untuk nested dict. Alternatif sederhana: kirim seluruh kategori `data_vendors` dari `config_llm.py`. Tambahkan test yang menetapkan urutan custom pada setiap kategori dan memastikan `_vendor_sequence()` mempertahankan urutan tersebut.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

### Pilar 3: Scalability dan Performa

#### F14 - Rendah: Lookup request_id melakukan scan O(n)

**Lokasi:** `backend/analysis_cache.py:381`

**Pilar:** Scalability dan Performa

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`AnalysisJobStore.get_by_request_id()` mencari job dengan `next()` pada seluruh `self._jobs.values()`. Batas default kecil, tetapi lookup dipakai oleh result page dan report export. Biaya bertambah linear saat registry membesar.

**Solusi:**

Simpan index `request_id -> job_id`. Update index saat create, load persisted job, cleanup, dan eviction.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada. Index dict menambah sedikit kode dan menghapus scan berulang.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

### Pilar 4: Over-Engineering

Tidak ada temuan actionable.

### Pilar 5: Security

#### F01 - Tinggi: Result dan report lookup tidak memeriksa owner

**Lokasi:** `backend/routes/analysis.py:339`, `backend/services/report_service.py:71`, `backend/routes/reports.py:42`, `backend/analysis_cache.py:381`, `backend/logging_config.py:58`

**Pilar:** Security

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

Endpoint job canonical memeriksa `owner_id`. Endpoint berikut tidak melakukannya:

- `GET /api/analysis/{request_id}`
- `GET /api/analysis/{request_id}/report.html`
- `GET /api/analysis/{request_id}/report.pdf`
- Alias report dengan path `/api/analysis/jobs/{request_id}/...`

`AnalysisJobStore.get_by_request_id()` sudah mendukung parameter `owner_id`, tetapi route tidak mengirimkannya. Test `backend/tests/test_analysis_routes.py:362` bahkan mengharapkan owner berbeda dapat mengambil hasil.

Payload hasil dapat berisi `position_quantity` dan `average_entry_price` dari `backend/routes/serializers.py:492`. Request ID juga dapat berasal dari header `x-request-id` yang valid. Ini adalah insecure direct object reference.

**Solusi:**

- Ambil lease dari `limit_request()` dan kirim `lease.identifier` ke `get_by_request_id(..., owner_id=...)`.
- Tambahkan `owner_id` ke `get_analysis_result_for_report()`.
- Pisahkan trace ID dari resource ID. Jangan gunakan header trace yang dapat ditentukan caller sebagai locator resource.
- Ubah test cross-owner agar mengharapkan penolakan.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

#### F02 - Tinggi: Static proxy API key membuat semua browser berbagi owner

**Lokasi:** `frontend/nginx.conf:13`, `docker-compose.yml:55`, `backend/rate_limiter.py:111`, `frontend/src/utils/api.js:44`

**Pilar:** Security

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

Nginx menambahkan satu `BACKEND_API_KEY` yang sama ke seluruh request browser. `get_client_identifier()` mengembalikan hash API key sebelum mempertimbangkan `x-session-id`.

Saat backend API key aktif, seluruh browser di belakang frontend proxy mendapat owner yang sama. Pemeriksaan owner pada status job, event stream, dan cancel job tidak lagi memisahkan pengguna. Rate limit juga berubah menjadi limit global untuk semua browser.

**Solusi:**

Pisahkan autentikasi service proxy dari identitas owner:

- Validasi shared proxy credential secara terpisah.
- Gunakan user identity atau signed session token sebagai `owner_id`.
- Jangan memperlakukan shared proxy credential sebagai owner resource.
- Tambahkan integration test dengan dua session browser dan satu shared proxy key.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

#### F03 - Menengah: Report HTML menerima URL news dengan skema javascript

**Lokasi:** `backend/services/report_service.py:520`, `backend/templates/reports/analysis_report.html:149`, `backend/tradingagents-core/tradingagents/dataflows/news_models.py:27`, `backend/schemas.py:144`

**Pilar:** Security

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`_related_news_items()` memfilter URL dengan `_is_external_http_url()`. `_news_articles()` tidak melakukan filter yang sama. Template merender URL news langsung sebagai `href`.

Audit memverifikasi payload `javascript:alert(document.domain)` muncul sebagai:

```html
href="javascript:alert(document.domain)"
```

URL dapat berasal dari vendor news atau payload fallback report.

**Solusi:**

- Terapkan `_is_external_http_url()` pada `_news_articles()`.
- Validasi URL saat membangun `NormalizedNewsArticle`.
- Tambahkan regression test untuk `javascript:`, `data:`, dan URL tanpa host.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

#### F04 - Menengah: Debug news endpoint tersedia pada production surface

**Lokasi:** `backend/routes/news.py:55`, `backend/tradingagents-core/tradingagents/dataflows/news_service.py:70`

**Pilar:** Security

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`GET /api/debug/news/{ticker}` selalu terdaftar. Route ini memanggil vendor dalam mode debug. `NewsService` melewati cache untuk semua request debug. Jika `NEWS_DEBUG_RAW_RESPONSE=true`, response juga dapat membawa raw provider response.

Route memakai limiter umum. Route tidak memeriksa `APP_ENV` dan tidak memakai hak akses admin.

**Solusi:**

- Daftarkan route hanya saat `APP_ENV=development`.
- Jika production benar-benar memerlukan route ini, gunakan admin auth dan limit terpisah yang lebih ketat.
- Tetap nonaktifkan raw response secara default.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

#### F05 - Menengah: Browser menyimpan payload finansial dan debug lengkap selama 30 hari

**Lokasi:** `frontend/src/components/AnalysisWorkspace.jsx:11`, `frontend/src/components/AnalysisWorkspace.jsx:98`, `frontend/src/components/AnalysisWorkspace.jsx:112`

**Pilar:** Security

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`saveToHistory()` menyimpan seluruh result ke `localStorage`. Payload dapat berisi:

- `position_quantity`
- `average_entry_price`
- laporan agent lengkap
- payload debug dan raw state

Data bertahan selama 30 hari dan dapat dibaca script lain pada origin yang sama.

**Solusi:**

- Simpan ringkasan history saja.
- Simpan payload lengkap hanya jika pengguna memilih opsi persist.
- Jangan simpan raw debug state ke `localStorage`.
- Tambahkan aksi clear history.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

### Pilar 6: Environment Configuration

#### F06 - Tinggi: NEWS_MIN_RELEVANCE_SCORE dipakai untuk dua skala berbeda

**Lokasi:** `backend/.env.example:55`, `backend/.env.example:146`, `backend/config_defaults.py:164`, `backend/tradingagents-core/tradingagents/default_config.py:101`, `backend/tradingagents-core/tradingagents/default_config.py:141`, `backend/config_env.py:61`

**Pilar:** Environment Configuration

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`backend/.env.example` mendefinisikan `NEWS_MIN_RELEVANCE_SCORE` dua kali:

- `50` untuk structured news dengan skala 0 sampai 100.
- `0.35` untuk konfigurasi legacy dengan skala 0 sampai 1.

Nilai terakhir menang saat `.env` dibaca. Parser API mengharapkan integer, lalu menerima `0.35` dan diam-diam kembali ke default 50 sambil menulis warning. Core config tetap membaca `0.35`.

Satu nama environment sekarang memiliki dua arti. Perilaku bergantung pada jalur konfigurasi yang membaca nilainya.

**Solusi:**

- Pertahankan `NEWS_MIN_RELEVANCE_SCORE=50` untuk structured news.
- Ganti nama konfigurasi legacy jika masih dipakai, misalnya `LEGACY_NEWS_MIN_RELEVANCE_SCORE`.
- Hapus key legacy setelah memastikan tidak ada consumer eksternal.
- Fail fast untuk nilai environment tidak valid pada startup.
- Tambahkan test yang memuat `.env.example` dan memastikan tidak ada key duplikat.

**Dead Code Flag:** `news_min_relevance_score` top-level legacy terlihat tidak memiliki consumer internal. Minta konfirmasi pemakaian eksternal sebelum menghapus.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

#### F08 - Menengah: File env example tidak sinkron dengan runtime knobs

**Lokasi:** `backend/.env.example`, `frontend/.env.example`, `backend/config_defaults.py`, `frontend/vite.config.js`

**Pilar:** Environment Configuration

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

Beberapa variable dibaca source tetapi tidak dicantumkan di `.env.example`. Contoh backend:

- Timeout dan worker: `PIPELINE_TIMEOUT_SECONDS`, `PREFLIGHT_TIMEOUT_SECONDS`, `PROCESS_POOL_WORKERS`, `PROCESS_POOL_MAX_TASKS_PER_CHILD`, `ANALYST_PARALLEL_WORKERS`
- Rate limit: `REQUEST_RATE_LIMIT_PER_MINUTE`, `STREAM_RATE_LIMIT_PER_MINUTE`, `MAX_CONCURRENT_REQUESTS_PER_KEY`, `MAX_CONCURRENT_STREAMS_PER_KEY`
- Cache: `CACHE_TTL_SECONDS`, `CACHE_MAX_ENTRIES`, `ANALYSIS_RESULT_CACHE_*`, `ANALYSIS_JOB_*`, `DATA_CACHE_*`
- LLM dan tool: `LLM_TIMEOUT_SECONDS`, `LLM_MAX_RETRIES`, `PROVIDER_SDK_MAX_RETRIES`, `TOOL_TIMEOUT_SECONDS`, `TOOL_MAX_RETRIES`
- yfinance: `YFINANCE_CACHE_DIR`, `YFINANCE_TICKER_CACHE_MAX_ENTRIES`

Frontend membaca `VITE_DEV_HOST` dan `VITE_DEV_PORT`, tetapi `.env.example` tidak menyebutkannya.

Komentar `FINNHUB_ENABLED` juga menyatakan default disabled, tetapi contoh file menetapkan `FINNHUB_ENABLED=true`.

**Solusi:**

Tambahkan variable operasional ke `.env.example` dengan default yang sama dengan source. Tandai variable advanced secara jelas. Sinkronkan komentar Finnhub dengan nilai contoh.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

#### F09 - Menengah: Compose utama mengaktifkan mock route

**Lokasi:** `docker-compose.yml:49`, `docker-compose.mock.yml:5`, `frontend/src/App.jsx:10`

**Pilar:** Environment Configuration

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`docker-compose.yml` mengirim `VITE_ENABLE_MOCK=true`. Akibatnya route `/analysis.test` aktif pada build compose utama. Repo sudah memiliki `docker-compose.mock.yml`, sehingga mode mock seharusnya menjadi opt-in.

Build audit menghasilkan chunk terpisah:

- `AnalysisMock-*.js`: sekitar 3 KB
- `mockData-*.js`: sekitar 60 KB

**Solusi:**

- Ubah compose utama menjadi `VITE_ENABLE_MOCK=false`.
- Aktifkan `true` hanya pada overlay `docker-compose.mock.yml`.
- Tambahkan test build atau assertion route production agar `/analysis.test` tidak terdaftar saat flag false.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** `docker-compose.mock.yml` kehilangan fungsi opt-in karena compose utama sudah mengaktifkan mock. Tidak ada estimasi baris yang aman dihapus. Perbaiki nilai flag.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

#### F16 - Rendah: Variable reserved dan legacy belum terhubung ke perilaku runtime

**Lokasi:** `backend/.env.example:19`, `README.md:682`, `backend/tradingagents-core/tradingagents/default_config.py:132`

**Pilar:** Environment Configuration

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`TRUSTED_PROXY_HOSTS` dicantumkan di `.env.example` dan README, tetapi tidak pernah dibaca source. Beberapa key legacy juga masuk ke `DEFAULT_CONFIG` tanpa consumer internal yang ditemukan:

- `max_news_per_vendor`
- `max_total_news_items`
- `news_dedup_by`
- `news_min_relevance_score`
- `data_vendor_enable_multi_source_price`
- `data_vendor_require_source_metadata`
- `data_vendor_return_partial_on_failure`

Audit tidak dapat memastikan apakah package core publik memakai key tersebut dari luar repo.

**Solusi:**

- Konfirmasi kontrak eksternal package core.
- Hapus key yang memang tidak dipakai.
- Implementasikan `TRUSTED_PROXY_HOSTS` hanya jika trusted proxy support benar-benar dibutuhkan.

**Dead Code Flag:** Perlu konfirmasi sebelum penghapusan. Tidak ada penghapusan langsung.

**Over-Engineering Flag:** Kandidat pengurangan sekitar 8 sampai 15 baris konfigurasi setelah konfirmasi. Dampak: mengurangi konfigurasi palsu dan beban dokumentasi.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

### Pilar 7: Error Handling dan Edge Cases

Tidak ada temuan tambahan. Temuan fallback environment yang terlalu longgar dicatat pada F06.

### Pilar 8: Logging Consistency

#### F13 - Rendah: Library dataflow memakai print langsung

**Lokasi:** `backend/tradingagents-core/tradingagents/dataflows/utils.py:44`

**Pilar:** Logging Consistency

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`save_output()` memakai `print()`. Modul backend lain memakai `logger`. Jika helper dipakai pada service runtime, output tidak membawa level, request ID, atau struktur log yang konsisten.

**Solusi:**

Gunakan module logger. Jika CLI memang perlu output interaktif, kirim callback atau tangani output pada CLI layer.

**Dead Code Flag:** Audit tidak menemukan pemanggil internal `save_output()`. Konfirmasi pemakaian eksternal sebelum menghapus atau memindahkan helper.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

### Pilar 9: Dependencies

#### F12 - Rendah: Lint production tertutup oleh unused import dan facade warning

**Lokasi:** `backend/tradingagents-core/tradingagents/dataflows/finnhub_news.py:6`, `backend/tradingagents-core/tradingagents/trade_levels.py:10`, `backend/tradingagents-core/tradingagents/trade_levels.py:343`, `backend/config.py:26`

**Pilar:** Dependencies

**Auto-fixable:** Sebagian ya (`ruff check --fix .`)

**Masalah:**

Ruff menemukan unused production artifacts yang dapat dihapus langsung:

- Import `normalize_url` pada `finnhub_news.py`.
- Import `VolatilityLevel` pada `trade_levels.py`.
- Variable lokal `had_trade_level` pada `trade_levels.py`.

Ruff juga menandai banyak import pada `backend/config.py`. Import facade tersebut sengaja diekspor untuk compatibility, tetapi intent belum dinyatakan dengan `__all__` atau suppress rule yang tepat. Noise ini menyulitkan deteksi lint baru.

**Solusi:**

- Hapus tiga artifact yang benar-benar unused.
- Tambahkan `__all__` atau suppress `F401` yang terarah pada facade compatibility.
- Jalankan Ruff lagi dan review sisa warning satu per satu.

**Dead Code Flag:** Tiga artifact production di atas dapat dihapus langsung.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

#### F15 - Rendah: Ollama memakai mutable latest tag

**Lokasi:** `docker-compose.yml:77`

**Pilar:** Dependencies

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

Service optional Ollama memakai `ollama/ollama:latest`. Build pada tanggal berbeda dapat menarik runtime yang berbeda tanpa perubahan source.

**Solusi:**

Pin versi image atau digest. Upgrade secara eksplisit setelah smoke test.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

### Pilar 10: Testability

#### F10 - Tinggi: Quality script tidak menjalankan core suite dan core suite tidak hermetic

**Lokasi:** `backend/scripts/quality.ps1:15`, `backend/tradingagents-core/tests/test_pipeline_balanced_resilience.py:364`, `backend/tradingagents-core/tests/test_ticker_symbol_handling.py:10`, `backend/tradingagents-core/tests/conftest.py:27`

**Pilar:** Testability

**Auto-fixable:** Tidak, butuh review manual

**Masalah:**

`backend/scripts/quality.ps1` hanya menjalankan `python -m pytest tests -q` dari `backend/`. Suite `backend/tradingagents-core/tests` tidak ikut berjalan.

Saat suite core dijalankan terpisah, dua test gagal:

- `test_yfinance_router_uses_single_app_retry_layer`
- `TickerSymbolHandlingTests.test_normalize_ticker_symbol_preserves_exchange_suffix`

Test retry mengembalikan string `"ok"` yang dianggap payload OHLCV invalid. Router lalu fallback ke Alpha Vantage. Pada audit, test menyentuh vendor live karena mock tidak menutup fallback.

Fixture core juga mempertahankan API key real dari environment dengan `os.environ.get(env_var, "placeholder")`. Unit test dapat memakai quota developer.

Test ticker masih mengharapkan `CNC.TO` diterima, sedangkan CLI sekarang membatasi US dan IDX.

**Solusi:**

- Tambahkan `python -m pytest tradingagents-core/tests -q` pada quality script.
- Override API key unit test dengan placeholder tetap. Jangan mempertahankan key real.
- Set `TRADINGAGENTS_SKIP_DOTENV=true` untuk suite core.
- Pada test router, batasi `vendor_order=["yfinance"]`, mock seluruh fallback, atau kirim CSV valid.
- Sinkronkan test ticker dengan scope US dan IDX terbaru.

**Dead Code Flag:** Tidak ada.

**Over-Engineering Flag:** Tidak ada.

**Refactored Code:** Tidak diterapkan. Audit hanya menulis laporan.

### Dead Code dan Unused Assets

Tidak ada file yang dapat langsung dihapus dengan keyakinan tinggi.

Artifact production yang dapat langsung dihapus:

| File / Fungsi / Import | Alasan Dihapus |
|---|---|
| `backend/tradingagents-core/tradingagents/dataflows/finnhub_news.py` import `normalize_url` | Tidak pernah dipakai dalam file |
| `backend/tradingagents-core/tradingagents/trade_levels.py` import `VolatilityLevel` | Tidak pernah dipakai dalam file |
| `backend/tradingagents-core/tradingagents/trade_levels.py` local `had_trade_level` | Nilai dihitung tetapi tidak pernah dibaca |

Kandidat yang memerlukan konfirmasi:

| Kandidat | Alasan Konfirmasi |
|---|---|
| `TRUSTED_PROXY_HOSTS` | Ada di example dan README, tetapi tidak dibaca source |
| Legacy top-level news config pada F16 | Tidak ada consumer internal, tetapi package core dapat dipakai dari luar repo |
| `save_output()` | Tidak ada pemanggil internal, tetapi package core dapat dipakai dari luar repo |

---

## Ringkasan Audit

### Tabel Ringkasan

| Pilar | Jumlah Temuan | Tingkat Keparahan Tertinggi |
|---|---:|---|
| Readability | 1 | Menengah |
| Modularity dan Prinsip Desain | 1 | Menengah |
| Scalability dan Performa | 1 | Rendah |
| Over-Engineering | 0 | - |
| Security | 5 | Tinggi |
| Environment Configuration | 4 | Tinggi |
| Error Handling dan Edge Cases | 0 | - |
| Logging Consistency | 1 | Rendah |
| Dependencies | 2 | Rendah |
| Testability | 1 | Tinggi |
| Dead Code dan Unused Assets | 0 temuan terpisah | - |
| **Total** | **16** | **Tinggi** |

### Urutan Prioritas Perbaikan

| Prioritas | Temuan | File | Alasan Mendesak |
|---:|---|---|---|
| 1 | F01 Result dan report lookup tidak memeriksa owner | `backend/routes/analysis.py`, `backend/services/report_service.py` | Dapat membocorkan hasil analisis dan data posisi |
| 2 | F02 Static proxy API key membuat semua browser berbagi owner | `frontend/nginx.conf`, `backend/rate_limiter.py` | Merusak isolasi job, cancel, event, dan rate limit |
| 3 | F03 URL news javascript masuk report HTML | `backend/services/report_service.py` | Membuka jalur script URL pada report |
| 4 | F06 Collision NEWS_MIN_RELEVANCE_SCORE | `backend/.env.example`, `backend/config_defaults.py` | Satu key memiliki dua skala dan perilaku berbeda |
| 5 | F10 Core suite tidak ikut quality dan tidak hermetic | `backend/scripts/quality.ps1`, `backend/tradingagents-core/tests` | Regression tidak terlihat dan unit test dapat memanggil vendor live |
| 6 | F04 Debug news endpoint tersedia di production surface | `backend/routes/news.py` | Membuka debug metadata, raw response opsional, dan cache bypass |
| 7 | F05 Payload finansial lengkap disimpan ke localStorage | `frontend/src/components/AnalysisWorkspace.jsx` | Menyimpan data posisi dan debug selama 30 hari |
| 8 | F07 Shallow update menghapus kategori vendor | `backend/config_llm.py` | Environment vendor order tidak bekerja konsisten |
| 9 | F09 Compose utama mengaktifkan mock route | `docker-compose.yml` | Mock route dan asset debug masuk build utama |
| 10 | F08 Env example tidak sinkron | `backend/.env.example`, `frontend/.env.example` | Menambah risiko startup dan konfigurasi salah |
| 11 | F11 Quality gate format gagal | Backend dan frontend source | Menutup signal quality dan menghentikan pipeline verifikasi |
| 12 | F12 Unused artifact dan facade lint noise | Core source, `backend/config.py` | Menutup lint signal baru |
| 13 | F14 Lookup request_id O(n) | `backend/analysis_cache.py` | Lookup membesar linear terhadap registry |
| 14 | F13 print langsung pada dataflow helper | `tradingagents/dataflows/utils.py` | Log runtime tidak konsisten |
| 15 | F15 Ollama latest tag | `docker-compose.yml` | Deployment optional tidak reproducible |
| 16 | F16 Reserved dan legacy env belum terhubung | Env example, core defaults | Konfigurasi palsu membingungkan operator |

### Yang Bisa Di-autofix

| Tool | Perintah | Temuan yang Diselesaikan |
|---|---|---|
| ruff | `cd backend && python -m ruff format .` | Format drift backend pada F11 |
| ruff | `cd backend && python -m ruff check --fix .` | Sebagian lint pada F12 dan lint style lain |
| black | Tidak dipakai. Repo memakai Ruff formatter. | - |
| prettier | `cd frontend && npx prettier --write "src/**/*.{js,jsx,css}" "dev/**/*.{js,jsx,css}" "*.{js,json,html}"` | Format drift frontend pada F11 |
| eslint | `cd frontend && npx eslint --fix .` | Tidak ada error ESLint saat audit |

### Dead Code yang Bisa Langsung Dihapus

| File / Fungsi / Import | Alasan Dihapus |
|---|---|
| `backend/tradingagents-core/tradingagents/dataflows/finnhub_news.py` import `normalize_url` | Unused import |
| `backend/tradingagents-core/tradingagents/trade_levels.py` import `VolatilityLevel` | Unused import |
| `backend/tradingagents-core/tradingagents/trade_levels.py` local `had_trade_level` | Assigned but never used |

### Over-Engineering yang Bisa Disederhanakan

| Lokasi | Estimasi Baris Dihilangkan | Dampak |
|---|---:|---|
| Legacy dan reserved config pada F16, setelah konfirmasi | 8 sampai 15 | Mengurangi konfigurasi palsu dan dokumentasi yang tidak sesuai runtime |

---

## Refactored Code

Tidak ada source aplikasi yang dimodifikasi. Sesuai aturan audit, `docs/Audit_Report.md` adalah satu-satunya output permanen.

---

*Audit Report di-generate dari TradingAgent Audit Prompt v3.0*
