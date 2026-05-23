import React, { useEffect, useState, useRef } from 'react';
import { buildApiUrl, buildAuthHeaders, buildHeaders, readHttpError } from '../utils/api';

const DEFAULT_DEBATE_ROUNDS = 3;

const MARKETS = {
  US: {
    label: 'US',
    flag: '🇺🇸',
    defaultTicker: 'NVDA',
    tickers: ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'META'],
  },
  ID: {
    label: 'INDONESIA',
    flag: '🇮🇩',
    defaultTicker: 'BBCA.JK',
    tickers: ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'BMRI.JK', 'ASII.JK', 'GOTO.JK'],
  },
  GLOBAL: {
    label: 'GLOBAL',
    flag: '🌐',
    defaultTicker: '700.HK',
    tickers: ['700.HK', '9984.T', 'SAP.DE', 'RIO.L', 'TSM'],
  },
};

const DEPTH_OPTIONS = [
  { value: 'fast',     label: 'FAST',     runtime: 'LOWER GEMINI COST' },
  { value: 'balanced', label: 'BALANCED', runtime: 'DEFAULT 9-CALL PIPELINE' },
  { value: 'deep',     label: 'DEEP',     runtime: 'MORE RETRIES / MORE PATIENCE' },
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseSseBlock(block) {
  const ev = { type: 'message', data: [] };
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;
    const idx   = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') ev.type = value;
    if (field === 'data')  ev.data.push(value);
  }
  if (!ev.data.length) return null;
  try { return { type: ev.type, payload: JSON.parse(ev.data.join('\n')) }; }
  catch { return null; }
}

function MarketTab({ id, market, active, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      disabled={disabled}
      className={`
        flex-1 py-2.5 font-mono text-xs font-semibold tracking-wider
        border-b-2 transition-colors duration-150
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active
          ? 'border-bloomberg-orange text-bloomberg-orange bg-bloomberg-orange-dim'
          : 'border-transparent text-bloomberg-muted hover:text-bloomberg-white hover:border-bloomberg-subtle'}
      `}
    >
      <span className="mr-1">{market.flag}</span>
      {market.label}
    </button>
  );
}

function TickerChip({ label, active, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        px-2.5 py-1 text-xs font-mono border transition-colors duration-150
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active
          ? 'border-bloomberg-orange bg-bloomberg-orange-dim text-bloomberg-orange'
          : 'border-bloomberg-border bg-bloomberg-surface text-bloomberg-muted hover:border-bloomberg-subtle hover:text-bloomberg-white'}
      `}
    >
      {label}
    </button>
  );
}

export default function StockForm({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [activeMarket, setActiveMarket] = useState('US');
  const [ticker, setTicker]             = useState(MARKETS.US.defaultTicker);
  const [date, setDate]                 = useState(today());
  const [rounds, setRounds]             = useState(DEFAULT_DEBATE_ROUNDS);
  const [analysisDepth, setDepth]       = useState('balanced');
  const [responseDetail, setDetail]     = useState('full');
  const [error, setError]               = useState('');
  const [running, setRunning]           = useState(false);
  const abortRef                        = useRef(null);
  const jobIdRef                        = useRef(null);
  const mountedRef                      = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      cancelCurrentJob({ keepalive: true });
    };
  }, []);

  function abortError() {
    const err = new Error('Analysis aborted.');
    err.name = 'AbortError';
    return err;
  }

  function ensureMounted() {
    if (!mountedRef.current) throw abortError();
  }

  function handleMarketSwitch(marketId) {
    if (running) return;
    setActiveMarket(marketId);
    setTicker(MARKETS[marketId].defaultTicker);
    setError('');
  }

  function validate() {
    const t = ticker.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}([.\-][A-Z0-9]{1,5})?$/.test(t)) {
      return 'Invalid ticker. Examples: BBCA.JK, NVDA, 700.HK, SAP.DE';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Date must be YYYY-MM-DD';
    if (!['fast', 'balanced', 'deep'].includes(analysisDepth)) return 'Invalid analysis depth.';
    if (!['summary', 'full', 'debug'].includes(responseDetail)) return 'Invalid response detail.';
    return '';
  }

  function cancelCurrentJob({ keepalive = false } = {}) {
    const jobId = jobIdRef.current;
    if (!jobId) return Promise.resolve();

    const controller = keepalive ? null : new AbortController();
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), 3000) : null;

    return fetch(buildApiUrl(`/analysis/jobs/${jobId}`), {
        method: 'DELETE',
        headers: buildAuthHeaders(),
        signal: controller?.signal,
        keepalive,
      })
      .catch(() => {
      // Abort below still closes the client stream; backend cancellation is best-effort.
      })
      .finally(() => {
        if (timeoutId) window.clearTimeout(timeoutId);
      });
  }

  function stopAnalysis() {
    onStatus('Cancelling analysis...');
    abortRef.current?.abort();
    cancelCurrentJob();
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (running) {
      stopAnalysis();
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      onResult({ error: validationError });
      return;
    }

    setError('');
    setRunning(true);
    onLoading(true);
    onStatus('Creating analysis job...');
    onResult(null);
    if (onAgentProgress) onAgentProgress(null);

    try {
      await runJobStream();
    } catch (ex) {
      if (!mountedRef.current) return;
      if (ex.name === 'AbortError') {
        onResult({ error: 'Analysis cancelled.' });
      } else {
        onResult({ error: ex.message || 'Analysis failed.' });
      }
    } finally {
      if (!mountedRef.current) return;
      setRunning(false);
      onLoading(false);
      onStatus('');
      abortRef.current = null;
      jobIdRef.current = null;
    }
  }

  async function runJobStream() {
    const controller = new AbortController();
    abortRef.current = controller;

    const payload = {
      ticker:            ticker.trim().toUpperCase(),
      trade_date:        date,
      max_debate_rounds: Number(rounds),
      analysis_depth:    analysisDepth,
      response_detail:   responseDetail,
    };

    const createRes = await fetch(buildApiUrl('/analysis/jobs'), {
      method:  'POST',
      headers: buildHeaders(),
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    if (!createRes.ok) throw new Error(await readHttpError(createRes));
    ensureMounted();
    const job = await createRes.json();
    ensureMounted();
    jobIdRef.current = job.job_id;
    onStatus(`Job queued: ${job.job_id}`);

    const streamRes = await fetch(buildApiUrl(`/analysis/jobs/${job.job_id}/events`), {
      method:  'GET',
      headers: buildAuthHeaders(),
      signal:  controller.signal,
    });

    if (!streamRes.ok) throw new Error(await readHttpError(streamRes));
    if (!streamRes.body) throw new Error('SSE stream not supported by browser.');
    ensureMounted();

    const reader  = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      ensureMounted();
      const { done, value } = await reader.read();
      if (done) break;
      ensureMounted();
      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split(/\r?\n\r?\n/);
      buf = blocks.pop() || '';

      for (const block of blocks) {
        const event = parseSseBlock(block);
        if (!event) continue;
        ensureMounted();

        if (event.type === 'job') {
          onStatus(`Job status: ${(event.payload.status || 'queued').toUpperCase()}`);
          if (event.payload.result) {
            onResult(event.payload.result);
            return;
          }
          if (event.payload.error) {
            const errorPayload = event.payload.error.error || event.payload.error.message || event.payload.error;
            const message = typeof errorPayload === 'string' ? errorPayload : errorPayload.message;
            const rid = event.payload.error.request_id ? ` [${event.payload.error.request_id}]` : '';
            onResult({ error: `${message || 'Analysis failed.'}${rid}` });
            return;
          }
        }
        if (event.type === 'heartbeat') {
          onStatus(`Pipeline heartbeat: ${(event.payload.status || 'running').toUpperCase()}`);
        }
        if (event.type === 'progress') {
          onStatus(event.payload.status_message || 'Running...');
          if (onAgentProgress) onAgentProgress(event.payload);
        }
        if (event.type === 'result') {
          onResult(event.payload);
          return;
        }
        if (event.type === 'error') {
          const errorPayload = event.payload.error || event.payload.message || 'Error';
          const message = typeof errorPayload === 'string' ? errorPayload : errorPayload.message;
          const rid = event.payload.request_id ? ` [${event.payload.request_id}]` : '';
          onResult({ error: `${message || 'Analysis failed.'}${rid}` });
          return;
        }
      }
    }
  }

  const selectedDepth = DEPTH_OPTIONS.find(item => item.value === analysisDepth);
  const currentMarket = MARKETS[activeMarket];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-0">

      {/* Header */}
      <div className="px-4 py-2.5 border-b border-bloomberg-border flex items-center gap-2">
        <span className="text-bloomberg-orange font-mono text-xs font-semibold tracking-wider">NEW ANALYSIS</span>
        <span className="text-bloomberg-muted font-mono text-xs">/ CONFIGURE PARAMETERS</span>
      </div>

      {/* Market tabs */}
      <div className="flex border-b border-bloomberg-border bg-bloomberg-surface">
        {Object.entries(MARKETS).map(([id, market]) => (
          <MarketTab
            key={id}
            id={id}
            market={market}
            active={activeMarket === id}
            disabled={running}
            onClick={handleMarketSwitch}
          />
        ))}
      </div>

      <div className="p-4 flex flex-col gap-4">

        {/* Ticker input */}
        <div>
          <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
            TICKER SYMBOL
            <span className="ml-2 text-bloomberg-border normal-case font-normal">
              {activeMarket === 'ID'
                ? '· IDX (append .JK)'
                : activeMarket === 'GLOBAL'
                ? '· Global Exchange'
                : '· NYSE / NASDAQ'}
            </span>
          </label>
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g,'').slice(0,12))}
            placeholder={currentMarket.defaultTicker}
            required
            disabled={running}
            className="
              w-full bg-black border border-bloomberg-border px-3 py-2.5
              font-mono text-sm text-bloomberg-white tracking-wider
              focus:outline-none focus:border-bloomberg-orange
              disabled:opacity-50 transition-colors duration-150
              placeholder:text-bloomberg-muted
            "
          />

          {/* Quick-pick chips */}
          <div className="mt-2">
            <div className="text-xs font-mono text-bloomberg-muted mb-1.5 tracking-wider">
              {currentMarket.flag} QUICK-PICK
            </div>
            <div className="flex flex-wrap gap-1.5">
              {currentMarket.tickers.map(t => (
                <TickerChip
                  key={t}
                  label={t}
                  active={ticker === t}
                  onClick={() => setTicker(t)}
                  disabled={running}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Date + Rounds */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
              TRADE DATE
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={running}
              required
              className="
                w-full bg-black border border-bloomberg-border px-3 py-2.5
                font-mono text-xs text-bloomberg-white tracking-wider
                focus:outline-none focus:border-bloomberg-orange
                disabled:opacity-50 transition-colors duration-150
              "
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
              DEBATE ROUNDS
            </label>
            <select
              value={rounds}
              onChange={e => setRounds(Number(e.target.value))}
              disabled={running}
              className="
                w-full bg-black border border-bloomberg-border px-3 py-2.5
                font-mono text-xs text-bloomberg-white tracking-wider
                focus:outline-none focus:border-bloomberg-orange
                disabled:opacity-50 transition-colors duration-150 cursor-pointer
              "
            >
              {[1,2,3,4,5].map(n => (
                <option key={n} value={n} className="bg-black">{n} ROUND{n>1?'S':''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Depth + Detail */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
              ANALYSIS DEPTH
            </label>
            <select
              value={analysisDepth}
              onChange={e => setDepth(e.target.value)}
              disabled={running}
              className="
                w-full bg-black border border-bloomberg-border px-3 py-2.5
                font-mono text-xs text-bloomberg-white tracking-wider
                focus:outline-none focus:border-bloomberg-orange
                disabled:opacity-50 transition-colors duration-150 cursor-pointer
              "
            >
              {DEPTH_OPTIONS.map(option => (
                <option key={option.value} value={option.value} className="bg-black">{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
              RESPONSE
            </label>
            <select
              value={responseDetail}
              onChange={e => setDetail(e.target.value)}
              disabled={running}
              className="
                w-full bg-black border border-bloomberg-border px-3 py-2.5
                font-mono text-xs text-bloomberg-white tracking-wider
                focus:outline-none focus:border-bloomberg-orange
                disabled:opacity-50 transition-colors duration-150 cursor-pointer
              "
            >
              <option value="summary" className="bg-black">SUMMARY</option>
              <option value="full"    className="bg-black">FULL</option>
              <option value="debug"   className="bg-black">DEBUG</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-bloomberg-red bg-bloomberg-red-dim px-3 py-2">
            <span className="font-mono text-xs text-bloomberg-red">ERR: {error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          className={`
            w-full py-3 font-mono text-xs font-semibold tracking-widest uppercase
            transition-all duration-150 border active:scale-[0.99]
            ${running
              ? 'bg-bloomberg-red-dim border-bloomberg-red text-bloomberg-red hover:bg-bloomberg-red hover:text-black'
              : 'bg-bloomberg-orange border-bloomberg-orange text-black hover:bg-orange-400 hover:border-orange-400'}
          `}
        >
          {running ? '■ STOP ANALYSIS' : '▶ EXECUTE ANALYSIS'}
        </button>

        <div className="text-center font-mono text-xs text-bloomberg-muted tracking-wider">
          {selectedDepth?.label || 'BALANCED'} / {selectedDepth?.runtime || 'DEFAULT PIPELINE'}
        </div>
      </div>
    </form>
  );
}
