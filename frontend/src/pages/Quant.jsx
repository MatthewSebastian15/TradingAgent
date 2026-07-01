import React, { useCallback, useEffect, useRef, useState } from 'react';

import { getMarketOhlcv } from '../api/market';
import QuantPanel from '../components/results/tabs/QuantPanel';
import TickerSearchBar from '../components/TickerSearchBar';
import { fetchAnalysisHistory, fetchAnalysisHistoryResult } from '../utils/analysisHistoryApi';

// Backend /market/ohlcv range keys. Longer ranges (2Y/5Y) give MC, backtest, Hurst
// and regime detection enough history. 1M (~21 trading days) trips the <30-day notice.
const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y'];
const DEFAULT_RANGE = '1Y';

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
  const abortRef = useRef(null);

  // Load the analysis-history list once for the "Load from history" dropdown.
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

  function handleHistory(event) {
    const id = event.target.value;
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
      <main className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-sm font-bold tracking-[0.35em] text-bloomberg-orange uppercase">
              Quant
            </h1>
            <div className="w-72">
              <TickerSearchBar
                value={ticker}
                onSelect={(item) => loadTicker(item.symbol, range)}
                onClear={() => {}}
                onSubmit={(raw) => loadTicker(raw, range)}
                placeholder="Search ticker symbol"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {history.length > 0 && (
              <select
                onChange={handleHistory}
                defaultValue=""
                className="h-8 border border-bloomberg-border bg-black px-2 font-mono text-[11px] tracking-wider text-bloomberg-muted uppercase"
              >
                <option value="">Load from history ▾</option>
                {history.map((it) => {
                  const id = it.request_id || it.job_id;
                  return (
                    <option key={id} value={id}>
                      {it.ticker || it.normalized_ticker || '—'}
                      {it.trade_date ? ` · ${it.trade_date}` : ''}
                    </option>
                  );
                })}
              </select>
            )}
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRange(r)}
                  className={`h-8 rounded-none border px-2.5 font-mono text-[11px] tracking-wider ${
                    range === r
                      ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                      : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

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
          <QuantPanel points={loading ? [] : points} currency={currency} symbol={ticker} />
        )}
      </main>
    </div>
  );
}
