import React, { useEffect, useRef, useState } from 'react';
import { getMockAnalysisResponse, MOCK_PIPELINE_STEPS } from '../mockData';

const DEFAULT_DEBATE_ROUNDS = 3;

const IDX_TICKERS = ['BBCA', 'BBRI', 'TLKM', 'BMRI', 'ASII', 'GOTO', 'UNVR'];
const US_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'META'];
const HORIZON_OPTIONS = [
  { value: 1, label: '1 MONTH' },
  { value: 2, label: '2 MONTHS' },
  { value: 3, label: '3 MONTHS' },
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeTickerInput(value) {
  return value
    .toUpperCase()
    .replace(/\.JK$/, '')
    .replace(/[^A-Z0-9.-]/g, '')
    .slice(0, 12);
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
        ${
          active
            ? 'border-bloomberg-orange bg-bloomberg-orange-dim text-bloomberg-orange'
            : 'border-bloomberg-border bg-bloomberg-surface text-bloomberg-muted hover:border-bloomberg-subtle hover:text-bloomberg-white'
        }
      `}
    >
      {label}
    </button>
  );
}

export default function StockFormMock({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [ticker, setTicker] = useState('NVDA');
  const [date, setDate] = useState(today());
  const [rounds, setRounds] = useState(DEFAULT_DEBATE_ROUNDS);
  const [timeHorizonMonths, setTimeHorizonMonths] = useState(1);
  const [error, setError] = useState('');
  const [hasExistingPosition, setHasExistingPosition] = useState(false);
  const [positionQuantity, setPositionQuantity] = useState('');
  const [averageEntryPrice, setAverageEntryPrice] = useState('');
  const [running, setRunning] = useState(false);
  const timersRef = useRef([]);

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
    if (!/^[A-Z0-9]{1,10}([.-][A-Z0-9]{1,5})?$/.test(t)) {
      return 'Invalid ticker. Examples: BBCA, NVDA, BRK-B';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return 'Date must be YYYY-MM-DD';
    }
    if (![1, 2, 3].includes(Number(timeHorizonMonths))) {
      return 'Invalid analysis horizon.';
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

    schedule(
      () => {
        const mockResult = getMockAnalysisResponse({
          ticker: normalizedTicker,
          trade_date: date,
          time_horizon_months: Number(timeHorizonMonths),
          max_debate_rounds: rounds,
          has_existing_position: hasExistingPosition,
          position_quantity: positionQuantity || null,
          average_entry_price: averageEntryPrice || null,
        });
        onResult(mockResult);
        setRunning(false);
        onLoading(false);
        onStatus('');
        clearTimers();
      },
      MOCK_PIPELINE_STEPS.length * stepGap + 300
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-0">
      {/* Form header */}
      <div className="px-4 py-2.5 border-b border-bloomberg-border flex items-center gap-2">
        <span className="text-bloomberg-orange font-mono text-xs font-semibold tracking-wider">
          NEW ANALYSIS
        </span>
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
            onChange={(e) => setTicker(normalizeTickerInput(e.target.value))}
            placeholder="e.g. BBCA"
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
              {IDX_TICKERS.map((t) => (
                <TickerChip
                  key={t}
                  label={t}
                  active={ticker === t}
                  onClick={() => setTicker(t)}
                  disabled={running}
                />
              ))}
            </div>
            <div className="text-xs font-mono text-bloomberg-muted mb-1.5 tracking-wider">US</div>
            <div className="flex flex-wrap gap-1.5">
              {US_TICKERS.map((t) => (
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

        {/* Horizon */}
        <div>
          <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
            ANALYSIS HORIZON
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {HORIZON_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTimeHorizonMonths(option.value)}
                disabled={running}
                className={`
                  px-2 py-2 text-xs font-mono border tracking-wider transition-colors duration-150
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${
                    Number(timeHorizonMonths) === option.value
                      ? 'border-bloomberg-orange bg-bloomberg-orange-dim text-bloomberg-orange'
                      : 'border-bloomberg-border bg-black text-bloomberg-muted hover:border-bloomberg-subtle hover:text-bloomberg-white'
                  }
                `}
              >
                {option.label}
              </button>
            ))}
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
              onChange={(e) => setDate(e.target.value)}
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
              onChange={(e) => setRounds(Number(e.target.value))}
              disabled={running}
              className="
                w-full bg-black border border-bloomberg-border px-3 py-2.5
                font-mono text-xs text-bloomberg-white tracking-wider
                focus:outline-none focus:border-bloomberg-orange
                disabled:opacity-50 transition-colors duration-150 cursor-pointer
              "
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n} className="bg-black">
                  {n} ROUND{n > 1 ? 'S' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>


        {/* Existing position */}
        <div className="border border-bloomberg-border bg-bloomberg-surface px-3 py-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hasExistingPosition}
              onChange={(e) => setHasExistingPosition(e.target.checked)}
              disabled={running}
              className="mt-0.5 accent-bloomberg-orange"
            />
            <span>
              <span className="block text-xs font-mono text-bloomberg-white tracking-wider uppercase">
                EXISTING POSITION
              </span>
              <span className="block mt-1 text-xs font-mono text-bloomberg-muted leading-relaxed">
                Saya sudah punya posisi di ticker ini.
              </span>
            </span>
          </label>
          {hasExistingPosition && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label htmlFor="mock-position-quantity" className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
                  POSITION QTY
                </label>
                <input
                  id="mock-position-quantity"
                  type="number"
                  min="0"
                  step="any"
                  value={positionQuantity}
                  onChange={(e) => setPositionQuantity(e.target.value)}
                  disabled={running}
                  placeholder="Optional"
                  className="
                    w-full bg-black border border-bloomberg-border px-3 py-2.5
                    font-mono text-xs text-bloomberg-white tracking-wider
                    focus:outline-none focus:border-bloomberg-orange
                    disabled:opacity-50 transition-colors duration-150
                    placeholder:text-bloomberg-muted
                  "
                />
              </div>
              <div>
                <label htmlFor="mock-average-entry-price" className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
                  AVG ENTRY
                </label>
                <input
                  id="mock-average-entry-price"
                  type="number"
                  min="0"
                  step="any"
                  value={averageEntryPrice}
                  onChange={(e) => setAverageEntryPrice(e.target.value)}
                  disabled={running}
                  placeholder="Optional"
                  className="
                    w-full bg-black border border-bloomberg-border px-3 py-2.5
                    font-mono text-xs text-bloomberg-white tracking-wider
                    focus:outline-none focus:border-bloomberg-orange
                    disabled:opacity-50 transition-colors duration-150
                    placeholder:text-bloomberg-muted
                  "
                />
              </div>
            </div>
          )}
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
          {running ? '■ STOP MOCK PIPELINE' : '▶ EXECUTE ANALYSIS'}
        </button>

        <div className="text-center font-mono text-xs text-bloomberg-muted tracking-wider">
          {HORIZON_OPTIONS.find((item) => item.value === Number(timeHorizonMonths))?.label ||
            '1 MONTH'}{' '}
          / MOCK MODE
        </div>
      </div>
    </form>
  );
}
