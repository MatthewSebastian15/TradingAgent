import React, { useState } from 'react';
import { formatDateTimeLabel, formatPrice, formatTickerLabel } from '../utils/formatting';

const ACTIONABLE_DECISIONS = new Set(['Buy', 'Overweight', 'Sell', 'Underweight']);

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

function MetricBox({ label, value, highlight }) {
  if (!hasDisplayValue(value)) return null;
  return (
    <div className="border border-bloomberg-border bg-bloomberg-surface p-3">
      <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-1.5">
        {label}
      </div>
      <div
        className={`font-mono text-base font-semibold ${highlight ? 'text-bloomberg-orange' : 'text-bloomberg-white'}`}
      >
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
        {label}
      </span>
      <div className="flex-1 h-px bg-bloomberg-border" />
    </div>
  );
}

function NoticeBox({ title, children, tone = 'amber' }) {
  const classes =
    tone === 'red'
      ? 'border-bloomberg-red bg-bloomberg-red-dim text-bloomberg-red'
      : 'border-bloomberg-amber bg-bloomberg-amber-dim text-bloomberg-amber';
  return (
    <div className={`border px-3 py-2 ${classes}`}>
      <div className="font-mono text-xs font-semibold tracking-wider uppercase">{title}</div>
      {children && <div className="mt-1 font-mono text-xs leading-relaxed">{children}</div>}
    </div>
  );
}

function DataQuality({ dq, validationWarnings = [] }) {
  const warnings = Array.isArray(validationWarnings) ? validationWarnings : [];
  if (!dq && warnings.length === 0) return null;
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
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map(({ label, status }) => (
            <span
              key={label}
              className={`font-mono text-xs px-2.5 py-1 border tracking-wider ${
                status === 'ok'
                  ? 'border-bloomberg-green bg-bloomberg-green-dim text-bloomberg-green'
                  : 'border-bloomberg-amber bg-bloomberg-amber-dim text-bloomberg-amber'
              }`}
            >
              {label}: {status || 'N/A'}
            </span>
          ))}
        </div>
      )}
      {dq?.warnings?.length > 0 && (
        <ul className="mt-2 list-disc list-inside font-mono text-xs text-bloomberg-muted leading-relaxed">
          {dq.warnings.slice(0, 5).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <span
              key={warning}
              className="font-mono text-xs px-2.5 py-1 border border-bloomberg-amber bg-bloomberg-amber-dim text-bloomberg-amber tracking-wider"
            >
              {warning}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionableMetrics({ result, currentPrice, riskReward }) {
  return (
    <div className="px-4 py-4 border-b border-bloomberg-border">
      <SectionHeader label="ACTION PLAN" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {hasDisplayValue(currentPrice) && (
          <MetricBox
            label="CURRENT PRICE"
            value={formatPrice(currentPrice, result.ticker)}
            highlight
          />
        )}
        {hasDisplayValue(result.price_target) && (
          <MetricBox label="PRICE TARGET" value={formatPrice(result.price_target, result.ticker)} />
        )}
        {hasDisplayValue(result.entry_price) && (
          <MetricBox label="ENTRY" value={formatPrice(result.entry_price, result.ticker)} />
        )}
        {hasDisplayValue(result.stop_loss) && (
          <MetricBox label="STOP LOSS" value={formatPrice(result.stop_loss, result.ticker)} />
        )}
        {hasDisplayValue(result.take_profit) && (
          <MetricBox label="TAKE PROFIT" value={formatPrice(result.take_profit, result.ticker)} />
        )}
        {hasDisplayValue(result.risk_per_share) && (
          <MetricBox
            label="RISK PER SHARE"
            value={formatPrice(result.risk_per_share, result.ticker)}
          />
        )}
        {hasDisplayValue(result.reward_per_share) && (
          <MetricBox
            label="REWARD PER SHARE"
            value={formatPrice(result.reward_per_share, result.ticker)}
          />
        )}
        {result.max_drawdown_estimate && (
          <MetricBox label="MAX DRAWDOWN" value={result.max_drawdown_estimate} />
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
        {riskReward && <MetricBox label="R/R RATIO" value={riskReward} highlight />}
      </div>
      {result.position_sizing_reason && (
        <p className="mt-3 font-mono text-xs text-bloomberg-muted leading-relaxed">
          {parseBold(result.position_sizing_reason)}
        </p>
      )}
    </div>
  );
}

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

export default function ResultCard({ result }) {
  const [thesisExpanded, setThesisExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

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

  const summary = result.executive_summary;
  const thesis = result.investment_thesis;
  const currentPrice = coalesceDisplayValue(result.current_price, result.last_close_price);
  const currentPriceAsOf = coalesceDisplayValue(
    result.current_price_as_of,
    result.last_close_price_as_of
  );
  const currentPriceSource = coalesceDisplayValue(result.current_price_source);
  const priceTarget = shouldShowActionPlan ? coalesceDisplayValue(result.price_target) : null;
  const timeHorizon = formatAnalysisHorizon(result.time_horizon_months, result.time_horizon);
  const confidence = result.confidence_score ?? null;
  const allocation = result.suggested_allocation_percent ?? null;
  const riskReward = formatRiskReward(result);
  const catalysts = result.key_catalysts || [];
  const invalidations = result.invalidation_conditions || [];
  const dataQuality = result.data_quality || null;
  const validationWarnings = Array.isArray(result.validation_warnings)
    ? result.validation_warnings
    : [];
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
        </div>
      </div>

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
          {result.llm_decision && result.llm_decision !== finalDecision && (
            <div className="mt-1 font-mono text-xs text-bloomberg-muted tracking-wider">
              LLM: {String(result.llm_decision).toUpperCase()} → FINAL:{' '}
              {String(finalDecision).toUpperCase()}
            </div>
          )}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2 min-w-0 flex-shrink-0">
          {hasDisplayValue(currentPrice) && (
            <MetricBox
              label="LAST PRICE"
              value={formatPrice(currentPrice, result.ticker)}
              highlight
            />
          )}
          {currentPriceAsOf && <MetricBox label="PRICE AS OF" value={currentPriceAsOf} />}
          {currentPriceSource && <MetricBox label="SOURCE" value={currentPriceSource} />}
          {priceTarget !== null && (
            <MetricBox label="PRICE TARGET" value={formatPrice(priceTarget, result.ticker)} />
          )}
          {timeHorizon && <MetricBox label="HORIZON" value={timeHorizon} />}
          {confidence !== null && (
            <MetricBox
              label="CONFIDENCE"
              value={
                typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : confidence
              }
            />
          )}
          {allocation !== null && (
            <MetricBox label="ALLOCATION" value={formatPercent(allocation)} />
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
              {result.decision_adjusted_reason || 'Backend validation changed the final decision.'}
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
        <ActionableMetrics result={result} currentPrice={currentPrice} riskReward={riskReward} />
      )}

      {shouldShowHoldMetrics && <HoldMetrics result={result} currentPrice={currentPrice} />}

      {/* Data quality */}
      {(dataQuality || validationWarnings.length > 0) && (
        <div className="px-4 py-4 border-b border-bloomberg-border">
          <DataQuality dq={dataQuality} validationWarnings={validationWarnings} />
        </div>
      )}

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
    </div>
  );
}
