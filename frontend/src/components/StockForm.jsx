import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { CalendarDays, Cpu, Play, Search, SlidersHorizontal, Square } from 'lucide-react';

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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

const PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'ollama', label: 'Ollama' },
];

const TERMINAL_INPUT_CLASS =
  'h-9 rounded-none border-bloomberg-border bg-bloomberg-bg font-mono text-xs tracking-wider text-bloomberg-white placeholder:text-bloomberg-muted focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';
const TERMINAL_SELECT_TRIGGER_CLASS =
  'h-9 rounded-none border-bloomberg-border bg-bloomberg-bg font-mono text-xs tracking-wider text-bloomberg-white focus:ring-1 focus:ring-bloomberg-orange focus:ring-offset-0';
const TERMINAL_SHEET_BUTTON_CLASS =
  'h-8 w-8 rounded-none border border-transparent text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-orange-dim hover:text-bloomberg-orange focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0';
const TERMINAL_PRIMARY_BUTTON_CLASS =
  'h-10 rounded-none border border-bloomberg-orange bg-bloomberg-orange px-4 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-orange-400 focus-visible:ring-1 focus-visible:ring-bloomberg-orange focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-45';

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

function FieldLabel({ children, hint = null, htmlFor = undefined }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bloomberg-muted"
    >
      <span>{children}</span>
      {hint && <span className="font-mono text-xs normal-case tracking-wide">{hint}</span>}
    </label>
  );
}

FieldLabel.propTypes = {
  children: PropTypes.node.isRequired,
  hint: PropTypes.string,
  htmlFor: PropTypes.string,
};

function SheetIconButton({ title, icon: Icon, children }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={title}
          title={title}
          className={TERMINAL_SHEET_BUTTON_CLASS}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="border-bloomberg-border bg-bloomberg-bg font-mono text-bloomberg-white">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm uppercase tracking-widest text-bloomberg-orange">
            {title}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs text-bloomberg-muted">
            Configuration applies to this analysis form.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

SheetIconButton.propTypes = {
  children: PropTypes.node.isRequired,
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.string.isRequired,
};

function SelectField({ label, value, onValueChange, disabled, children }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Select value={String(value)} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className={TERMINAL_SELECT_TRIGGER_CLASS}>
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
  const [provider, setProvider] = useState('gemini');
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
  const selectedProvider = PROVIDER_OPTIONS.find((item) => item.value === provider);

  return (
    <form onSubmit={handleSubmit} className="animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex flex-col gap-4 bg-bloomberg-bg p-4 font-mono">
        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-bloomberg-orange">
            Analysis Setup
          </div>
          <div className="flex items-center gap-1 rounded-none border border-bloomberg-border bg-black p-1">
            <SheetIconButton title="Ticker input" icon={Search}>
              <div>
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
            </SheetIconButton>

            <SheetIconButton title="Trade date" icon={CalendarDays}>
              <div>
                <FieldLabel hint="DD-MM-YYYY">Trade date</FieldLabel>
                <Input
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={running}
                  required
                  placeholder="DD-MM-YYYY"
                  className={TERMINAL_INPUT_CLASS}
                />
              </div>
            </SheetIconButton>

            <SheetIconButton title="Debate settings" icon={SlidersHorizontal}>
              <SelectField
                label="Analysis horizon"
                value={timeHorizonMonths}
                onValueChange={(value) => setTimeHorizonMonths(Number(value))}
                disabled={running}
              >
                {HORIZON_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectField>

              <SelectField
                label="Debate rounds"
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
                label="Analysis depth"
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
                label="Response"
                value={responseDetail}
                onValueChange={setDetail}
                disabled={running}
              >
                <SelectItem value="summary">SUMMARY</SelectItem>
                <SelectItem value="full">FULL</SelectItem>
                <SelectItem value="debug">DEBUG</SelectItem>
              </SelectField>

              <div className="rounded-none border border-bloomberg-border bg-black p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasExistingPosition}
                    onChange={(event) => setHasExistingPosition(event.target.checked)}
                    disabled={running}
                    className="mt-1 accent-bloomberg-orange"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-xs font-semibold uppercase tracking-wider text-bloomberg-white">
                      Existing position
                    </span>
                    <span className="mt-1 block font-mono text-[11px] leading-relaxed text-bloomberg-muted">
                      Enables HOLD, REDUCE, or SELL context for current holdings.
                    </span>
                  </span>
                </label>
                {hasExistingPosition && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="position-quantity">Position qty</FieldLabel>
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
                    <div>
                      <FieldLabel htmlFor="average-entry-price">Avg entry</FieldLabel>
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
              </div>
            </SheetIconButton>

            <SheetIconButton title="Provider selection" icon={Cpu}>
              <SelectField
                label="Provider"
                value={provider}
                onValueChange={setProvider}
                disabled={running}
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectField>
              <div className="rounded-none border border-bloomberg-border bg-black p-3 font-mono text-[11px] leading-relaxed text-bloomberg-muted">
                Provider selection is visual only. Backend provider config remains unchanged.
              </div>
            </SheetIconButton>
          </div>
        </div>

        <div className="space-y-4">
          <div>
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

          <div>
            <FieldLabel hint="DD-MM-YYYY">Trade date</FieldLabel>
            <Input
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={running}
              required
              placeholder="DD-MM-YYYY"
              className={TERMINAL_INPUT_CLASS}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-none border border-bloomberg-red bg-bloomberg-red-dim px-3 py-2">
            <span className="font-mono text-xs text-bloomberg-red">ERR: {error}</span>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          variant={running ? 'destructive' : 'default'}
          className={TERMINAL_PRIMARY_BUTTON_CLASS}
        >
          {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? 'Stop analysis' : 'Execute analysis'}
        </Button>

        <div className="rounded-none border border-bloomberg-border bg-black px-3 py-2 text-center font-mono text-[11px] tracking-wider text-bloomberg-muted">
          {selectedHorizon?.label || '1 MONTH'} / {selectedDepth?.label || 'BALANCED'} /{' '}
          {selectedProvider?.label || 'Gemini'}
        </div>

        {running && (
          <div className="space-y-3 rounded-none border border-bloomberg-border bg-bloomberg-card p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
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
