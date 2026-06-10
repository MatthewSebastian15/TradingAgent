import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import {
  AGENT_ALIASES,
  buildAnalysisPayload,
  DEFAULT_DEBATE_ROUNDS,
  DEPTH_OPTIONS,
  HORIZON_OPTIONS,
  PIPELINE,
  PIPELINE_IDS,
  today,
  validateAnalysisInput,
} from '../domain/analysisContract';
import { useAnalysisJob } from '../hooks/useAnalysisJob';
import TickerSearchBar from './TickerSearchBar';

function normalizeAgentId(id = '') {
  const normalized = String(id)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return AGENT_ALIASES[normalized] || normalized;
}

function normalizeAgentStatus(status = '') {
  const normalized = String(status).trim().toLowerCase();
  if (['start', 'running', 'in_progress'].includes(normalized)) return 'started';
  if (['done', 'complete', 'success', 'finished'].includes(normalized)) return 'completed';
  if (['error', 'failed', 'fail'].includes(normalized)) return 'failed';
  return normalized || 'started';
}

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

function AgentPipelineStrip({ agentProgress, running, status }) {
  const [activeIds, setActiveIds] = useState(new Set());
  const [doneIds, setDoneIds] = useState(new Set());

  useEffect(() => {
    if (!running && agentProgress === null) {
      setActiveIds(new Set());
      setDoneIds(new Set());
      return;
    }

    if (!agentProgress?.agent_id) return;

    const agentId = normalizeAgentId(agentProgress.agent_id);
    const agentStatus = normalizeAgentStatus(agentProgress.status);
    const isPipelineAgent = PIPELINE_IDS.has(agentId);
    if (!isPipelineAgent) return;

    setActiveIds((prev) => {
      const next = new Set(prev);
      if (agentStatus === 'started') next.add(agentId);
      if (agentStatus === 'completed' || agentStatus === 'failed') next.delete(agentId);
      return next;
    });

    setDoneIds((prev) => {
      const next = new Set(prev);
      if (agentStatus === 'completed') next.add(agentId);
      if (agentStatus === 'failed') next.delete(agentId);
      return next;
    });
  }, [agentProgress, running]);

  const doneCount = Math.min(doneIds.size, PIPELINE.length);
  const progressPct = Math.round((doneCount / PIPELINE.length) * 100);
  const headline = running
    ? agentProgress?.status_message || status || 'PIPELINE RUNNING'
    : 'READY FOR ANALYSIS';

  return (
    <div className="border-b border-bloomberg-border bg-black">
      <div className="flex flex-col gap-2 border-b border-bloomberg-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`h-2 w-2 flex-shrink-0 rounded-full ${
              running ? 'bg-bloomberg-orange animate-pulse-dot' : 'bg-bloomberg-border'
            }`}
          />
          <div className="min-w-0">
            <div className="font-mono text-xs font-semibold text-bloomberg-orange tracking-[0.22em]">
              AGENT PIPELINE
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-bloomberg-muted tracking-wider uppercase">
              {headline}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.18em] text-bloomberg-muted">
          <span>
            {doneCount}/{PIPELINE.length} AGENTS
          </span>
          <span className={running ? 'text-bloomberg-orange' : 'text-bloomberg-border'}>
            {progressPct}% COMPLETE
          </span>
        </div>
      </div>

      <div className="h-0.5 bg-bloomberg-surface">
        <div
          className="h-full bg-bloomberg-orange transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="grid grid-cols-5 divide-x divide-bloomberg-border">
        {PIPELINE.map((step, index) => {
          const active = activeIds.has(step.id);
          const done = doneIds.has(step.id);
          const failed =
            agentProgress?.agent_id &&
            normalizeAgentId(agentProgress.agent_id) === step.id &&
            normalizeAgentStatus(agentProgress.status) === 'failed';
          return (
            <div
              key={step.id}
              className={`min-w-0 px-3 py-2 transition-colors duration-200 ${
                active
                  ? 'bg-bloomberg-orange-dim'
                  : done
                    ? 'bg-bloomberg-green-dim'
                    : failed
                      ? 'bg-bloomberg-red-dim'
                      : 'bg-black'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] text-bloomberg-border">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className={`font-mono text-[9px] ${
                    active
                      ? 'text-bloomberg-orange'
                      : done
                        ? 'text-bloomberg-green'
                        : failed
                          ? 'text-bloomberg-red'
                          : 'text-bloomberg-muted'
                  }`}
                >
                  {done ? 'DONE' : active ? 'LIVE' : failed ? 'FAIL' : 'IDLE'}
                </span>
              </div>
              <div
                className={`mt-1 truncate font-mono text-[11px] font-semibold tracking-wider ${
                  active
                    ? 'text-bloomberg-white'
                    : done
                      ? 'text-bloomberg-green'
                      : 'text-bloomberg-muted'
                }`}
                title={step.label}
              >
                {step.short}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

AgentPipelineStrip.propTypes = {
  agentProgress: PropTypes.object,
  running: PropTypes.bool.isRequired,
  status: PropTypes.string,
};

export default function StockForm({
  onResult,
  onLoading,
  onStatus,
  onAgentProgress,
  useAnalysisJobHook = useAnalysisJob,
  selectedResult = null,
  agentProgress = null,
  status = '',
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
      <AgentPipelineStrip agentProgress={agentProgress} running={running} status={status} />

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
  agentProgress: PropTypes.object,
  status: PropTypes.string,
  tickerSearch: PropTypes.func,
};
