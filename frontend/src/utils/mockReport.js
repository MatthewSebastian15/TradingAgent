import { formatPrice } from './formatting';
import { safeExternalUrl } from './url';
import { MOCK_REPORT_DISCLAIMER } from '../constants/reportDisclaimer';

const ACTIONABLE_DECISIONS = new Set(['BUY', 'Buy', 'Overweight', 'SELL', 'Sell', 'Underweight']);
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

function normalizeInlineText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function truncateReasonWords(text, maxWords = 125) {
  const words = normalizeInlineText(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}.`.replace(/\.\.$/, '.');
}

function asReasonItems(value) {
  if (Array.isArray(value)) return value.map(normalizeInlineText).filter(Boolean);
  const text = normalizeInlineText(value);
  return text ? [text] : [];
}

function buildKeyReasonsParagraph(result = {}) {
  const overview = result.analysis_overview || {};
  const direct = normalizeInlineText(
    overview.key_reasons_paragraph || result.key_reasons_paragraph
  );
  if (direct) return truncateReasonWords(direct, 125);

  const items = [
    ...asReasonItems(overview.key_reasons || result.key_reasons),
    ...asReasonItems(result.key_catalysts),
    normalizeInlineText(result.mini_risk_summary),
    normalizeInlineText(result.decision_adjusted_reason),
  ].filter(Boolean);

  const uniqueItems = Array.from(new Set(items));
  if (!uniqueItems.length) return '';

  const paragraph = uniqueItems.join('. ');
  return truncateReasonWords(paragraph.endsWith('.') ? paragraph : `${paragraph}.`, 125);
}

function finalDecision(result) {
  return display(
    result?.display_signal || result?.final_decision || result?.decision || result?.rating || 'WAIT'
  );
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
  const summary = result?.price_performance || chart.summary || {};
  return [
    row('Window', chart.window_label),
    row('Source', chart.source),
    row('Lookback Days', chart.lookback_days),
    row('Start Price', price(stats.start_price, result)),
    row('End Price', price(stats.end_price, result)),
    row(
      'Period Return',
      hasValue(summary.period_return_percent)
        ? `${summary.period_return_percent}%`
        : stats.change_percent
    ),
    row('Period High', price(summary.period_high ?? stats.high, result)),
    row('Period Low', price(summary.period_low ?? stats.low, result)),
    row(
      'Max Drawdown',
      hasValue(summary.max_drawdown_percent) ? `${summary.max_drawdown_percent}%` : null
    ),
    row('Average Close', price(stats.average_close, result)),
    row('Average Volume', summary.average_volume ?? stats.average_volume),
    row('Latest Volume', summary.latest_volume),
    row('Volume Trend', summary.volume_trend),
    row('Point Count', stats.point_count),
  ];
}

function buildTechnicalEntryRows(technical, result) {
  if (!technical || typeof technical !== 'object') return [];
  return [
    row('Entry Quality', technical.entry_quality),
    row('Trend', technical.trend),
    row('RSI', technical.rsi),
    row('RSI Signal', technical.rsi_signal),
    row('MACD', technical.macd),
    row('MACD Signal Value', technical.macd_signal_value),
    row('MACD Signal', technical.macd_signal),
    row('ATR', price(technical.atr, result)),
    row('SMA 20', price(technical.sma_20, result)),
    row('SMA 50', price(technical.sma_50, result)),
    row('SMA 200', price(technical.sma_200, result)),
    row('Support', price(technical.support, result)),
    row('Resistance', price(technical.resistance, result)),
    row('Volume Trend', technical.volume_trend),
  ];
}

function buildRelatedNewsItems(relatedNews) {
  if (!Array.isArray(relatedNews?.items)) return [];
  return dedupeNewsItems(relatedNews.items).map((item) => ({
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

function newsDedupeKey(item) {
  if (!item || typeof item !== 'object') return '';
  return String(
    item.dedupe_key || item.normalized_url || item.url || item.normalized_title || item.title || ''
  )
    .trim()
    .toLowerCase();
}

function dedupeNewsItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const output = [];

  items.forEach((item) => {
    if (!item || typeof item !== 'object' || !item.title) return;
    const key = newsDedupeKey(item) || String(item.title).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

function buildHighImpactNewsItems(newsImpact) {
  if (!Array.isArray(newsImpact?.high_impact_news)) return [];
  return newsImpact.high_impact_news
    .filter((item) => item && typeof item === 'object' && item.title)
    .map((item) => ({
      title: display(item.title),
      source: display(item.source),
      publisher: display(item.publisher),
      published_at: display(item.published_at),
      sentiment: display(item.sentiment),
      impact: display(item.impact),
      impact_score: display(item.impact_score),
      relevance_score: display(item.relevance_score),
      materiality_category: display(item.materiality_category),
      source_confidence_label: display(item.source_confidence_label),
      news_scope: display(item.scope_label || item.news_scope),
      impact_reason: display(item.impact_reason || item.relevance_reason),
      summary: display(item.summary),
      url: safeExternalUrl(item.url),
      dedupe_key: display(item.dedupe_key),
    }));
}

function buildFullNewsItems(newsImpact, relatedNews) {
  const hasFullNewsList = Array.isArray(newsImpact?.full_news_list);
  const rawItems = hasFullNewsList ? newsImpact.full_news_list : relatedNews?.items;
  const highImpactItems = Array.isArray(newsImpact?.high_impact_news)
    ? newsImpact.high_impact_news
    : [];

  const highKeys = new Set(dedupeNewsItems(highImpactItems).map(newsDedupeKey).filter(Boolean));

  return dedupeNewsItems(rawItems)
    .filter((item) => !highKeys.has(newsDedupeKey(item)))
    .map((item) => ({
      title: display(item.title),
      publisher: display(item.publisher),
      published_at: display(item.published_at),
      source: display(item.source),
      event_type: display(item.event_type || item.materiality_category),
      materiality_category: display(item.materiality_category),
      news_scope: display(item.scope_label || item.news_scope),
      source_confidence_label: display(item.source_confidence_label),
      impact: display(item.impact),
      impact_score: display(item.impact_score),
      relevance_score: display(item.relevance_score),
      summary: display(item.summary),
      impact_reason: display(item.impact_reason || item.relevance_reason),
      url: safeExternalUrl(item.url),
      dedupe_key: display(item.dedupe_key),
    }));
}

function buildNewsImpactRows(newsImpact) {
  if (!newsImpact || typeof newsImpact !== 'object') return [];
  return [
    row('Overall Sentiment', newsImpact.overall_sentiment),
    row('Sentiment Score', newsImpact.sentiment_score),
    row(
      'High Impact Count',
      newsImpact.high_impact_count || newsImpact.high_impact_news?.length || 0
    ),
    row('Full News Count', newsImpact.full_news_count || newsImpact.full_news_list?.length || 0),
    row('News Count', newsImpact.news_count),
    row('Deduplicated Count', newsImpact.deduplicated_count),
    row('Duplicate Removed', newsImpact.duplicate_excluded_count),
    row('High Impact Limited', newsImpact.data_quality?.rules?.high_impact_limited),
    row('Full News Limited', newsImpact.data_quality?.rules?.full_news_limited),
    row('Sources Used', (newsImpact.data_quality?.sources_used || []).join(', ')),
  ];
}

function buildCatalystItems(tracker, key) {
  const items = tracker?.[key];
  if (!Array.isArray(items)) return [];
  return items.slice(0, 5).map((item) => ({
    type: display(item.type),
    label: display(item.label),
    impact: display(item.impact || item.risk_level),
    source: display(item.source),
    date: display(item.date),
    related_news_title: display(item.related_news_title),
  }));
}

function buildAnalystConsensusRows(consensus) {
  if (!consensus?.available) return [];
  return [
    row('Period', consensus.period),
    row('Strong Buy', consensus.strong_buy),
    row('Buy', consensus.buy),
    row('Hold', consensus.hold),
    row('Sell', consensus.sell),
    row('Strong Sell', consensus.strong_sell),
    row('Total', consensus.total),
    row('Consensus Label', consensus.consensus_label),
    row('Trend', consensus.trend),
  ];
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

function buildMockStatusActionRows(result) {
  return [
    row('Current Price', price(result?.current_price ?? result?.last_price, result)),
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

function normalizedConfidencePercent(value) {
  if (!hasValue(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric <= 1 ? numeric * 100 : numeric)));
}

function formatConfidence(score, label) {
  const percent = normalizedConfidencePercent(score);
  if (percent === null) return 'N/A';
  return label ? `${percent}% — ${label}` : `${percent}%`;
}

function formatDateTimeWib(value, includeTime = true) {
  if (!hasValue(value)) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return display(value);
  if (!includeTime || String(value).length <= 10) return String(value).slice(0, 10);
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
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} WIB`;
}

function buildConfidenceRows(result) {
  const breakdown = result?.confidence_breakdown || {};
  return [
    row('Confidence', formatConfidence(result?.confidence_score, result?.confidence_label)),
    row('Confidence Tier', result?.confidence_tier),
    row('Price Momentum', breakdown.price_momentum),
    row('Fundamental Quality', breakdown.fundamental_quality),
    row('News Sentiment', breakdown.news_sentiment),
    row('Risk Level Score', breakdown.risk_level_score),
    row('Data Quality', breakdown.data_quality),
    row('Overall', breakdown.overall),
  ];
}

function buildVolatilityRows(result) {
  return [
    row(
      'Volatility Score',
      hasValue(result?.volatility_score) ? `${result.volatility_score} / 100` : null
    ),
    row('Classification', result?.volatility_classification || result?.volatility_level),
    row('Scale', result?.volatility_scale),
    row(
      'Lookback',
      hasValue(result?.volatility_lookback_days) ? `${result.volatility_lookback_days} days` : null
    ),
    row('Method', result?.volatility_method),
  ];
}

function buildDataSourceRows(sources = {}) {
  return Object.entries(sources).map(([key, value]) =>
    row(
      key.replace(/_/g, ' ').toUpperCase(),
      value && typeof value === 'object'
        ? Object.entries(value)
            .map(([itemKey, itemValue]) => `${itemKey}: ${display(itemValue)}`)
            .join(' | ')
        : value
    )
  );
}

function buildDataFreshnessRows(freshness = {}) {
  const priceFreshness = freshness.price || {};
  const financials = freshness.financials || {};
  const news = freshness.news || {};
  const macro = freshness.macro || {};
  return [
    row(
      'Price Data',
      `${formatDateTimeWib(priceFreshness.timestamp)} | ${display(priceFreshness.freshness_status)}`
    ),
    row(
      'Financial Reports',
      `${display(financials.period)} ${financials.period_end_date ? `(${financials.period_end_date})` : ''} | ${display(financials.freshness_status)}`
    ),
    row(
      'News Coverage',
      `Last ${display(news.lookback_days)} days | ${display(news.articles_count)} articles | latest ${display(news.latest_article_date)} | ${display(news.freshness_status)}`
    ),
    row('Macro Data', `${display(macro.description)} | ${display(macro.freshness_status)}`),
  ];
}

function buildAgentPipelineRows(pipeline = []) {
  return Array.isArray(pipeline)
    ? pipeline.map((agent) =>
        row(
          agent.name,
          `${display(agent.status)} | ${hasValue(agent.duration_seconds) ? `${agent.duration_seconds}s` : 'N/A'}${agent.warning ? ` | ${agent.warning}` : ''}`
        )
      )
    : [];
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
    request_id: display(result.request_id || result.id),
    ticker: display(result.normalized_ticker || result.ticker),
    market: display(result.market),
    company_name: display(result.company_name),
    exchange: display(result.exchange),
    trade_date: display(result.trade_date),
    analysis_created_at: display(result.analysis_created_at || result.saved_at),
    generated_at: new Date().toISOString(),
    disclaimer: MOCK_REPORT_DISCLAIMER,
    current_price: result.current_price ?? result.last_price,
    current_price_display: price(result.current_price ?? result.last_price, result),
    current_price_as_of: display(
      result.price_timestamp || result.current_price_as_of || result.last_close_price_as_of
    ),
    current_price_source: display(result.price_source || result.current_price_source),
    llm_decision: display(result.raw_ai_signal || result.llm_decision),
    final_decision: result.display_signal || decision,
    raw_ai_signal: display(result.raw_ai_signal || result.llm_decision),
    display_signal: display(result.display_signal || decision),
    signal_context: display(result.signal_context),
    decision_adjusted: Boolean(result.decision_adjusted),
    decision_adjusted_reason: display(result.decision_adjusted_reason),
    trade_plan_valid: tradePlanValid,
    has_existing_position: Boolean(result.has_existing_position),
    show_trade_plan: showTradePlan,
    executive_summary: textOrNull(result.executive_summary) || 'N/A',
    key_reasons_paragraph: buildKeyReasonsParagraph(result),
    decision_rows: [
      row('Display Signal', result.display_signal || decision),
      row('Raw AI Signal', result.raw_ai_signal || result.llm_decision),
      row('Signal Context', result.signal_context),
      row('Decision Adjusted', Boolean(result.decision_adjusted)),
      row('Decision Adjusted Reason', result.decision_adjusted_reason),
      row('Trade Plan Valid', tradePlanValid),
      row('Has Existing Position', Boolean(result.has_existing_position)),
      row('Time Horizon', result.time_horizon || result.horizon),
      row('Confidence', formatConfidence(result.confidence_score, result.confidence_label)),
      row(
        'Suggested Allocation',
        hasValue(result.suggested_allocation_percent)
          ? `${result.suggested_allocation_percent}%`
          : null
      ),
    ],
    confidence_rows: buildConfidenceRows(result),
    volatility_rows: buildVolatilityRows(result),
    data_source_rows: buildDataSourceRows(result.data_sources),
    data_freshness_rows: buildDataFreshnessRows(result.data_freshness),
    agent_pipeline_rows: buildAgentPipelineRows(result.agent_pipeline),
    total_pipeline_seconds: result.total_pipeline_seconds,
    action_plan_rows: showTradePlan ? buildMockActionPlanRows(result) : [],
    status_action_rows: showTradePlan ? [] : buildMockStatusActionRows(result),
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
    risk_data_quality: result.risk_data_quality || {},
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
    technical_entry_rows: buildTechnicalEntryRows(result.technical_entry, result),
    news_impact: result.news_impact || {},
    news_impact_rows: buildNewsImpactRows(result.news_impact),
    high_impact_news_items: buildHighImpactNewsItems(result.news_impact),
    full_news_items: buildFullNewsItems(result.news_impact, result.related_news),
    catalyst_tracker: result.catalyst_tracker || {},
    positive_catalysts: buildCatalystItems(result.catalyst_tracker, 'positive_catalysts'),
    negative_catalysts: buildCatalystItems(result.catalyst_tracker, 'negative_catalysts'),
    upcoming_events: buildCatalystItems(result.catalyst_tracker, 'upcoming_events'),
    analyst_consensus_rows: buildAnalystConsensusRows(result.analyst_consensus),
    related_news: result.related_news || {},
    related_news_items: Array.isArray(result.news_impact?.full_news_list)
      ? []
      : buildRelatedNewsItems(result.related_news),
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

function expandFinancialYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  if (year < 100) return year < 50 ? 2000 + year : 1900 + year;
  return year;
}

function displayPeriodLabel(period) {
  const raw = String(period?.display_period || period?.label || period?.period || '').trim();
  let match = raw.match(/^FY\s?(\d{2}|\d{4})$/i);
  if (match) {
    const year = expandFinancialYear(match[1]);
    return year ? `FY ${year}` : '-';
  }

  match = raw.match(/^FY\s?(\d{2}|\d{4})Q([1-4])$/i) || raw.match(/^Q([1-4])\s?(\d{2}|\d{4})$/i);
  if (match) {
    const isLegacyQuarter = match[0].toUpperCase().startsWith('FY');
    const quarter = isLegacyQuarter ? match[2] : match[1];
    const year = expandFinancialYear(isLegacyQuarter ? match[1] : match[2]);
    return year ? `Q${quarter} ${year}` : '-';
  }

  return raw || '-';
}

function periodSortValue(period) {
  if (period?.sort_key) return String(period.sort_key);
  const label = displayPeriodLabel(period);
  const annual = label.match(/^FY\s(\d{4})$/i);
  if (annual) return `${annual[1]}1231`;
  const quarter = label.match(/^Q([1-4])\s(\d{4})$/i);
  if (quarter) return `${quarter[2]}${String(Number(quarter[1]) * 3).padStart(2, '0')}31`;
  const year = Number(period?.year || period?.fiscal_year || 0);
  const fiscalQuarter = Number(period?.quarter || period?.fiscal_quarter || 0);
  return `${String(year).padStart(4, '0')}${String(fiscalQuarter).padStart(2, '0')}`;
}

function sortFinancialPeriods(periods) {
  return [...periods].sort((left, right) =>
    periodSortValue(right).localeCompare(periodSortValue(left))
  );
}

function unitSuffix(unit) {
  const text = String(unit || '');
  if (/\bBn\b/i.test(text)) return 'Bn';
  if (/\bMn\b/i.test(text)) return 'Mn';
  if (text.includes('%')) return '%';
  if (/\/share/i.test(text)) return text;
  if (/\bx\b/i.test(text) || /ratio/i.test(text)) return 'x';
  return '';
}

function appendFinancialUnit(value, unit) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const text = String(value).trim();
  if (text === 'N/A' || text.toLowerCase() === 'source unavailable') return 'N/A';
  const suffix = unitSuffix(unit);
  if (!suffix) return text.replace(/\s*%/g, ' %');
  if (suffix === '%') return `${text.replace(/\s*%$/, '')} %`;
  if (suffix === 'x') return /\s*x$/i.test(text) ? text : `${text}x`;
  if (text.toLowerCase().endsWith(suffix.toLowerCase())) return text;
  return `${text} ${suffix}`;
}

function financialCellDisplay(cell, unit) {
  if (!cell || cell.status === 'unavailable' || cell.status === 'source_unavailable') return 'N/A';
  const value = cell.display ?? cell.value;
  const display = appendFinancialUnit(value, unit);
  return cell.status === 'estimated' && display !== 'N/A' ? `${display} EST` : display;
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
  const displayPeriods = sortFinancialPeriods(periods);
  const renderTable = (rows) => `<table class="financial-highlights-table">
    <thead>
      <tr>
        <th>Metric</th>
        ${displayPeriods.map((period) => `<th>${escapeHtml(displayPeriodLabel(period))}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (item) => `<tr>
            <td>${escapeHtml(item.label)}</td>
            ${displayPeriods
              .map((period) => {
                const cell = item.values?.[period.key];
                return `<td>${escapeHtml(financialCellDisplay(cell, item.unit))}</td>`;
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
                `<tr><th>${escapeHtml(item.label)}</th><td>${escapeHtml(financialCellDisplay(item, item.unit))}</td></tr>`
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

function metricDetailDisplay(detail, unit) {
  return financialCellDisplay(detail, unit);
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
  </section>`;
}

function renderFinancialTrends(payload) {
  if (!payload?.periods?.length || !payload?.metric_details) return '';
  const displayPeriods = sortFinancialPeriods(payload.periods);
  const metrics = [
    ['revenue', 'Revenue', payload.scale_label || ''],
    ['revenue_growth_percent', 'Revenue Growth', '%'],
    ['ebitda', 'EBITDA', payload.scale_label || ''],
    ['ebitda_margin_percent', 'EBITDA Margin', '%'],
    ['net_profit', 'Net Profit', payload.scale_label || ''],
    ['net_profit_growth_percent', 'Net Profit Growth', '%'],
    ['net_profit_margin_percent', 'Net Profit Margin', '%'],
    ['roe_percent', 'ROE', '%'],
    ['eps', 'EPS', `${payload.currency || ''}/share`],
    ['bvps', 'BVPS', `${payload.currency || ''}/share`],
    ['der', 'DER', 'x'],
  ];
  return `<section class="section">
    <h2>Financial Trend Analysis</h2>
    ${payload.unit_note ? `<p class="muted">${escapeHtml(payload.unit_note)}</p>` : ''}
    <table class="financial-highlights-table">
      <thead><tr><th>Metric</th>${displayPeriods.map((period) => `<th>${escapeHtml(displayPeriodLabel(period))}</th>`).join('')}</tr></thead>
      <tbody>${metrics
        .map(
          ([key, label, unit]) =>
            `<tr><td>${escapeHtml(label)}</td>${displayPeriods
              .map((period) => {
                const index = payload.periods.findIndex((item) => item.key === period.key);
                return `<td>${escapeHtml(metricDetailDisplay(payload.metric_details[key]?.[index], unit))}</td>`;
              })
              .join('')}</tr>`
        )
        .join('')}</tbody>
    </table>
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

function renderTechnicalEntry(rows) {
  if (!rows.length) return '';
  return `<section class="section">
    <h2>Technical Entry Quality</h2>
    <table><tbody>${renderRows(rows)}</tbody></table>
  </section>`;
}

function renderNewsImpact(report) {
  if (!report.news_impact_rows.length) return '';
  return `<section class="section">
    <h2>News Impact Summary</h2>
    <table><tbody>${renderRows(report.news_impact_rows)}</tbody></table>
    ${
      report.high_impact_news_items.length
        ? `<h3>High Impact News</h3>
          <div class="news-list">
            ${report.high_impact_news_items
              .map(
                (item) => `<article class="news-item">
                  <h3>${escapeHtml(item.title)}</h3>
                  <p class="muted">Source: ${escapeHtml(item.source)} | Published: ${escapeHtml(item.published_at)} | Scope: ${escapeHtml(item.news_scope)} | Category: ${escapeHtml(item.materiality_category)} | Source Confidence: ${escapeHtml(item.source_confidence_label)} | Sentiment: ${escapeHtml(item.sentiment)} | Impact: ${escapeHtml(item.impact)} | Score: ${escapeHtml(item.impact_score)} | Relevance: ${escapeHtml(item.relevance_score)}</p>
                  ${item.summary !== 'N/A' ? `<p>${escapeHtml(item.summary)}</p>` : ''}
                  ${item.impact_reason !== 'N/A' ? `<p><strong>Why it matters:</strong> ${escapeHtml(item.impact_reason)}</p>` : ''}
                  ${item.url ? `<p><a href="${escapeHtml(item.url)}">Open original source</a></p>` : ''}
                </article>`
              )
              .join('')}
          </div>`
        : ''
    }
  </section>`;
}

function renderCatalystList(title, items) {
  if (!items.length) return '';
  return `<h3>${escapeHtml(title)}</h3>
    <ul>${items
      .map(
        (item) =>
          `<li>${escapeHtml(item.label)} | ${escapeHtml(item.impact)} | ${escapeHtml(item.source)} | ${escapeHtml(item.date)}</li>`
      )
      .join('')}</ul>`;
}

function renderCatalystTracker(report) {
  if (
    !report.positive_catalysts.length &&
    !report.negative_catalysts.length &&
    !report.upcoming_events.length
  ) {
    return '';
  }
  return `<section class="section">
    <h2>Catalyst Tracker</h2>
    ${
      report.catalyst_tracker?.summary?.main_message
        ? `<p>${escapeHtml(report.catalyst_tracker.summary.main_message)}</p>`
        : ''
    }
    ${renderCatalystList('Positive Catalysts', report.positive_catalysts)}
    ${renderCatalystList('Negative Catalysts', report.negative_catalysts)}
    ${renderCatalystList('Upcoming Events', report.upcoming_events)}
  </section>`;
}

function renderAnalystConsensus(rows) {
  if (!rows.length) return '';
  return `<section class="section">
    <h2>Analyst Recommendation Trend</h2>
    <table><tbody>${renderRows(rows)}</tbody></table>
  </section>`;
}

function valuePercent(value) {
  if (!hasValue(value)) return 'N/A';
  const text = String(value);
  return text.endsWith('%') ? text : `${text}%`;
}

function tableFromObjects(columns, rows) {
  if (!Array.isArray(rows) || !rows.length) return '<p class="muted">N/A</p>';
  return `<table>
    <thead><tr>${columns.map(([_key, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map(
        (item) =>
          `<tr>${columns.map(([key]) => `<td>${escapeHtml(Array.isArray(item?.[key]) ? item[key].join(', ') : item?.[key])}</td>`).join('')}</tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function renderRiskDataQuality(report) {
  const payload = report.risk_data_quality || {};
  if (!Object.keys(payload).length) return '';
  const summary = payload.risk_summary || {};
  const balance = payload.balance_sheet_risk_summary || {};
  const market = payload.market_risk || {};
  const riskReturn = payload.risk_adjusted_return || {};
  const monitor = payload.thesis_monitor || {};
  const quality = payload.data_quality || {};
  const breakdown = quality.score_breakdown || {};
  const vendorRows = Object.entries(payload.vendor_status || {}).map(([vendor, item]) => ({
    vendor,
    status: item.status,
    used_for: item.used_for,
    missing_fields: item.missing_fields,
  }));

  return `
    <section class="section">
      <h2>Risk Summary</h2>
      <table><tbody>${renderRows([
        row('Overall Risk', summary.overall_risk),
        row('Risk Score', summary.risk_score),
        row('Main Risks', (summary.main_risks || []).join(', ')),
        row('Risk Flags', (summary.risk_flags || []).join(', ')),
        row('Explanation', summary.risk_explanation),
      ])}</tbody></table>
      <h3>Balance Sheet Risk Summary</h3>
      <table><tbody>${renderRows([
        row('DER', balance.der),
        row('Net Debt', balance.net_debt),
        row('Debt / EBITDA', balance.debt_to_ebitda),
        row('Cash Ratio', balance.cash_ratio),
        row('Risk Level', balance.risk_level),
        row('Interpretation', balance.interpretation),
      ])}</tbody></table>
      ${
        payload.catalyst_risk?.length
          ? `<h3>Catalyst Risk</h3>${tableFromObjects(
              [
                ['type', 'Type'],
                ['label', 'Label'],
                ['impact', 'Impact'],
                ['date', 'Date'],
                ['source', 'Source'],
                ['reason', 'Reason'],
              ],
              payload.catalyst_risk
            )}`
          : ''
      }
    </section>
    <section class="section">
      <h2>Market Risk</h2>
      <table><tbody>${renderRows([
        row('Volatility', valuePercent(market.volatility_percent)),
        row('Max Drawdown', valuePercent(market.max_drawdown_percent)),
        row('ATR', market.atr),
        row('Price Range', valuePercent(market.price_range_percent)),
        row('Risk Bucket', market.risk_bucket),
      ])}</tbody></table>
      ${renderList(market.notes || [])}
    </section>
    <section class="section">
      <h2>Risk-Adjusted Return</h2>
      <table><tbody>${renderRows([
        row('Upside', valuePercent(riskReturn.upside_percent)),
        row('Downside', valuePercent(riskReturn.downside_percent)),
        row('Risk/Reward', riskReturn.risk_reward_ratio),
        row('Expected Return', riskReturn.expected_return_label),
      ])}</tbody></table>
      ${renderList(riskReturn.notes || [])}
    </section>
    <section class="section">
      <h2>Thesis Monitor</h2>
      <table><tbody>${renderRows([row('Overall Thesis Status', monitor.overall_thesis_status)])}</tbody></table>
      ${tableFromObjects(
        [
          ['category', 'Category'],
          ['condition', 'Condition'],
          ['status', 'Status'],
          ['reason', 'Reason'],
        ],
        monitor.checklist || []
      )}
    </section>
    <section class="section">
      <h2>Source Confidence &amp; Data Quality</h2>
      <table><tbody>${renderRows([
        row('Score', quality.score),
        row('Confidence', quality.confidence),
        row('Summary', quality.summary),
        row('Price Data', breakdown.price_data),
        row('Financial Data', breakdown.financial_data),
        row('Valuation Data', breakdown.valuation_data),
        row('News Data', breakdown.news_data),
        row('Vendor Success', breakdown.vendor_success),
        row('Freshness', breakdown.freshness),
      ])}</tbody></table>
      <h3>Vendor Status</h3>
      ${tableFromObjects(
        [
          ['vendor', 'Vendor'],
          ['status', 'Status'],
          ['used_for', 'Used For'],
          ['missing_fields', 'Missing Fields'],
        ],
        vendorRows
      )}
      <h3>Missing Fields</h3>
      ${tableFromObjects(
        [
          ['module', 'Module'],
          ['field', 'Field'],
          ['impact', 'Impact'],
          ['fallback_available', 'Fallback Available'],
        ],
        payload.missing_fields || []
      )}
      <h3>Fallback Used</h3>
      ${tableFromObjects(
        [
          ['field', 'Field'],
          ['method', 'Method'],
          ['confidence', 'Confidence'],
        ],
        payload.fallback_used || []
      )}
      <h3>Stale Data Warning</h3>
      ${tableFromObjects(
        [
          ['module', 'Module'],
          ['field', 'Field'],
          ['warning', 'Warning'],
          ['severity', 'Severity'],
        ],
        payload.stale_data_warning || []
      )}
      <h3>Calculation Notes</h3>
      ${renderList(payload.calculation_notes || [])}
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

function renderFullNewsList(report) {
  if (!report.full_news_items?.length) return '';

  return `
    <section class="section">
      <h2>Full News List</h2>
      ${report.related_news?.summary ? `<p>${escapeHtml(report.related_news.summary)}</p>` : ''}
      <p class="muted">Includes company, index, sector, and market-context news that did not qualify as high impact.</p>
      <div class="news-list">
        ${report.full_news_items
          .map(
            (item) => `<article class="news-item">
              <h3>${escapeHtml(item.title)}</h3>
              <p class="muted">Publisher: ${escapeHtml(item.publisher)} | Published: ${escapeHtml(item.published_at)} | Source: ${escapeHtml(item.source)} | Scope: ${escapeHtml(item.news_scope)} | Category: ${escapeHtml(item.materiality_category)} | Source Confidence: ${escapeHtml(item.source_confidence_label)} | Impact: ${escapeHtml(item.impact)} | Score: ${escapeHtml(item.impact_score)} | Relevance: ${escapeHtml(item.relevance_score)}</p>
              ${item.summary !== 'N/A' ? `<p>${escapeHtml(item.summary)}</p>` : ''}
              ${item.impact_reason !== 'N/A' ? `<p><strong>Why it matters:</strong> ${escapeHtml(item.impact_reason)}</p>` : ''}
              ${item.url ? `<p><a href="${escapeHtml(item.url)}">Open original source</a></p>` : ''}
            </article>`
          )
          .join('')}
      </div>
    </section>
  `;
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
          <div><span>Company</span>${escapeHtml(report.company_name)}</div>
          <div><span>Exchange</span>${escapeHtml(report.exchange)}</div>
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

      ${
        report.key_reasons_paragraph
          ? `<section class="section">
        <h2>Key Reasons</h2>
        <p>${escapeHtml(report.key_reasons_paragraph)}</p>
      </section>`
          : ''
      }

      <section class="section">
        <h2>Final Recommendation</h2>
        <table><tbody>${renderRows(report.decision_rows)}</tbody></table>
        <h3>Action Plan</h3>
        ${
          report.show_trade_plan
            ? renderMetricGrid(report.action_plan_rows)
            : `<p class="muted">No actionable trade plan is available. Final decision: ${escapeHtml(report.final_decision)}.</p>${renderMetricGrid(report.status_action_rows)}`
        }
      </section>

      <section class="section">
        <h2>Confidence Breakdown</h2>
        <table><tbody>${renderRows(report.confidence_rows)}</tbody></table>
      </section>

      <section class="section">
        <h2>Volatility Metadata</h2>
        <table><tbody>${renderRows(report.volatility_rows)}</tbody></table>
      </section>

      ${
        report.agent_pipeline_rows.length
          ? `<section class="section"><h2>Agent Pipeline</h2><table><tbody>${renderRows(report.agent_pipeline_rows)}</tbody></table><p class="muted">Total pipeline time: ${escapeHtml(report.total_pipeline_seconds || 'N/A')}s</p></section>`
          : ''
      }

      ${
        report.data_source_rows.length
          ? `<section class="section"><h2>Data Sources</h2><table><tbody>${renderRows(report.data_source_rows)}</tbody></table></section>`
          : ''
      }

      <section class="section">
        <h2>Data Freshness</h2>
        <table><tbody>${renderRows(report.data_freshness_rows)}</tbody></table>
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

      ${renderTechnicalEntry(report.technical_entry_rows)}

      ${renderNewsImpact(report)}

      ${renderCatalystTracker(report)}

      ${renderAnalystConsensus(report.analyst_consensus_rows)}

      ${renderFullNewsList(report)}

      ${!report.full_news_items?.length ? renderRelatedNews(report.related_news, report.related_news_items) : ''}

      ${renderRiskDataQuality(report)}

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
