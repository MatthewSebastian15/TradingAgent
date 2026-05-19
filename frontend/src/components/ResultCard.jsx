import React, { useState } from 'react';

function parseBold(text) {
  if (!text) return null;
  return text.split(/\*\*(.*?)\*\*/g).map((p, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-bloomberg-white font-semibold">{p}</strong>
      : p
  );
}

/**
 * Return a currency-prefixed price string based on the ticker's exchange suffix.
 *   .JK  -> IDR  (Rp)
 *   .HK  -> HKD  (HK$)
 *   .T   -> JPY  (¥)
 *   .DE  -> EUR  (€)
 *   .L   -> GBP  (£)
 *   else -> USD  ($)
 */
function formatPrice(price, ticker = '') {
  if (price === null || price === undefined || price === '') return null;
  const value = typeof price === 'number' ? price.toLocaleString() : String(price);
  const t = ticker.toUpperCase();
  if (t.endsWith('.JK')) return `Rp ${value}`;
  if (t.endsWith('.HK')) return `HK$ ${value}`;
  if (t.endsWith('.T'))  return `¥${value}`;
  if (t.endsWith('.DE')) return `€${value}`;
  if (t.endsWith('.L'))  return `£${value}`;
  return `$${value}`;
}

function getError(e) {
  if (!e) return 'Analysis failed.';
  if (typeof e === 'string') return e;
  return e.message || e.error?.message || JSON.stringify(e, null, 2);
}

function DecisionBadge({ decision }) {
  const cfg = {
    Buy:  { classes: 'bg-bloomberg-green-dim border-bloomberg-green text-bloomberg-green',  label: '▲ BUY'  },
    Sell: { classes: 'bg-bloomberg-red-dim border-bloomberg-red text-bloomberg-red',         label: '▼ SELL' },
    Hold: { classes: 'bg-bloomberg-amber-dim border-bloomberg-amber text-bloomberg-amber',   label: '◆ HOLD' },
    Overweight:  { classes: 'bg-bloomberg-green-dim border-bloomberg-green text-bloomberg-green', label: '▲ OVERWEIGHT' },
    Underweight: { classes: 'bg-bloomberg-red-dim border-bloomberg-red text-bloomberg-red',       label: '▼ UNDERWEIGHT' },
  };
  const c = cfg[decision] || cfg.Hold;
  return (
    <span className={`inline-block border px-4 py-1.5 font-mono text-sm font-bold tracking-widest ${c.classes}`}>
      {c.label}
    </span>
  );
}

function MetricBox({ label, value, highlight }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="border border-bloomberg-border bg-bloomberg-surface p-3">
      <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-1.5">{label}</div>
      <div className={`font-mono text-base font-semibold ${highlight ? 'text-bloomberg-orange' : 'text-bloomberg-white'}`}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">{label}</span>
      <div className="flex-1 h-px bg-bloomberg-border" />
    </div>
  );
}

function DataQuality({ dq }) {
  if (!dq) return null;
  const items = [
    { label: 'PRICE',        status: dq.price_data   },
    { label: 'FUNDAMENTALS', status: dq.fundamentals },
    { label: 'NEWS',         status: dq.news         },
  ];
  return (
    <div className="mb-5">
      <SectionHeader label="DATA QUALITY" />
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
      {dq.warnings?.length > 0 && (
        <ul className="mt-2 list-disc list-inside font-mono text-xs text-bloomberg-muted leading-relaxed">
          {dq.warnings.slice(0,5).map((w,i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function ResultCard({ result }) {
  const [thesisExpanded, setThesisExpanded] = useState(false);
  const [showRaw, setShowRaw]               = useState(false);

  if (!result) return null;

  if (result.error) {
    return (
      <div className="border border-bloomberg-red bg-bloomberg-red-dim animate-fade-up">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-bloomberg-red border-opacity-30">
          <span className="font-mono text-xs font-semibold text-bloomberg-red tracking-wider">PIPELINE ERROR</span>
        </div>
        <div className="px-4 py-4">
          <pre className="font-mono text-xs text-bloomberg-red leading-relaxed whitespace-pre-wrap">
            {getError(result.error)}
          </pre>
        </div>
      </div>
    );
  }

  const summary       = result.executive_summary;
  const thesis        = result.investment_thesis;
  const priceTarget   = result.price_target ?? null;
  const timeHorizon   = result.time_horizon ?? null;
  const confidence    = result.confidence_score ?? null;
  const allocation    = result.suggested_allocation_percent ?? null;
  const entryPrice    = result.entry_price ?? null;
  const stopLoss      = result.stop_loss ?? null;
  const takeProfit    = result.take_profit ?? null;
  const riskReward    = result.risk_reward_ratio ?? null;
  const maxDrawdown   = result.max_drawdown_estimate ?? null;
  const volatility    = result.volatility_level ?? null;
  const rebalancing   = result.rebalancing_action ?? null;
  const sizingReason  = result.position_sizing_reason ?? null;
  const catalysts     = result.key_catalysts || [];
  const invalidations = result.invalidation_conditions || [];
  const dataQuality   = result.data_quality || null;
  const agents        = result.agents_used || [];

  const decisionColor = {
    Buy: 'text-bloomberg-green', Overweight: 'text-bloomberg-green',
    Sell: 'text-bloomberg-red',  Underweight: 'text-bloomberg-red',
    Hold: 'text-bloomberg-amber',
  }[result.decision] || 'text-bloomberg-white';

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card animate-fade-up">

      {/* Header bar */}
      <div className="bg-black px-4 py-2 border-b border-bloomberg-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-bloomberg-muted tracking-wider">ANALYSIS COMPLETE</span>
          <span className="font-mono text-xs text-bloomberg-green">●</span>
        </div>
        <span className="font-mono text-xs text-bloomberg-muted">{result.trade_date}</span>
      </div>

      {/* Decision hero */}
      <div className="px-4 py-5 border-b border-bloomberg-border flex items-start justify-between gap-4">
        <div>
          <div className={`font-display text-5xl font-bold tracking-wider ${decisionColor}`}>
            {result.ticker}
          </div>
          <div className="mt-3">
            <DecisionBadge decision={result.decision || result.rating} />
          </div>
          {(result.decision || result.rating) && (
            <div className="mt-2 font-mono text-xs text-bloomberg-muted tracking-wider">
              RECOMMENDATION: {(result.decision || result.rating || '').toUpperCase()}
            </div>
          )}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2 min-w-0 flex-shrink-0">
          {priceTarget !== null && (
            <MetricBox label="PRICE TARGET" value={formatPrice(priceTarget, result.ticker)} highlight />
          )}
          {timeHorizon && (
            <MetricBox label="HORIZON" value={timeHorizon} />
          )}
          {confidence !== null && (
            <MetricBox label="CONFIDENCE" value={typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : confidence} />
          )}
          {allocation !== null && (
            <MetricBox label="ALLOCATION" value={typeof allocation === 'number' ? `${allocation}%` : allocation} />
          )}
        </div>
      </div>

      {/* Action plan */}
      {(entryPrice !== null || stopLoss !== null || takeProfit !== null || riskReward !== null || maxDrawdown || volatility || rebalancing) && (
        <div className="px-4 py-4 border-b border-bloomberg-border">
          <SectionHeader label="ACTION PLAN" />
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {entryPrice  !== null && <MetricBox label="ENTRY"       value={formatPrice(entryPrice,  result.ticker)} />}
            {stopLoss    !== null && <MetricBox label="STOP LOSS"   value={formatPrice(stopLoss,    result.ticker)} />}
            {takeProfit  !== null && <MetricBox label="TAKE PROFIT" value={formatPrice(takeProfit,  result.ticker)} />}
            {riskReward  !== null && <MetricBox label="R/R RATIO"   value={riskReward} />}
            {maxDrawdown && <MetricBox label="MAX DRAWDOWN" value={maxDrawdown} />}
            {volatility  && <MetricBox label="VOLATILITY"   value={volatility} />}
            {rebalancing && <MetricBox label="REBALANCING"  value={rebalancing} />}
          </div>
          {sizingReason && (
            <p className="mt-3 font-mono text-xs text-bloomberg-muted leading-relaxed">
              {parseBold(sizingReason)}
            </p>
          )}
        </div>
      )}

      {/* Data quality */}
      {dataQuality && (
        <div className="px-4 py-4 border-b border-bloomberg-border">
          <DataQuality dq={dataQuality} />
        </div>
      )}

      {/* Catalysts + Invalidations */}
      {(catalysts.length > 0 || invalidations.length > 0) && (
        <div className="px-4 py-4 border-b border-bloomberg-border grid grid-cols-2 gap-4">
          {catalysts.length > 0 && (
            <div>
              <SectionHeader label="KEY CATALYSTS" />
              <ul className="flex flex-col gap-1.5">
                {catalysts.map((c,i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-mono text-xs text-bloomberg-green flex-shrink-0 mt-0.5">+</span>
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
                {invalidations.map((inv,i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-mono text-xs text-bloomberg-red flex-shrink-0 mt-0.5">✕</span>
                    <span className="font-mono text-xs text-bloomberg-muted leading-relaxed">{inv}</span>
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
          <div className={`overflow-hidden transition-all duration-300 ${thesisExpanded ? '' : 'max-h-24'} relative`}>
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
            {agents.map((a,i) => (
              <span key={i} className="font-mono text-xs px-2 py-1 border border-bloomberg-border text-bloomberg-muted">
                <span className="text-bloomberg-green mr-1.5">✓</span>{a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON debug */}
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
    </div>
  );
}
