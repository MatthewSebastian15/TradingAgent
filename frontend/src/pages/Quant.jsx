import React, { useCallback, useEffect, useRef, useState } from 'react';

import { getMarketOhlcv } from '../api/market';
import { DEFAULT_SECTION } from '../components/results/tabs/quant/config';
import { QuantEmptyState } from '../components/results/tabs/quant/QuantEmptyState';
import { QuantSidebar } from '../components/results/tabs/quant/QuantSidebar';
import QuantPanel from '../components/results/tabs/QuantPanel';
import TickerSearchBar from '../components/TickerSearchBar';
import { fetchAnalysisHistory, fetchAnalysisHistoryResult } from '../utils/analysisHistoryApi';
import { readRecentTickers } from '../utils/recentTickers';

// Backend /market/ohlcv range keys. Longer ranges (2Y/5Y) give MC, backtest, Hurst
// and regime detection enough history. 1M (~21 trading days) trips the <30-day notice.
const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y'];
const DEFAULT_RANGE = '1Y';
const SMALL_SCREEN = '(max-width: 1023px)';

// Below Tailwind `lg` the sidebar starts collapsed and closes after navigation.
function isSmallScreen() {
  try {
    return window.matchMedia?.(SMALL_SCREEN).matches ?? false;
  } catch {
    return false;
  }
}

function pointsFromResult(result) {
  return result?.price_chart?.points ?? [];
}

function currencyFromResult(result) {
  return result?.price_chart?.currency || result?.currency || '';
}

export default function Quant() {
  const [ticker, setTicker] = useState('');
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [points, setPoints] = useState(null); // null = nothing loaded yet
  const [currency, setCurrency] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [section, setSection] = useState(DEFAULT_SECTION);
  const [collapsed, setCollapsed] = useState(isSmallScreen);
  const abortRef = useRef(null);

  // Load the analysis-history list once for the "Load from history" list.
  useEffect(() => {
    const controller = new AbortController();
    fetchAnalysisHistory({ limit: 25, signal: controller.signal })
      .then((items) => setHistory(items.filter((it) => it?.request_id || it?.job_id)))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Esc closes the floating sidebar on small screens.
  useEffect(() => {
    if (collapsed) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && isSmallScreen()) setCollapsed(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed]);

  // Single in-flight fetch; abort the previous one on a new request.
  const run = useCallback((work) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    work(controller.signal)
      .then(({ points: pts, currency: ccy }) => {
        if (controller.signal.aborted) return;
        setPoints(pts);
        setCurrency(ccy);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setPoints([]);
        setError(err?.message || 'Failed to load price series.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  const loadTicker = useCallback(
    (sym, rng) => {
      const symbol = String(sym || '')
        .trim()
        .toUpperCase();
      if (!symbol) return;
      setTicker(symbol);
      run(async (signal) => {
        const res = await getMarketOhlcv(symbol, { range: rng, signal });
        return { points: res?.points ?? [], currency: res?.currency || '' };
      });
    },
    [run]
  );

  function handleRange(rng) {
    setRange(rng);
    if (ticker) loadTicker(ticker, rng);
  }

  function loadHistory(id) {
    if (!id) return;
    const entry = history.find((it) => (it.request_id || it.job_id) === id);
    setTicker(entry?.ticker || entry?.normalized_ticker || '');
    // A past analysis carries its 1Y analysis chart; keep the range control truthful.
    setRange('1Y');
    run(async (signal) => {
      const res = await fetchAnalysisHistoryResult(id, { signal });
      return { points: pointsFromResult(res), currency: currencyFromResult(res) };
    });
  }

  function selectSection(id) {
    setSection(id);
    if (isSmallScreen()) setCollapsed(true);
  }

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-10">
      <div className="flex min-h-[calc(100vh-60px)]">
        <QuantSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          activeSection={section}
          onSelectSection={selectSection}
        >
          <TickerSearchBar
            value={ticker}
            onSelect={(item) => loadTicker(item.symbol, range)}
            onClear={() => {}}
            onSubmit={(raw) => loadTicker(raw, range)}
            placeholder="Search ticker symbol"
          />

          <div role="group" aria-label="Date range" className="flex flex-wrap gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => handleRange(r)}
                className={`h-7 rounded-none border px-2 font-mono text-[11px] tracking-wider focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange ${
                  range === r
                    ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                    : 'border-bloomberg-border text-bloomberg-white/80 hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {history.length > 0 && (
            <div className="space-y-1">
              <div className="font-mono text-[10px] tracking-wider text-bloomberg-white/80 uppercase">
                History
              </div>
              <div className="max-h-52 overflow-y-auto border border-bloomberg-border [&::-webkit-scrollbar]:hidden">
                {history.map((it) => {
                  const id = it.request_id || it.job_id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => loadHistory(id)}
                      className="flex w-full items-center justify-between border-b border-[#1a1a1a] px-2 py-1.5 text-left font-mono text-[11px] text-bloomberg-white last:border-b-0 hover:text-bloomberg-orange focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-bloomberg-orange"
                    >
                      <span>{it.ticker || it.normalized_ticker || '—'}</span>
                      {it.trade_date && (
                        <span className="text-[10px] text-bloomberg-white/80">{it.trade_date}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </QuantSidebar>

        {!collapsed && (
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setCollapsed(true)}
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          />
        )}

        <main className="min-w-0 flex-1 space-y-4 px-4 py-4">
          {error && (
            <div className="border border-bloomberg-red/50 bg-bloomberg-card p-3 font-mono text-xs text-bloomberg-red">
              {error}
            </div>
          )}

          {points === null && !loading && !error && (
            <QuantEmptyState
              onPick={(symbol) => loadTicker(symbol, range)}
              recent={readRecentTickers({ limit: 6 }).map((item) => item.symbol)}
            />
          )}

          {/* QuantPanel renders its own skeleton (0 points) and <30-day notice. */}
          {(points !== null || loading) && (
            <QuantPanel
              points={loading ? [] : points}
              currency={currency}
              symbol={ticker}
              range={range}
              section={section}
              onSectionChange={selectSection}
            />
          )}
        </main>
      </div>
    </div>
  );
}
