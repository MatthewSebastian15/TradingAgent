# Migration Runbook: SQLite → Postgres & localStorage Encryption

One sequential checklist. Do the steps **in order, top to bottom**. Every step is
numbered `1 … N` with no resets. Each risky step is followed by a **RUN-GATE** —
a command that proves the program still starts and tests still pass. **Do not
advance past a failed RUN-GATE.**

> **Why this exists / when NOT to run it.** Both migrations were deliberately
> skipped in the data audit. `backend/persistent_cache.py` correctly argues this
> project is personal-scale. Run Phase 1 (Postgres) only when multiple backend
> instances must share writes or SQLite's single-writer lock is a real
> bottleneck. Run Phase 2 (encryption) only for shared/kiosk machines or a
> compliance requirement. Neither is worth it for "my laptop, my data."

Legend:
- **DO** — make a change.
- **RUN-GATE** — verification; must pass before continuing.
- **ROLLBACK** — how to undo if the gate fails.

Conventions: PowerShell from `D:\CODING\TradingAgents` unless a step says otherwise.

---

## Mental model — read this first

**This is not a wholesale "SQLite → Postgres" cutover. Exactly one table moves.**
You end up running both engines on purpose.

### What lives where after Phase 1

| Data | Backend | Why |
|---|---|---|
| `analyses` table (completed analysis snapshots) | **Postgres** | The one durable, shareable record. Only thing worth moving. |
| `market_data`, `news_data`, `llm_exact_cache`, `llm_semantic_cache`, `rate_limits`, `analysis_jobs` | **stays SQLite** | Ephemeral, host-local caches. No reason to move. |
| Browser stores (chat / watchlist / analysis history) | localStorage (Phase 2) | Unrelated to the DB; encryption only. |

### Is Redis needed? No.

Skip it. The migration moves one table to Postgres; nothing here needs a
key-value store, pub/sub, or shared session cache. Redis only earns its keep
with **2+ backend instances sharing a cache**, distributed rate-limit counters,
or cross-process pub/sub. This project is single-backend, personal-scale.
Postgres alone covers shared writes if you ever scale. **Add Redis only when a
profiler proves SQLite/Postgres cache contention is real across instances — not
before.**

### How the switch works (runtime)

One env var picks the implementation. Default stays `sqlite`, so nothing changes
until you flip it at cutover (step 27):

```
ANALYSIS_STORAGE_BACKEND = sqlite     # default, today
ANALYSIS_STORAGE_BACKEND = postgres   # after cutover
```

`get_analysis_repository()` in `backend/services/analysis_repository.py` branches
on this var:
- `sqlite`   → existing `AnalysisRepository` (unchanged)
- `postgres` → new `PostgresAnalysisRepository`

Both classes expose the **identical public API** (`save_analysis`,
`get_analysis`, `get_analysis_by_job_id`, `get_analysis_record_by_job_id`,
`list_analyses`, `delete_analysis`, `delete_all_analyses`, `mark_exported`).
Routes call the factory, never a concrete class — so routes never change. That is
the whole design: swap the implementation behind a stable interface.

### Implementation shape (Phase 1)

1. Add `psycopg[binary]` (raw DBAPI — do **not** add SQLAlchemy).
2. New `analysis_repository_postgres.py`: copy each SQLite method body, then
   mechanically translate `?`→`%s`, `:name`→`%(name)s`, drop `BEGIN IMMEDIATE`,
   drop the `threading.RLock` (Postgres handles concurrency), `REAL`→`DOUBLE
   PRECISION`, use `dict_row`. `ON CONFLICT … DO UPDATE` already matches Postgres.
   **Port every method** — a half-ported class imports fine but crashes at
   runtime when a route hits the missing one.
3. Branch the factory; keep `install_analysis_repository()` for test fakes.

### Migration shape — copy, don't convert

Both DBs coexist during cutover. The script reads SQLite rows and bulk-inserts
into Postgres with `ON CONFLICT (request_id) DO NOTHING` ⇒ **idempotent**, safe
to re-run. Order: Postgres up → schema applied → **stop the backend (no writes
mid-copy)** → run copy → verify row counts match → flip the env var → smoke-test.

### Rollback is cheap

The SQLite file is the read-only source — never written after cutover. To revert:
set `ANALYSIS_STORAGE_BACKEND=sqlite`, restart. Zero data loss. Keep `.cache.bak`
(step 6) and the original `.sqlite3` for one cycle before deleting.

### Current code state (as of this writing — verify before re-doing step 11)

The config scaffolding is **partially present**:
- `config_defaults.py` already defines `ANALYSIS_STORAGE_BACKEND`, but its
  validation set is `{"sqlite"}` only — Phase 1 must widen it to
  `{"sqlite", "postgres"}` and add `ANALYSIS_DATABASE_URL`.
- `storage_backends.py::build_runtime_storage` has only the `sqlite` branch and
  raises on anything else. That helper governs cache/SQLite paths, **not** the
  `analyses` repo factory — leave it unless you also move caches; the Postgres
  switch happens in `get_analysis_repository()`.
- `ANALYSIS_DATABASE_URL` does **not** exist yet — step 10/11 add it.

So step 11 below is an **edit**, not a fresh add. Check these files first.

---

## Phase 0 — Pre-flight (do these even if you only run one phase)

**1. DO — confirm clean tree & baseline green.**
```powershell
git status
cd backend; .\.venv\Scripts\Activate.ps1; cd ..
```

**2. RUN-GATE — backend baseline.**
```powershell
cd backend
python -m ruff check .
python -m ruff format --check .
pytest tests/ -m "not integration and not live_api" -q
cd ..
```
All three must pass. If not, fix before migrating — never migrate on red.

**3. RUN-GATE — frontend baseline.**
```powershell
cd frontend
npm run lint
npm test -- --run
cd ..
```

**4. RUN-GATE — app boots.**
```powershell
cd backend
Start-Process -NoNewwindow uvicorn -ArgumentList "main:app","--host","127.0.0.1","--port","8000"
Start-Sleep 4
Invoke-RestMethod http://127.0.0.1:8000/health
# stop it again before continuing
Get-Process uvicorn -ErrorAction SilentlyContinue | Stop-Process -Force
cd ..
```
`/health` must return OK. This is the "program runs" baseline every later
RUN-GATE compares against.

**5. DO — create a migration branch.**
```powershell
git checkout -b feat/storage-migrations
```

**6. DO — back up SQLite + browser data.**
```powershell
Copy-Item backend\.cache backend\.cache.bak -Recurse -Force
```
For the browser: in DevTools → Application → Local Storage, export the
`tradingagents:*` and `ta:*` keys to a file. The migration must never be your
only copy.

---

## Phase 1 — SQLite → Postgres (the `analyses` table only)

> Scope: migrate **only** `analysis_history.sqlite3` (`AnalysisRepository`).
> Leave every cache (`market_data`, `news_data`, `llm_exact_cache`,
> `llm_semantic_cache`, `rate_limits`, `analysis_jobs`) on SQLite — they are
> ephemeral and host-local. Optionally add `general_news` later by repeating the
> same recipe; it is out of scope here.

**7. DO — add the driver.**
```powershell
cd backend
pip install "psycopg[binary]>=3.1"
Add-Content requirements.txt "psycopg[binary]>=3.1"
cd ..
```
Do **not** add SQLAlchemy — `AnalysisRepository` uses raw DBAPI; keep it.

**8. RUN-GATE — import still clean.**
```powershell
cd backend; python -c "import psycopg; print(psycopg.__version__)"; cd ..
```

**9. DO — add the Postgres service to `docker-compose.yml`.**
```yaml
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: tradingagents
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in backend/.env}
      POSTGRES_DB: tradingagents
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tradingagents"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pg_data:
```

**10. DO — add env vars.**
- `backend/.env`: `POSTGRES_PASSWORD=<real>`, `ANALYSIS_DATABASE_URL=postgresql://tradingagents:<real>@localhost:5432/tradingagents`, and (later, at cutover) `ANALYSIS_STORAGE_BACKEND=postgres`.
- `backend/.env.example`: same keys with **placeholder** values, never the real ones.
- Update `ai/setup.md` (env-var rule from CLAUDE.md).

**11. DO — extend config in `backend/config_defaults.py`.**
```python
ANALYSIS_STORAGE_BACKEND = env("ANALYSIS_STORAGE_BACKEND", "sqlite").lower().strip()
if ANALYSIS_STORAGE_BACKEND not in {"sqlite", "postgres"}:
    raise ValueError("ANALYSIS_STORAGE_BACKEND must be one of: sqlite, postgres.")
ANALYSIS_DATABASE_URL = env("ANALYSIS_DATABASE_URL", "")
if ANALYSIS_STORAGE_BACKEND == "postgres" and not ANALYSIS_DATABASE_URL:
    raise ValueError("ANALYSIS_DATABASE_URL is required when ANALYSIS_STORAGE_BACKEND=postgres.")
```
Re-export `ANALYSIS_DATABASE_URL` from `config.py` next to the existing
`ANALYSIS_STORAGE_BACKEND` line.

**12. RUN-GATE — config still imports with the default (sqlite) backend.**
```powershell
cd backend; python -c "import config; print(config.ANALYSIS_STORAGE_BACKEND)"; cd ..
```
Must print `sqlite` (you have not switched yet). App behavior unchanged so far.

**13. DO — start Postgres.**
```powershell
docker compose up -d postgres
docker compose ps   # postgres healthy?
```

**14. DO — apply schema. Save as `backend/scripts/postgres_schema.sql`.**
```sql
CREATE TABLE IF NOT EXISTS analyses (
    request_id           TEXT PRIMARY KEY,
    owner_id             TEXT NOT NULL,
    job_id               TEXT,
    ticker               TEXT NOT NULL,
    market               TEXT,
    trade_date           TEXT,
    time_horizon_months  INTEGER,
    analysis_depth       TEXT,
    response_detail      TEXT,
    decision             TEXT,
    recommendation       TEXT,
    current_price        DOUBLE PRECISION,
    entry_price          DOUBLE PRECISION,
    stop_loss            DOUBLE PRECISION,
    take_profit          DOUBLE PRECISION,
    rr_ratio             TEXT,
    source_summary       TEXT,
    status               TEXT NOT NULL DEFAULT 'completed',
    result_json          TEXT NOT NULL,
    request_json         TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    exported_html_at     TEXT,
    exported_pdf_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_analyses_owner_created_at  ON analyses (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_owner_request_id  ON analyses (owner_id, request_id);
CREATE INDEX IF NOT EXISTS idx_analyses_owner_job_id      ON analyses (owner_id, job_id);
CREATE INDEX IF NOT EXISTS idx_analyses_job_id            ON analyses (job_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at        ON analyses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_ticker_created_at ON analyses (ticker, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_market_created_at ON analyses (market, created_at DESC);
```
Apply:
```powershell
docker compose exec -T postgres psql -U tradingagents -d tradingagents -f - < backend\scripts\postgres_schema.sql
```

Schema-translation reference (SQLite → Postgres) you just applied:

| SQLite | Postgres | Note |
|---|---|---|
| `REAL` | `DOUBLE PRECISION` | prices, rr |
| `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` | unchanged |
| `result_json TEXT` | `TEXT` | keep TEXT for 1:1; JSONB only if you query inside |
| `PRAGMA user_version` | (none) | use idempotent `CREATE ... IF NOT EXISTS` |
| `PRAGMA journal_mode=WAL` | (none) | Postgres is always durable+concurrent |
| `INSERT OR REPLACE` | `ON CONFLICT DO UPDATE` | code already uses ON CONFLICT |
| `?` placeholder | `%s` | psycopg |
| `:name` placeholder | `%(name)s` | psycopg |
| `BEGIN IMMEDIATE` | `BEGIN` | drop IMMEDIATE |

**15. RUN-GATE — schema present.**
```powershell
docker compose exec postgres psql -U tradingagents -d tradingagents -c "\d analyses"
```

**16. DO — add `backend/services/analysis_repository_postgres.py`.**
Mirror the public API of `AnalysisRepository` exactly so routes never change.
Copy each method body from `analysis_repository.py`, then mechanically:
`?`→`%s`, `:name`→`%(name)s`, drop `BEGIN IMMEDIATE`, drop the `threading.RLock`
(Postgres handles concurrency), use `dict_row`.
```python
from __future__ import annotations
import json
from typing import Any
import psycopg
from psycopg.rows import dict_row
from config import ANALYSIS_DATABASE_URL

class PostgresAnalysisRepository:
    """Same public surface as AnalysisRepository, Postgres-backed.

    ponytail: connect-per-call, no pool until a profiler demands one — then
    swap in psycopg_pool.ConnectionPool. Connect cost is negligible on a local
    server / pgbouncer.
    """
    def __init__(self, max_rows: int = 1000) -> None:
        self.max_rows = max(1, int(max_rows))

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(ANALYSIS_DATABASE_URL, row_factory=dict_row)

    # Implement, with identical signatures to AnalysisRepository:
    #   save_analysis, get_analysis, get_analysis_by_job_id,
    #   get_analysis_record_by_job_id, list_analyses, delete_analysis,
    #   delete_all_analyses, mark_exported
    # plus the same _dumps/_loads_dict/_history_signal/_confidence_score_percent
    # helpers (import them from analysis_repository to avoid duplication).
    @staticmethod
    def _dumps(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
```
> **Do NOT skip any method.** Routes call all of them. A half-ported class makes
> the program crash at runtime, not import time. Port the full surface.

**17. DO — branch the factory in `analysis_repository.py`.**
```python
def get_analysis_repository():
    global _REPOSITORY
    if _REPOSITORY is None:
        from config import ANALYSIS_STORAGE_BACKEND
        if ANALYSIS_STORAGE_BACKEND == "postgres":
            from services.analysis_repository_postgres import PostgresAnalysisRepository
            _REPOSITORY = PostgresAnalysisRepository(max_rows=ANALYSIS_HISTORY_MAX_ROWS)
        else:
            _REPOSITORY = AnalysisRepository(ANALYSIS_DB_PATH, max_rows=ANALYSIS_HISTORY_MAX_ROWS)
    return _REPOSITORY
```
Keep `install_analysis_repository()` — tests inject fakes through it.

**18. RUN-GATE — lint + import both backends.**
```powershell
cd backend
python -m ruff check services/analysis_repository_postgres.py services/analysis_repository.py config_defaults.py
python -c "from services.analysis_repository_postgres import PostgresAnalysisRepository; print('ok')"
cd ..
```

**19. DO — write the Postgres repo unit tests.**
Add `backend/tests/test_analysis_repository_postgres.py`. Mark it so the default
CI run skips it without a DB:
```python
import pytest
pytestmark = pytest.mark.postgres   # register 'postgres' in pyproject.toml [tool.pytest.ini_options] markers
```
Port **every** assertion from `tests/test_analysis_repository.py` (save round-trip,
owner isolation, `list_analyses` ordering + limit clamp, `delete_analysis`,
`delete_all_analyses`, `mark_exported` html/pdf, eviction past `max_rows`,
`get_analysis_by_job_id`). Same public API ⇒ bodies port directly. Use a
function-scoped fixture that `TRUNCATE analyses` before each test.

**20. RUN-GATE — Postgres unit tests pass (with DB up).**
```powershell
cd backend; pytest tests/test_analysis_repository_postgres.py -m postgres -q; cd ..
```

**21. RUN-GATE — default suite still green (DB-less path unchanged).**
```powershell
cd backend; pytest tests/ -m "not integration and not live_api" -q; cd ..
```
Confirms you did **not** break the SQLite path or break the program for anyone
not using Postgres.

**22. DO — write the data-migration script `backend/scripts/migrate_analyses_to_postgres.py`.**
```python
import sqlite3, psycopg
from config import ANALYSIS_DB_PATH, ANALYSIS_DATABASE_URL

COLUMNS = [
    "request_id","owner_id","job_id","ticker","market","trade_date",
    "time_horizon_months","analysis_depth","response_detail","decision",
    "recommendation","current_price","entry_price","stop_loss","take_profit",
    "rr_ratio","source_summary","status","result_json","request_json",
    "created_at","updated_at","exported_html_at","exported_pdf_at",
]

src = sqlite3.connect(ANALYSIS_DB_PATH); src.row_factory = sqlite3.Row
rows = src.execute(f"SELECT {','.join(COLUMNS)} FROM analyses").fetchall()
placeholders = ",".join(["%s"] * len(COLUMNS))
sql = (f"INSERT INTO analyses ({','.join(COLUMNS)}) VALUES ({placeholders}) "
       "ON CONFLICT (request_id) DO NOTHING")
with psycopg.connect(ANALYSIS_DATABASE_URL) as dst:
    with dst.cursor() as cur:
        cur.executemany(sql, [tuple(r[c] for c in COLUMNS) for r in rows])
    dst.commit()
print(f"Migrated {len(rows)} analyses")
```
`ON CONFLICT DO NOTHING` ⇒ **idempotent**, safe to re-run.

**23. DO — add a self-check test for the migration script.**
`backend/tests/test_migrate_analyses_to_postgres.py` (mark `postgres`): seed 2 rows
in a temp SQLite, run the copy, assert both land in Postgres and a **second run
adds zero** (idempotency). This is the unit test that guarantees no data is
silently dropped.

**24. RUN-GATE — migration self-check passes.**
```powershell
cd backend; pytest tests/test_migrate_analyses_to_postgres.py -m postgres -q; cd ..
```

**25. DO — stop writers, then migrate real data.**
Stop the backend (no writes mid-copy), then:
```powershell
cd backend; python scripts\migrate_analyses_to_postgres.py; cd ..
```

**26. RUN-GATE — row counts match.**
```powershell
$sq = sqlite3 backend\.cache\analysis_history.sqlite3 "SELECT COUNT(*) FROM analyses;"
docker compose exec postgres psql -U tradingagents -d tradingagents -t -c "SELECT COUNT(*) FROM analyses;"
"sqlite=$sq"
```
Counts must match (Postgres ≥ SQLite is fine if Postgres already had rows).

**27. DO — cut over.** Set `ANALYSIS_STORAGE_BACKEND=postgres` in `backend/.env`.

**28. RUN-GATE — program runs on Postgres.**
```powershell
cd backend
Start-Process -NoNewwindow uvicorn -ArgumentList "main:app","--host","127.0.0.1","--port","8000"
Start-Sleep 4
Invoke-RestMethod http://127.0.0.1:8000/health
Get-Process uvicorn -ErrorAction SilentlyContinue | Stop-Process -Force
cd ..
```
`/health` OK = the program still runs after cutover. Then smoke-test the history
endpoint and one `GET /analysis/{request_id}` in the browser.

**29. DO — keep `backend/.cache/analysis_history.sqlite3` for one cycle** as a
backup before deleting. `.cache.bak` from step 6 stays too.

**30. ROLLBACK (Phase 1).** Set `ANALYSIS_STORAGE_BACKEND=sqlite`, restart. The
SQLite file is the untouched read-only source ⇒ zero data loss. Re-run step 28's
RUN-GATE to confirm the program runs again on SQLite.

---

## Phase 2 — Encrypt Browser localStorage

> **Read before coding.** This blocks raw `localStorage` dumps and cross-origin
> reads. It does **NOT** stop same-origin XSS — any script in your origin can
> call the decrypt path. **Fix CSP/XSS first.** Encrypt only the 3 sensitive
> stores; public/UI stores gain nothing. Strategy: a non-extractable AES-GCM
> device key in IndexedDB (transparent, no passphrase).

**31. DO — add the crypto helper `frontend/src/services/secureStorage.js`.**
Native WebCrypto, zero dependencies.
```js
// AES-GCM over localStorage values; non-extractable device key in IndexedDB.
// XSS-equivalent: same-origin JS can still decrypt. Fix CSP first.
const DB = 'ta-secure', STORE = 'keys', KEY_ID = 'v1';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
    t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
  });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k);
    t.onsuccess = () => res(); t.onerror = () => rej(t.error);
  });
}
async function getKey() {
  let key = await idbGet(KEY_ID);
  if (!key) {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await idbSet(KEY_ID, key);
  }
  return key;
}
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptJSON(value) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
}
export async function decryptJSON(blob) {
  if (!blob) return null;
  try {
    const { iv, ct } = JSON.parse(blob);
    const key = await getKey();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
    return JSON.parse(dec.decode(pt));
  } catch { return null; }
}
```

**32. DO — add the crypto round-trip unit test `frontend/src/services/secureStorage.test.js`.**
jsdom lacks WebCrypto + IndexedDB. Add dev deps and a setup polyfill:
```powershell
cd frontend; npm i -D fake-indexeddb @peculiar/webcrypto; cd ..
```
Test (run under jsdom with the polyfills imported at top):
```js
import 'fake-indexeddb/auto';
import { Crypto } from '@peculiar/webcrypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptJSON, encryptJSON } from './secureStorage';

beforeAll(() => { globalThis.crypto = new Crypto(); });

describe('secureStorage', () => {
  it('round-trips an object', async () => {
    const blob = await encryptJSON({ a: 1, b: ['x'] });
    expect(await decryptJSON(blob)).toEqual({ a: 1, b: ['x'] });
  });
  it('returns null on tampered ciphertext', async () => {
    const blob = JSON.parse(await encryptJSON({ a: 1 }));
    blob.ct = blob.ct.slice(0, -2) + 'AA';
    expect(await decryptJSON(JSON.stringify(blob))).toBeNull();
  });
  it('returns null on garbage / legacy plaintext', async () => {
    expect(await decryptJSON('[1,2,3]')).toBeNull();
    expect(await decryptJSON(null)).toBeNull();
  });
});
```

**33. RUN-GATE — crypto tests pass.**
```powershell
cd frontend; npx vitest run src/services/secureStorage.test.js --environment jsdom; cd ..
```

**34. DO — convert store #1: chatbot history (`frontend/src/services/chatHistory.js`).**
Make load/save async + encrypted, **dual-read** legacy plaintext so existing
users don't lose history:
```js
import { decryptJSON, encryptJSON } from './secureStorage';

export async function loadConversations() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    let list = await decryptJSON(raw);           // new envelope
    if (list === null) { try { list = JSON.parse(raw); } catch { list = []; } } // legacy plaintext
    return pruneConversations(Array.isArray(list) ? list : []);
  } catch { return []; }
}
export async function saveConversations(list) {
  try { localStorage.setItem(CHAT_HISTORY_KEY, await encryptJSON(pruneConversations(list))); }
  catch { /* best-effort */ }
}
```
`pruneConversations` stays synchronous & pure — its existing tests are unaffected.

**35. DO — update the caller `frontend/src/hooks/useRagChat.js`** (load became async):
```js
const [conversations, setConversations] = useState([]);
useEffect(() => {
  let alive = true;
  loadConversations().then((l) => alive && setConversations(l));
  return () => { alive = false; };
}, []);
const commit = useCallback((updater) => {
  setConversations((prev) => { const next = updater(prev); void saveConversations(next); return next; });
}, []);
```

**36. DO — extend `chatHistory.test.js`** with async cases: `loadConversations`
reads a legacy plaintext array; and reads a freshly `encryptJSON`-ed envelope.
Keep the existing `pruneConversations` tests.

**37. RUN-GATE — chat history store + hook tests pass.**
```powershell
cd frontend; npx vitest run src/services/chatHistory.test.js src/hooks/useRagChat --environment jsdom; cd ..
```

**38. DO — convert store #2: watchlists (`frontend/src/services/watchlistStorage.js`).**
`readWatchlistState`/`writeWatchlistState` become async with the same dual-read.
Update every caller (the watchlist hooks/components) to `await` / effect them.
Keep `normalizeWatchlistState` + caps (`MAX_WATCHLIST_GROUPS`,
`MAX_WATCHLIST_ITEMS_PER_GROUP`) pure & synchronous.

**39. DO — update watchlist tests** for the async read/write surface; reuse the
existing 31 watchlist assertions (`useWatchlistStore`, `Watchlist`,
`WatchlistPage`).

**40. RUN-GATE — watchlist suites pass.**
```powershell
cd frontend; npx vitest run useWatchlistStore Watchlist WatchlistPage watchlistStorage --environment jsdom; cd ..
```

**41. DO — convert store #3: analysis-history summaries (`frontend/src/hooks/useAnalysisHistoryStore.js`).**
`readHistory`/`writeHistory`/`saveToHistory`/`removeHistoryItem`/`clearHistory`
become async + dual-read. `toHistorySummary` and the `decisionStyle`/format
helpers stay pure. Update callers.

**42. DO — update analysis-history tests** for the async surface.

**43. RUN-GATE — analysis-history tests pass.**
```powershell
cd frontend; npx vitest run useAnalysisHistoryStore AnalysisWorkspace AnalysisHistory --environment jsdom; cd ..
```

**44. DO — confirm the deliberate non-targets (leave as plaintext):**
- `utils/recentTickers.js`, `utils/tickerSearchCache.js`, `hooks/useMarketOverviewConfig.js` — public/UI data, **not** encrypted.
- All `sessionStorage` caches (`useTickerNews`, `useGeneralNews`, `useMarketOverviewData`) — public vendor data, die on tab close, **not** encrypted.
- `ta_owner_token` cookie — httpOnly + HMAC-signed server-side (`owner_session.py`); browser JS must not read it. **Untouched.**
Write a one-line comment in each non-target file stating why it is intentionally plaintext (so a future reviewer doesn't "finish the job").

**45. RUN-GATE — full frontend gate.**
```powershell
cd frontend; npm run lint; npm test -- --run; cd ..
```
Whole frontend suite green ⇒ the async ripple touched nothing it shouldn't.

**46. RUN-GATE — app runs end-to-end in the browser.**
Start backend + frontend, open the app:
- Chatbot history loads & persists across reload.
- Watchlist loads, add/remove persists.
- Analysis history loads.
- DevTools → Application → Local Storage: the three converted keys are now
  `{"v":1,"iv":...,"ct":...}` envelopes, **not** readable JSON.
This is the "program runs" proof for Phase 2.

**47. ROLLBACK (Phase 2).** Encryption is **forward-compatible** (dual-read), but
full revert is **lossy**: old synchronous code can't read envelopes. If you may
roll back, keep the async dual-read `load*` and only drop the `await encryptJSON`
on save — reverting then stops encrypting new writes while still reading old
plaintext. **Plan this before shipping.** Note: clearing IndexedDB or "clear site
data" destroys the device key ⇒ encrypted values become unrecoverable.

---

## Phase 3 — Finalize

**48. RUN-GATE — full backend quality.**
```powershell
cd backend; .\scripts\quality.ps1; cd ..
```

**49. RUN-GATE — full frontend quality.**
```powershell
cd frontend; npm run quality; cd ..
```

**50. DO — docs.** Update `ai/setup.md` (new env vars, Postgres + Docker steps),
`ai/architecture.md` (storage backends), `backend/.env.example` (placeholders),
and the data-audit notes. Confirm the report disclaimer is intact (never remove).

**51. DO — commit (Conventional Commits), no secrets.**
```powershell
git add -A
git status   # verify backend/.env is NOT staged (it is gitignored)
git commit -m "feat(storage): add Postgres backend for analyses and AES-GCM localStorage encryption"
```

**52. RUN-GATE — final boot from a clean state.**
Stop everything, `docker compose up -d postgres`, start the backend, hit
`/health`, load the frontend. Green = done. If any RUN-GATE in the run failed and
was not resolved, the migration is **not** complete — use the nearest ROLLBACK.

---

## Complete checklist (tick every box)

Pre-flight: ☐1 ☐2 ☐3 ☐4 ☐5 ☐6
Postgres: ☐7 ☐8 ☐9 ☐10 ☐11 ☐12 ☐13 ☐14 ☐15 ☐16 ☐17 ☐18 ☐19 ☐20 ☐21 ☐22 ☐23 ☐24 ☐25 ☐26 ☐27 ☐28 ☐29 ☐30
Encryption: ☐31 ☐32 ☐33 ☐34 ☐35 ☐36 ☐37 ☐38 ☐39 ☐40 ☐41 ☐42 ☐43 ☐44 ☐45 ☐46 ☐47
Finalize: ☐48 ☐49 ☐50 ☐51 ☐52

Every ☐ that is a **RUN-GATE** must be green before the next box. A red gate
means the program does not run / tests fail — stop and fix or roll back. Nothing
in this list is optional; skipping a port method or a test is how the program
breaks at runtime instead of at the gate.
