import React, { useState } from 'react';

import {
  buildAnalysisPayload,
  DEFAULT_DEBATE_ROUNDS,
  DEPTH_OPTIONS,
  HORIZON_OPTIONS,
  MARKETS,
  normalizeTickerInput,
  today,
  validateAnalysisInput,
} from '../domain/analysisContract';
import { useAnalysisJob } from '../hooks/useAnalysisJob';

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
        ${
          active
            ? 'border-bloomberg-orange text-bloomberg-orange bg-bloomberg-orange-dim'
            : 'border-transparent text-bloomberg-muted hover:text-bloomberg-white hover:border-bloomberg-subtle'
        }
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

export default function StockForm({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [activeMarket, setActiveMarket] = useState('US');
  const [ticker, setTicker] = useState(MARKETS.US.defaultTicker);
  const [date, setDate] = useState(today());
  const [rounds, setRounds] = useState(DEFAULT_DEBATE_ROUNDS);
  const [timeHorizonMonths, setTimeHorizonMonths] = useState(1);
  const [analysisDepth, setDepth] = useState('balanced');
  const [responseDetail, setDetail] = useState('full');
  const [error, setError] = useState('');
  const { running, startAnalysis, stopAnalysis } = useAnalysisJob({
    onResult,
    onLoading,
    onStatus,
    onAgentProgress,
  });

  function handleMarketSwitch(marketId) {
    if (running) return;
    setActiveMarket(marketId);
    setTicker(MARKETS[marketId].defaultTicker);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (running) {
      stopAnalysis();
      return;
    }

    const validationError = validateAnalysisInput({
      activeMarket,
      ticker,
      date,
      timeHorizonMonths,
      analysisDepth,
      responseDetail,
    });
    if (validationError) {
      setError(validationError);
      onResult({ error: validationError });
      return;
    }

    setError('');
    await startAnalysis(
      buildAnalysisPayload({
        activeMarket,
        ticker,
        date,
        timeHorizonMonths,
        rounds,
        analysisDepth,
        responseDetail,
      })
    );
  }

  const selectedDepth = DEPTH_OPTIONS.find((item) => item.value === analysisDepth);
  const selectedHorizon = HORIZON_OPTIONS.find((item) => item.value === Number(timeHorizonMonths));
  const currentMarket = MARKETS[activeMarket];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-0">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-bloomberg-border flex items-center gap-2">
        <span className="text-bloomberg-orange font-mono text-xs font-semibold tracking-wider">
          NEW ANALYSIS
        </span>
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
              {activeMarket === 'ID' ? '· IDX code' : '· NYSE / NASDAQ'}
            </span>
          </label>
          <input
            value={ticker}
            onChange={(e) => setTicker(normalizeTickerInput(e.target.value, activeMarket))}
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
              {currentMarket.tickers.map((t) => (
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

        {/* Depth + Detail */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
              ANALYSIS DEPTH
            </label>
            <select
              value={analysisDepth}
              onChange={(e) => setDepth(e.target.value)}
              disabled={running}
              className="
                w-full bg-black border border-bloomberg-border px-3 py-2.5
                font-mono text-xs text-bloomberg-white tracking-wider
                focus:outline-none focus:border-bloomberg-orange
                disabled:opacity-50 transition-colors duration-150 cursor-pointer
              "
            >
              {DEPTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-black">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-mono text-bloomberg-muted tracking-wider uppercase mb-2">
              RESPONSE
            </label>
            <select
              value={responseDetail}
              onChange={(e) => setDetail(e.target.value)}
              disabled={running}
              className="
                w-full bg-black border border-bloomberg-border px-3 py-2.5
                font-mono text-xs text-bloomberg-white tracking-wider
                focus:outline-none focus:border-bloomberg-orange
                disabled:opacity-50 transition-colors duration-150 cursor-pointer
              "
            >
              <option value="summary" className="bg-black">
                SUMMARY
              </option>
              <option value="full" className="bg-black">
                FULL
              </option>
              <option value="debug" className="bg-black">
                DEBUG
              </option>
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
            ${
              running
                ? 'bg-bloomberg-red-dim border-bloomberg-red text-bloomberg-red hover:bg-bloomberg-red hover:text-black'
                : 'bg-bloomberg-orange border-bloomberg-orange text-black hover:bg-orange-400 hover:border-orange-400'
            }
          `}
        >
          {running ? '■ STOP ANALYSIS' : '▶ EXECUTE ANALYSIS'}
        </button>

        <div className="text-center font-mono text-xs text-bloomberg-muted tracking-wider">
          {selectedHorizon?.label || '1 MONTH'} / {selectedDepth?.label || 'BALANCED'} /{' '}
          {selectedDepth?.runtime || 'DEFAULT PIPELINE'}
        </div>
      </div>
    </form>
  );
}
