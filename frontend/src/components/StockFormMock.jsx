import React, { useEffect, useRef, useState } from 'react';
import { getMockAnalysisResponse, MOCK_PIPELINE_STEPS } from '../mockData';

const DEFAULT_DEBATE_ROUNDS = 3;

const IDX_TICKERS = ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'BMRI.JK', 'ASII.JK', 'GOTO.JK'];
const US_TICKERS  = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'META'];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

export default function StockFormMock({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [ticker, setTicker]   = useState('NVDA');
  const [date, setDate]       = useState(today());
  const [rounds, setRounds]   = useState(DEFAULT_DEBATE_ROUNDS);
  const [error, setError]     = useState('');
  const [running, setRunning] = useState(false);
  const timersRef             = useRef([]);

  function clearTimers() {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  }

  function schedule(fn, delay) {
    const id = window.setTimeout(fn, delay);
    timersRef.current.push(id);
    return id;
  }

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  function validate() {
    const t = ticker.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}([.\-][A-Z0-9]{1,5})?$/.test(t)) {
      return 'Invalid ticker. Examples: BBCA.JK, NVDA, BRK-B';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return 'Date must be YYYY-MM-DD';
    }
    return '';
  }

  function emitProgress(step, status, message) {
    onStatus(message);
    if (onAgentProgress) {
      onAgentProgress({
        agent_id: step.agent_id,
        agent_name: step.agent_name,
        status,
        status_message: message,
      });
    }
  }

  function stopMockRun() {
    clearTimers();
    setRunning(false);
    onLoading(false);
    onStatus('');
    if (onAgentProgress) onAgentProgress(null);
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (running) {
      stopMockRun();
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      onResult({ error: validationError });
      return;
    }

    clearTimers();
    setError('');
    setRunning(true);
    onLoading(true);
    onStatus('Connecting to mock agent pipeline...');
    onResult(null);
    if (onAgentProgress) onAgentProgress(null);

    const normalizedTicker = ticker.trim().toUpperCase();
    const stepDuration = 450;
    const stepGap = 650;

    MOCK_PIPELINE_STEPS.forEach((step, index) => {
      const startAt = index * stepGap;
      schedule(() => emitProgress(step, 'started', step.running), startAt);
      schedule(() => emitProgress(step, 'completed', step.completed), startAt + stepDuration);
    });

    schedule(() => {
      const mockResult = getMockAnalysisResponse({
        ticker: normalizedTicker,
        trade_date: date,
        max_debate_rounds: rounds,
      });
      onResult(mockResult);
      setRunning(false);
      onLoading(false);
      onStatus('');
      clearTimers();
    }, MOCK_PIPELINE_STEPS.length * stepGap + 300);
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
          className="
            w-full py-3 font-mono text-xs font-semibold tracking-widest uppercase
            transition-all duration-150 border
            bg-bloomberg-orange border-bloomberg-orange text-black
            hover:bg-orange-400 hover:border-orange-400
            active:scale-[0.99]
          "
        >
          {running
            ? '■ STOP MOCK PIPELINE'
            : '▶ EXECUTE ANALYSIS'}
        </button>

        <div className="text-center font-mono text-xs text-bloomberg-muted tracking-wider">
          MOCK MODE: LOCAL DATA ONLY
        </div>
      </div>
    </form>
  );
}
