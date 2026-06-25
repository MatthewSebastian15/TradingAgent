import { Play, Square } from 'lucide-react';
import PropTypes from 'prop-types';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import TickerSearchBar from './TickerSearchBar';
import { DEPTH_OPTIONS, HORIZON_OPTIONS } from '../domain/analysisContract';
import { useStockForm } from '../hooks/useStockForm';

const TERMINAL_INPUT_CLASS =
  'h-8 rounded-none border-bloomberg-border bg-bloomberg-bg font-mono text-[11px] tracking-wider text-bloomberg-white placeholder:text-bloomberg-muted focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';
const SETTINGS_LABEL_CLASS =
  'text-[9px] text-bloomberg-muted font-mono tracking-[0.16em] uppercase leading-tight min-h-[18px] flex items-end';
const SETTINGS_INPUT_CLASS =
  'h-10 w-full rounded-none border-bloomberg-border bg-black font-mono text-xs tracking-wider text-bloomberg-white placeholder:text-bloomberg-muted focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';
const SETTINGS_SELECT_TRIGGER_CLASS =
  'h-10 w-full rounded-none border-bloomberg-border bg-black font-mono text-xs tracking-wider text-bloomberg-white focus:ring-1 focus:ring-bloomberg-orange focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';
const TERMINAL_PRIMARY_BUTTON_CLASS =
  'h-9 w-full max-w-[208px] rounded-none border border-bloomberg-orange bg-bloomberg-orange px-3 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-orange-400 focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';
const TERMINAL_STOP_BUTTON_CLASS =
  'h-9 w-full max-w-[208px] rounded-none border border-bloomberg-red bg-bloomberg-red px-3 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-red-400 focus-visible:ring-1 focus-visible:ring-bloomberg-red focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';

function ConfigSection({ title, children }) {
  return (
    <section className="min-w-0 overflow-hidden border border-bloomberg-border bg-black p-2">
      <div className="mb-2 border-b border-bloomberg-border pb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-bloomberg-orange">
        {title}
      </div>
      <div className="min-w-0 space-y-2">{children}</div>
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
      className="mb-1 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-bloomberg-muted"
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
    <div className="min-w-0 space-y-1.5">
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

function WatchlistItems({ items, activeTicker, onSelect, disabled }) {
  if (items.length === 0) {
    return (
      <div className="py-2 text-center">
        <span className="font-mono text-[9px] tracking-[0.12em] text-bloomberg-muted">
          No tickers — add from Watchlist tab.
        </span>
      </div>
    );
  }

  return (
    <div className="-mx-2 -mb-2 flex flex-col">
      {items.map((item) => {
        const isActive = activeTicker && activeTicker.toUpperCase() === item.symbol;
        return (
          <button
            key={item.symbol}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(item)}
            className={`group flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              isActive
                ? 'bg-bloomberg-orange'
                : 'hover:bg-bloomberg-orange/10 focus-visible:bg-bloomberg-orange/10 focus-visible:outline-none'
            }`}
          >
            <div className="min-w-0 flex-1 overflow-hidden">
              <div
                className={`truncate font-mono text-[10px] font-bold uppercase tracking-wider ${
                  isActive ? 'text-black' : 'text-bloomberg-white group-hover:text-bloomberg-orange'
                }`}
              >
                {item.symbol}
              </div>
              {item.name && item.name !== item.symbol && (
                <div
                  className={`truncate font-mono text-[8px] leading-tight ${
                    isActive ? 'text-black/70' : 'text-bloomberg-muted'
                  }`}
                >
                  {item.name}
                </div>
              )}
            </div>
            {isActive && (
              <span
                className={`shrink-0 font-mono text-[8px] uppercase tracking-wider ${
                  disabled ? 'text-black/60' : 'text-black/80'
                }`}
              >
                {disabled ? 'RUNNING' : 'ACTIVE'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

WatchlistItems.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({ symbol: PropTypes.string.isRequired, name: PropTypes.string })
  ).isRequired,
  activeTicker: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default function StockForm({
  onResult,
  onLoading,
  onStatus,
  onAgentProgress,
  useAnalysisJobHook = undefined,
  selectedResult = null,
  tickerSearch = null,
}) {
  const {
    ticker,
    setTicker,
    date,
    setDate,
    rounds,
    setRounds,
    timeHorizonMonths,
    setTimeHorizonMonths,
    analysisDepth,
    setDepth,
    responseDetail,
    setDetail,
    hasExistingPosition,
    setHasExistingPosition,
    positionQuantity,
    setPositionQuantity,
    averageEntryPrice,
    setAverageEntryPrice,
    error,
    setError,
    running,
    watchlistItems,
    handleSubmit,
    handleWatchlistTicker,
  } = useStockForm({
    onResult,
    onLoading,
    onStatus,
    onAgentProgress,
    useAnalysisJobHook,
    selectedResult,
  });

  return (
    <form onSubmit={handleSubmit} className="font-mono h-full flex flex-col">
      {/* Scrollable configuration sections */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-2 bg-bloomberg-bg p-2">
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

          <ConfigSection title="Watchlist">
            <WatchlistItems
              items={watchlistItems}
              activeTicker={ticker}
              onSelect={handleWatchlistTicker}
              disabled={running}
            />
          </ConfigSection>

          <ConfigSection title="Analysis Horizon">
            <div className="grid grid-cols-3 gap-1.5">
              {HORIZON_OPTIONS.map((option) => {
                const active = Number(timeHorizonMonths) === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={running}
                    onClick={() => setTimeHorizonMonths(option.value)}
                    className={`h-8 border px-2 font-mono text-[9px] font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
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
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="trade-date" className={SETTINGS_LABEL_CLASS}>
                  TRADE DATE
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
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={hasExistingPosition}
                onChange={(event) => setHasExistingPosition(event.target.checked)}
                disabled={running}
                className="mt-1 accent-bloomberg-orange"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-bloomberg-white">
                  Existing Position
                </span>
                <span className="mt-0.5 block font-mono text-[9px] leading-snug text-bloomberg-muted">
                  Adds current holding context without changing the backend contract.
                </span>
              </span>
            </label>

            {hasExistingPosition && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

          {running && (
            <div className="space-y-2 border border-bloomberg-border bg-bloomberg-card p-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
        </div>
      </div>

      {/* Action section — always visible at bottom */}
      <div className="flex-shrink-0 border-t border-bloomberg-border bg-bloomberg-bg p-2">
        <ConfigSection title="Action">
          {error && (
            <div className="border border-bloomberg-red bg-bloomberg-red-dim px-2 py-1.5">
              <span className="font-mono text-[11px] text-bloomberg-red">ERR: {error}</span>
            </div>
          )}

          <div className="flex justify-center">
            <Button
              type="submit"
              size="lg"
              variant={running ? 'destructive' : 'default'}
              className={running ? TERMINAL_STOP_BUTTON_CLASS : TERMINAL_PRIMARY_BUTTON_CLASS}
            >
              {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? 'Stop Analysis' : 'Execute Analysis'}
            </Button>
          </div>
        </ConfigSection>
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
