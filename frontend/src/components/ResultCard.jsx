import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ExportReportButtons from './ExportReportButtons';
import MetricBox from './results/MetricBox';
import NoticeBox from './results/NoticeBox';
import SectionHeader from './results/SectionHeader';
import ChartPriceTab from './results/tabs/ChartPriceTab';
import FundamentalTab from './results/tabs/FundamentalTab';
import NewsTab from './results/tabs/NewsTab';
import ProfileTab from './results/tabs/ProfileTab';
import RiskDataQualityTab from './results/tabs/RiskDataQualityTab';
import ResultTabs from './results/tabs/ResultTabs';
import { REPORT_DISCLAIMER } from '../constants/reportDisclaimer';
import { formatDateTimeLabel, formatPrice, formatTickerLabel } from '../utils/formatting';

const ACTIONABLE_DECISIONS = new Set(['BUY', 'SELL', 'Buy', 'Overweight', 'Sell', 'Underweight']);

function formatWarningDetail(warning) {
  if (!hasDisplayValue(warning)) return null;
  if (typeof warning === 'object' && warning !== null) {
    const code = String(warning.code || 'WARNING').trim();
    return {
      code,
      severity: warning.severity || 'warning',
      blocking: Boolean(warning.blocking),
      label: warning.message || code,
      text: warning.message ? `${code} - ${warning.message}` : code,
    };
  }
  const code = String(warning).trim();
  return { code, severity: 'warning', blocking: false, label: code, text: code };
}

function getTradePlanStatus(isActionable, tradePlanValid) {
  if (tradePlanValid) return { label: 'TRADE PLAN', status: 'valid', tone: 'ok' };
  if (isActionable) return { label: 'TRADE PLAN', status: 'not valid', tone: 'error' };
  return { label: 'TRADE PLAN', status: 'not actionable', tone: 'neutral' };
}

function getStatusClasses(tone) {
  if (tone === 'ok') return 'border-bloomberg-green bg-bloomberg-green-dim text-bloomberg-green';
  if (tone === 'error') return 'border-bloomberg-red bg-bloomberg-red-dim text-bloomberg-red';
  if (tone === 'info' || tone === 'neutral')
    return 'border-bloomberg-border bg-bloomberg-surface text-bloomberg-muted';
  return 'border-bloomberg-amber bg-bloomberg-amber-dim text-bloomberg-amber';
}

function getDataQualityTone(label, status) {
  if (status === 'ok') return 'ok';
  if (status === 'hidden' || status === 'fallback') return 'info';
  if (status === 'invalid' || status === 'missing' || status === 'invalid_ticker') return 'error';
  if (label === 'NEWS' && status === 'unavailable') return 'warning';
  if (status === 'partial' || status === 'market_closed' || status === 'unavailable')
    return 'warning';
  return 'neutral';
}

function parseBold(text) {
  if (!text) return null;
  return text.split(/\*\*(.*?)\*\*/g).map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-bloomberg-white font-semibold">
        {p}
      </strong>
    ) : (
      p
    )
  );
}

function getError(e) {
  if (!e) return 'Analysis failed.';
  if (typeof e === 'string') return e;
  return e.message || e.error?.message || JSON.stringify(e, null, 2);
}

function formatAnalysisHorizon(months, fallback) {
  const value = Number(months);
  if ([1, 2, 3].includes(value)) return `${value} Month${value > 1 ? 's' : ''}`;
  return fallback || null;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return typeof value === 'number' ? `${value}%` : value;
}

function hasDisplayValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !(typeof value === 'number' && !Number.isFinite(value))
  );
}

function coalesceDisplayValue(...values) {
  return values.find((value) => hasDisplayValue(value)) ?? null;
}

function formatRiskReward(result) {
  if (result.risk_reward_display) return result.risk_reward_display;
  if (!hasDisplayValue(result.risk_reward_ratio)) return null;
  return typeof result.risk_reward_ratio === 'number'
    ? `1:${Math.round(result.risk_reward_ratio)}`
    : result.risk_reward_ratio;
}

function normalizeSignal(signal) {
  const normalized = String(signal || 'HOLD').trim().toUpperCase();
  if (normalized === 'OVERWEIGHT') return 'BUY';
  if (normalized === 'UNDERWEIGHT' || normalized === 'AVOID') return 'SELL';
  if (['BUY', 'HOLD', 'WAIT', 'REDUCE', 'SELL'].includes(normalized)) return normalized;
  return 'HOLD';
}

function getFinalDecision(result) {
  return normalizeSignal(result.display_signal ?? result.final_decision ?? result.decision ?? result.rating);
}

function getCurrentPrice(result) {
  if (!result) return null;

  if (Object.prototype.hasOwnProperty.call(result, 'last_price')) {
    return hasDisplayValue(result.last_price) ? result.last_price : null;
  }
  if (Object.prototype.hasOwnProperty.call(result, 'current_price')) {
    return hasDisplayValue(result.current_price) ? result.current_price : null;
  }

  return coalesceDisplayValue(result.last_close_price);
}

function normalizeConfidencePercent(value) {
  if (!hasDisplayValue(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
}

function formatConfidenceDisplay(score, label) {
  const percent = normalizeConfidencePercent(score);
  if (!hasDisplayValue(percent)) return null;
  const scoreText = typeof percent === 'number' ? `${percent}%` : percent;
  return label ? `${scoreText} — ${label}` : scoreText;
}

function confidenceTone(tier) {
  return (
    {
      very_low: 'red',
      low: 'yellow',
      moderate: 'orange',
      high: 'lime',
      very_high: 'green',
    }[tier] || undefined
  );
}

function formatWibPriceTimestamp(value, includeTime = true) {
  if (!hasDisplayValue(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});

  const dateText = `${parts.year}-${parts.month}-${parts.day}`;
  return includeTime ? `${dateText}  ${parts.hour}:${parts.minute} WIB` : dateText;
}

function formatPriceAsOf(result, fallbackValue) {
  const timestamp = result.price_timestamp || fallbackValue;
  if (!hasDisplayValue(timestamp)) return null;
  if (result.price_is_fallback) {
    return `${formatWibPriceTimestamp(timestamp, false)}  (Previous Close — Fallback)`;
  }
  const label = formatWibPriceTimestamp(timestamp, true);
  if (result.market_status === 'open') return `${label}  (Intraday)`;
  if (result.market_status === 'closed') return `${label}  (Closing Price)`;
  return label;
}

function truncateWords(text, limit) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) return String(text || '').trim();
  return `${words.slice(0, limit).join(' ')}…`;
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function formatTechnicalPrice(value, result) {
  if (!hasDisplayValue(value)) return '—';
  return formatPrice(value, result.normalized_ticker || result.ticker, result.price_currency || result.currency) || '—';
}

function formatEntryRange(levels, result) {
  const low = levels?.entry_range_low;
  const high = levels?.entry_range_high;
  if (!hasDisplayValue(low) && !hasDisplayValue(high)) return '—';
  if (hasDisplayValue(low) && hasDisplayValue(high) && Number(low) !== Number(high)) {
    return `${formatTechnicalPrice(low, result)} - ${formatTechnicalPrice(high, result)}`;
  }
  return formatTechnicalPrice(hasDisplayValue(low) ? low : high, result);
}

function riskRewardTone(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'text-bloomberg-muted';
  if (text.includes('not attractive')) return 'text-bloomberg-red';
  if (/^1\s*:/.test(text)) return 'text-bloomberg-green';
  return 'text-bloomberg-white';
}

function formatDataSourcePriceLabel(result) {
  const priceSource = result.data_sources?.price;
  if (priceSource?.provider) {
    const timestamp = priceSource.timestamp || result.price_timestamp || result.current_price_as_of;
    const dateLabel = formatWibPriceTimestamp(timestamp, !priceSource.is_fallback);
    const fallback = priceSource.is_fallback ? '⚠  ' : '';
    const fallbackText = priceSource.is_fallback ? ' (previous close fallback)' : '';
    return `${fallback}Price: ${priceSource.provider}${fallbackText}${dateLabel ? ` · ${dateLabel}` : ''}`;
  }

  const source = coalesceDisplayValue(result.price_source, result.current_price_source);
  if (!source) return null;
  const provider = String(source).toLowerCase().includes('yfinance') ? 'Yahoo Finance' : String(source);
  const timestamp = result.price_timestamp || result.current_price_as_of;
  const dateLabel = formatWibPriceTimestamp(timestamp, !result.price_is_fallback);
  const fallback = result.price_is_fallback ? '⚠  ' : '';
  const fallbackText = result.price_is_fallback ? ' (previous close fallback)' : '';
  return `${fallback}Price: ${provider}${fallbackText}${dateLabel ? ` · ${dateLabel}` : ''}`;
}

function formatVolatilityValue(result) {
  if (!hasDisplayValue(result.volatility_score)) return null;
  const score = typeof result.volatility_score === 'number' ? result.volatility_score.toFixed(2).replace(/\.00$/, '') : result.volatility_score;
  return `${score} / 100`;
}

function volatilitySubValue(result) {
  const classification = result.volatility_classification;
  const lookback = result.volatility_lookback_days;
  if (classification && lookback) return `${classification} · ${lookback}-day lookback`;
  if (classification) return classification;
  if (lookback) return `${lookback}-day lookback`;
  return null;
}

function DecisionBadge({ decision }) {
  const signal = normalizeSignal(decision);
  const cfg = {
    BUY: {
      classes: 'bg-bloomberg-green-dim border-bloomberg-green text-bloomberg-green',
      label: '▲ BUY',
    },
    SELL: {
      classes: 'bg-bloomberg-red-dim border-bloomberg-red text-bloomberg-red',
      label: '▼ SELL',
    },
    HOLD: {
      classes: 'bg-bloomberg-amber-dim border-bloomberg-amber text-bloomberg-amber',
      label: '◆ HOLD',
    },
    WAIT: {
      classes: 'bg-bloomberg-surface border-bloomberg-border text-bloomberg-muted',
      label: '◇ WAIT',
    },
    REDUCE: {
      classes: 'bg-bloomberg-amber-dim border-bloomberg-amber text-bloomberg-amber',
      label: '◒ REDUCE',
    },
  };
  const c = cfg[signal] || cfg.HOLD;
  return (
    <span
      className={`inline-block border px-4 py-1.5 font-mono text-sm font-bold tracking-widest ${c.classes}`}
    >
      {c.label}
    </span>
  );
}

DecisionBadge.propTypes = {
  decision: PropTypes.string,
};

function getWarningPriority(warning) {
  if (!warning) return 99;
  if (warning.blocking) return 0;
  if (warning.code === 'PRICE_MISSING' || warning.code === 'OHLCV_MISSING') return 1;
  if (warning.code === 'TRADE_PLAN_INVALID' || warning.code === 'TRADE_LEVELS_INVALID') return 2;
  if (warning.code === 'NEWS_UNAVAILABLE' || warning.code === 'NEWS_PARTIAL') return 3;
  return 4;
}

function DataQuality({
  dq,
  validationWarnings = [],
  validationWarningDetails = [],
  requestWarnings = [],
  tradePlanValid = false,
  isActionable = false,
}) {
  const validationDetails = (
    Array.isArray(validationWarningDetails) && validationWarningDetails.length > 0
      ? validationWarningDetails
      : Array.isArray(validationWarnings)
        ? validationWarnings
        : []
  )
    .map(formatWarningDetail)
    .filter(Boolean);
  const readableRequestWarnings = Array.isArray(requestWarnings)
    ? requestWarnings.filter(hasDisplayValue).map(String)
    : [];
  const tradePlanStatus = getTradePlanStatus(isActionable, tradePlanValid);
  const hasDataQuality = Boolean(dq);

  if (
    !hasDataQuality &&
    validationDetails.length === 0 &&
    readableRequestWarnings.length === 0 &&
    !tradePlanStatus
  )
    return null;

  const dataWarningSource =
    Array.isArray(dq?.warning_details) && dq.warning_details.length > 0
      ? dq.warning_details
      : Array.isArray(dq?.warnings)
        ? dq.warnings
        : [];
  const dataWarningDetails = dataWarningSource
    .map(formatWarningDetail)
    .filter(Boolean)
    .sort((a, b) => getWarningPriority(a) - getWarningPriority(b));

  const items = [
    { label: 'PRICE', status: dq?.price_data },
    { label: 'TRADE LEVELS', status: dq?.trade_levels },
    { label: 'LLM OUTPUT', status: dq?.llm_output },
    { label: 'VOLATILITY', status: dq?.volatility_data },
    { label: 'FUNDAMENTALS', status: dq?.fundamentals },
    { label: 'NEWS', status: dq?.news },
  ].filter((item) => item.status !== undefined && item.status !== null);

  return (
    <div>
      <SectionHeader label="DATA QUALITY" />
      <div className="flex flex-wrap gap-2">
        <span
          className={`font-mono text-xs px-2.5 py-1 border tracking-wider ${getStatusClasses(
            tradePlanStatus.tone
          )}`}
        >
          {tradePlanStatus.label}: {tradePlanStatus.status}
        </span>
        {items.map(({ label, status }) => (
          <span
            key={label}
            className={`font-mono text-xs px-2.5 py-1 border tracking-wider ${getStatusClasses(
              getDataQualityTone(label, status)
            )}`}
          >
            {label}: {status || 'N/A'}
          </span>
        ))}
      </div>
      {dataWarningDetails.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-1.5">
            Data Warnings
          </div>
          <div className="flex flex-col gap-1.5">
            {dataWarningDetails.slice(0, 3).map((warning, i) => (
              <div
                key={`${warning.code}-${i}`}
                className={`font-mono text-xs px-2.5 py-1 border leading-relaxed ${getStatusClasses(
                  warning.severity
                )}`}
              >
                {warning.text}
                {warning.blocking ? ' · blocking' : ' · non-blocking'}
              </div>
            ))}
          </div>
        </div>
      )}
      {validationDetails.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-1.5">
            Validation Warnings
          </div>
          <div className="flex flex-wrap gap-2">
            {validationDetails.map((warning, i) => (
              <span
                key={`${warning.code}-${i}`}
                className={`font-mono text-xs px-2.5 py-1 border tracking-wider ${getStatusClasses(
                  warning.severity
                )}`}
              >
                {warning.text}
              </span>
            ))}
          </div>
        </div>
      )}
      {readableRequestWarnings.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-1.5">
            Request Warnings
          </div>
          <div className="flex flex-col gap-1.5">
            {readableRequestWarnings.map((warning) => (
              <div
                key={warning}
                className="font-mono text-xs px-2.5 py-1 border border-bloomberg-amber bg-bloomberg-amber-dim text-bloomberg-amber leading-relaxed"
              >
                {warning}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

DataQuality.propTypes = {
  dq: PropTypes.object,
  validationWarnings: PropTypes.array,
  validationWarningDetails: PropTypes.array,
  requestWarnings: PropTypes.array,
  tradePlanValid: PropTypes.bool,
  isActionable: PropTypes.bool,
};

function getActionPlanMetrics({ result, currentPrice, riskReward }) {
  return [
    {
      label: 'CURRENT PRICE',
      value: hasDisplayValue(currentPrice) ? formatPrice(currentPrice, result.ticker, result.price_currency || result.currency) : 'N/A',
      highlight: true,
    },
    {
      label: 'ENTRY',
      value: hasDisplayValue(result.entry_price)
        ? formatPrice(result.entry_price, result.ticker, result.price_currency || result.currency)
        : 'N/A',
    },
    {
      label: 'STOP LOSS',
      value: hasDisplayValue(result.stop_loss)
        ? formatPrice(result.stop_loss, result.ticker, result.price_currency || result.currency)
        : 'N/A',
    },
    {
      label: 'TAKE PROFIT',
      value: hasDisplayValue(result.take_profit)
        ? formatPrice(result.take_profit, result.ticker, result.price_currency || result.currency)
        : 'N/A',
    },
    {
      label: 'MAX DRAWDOWN',
      value: result.max_drawdown_estimate || 'N/A',
    },
    {
      label: 'VOLATILITY',
      value: result.volatility_level || 'N/A',
    },
    {
      label: 'VOLATILITY SCORE',
      value: formatVolatilityValue(result) || 'N/A',
      subValue: volatilitySubValue(result),
      tooltip:
        result.volatility_method ||
        'Calculated from annualized daily return volatility, normalized to 0–100 scale. Higher score means higher price swings.',
    },
    {
      label: 'REBALANCING',
      value: result.rebalancing_action || 'N/A',
    },
    {
      label: 'POSITION ACTION',
      value: result.position_action || 'N/A',
    },
    {
      label: 'NEW ENTRY ACTION',
      value: result.new_entry_action || 'N/A',
    },
    {
      label: 'POSITION SIZE HINT',
      value: result.position_size_hint || 'N/A',
    },
    {
      label: 'R/R RATIO',
      value: riskReward || 'N/A',
      highlight: true,
    },
  ];
}

function ActionableMetrics({ result, currentPrice, riskReward }) {
  const metrics = getActionPlanMetrics({ result, currentPrice, riskReward });

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border">
      <SectionHeader label="ACTION PLAN" />
      <div
        data-testid="action-plan-grid"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
      >
        {metrics.map((metric) => (
          <MetricBox
            key={metric.label}
            label={metric.label}
            value={metric.value}
            highlight={metric.highlight}
            subValue={metric.subValue}
            tooltip={metric.tooltip}
            tone={metric.tone}
            preserveSlot
            dataTestId="action-plan-metric"
          />
        ))}
      </div>
      {result.position_sizing_reason && (
        <p className="mt-3 font-mono text-xs text-bloomberg-muted leading-relaxed">
          {parseBold(result.position_sizing_reason)}
        </p>
      )}
    </div>
  );
}

ActionableMetrics.propTypes = {
  result: PropTypes.object.isRequired,
  currentPrice: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  riskReward: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

function HoldMetrics({ result, currentPrice }) {
  const hasHoldMetrics =
    hasDisplayValue(currentPrice) ||
    result.volatility_level ||
    hasDisplayValue(result.volatility_score) ||
    result.rebalancing_action ||
    result.position_action ||
    result.new_entry_action ||
    result.position_size_hint;

  if (!hasHoldMetrics) return null;

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border">
      <SectionHeader label="ACTION STATUS" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {hasDisplayValue(currentPrice) && (
          <MetricBox
            label="CURRENT PRICE"
            value={formatPrice(currentPrice, result.ticker, result.price_currency || result.currency)}
            highlight
          />
        )}
        {result.volatility_level && (
          <MetricBox label="VOLATILITY" value={result.volatility_level} />
        )}
        {hasDisplayValue(result.volatility_score) && (
          <MetricBox
            label="VOLATILITY SCORE"
            value={formatVolatilityValue(result)}
            subValue={volatilitySubValue(result)}
            tooltip={
              result.volatility_method ||
              'Calculated from annualized daily return volatility, normalized to 0–100 scale. Higher score means higher price swings.'
            }
          />
        )}
        {result.rebalancing_action && (
          <MetricBox label="REBALANCING" value={result.rebalancing_action} />
        )}
        {result.position_action && (
          <MetricBox label="POSITION ACTION" value={result.position_action} />
        )}
        {result.new_entry_action && (
          <MetricBox label="NEW ENTRY ACTION" value={result.new_entry_action} />
        )}
        {result.position_size_hint && (
          <MetricBox label="POSITION SIZE HINT" value={result.position_size_hint} />
        )}
      </div>
    </div>
  );
}

HoldMetrics.propTypes = {
  result: PropTypes.object.isRequired,
  currentPrice: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

function ExpandableTextSection({
  label,
  text,
  expanded,
  onToggle,
  collapsedWords,
  expandedMaxClass,
  expandLabel,
}) {
  if (!hasDisplayValue(text)) return null;

  const needsToggle = wordCount(text) > collapsedWords;
  const visibleText = expanded || !needsToggle ? text : truncateWords(text, collapsedWords);

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border">
      <SectionHeader label={label} />
      <div
        className={`relative ${expanded ? `${expandedMaxClass} overflow-y-auto pr-2` : 'overflow-hidden'}`}
      >
        <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
          {parseBold(visibleText)}
        </p>
        {!expanded && needsToggle && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-bloomberg-card to-transparent" />
        )}
      </div>
      {needsToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 font-mono text-xs text-bloomberg-orange hover:text-orange-300 transition-colors tracking-wider"
        >
          {expanded ? 'Collapse' : expandLabel}
        </button>
      )}
    </div>
  );
}

ExpandableTextSection.propTypes = {
  label: PropTypes.string.isRequired,
  text: PropTypes.string,
  expanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  collapsedWords: PropTypes.number.isRequired,
  expandedMaxClass: PropTypes.string.isRequired,
  expandLabel: PropTypes.string.isRequired,
};

function KeyLevels({ levels, result }) {
  if (!levels) return null;

  if (levels.technical_levels_available === false) {
    return (
      <div className="px-4 py-4 border-b border-bloomberg-border">
        <SectionHeader label="KEY LEVELS" />
        <p className="font-mono text-xs text-bloomberg-muted">
          Technical levels could not be calculated for this analysis.
        </p>
      </div>
    );
  }

  const rows = [
    ['Current Price', formatTechnicalPrice(levels.current_price, result)],
    ['Nearest Support', formatTechnicalPrice(levels.nearest_support, result)],
    ['Nearest Resistance', formatTechnicalPrice(levels.nearest_resistance, result)],
    ['Suggested Stop Loss', formatTechnicalPrice(levels.suggested_stop_loss, result)],
    ['Invalidation Level', formatTechnicalPrice(levels.invalidation_level, result)],
    ['Entry Range', formatEntryRange(levels, result)],
    ['Risk / Reward', levels.risk_reward_ratio || '—', riskRewardTone(levels.risk_reward_ratio)],
  ];

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border">
      <SectionHeader label="KEY LEVELS" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs">
        {rows.map(([label, value, tone]) => (
          <React.Fragment key={label}>
            <div className="text-bloomberg-muted">{label}</div>
            <div className={`text-right sm:text-left ${tone || 'text-bloomberg-white'}`}>{value}</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

KeyLevels.propTypes = {
  levels: PropTypes.object,
  result: PropTypes.object.isRequired,
};

function pipelineStatusMeta(status) {
  const normalized = String(status || 'ok').toLowerCase();
  if (normalized === 'partial') return { icon: '⚠', classes: 'text-bloomberg-amber' };
  if (normalized === 'fallback') return { icon: 'ℹ', classes: 'text-bloomberg-orange' };
  if (normalized === 'error') return { icon: '✗', classes: 'text-bloomberg-red' };
  return { icon: '✓', classes: 'text-bloomberg-green' };
}

function AgentPipeline({ pipeline = [], agents = [], totalSeconds }) {
  const [expandedRows, setExpandedRows] = useState({});

  if (Array.isArray(pipeline) && pipeline.length > 0) {
    return (
      <div className="px-4 py-4 border-b border-bloomberg-border">
        <SectionHeader label="AGENT PIPELINE" />
        <div className="flex flex-col gap-1.5">
          {pipeline.map((agent) => {
            const statusMeta = pipelineStatusMeta(agent.status);
            const warning = agent.warning;
            const rowKey = agent.name;
            return (
              <button
                type="button"
                key={rowKey}
                onClick={() => warning && setExpandedRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }))}
                className="text-left border border-bloomberg-border px-2.5 py-2 bg-black bg-opacity-10 hover:bg-bloomberg-surface transition-colors"
              >
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center font-mono text-xs">
                  <span className="text-bloomberg-muted">{agent.name}</span>
                  <span className={statusMeta.classes}>{statusMeta.icon}</span>
                  <span className="text-bloomberg-white">
                    {hasDisplayValue(agent.duration_seconds) ? `${Number(agent.duration_seconds).toFixed(1)}s` : '—'}
                  </span>
                </div>
                {warning && (
                  <div className="mt-1 font-mono text-[11px] text-bloomberg-amber">
                    {expandedRows[rowKey] ? warning : 'Warning available'}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {hasDisplayValue(totalSeconds) && (
          <div className="mt-3 font-mono text-xs text-bloomberg-white">
            Total pipeline time: {Number(totalSeconds).toFixed(1)}s
          </div>
        )}
      </div>
    );
  }

  if (!agents.length) return null;

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border">
      <SectionHeader label="AGENT PIPELINE" />
      <div className="flex flex-wrap gap-1.5">
        {agents.map((agent, index) => (
          <span
            key={`${agent}-${index}`}
            className="font-mono text-xs px-2 py-1 border border-bloomberg-border text-bloomberg-muted"
          >
            <span className="text-bloomberg-green mr-1.5">✓</span>
            {agent}
          </span>
        ))}
      </div>
    </div>
  );
}

AgentPipeline.propTypes = {
  pipeline: PropTypes.array,
  agents: PropTypes.array,
  totalSeconds: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

function ReportDisclaimer() {
  return (
    <div className="px-4 py-4 border-b border-bloomberg-border bg-black bg-opacity-20">
      <SectionHeader label="DISCLAIMER" />
      <p className="font-mono text-[11px] text-bloomberg-muted leading-relaxed whitespace-pre-line">
        {REPORT_DISCLAIMER}
      </p>
    </div>
  );
}

export default function ResultCard({ result, enableReportExport = true, mockReport = false }) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [thesisExpanded, setThesisExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [activeTab, setActiveTab] = useState('analisis');
  const disabledTabs = [];

  if (!result) return null;

  if (result.error) {
    return (
      <div className="border border-bloomberg-red bg-bloomberg-red-dim animate-fade-up">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-bloomberg-red border-opacity-30">
          <span className="font-mono text-xs font-semibold text-bloomberg-red tracking-wider">
            PIPELINE ERROR
          </span>
        </div>
        <div className="px-4 py-4">
          <pre className="font-mono text-xs text-bloomberg-red leading-relaxed whitespace-pre-wrap">
            {getError(result.error)}
          </pre>
        </div>
      </div>
    );
  }

  const displayTicker = result.normalized_ticker || result.ticker;
  const displayResult = { ...result, ticker: displayTicker };
  const finalDecision = getFinalDecision(result);
  const rawAiSignal = normalizeSignal(result.raw_ai_signal || result.llm_decision || result.final_decision || result.decision);
  const isActionable = ACTIONABLE_DECISIONS.has(finalDecision);
  const tradePlanValid = Boolean(result.trade_plan_valid);
  const shouldShowActionPlan = isActionable && tradePlanValid;
  const shouldShowHoldMetrics = !shouldShowActionPlan;

  const analysisOverview = result.analysis_overview || {};
  const summary = analysisOverview.executive_summary || result.executive_summary;
  const thesis = analysisOverview.investment_thesis || result.investment_thesis;
  const currentPrice = getCurrentPrice(result);
  const currentPriceAsOf = coalesceDisplayValue(
    result.price_timestamp,
    result.current_price_as_of,
    result.last_close_price_as_of
  );
  const priceAsOfLabel = formatPriceAsOf(result, currentPriceAsOf);
  const priceTimestampLabel = formatWibPriceTimestamp(currentPriceAsOf);
  const currentPriceSource = formatDataSourcePriceLabel(result);
  const timeHorizon = formatAnalysisHorizon(result.time_horizon_months, result.time_horizon);
  const confidence = result.confidence_score ?? null;
  const confidenceDisplay = formatConfidenceDisplay(confidence, result.confidence_label);
  const allocation = result.suggested_allocation_percent ?? null;
  const riskReward = formatRiskReward(result);
  const catalysts = result.key_catalysts || [];
  const keyReasons = analysisOverview.key_reasons || result.key_reasons || catalysts;
  const invalidations = result.invalidation_conditions || [];
  const riskSummary = analysisOverview.risk_summary || null;
  const miniRiskSummary = result.mini_risk_summary;
  const signalPositionLabel = result.has_existing_position ? 'Existing position' : 'No existing position';
  const agents = result.agents_used || [];
  const budgetExhausted = Boolean(result.budget_exhausted);
  const agentsSkipped = result.agents_skipped || [];
  const canShowRaw = result.response_detail === 'debug';
  const createdAtLabel = formatDateTimeLabel(result.analysis_created_at || result.saved_at);

  const decisionColor =
    {
      BUY: 'text-bloomberg-green',
      SELL: 'text-bloomberg-red',
      HOLD: 'text-bloomberg-amber',
      WAIT: 'text-bloomberg-muted',
      REDUCE: 'text-bloomberg-amber',
    }[finalDecision] || 'text-bloomberg-white';

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card animate-fade-up">
      {/* Header bar */}
      <div className="bg-black px-4 py-2 border-b border-bloomberg-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-bloomberg-muted tracking-wider">
            ANALYSIS COMPLETE
          </span>
          <span className="font-mono text-xs text-bloomberg-green">●</span>
        </div>
        <div className="flex items-center gap-3 min-w-0 flex-wrap justify-end">
          {timeHorizon && (
            <span className="font-mono text-xs text-bloomberg-orange truncate">
              Analysis Horizon: {timeHorizon}
            </span>
          )}
          <span className="font-mono text-xs text-bloomberg-muted flex-shrink-0">
            Trade Date: {result.trade_date}
          </span>
          {createdAtLabel && (
            <span className="font-mono text-xs text-bloomberg-muted flex-shrink-0">
              Created: {createdAtLabel}
            </span>
          )}
          {enableReportExport && (result.job_id || result.request_id) && (
            <ExportReportButtons
              resourceId={result.job_id || result.request_id}
              result={displayResult}
              disabled={Boolean(result.error)}
              mockReport={mockReport}
            />
          )}
        </div>
      </div>

      <ResultTabs activeTab={activeTab} onTabChange={setActiveTab} disabledTabs={disabledTabs} />

      {activeTab === 'analisis' && (
        <>
          {/* Decision hero */}
          <div className="px-4 py-5 border-b border-bloomberg-border flex items-start justify-between gap-4">
            <div>
              <div className={`font-display text-5xl font-bold tracking-wider ${decisionColor}`}>
                {formatTickerLabel(displayTicker)}
              </div>
              <div className="mt-3">
                <DecisionBadge decision={finalDecision} />
              </div>
              {finalDecision && (
                <div className="mt-2 font-mono text-xs text-bloomberg-muted tracking-wider">
                  RECOMMENDATION: {String(finalDecision).toUpperCase()}
                </div>
              )}
              {finalDecision && (
                <div className="mt-1 font-mono text-[11px] text-bloomberg-muted tracking-wider">
                  Signal adapted · {signalPositionLabel} · Raw AI signal: {rawAiSignal}
                </div>
              )}
              {currentPriceSource && (
                <div className="mt-1 font-mono text-[11px] text-bloomberg-muted tracking-wider break-all">
                  <span className="text-bloomberg-white">{currentPriceSource}</span>
                </div>
              )}
              {rawAiSignal && rawAiSignal !== finalDecision && (
                <div className="mt-1 font-mono text-xs text-bloomberg-muted tracking-wider">
                  LLM: {rawAiSignal} → FINAL: {String(finalDecision).toUpperCase()}
                </div>
              )}
            </div>

            {/* Key metrics — PRICE TARGET removed */}
            <div className="min-w-0 flex-shrink-0 w-full lg:w-[43rem] max-w-full">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {hasDisplayValue(currentPrice) && (
                  <MetricBox
                    label="LAST PRICE"
                    value={formatPrice(currentPrice, displayTicker, result.price_currency || result.currency)}
                    subValue={result.price_is_fallback || !priceTimestampLabel ? null : `as of ${priceTimestampLabel}`}
                    highlight
                  />
                )}
                {priceAsOfLabel && <MetricBox label="PRICE AS OF" value={priceAsOfLabel} />}
                {timeHorizon && <MetricBox label="HORIZON" value={timeHorizon} />}
                {confidenceDisplay && (
                  <MetricBox
                    label="CONFIDENCE"
                    value={confidenceDisplay}
                    tone={confidenceTone(result.confidence_tier)}
                    tooltip="Score reflects combined signal strength from all 9 agents."
                  />
                )}
                {allocation !== null && (
                  <MetricBox label="ALLOCATION" value={formatPercent(allocation)} />
                )}
              </div>
              {result.price_is_fallback && (
                <div className="mt-2 font-mono text-[11px] text-bloomberg-amber leading-relaxed">
                  ⚠ Harga tidak tersedia saat analisis dibuat. Menampilkan harga penutupan terakhir.
                </div>
              )}
            </div>
          </div>

          {!hasDisplayValue(currentPrice) && (
            <div className="px-4 py-4 border-b border-bloomberg-border">
              <NoticeBox title="PRICE DATA MISSING" tone="red">
                Last price is unavailable, so no synthetic price is shown.
              </NoticeBox>
            </div>
          )}

          {(result.decision_adjusted || (isActionable && !tradePlanValid)) && (
            <div className="px-4 py-4 border-b border-bloomberg-border">
              {result.decision_adjusted && (
                <NoticeBox title="DECISION ADJUSTED">
                  {result.decision_adjusted_reason ||
                    'Backend validation changed the final decision.'}
                </NoticeBox>
              )}
              {isActionable && !tradePlanValid && (
                <div className={result.decision_adjusted ? 'mt-3' : ''}>
                  <NoticeBox title="TRADE PLAN NOT VALID" tone="red">
                    Backend validation did not approve a complete actionable trade plan.
                  </NoticeBox>
                </div>
              )}
            </div>
          )}

          {shouldShowActionPlan && (
            <ActionableMetrics
              result={displayResult}
              currentPrice={currentPrice}
              riskReward={riskReward}
            />
          )}

          {shouldShowHoldMetrics && <HoldMetrics result={displayResult} currentPrice={currentPrice} />}

          {result.technical_levels && <KeyLevels levels={result.technical_levels} result={displayResult} />}

          {budgetExhausted && (
            <div className="px-4 py-4 border-b border-bloomberg-border bg-bloomberg-amber bg-opacity-5">
              <SectionHeader label="PIPELINE LIMIT" />
              <p className="font-mono text-xs text-bloomberg-amber leading-relaxed">
                LLM call budget exhausted before all stages completed. Treat this analysis as
                incomplete.
              </p>
              {agentsSkipped.length > 0 && (
                <div className="mt-2 font-mono text-xs text-bloomberg-muted">
                  SKIPPED: {agentsSkipped.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Catalysts + Invalidations */}
          {(catalysts.length > 0 || invalidations.length > 0) && (
            <div className="px-4 py-4 border-b border-bloomberg-border grid grid-cols-2 gap-4">
              {catalysts.length > 0 && (
                <div>
                  <SectionHeader label="KEY CATALYSTS" />
                  <ul className="flex flex-col gap-1.5">
                    {catalysts.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-mono text-xs text-bloomberg-green flex-shrink-0 mt-0.5">
                          +
                        </span>
                        <span className="font-mono text-xs text-bloomberg-muted leading-relaxed">
                          {c}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {invalidations.length > 0 && (
                <div>
                  <SectionHeader label="INVALIDATION CONDITIONS" />
                  <ul className="flex flex-col gap-1.5">
                    {invalidations.map((inv, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-mono text-xs text-bloomberg-red flex-shrink-0 mt-0.5">
                          ✕
                        </span>
                        <span className="font-mono text-xs text-bloomberg-muted leading-relaxed">
                          {inv}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <ExpandableTextSection
            label="EXECUTIVE SUMMARY"
            text={summary}
            expanded={summaryExpanded}
            onToggle={() => setSummaryExpanded(!summaryExpanded)}
            collapsedWords={100}
            expandedMaxClass="max-h-[300px]"
            expandLabel="Read More"
          />

          {keyReasons.length > 0 && (
            <div className="px-4 py-4 border-b border-bloomberg-border">
              <SectionHeader label="KEY REASONS" />
              <ul className="flex flex-col gap-1.5">
                {keyReasons.map((reason, index) => (
                  <li key={`${reason}-${index}`} className="font-mono text-xs text-bloomberg-muted">
                    + {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(miniRiskSummary || riskSummary) && (
            <div className="px-4 py-4 border-b border-bloomberg-border">
              <SectionHeader label="MINI RISK SUMMARY" />
              <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
                {miniRiskSummary || `${riskSummary.overall_risk || 'N/A'}: ${riskSummary.short_reason || 'N/A'}`}
              </p>
            </div>
          )}

          <ExpandableTextSection
            label="INVESTMENT THESIS"
            text={thesis}
            expanded={thesisExpanded}
            onToggle={() => setThesisExpanded(!thesisExpanded)}
            collapsedWords={150}
            expandedMaxClass="max-h-[500px]"
            expandLabel="Read Full Thesis"
          />

          <AgentPipeline
            pipeline={result.agent_pipeline}
            agents={agents}
            totalSeconds={result.total_pipeline_seconds}
          />

          <ReportDisclaimer />

          {/* Raw JSON debug */}
          {canShowRaw && (
            <div className="px-4 py-3">
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="font-mono text-xs text-bloomberg-muted hover:text-bloomberg-white tracking-wider transition-colors"
              >
                {showRaw ? '▲ HIDE' : '▼ RAW JSON'} (DEBUG)
              </button>
              {showRaw && (
                <pre className="mt-3 bg-black border border-bloomberg-border p-3 text-xs font-mono text-bloomberg-muted overflow-x-auto leading-relaxed whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'profile' && <ProfileTab profile={result.company_profile} />}

      {activeTab === 'fundamental' && (
        <FundamentalTab financialHighlights={result.financial_highlights} result={result} />
      )}

      {activeTab === 'chart_price' && <ChartPriceTab result={result} />}

      {activeTab === 'news' && <NewsTab result={result} />}

      {activeTab === 'risk_data_quality' && <RiskDataQualityTab result={result} />}
    </div>
  );
}

ResultCard.propTypes = {
  result: PropTypes.object,
  enableReportExport: PropTypes.bool,
  mockReport: PropTypes.bool,
};
