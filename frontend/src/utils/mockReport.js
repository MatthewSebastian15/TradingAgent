import { formatPrice } from './formatting';
import { safeExternalUrl } from './url';
import { MOCK_REPORT_DISCLAIMER } from '../constants/reportDisclaimer';

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
  if (typeof value === 'number')
    return Number.isInteger(value) ? value.toLocaleString() : String(value);
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

function numberOrNull(value) {
  if (!hasValue(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function profileMarketCap(value, currency) {
  const number = numberOrNull(value);
  if (number === null) return 'N/A';

  const currencyCode = String(currency || '').toUpperCase();
  if (!currencyCode) return display(number);

  const isIdr = currencyCode === 'IDR';
  const divisor = isIdr ? 1_000_000_000 : 1_000_000;
  return `${(number / divisor).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ${currencyCode} ${isIdr ? 'Bn' : 'Mn'}`;
}

function profileNumber(value) {
  const number = numberOrNull(value);
  return number === null ? 'N/A' : number.toLocaleString('en-US');
}

function profileCurrentPrice(value, profile) {
  const number = numberOrNull(value);
  if (number === null) return 'N/A';

  const currencyCode = String(profile?.currency || '').toUpperCase();
  if (currencyCode === 'IDR') return `Rp ${number.toLocaleString('en-US')}`;
  if (profile?.ticker) return formatPrice(number, profile.ticker) || 'N/A';
  if (!currencyCode) return display(number);
  return `${currencyCode} ${number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildCompanyProfileRows(profile) {
  if (!profile?.available) return [];
  return [
    row('Company Name', profile.company_name || profile.name),
    row('Ticker', profile.ticker),
    row('Exchange', profile.exchange),
    row('Currency', profile.currency),
    row('Country', profile.country),
    row('Sector', profile.sector),
    row('Industry', profile.industry),
    row('Website', profile.website),
    row('Market Cap', profileMarketCap(profile.market_cap, profile.currency)),
    row('Shares Outstanding', profileNumber(profile.shares_outstanding)),
    row('Current Price', profileCurrentPrice(profile.current_price, profile)),
    row('Fiscal Year End', profile.fiscal_year_end),
    row('Employee Count', profile.employee_count ?? profile.full_time_employees),
    row('Profile Data Quality', profile.data_quality?.status),
  ];
}

function buildCompanyProfileExecutives(profile) {
  const officers = Array.isArray(profile?.officers) ? profile.officers : profile?.executives;
  if (!Array.isArray(officers)) return [];
  return officers
    .slice(0, 10)
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ name: display(item.name), title: display(item.title) }));
}

function buildPriceChartRows(chart, result) {
  if (!chart?.available) return [];
  const stats = chart.stats || {};
  return [
    row('Window', chart.window_label),
    row('Source', chart.source),
    row('Lookback Days', chart.lookback_days),
    row('Start Price', price(stats.start_price, result)),
    row('End Price', price(stats.end_price, result)),
    row('Change %', stats.change_percent),
    row('High', price(stats.high, result)),
    row('Low', price(stats.low, result)),
    row('Average Close', price(stats.average_close, result)),
    row('Average Volume', stats.average_volume),
    row('Point Count', stats.point_count),
  ];
}

function buildRelatedNewsItems(relatedNews) {
  if (!Array.isArray(relatedNews?.items)) return [];
  return relatedNews.items
    .slice(0, 8)
    .filter((item) => item && typeof item === 'object' && item.title)
    .map((item) => ({
      title: display(item.title),
      publisher: display(item.publisher),
      published_at: display(item.published_at),
      source: display(item.source),
      event_type: display(item.event_type),
      summary: display(item.summary),
      relevance_reason: display(item.relevance_reason),
      url: safeExternalUrl(item.url),
    }));
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
    disclaimer: MOCK_REPORT_DISCLAIMER,
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
      row(
        'Confidence',
        hasValue(result.confidence_score)
          ? `${Math.round(Number(result.confidence_score) * 100)}%`
          : null
      ),
      row(
        'Suggested Allocation',
        hasValue(result.suggested_allocation_percent)
          ? `${result.suggested_allocation_percent}%`
          : null
      ),
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
    financial_highlights: result.financial_highlights || null,
    financial_trends: result.financial_trends || null,
    valuation_multiples: result.valuation_multiples || null,
    fair_value_range: result.fair_value_range || null,
    scenario_analysis: result.scenario_analysis || null,
    quality_of_earnings: result.quality_of_earnings || null,
    balance_sheet_risk: result.balance_sheet_risk || null,
    dividend_quality: result.dividend_quality || null,
    peer_comparison: result.peer_comparison || null,
    company_profile: result.company_profile || {},
    company_profile_rows: buildCompanyProfileRows(result.company_profile),
    company_profile_executives: buildCompanyProfileExecutives(result.company_profile),
    price_chart_rows: buildPriceChartRows(result.price_chart, result),
    related_news: result.related_news || {},
    related_news_items: buildRelatedNewsItems(result.related_news),
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

function renderFinancialHighlights(financialHighlights) {
  const periods = financialHighlights?.periods;
  const sections = Array.isArray(financialHighlights?.sections)
    ? financialHighlights.sections
    : [{ key: 'legacy', title: null, rows: financialHighlights?.rows }];
  const hasRows = sections.some((section) => Array.isArray(section.rows) && section.rows.length);
  if (!Array.isArray(periods) || !periods.length || !hasRows) {
    return '';
  }
  const snapshot = Array.isArray(financialHighlights.point_in_time)
    ? financialHighlights.point_in_time
    : [];
  const renderTable = (rows) => `<table class="financial-highlights-table">
    <thead>
      <tr>
        <th>Metric</th>
        ${periods.map((period) => `<th>${escapeHtml(period.label)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (item) => `<tr>
            <td>${escapeHtml(item.label)}</td>
            ${periods
              .map((period) => {
                const cell = item.values?.[period.key];
                return `<td>${escapeHtml(cell?.status === 'unavailable' ? 'N/A' : cell?.display)}</td>`;
              })
              .join('')}
          </tr>`
        )
        .join('')}
    </tbody>
  </table>`;
  return `<section class="section financial-highlights">
    <h2>${escapeHtml(financialHighlights.title || 'Key Financial Highlights')}</h2>
    ${financialHighlights.unit_note ? `<p class="muted">${escapeHtml(financialHighlights.unit_note)}</p>` : ''}
    ${
      snapshot.length
        ? `<h3>Latest Market Snapshot</h3>
          <table><tbody>${snapshot
            .map(
              (item) =>
                `<tr><th>${escapeHtml(item.label)}</th><td>${escapeHtml(item.status === 'unavailable' ? 'N/A' : `${item.display} ${item.unit}`)}</td></tr>`
            )
            .join('')}</tbody></table>`
        : ''
    }
    ${sections
      .filter((section) => section.rows?.length)
      .map(
        (section) =>
          `${section.title ? `<h3>${escapeHtml(section.title)}</h3>` : ''}${renderTable(section.rows)}`
      )
      .join('')}
  </section>`;
}

function metricDetailDisplay(detail) {
  if (!detail || detail.status === 'unavailable') return 'N/A';
  return detail.status === 'estimated' ? `${detail.display || 'N/A'} EST` : detail.display || 'N/A';
}

function renderFundamentalQuality(payload) {
  const quality = payload?.data_quality;
  if (!quality || quality.status === 'complete') return '';
  const notes = [...(quality.fallback_used || []), ...(quality.warnings || [])];
  return `<div class="warning"><strong>Data quality: ${escapeHtml(quality.status || 'N/A')}</strong>
    ${notes.length ? renderList(notes) : '<p>Some values are unavailable. Missing values are shown as N/A.</p>'}
  </div>`;
}

function renderFundamentalMetricSection(title, payload, metrics, summary = '') {
  if (!payload?.metric_details) return '';
  return `<section class="section">
    <h2>${escapeHtml(title)}</h2>
    ${summary}
    <table><tbody>${renderRows(
      metrics.map(([key, label]) => row(label, metricDetailDisplay(payload.metric_details[key])))
    )}</tbody></table>
    ${renderFundamentalQuality(payload)}
  </section>`;
}

function renderFinancialTrends(payload) {
  if (!payload?.periods?.length || !payload?.metric_details) return '';
  const metrics = [
    ['revenue', 'Revenue'],
    ['revenue_growth_percent', 'Revenue Growth'],
    ['ebitda', 'EBITDA'],
    ['ebitda_margin_percent', 'EBITDA Margin'],
    ['net_profit', 'Net Profit'],
    ['net_profit_growth_percent', 'Net Profit Growth'],
    ['net_profit_margin_percent', 'Net Profit Margin'],
    ['roe_percent', 'ROE'],
    ['eps', 'EPS'],
    ['bvps', 'BVPS'],
    ['der', 'DER'],
  ];
  return `<section class="section">
    <h2>Financial Trend Analysis</h2>
    ${payload.unit_note ? `<p class="muted">${escapeHtml(payload.unit_note)}</p>` : ''}
    <table class="financial-highlights-table">
      <thead><tr><th>Metric</th>${payload.periods.map((period) => `<th>${escapeHtml(period.label)}</th>`).join('')}</tr></thead>
      <tbody>${metrics
        .map(
          ([key, label]) =>
            `<tr><td>${escapeHtml(label)}</td>${(payload.metric_details[key] || [])
              .map((detail) => `<td>${escapeHtml(metricDetailDisplay(detail))}</td>`)
              .join('')}</tr>`
        )
        .join('')}</tbody>
    </table>
    ${renderFundamentalQuality(payload)}
  </section>`;
}

function renderScenarioAnalysis(payload) {
  if (!payload) return '';
  const rows = ['bear', 'base', 'bull'].map((key) => ({ scenario: key, ...(payload[key] || {}) }));
  return `<section class="section">
    <h2>Bull / Base / Bear Scenario</h2>
    <table>
      <thead><tr><th>Scenario</th><th>Fair Value</th><th>Upside / Downside</th><th>Growth</th><th>Margin</th><th>Multiple</th><th>Assumption</th></tr></thead>
      <tbody>${rows
        .map(
          (item) => `<tr>
            <td>${escapeHtml(item.scenario)}</td>
            <td>${escapeHtml(item.fair_value_display)}</td>
            <td>${escapeHtml(item.upside_downside_display)}</td>
            <td>${escapeHtml(hasValue(item.revenue_growth_assumption_percent) ? `${item.revenue_growth_assumption_percent}%` : null)}</td>
            <td>${escapeHtml(hasValue(item.margin_assumption_percent) ? `${item.margin_assumption_percent}%` : null)}</td>
            <td>${escapeHtml(item.valuation_multiple)}</td>
            <td>${escapeHtml(item.assumption)}</td>
          </tr>`
        )
        .join('')}</tbody>
    </table>
    ${renderFundamentalQuality(payload)}
  </section>`;
}

function renderPeerComparison(payload) {
  if (!payload?.metrics?.length) return '';
  return `<section class="section">
    <h2>Peer Comparison</h2>
    <table>
      <thead><tr><th>Ticker</th><th>Company</th><th>P/E</th><th>P/BV</th><th>ROE</th><th>Net Margin</th><th>DER</th><th>Dividend Yield</th></tr></thead>
      <tbody>${payload.metrics
        .map(
          (item) => `<tr>
            <td>${escapeHtml(item.ticker)}</td>
            <td>${escapeHtml(item.company_name)}</td>
            <td>${escapeHtml(item.pe)}</td>
            <td>${escapeHtml(item.pbv)}</td>
            <td>${escapeHtml(hasValue(item.roe_percent) ? `${item.roe_percent}%` : null)}</td>
            <td>${escapeHtml(hasValue(item.net_profit_margin_percent) ? `${item.net_profit_margin_percent}%` : null)}</td>
            <td>${escapeHtml(item.der)}</td>
            <td>${escapeHtml(hasValue(item.dividend_yield_percent) ? `${item.dividend_yield_percent}%` : null)}</td>
          </tr>`
        )
        .join('')}</tbody>
    </table>
    ${renderFundamentalQuality(payload)}
  </section>`;
}

function renderCompanyProfile(profile, rows, executives) {
  if (!rows.length) return '';
  return `<section class="section">
    <h2>Company Profile</h2>
    <table><tbody>${renderRows(rows)}</tbody></table>
    ${profile.business_summary || profile.description ? `<h3>Business Description</h3><p>${escapeHtml(profile.business_summary || profile.description)}</p>` : ''}
    ${
      executives.length
        ? `<h3>Key Executives</h3>
          <table>
            <thead><tr><th>Name</th><th>Title</th></tr></thead>
            <tbody>
              ${executives
                .map(
                  (executive) =>
                    `<tr><td>${escapeHtml(executive.name)}</td><td>${escapeHtml(executive.title)}</td></tr>`
                )
                .join('')}
            </tbody>
          </table>`
        : ''
    }
  </section>`;
}

function renderPriceChartSummary(rows) {
  if (!rows.length) return '';
  return `<section class="section">
    <h2>Chart &amp; Price Summary</h2>
    <table><tbody>${renderRows(rows)}</tbody></table>
  </section>`;
}

function renderRelatedNews(relatedNews, items) {
  if (!items.length) return '';
  return `<section class="section">
    <h2>Related News</h2>
    ${relatedNews.summary ? `<p>${escapeHtml(relatedNews.summary)}</p>` : ''}
    <div class="news-list">
      ${items
        .map(
          (item) => `<article class="news-item">
            <h3>${escapeHtml(item.title)}</h3>
            <p class="muted">Publisher: ${escapeHtml(item.publisher)} | Published: ${escapeHtml(item.published_at)} | Source: ${escapeHtml(item.source)} | Event: ${escapeHtml(item.event_type)}</p>
            ${item.summary !== 'N/A' ? `<p>${escapeHtml(item.summary)}</p>` : ''}
            ${item.relevance_reason !== 'N/A' ? `<p><strong>Why it matters:</strong> ${escapeHtml(item.relevance_reason)}</p>` : ''}
            ${item.url ? `<p><a href="${escapeHtml(item.url)}">Open original source</a></p>` : ''}
          </article>`
        )
        .join('')}
    </div>
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
      .financial-highlights-table { font-size: 12px; }
      .financial-highlights-table th, .financial-highlights-table td { padding: 7px; text-align: right; white-space: nowrap; }
      .financial-highlights-table th:first-child, .financial-highlights-table td:first-child { text-align: left; }
      .financial-highlights-table th:first-child { width: auto; }
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
      .news-list { display: grid; gap: 12px; }
      .news-item { border: 1px solid #d1d5db; padding: 12px; break-inside: avoid; }
      .news-item h3 { margin: 0 0 6px; font-size: 13px; }
      .news-item p { margin: 4px 0; }
      .disclaimer {
        margin-top: 28px;
        padding: 16px;
        border: 1px solid #d1d5db;
        background: #f9fafb;
        color: #4b5563;
        font-size: 12px;
        line-height: 1.55;
        break-inside: avoid;
      }
      .disclaimer h2 { margin-top: 0; }
      .disclaimer p { white-space: pre-line; margin-bottom: 0; }
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
        <h2>Final Recommendation</h2>
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

      ${renderCompanyProfile(
        report.company_profile,
        report.company_profile_rows,
        report.company_profile_executives
      )}

      ${renderFinancialHighlights(report.financial_highlights)}

      ${renderFinancialTrends(report.financial_trends)}

      ${renderFundamentalMetricSection(
        'Valuation Multiples',
        report.valuation_multiples,
        [
          ['market_cap', 'Market Cap'],
          ['enterprise_value', 'Enterprise Value'],
          ['pe', 'P/E'],
          ['pbv', 'P/BV'],
          ['ps', 'P/S'],
          ['ev_ebitda', 'EV/EBITDA'],
        ],
        report.valuation_multiples?.interpretation
          ? `<p>Label: ${escapeHtml(report.valuation_multiples.interpretation.valuation_label)}. ${escapeHtml(report.valuation_multiples.interpretation.main_reason)}</p>`
          : ''
      )}

      ${renderFundamentalMetricSection(
        'Fair Value Range',
        report.fair_value_range,
        [
          ['current_price', 'Current Price'],
          ['bear', 'Bear Fair Value'],
          ['base', 'Base Fair Value'],
          ['bull', 'Bull Fair Value'],
          ['bear_upside_percent', 'Bear Upside / Downside'],
          ['base_upside_percent', 'Base Upside / Downside'],
          ['bull_upside_percent', 'Bull Upside / Downside'],
        ],
        report.fair_value_range
          ? `<p>Primary method: ${escapeHtml(report.fair_value_range.primary_method)}</p>`
          : ''
      )}

      ${renderScenarioAnalysis(report.scenario_analysis)}

      ${renderFundamentalMetricSection('Quality of Earnings', report.quality_of_earnings, [
        ['cfo_to_net_income', 'CFO / Net Income'],
        ['free_cash_flow', 'Free Cash Flow'],
        ['capex_intensity_percent', 'Capex Intensity'],
      ])}

      ${renderFundamentalMetricSection('Balance Sheet Risk', report.balance_sheet_risk, [
        ['der', 'DER'],
        ['net_debt', 'Net Debt'],
        ['debt_to_ebitda', 'Debt / EBITDA'],
        ['cash_ratio', 'Cash Ratio'],
        ['equity_ratio', 'Equity Ratio'],
      ])}

      ${renderFundamentalMetricSection('Dividend Quality', report.dividend_quality, [
        ['dividend_yield_percent', 'Dividend Yield'],
        ['payout_ratio_percent', 'Payout Ratio'],
        ['fcf_coverage', 'FCF Coverage'],
      ])}

      ${renderPeerComparison(report.peer_comparison)}

      ${renderPriceChartSummary(report.price_chart_rows)}

      ${renderRelatedNews(report.related_news, report.related_news_items)}

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
        <p>${escapeHtml(report.disclaimer)}</p>
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
