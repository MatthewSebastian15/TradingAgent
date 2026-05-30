import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams } from 'react-router-dom';
import AgentLog from './AgentLog';
import Navbar from './Navbar';
import ResultCard from './ResultCard';
import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';
import { formatDateTimeLabel, formatPrice } from '../utils/formatting';

const HISTORY_PANEL_MAX_HEIGHT = 560;
const HISTORY_TTL_DAYS = 30;
const RESULT_EXPIRED_MESSAGE = 'Result expired, submit ulang';

const SUPPORTED_HISTORY_MARKETS = new Set(['US', 'ID']);
const GLOBAL_EXCHANGE_SUFFIX_RE = /\.(?!JK$)[A-Z0-9]{1,5}$/i;

function isExpired(entry) {
  if (!entry?.saved_at) return false;
  const ageMs = Date.now() - new Date(entry.saved_at).getTime();
  return ageMs > HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function isGlobalHistoryEntry(entry) {
  if (!entry) return false;
  const market = String(entry.market || '').toUpperCase();
  const ticker = String(entry.ticker || '').toUpperCase();

  if (market === 'GLOBAL') return true;
  if (market && !SUPPORTED_HISTORY_MARKETS.has(market)) return true;

  return GLOBAL_EXCHANGE_SUFFIX_RE.test(ticker);
}

function isSupportedHistoryEntry(entry) {
  return entry && !isExpired(entry) && !isGlobalHistoryEntry(entry);
}

function resultStorageKey(historyKey, requestId) {
  return `${historyKey}:result:${requestId}`;
}

function removeStoredResult(historyKey, entry) {
  if (!entry?.request_id) return;
  try {
    localStorage.removeItem(resultStorageKey(historyKey, entry.request_id));
  } catch {
    // Storage can be unavailable in private browsing or when quota is exceeded.
  }
}

function readHistory(historyKey) {
  try {
    const raw = localStorage.getItem(historyKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const clean = parsed.filter(isSupportedHistoryEntry);
    const removed = parsed.filter((entry) => entry && !isSupportedHistoryEntry(entry));

    removed.forEach((entry) => removeStoredResult(historyKey, entry));
    if (clean.length !== parsed.length) {
      localStorage.setItem(historyKey, JSON.stringify(clean));
    }

    return clean;
  } catch {
    return [];
  }
}

function writeHistory(historyKey, entries) {
  try {
    const clean = entries.filter(isSupportedHistoryEntry);
    localStorage.setItem(historyKey, JSON.stringify(clean));
  } catch {
    // Storage can be unavailable in private browsing or when quota is exceeded.
  }
}

function readStoredResult(historyKey, requestId) {
  if (!requestId) return null;

  try {
    const raw = localStorage.getItem(resultStorageKey(historyKey, requestId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && isSupportedHistoryEntry(parsed)) return parsed;
      localStorage.removeItem(resultStorageKey(historyKey, requestId));
    }
  } catch {
    // Fall through to the history array for older saved results.
  }

  return readHistory(historyKey).find((entry) => entry?.request_id === requestId) || null;
}

function writeStoredResult(historyKey, entry) {
  if (!entry?.request_id) return;
  try {
    localStorage.setItem(resultStorageKey(historyKey, entry.request_id), JSON.stringify(entry));
  } catch {
    // Storage can be unavailable in private browsing or when quota is exceeded.
  }
}

function withAnalysisCreatedAt(result) {
  if (!result || result.error || result.analysis_created_at) return result;
  return { ...result, analysis_created_at: new Date().toISOString() };
}

function saveToHistory(historyKey, result) {
  if (!result || result.error || !result.request_id || !isSupportedHistoryEntry(result)) return;

  const storedResult = { ...result, saved_at: result.saved_at || new Date().toISOString() };
  const history = readHistory(historyKey);
  const deduped = history.filter((item) => item.request_id !== storedResult.request_id);
  writeStoredResult(historyKey, storedResult);
  writeHistory(historyKey, [storedResult, ...deduped]);
}

function decisionStyle(decision) {
  if (decision === 'Buy' || decision === 'Overweight')
    return 'text-bloomberg-green border-bloomberg-green';
  if (decision === 'Sell' || decision === 'Underweight')
    return 'text-bloomberg-red border-bloomberg-red';
  return 'text-bloomberg-amber border-bloomberg-amber';
}

function formatHistoryHorizon(months) {
  const value = Number(months);
  if (![1, 2, 3].includes(value)) return null;
  return `${value}M`;
}

function HistoryPanel({ currentTicker, historyKey, onSelect }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(readHistory(historyKey));
  }, [historyKey, currentTicker]);

  if (!history.length) return null;

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card min-w-0">
      <div className="px-4 py-2.5 border-b border-bloomberg-border flex items-center justify-between bg-black">
        <span className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
          RECENT ANALYSES
        </span>
        <span className="font-mono text-xs text-bloomberg-muted">{history.length}</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: HISTORY_PANEL_MAX_HEIGHT }}>
        {history.map((item, index) => {
          const createdAtLabel = formatDateTimeLabel(item.analysis_created_at || item.saved_at);
          return (
            <button
              key={item.request_id || `${item.ticker || 'item'}-${item.trade_date || index}`}
              onClick={() => onSelect(item)}
              className="w-full flex flex-col gap-3 px-4 py-3 border-b border-bloomberg-border last:border-b-0 hover:bg-bloomberg-surface transition-colors duration-150 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold text-bloomberg-white">
                  {item.ticker || 'N/A'}
                </div>
                <div className="font-mono text-xs text-bloomberg-muted">
                  {item.trade_date}
                  {formatHistoryHorizon(item.time_horizon_months)
                    ? ` / ${formatHistoryHorizon(item.time_horizon_months)}`
                    : ''}
                </div>
                {createdAtLabel && (
                  <div className="mt-1 font-mono text-[10px] text-bloomberg-muted tracking-wider uppercase">
                    CREATED: {createdAtLabel}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 self-stretch justify-between sm:self-auto sm:justify-end">
                {item.price_target && (
                  <span className="font-mono text-xs text-bloomberg-muted">
                    {formatPrice(item.price_target, item.ticker)}
                  </span>
                )}
                <span
                  className={`font-mono text-xs border px-2.5 py-1 tracking-wider font-semibold ${decisionStyle(item.decision)}`}
                >
                  {(item.decision || 'N/A').toUpperCase()}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

HistoryPanel.propTypes = {
  currentTicker: PropTypes.string,
  historyKey: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

function StatusBar({ loading, status }) {
  if (!loading) return null;
  return (
    <div className="border-t border-bloomberg-border px-4 py-2 bg-black flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-bloomberg-orange animate-pulse-dot flex-shrink-0" />
      <span className="font-mono text-xs text-bloomberg-orange tracking-wider truncate">
        {status || 'RUNNING...'}
      </span>
    </div>
  );
}

StatusBar.propTypes = {
  loading: PropTypes.bool.isRequired,
  status: PropTypes.string,
};

function unwrapJobLookupPayload(payload) {
  if (!payload) return null;
  if (payload.result) return payload.result;
  if (payload.error) {
    const errorPayload = payload.error.error || payload.error.message || payload.error;
    const message = typeof errorPayload === 'string' ? errorPayload : errorPayload.message;
    return {
      request_id: payload.request_id,
      error: message || 'Analysis failed.',
    };
  }
  if (payload.status && payload.status !== 'completed') {
    return {
      request_id: payload.request_id,
      error: `Analysis result is ${payload.status}.`,
    };
  }
  return payload.request_id ? payload : null;
}

async function readLookupError(response) {
  const message = await readHttpError(response);
  if (response.status === 404 || /not found/i.test(message)) return RESULT_EXPIRED_MESSAGE;
  return message;
}

function resultPath(basePath, requestId) {
  if (!basePath || !requestId) return null;
  return `${basePath.replace(/\/+$/, '')}/${encodeURIComponent(requestId)}`;
}

export default function AnalysisWorkspace({
  FormComponent,
  historyKey,
  emptyDescription,
  resultPathBase = '/analysis',
  lookupResult = null,
  enableReportExport = true,
  lookupResultFirst = false,
  mockReportExport = false,
}) {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const shouldLookupBeforeStorage = Boolean(requestId && lookupResult && lookupResultFirst);
  const initialResult = shouldLookupBeforeStorage ? null : readStoredResult(historyKey, requestId);
  const [result, setResult] = useState(initialResult);
  const [loading, setLoading] = useState(Boolean(requestId && !initialResult));
  const [status, setStatus] = useState(
    requestId && !initialResult ? 'Loading saved analysis...' : ''
  );
  const [agentProgress, setAgentProgress] = useState(null);

  useEffect(() => {
    if (!requestId) return undefined;

    if (!lookupResultFirst) {
      const stored = readStoredResult(historyKey, requestId);
      if (stored) {
        setResult(stored);
        setLoading(false);
        setStatus('');
        setAgentProgress(null);
        return undefined;
      }
    }

    if (lookupResult) {
      let cancelled = false;

      async function loadMockResult() {
        setLoading(true);
        setStatus('Loading saved analysis...');
        setAgentProgress(null);

        try {
          const loadedResult = await lookupResult(requestId);

          if (!loadedResult && lookupResultFirst) {
            const storedFallback = readStoredResult(historyKey, requestId);
            if (storedFallback) {
              if (!cancelled) setResult(storedFallback);
              return;
            }
          }

          if (!loadedResult) throw new Error(RESULT_EXPIRED_MESSAGE);

          const enrichedResult = withAnalysisCreatedAt(loadedResult);
          if (cancelled) return;
          setResult(enrichedResult);
          saveToHistory(historyKey, enrichedResult);
        } catch (error) {
          if (!cancelled) setResult({ error: error.message || RESULT_EXPIRED_MESSAGE });
        } finally {
          if (!cancelled) {
            setLoading(false);
            setStatus('');
          }
        }
      }

      loadMockResult();
      return () => {
        cancelled = true;
      };
    }

    const stored = readStoredResult(historyKey, requestId);
    if (stored) {
      setResult(stored);
      setLoading(false);
      setStatus('');
      setAgentProgress(null);
      return undefined;
    }

    const controller = new AbortController();

    async function loadResult() {
      setLoading(true);
      setStatus('Loading saved analysis...');
      setAgentProgress(null);

      try {
        const response = await fetch(
          buildApiUrl(`/analysis/jobs/${encodeURIComponent(requestId)}`),
          {
            method: 'GET',
            headers: buildAuthHeaders(),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(await readLookupError(response));
        }

        const payload = await response.json();
        const loadedResult = unwrapJobLookupPayload(payload);
        if (!loadedResult || loadedResult.error === 'Analysis result is queued.') {
          throw new Error(RESULT_EXPIRED_MESSAGE);
        }

        const enrichedResult = withAnalysisCreatedAt(loadedResult);
        setResult(enrichedResult);
        saveToHistory(historyKey, enrichedResult);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setResult({ error: error.message || RESULT_EXPIRED_MESSAGE });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setStatus('');
        }
      }
    }

    loadResult();
    return () => controller.abort();
  }, [historyKey, lookupResult, lookupResultFirst, requestId]);

  function handleResult(nextResult) {
    if (!nextResult) {
      setResult(null);
      if (resultPathBase) navigate(resultPathBase, { replace: true });
      return;
    }

    const enrichedResult = withAnalysisCreatedAt(nextResult);
    setResult(enrichedResult);
    saveToHistory(historyKey, enrichedResult);

    const nextPath = resultPath(resultPathBase, enrichedResult?.request_id);
    if (nextPath) navigate(nextPath);
  }

  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />

      <div className="flex flex-col lg:flex-row" style={{ minHeight: 'calc(100vh - 68px)' }}>
        <div className="w-full flex-shrink-0 border-b border-bloomberg-border flex flex-col lg:w-80 lg:border-b-0 lg:border-r">
          <div className="flex-1">
            <div className="border-b border-bloomberg-border bg-bloomberg-card">
              <FormComponent
                onResult={handleResult}
                onLoading={setLoading}
                onStatus={setStatus}
                onAgentProgress={setAgentProgress}
                selectedResult={result && !result.error ? result : null}
              />
            </div>

            <div className="p-4">
              <HistoryPanel
                currentTicker={result?.ticker}
                historyKey={historyKey}
                onSelect={(item) => {
                  setResult(item);
                  setLoading(false);
                  const nextPath = resultPath(resultPathBase, item?.request_id);
                  if (nextPath) navigate(nextPath);
                }}
              />
            </div>
          </div>

          <StatusBar loading={loading} status={status} />
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto">
          {!loading && !result && (
            <div className="flex flex-col items-center justify-center min-h-[480px] p-4 text-center sm:p-8 lg:h-full">
              <div className="font-display text-4xl font-bold text-bloomberg-border tracking-widest mb-4 sm:text-6xl">
                READY
              </div>
              <div className="font-mono text-sm text-bloomberg-muted tracking-wider max-w-xs">
                {emptyDescription}
              </div>
              <div className="mt-8 grid grid-cols-1 gap-3 w-full max-w-md sm:grid-cols-3 sm:gap-4">
                {['MARKET DATA', 'AI DEBATE', 'DECISION'].map((step, index) => (
                  <div key={step} className="border border-bloomberg-border p-3 text-center">
                    <div className="font-mono text-2xl text-bloomberg-border mb-2">{index + 1}</div>
                    <div className="font-mono text-xs text-bloomberg-muted tracking-wider">
                      {step}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="p-4 sm:p-6">
              <AgentLog status={status} agentProgress={agentProgress} />
            </div>
          )}

          {result && !loading && (
            <div className="p-4 sm:p-6">
              <ResultCard
                result={result}
                enableReportExport={enableReportExport && Boolean(resultPathBase)}
                mockReport={mockReportExport}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


AnalysisWorkspace.propTypes = {
  FormComponent: PropTypes.elementType.isRequired,
  historyKey: PropTypes.string.isRequired,
  emptyDescription: PropTypes.string.isRequired,
  resultPathBase: PropTypes.string,
  lookupResult: PropTypes.func,
  enableReportExport: PropTypes.bool,
  lookupResultFirst: PropTypes.bool,
  mockReportExport: PropTypes.bool,
};
