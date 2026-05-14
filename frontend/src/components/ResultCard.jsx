import React, { useState } from 'react';

// Parse markdown bold (**text**) to <strong>
function parseBold(text) {
  if (!text) return null;
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{part}</strong>
      : part
  );
}

function getDisplayError(error) {
  if (!error) return 'Analysis failed.';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  if (error.error?.message) return error.error.message;
  return JSON.stringify(error, null, 2);
}

function DecisionBadge({ decision }) {
  const config = {
    Buy:  { bg: 'rgba(0,229,160,0.12)', border: 'rgba(0,229,160,0.3)', color: 'var(--accent)',  label: '▲ BUY'  },
    Sell: { bg: 'rgba(255,77,106,0.12)', border: 'rgba(255,77,106,0.3)', color: 'var(--red)',   label: '▼ SELL' },
    Hold: { bg: 'rgba(255,179,64,0.12)', border: 'rgba(255,179,64,0.3)', color: 'var(--amber)', label: '◆ HOLD' },
  };
  const c = config[decision] || config.Hold;
  return (
    <span style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.color,
      padding: '6px 16px',
      borderRadius: 100,
      fontSize: 12,
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
      letterSpacing: '0.08em',
    }}>
      {c.label}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-muted)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}


function formatValue(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'number') return `${value.toLocaleString()}${suffix}`;
  return `${value}${suffix}`;
}

function ActionMetric({ label, value, suffix }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: '12px 14px',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--text-muted)',
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--text-primary)',
      }}>
        {formatValue(value, suffix)}
      </div>
    </div>
  );
}

function ListBlock({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <Section title={title}>
      <ul style={{
        margin: 0,
        paddingLeft: 18,
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        color: 'var(--text-secondary)',
        lineHeight: 1.7,
      }}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </Section>
  );
}

function DataQualityPanel({ dataQuality }) {
  if (!dataQuality) return null;
  const statuses = [
    ['Price Data', dataQuality.price_data],
    ['Fundamentals', dataQuality.fundamentals],
    ['News', dataQuality.news],
  ];
  return (
    <Section title="Data Quality">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: dataQuality.warnings?.length ? 10 : 0 }}>
        {statuses.map(([label, status]) => (
          <span key={label} style={{
            background: status === 'ok' ? 'rgba(0,229,160,0.08)' : 'rgba(255,179,64,0.10)',
            border: status === 'ok' ? '1px solid rgba(0,229,160,0.22)' : '1px solid rgba(255,179,64,0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '5px 9px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: status === 'ok' ? 'var(--accent)' : 'var(--amber)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {label}: {status || 'missing'}
          </span>
        ))}
      </div>
      {dataQuality.warnings?.length > 0 && (
        <ul style={{
          margin: 0,
          paddingLeft: 18,
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          {dataQuality.warnings.slice(0, 5).map((warning, i) => <li key={i}>{warning}</li>)}
        </ul>
      )}
    </Section>
  );
}

export default function ResultCard({ result }) {
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;

  // Error state
  if (result.error) {
    return (
      <div style={{
        marginTop: 24,
        background: 'rgba(255,77,106,0.06)',
        border: '1px solid rgba(255,77,106,0.25)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 24px',
        animation: 'fadeUp 0.4s ease both',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 10,
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--red)',
          }}>
            Analysis Failed
          </span>
        </div>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          {getDisplayError(result.error)}
        </p>
      </div>
    );
  }

  // Read structured fields directly from the API response.
  // The backend returns executive_summary and investment_thesis as top-level fields
  // when structured output succeeds (portfolio_decision object is present).
  const executiveSummary = result.executive_summary || null;
  const investmentThesis = result.investment_thesis || null;
  const priceTarget      = result.price_target ?? null;
  const timeHorizon      = result.time_horizon ?? null;
  const confidenceScore  = result.confidence_score ?? null;
  const allocation       = result.suggested_allocation_percent ?? null;
  const entryPrice       = result.entry_price ?? null;
  const stopLoss         = result.stop_loss ?? null;
  const takeProfit       = result.take_profit ?? null;
  const riskRewardRatio  = result.risk_reward_ratio ?? null;
  const maxDrawdown      = result.max_drawdown_estimate ?? null;
  const volatilityLevel  = result.volatility_level ?? null;
  const sizingReason     = result.position_sizing_reason ?? null;
  const rebalancing      = result.rebalancing_action ?? null;
  const keyCatalysts     = result.key_catalysts || [];
  const invalidations    = result.invalidation_conditions || [];
  const dataQuality      = result.data_quality || null;
  const agentsUsed       = result.agents_used || [];

  // Fallback: if structured fields are null (free-text path), parse from full_decision.
  // This keeps the UI functional even when the backend falls back to unstructured output.
  let summaryFallback = null;
  let thesisFallback  = null;

  if (!executiveSummary || !investmentThesis) {
    const rawText = result.full_decision || '';
    const lines   = rawText.split('\n').filter(Boolean);
    const sections = [];
    let cur = null;
    for (const line of lines) {
      const m = line.match(/^\*\*(.+?)\*\*:\s*(.*)/);
      if (m) {
        if (cur) sections.push(cur);
        cur = { title: m[1], body: m[2] ? [m[2]] : [] };
      } else if (cur) {
        cur.body.push(line);
      }
    }
    if (cur) sections.push(cur);

    summaryFallback = sections.find(s => s.title === 'Executive Summary')?.body.join(' ') || null;
    thesisFallback  = sections.find(s => s.title === 'Investment Thesis')?.body.join(' ') || null;
  }

  const summary = executiveSummary || summaryFallback;
  const thesis  = investmentThesis  || thesisFallback;

  return (
    <div style={{
      marginTop: 24,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      animation: 'fadeUp 0.4s ease both',
    }}>

      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.5px',
            }}>
              {result.ticker}
            </div>
            {result.trade_date && (
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                marginTop: 2,
              }}>
                {result.trade_date}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DecisionBadge decision={result.decision} />
          <span style={{
            background: 'rgba(0,229,160,0.08)',
            border: '1px solid rgba(0,229,160,0.2)',
            color: 'var(--accent)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.06em',
          }}>
            ✓ COMPLETE
          </span>
        </div>
      </div>

      {/* Stats row: allocation + price target + time horizon + confidence */}
      {(allocation !== null || priceTarget !== null || timeHorizon || confidenceScore !== null) && (
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}>
          {allocation !== null && (
            <div style={{
              flex: 1,
              minWidth: 150,
              padding: '14px 24px',
              borderRight: (priceTarget !== null || timeHorizon || confidenceScore !== null) ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>Allocation</div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}>
                {typeof allocation === 'number' ? `${allocation}%` : allocation}
              </div>
            </div>
          )}
          {priceTarget !== null && (
            <div style={{
              flex: 1,
              minWidth: 150,
              padding: '14px 24px',
              borderRight: (timeHorizon || confidenceScore !== null) ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>Price Target</div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--accent)',
              }}>
                ${typeof priceTarget === 'number' ? priceTarget.toLocaleString() : priceTarget}
              </div>
            </div>
          )}
          {timeHorizon && (
            <div style={{
              flex: 1,
              minWidth: 150,
              padding: '14px 24px',
              borderRight: confidenceScore !== null ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>Time Horizon</div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>
                {timeHorizon}
              </div>
            </div>
          )}
          {confidenceScore !== null && (
            <div style={{ flex: 1, minWidth: 150, padding: '14px 24px' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>Confidence</div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}>
                {typeof confidenceScore === 'number' ? `${Math.round(confidenceScore * 100)}%` : confidenceScore}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>

        <DataQualityPanel dataQuality={dataQuality} />

        {(entryPrice !== null || stopLoss !== null || takeProfit !== null || riskRewardRatio !== null || maxDrawdown || volatilityLevel || rebalancing) && (
          <Section title="Action Plan">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10,
            }}>
              <ActionMetric label="Entry Price" value={entryPrice} />
              <ActionMetric label="Stop Loss" value={stopLoss} />
              <ActionMetric label="Take Profit" value={takeProfit} />
              <ActionMetric label="Risk/Reward" value={riskRewardRatio} />
              <ActionMetric label="Max Drawdown" value={maxDrawdown} />
              <ActionMetric label="Volatility" value={volatilityLevel} />
              <ActionMetric label="Rebalancing" value={rebalancing} />
            </div>
            {sizingReason && (
              <p style={{
                marginTop: 12,
                marginBottom: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
              }}>
                {parseBold(sizingReason)}
              </p>
            )}
          </Section>
        )}

        <ListBlock title="Key Catalysts" items={keyCatalysts} />
        <ListBlock title="Invalidation Conditions" items={invalidations} />

        {/* Executive Summary — reads directly from result.executive_summary */}
        {summary && (
          <Section title="Executive Summary">
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}>
              {parseBold(summary)}
            </p>
          </Section>
        )}

        {/* Investment Thesis — reads directly from result.investment_thesis */}
        {thesis && (
          <Section title="Investment Thesis">
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              overflow: 'hidden',
              maxHeight: expanded ? 'none' : '72px',
              position: 'relative',
            }}>
              {parseBold(thesis)}
              {!expanded && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 32,
                  background: 'linear-gradient(transparent, var(--bg-card))',
                }} />
              )}
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                marginTop: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--accent)',
                padding: 0,
                letterSpacing: '0.04em',
              }}
            >
              {expanded ? '↑ Show less' : '↓ Read full thesis'}
            </button>
          </Section>
        )}

        {/* Agent pipeline */}
        {agentsUsed.length > 0 && (
          <Section title="Agent Pipeline">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {agentsUsed.map((agent, i) => (
                <span key={i} style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{ color: 'var(--accent)', fontSize: 10 }}>✓</span>
                  {agent}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Raw JSON for debugging */}
        <details style={{ marginTop: 8 }}>
          <summary style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            letterSpacing: '0.06em',
            userSelect: 'none',
          }}>
            RAW JSON (debug)
          </summary>
          <pre style={{
            marginTop: 10,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 14,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            overflowX: 'auto',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
