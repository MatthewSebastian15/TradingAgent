export const DATA_STATUS_LABELS = {
  available: 'Available',
  calculated: 'Calculated',
  not_applicable: 'Not applicable',
  no_history: 'No history',
  source_unavailable: 'Source unavailable',
  unavailable: 'Source unavailable',
  stale: 'Stale',
  conflict: 'Conflict',
  partial: 'Partial',
  complete: 'Available',
  ok: 'Available',
  missing: 'Source unavailable',
  unknown: 'Unknown',
};

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
  if (['source_unavailable', 'unavailable', 'missing'].includes(normalized)) return 'error';
  if (normalized === 'not_applicable' || normalized === 'no_history') return 'neutral';
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
  const status = payload.status || payload.freshness_status || payload.completeness || 'unknown';
  return {
    status,
    label: getDataStatusLabel(status),
    source: payload.source || payload.primary || payload.method || payload.vendor || null,
    reason: payload.reason || payload.warning || payload.summary || null,
    confidenceScore: payload.confidence_score ?? payload.score ?? payload.confidence ?? null,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
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
