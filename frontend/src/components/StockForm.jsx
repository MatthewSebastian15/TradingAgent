import React, { useState, useRef } from 'react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const API_KEY = import.meta.env.VITE_API_KEY || '';

function buildApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = API_URL || 'http://localhost:8000';
  return base.endsWith('/api') ? `${base}${cleanPath}` : `${base}/api${cleanPath}`;
}
const DEFAULT_DEBATE_ROUNDS = clampRounds(import.meta.env.VITE_DEFAULT_MAX_DEBATE_ROUNDS || 1);

const IDX_TICKERS = ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'BMRI.JK', 'ASII.JK', 'GOTO.JK'];
const US_TICKERS  = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'META'];

function clampRounds(v) {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(5, Math.max(1, n)) : 1;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function buildHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (API_KEY) h['x-api-key'] = API_KEY;
  return h;
}

async function readHttpError(res) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j.error?.message || j.message || `HTTP ${res.status}`;
  } catch { return `HTTP ${res.status}: ${text || res.statusText}`; }
}

function parseSseBlock(block) {
  const ev = { type: 'message', data: [] };
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') ev.type = value;
    if (field === 'data') ev.data.push(value);
  }
  if (!ev.data.length) return null;
  try { return { type: ev.type, payload: JSON.parse(ev.data.join('\n')) }; }
  catch { return null; }
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
  const [ticker, setTicker]   = useState('NVDA');
  const [date, setDate]       = useState(today());
  const [rounds, setRounds]   = useState(DEFAULT_DEBATE_ROUNDS);
  const [error, setError]     = useState('');
  const [running, setRunning] = useState(false);
  const abortRef              = useRef(null);

  function validate() {
    const t = ticker.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}([.\-][A-Z0-9]{1,5})?$/.test(t))
      return 'Invalid ticker. Examples: BBCA.JK, NVDA, BRK-B';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return 'Date must be YYYY-MM-DD';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); onResult({ error: err }); return; }
    setError('');
    setRunning(true);
    onLoading(true);
    onStatus('Connecting to agent pipeline...');
    onResult(null);
    if (onAgentProgress) onAgentProgress(null);
    try { await runStream(); }
    catch (ex) { onResult({ error: ex.message || 'Analysis failed.' }); }
    finally { setRunning(false); onLoading(false); onStatus(''); abortRef.current = null; }
  }

  async function runStream() {
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch(buildApiUrl('/analyze/stream'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ ticker: ticker.trim().toUpperCase(), trade_date: date, max_debate_rounds: rounds }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(await readHttpError(res));
    if (!res.body) throw new Error('SSE stream not supported by browser.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split(/\r?\n\r?\n/);
      buf = blocks.pop() || '';
      for (const block of blocks) {
        const ev = parseSseBlock(block);
        if (!ev) continue;
        if (ev.type === 'progress') {
          onStatus(ev.payload.status_message || 'Running...');
          if (onAgentProgress) onAgentProgress(ev.payload);
        }
        if (ev.type === 'result') { onResult(ev.payload); return; }
        if (ev.type === 'error') {
          const rid = ev.payload.request_id ? ` [${ev.payload.request_id}]` : '';
          onResult({ error: (ev.payload.error || ev.payload.message || 'Error') + rid });
          return;
        }
      }
    }
    if (buf.trim()) {
      const ev = parseSseBlock(buf);
      if (ev?.type === 'result') onResult(ev.payload);
      if (ev?.type === 'error') onResult({ error: ev.payload.error || 'Error' });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-0">
      {/* Form header */}
      <div className="px-4 py-2.5 border-b border-bloomberg-border flex items-center gap-2">
        <span className="text-bloomberg-orange font-mono text-xs font-semibold tracking-wider">NEW ANALYSIS</span>
        <span className="text-bloomberg-muted font-mono text-xs">/ CONFIGURE PARAMETERS</span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Ticker */}
        <div>
          <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
            TICKER SYMBOL
          </label>
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g,'').slice(0,12))}
            placeholder="e.g. BBCA.JK"
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

          <div className="mt-2">
            <div className="text-xs font-mono text-bloomberg-muted mb-1.5 tracking-wider">IDX</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {IDX_TICKERS.map(t => (
                <TickerChip key={t} label={t} active={ticker===t} onClick={()=>setTicker(t)} disabled={running} />
              ))}
            </div>
            <div className="text-xs font-mono text-bloomberg-muted mb-1.5 tracking-wider">US</div>
            <div className="flex flex-wrap gap-1.5">
              {US_TICKERS.map(t => (
                <TickerChip key={t} label={t} active={ticker===t} onClick={()=>setTicker(t)} disabled={running} />
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

        {/* Error */}
        {error && (
          <div className="border border-bloomberg-red bg-bloomberg-red-dim px-3 py-2">
            <span className="font-mono text-xs text-bloomberg-red">ERR: {error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={running}
          className="
            w-full py-3 font-mono text-xs font-semibold tracking-widest uppercase
            transition-all duration-150 border
            disabled:opacity-50 disabled:cursor-not-allowed
            bg-bloomberg-orange border-bloomberg-orange text-black
            hover:bg-orange-400 hover:border-orange-400
            active:scale-[0.99]
          "
        >
          {running
            ? '▶ RUNNING AGENT PIPELINE...'
            : '▶ EXECUTE ANALYSIS'}
        </button>

        <div className="text-center font-mono text-xs text-bloomberg-muted tracking-wider">
          EST. RUNTIME: 2–5 MIN PER ANALYSIS
        </div>
      </div>
    </form>
  );
}
