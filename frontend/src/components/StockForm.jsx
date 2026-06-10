import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import {
  buildAnalysisPayload,
  DEFAULT_DEBATE_ROUNDS,
  DEPTH_OPTIONS,
  HORIZON_OPTIONS,
  today,
  validateAnalysisInput,
} from '../domain/analysisContract';
import { useAnalysisJob } from '../hooks/useAnalysisJob';
import TickerSearchBar from './TickerSearchBar';

function FieldLabel({ children, hint = null }) {
  return (
    <label className="mb-2 flex items-center justify-between gap-2 font-mono text-[10px] text-bloomberg-muted tracking-[0.2em] uppercase">
      <span>{children}</span>
      {hint && <span className="normal-case tracking-wider text-bloomberg-border">{hint}</span>}
    </label>
  );
}

FieldLabel.propTypes = {
  children: PropTypes.node.isRequired,
  hint: PropTypes.string,
};

export default function StockForm({
  onResult,
  onLoading,
  onStatus,
  onAgentProgress,
  useAnalysisJobHook = useAnalysisJob,
  selectedResult = null,
  tickerSearch = null,
}) {
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState(today());
  const [rounds, setRounds] = useState(DEFAULT_DEBATE_ROUNDS);
  const [timeHorizonMonths, setTimeHorizonMonths] = useState(1);
  const [analysisDepth, setDepth] = useState('balanced');
  const [responseDetail, setDetail] = useState('full');
  const [hasExistingPosition, setHasExistingPosition] = useState(false);
  const [positionQuantity, setPositionQuantity] = useState('');
  const [averageEntryPrice, setAverageEntryPrice] = useState('');
  const [error, setError] = useState('');
  const { running, startAnalysis, stopAnalysis } = useAnalysisJobHook({
    onResult,
    onLoading,
    onStatus,
    onAgentProgress,
  });

  useEffect(() => {
    if (!selectedResult || selectedResult.error || running) return;

    const resultTicker = String(
      selectedResult.normalized_ticker || selectedResult.ticker || selectedResult.input_ticker || ''
    )
      .trim()
      .toUpperCase();

    if (resultTicker) setTicker(resultTicker);
    if (selectedResult.trade_date) setDate(selectedResult.trade_date);
    if (selectedResult.time_horizon_months) {
      setTimeHorizonMonths(Number(selectedResult.time_horizon_months));
    }
    if (selectedResult.max_debate_rounds) setRounds(Number(selectedResult.max_debate_rounds));
    if (selectedResult.analysis_depth) setDepth(selectedResult.analysis_depth);
    if (selectedResult.response_detail) setDetail(selectedResult.response_detail);

    const hasPosition = Boolean(selectedResult.has_existing_position);
    setHasExistingPosition(hasPosition);
    setPositionQuantity(
      hasPosition &&
        selectedResult.position_quantity !== null &&
        selectedResult.position_quantity !== undefined
        ? String(selectedResult.position_quantity)
        : ''
    );
    setAverageEntryPrice(
      hasPosition &&
        selectedResult.average_entry_price !== null &&
        selectedResult.average_entry_price !== undefined
        ? String(selectedResult.average_entry_price)
        : ''
    );
    setError('');
  }, [running, selectedResult]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (running) {
      stopAnalysis();
      return;
    }

    const validationError = validateAnalysisInput({
      ticker,
      date,
      timeHorizonMonths,
      rounds,
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
        ticker,
        date,
        timeHorizonMonths,
        rounds,
        analysisDepth,
        responseDetail,
        hasExistingPosition,
        positionQuantity: hasExistingPosition ? positionQuantity || null : null,
        averageEntryPrice: hasExistingPosition ? averageEntryPrice || null : null,
      })
    );
  }

  const selectedDepth = DEPTH_OPTIONS.find((item) => item.value === analysisDepth);
  const selectedHorizon = HORIZON_OPTIONS.find((item) => item.value === Number(timeHorizonMonths));

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 p-4">
        <div className="w-full">
          <FieldLabel hint="YFINANCE ONLY">Ticker symbol</FieldLabel>
          <TickerSearchBar
            value={ticker}
            disabled={running}
            searchTickers={tickerSearch}
            onClear={() => {
              setTicker('');
              setError('');
            }}
            onSelect={(item) => {
              setTicker(item.symbol);
              setError('');
            }}
          />
        </div>

        <div className="w-full">
          <FieldLabel>Analysis horizon</FieldLabel>
          <div className="grid w-full grid-cols-3 gap-1">
            {HORIZON_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTimeHorizonMonths(option.value)}
                disabled={running}
                className={`w-full border px-2 py-3 font-mono text-[11px] tracking-wider transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                  Number(timeHorizonMonths) === option.value
                    ? 'border-bloomberg-orange bg-bloomberg-orange-dim text-bloomberg-orange'
                    : 'border-bloomberg-border bg-black text-bloomberg-muted hover:border-bloomberg-subtle hover:text-bloomberg-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-3">
          <div className="w-full">
            <FieldLabel>Trade date</FieldLabel>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={running}
              required
              className="w-full border border-bloomberg-border bg-black px-3 py-3 font-mono text-xs text-bloomberg-white tracking-wider transition-colors duration-150 focus:border-bloomberg-orange focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="w-full">
            <FieldLabel>Debate rounds</FieldLabel>
            <select
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              disabled={running}
              className="w-full cursor-pointer border border-bloomberg-border bg-black px-3 py-3 font-mono text-xs text-bloomberg-white tracking-wider transition-colors duration-150 focus:border-bloomberg-orange focus:outline-none disabled:opacity-50"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n} className="bg-black">
                  {n} ROUND{n > 1 ? 'S' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-3">
          <div className="w-full">
            <FieldLabel>Analysis depth</FieldLabel>
            <select
              value={analysisDepth}
              onChange={(e) => setDepth(e.target.value)}
              disabled={running}
              className="w-full cursor-pointer border border-bloomberg-border bg-black px-3 py-3 font-mono text-xs text-bloomberg-white tracking-wider transition-colors duration-150 focus:border-bloomberg-orange focus:outline-none disabled:opacity-50"
            >
              {DEPTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-black">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full">
            <FieldLabel>Response</FieldLabel>
            <select
              value={responseDetail}
              onChange={(e) => setDetail(e.target.value)}
              disabled={running}
              className="w-full cursor-pointer border border-bloomberg-border bg-black px-3 py-3 font-mono text-xs text-bloomberg-white tracking-wider transition-colors duration-150 focus:border-bloomberg-orange focus:outline-none disabled:opacity-50"
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

        <div className="w-full border border-bloomberg-border bg-black px-4 py-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={hasExistingPosition}
              onChange={(e) => setHasExistingPosition(e.target.checked)}
              disabled={running}
              className="mt-0.5 accent-bloomberg-orange"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-xs text-bloomberg-white tracking-wider uppercase">
                Existing position
              </span>
              <span className="mt-1 block font-mono text-[10px] text-bloomberg-muted leading-relaxed">
                Checked means the decision can become HOLD, REDUCE, or SELL against your current
                position.
              </span>
            </span>
          </label>
          {hasExistingPosition && (
            <div className="mt-3 grid w-full grid-cols-2 gap-3">
              <div className="w-full">
                <label
                  htmlFor="position-quantity"
                  className="mb-1 block font-mono text-[10px] text-bloomberg-muted tracking-wider uppercase"
                >
                  Position qty
                </label>
                <input
                  id="position-quantity"
                  type="number"
                  min="0"
                  step="any"
                  value={positionQuantity}
                  onChange={(e) => setPositionQuantity(e.target.value)}
                  disabled={running}
                  placeholder="Optional"
                  className="w-full border border-bloomberg-border bg-bloomberg-bg px-3 py-2.5 font-mono text-xs text-bloomberg-white tracking-wider transition-colors duration-150 placeholder:text-bloomberg-muted focus:border-bloomberg-orange focus:outline-none disabled:opacity-50"
                />
              </div>
              <div className="w-full">
                <label
                  htmlFor="average-entry-price"
                  className="mb-1 block font-mono text-[10px] text-bloomberg-muted tracking-wider uppercase"
                >
                  Avg entry
                </label>
                <input
                  id="average-entry-price"
                  type="number"
                  min="0"
                  step="any"
                  value={averageEntryPrice}
                  onChange={(e) => setAverageEntryPrice(e.target.value)}
                  disabled={running}
                  placeholder="Optional"
                  className="w-full border border-bloomberg-border bg-bloomberg-bg px-3 py-2.5 font-mono text-xs text-bloomberg-white tracking-wider transition-colors duration-150 placeholder:text-bloomberg-muted focus:border-bloomberg-orange focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="w-full border border-bloomberg-red bg-bloomberg-red-dim px-3 py-2">
            <span className="font-mono text-[10px] text-bloomberg-red tracking-wider">
              ERR: {error}
            </span>
          </div>
        )}

        <button
          type="submit"
          className={`min-h-[48px] w-full border px-4 py-3 font-mono text-xs font-semibold tracking-widest uppercase transition-all duration-150 active:scale-[0.99] ${
            running
              ? 'border-bloomberg-red bg-bloomberg-red-dim text-bloomberg-red hover:bg-bloomberg-red hover:text-black'
              : 'border-bloomberg-orange bg-bloomberg-orange text-black hover:border-orange-400 hover:bg-orange-400'
          }`}
        >
          {running ? '■ STOP ANALYSIS' : '▶ EXECUTE ANALYSIS'}
        </button>

        <div className="w-full border border-bloomberg-border bg-black px-3 py-2 text-center font-mono text-[10px] text-bloomberg-muted tracking-wider">
          {selectedHorizon?.label || '1 MONTH'} / {selectedDepth?.label || 'BALANCED'} /{' '}
          {selectedDepth?.runtime || 'DEFAULT PIPELINE'}
        </div>
      </div>
    </form>
  );
}

StockForm.propTypes = {
  onResult: PropTypes.func.isRequired,
  onLoading: PropTypes.func.isRequired,
  onStatus: PropTypes.func.isRequired,
  onAgentProgress: PropTypes.func.isRequired,
  useAnalysisJobHook: PropTypes.func,
  selectedResult: PropTypes.object,
  tickerSearch: PropTypes.func,
};
