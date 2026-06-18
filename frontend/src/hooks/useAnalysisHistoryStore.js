const HISTORY_SCHEMA_VERSION = 2;
const HISTORY_TTL_DAYS = 30;

function isExpired(entry) {
  if (!entry?.saved_at) return false;
  const ageMs = Date.now() - new Date(entry.saved_at).getTime();
  return ageMs > HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function isSupportedHistoryEntry(entry) {
  return entry && !isExpired(entry);
}

function legacyResultStoragePrefix(historyKey) {
  return `${historyKey}:result:`;
}

function removeLegacyStoredResults(historyKey) {
  try {
    const prefix = legacyResultStoragePrefix(historyKey);
    const keys = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }

    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore unavailable or restricted localStorage during cleanup.
  }
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeHistoryConfidence(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function confidenceScoreStyle(tier) {
  return (
    {
      very_low: 'text-bloomberg-red',
      low: 'text-bloomberg-amber',
      moderate: 'text-bloomberg-orange',
      high: 'text-lime-300',
      very_high: 'text-bloomberg-green',
    }[tier] || 'text-bloomberg-muted'
  );
}

export function historyResourceId(entry) {
  return textOrNull(entry?.request_id) || textOrNull(entry?.job_id);
}

function isSameHistoryEntry(left, right) {
  return Boolean(
    (left?.job_id && right?.job_id && left.job_id === right.job_id) ||
    (left?.request_id && right?.request_id && left.request_id === right.request_id)
  );
}

function toHistorySummary(entry) {
  if (!isSupportedHistoryEntry(entry) || !historyResourceId(entry)) return null;

  const horizon = Number(entry.time_horizon_months);

  return {
    schema_version: HISTORY_SCHEMA_VERSION,
    job_id: textOrNull(entry.job_id),
    request_id: textOrNull(entry.request_id),
    ticker: textOrNull(entry.normalized_ticker) || textOrNull(entry.ticker),
    market: textOrNull(entry.market),
    trade_date: textOrNull(entry.trade_date),
    status: textOrNull(entry.status) || 'completed',
    decision: textOrNull(entry.decision),
    display_signal:
      textOrNull(entry.display_signal) ||
      textOrNull(entry.final_decision) ||
      textOrNull(entry.decision),
    confidence_score: normalizeHistoryConfidence(entry.confidence_score),
    confidence_tier: textOrNull(entry.confidence_tier),
    time_horizon_months: [1, 2, 3].includes(horizon) ? horizon : null,
    analysis_created_at: textOrNull(entry.analysis_created_at),
    saved_at: textOrNull(entry.saved_at) || new Date().toISOString(),
  };
}

export function readHistory(historyKey) {
  try {
    removeLegacyStoredResults(historyKey);
    const raw = localStorage.getItem(historyKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(historyKey);
      return [];
    }

    const clean = parsed.map(toHistorySummary).filter(Boolean);
    if (JSON.stringify(clean) !== JSON.stringify(parsed)) {
      localStorage.setItem(historyKey, JSON.stringify(clean));
    }

    return clean;
  } catch {
    try {
      localStorage.removeItem(historyKey);
    } catch {
      // Ignore unavailable or restricted localStorage during recovery.
    }
    return [];
  }
}

export function writeHistory(historyKey, entries) {
  try {
    const clean = entries.map(toHistorySummary).filter(Boolean);
    if (clean.length) {
      localStorage.setItem(historyKey, JSON.stringify(clean));
    } else {
      localStorage.removeItem(historyKey);
    }
  } catch {
    // Ignore unavailable or restricted localStorage during history writes.
  }
}

export function clearHistory(historyKey) {
  try {
    removeLegacyStoredResults(historyKey);
    localStorage.removeItem(historyKey);
  } catch {
    // Ignore unavailable or restricted localStorage during history clears.
  }
}

export function withAnalysisCreatedAt(result) {
  if (!result || result.error || result.analysis_created_at) return result;
  return { ...result, analysis_created_at: new Date().toISOString() };
}

export function saveToHistory(historyKey, result) {
  if (!result || result.error) return;

  const summary = toHistorySummary({
    ...result,
    saved_at: result.saved_at || new Date().toISOString(),
  });
  if (!summary) return;

  const history = readHistory(historyKey);
  const deduped = history.filter((item) => !isSameHistoryEntry(item, summary));
  writeHistory(historyKey, [summary, ...deduped]);
}

export function normalizeBackendHistory(entries) {
  return entries
    .map((entry) =>
      toHistorySummary({
        ...entry,
        analysis_created_at: entry.analysis_created_at || entry.created_at,
        saved_at: entry.updated_at || entry.created_at,
      })
    )
    .filter(Boolean);
}

export function decisionStyle(decision) {
  const normalized = String(decision || '')
    .trim()
    .toUpperCase();
  if (normalized === 'BUY' || normalized === 'OVERWEIGHT')
    return 'text-bloomberg-green border-bloomberg-green';
  if (normalized === 'SELL' || normalized === 'UNDERWEIGHT')
    return 'text-bloomberg-red border-bloomberg-red';
  if (normalized === 'WAIT') return 'text-bloomberg-muted border-bloomberg-border';
  if (normalized === 'REDUCE') return 'text-bloomberg-amber border-bloomberg-amber';
  return 'text-bloomberg-orange border-bloomberg-orange';
}

export function formatHistoryHorizon(months) {
  const value = Number(months);
  if (![1, 2, 3].includes(value)) return null;
  return `${value}M`;
}
