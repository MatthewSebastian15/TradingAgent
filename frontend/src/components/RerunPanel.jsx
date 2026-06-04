import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import {
  DEFAULT_DEBATE_ROUNDS,
  DEPTH_OPTIONS,
  HORIZON_OPTIONS,
  MARKETS,
  buildAnalysisPayload,
  normalizeTickerInput,
  today,
  validateAnalysisInput,
} from '../domain/analysisContract';

function parseHorizon(value) {
  if (typeof value === 'string') {
    const match = value.match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  const numeric = Number(value);
  return [1, 2, 3].includes(numeric) ? numeric : 1;
}

function normalizeMarket(value, ticker) {
  const normalized = String(value || '').trim().toUpperCase();
  if (['ID', 'IDX', 'INDONESIA'].includes(normalized) || String(ticker || '').toUpperCase().endsWith('.JK')) return 'ID';
  return 'US';
}

function normalizeDepth(value) {
  return DEPTH_OPTIONS.some((option) => option.value === value) ? value : 'balanced';
}

function initialStateFromResult(result) {
  const params = result?.analysis_params || {};
  const normalizedTicker = params.normalized_ticker || result?.normalized_ticker || result?.ticker || '';
  const market = normalizeMarket(params.market || result?.market, normalizedTicker);
  const rawTicker = params.ticker || result?.input_ticker || normalizedTicker || MARKETS[market].defaultTicker;
  const ticker = normalizeTickerInput(String(rawTicker).replace(/\.JK$/i, ''), market);

  return {
    activeMarket: market,
    ticker,
    date: params.trade_date || result?.trade_date || today(),
    timeHorizonMonths: parseHorizon(params.horizon || result?.time_horizon_months || params.time_horizon_months),
    rounds: Number(params.debate_rounds || params.max_debate_rounds || result?.max_debate_rounds || DEFAULT_DEBATE_ROUNDS),
    analysisDepth: normalizeDepth(params.analysis_depth || result?.analysis_depth),
    responseDetail: params.response_detail || result?.response_detail || 'full',
    hasExistingPosition: Boolean(params.has_existing_position ?? result?.has_existing_position),
    positionQuantity: params.position_quantity ?? result?.position_quantity ?? '',
    averageEntryPrice: params.average_entry_price ?? result?.average_entry_price ?? '',
  };
}

export default function RerunPanel({ result, open, onClose, onSubmit, running = false }) {
  const [form, setForm] = useState(() => initialStateFromResult(result));
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(initialStateFromResult(result));
      setError('');
    }
  }, [open, result]);

  if (!open) return null;

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validation = validateAnalysisInput(form);
    if (validation) {
      setError(validation);
      return;
    }
    setError('');
    await onSubmit(buildAnalysisPayload(form));
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="border-b border-bloomberg-border bg-black bg-opacity-30 px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">Re-run Analysis Parameters</div>
        <button type="button" onClick={onClose} className="font-mono text-xs text-bloomberg-muted hover:text-bloomberg-white">
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <label className="font-mono text-xs text-bloomberg-muted">
          Market
          <select
            value={form.activeMarket}
            onChange={(event) => {
              const nextMarket = event.target.value;
              update('activeMarket', nextMarket);
              update('ticker', normalizeTickerInput(form.ticker, nextMarket) || MARKETS[nextMarket].defaultTicker);
            }}
            className="mt-1 w-full border border-bloomberg-border bg-bloomberg-card px-2 py-2 text-bloomberg-white"
          >
            {Object.entries(MARKETS).map(([id, market]) => (
              <option key={id} value={id}>{market.label}</option>
            ))}
          </select>
        </label>

        <label className="font-mono text-xs text-bloomberg-muted">
          Ticker
          <input
            value={form.ticker}
            onChange={(event) => update('ticker', normalizeTickerInput(event.target.value, form.activeMarket))}
            className="mt-1 w-full border border-bloomberg-border bg-bloomberg-card px-2 py-2 text-bloomberg-white"
          />
        </label>

        <label className="font-mono text-xs text-bloomberg-muted">
          Trade Date
          <input
            type="date"
            value={form.date}
            onChange={(event) => update('date', event.target.value)}
            className="mt-1 w-full border border-bloomberg-border bg-bloomberg-card px-2 py-2 text-bloomberg-white"
          />
        </label>

        <label className="font-mono text-xs text-bloomberg-muted">
          Horizon
          <select
            value={form.timeHorizonMonths}
            onChange={(event) => update('timeHorizonMonths', Number(event.target.value))}
            className="mt-1 w-full border border-bloomberg-border bg-bloomberg-card px-2 py-2 text-bloomberg-white"
          >
            {HORIZON_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        <label className="font-mono text-xs text-bloomberg-muted">
          Debate Rounds
          <input
            type="number"
            min="1"
            max="5"
            value={form.rounds}
            onChange={(event) => update('rounds', event.target.value)}
            className="mt-1 w-full border border-bloomberg-border bg-bloomberg-card px-2 py-2 text-bloomberg-white"
          />
        </label>

        <label className="font-mono text-xs text-bloomberg-muted">
          Depth
          <select
            value={form.analysisDepth}
            onChange={(event) => update('analysisDepth', event.target.value)}
            className="mt-1 w-full border border-bloomberg-border bg-bloomberg-card px-2 py-2 text-bloomberg-white"
          >
            {DEPTH_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        <label className="font-mono text-xs text-bloomberg-muted">
          Existing Position
          <select
            value={form.hasExistingPosition ? 'yes' : 'no'}
            onChange={(event) => update('hasExistingPosition', event.target.value === 'yes')}
            className="mt-1 w-full border border-bloomberg-border bg-bloomberg-card px-2 py-2 text-bloomberg-white"
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        {form.hasExistingPosition && (
          <>
            <label className="font-mono text-xs text-bloomberg-muted">
              Quantity
              <input
                value={form.positionQuantity}
                onChange={(event) => update('positionQuantity', event.target.value)}
                className="mt-1 w-full border border-bloomberg-border bg-bloomberg-card px-2 py-2 text-bloomberg-white"
              />
            </label>
            <label className="font-mono text-xs text-bloomberg-muted">
              Avg Entry
              <input
                value={form.averageEntryPrice}
                onChange={(event) => update('averageEntryPrice', event.target.value)}
                className="mt-1 w-full border border-bloomberg-border bg-bloomberg-card px-2 py-2 text-bloomberg-white"
              />
            </label>
          </>
        )}
      </div>

      {error && <div className="mt-3 font-mono text-xs text-bloomberg-red">{error}</div>}
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={running}
          className="border border-bloomberg-orange px-4 py-2 font-mono text-xs font-semibold tracking-wider text-bloomberg-orange hover:bg-bloomberg-orange hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? 'RUNNING...' : 'Execute Analysis'}
        </button>
      </div>
    </form>
  );
}

RerunPanel.propTypes = {
  result: PropTypes.object,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  running: PropTypes.bool,
};
