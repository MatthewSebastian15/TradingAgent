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
import ResultTabs from './results/tabs/ResultTabs';
import { REPORT_DISCLAIMER } from '../constants/reportDisclaimer';
import { formatDateTimeLabel, formatPrice, formatTickerLabel } from '../utils/formatting';

const ACTIONABLE_DECISIONS = new Set(['Buy', 'Overweight', 'Sell', 'Underweight']);

const WARNING_LABELS = {
  CURRENT_PRICE_MISSING: 'Current price missing',
  LLM_CURRENT_PRICE_IGNORED: 'LLM current price ignored',
  ENTRY_PRICE_RECOMPUTED: 'Entry price recomputed from current price',
  RR_CLAMPED_TO_3: 'Risk/reward clamped to 1:3',
  RR_FORCED_TO_3: 'Risk/reward forced to 1:3',
  TAKE_PROFIT_RECOMPUTED: 'Take profit recomputed',
  STOP_LOSS_RECOMPUTED: 'Stop loss recomputed',
  PRICE_TARGET_RECOMPUTED: 'Price target recomputed',
  MAX_DRAWDOWN_RECOMPUTED: 'Max drawdown recomputed',
  INVALID_VOLATILITY_FIXED: 'Invalid volatility fixed',
  INVALID_REBALANCING_FIXED: 'Invalid rebalancing fixed',
  DECISION_DOWNGRADED_TO_HOLD: 'Decision downgraded to Hold',
  TRADE_PLAN_INVALID: 'Trade plan invalid',
  TRADE_LEVELS_INVALID: 'Trade levels invalid',
  PRICE_DATA_INVALID: 'Price data invalid',
  PRICE_MISSING: 'Price data missing',
  OHLCV_MISSING: 'OHLCV missing',
  OHLCV_FALLBACK_USED: 'OHLCV fallback used',
  NEWS_PARTIAL: 'News coverage partial',
  NEWS_UNAVAILABLE: 'News unavailable',
  DATA_SOURCE_WARNING: 'Optional data source warning',
  INDONESIA_TICK_SIZE_ROUNDED: 'Indonesia tick size rounded',
  HOLD_TRADE_LEVELS_HIDDEN: 'Hold trade levels hidden',
};

const WARNING_META = {
  HOLD_TRADE_LEVELS_HIDDEN: { severity: 'info', blocking: false },
  OHLCV_FALLBACK_USED: { severity: 'warning', blocking: false },
  NEWS_PARTIAL: { severity: 'warning', blocking: false },
  NEWS_UNAVAILABLE: { severity: 'warning', blocking: false },
  DATA_SOURCE_WARNING: { severity: 'warning', blocking: false },
  PRICE_MISSING: { severity: 'error', blocking: true },
  OHLCV_MISSING: { severity: 'error', blocking: true },
  CURRENT_PRICE_MISSING: { severity: 'error', blocking: true },
  TRADE_LEVELS_INVALID: { severity: 'error', blocking: true },
  TRADE_PLAN_INVALID: { severity: 'error', blocking: true },
};

function normalizeWarningDetail(warning) {
  if (!hasDisplayValue(warning)) return null;
  if (typeof warning === 'object' && warning !== null) {
    const code = String(warning.code || 'WARNING').trim();
    if (!code) return null;
    const meta = WARNING_META[code] || {};
    return {
      code,
      severity: warning.severity || meta.severity || 'warning',
      blocking: Boolean(warning.blocking ?? meta.blocking ?? false),
      label: warning.message || WARNING_LABELS[code] || code,
    };
  }
  const code = String(warning).trim();
  if (!code) return null;
  const meta = WARNING_META[code] || {};
  return {
    code,
    severity: meta.severity || 'warning',
    blocking: Boolean(meta.blocking || false),
    label: WARNING_LABELS[code] || code,
  };
}

function formatWarningDetail(warning) {
  const detail = normalizeWarningDetail(warning);
  if (!detail) return null;
  return {
    ...detail,
    text: detail.label === detail.code ? detail.code : `${detail.code} - ${detail.label}`,
  };
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

function getFinalDecision(result) {
  return result.final_decision ?? result.decision ?? result.rating ?? 'Hold';
}

function getCurrentPrice(result) {
  if (!result) return null;

  if (Object.prototype.hasOwnProperty.call(result, 'current_price')) {
    return hasDisplayValue(result.current_price) ? result.current_price : null;
  }

  return coalesceDisplayValue(result.last_close_price);
}

function DecisionBadge({ decision }) {
  const cfg = {
    Buy: {
      classes: 'bg-bloomberg-green-dim border-bloomberg-green text-bloomberg-green',
      label: '▲ BUY',
    },
    Sell: {
      classes: 'bg-bloomberg-red-dim border-bloomberg-red text-bloomberg-red',
      label: '▼ SELL',
    },
    Hold: {
      classes: 'bg-bloomberg-amber-dim border-bloomberg-amber text-bloomberg-amber',
      label: '◆ HOLD',
    },
    Overweight: {
      classes: 'bg-bloomberg-green-dim border-bloomberg-green text-bloomberg-green',
      label: '▲ OVERWEIGHT',
    },
    Underweight: {
      classes: 'bg-bloomberg-red-dim border-bloomberg-red text-bloomberg-red',
      label: '▼ UNDERWEIGHT',
    },
  };
  const c = cfg[decision] || cfg.Hold;
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
      value: hasDisplayValue(currentPrice) ? formatPrice(currentPrice, result.ticker) : 'N/A',
      highlight: true,
    },
    {
      label: 'ENTRY',
      value: hasDisplayValue(result.entry_price)
        ? formatPrice(result.entry_price, result.ticker)
        : 'N/A',
    },
    {
      label: 'STOP LOSS',
      value: hasDisplayValue(result.stop_loss)
        ? formatPrice(result.stop_loss, result.ticker)
        : 'N/A',
    },
    {
      label: 'TAKE PROFIT',
      value: hasDisplayValue(result.take_profit)
        ? formatPrice(result.take_profit, result.ticker)
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
      value: hasDisplayValue(result.volatility_score) ? result.volatility_score : 'N/A',
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
            value={formatPrice(currentPrice, result.ticker)}
            highlight
          />
        )}
        {result.volatility_level && (
          <MetricBox label="VOLATILITY" value={result.volatility_level} />
        )}
        {hasDisplayValue(result.volatility_score) && (
          <MetricBox label="VOLATILITY SCORE" value={result.volatility_score} />
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

  const finalDecision = getFinalDecision(result);
  const isActionable = ACTIONABLE_DECISIONS.has(finalDecision);
  const tradePlanValid = Boolean(result.trade_plan_valid);
  const shouldShowActionPlan = isActionable && tradePlanValid;
  const shouldShowHoldMetrics = !shouldShowActionPlan;

  const analysisOverview = result.analysis_overview || {};
  const summary = analysisOverview.executive_summary || result.executive_summary;
  const thesis = analysisOverview.investment_thesis || result.investment_thesis;
  const currentPrice = getCurrentPrice(result);
  const currentPriceAsOf = coalesceDisplayValue(
    result.current_price_as_of,
    result.last_close_price_as_of
  );
  const currentPriceSource = coalesceDisplayValue(result.current_price_source);
  const timeHorizon = formatAnalysisHorizon(result.time_horizon_months, result.time_horizon);
  const confidence = result.confidence_score ?? null;
  const allocation = result.suggested_allocation_percent ?? null;
  const riskReward = formatRiskReward(result);
  const catalysts = result.key_catalysts || [];
  const keyReasons = analysisOverview.key_reasons || result.key_reasons || catalysts;
  const invalidations = result.invalidation_conditions || [];
  const riskSummary = analysisOverview.risk_summary || null;
  const dataQuality = result.data_quality || null;
  const validationWarnings = Array.isArray(result.validation_warnings)
    ? result.validation_warnings
    : [];
  const validationWarningDetails = Array.isArray(result.validation_warning_details)
    ? result.validation_warning_details
    : [];
  const requestWarnings = Array.isArray(result.warnings) ? result.warnings : [];
  const agents = result.agents_used || [];
  const budgetExhausted = Boolean(result.budget_exhausted);
  const agentsSkipped = result.agents_skipped || [];
  const canShowRaw = result.response_detail === 'debug';
  const createdAtLabel = formatDateTimeLabel(result.analysis_created_at || result.saved_at);

  const decisionColor =
    {
      Buy: 'text-bloomberg-green',
      Overweight: 'text-bloomberg-green',
      Sell: 'text-bloomberg-red',
      Underweight: 'text-bloomberg-red',
      Hold: 'text-bloomberg-amber',
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
              result={result}
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
                {formatTickerLabel(result.ticker)}
              </div>
              <div className="mt-3">
                <DecisionBadge decision={finalDecision} />
              </div>
              {finalDecision && (
                <div className="mt-2 font-mono text-xs text-bloomberg-muted tracking-wider">
                  RECOMMENDATION: {finalDecision.toUpperCase()}
                </div>
              )}
              {currentPriceSource && (
                <div className="mt-1 font-mono text-[11px] text-bloomberg-muted tracking-wider break-all">
                  SOURCE: <span className="text-bloomberg-white">{currentPriceSource}</span>
                </div>
              )}
              {result.llm_decision && result.llm_decision !== finalDecision && (
                <div className="mt-1 font-mono text-xs text-bloomberg-muted tracking-wider">
                  LLM: {String(result.llm_decision).toUpperCase()} → FINAL:{' '}
                  {String(finalDecision).toUpperCase()}
                </div>
              )}
            </div>

            {/* Key metrics — PRICE TARGET removed */}
            <div className="min-w-0 flex-shrink-0 w-full lg:w-[43rem] max-w-full">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {hasDisplayValue(currentPrice) && (
                  <MetricBox
                    label="LAST PRICE"
                    value={formatPrice(currentPrice, result.ticker)}
                    highlight
                  />
                )}
                {currentPriceAsOf && <MetricBox label="PRICE AS OF" value={currentPriceAsOf} />}
                {timeHorizon && <MetricBox label="HORIZON" value={timeHorizon} />}
                {confidence !== null && (
                  <MetricBox
                    label="CONFIDENCE"
                    value={
                      typeof confidence === 'number'
                        ? `${Math.round(confidence * 100)}%`
                        : confidence
                    }
                  />
                )}
                {allocation !== null && (
                  <MetricBox label="ALLOCATION" value={formatPercent(allocation)} />
                )}
              </div>
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
              result={result}
              currentPrice={currentPrice}
              riskReward={riskReward}
            />
          )}

          {shouldShowHoldMetrics && <HoldMetrics result={result} currentPrice={currentPrice} />}

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

          {/* Executive Summary */}
          {summary && (
            <div className="px-4 py-4 border-b border-bloomberg-border">
              <SectionHeader label="EXECUTIVE SUMMARY" />
              <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
                {parseBold(summary)}
              </p>
            </div>
          )}

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

          {riskSummary && (
            <div className="px-4 py-4 border-b border-bloomberg-border">
              <SectionHeader label="MINI RISK SUMMARY" />
              <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
                {riskSummary.overall_risk || 'N/A'}: {riskSummary.short_reason || 'N/A'}
              </p>
            </div>
          )}

          {/* Investment Thesis */}
          {thesis && (
            <div className="px-4 py-4 border-b border-bloomberg-border">
              <SectionHeader label="INVESTMENT THESIS" />
              <div
                className={`overflow-hidden transition-all duration-300 ${thesisExpanded ? '' : 'max-h-24'} relative`}
              >
                <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
                  {parseBold(thesis)}
                </p>
                {!thesisExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-bloomberg-card to-transparent" />
                )}
              </div>
              <button
                onClick={() => setThesisExpanded(!thesisExpanded)}
                className="mt-2 font-mono text-xs text-bloomberg-orange hover:text-orange-300 transition-colors tracking-wider"
              >
                {thesisExpanded ? '↑ COLLAPSE' : '↓ EXPAND FULL THESIS'}
              </button>
            </div>
          )}

          {/* Agents used */}
          {agents.length > 0 && (
            <div className="px-4 py-4 border-b border-bloomberg-border">
              <SectionHeader label="AGENT PIPELINE" />
              <div className="flex flex-wrap gap-1.5">
                {agents.map((a, i) => (
                  <span
                    key={i}
                    className="font-mono text-xs px-2 py-1 border border-bloomberg-border text-bloomberg-muted"
                  >
                    <span className="text-bloomberg-green mr-1.5">✓</span>
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

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
        <FundamentalTab financialHighlights={result.financial_highlights} />
      )}

      {activeTab === 'chart_price' && <ChartPriceTab result={result} />}

      {activeTab === 'news' && <NewsTab result={result} />}

      {activeTab === 'risk_data_quality' && (
        <div className="px-4 py-4 border-b border-bloomberg-border">
          <DataQuality
            dq={dataQuality}
            validationWarnings={validationWarnings}
            validationWarningDetails={validationWarningDetails}
            requestWarnings={requestWarnings}
            tradePlanValid={tradePlanValid}
            isActionable={isActionable}
          />
        </div>
      )}
    </div>
  );
}

ResultCard.propTypes = {
  result: PropTypes.object,
  enableReportExport: PropTypes.bool,
  mockReport: PropTypes.bool,
};
