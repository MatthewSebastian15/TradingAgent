import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Play, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const TERMINAL_INPUT_CLASS =
  'h-9 rounded-none border-bloomberg-border bg-bloomberg-bg font-mono text-xs tracking-wider text-bloomberg-white placeholder:text-bloomberg-muted focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';
const SETTINGS_LABEL_CLASS =
  'text-[10px] text-bloomberg-muted font-mono tracking-[0.2em] uppercase leading-tight min-h-[28px] flex items-end';
const SETTINGS_STACKED_LABEL_CLASS =
  'text-[10px] text-bloomberg-muted font-mono tracking-[0.2em] uppercase leading-tight min-h-[28px] flex flex-col justify-end';
const SETTINGS_INPUT_CLASS =
  'h-[54px] w-full rounded-none border-bloomberg-border bg-black font-mono text-sm tracking-wider text-bloomberg-white placeholder:text-bloomberg-muted focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';
const SETTINGS_SELECT_TRIGGER_CLASS =
  'h-[54px] w-full rounded-none border-bloomberg-border bg-black font-mono text-sm tracking-wider text-bloomberg-white focus:ring-1 focus:ring-bloomberg-orange focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';
const TERMINAL_PRIMARY_BUTTON_CLASS =
  'h-10 rounded-none border border-bloomberg-orange bg-bloomberg-orange px-4 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-orange-400 focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';
const TERMINAL_STOP_BUTTON_CLASS =
  'h-10 rounded-none border border-bloomberg-red bg-bloomberg-red px-4 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-red-400 focus-visible:ring-1 focus-visible:ring-bloomberg-red focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';

function apiToDisplayDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value || '');
}

function displayToApiDate(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function ConfigSection({ title, children }) {
  return (
    <section className="border border-bloomberg-border bg-black p-3">
      <div className="mb-3 border-b border-bloomberg-border pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-bloomberg-orange">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

ConfigSection.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
};

function FieldLabel({ children, hint = null, htmlFor = undefined }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bloomberg-muted"
    >
      <span>{children}</span>
      {hint && <span className="font-mono text-[10px] normal-case tracking-wide">{hint}</span>}
    </label>
  );
}

FieldLabel.propTypes = {
  children: PropTypes.node.isRequired,
  hint: PropTypes.string,
  htmlFor: PropTypes.string,
};

function SelectField({ label, value, onValueChange, disabled, children }) {
  return (
    <div className="min-w-0 space-y-2">
      <label className={SETTINGS_LABEL_CLASS}>{label}</label>
      <Select value={String(value)} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className={SETTINGS_SELECT_TRIGGER_CLASS}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

SelectField.propTypes = {
  children: PropTypes.node.isRequired,
  disabled: PropTypes.bool,
  label: PropTypes.string.isRequired,
  onValueChange: PropTypes.func.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
};

function ConfigSummary({ horizon, depth }) {
  return (
    <div className="border border-bloomberg-border bg-black px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wider text-bloomberg-muted">
      <span className="text-bloomberg-white">{horizon?.label || '1 MONTH'}</span>
      <span className="px-2 text-bloomberg-border">/</span>
      <span className="text-bloomberg-white">{depth?.label || 'BALANCED'}</span>
      <span className="px-2 text-bloomberg-border">/</span>
      <span className="text-bloomberg-white">{depth?.runtime || 'DEFAULT 9-CALL PIPELINE'}</span>
    </div>
  );
}

ConfigSummary.propTypes = {
  depth: PropTypes.object,
  horizon: PropTypes.object,
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
  const [date, setDate] = useState(apiToDisplayDate(today()));
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
    if (selectedResult.trade_date) setDate(apiToDisplayDate(selectedResult.trade_date));
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

    const apiDate = displayToApiDate(date);
    if (!apiDate) {
      const validationError = 'Date must be DD-MM-YYYY';
      setError(validationError);
      onResult({ error: validationError });
      return;
    }

    const validationError = validateAnalysisInput({
      ticker,
      date: apiDate,
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
        date: apiDate,
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
    <form onSubmit={handleSubmit} className="font-mono">
      <div className="flex flex-col gap-3 bg-bloomberg-bg p-3">
        <ConfigSection title="Ticker">
          <div className="relative overflow-visible">
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
        </ConfigSection>

        <ConfigSection title="Analysis Horizon">
          <div className="grid grid-cols-3 gap-2">
            {HORIZON_OPTIONS.map((option) => {
              const active = Number(timeHorizonMonths) === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={running}
                  onClick={() => setTimeHorizonMonths(option.value)}
                  className={`h-9 border px-2 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    active
                      ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                      : 'border-bloomberg-border bg-bloomberg-bg text-bloomberg-muted hover:border-bloomberg-orange hover:text-bloomberg-orange'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </ConfigSection>

        <ConfigSection title="Analysis Settings">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-2">
              <label htmlFor="trade-date" className={SETTINGS_STACKED_LABEL_CLASS}>
                <span>TRADE DATE</span>
                <span>DD-MM-YYYY</span>
              </label>
              <Input
                id="trade-date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={running}
                required
                placeholder="DD-MM-YYYY"
                className={SETTINGS_INPUT_CLASS}
              />
            </div>

            <SelectField
              label="Debate Rounds"
              value={rounds}
              onValueChange={(value) => setRounds(Number(value))}
              disabled={running}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} ROUND{n > 1 ? 'S' : ''}
                </SelectItem>
              ))}
            </SelectField>

            <SelectField
              label="Analysis Depth"
              value={analysisDepth}
              onValueChange={setDepth}
              disabled={running}
            >
              {DEPTH_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectField>

            <SelectField
              label="Response Detail"
              value={responseDetail}
              onValueChange={setDetail}
              disabled={running}
            >
              <SelectItem value="summary">SUMMARY</SelectItem>
              <SelectItem value="full">FULL</SelectItem>
              <SelectItem value="debug">DEBUG</SelectItem>
            </SelectField>
          </div>
        </ConfigSection>

        <ConfigSection title="Position Settings">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={hasExistingPosition}
              onChange={(event) => setHasExistingPosition(event.target.checked)}
              disabled={running}
              className="mt-1 accent-bloomberg-orange"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-bloomberg-white">
                Existing Position
              </span>
              <span className="mt-1 block font-mono text-[10px] leading-relaxed text-bloomberg-muted">
                Adds current holding context without changing the backend contract.
              </span>
            </span>
          </label>

          {hasExistingPosition && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <FieldLabel htmlFor="position-quantity">Position Qty</FieldLabel>
                <Input
                  id="position-quantity"
                  type="number"
                  min="0"
                  step="any"
                  value={positionQuantity}
                  onChange={(event) => setPositionQuantity(event.target.value)}
                  disabled={running}
                  placeholder="Optional"
                  className={TERMINAL_INPUT_CLASS}
                />
              </div>
              <div className="min-w-0">
                <FieldLabel htmlFor="average-entry-price">Avg Entry</FieldLabel>
                <Input
                  id="average-entry-price"
                  type="number"
                  min="0"
                  step="any"
                  value={averageEntryPrice}
                  onChange={(event) => setAverageEntryPrice(event.target.value)}
                  disabled={running}
                  placeholder="Optional"
                  className={TERMINAL_INPUT_CLASS}
                />
              </div>
            </div>
          )}
        </ConfigSection>

        <ConfigSection title="Action">
          {error && (
            <div className="border border-bloomberg-red bg-bloomberg-red-dim px-3 py-2">
              <span className="font-mono text-xs text-bloomberg-red">ERR: {error}</span>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            variant={running ? 'destructive' : 'default'}
            className={running ? TERMINAL_STOP_BUTTON_CLASS : TERMINAL_PRIMARY_BUTTON_CLASS}
          >
            {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? 'Stop Analysis' : 'Execute Analysis'}
          </Button>

          <ConfigSummary horizon={selectedHorizon} depth={selectedDepth} />
        </ConfigSection>

        {running && (
          <div className="space-y-3 border border-bloomberg-border bg-bloomberg-card p-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
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
