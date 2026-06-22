# Performance Scan — TradingAgent

**Scan date:** 2026-06-22
**Total findings:** 15
**Critical:** 0 | **High:** 6 | **Medium:** 6 | **Low:** 3

---

## Summary

The most impactful issues are: (1) `_prompt_json()` truncates serialized JSON at an arbitrary character boundary, delivering malformed JSON to every LLM agent when context exceeds the char cap; (2) `persistent_cache.py` opens a new `sqlite3.connect()` on every `get()`, `set()`, and `delete()` call, adding 1–5 ms connection overhead to each cache operation; and (3) five module-level in-memory dicts in `backend/routes/market.py` have no size cap or eviction, accumulating indefinitely in a long-running server. Secondary issues are `indent=2` token waste across all LLM prompt paths and a double `yf.Ticker.info` HTTP fetch per pipeline run.

---

## Findings by Category

### CAT-1: I/O Blocking on Async Event Loop

| # | Severity | File | Line | Issue | Fix |
|---|---|---|---|---|---|
| 1 | MEDIUM | `backend/storage_backends.py` | 13 | TODO confirms `SQLiteTTLCache.get()` is synchronous but `AnalysisResultCache` callers expect an async `get()` interface; any new caller that awaits this without a thread wrapper will block the event loop | Enforce one contract: wrap call sites in `asyncio.to_thread()` or convert the protocol to async using `aiosqlite` |

### CAT-2: Redundant Network Fetches

| # | Severity | File | Line | Issue | Fix |
|---|---|---|---|---|---|
| 2 | HIGH | `packages/tradingagents/dataflows/providers/y_finance.py` | 641, 788 | `get_fundamentals()` and `get_company_profile()` both call `yf_retry(lambda: ticker_obj.info)` on the same ticker; the pipeline invokes both per run, triggering two separate yfinance HTTP round-trips (each ~1–3 s) for identical data | Fetch `.info` once at the collection stage and pass it as an argument to both functions, or cache the result on the `ticker_obj` using a per-run key |
| 3 | MEDIUM | `backend/routes/market.py` | 264 | `_build_stock_overview()` calls `yf.Ticker(symbol).info` directly, bypassing the LRU-bounded `_get_ticker()` cache from `y_finance.py`; a concurrent pipeline run for the same symbol gets no cache benefit from the stock-overview path | Import and use `_get_ticker(symbol)` from `y_finance.py` in place of the bare `yf.Ticker(symbol)` construction |

### CAT-3: JSON Encode/Decode Roundtrips

| # | Severity | File | Line | Issue | Fix |
|---|---|---|---|---|---|
| 4 | LOW | `packages/tradingagents/pipeline_balanced_prompts.py` | 125–128, 166–169, 212–215 | When `_prompt_json()` truncates, `data_quality_json` is round-tripped: `json.loads(data_quality_json)` then immediately `json.dumps(quality_dict)` — parse then reserialize of data already in string form | Pass `data_quality` as a plain `dict` throughout the prompt-builder layer and call `json.dumps()` exactly once, at the LLM boundary |

### CAT-4: SQLite Connection Overhead

| # | Severity | File | Line | Issue | Fix |
|---|---|---|---|---|---|
| 5 | HIGH | `backend/persistent_cache.py` | 102–105 | `_connect()` calls `sqlite3.connect(self.db_path, timeout=30)` inside every `get()`, `set()`, `delete()`, and `stats()` invocation — a new OS-level file handle is opened and closed for every cache operation | Keep one persistent connection per `SQLiteTTLCache` instance (`sqlite3.connect(check_same_thread=False)`) guarded by the already-present `_write_lock`; open once in `__init__` |
| 6 | MEDIUM | `backend/persistent_cache.py` | 72 | `conn.execute("BEGIN IMMEDIATE")` acquires an exclusive write lock on every single-row insert; in WAL mode (set at line 109) this blocks all concurrent readers for the duration of even a trivial insert | Remove the explicit `BEGIN IMMEDIATE`; the context manager's implicit `BEGIN DEFERRED` suffices for single-row inserts and lets concurrent readers proceed |

### CAT-5: Sequential Execution Where Parallelism Is Possible

No confirmed issues. The three initial analyst agents run in parallel via `ThreadPoolExecutor` (`pipeline_balanced_orchestrator.py:486–494`). News vendors are parallelized via `ThreadPoolExecutor` in `route_to_vendor` for `get_news` (`interface.py:1003`). The remaining sequential vendor fallback chains are by design.

### CAT-6: Oversized Payloads Passed to LLM

| # | Severity | File | Line | Issue | Fix |
|---|---|---|---|---|---|
| 7 | HIGH | `packages/tradingagents/pipeline_balanced_prompts.py` | 71 | `_prompt_json()` serializes every context dict with `indent=2, ensure_ascii=False`; pretty-printed JSON consumes ~20–25 % of each 9 000–10 000 char budget as pure whitespace, reducing available data per LLM slot across all 8+ agent calls per run | Replace `indent=2` with `separators=(',', ':')` for compact output; LLMs parse compact JSON equally well |
| 8 | MEDIUM | `packages/tradingagents/pipeline_balanced_orchestrator.py` | 647 | `data_quality_json = json.dumps(data.data_quality.model_dump(), indent=2)` produces indented JSON that is injected verbatim into every agent prompt (market, news, fundamentals, bull, bear, research manager, trader, risk committee, portfolio manager) | Use `json.dumps(..., separators=(',', ':'))` to produce compact JSON for `data_quality_json` |
| 9 | HIGH | `packages/tradingagents/pipeline_balanced_prompts.py` | 73 | `text[:max_chars].rstrip()` truncates serialized JSON at an arbitrary character boundary; the resulting string is appended to the LLM prompt as broken JSON (mid-key or mid-value cuts), which the model must guess how to interpret or ignore | Truncate at the last complete top-level key before the char limit (e.g. walk backwards from the cut point to the preceding `},\n  "`) or pre-select a bounded subset of fields before serializing |
| 10 | MEDIUM | `packages/tradingagents/pipeline/collectors.py` | 304 | `json.dumps(indicators, indent=2, ensure_ascii=False)` serializes technical indicator output with indentation before it is passed as a context field; this enlarges the string injected into prompts | Replace `indent=2` with `separators=(',', ':')` |

### CAT-7: Frontend Render Performance

| # | Severity | File | Line | Issue | Fix |
|---|---|---|---|---|---|
| 11 | MEDIUM | `frontend/src/components/results/tabs/FundamentalTab.jsx` | 1588–1589 | `appendLegacyFundamentalSections()` and `groupFundamentalTableHighlights()` are called directly in the component body on every render; both iterate over all financial rows and periods to construct new objects, and they re-execute whenever any parent state (e.g. view-mode toggle) changes, even if `financialHighlights` and `result` have not changed | Wrap both calls in `useMemo` with `[financialHighlights, result, activeGroup]` as the dependency array |

No `console.log` in production paths found. No lists exceeding 50 items rendered without virtualization. `CandlestickPriceChart` and `FinancialHighlightsTable` are already `useMemo`-bounded.

### CAT-8: Memory Accumulation

| # | Severity | File | Line | Issue | Fix |
|---|---|---|---|---|---|
| 12 | HIGH | `backend/routes/market.py` | 65–68 | Five module-level dicts (`_QUOTE_CACHE`, `_SEARCH_CACHE`, `_OHLCV_CACHE`, `_SPARKLINE_CACHE`, `_OVERVIEW_CACHE`) have no maximum size and no eviction policy; in a long-running server, unique symbol combinations, query strings, and range keys accumulate indefinitely and are never purged | Cap each dict at a fixed maximum (e.g. 500–1 000 entries) using an `OrderedDict` with `popitem(last=False)` on overflow, or replace with `functools.lru_cache` on the underlying fetch functions |

`run_cache.py`'s `ShortLivedTickerCache` TTL-expires correctly. Frontend SSE hooks clean up on unmount. No other unbounded accumulators found.

### CAT-9: Duplicate or Dead Code

| # | Severity | File | Line | Issue | Fix |
|---|---|---|---|---|---|
| 13 | LOW | `frontend/src/components/results/tabs/FundamentalTab.jsx` | 686–708 | `expandYear()` and `displayPeriodLabel()` are defined identically in both `FundamentalTab.jsx` and `FinancialHighlightsTable.jsx`; divergence risk if one copy is updated | Extract both functions into a shared utility module (e.g. `fundamentalUtils.js`) and import from both files |
| 14 | LOW | `packages/tradingagents/dataflows/providers/interface.py` | 935–939 | `collect_vendor_numeric_values()` is documented as a "backward-compatible alias" for `collect_vendor_values()` and contains only a delegation call; it is never used in production paths | Update any test-only callers to use `collect_vendor_values()` directly and delete the alias |
| 15 | LOW | `backend/storage_backends.py` | 13 | TODO comment notes an unresolved async/sync contract mismatch between `TTLCacheBackend` (protocol) and `SQLiteTTLCache` (implementation); this is open-ended technical debt that risks future blocking if additional async callers are added | Resolve before adding a second storage backend: either make `SQLiteTTLCache` async-native or annotate the protocol as sync-only |

---

## Priority Fix Order

| Priority | Finding | Estimated Latency Impact |
|---|---|---|
| 1 | #9 — Arbitrary JSON truncation corrupts LLM prompts (`pipeline_balanced_prompts.py:73`) | High — malformed prompt context degrades agent output quality on every truncated run |
| 2 | #5 — New `sqlite3.connect()` per cache operation (`persistent_cache.py:102`) | High — 1–5 ms per get/set, multiplied across every vendor data call in the pipeline |
| 3 | #2 — Double `yf.Ticker.info` HTTP fetch per pipeline run (`y_finance.py:641, 788`) | High — ~1–3 s extra per analysis run (one redundant yfinance round-trip) |
| 4 | #12 — Unbounded in-memory caches in market routes (`routes/market.py:65–68`) | High — memory grows without limit in a production server; no impact per-request but degrades over time |
| 5 | #7 — `indent=2` in `_prompt_json()` wastes 20–25 % of every LLM context slot (`pipeline_balanced_prompts.py:71`) | Medium — token budget reduced by ~2 000 chars per agent per run; forces earlier truncation |
| 6 | #8 — `indent=2` for `data_quality_json` injected into all 8+ agent prompts (`pipeline_balanced_orchestrator.py:647`) | Medium — redundant whitespace in every prompt; minor but cumulative |
| 7 | #11 — Missing `useMemo` for `appendLegacyFundamentalSections` + `groupFundamentalTableHighlights` (`FundamentalTab.jsx:1588`) | Medium — unnecessary O(rows × periods) recalculation on every render cycle |
| 8 | #6 — `BEGIN IMMEDIATE` on every single-row insert blocks concurrent readers (`persistent_cache.py:72`) | Medium — reader blocking during writes; noticeable under concurrent load |
| 9 | #10 — `indent=2` in `collectors.py` for indicators field (`collectors.py:304`) | Medium — token waste in technical indicator prompt context |
| 10 | #3 — Stock overview bypasses `_get_ticker()` LRU cache (`routes/market.py:264`) | Medium — creates redundant `yf.Ticker` object; missed cache-sharing benefit |
| 11 | #4 — JSON parse-then-reserialize on truncation (`pipeline_balanced_prompts.py:125`) | Low — overhead only when truncation occurs; not on every run |
| 12 | #1 — Async/sync mismatch TODO in `storage_backends.py:13` | Low — latent risk; not currently triggering observable latency |
| 13 | #13 — Duplicate `expandYear`/`displayPeriodLabel` in two frontend files | Low — code smell / maintenance risk only |
| 14 | #14 — Backward-compat alias `collect_vendor_numeric_values` (`interface.py:935`) | Low — dead weight; no runtime impact |
| 15 | #15 — Unresolved storage backend TODO (`storage_backends.py:13`) | Low — tech debt; no current latency impact |

---

## Files Scanned

```
backend/persistent_cache.py
backend/routes/market.py
backend/storage_backends.py
packages/tradingagents/dataflows/providers/y_finance.py
packages/tradingagents/dataflows/providers/interface.py
packages/tradingagents/pipeline_balanced_prompts.py
packages/tradingagents/pipeline_balanced_orchestrator.py
packages/tradingagents/pipeline_balanced_llm.py
packages/tradingagents/graph/run_cache.py
packages/tradingagents/pipeline/collectors.py
frontend/src/hooks/useMarketOverviewData.js
frontend/src/hooks/useTickerNews.js
frontend/src/hooks/useTickerNewsStream.js
frontend/src/hooks/useGeneralNewsStream.js
frontend/src/components/results/FinancialHighlightsTable.jsx
frontend/src/components/results/tabs/FundamentalTab.jsx
frontend/src/components/results/tabs/CandlestickPriceChart.jsx
```
