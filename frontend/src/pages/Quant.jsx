import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { getMarketOhlcv } from '../api/market';
import QuantPanel from '../components/results/tabs/QuantPanel';
import TickerSearchBar from '../components/TickerSearchBar';
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH } from '../constants/sidebar';
import { fetchAnalysisHistory, fetchAnalysisHistoryResult } from '../utils/analysisHistoryApi';

// Backend /market/ohlcv range keys. Longer ranges (2Y/5Y) give MC, backtest, Hurst
// and regime detection enough history. 1M (~21 trading days) trips the <30-day notice.
const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y'];
const DEFAULT_RANGE = '1Y';

// Quant tab sections shown in the sidebar picker; ids drive QuantPanel's `sections`.
const SECTIONS = [
  { id: 'volatility', label: 'Volatility' },
  { id: 'risk', label: 'Risk' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'stochastic', label: 'Stochastic' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'sizing', label: 'Sizing' },
  { id: 'correlation', label: 'Correlation' },
  { id: 'options', label: 'Options' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'scenario', label: 'Scenario' },
];
const ALL_SECTION_IDS = SECTIONS.map((s) => s.id);

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
  const [selected, setSelected] = useState(ALL_SECTION_IDS); // visible quant tabs
  const [collapsed, setCollapsed] = useState(false);
  const abortRef = useRef(null);

  const allOn = selected.length === ALL_SECTION_IDS.length;
  const toggleAll = () => setSelected(allOn ? [] : ALL_SECTION_IDS);
  const toggleSection = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Load the analysis-history list once for the "Load from history" list.
  useEffect(() => {
    const controller = new AbortController();
    fetchAnalysisHistory({ limit: 25, signal: controller.signal })
      .then((items) => setHistory(items.filter((it) => it?.request_id || it?.job_id)))
      .catch(() => {});
    return () => controller.abort();
  }, []);

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
    run(async (signal) => {
      const res = await fetchAnalysisHistoryResult(id, { signal });
      return { points: pointsFromResult(res), currency: currencyFromResult(res) };
    });
  }

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-10">
      <div className="flex min-h-[calc(100vh-60px)]">
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className={`sticky top-[60px] flex h-[calc(100vh-60px)] ${SIDEBAR_COLLAPSED_WIDTH} shrink-0 items-center justify-center border-r border-bloomberg-border bg-bloomberg-surface text-bloomberg-orange transition-all duration-200`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <aside
            className={`sticky top-[60px] flex h-[calc(100vh-60px)] ${SIDEBAR_EXPANDED_WIDTH} shrink-0 flex-col overflow-y-auto border-r border-bloomberg-border bg-bloomberg-surface transition-all duration-200 [&::-webkit-scrollbar]:hidden`}
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-bloomberg-border px-3">
              <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-bloomberg-orange uppercase">
                Quant
              </span>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                className="text-bloomberg-orange"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 p-3">
              <TickerSearchBar
                value={ticker}
                onSelect={(item) => loadTicker(item.symbol, range)}
                onClear={() => {}}
                onSubmit={(raw) => loadTicker(raw, range)}
                placeholder="Search ticker symbol"
              />

              <div className="flex flex-wrap gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRange(r)}
                    className={`h-7 rounded-none border px-2 font-mono text-[11px] tracking-wider ${
                      range === r
                        ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                        : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {history.length > 0 && (
                <div className="space-y-1">
                  <div className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
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
                          className="flex w-full items-center justify-between border-b border-[#1a1a1a] px-2 py-1.5 text-left font-mono text-[11px] text-bloomberg-white last:border-b-0 hover:text-bloomberg-orange"
                        >
                          <span>{it.ticker || it.normalized_ticker || '—'}</span>
                          {it.trade_date && (
                            <span className="text-[10px] text-bloomberg-muted">
                              {it.trade_date}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-wider text-bloomberg-muted uppercase">
                    Tabs
                  </span>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className={`rounded-none border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${
                      allOn
                        ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                        : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
                    }`}
                  >
                    All
                  </button>
                </div>
                <div className="flex flex-col">
                  {SECTIONS.map((s) => {
                    const on = selected.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSection(s.id)}
                        className={`flex items-center gap-2 border-l-2 px-2 py-1.5 text-left font-mono text-[11px] uppercase ${
                          on
                            ? 'border-l-bloomberg-orange text-bloomberg-orange'
                            : 'border-l-transparent text-bloomberg-muted hover:text-white'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-2.5 w-2.5 border ${
                            on
                              ? 'border-bloomberg-orange bg-bloomberg-orange'
                              : 'border-bloomberg-border'
                          }`}
                        />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        )}

        <main className="flex-1 space-y-4 px-4 py-4">
          {error && (
            <div className="border border-bloomberg-red/50 bg-bloomberg-card p-3 font-mono text-xs text-bloomberg-red">
              {error}
            </div>
          )}

          {points === null && !loading && !error && (
            <div className="border border-bloomberg-border bg-bloomberg-card p-8 text-center font-mono text-xs tracking-wider text-bloomberg-muted uppercase">
              Search a ticker or load a past analysis to run quant analytics.
            </div>
          )}

          {/* QuantPanel renders its own skeleton (0 points) and <30-day notice. */}
          {(points !== null || loading) && (
            <QuantPanel
              points={loading ? [] : points}
              currency={currency}
              symbol={ticker}
              sections={selected}
            />
          )}
        </main>
      </div>
    </div>
  );
}
