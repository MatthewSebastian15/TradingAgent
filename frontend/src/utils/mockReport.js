import { formatPrice } from './formatting';

const ACTIONABLE_DECISIONS = new Set(['Buy', 'Overweight', 'Sell', 'Underweight']);
const LEGACY_REPORT_FIELD_PATTERN = /\b(price target|risk per share|reward per share)\b/i;

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !(typeof value === 'number' && !Number.isFinite(value))
  );
}

function display(value) {
  if (!hasValue(value)) return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : String(value);
  return String(value);
}

function escapeHtml(value) {
  return display(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textOrNull(value) {
  if (!hasValue(value)) return null;
  const text = String(value)
    .split(/\r?\n/)
    .filter((line) => !LEGACY_REPORT_FIELD_PATTERN.test(line))
    .join('\n')
    .trim();
  return text || null;
}

function arrayOfText(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => display(item)).filter((item) => item !== 'N/A');
}

function finalDecision(result) {
  return display(result?.final_decision || result?.decision || result?.rating || 'Hold');
}

function riskRewardDisplay(result) {
  if (result?.risk_reward_display) return String(result.risk_reward_display);
  if (hasValue(result?.risk_reward_ratio)) return '1:3';
  return 'N/A';
}

function price(value, result) {
  return hasValue(value) ? formatPrice(value, result?.ticker || '') || 'N/A' : 'N/A';
}

function row(label, value) {
  return { label, value: display(value) };
}

export function buildMockActionPlanRows(result) {
  return [
    row('Current Price', price(result?.current_price, result)),
    row('Entry', price(result?.entry_price, result)),
    row('Stop Loss', price(result?.stop_loss, result)),
    row('Take Profit', price(result?.take_profit, result)),
    row('Max Drawdown', result?.max_drawdown_estimate),
    row('Volatility', result?.volatility_level),
    row('Volatility Score', result?.volatility_score),
    row('Rebalancing', result?.rebalancing_action),
    row('Position Action', result?.position_action),
    row('New Entry Action', result?.new_entry_action),
    row('Position Size Hint', result?.position_size_hint),
    row('R/R Ratio', riskRewardDisplay(result)),
  ];
}

function buildRiskRows(result, includeTradePlanRisk) {
  const rows = [
    row('Volatility Level', result?.volatility_level),
    row('Volatility Score', result?.volatility_score),
    row('Rebalancing Action', result?.rebalancing_action),
    row('Position Action', result?.position_action),
    row('New Entry Action', result?.new_entry_action),
    row('Position Size Hint', result?.position_size_hint),
  ];

  if (!includeTradePlanRisk) rows.splice(2, 0, row('Max Drawdown', result?.max_drawdown_estimate));
  return rows;
}

function buildDataQualityRows(dataQuality = {}) {
  return [
    row('Price Data', dataQuality.price_data),
    row('Trade Levels', dataQuality.trade_levels),
    row('LLM Output', dataQuality.llm_output),
    row('Volatility Data', dataQuality.volatility_data),
    row('Fundamentals', dataQuality.fundamentals),
    row('News', dataQuality.news),
  ];
}

function buildAnalystSections(result) {
  return [
    ['Market Analyst', result?.market_report],
    ['News Analyst', result?.news_report],
    ['Fundamentals Analyst', result?.fundamentals_report],
    ['Risk Manager', result?.risk_report],
    ['Portfolio Manager', result?.portfolio_report],
    ['Investment Thesis', result?.investment_thesis],
    ['Debate Summary', result?.debate_summary],
    ['Final Decision Notes', result?.full_decision],
  ]
    .map(([title, body]) => ({ title, body: textOrNull(body) }))
    .filter((section) => section.body);
}

export function buildMockReportContext(result = {}) {
  const decision = finalDecision(result);
  const tradePlanValid = Boolean(result.trade_plan_valid);
  const showTradePlan = ACTIONABLE_DECISIONS.has(decision) && tradePlanValid;
  const dataQuality = result.data_quality || {};
  const validationWarnings = arrayOfText(result.validation_warnings);
  const dataQualityWarnings = arrayOfText(dataQuality.warnings);

  return {
    title: 'TradingAgent Mock Analysis Report',
    request_id: display(result.request_id),
    ticker: display(result.ticker),
    market: display(result.market),
    trade_date: display(result.trade_date),
    analysis_created_at: display(result.analysis_created_at || result.saved_at),
    generated_at: new Date().toISOString(),
    current_price: result.current_price,
    current_price_display: price(result.current_price, result),
    current_price_as_of: display(result.current_price_as_of || result.last_close_price_as_of),
    current_price_source: display(result.current_price_source),
    llm_decision: display(result.llm_decision),
    final_decision: decision,
    decision_adjusted: Boolean(result.decision_adjusted),
    decision_adjusted_reason: display(result.decision_adjusted_reason),
    trade_plan_valid: tradePlanValid,
    has_existing_position: Boolean(result.has_existing_position),
    show_trade_plan: showTradePlan,
    executive_summary: textOrNull(result.executive_summary) || 'N/A',
    decision_rows: [
      row('Final Decision', decision),
      row('LLM Decision', result.llm_decision),
      row('Decision Adjusted', Boolean(result.decision_adjusted)),
      row('Decision Adjusted Reason', result.decision_adjusted_reason),
      row('Trade Plan Valid', tradePlanValid),
      row('Has Existing Position', Boolean(result.has_existing_position)),
      row('Time Horizon', result.time_horizon),
      row('Confidence', hasValue(result.confidence_score) ? `${Math.round(Number(result.confidence_score) * 100)}%` : null),
      row('Suggested Allocation', hasValue(result.suggested_allocation_percent) ? `${result.suggested_allocation_percent}%` : null),
    ],
    action_plan_rows: showTradePlan ? buildMockActionPlanRows(result) : [],
    risk_rows: buildRiskRows(result, showTradePlan),
    validation_rows: [
      row('Current Price Source', result.current_price_source),
      row('Current Price As Of', result.current_price_as_of || result.last_close_price_as_of),
      ...buildDataQualityRows(dataQuality),
      row('Analysis Depth', result.analysis_depth),
      row('LLM Calls Used', result.llm_calls_used),
      row('LLM Call Budget', result.llm_call_budget),
    ],
    validation_warnings: validationWarnings,
    data_quality_warnings: dataQualityWarnings,
    key_catalysts: arrayOfText(result.key_catalysts),
    invalidation_conditions: arrayOfText(result.invalidation_conditions),
    analyst_sections: buildAnalystSections(result),
  };
}

function renderRows(rows) {
  return rows
    .map(
      (item) => `<tr>
        <th>${escapeHtml(item.label)}</th>
        <td>${escapeHtml(item.value)}</td>
      </tr>`
    )
    .join('');
}

function renderList(items) {
  if (!items.length) return '<p class="muted">N/A</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderMetricGrid(rows) {
  return `<div class="metric-grid">
    ${rows
      .map(
        (item) => `<div class="metric-card">
          <div class="metric-label">${escapeHtml(item.label)}</div>
          <div class="metric-value">${escapeHtml(item.value)}</div>
        </div>`
      )
      .join('')}
  </div>`;
}

function renderAnalystSections(sections) {
  if (!sections.length) return '';
  return `<section class="section page-break-soft">
    <h2>Analyst Notes</h2>
    ${sections
      .map(
        (section) => `<article class="analyst-note">
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.body)}</p>
        </article>`
      )
      .join('')}
  </section>`;
}

export function renderMockReportHtml(report) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(report.title)} - ${escapeHtml(report.ticker)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f4f4f5;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 14px;
        line-height: 1.55;
      }
      .report {
        width: 960px;
        margin: 32px auto;
        padding: 40px;
        background: #ffffff;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
      }
      .report-header {
        border-bottom: 2px solid #111827;
        padding-bottom: 20px;
        margin-bottom: 24px;
      }
      h1 { margin: 0 0 14px; font-size: 28px; letter-spacing: -0.02em; }
      h2 { margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #d1d5db; font-size: 18px; }
      h3 { margin: 16px 0 6px; font-size: 15px; }
      p { margin: 0 0 12px; }
      .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 18px; }
      .meta-grid div { border: 1px solid #e5e7eb; padding: 10px; min-height: 58px; }
      .meta-grid span, .metric-label {
        display: block;
        color: #6b7280;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 4px;
      }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; }
      th, td { border: 1px solid #d1d5db; padding: 9px 10px; vertical-align: top; }
      th { width: 32%; background: #f3f4f6; text-align: left; }
      .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 10px 0 18px; }
      .metric-card { border: 1px solid #d1d5db; padding: 12px; min-height: 78px; break-inside: avoid; }
      .metric-value { font-weight: 700; color: #111827; word-break: break-word; }
      .warning { border: 1px solid #f59e0b; background: #fffbeb; padding: 10px 12px; margin: 12px 0; }
      .muted { color: #6b7280; }
      ul { margin: 8px 0 18px 18px; padding: 0; }
      li { margin-bottom: 6px; }
      .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .section, .analyst-note { break-inside: avoid; }
      .analyst-note p { white-space: pre-wrap; }
      .disclaimer { color: #4b5563; font-size: 12px; }
      footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #d1d5db; color: #6b7280; font-size: 12px; }
      @media print {
        body { background: #ffffff; }
        .report { width: auto; margin: 0; padding: 0; box-shadow: none; }
        .metric-grid { grid-template-columns: repeat(4, 1fr); }
      }
    </style>
  </head>
  <body>
    <main class="report">
      <header class="report-header">
        <h1>${escapeHtml(report.title)}</h1>
        <div class="meta-grid">
          <div><span>Ticker</span>${escapeHtml(report.ticker)}</div>
          <div><span>Market</span>${escapeHtml(report.market)}</div>
          <div><span>Trade date</span>${escapeHtml(report.trade_date)}</div>
          <div><span>Generated at</span>${escapeHtml(report.generated_at)}</div>
          <div><span>Analysis created</span>${escapeHtml(report.analysis_created_at)}</div>
          <div><span>Request ID</span>${escapeHtml(report.request_id)}</div>
        </div>
      </header>

      ${
        !hasValue(report.current_price)
          ? '<div class="warning"><strong>Price data warning:</strong> current_price is unavailable. The report is rendered without synthetic price or trade levels.</div>'
          : ''
      }
      ${
        report.decision_adjusted
          ? `<div class="warning"><strong>Decision adjusted:</strong> ${escapeHtml(report.llm_decision)} to ${escapeHtml(report.final_decision)}. Reason: ${escapeHtml(report.decision_adjusted_reason)}</div>`
          : ''
      }

      <section class="section">
        <h2>Executive Summary</h2>
        <p>${escapeHtml(report.executive_summary)}</p>
      </section>

      <section class="section">
        <h2>Decision Summary</h2>
        <table><tbody>${renderRows(report.decision_rows)}</tbody></table>
      </section>

      <section class="section">
        <h2>Action Plan</h2>
        ${
          report.show_trade_plan
            ? renderMetricGrid(report.action_plan_rows)
            : `<p class="muted">No actionable trade plan is available. Final decision: ${escapeHtml(report.final_decision)}.</p>`
        }
      </section>

      <section class="section">
        <h2>Risk And Volatility</h2>
        <table><tbody>${renderRows(report.risk_rows)}</tbody></table>
      </section>

      <section class="section">
        <h2>Data Quality And Validation</h2>
        <table><tbody>${renderRows(report.validation_rows)}</tbody></table>
        ${report.validation_warnings.length ? `<h3>Validation Warnings</h3>${renderList(report.validation_warnings)}` : ''}
        ${report.data_quality_warnings.length ? `<h3>Data Quality Notes</h3>${renderList(report.data_quality_warnings)}` : ''}
      </section>

      <section class="section two-column">
        <div>
          <h2>Key Catalysts</h2>
          ${renderList(report.key_catalysts)}
        </div>
        <div>
          <h2>Invalidation Conditions</h2>
          ${renderList(report.invalidation_conditions)}
        </div>
      </section>

      ${renderAnalystSections(report.analyst_sections)}

      <section class="section disclaimer">
        <h2>Disclaimer</h2>
        <p>This mock report is generated for UI, HTML preview, and browser print-PDF debugging only. It is not financial advice and does not use live market data, external providers, or LLM calls.</p>
      </section>

      <footer>TradingAgent mock report · ${escapeHtml(report.ticker)} · ${escapeHtml(report.request_id)}</footer>
    </main>
  </body>
</html>`;
}

export function buildMockReportHtml(result) {
  return renderMockReportHtml(buildMockReportContext(result));
}

export function openMockReportPreview(result) {
  const html = buildMockReportHtml(result);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function exportMockReportPdf(result) {
  const html = buildMockReportHtml(result);
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Popup was blocked. Allow popups to export mock report.');
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
