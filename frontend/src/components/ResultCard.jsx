import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ConfidenceBreakdown from './ConfidenceBreakdown';
import DisclaimerFooter from './DisclaimerFooter';
import RerunPanel from './RerunPanel';
import AnalysisStatusRow from './results/AnalysisStatusRow';
import MetricBox from './results/MetricBox';
import NoticeBox from './results/NoticeBox';
import SectionHeader from './results/SectionHeader';
import ChartPriceTab from './results/tabs/ChartPriceTab';
import FundamentalTab from './results/tabs/FundamentalTab';
import NewsTab from './results/tabs/NewsTab';
import ProfileTab from './results/tabs/ProfileTab';
import ReportActions from './results/ReportActions';
import ResultTabs from './results/tabs/ResultTabs';
import { useResultSections } from '../hooks/useResultSections';
import { resolveClockConfig } from '../utils/clock';
import {
  formatDateTimeLabel,
  formatPrice,
  formatTickerLabel,
  formatTradeDateLabel,
} from '../utils/formatting';

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
  const normalized = String(signal || 'HOLD')
    .trim()
    .toUpperCase();
  if (normalized === 'OVERWEIGHT') return 'BUY';
  if (normalized === 'UNDERWEIGHT' || normalized === 'AVOID') return 'SELL';
  if (['BUY', 'HOLD', 'WAIT', 'REDUCE', 'SELL', 'NEUTRAL'].includes(normalized)) return normalized;
  return 'HOLD';
}

function getFinalDecision(result) {
  return normalizeSignal(
    result.display_signal ?? result.final_decision ?? result.decision ?? result.rating
  );
}

function getCurrentPrice(result) {
  if (!result) return null;

  if (Object.prototype.hasOwnProperty.call(result, 'last_price')) {
    if (hasDisplayValue(result.last_price)) return result.last_price;
  }
  if (Object.prototype.hasOwnProperty.call(result, 'current_price')) {
    if (hasDisplayValue(result.current_price)) return result.current_price;
  }
  const stalePriceData =
    result.data_quality?.price_data === 'stale' ||
    result.price_chart?.data_quality?.status === 'stale';
  if (stalePriceData && hasDisplayValue(result.company_profile?.current_price)) {
    return result.company_profile.current_price;
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

function formatDevicePriceTimestamp(value, includeTime = true) {
  if (!hasDisplayValue(value)) return null;
  const rawValue = String(value).trim();

  // Backend price rows are daily candles. A date-only value such as
  // 2026-05-12 must stay date-only; parsing it through JavaScript Date treats
  // it as midnight UTC and renders a misleading time-shifted timestamp.
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) return rawValue;

  const clockConfig = resolveClockConfig(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: clockConfig.timeZone,
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
  return includeTime ? `${dateText}  ${parts.hour}:${parts.minute} ${clockConfig.label}` : dateText;
}

function formatPriceAsOf(result, fallbackValue) {
  const timestamp = result.price_timestamp || fallbackValue;
  if (!hasDisplayValue(timestamp)) return null;
  if (result.price_is_fallback) {
    return `${formatDevicePriceTimestamp(timestamp, false)}  (Previous Close — Fallback)`;
  }
  const label = formatDevicePriceTimestamp(timestamp, true);
  if (result.market_status === 'open') return `${label}  (Intraday)`;
  if (result.market_status === 'closed') return `${label}  (Closing Price)`;
  return label;
}

function truncateWords(text, limit) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= limit) return String(text || '').trim();
  return `${words.slice(0, limit).join(' ')}…`;
}

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeInlineText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function truncateReasonRiskWords(text, maxWords = 150) {
  const words = normalizeInlineText(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}.`.replace(/\.\.$/, '.');
}

function fitRecommendationRiskWords(text, minWords = 100, maxWords = 150) {
  const normalized = normalizeInlineText(text);
  const floorText =
    'Rekomendasi ini harus dibaca bersama kualitas data, harga terakhir, volatilitas, likuiditas, katalis berita, dan validitas trade plan karena perubahan pada salah satu faktor tersebut dapat menurunkan conviction atau mengubah timing entry. Risiko tetap perlu dikontrol dengan ukuran posisi moderat, disiplin stop, dan pembaruan analisis saat data vendor atau kondisi pasar berubah. Jika sinyal utama melemah, alokasi harus ditahan sampai tesis dan level eksekusi kembali terkonfirmasi.';
  const combined =
    wordCount(normalized) >= minWords ? normalized : `${normalized} ${floorText}`.trim();
  return truncateReasonRiskWords(combined, maxWords);
}

function normalizeReasonItems(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeInlineText(item)).filter(Boolean);
  }

  const text = normalizeInlineText(value);
  return text ? [text] : [];
}

function normalizeRiskSummaryText(riskSummary) {
  if (!riskSummary || typeof riskSummary !== 'object') return '';

  return normalizeInlineText(
    [
      riskSummary.overall_risk && `Overall risk ${riskSummary.overall_risk}`,
      riskSummary.short_reason || riskSummary.risk_explanation,
      Array.isArray(riskSummary.main_risks) ? riskSummary.main_risks.join(', ') : null,
    ]
      .filter(Boolean)
      .join('. ')
  );
}

function buildRecommendationRiskParagraph({
  paragraph,
  reasons,
  catalysts,
  miniRiskSummary,
  riskSummary,
  decisionReason,
}) {
  const directParagraph = normalizeInlineText(paragraph);
  const riskText = normalizeInlineText(miniRiskSummary) || normalizeRiskSummaryText(riskSummary);

  const items = [
    ...(directParagraph
      ? [directParagraph]
      : [...normalizeReasonItems(reasons), ...normalizeReasonItems(catalysts)]),
    riskText,
    normalizeInlineText(decisionReason),
  ].filter(Boolean);

  const uniqueItems = Array.from(new Set(items));
  const joined = uniqueItems.join('. ');
  if (!joined) return '';

  const normalized = joined.endsWith('.') ? joined : `${joined}.`;
  return fitRecommendationRiskWords(normalized, 100, 150);
}

function formatDataSourcePriceLabel(result) {
  const priceSource = result.data_sources?.price;
  if (priceSource?.provider) {
    const timestamp = priceSource.timestamp || result.price_timestamp || result.current_price_as_of;
    const dateLabel = formatDevicePriceTimestamp(timestamp, !priceSource.is_fallback);
    const fallback = priceSource.is_fallback ? '⚠  ' : '';
    const fallbackText = priceSource.is_fallback ? ' (previous close fallback)' : '';
    return `${fallback}Price: ${priceSource.provider}${fallbackText}${dateLabel ? ` · ${dateLabel}` : ''}`;
  }

  const source = coalesceDisplayValue(result.price_source, result.current_price_source);
  if (!source) return null;
  const provider = String(source).toLowerCase().includes('yfinance')
    ? 'Yahoo Finance'
    : String(source);
  const timestamp = result.price_timestamp || result.current_price_as_of;
  const dateLabel = formatDevicePriceTimestamp(timestamp, !result.price_is_fallback);
  const fallback = result.price_is_fallback ? '⚠  ' : '';
  const fallbackText = result.price_is_fallback ? ' (previous close fallback)' : '';
  return `${fallback}Price: ${provider}${fallbackText}${dateLabel ? ` · ${dateLabel}` : ''}`;
}

function formatVolatilityValue(result) {
  if (!hasDisplayValue(result.volatility_score)) return null;
  const score =
    typeof result.volatility_score === 'number'
      ? result.volatility_score.toFixed(2).replace(/\.00$/, '')
      : result.volatility_score;
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
      value: hasDisplayValue(currentPrice)
        ? formatPrice(currentPrice, result.ticker, result.price_currency || result.currency)
        : 'N/A',
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
  const metrics = getActionPlanMetrics({ result, currentPrice, riskReward }).map((metric) => ({
    ...metric,
    dataTestId: 'action-plan-metric',
  }));

  return (
    <AnalysisStatusRow
      label="ACTION PLAN"
      metrics={metrics}
      columnsClass="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
      reason={result.position_sizing_reason}
      reasonRenderer={parseBold}
    />
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
    result.new_entry_action ||
    result.position_size_hint;

  if (!hasHoldMetrics) return null;

  const metrics = [
    {
      label: 'CURRENT PRICE',
      value: hasDisplayValue(currentPrice)
        ? formatPrice(currentPrice, result.ticker, result.price_currency || result.currency)
        : 'N/A',
      highlight: true,
    },
    { label: 'VOLATILITY', value: result.volatility_level || 'N/A' },
    {
      label: 'VOLATILITY SCORE',
      value: formatVolatilityValue(result) || 'N/A',
      subValue: volatilitySubValue(result),
      tooltip:
        result.volatility_method ||
        'Calculated from annualized daily return volatility, normalized to 0–100 scale. Higher score means higher price swings.',
    },
    { label: 'REBALANCING', value: result.rebalancing_action || 'N/A' },
    { label: 'NEW ENTRY ACTION', value: result.new_entry_action || 'N/A' },
    { label: 'POSITION SIZE HINT', value: result.position_size_hint || 'N/A' },
  ];

  return (
    <AnalysisStatusRow
      label="ACTION STATUS"
      metrics={metrics}
      columnsClass="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2"
    />
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
        <p className="ai-summary-paragraph font-mono text-xs text-bloomberg-muted leading-relaxed text-justify">
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

function buildResultViewModel(result) {
  const displayTicker = result.normalized_ticker || result.ticker;
  const displayResult = { ...result, ticker: displayTicker };
  const finalDecision = getFinalDecision(result);
  const rawAiSignal = normalizeSignal(
    result.raw_ai_signal || result.llm_decision || result.final_decision || result.decision
  );
  const isActionable = ACTIONABLE_DECISIONS.has(finalDecision);
  const tradePlanValid = Boolean(result.trade_plan_valid);
  const analysisOverview = result.analysis_overview || {};
  const currentPrice = getCurrentPrice(result);
  const currentPriceAsOf = coalesceDisplayValue(
    result.price_timestamp,
    result.current_price_as_of,
    result.last_close_price_as_of
  );
  const catalysts = result.key_catalysts || [];
  const riskSummary = analysisOverview.risk_summary || null;
  const miniRiskSummary = result.mini_risk_summary;
  return {
    displayTicker,
    displayResult,
    finalDecision,
    rawAiSignal,
    isActionable,
    tradePlanValid,
    shouldShowActionPlan: isActionable && tradePlanValid,
    shouldShowHoldMetrics: !(isActionable && tradePlanValid),
    summary: analysisOverview.executive_summary || result.executive_summary,
    thesis: analysisOverview.investment_thesis || result.investment_thesis,
    currentPrice,
    priceAsOfLabel: formatPriceAsOf(result, currentPriceAsOf),
    priceTimestampLabel: formatDevicePriceTimestamp(currentPriceAsOf),
    currentPriceSource: formatDataSourcePriceLabel(result),
    timeHorizon: formatAnalysisHorizon(result.time_horizon_months, result.time_horizon),
    confidenceDisplay: formatConfidenceDisplay(result.confidence_score ?? null, result.confidence_label),
    allocation: result.suggested_allocation_percent ?? null,
    riskReward: formatRiskReward(result),
    catalysts,
    invalidations: result.invalidation_conditions || [],
    recommendationRiskParagraph: buildRecommendationRiskParagraph({
      paragraph: analysisOverview.key_reasons_paragraph || result.key_reasons_paragraph,
      reasons: analysisOverview.key_reasons || result.key_reasons,
      catalysts,
      miniRiskSummary,
      riskSummary,
      decisionReason: result.decision_adjusted_reason,
    }),
    agents: result.agents_used || [],
    budgetExhausted: Boolean(result.budget_exhausted),
    agentsSkipped: result.agents_skipped || [],
    canShowRaw: result.response_detail === 'debug',
    createdAtLabel: formatDateTimeLabel(result.analysis_created_at || result.saved_at),
    decisionColor:
      {
        BUY: 'text-bloomberg-green',
        SELL: 'text-bloomberg-red',
        HOLD: 'text-bloomberg-amber',
        WAIT: 'text-bloomberg-muted',
        REDUCE: 'text-bloomberg-amber',
      }[finalDecision] || 'text-bloomberg-white',
  };
}

function ResultError({ error }) {
  return (
    <div className="border border-bloomberg-red bg-bloomberg-red-dim animate-fade-up">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-bloomberg-red border-opacity-30">
        <span className="font-mono text-xs font-semibold text-bloomberg-red tracking-wider">
          PIPELINE ERROR
        </span>
      </div>
      <div className="px-4 py-4">
        <pre className="font-mono text-xs text-bloomberg-red leading-relaxed whitespace-pre-wrap">
          {getError(error)}
        </pre>
      </div>
    </div>
  );
}

ResultError.propTypes = {
  error: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
};

function ResultCardHeader({
  result,
  displayResult,
  timeHorizon,
  createdAtLabel,
  enableReportExport,
  mockReport,
  onRerunSubmit,
  rerunRunning,
  onToggleRerun,
}) {
  return (
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
          Trade Date: {formatTradeDateLabel(result.trade_date)}
        </span>
        {createdAtLabel && (
          <span className="font-mono text-xs text-bloomberg-muted flex-shrink-0">
            Created: {createdAtLabel}
          </span>
        )}
        <ReportActions
          result={result}
          displayResult={displayResult}
          enableReportExport={enableReportExport}
          mockReport={mockReport}
          onRerunSubmit={onRerunSubmit}
          rerunRunning={rerunRunning}
          onToggleRerun={onToggleRerun}
        />
      </div>
    </div>
  );
}

function DecisionHero({ result, vm }) {
  return (
    <div className="px-4 py-5 border-b border-bloomberg-border flex items-start justify-between gap-4">
      <div>
        <div className={`font-display text-5xl font-bold tracking-wider ${vm.decisionColor}`}>
          {formatTickerLabel(vm.displayTicker)}
        </div>
        <div className="mt-3">
          <DecisionBadge decision={vm.finalDecision} />
        </div>
        {vm.currentPriceSource && (
          <div className="mt-1 font-mono text-[11px] text-bloomberg-muted tracking-wider break-all">
            <span className="text-bloomberg-white">{vm.currentPriceSource}</span>
          </div>
        )}
        {vm.rawAiSignal && vm.rawAiSignal !== vm.finalDecision && (
          <div className="mt-1 font-mono text-xs text-bloomberg-muted tracking-wider">
            LLM: {vm.rawAiSignal} → FINAL: {String(vm.finalDecision).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-shrink-0 w-full lg:w-[43rem] max-w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {hasDisplayValue(vm.currentPrice) && (
            <MetricBox
              label="LAST PRICE"
              value={formatPrice(
                vm.currentPrice,
                vm.displayTicker,
                result.price_currency || result.currency
              )}
              subValue={
                result.price_is_fallback || !vm.priceTimestampLabel
                  ? null
                  : `as of ${vm.priceTimestampLabel}`
              }
              highlight
            />
          )}
          {vm.priceAsOfLabel && <MetricBox label="PRICE AS OF" value={vm.priceAsOfLabel} />}
          {vm.timeHorizon && <MetricBox label="HORIZON" value={vm.timeHorizon} />}
          {vm.confidenceDisplay && (
            <MetricBox
              label="CONFIDENCE"
              value={vm.confidenceDisplay}
              tone={confidenceTone(result.confidence_tier)}
              tooltip="Score reflects combined signal strength from all 9 agents."
            />
          )}
          {vm.allocation !== null && (
            <MetricBox label="ALLOCATION" value={formatPercent(vm.allocation)} />
          )}
        </div>
        <ConfidenceBreakdown breakdown={result.confidence_breakdown} />
        {result.price_is_fallback && (
          <div className="mt-2 font-mono text-[11px] text-bloomberg-amber leading-relaxed">
            ⚠ Harga tidak tersedia saat analisis dibuat. Menampilkan harga penutupan terakhir.
          </div>
        )}
      </div>
    </div>
  );
}

function ValidationNotices({ result, vm }) {
  if (!result.decision_adjusted && !(vm.isActionable && !vm.tradePlanValid)) return null;
  return (
    <div className="px-4 py-4 border-b border-bloomberg-border">
      {result.decision_adjusted && (
        <NoticeBox title="DECISION ADJUSTED">
          {result.decision_adjusted_reason || 'Backend validation changed the final decision.'}
        </NoticeBox>
      )}
      {vm.isActionable && !vm.tradePlanValid && (
        <div className={result.decision_adjusted ? 'mt-3' : ''}>
          <NoticeBox title="TRADE PLAN NOT VALID" tone="red">
            Backend validation did not approve a complete actionable trade plan.
          </NoticeBox>
        </div>
      )}
    </div>
  );
}

function PipelineLimitNotice({ agentsSkipped }) {
  return (
    <div className="px-4 py-4 border-b border-bloomberg-border bg-bloomberg-amber bg-opacity-5">
      <SectionHeader label="PIPELINE LIMIT" />
      <p className="font-mono text-xs text-bloomberg-amber leading-relaxed">
        LLM call budget exhausted before all stages completed. Treat this analysis as incomplete.
      </p>
      {agentsSkipped.length > 0 && (
        <div className="mt-2 font-mono text-xs text-bloomberg-muted">
          SKIPPED: {agentsSkipped.join(', ')}
        </div>
      )}
    </div>
  );
}

function CatalystInvalidationGrid({ catalysts, invalidations }) {
  if (!catalysts.length && !invalidations.length) return null;
  return (
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
                <span className="font-mono text-xs text-bloomberg-muted leading-relaxed">{c}</span>
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
                <span className="font-mono text-xs text-bloomberg-muted leading-relaxed">{inv}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RecommendationRiskSection({ text }) {
  if (!text) return null;
  return (
    <div className="px-4 py-4 border-b border-bloomberg-border">
      <SectionHeader label="KEY REASONS & RISK SUMMARY" />
      <p className="ai-summary-paragraph font-mono text-xs text-bloomberg-muted leading-relaxed text-justify">
        {text}
      </p>
    </div>
  );
}

function RawJsonDebug({ result, showRaw, onToggle }) {
  return (
    <div className="px-4 py-3">
      <button
        onClick={onToggle}
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
  );
}

function AnalysisTab({ result, vm, summaryExpanded, thesisExpanded, showRaw, onToggleSummary, onToggleThesis, onToggleRaw }) {
  return (
    <>
      <DecisionHero result={result} vm={vm} />

      {!hasDisplayValue(vm.currentPrice) && (
        <div className="px-4 py-4 border-b border-bloomberg-border">
          <NoticeBox title="PRICE DATA MISSING" tone="red">
            Last price is unavailable, so no synthetic price is shown.
          </NoticeBox>
        </div>
      )}

      <ValidationNotices result={result} vm={vm} />

      {vm.shouldShowActionPlan && (
        <ActionableMetrics
          result={vm.displayResult}
          currentPrice={vm.currentPrice}
          riskReward={vm.riskReward}
        />
      )}

      {vm.shouldShowHoldMetrics && <HoldMetrics result={vm.displayResult} currentPrice={vm.currentPrice} />}

      {vm.budgetExhausted && <PipelineLimitNotice agentsSkipped={vm.agentsSkipped} />}

      <CatalystInvalidationGrid catalysts={vm.catalysts} invalidations={vm.invalidations} />

      <ExpandableTextSection
        label="EXECUTIVE SUMMARY"
        text={vm.summary}
        expanded={summaryExpanded}
        onToggle={onToggleSummary}
        collapsedWords={100}
        expandedMaxClass="max-h-[300px]"
        expandLabel="Read More"
      />

      <RecommendationRiskSection text={vm.recommendationRiskParagraph} />

      <ExpandableTextSection
        label="INVESTMENT THESIS"
        text={vm.thesis}
        expanded={thesisExpanded}
        onToggle={onToggleThesis}
        collapsedWords={150}
        expandedMaxClass="max-h-[500px]"
        expandLabel="Read Full Thesis"
      />

      {vm.canShowRaw && <RawJsonDebug result={result} showRaw={showRaw} onToggle={onToggleRaw} />}
    </>
  );
}

export default function ResultCard({
  result,
  enableReportExport = true,
  mockReport = false,
  onRerunSubmit = null,
  rerunRunning = false,
}) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [thesisExpanded, setThesisExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [activeTab, setActiveTab] = useState('analisis');
  const [showRerunPanel, setShowRerunPanel] = useState(false);

  const { vm, disabledTabs } = useResultSections(result, buildResultViewModel);

  if (!result) return null;
  if (result.error) return <ResultError error={result.error} />;

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card animate-fade-up">
      <ResultCardHeader
        result={result}
        displayResult={vm.displayResult}
        timeHorizon={vm.timeHorizon}
        createdAtLabel={vm.createdAtLabel}
        enableReportExport={enableReportExport}
        mockReport={mockReport}
        onRerunSubmit={onRerunSubmit}
        rerunRunning={rerunRunning}
        onToggleRerun={() => setShowRerunPanel((value) => !value)}
      />

      {onRerunSubmit && (
        <RerunPanel
          result={result}
          open={showRerunPanel}
          onClose={() => setShowRerunPanel(false)}
          onSubmit={onRerunSubmit}
          running={rerunRunning}
        />
      )}

      <ResultTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        disabledTabs={disabledTabs}
        tabStatus={result.tab_status}
      />

      {activeTab === 'analisis' && (
        <AnalysisTab
          result={result}
          vm={vm}
          summaryExpanded={summaryExpanded}
          thesisExpanded={thesisExpanded}
          showRaw={showRaw}
          onToggleSummary={() => setSummaryExpanded(!summaryExpanded)}
          onToggleThesis={() => setThesisExpanded(!thesisExpanded)}
          onToggleRaw={() => setShowRaw(!showRaw)}
        />
      )}

      {activeTab === 'profile' && <ProfileTab profile={result.company_profile} result={result} />}

      {activeTab === 'fundamental' && (
        <FundamentalTab financialHighlights={result.financial_highlights} result={result} />
      )}

      {activeTab === 'chart_price' && <ChartPriceTab result={result} />}

      {activeTab === 'news' && <NewsTab result={result} />}

      <DisclaimerFooter disclaimer={result?.disclaimer} />
    </div>
  );
}

ResultCard.propTypes = {
  result: PropTypes.object,
  enableReportExport: PropTypes.bool,
  mockReport: PropTypes.bool,
  onRerunSubmit: PropTypes.func,
  rerunRunning: PropTypes.bool,
};
