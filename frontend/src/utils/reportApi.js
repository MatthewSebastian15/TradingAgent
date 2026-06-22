import { buildApiUrl, buildAuthHeaders, buildHeaders, readHttpError } from './api';

export function reportHtmlUrl(resourceId) {
  return buildApiUrl(`/analysis/jobs/${encodeURIComponent(resourceId)}/report.html`);
}

export function reportPdfUrl(resourceId) {
  return buildApiUrl(`/analysis/jobs/${encodeURIComponent(resourceId)}/report.pdf`);
}

export function reportHtmlRequestUrl(requestId) {
  return buildApiUrl(`/analysis/${encodeURIComponent(requestId)}/report.html`);
}

export function reportPdfRequestUrl(requestId) {
  return buildApiUrl(`/analysis/${encodeURIComponent(requestId)}/report.pdf`);
}

function reportHtmlPayloadUrl() {
  return buildApiUrl('/analysis/report.html');
}

function reportPdfPayloadUrl() {
  return buildApiUrl('/analysis/report.pdf');
}

function isReportNotFound(errorMessage) {
  return /not found|expired|report_not_found/i.test(String(errorMessage || ''));
}

function requestIdFromResult(result) {
  return typeof result?.request_id === 'string' && result.request_id.trim()
    ? result.request_id.trim()
    : null;
}

function compactReportPayload(result) {
  if (!result || typeof result !== 'object') return null;

  const allowedKeys = [
    'request_id',
    'id',
    'ticker',
    'input_ticker',
    'normalized_ticker',
    'company_name',
    'exchange',
    'currency',
    'horizon',
    'created_at',
    'market',
    'trade_date',
    'analysis_created_at',
    'current_price',
    'last_close_price',
    'current_price_as_of',
    'last_close_price_as_of',
    'current_price_source',
    'last_price',
    'price_currency',
    'price_source',
    'price_timestamp',
    'price_is_fallback',
    'market_status',
    'raw_ai_signal',
    'display_signal',
    'signal_context',
    'confidence_label',
    'confidence_tier',
    'confidence_breakdown',
    'technical_levels',
    'agent_pipeline',
    'total_pipeline_seconds',
    'data_sources',
    'profile',
    'fundamentals',
    'chart_price',
    'news_items',
    'volatility_scale',
    'volatility_method',
    'volatility_lookback_days',
    'volatility_classification',
    'mini_risk_summary',
    'llm_decision',
    'final_decision',
    'decision',
    'decision_adjusted',
    'decision_adjusted_reason',
    'trade_plan_valid',
    'has_existing_position',
    'position_quantity',
    'average_entry_price',
    'entry_price',
    'stop_loss',
    'take_profit',
    'risk_reward_ratio',
    'risk_reward_display',
    'max_drawdown_estimate',
    'max_drawdown_min_pct',
    'max_drawdown_max_pct',
    'volatility_level',
    'volatility_score',
    'rebalancing_action',
    'position_action',
    'new_entry_action',
    'position_size_hint',
    'executive_summary',
    'investment_thesis',
    'analysis_overview',
    'key_reasons',
    'key_reasons_paragraph',
    'key_catalysts',
    'invalidation_conditions',
    'data_quality',
    'risk_data_quality',
    'analysis_params',
    'tab_status',
    'data_freshness',
    'validation_warnings',
    'validation_warning_details',
    'financial_highlights',
    'normalized_period_rows',
    'derived_fundamentals',
    'financial_trends',
    'valuation_multiples',
    'fair_value_range',
    'scenario_analysis',
    'quality_of_earnings',
    'balance_sheet_risk',
    'dividend_quality',
    'peer_comparison',
    'company_profile',
    'price_chart',
    'price_performance',
    'technical_entry',
    'related_news',
    'news_impact',
    'catalyst_tracker',
    'analyst_consensus',
    'market_report',
    'sentiment_report',
    'news_report',
    'fundamentals_report',
    'investment_plan',
    'trader_investment_plan',
    'final_trade_decision',
  ];

  return allowedKeys.reduce((payload, key) => {
    if (result[key] !== undefined) payload[key] = result[key];
    return payload;
  }, {});
}

async function fetchReportHtml(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...(await buildAuthHeaders()),
      Accept: 'text/html',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await readHttpError(response));
  }

  return response.text();
}

async function fetchReportHtmlByResourceId(resourceId) {
  return fetchReportHtml(reportHtmlUrl(resourceId));
}

async function fetchReportHtmlByRequestId(requestId) {
  return fetchReportHtml(reportHtmlRequestUrl(requestId));
}

async function fetchReportHtmlByPayload(result) {
  const payload = compactReportPayload(result);
  if (!payload) throw new Error('Report result payload is unavailable.');

  const response = await fetch(reportHtmlPayloadUrl(), {
    method: 'POST',
    headers: {
      ...(await buildHeaders()),
      Accept: 'text/html',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readHttpError(response));
  }

  return response.text();
}

function openHtmlBlob(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const previewWindow = window.open(url, '_blank', 'noopener,noreferrer');

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  if (!previewWindow) {
    throw new Error('Popup blocked. Allow popups for this site to preview the HTML report.');
  }
}

export async function openAnalysisHtmlReport({ resourceId, result }) {
  try {
    const html = await fetchReportHtmlByResourceId(resourceId);
    openHtmlBlob(html);
    return;
  } catch (error) {
    if (!isReportNotFound(error.message)) {
      throw error;
    }
  }

  const requestId = requestIdFromResult(result);
  if (requestId) {
    try {
      const html = await fetchReportHtmlByRequestId(requestId);
      openHtmlBlob(html);
      return;
    } catch (error) {
      if (!isReportNotFound(error.message)) {
        throw error;
      }
    }
  }

  if (!result) {
    throw new Error('Report result payload is unavailable.');
  }

  const html = await fetchReportHtmlByPayload(result);
  openHtmlBlob(html);
}

function filenameFromContentDisposition(headerValue) {
  if (!headerValue) return null;

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const asciiMatch = headerValue.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] || null;
}

function filenameSafePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function datePart(value) {
  const match = String(value || '').match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || '';
}

function reportPdfFilename(result) {
  if (!result || typeof result !== 'object') return null;

  const ticker = filenameSafePart(result.normalized_ticker || result.ticker || result.input_ticker);
  const analysisDate = datePart(
    result.trade_date || result.analysis_created_at || result.created_at || result.saved_at
  );
  return ticker && analysisDate ? `${ticker}_${analysisDate}.pdf` : null;
}

function normalizePdfFilename(filename) {
  const match = String(filename || '').match(
    /^(?:TradingAgent_)?([A-Za-z0-9_.-]+)_(\d{4}-\d{2}-\d{2})\.pdf$/i
  );
  return match ? `${match[1]}_${match[2]}.pdf` : filename;
}

async function fetchPdf(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...(await buildAuthHeaders()),
      Accept: 'application/pdf',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await readHttpError(response));
  }

  return response;
}

async function fetchPdfByResourceId(resourceId) {
  return fetchPdf(reportPdfUrl(resourceId));
}

async function fetchPdfByRequestId(requestId) {
  return fetchPdf(reportPdfRequestUrl(requestId));
}

async function fetchPdfByPayload(result) {
  const payload = compactReportPayload(result);
  if (!payload) throw new Error('Report result payload is unavailable.');

  const response = await fetch(reportPdfPayloadUrl(), {
    method: 'POST',
    headers: {
      ...(await buildHeaders()),
      Accept: 'application/pdf',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readHttpError(response));
  }

  return response;
}

async function downloadPdfResponse(response, fallbackFilename, preferredFilename = null) {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const dispositionFilename = filenameFromContentDisposition(
    response.headers.get('Content-Disposition')
  );
  const filename =
    preferredFilename || normalizePdfFilename(dispositionFilename) || fallbackFilename;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadAnalysisPdf(resourceId, options = {}) {
  const preferredFilename = reportPdfFilename(options.result);
  const fallbackFilename = preferredFilename || `TradingAgent_${resourceId}.pdf`;

  try {
    const response = await fetchPdfByResourceId(resourceId);
    await downloadPdfResponse(response, fallbackFilename, preferredFilename);
    return;
  } catch (error) {
    if (!isReportNotFound(error.message)) {
      throw error;
    }
  }

  const requestId = requestIdFromResult(options.result);
  if (requestId) {
    try {
      const response = await fetchPdfByRequestId(requestId);
      await downloadPdfResponse(
        response,
        preferredFilename || `TradingAgent_${requestId}.pdf`,
        preferredFilename
      );
      return;
    } catch (error) {
      if (!isReportNotFound(error.message)) {
        throw error;
      }
    }
  }

  if (!options.result) {
    throw new Error('Report result payload is unavailable.');
  }

  const response = await fetchPdfByPayload(options.result);
  await downloadPdfResponse(response, fallbackFilename, preferredFilename);
}
