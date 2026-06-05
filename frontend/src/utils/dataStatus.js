export const DATA_STATUS_LABELS = {
  available: 'Available',
  calculated: 'Calculated',
  not_applicable: 'Not applicable',
  no_history: 'No history',
  no_dividend_history: 'No dividend history',
  not_applicable_negative_earnings: 'Not applicable: negative earnings',
  source_unavailable: 'Source unavailable',
  unavailable: 'Source unavailable',
  stale: 'Stale',
  conflict: 'Conflict',
  partial: 'Partial',
  complete: 'Available',
  ok: 'Available',
  missing: 'Source unavailable',
  empty: 'Empty',
  failed: 'Failed',
  skipped: 'Skipped',
  unknown: 'Unknown',
};

export const SOURCE_LABELS = {
  idx_official: 'IDX Official',
  yfinance: 'Yahoo Finance',
  alpha_vantage: 'Alpha Vantage',
  finnhub: 'Finnhub',
  marketaux: 'Marketaux',
  newsdata: 'NewsData',
  normalized_financial_rows: 'Normalized financial rows',
  local_calculation_from_normalized_financials: 'Local calculation',
  local_calculation_from_historical_price: 'Local historical price calculation',
  configured_ohlcv: 'Configured OHLCV',
};

export function readableSource(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.toLowerCase();
  if (SOURCE_LABELS[normalized]) return SOURCE_LABELS[normalized];
  const match = Object.keys(SOURCE_LABELS).find((key) => normalized.includes(key));
  if (match) return SOURCE_LABELS[match];
  return text.replaceAll('_', ' ');
}

export function formatSourceLabel(source) {
  return readableSource(source) || 'Unknown source';
}

export function getFieldQuality(dataQuality, fieldName) {
  if (!dataQuality || typeof dataQuality !== 'object') return null;
  return dataQuality.field_quality?.[fieldName] || dataQuality[fieldName] || null;
}

export function getDataStatusLabel(status) {
  const normalized = String(status || 'unknown').toLowerCase();
  return DATA_STATUS_LABELS[normalized] || 'Unknown';
}

export function getDataStatusTone(status, confidenceScore) {
  const normalized = String(status || 'unknown').toLowerCase();
  const score = Number(confidenceScore);
  if (normalized === 'available' || normalized === 'complete' || normalized === 'ok') {
    return Number.isFinite(score) && score < 60 ? 'warning' : 'ok';
  }
  if (normalized === 'calculated') return Number.isFinite(score) && score < 60 ? 'warning' : 'info';
  if (['conflict', 'stale', 'partial'].includes(normalized)) return 'warning';
  if (['source_unavailable', 'unavailable', 'missing', 'failed'].includes(normalized)) return 'error';
  if (['not_applicable', 'no_history', 'no_dividend_history', 'not_applicable_negative_earnings', 'empty', 'skipped'].includes(normalized)) return 'neutral';
  return 'neutral';
}

export function getDataStatusClasses(status, confidenceScore) {
  const tone = getDataStatusTone(status, confidenceScore);
  if (tone === 'ok') return 'border-bloomberg-green bg-bloomberg-green-dim text-bloomberg-green';
  if (tone === 'error') return 'border-bloomberg-red bg-bloomberg-red-dim text-bloomberg-red';
  if (tone === 'warning') return 'border-bloomberg-amber bg-bloomberg-amber-dim text-bloomberg-amber';
  if (tone === 'info') return 'border-bloomberg-border bg-bloomberg-surface text-bloomberg-orange';
  return 'border-bloomberg-border bg-bloomberg-surface text-bloomberg-muted';
}

export function normalizeQualityPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const freshnessPayload =
    payload.freshness_status && typeof payload.freshness_status === 'object'
      ? payload.freshness_status
      : payload.freshness && typeof payload.freshness === 'object'
        ? payload.freshness
        : null;
  const freshnessStatus =
    freshnessPayload?.status ||
    (typeof payload.freshness_status === 'string' ? payload.freshness_status : null);
  const status = payload.status || freshnessStatus || payload.completeness || 'unknown';
  const warnings = [
    ...(Array.isArray(payload.warnings) ? payload.warnings : []),
    ...(Array.isArray(freshnessPayload?.warnings) ? freshnessPayload.warnings : []),
  ];
  return {
    status,
    label: getDataStatusLabel(status),
    source: payload.source || payload.primary || payload.method || payload.vendor || null,
    reason: payload.reason || payload.warning || payload.summary || null,
    confidenceScore: payload.confidence_score ?? payload.confidenceScore ?? payload.score ?? payload.confidence ?? null,
    warnings: [...new Set(warnings)],
    freshnessStatus: freshnessPayload,
  };
}

export function normalizeSources(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') return value ? [value] : [];
  if (typeof value === 'object') {
    const sources = value.sources || value.providers || value.providers_used;
    if (Array.isArray(sources)) return sources.filter(Boolean).map(String);
    return [value.primary, value.source, value.vendor].filter(Boolean).map(String);
  }
  return [];
}


export function getDisplayValue(value, quality) {
  const isGenericUnavailable = typeof value === 'string' && value.trim().toUpperCase() === 'N/A';
  if (value !== null && value !== undefined && value !== '' && !(quality && isGenericUnavailable)) {
    return { text: value, muted: false, reason: null };
  }

  if (quality?.reason) {
    return { text: getDataStatusLabel(quality.status), reason: quality.reason, muted: true };
  }

  if (quality?.status) {
    return { text: getDataStatusLabel(quality.status), reason: null, muted: true };
  }

  return { text: 'N/A', reason: null, muted: true };
}
