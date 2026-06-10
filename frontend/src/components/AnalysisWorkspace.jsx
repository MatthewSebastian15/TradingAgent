import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams } from 'react-router-dom';
import { useAnalysisJob } from '../hooks/useAnalysisJob';
import AgentLog from './AgentLog';
import Navbar from './Navbar';
import ResultCard from './ResultCard';
import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';
import { clearAnalysisHistory, fetchAnalysisHistory } from '../utils/analysisHistoryApi';
import { formatDateTimeLabel } from '../utils/formatting';

const HISTORY_SCHEMA_VERSION = 2;
const HISTORY_TTL_DAYS = 30;
const RESULT_EXPIRED_MESSAGE = 'Result expired. Please submit a new analysis.';

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

function confidenceScoreStyle(tier) {
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

function historyResourceId(entry) {
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

function readHistory(historyKey) {
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

function writeHistory(historyKey, entries) {
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

function clearHistory(historyKey) {
  try {
    removeLegacyStoredResults(historyKey);
    localStorage.removeItem(historyKey);
  } catch {
    // Ignore unavailable or restricted localStorage during history clears.
  }
}

function withAnalysisCreatedAt(result) {
  if (!result || result.error || result.analysis_created_at) return result;
  return { ...result, analysis_created_at: new Date().toISOString() };
}

function saveToHistory(historyKey, result) {
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

function normalizeBackendHistory(entries) {
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

function decisionStyle(decision) {
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

function formatHistoryHorizon(months) {
  const value = Number(months);
  if (![1, 2, 3].includes(value)) return null;
  return `${value}M`;
}

function ConfigIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <path d="M14 5v4" />
      <path d="M10 15v4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PanelButton({ active, title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center border-l-2 transition-colors duration-150 ${
        active
          ? 'border-bloomberg-orange bg-bloomberg-surface text-bloomberg-orange'
          : 'border-transparent text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white'
      }`}
    >
      {children}
    </button>
  );
}

PanelButton.propTypes = {
  active: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

function DrawerPanel({ title, onClose, children }) {
  return (
    <aside className="fixed bottom-0 left-10 top-10 z-[35] flex w-72 flex-col border-r border-bloomberg-border bg-bloomberg-card shadow-2xl shadow-black/50">
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-bloomberg-border px-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bloomberg-orange">
          {title}
        </span>
        <button
          type="button"
          aria-label={`Close ${title.toLowerCase()} panel`}
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center font-mono text-lg leading-none text-bloomberg-muted transition-colors duration-150 hover:bg-bloomberg-surface hover:text-bloomberg-orange"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

DrawerPanel.propTypes = {
  title: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

function HistoryPanel({ backendHistoryEnabled, currentResourceId, historyKey, onSelect }) {
  const [history, setHistory] = useState([]);
  const [clearError, setClearError] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!backendHistoryEnabled) {
      setHistory(readHistory(historyKey));
      return undefined;
    }

    const controller = new AbortController();

    async function loadHistory() {
      try {
        const items = normalizeBackendHistory(
          await fetchAnalysisHistory({ limit: 25, signal: controller.signal })
        );
        if (controller.signal.aborted) return;
        writeHistory(historyKey, items);
        setHistory(items);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setHistory(readHistory(historyKey));
      }
    }

    loadHistory();
    return () => controller.abort();
  }, [backendHistoryEnabled, historyKey, currentResourceId]);

  async function handleClearHistory() {
    if (clearing) return;
    setClearError('');
    setClearing(true);
    try {
      if (backendHistoryEnabled) await clearAnalysisHistory();
      clearHistory(historyKey);
      setHistory([]);
    } catch (error) {
      setClearError(error.message || 'Failed to clear analysis history.');
    } finally {
      setClearing(false);
    }
  }

  if (!history.length) return null;

  return (
    <>
      <div className="flex items-center justify-between border-b border-bloomberg-border px-3 py-2">
        <span className="font-mono text-[10px] text-bloomberg-orange tracking-[0.2em] uppercase">
          RECENT
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-bloomberg-muted">
            {history.length}
          </span>
          <button
            type="button"
            disabled={clearing}
            onClick={handleClearHistory}
            className="font-mono text-[9px] text-bloomberg-muted tracking-wider transition-colors duration-150 hover:text-bloomberg-orange disabled:opacity-40"
          >
            {clearing ? 'CLEARING...' : 'CLEAR'}
          </button>
        </div>
      </div>
      {clearError && (
        <div className="border-b border-bloomberg-border px-3 py-1.5 font-mono text-[9px] text-bloomberg-red">
          {clearError}
        </div>
      )}
      <div className="overflow-y-auto">
        {history.map((item, index) => {
          const createdAtLabel = formatDateTimeLabel(item.analysis_created_at || item.saved_at);
          const displaySignal = item.display_signal || item.decision;
          const confidenceScore =
            item.confidence_score !== null && item.confidence_score !== undefined
              ? `${item.confidence_score}%`
              : '—';
          return (
            <button
              key={
                historyResourceId(item) || `${item.ticker || 'item'}-${item.trade_date || index}`
              }
              onClick={() => onSelect(item)}
              className="w-full border-b border-bloomberg-border px-3 py-2 text-left transition-colors duration-150 hover:bg-bloomberg-surface"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] font-semibold text-bloomberg-white">
                  {item.ticker || 'N/A'}
                </span>
                <span
                  className={`flex-shrink-0 border px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wider ${decisionStyle(displaySignal)}`}
                >
                  {(displaySignal || 'N/A').toUpperCase()}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 font-mono text-[9px] text-bloomberg-muted">
                <span>{item.trade_date || '—'}</span>
                <span>{formatHistoryHorizon(item.time_horizon_months) || '—'}</span>
                <span className={confidenceScoreStyle(item.confidence_tier)}>
                  {confidenceScore}
                </span>
              </div>
              {createdAtLabel && (
                <div className="mt-0.5 font-mono text-[8px] text-bloomberg-border truncate">
                  {createdAtLabel}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

HistoryPanel.propTypes = {
  backendHistoryEnabled: PropTypes.bool.isRequired,
  currentResourceId: PropTypes.string,
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
  if (payload.result) return { job_id: payload.job_id, ...payload.result };
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

function resultPath(basePath, resourceId) {
  if (!basePath || !resourceId) return null;
  return `${basePath.replace(/\/+$/, '')}/${encodeURIComponent(resourceId)}`;
}

async function fetchResultLookup(resourceId, signal) {
  const headers = await buildAuthHeaders();
  const options = {
    method: 'GET',
    headers,
    signal,
  };
  const encodedResourceId = encodeURIComponent(resourceId);
  const canonicalResponse = await fetch(
    buildApiUrl(`/analysis/jobs/${encodedResourceId}`),
    options
  );

  if (canonicalResponse.ok || ![400, 404].includes(canonicalResponse.status)) {
    return canonicalResponse;
  }

  const aliasResponse = await fetch(buildApiUrl(`/analysis/${encodedResourceId}`), options);
  if (aliasResponse.ok || ![400, 404].includes(aliasResponse.status)) {
    return aliasResponse;
  }

  return fetch(buildApiUrl(`/analysis/history/${encodedResourceId}`), options);
}

export default function AnalysisWorkspace({
  FormComponent,
  historyKey,
  emptyDescription,
  resultPathBase = '/analysis',
  lookupResult = null,
  backendHistoryEnabled = true,
  enableReportExport = true,
  mockReportExport = false,
}) {
  const navigate = useNavigate();
  const { resourceId } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(Boolean(resourceId));
  const [status, setStatus] = useState(resourceId ? 'Loading saved analysis...' : '');
  const [agentProgress, setAgentProgress] = useState(null);
  const [activePanel, setActivePanel] = useState(null);

  function togglePanel(name) {
    setActivePanel((prev) => (prev === name ? null : name));
  }

  useEffect(() => {
    if (!resourceId) return undefined;

    if (lookupResult) {
      let cancelled = false;

      async function loadLookupResult() {
        setResult(null);
        setLoading(true);
        setStatus('Loading saved analysis...');
        setAgentProgress(null);

        try {
          const loadedResult = await lookupResult(resourceId);
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

      loadLookupResult();
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();

    async function loadResult() {
      setResult(null);
      setLoading(true);
      setStatus('Loading saved analysis...');
      setAgentProgress(null);

      try {
        const response = await fetchResultLookup(resourceId, controller.signal);

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
  }, [historyKey, lookupResult, resourceId]);

  function handleResult(nextResult) {
    if (!nextResult) {
      setResult(null);
      if (resultPathBase) navigate(resultPathBase, { replace: true });
      return;
    }

    const enrichedResult = withAnalysisCreatedAt(nextResult);
    setResult(enrichedResult);
    saveToHistory(historyKey, enrichedResult);

    const nextPath = resultPath(
      resultPathBase,
      enrichedResult?.job_id || enrichedResult?.request_id
    );
    if (nextPath) navigate(nextPath);
  }

  const rerunJob = useAnalysisJob({
    onResult: handleResult,
    onLoading: setLoading,
    onStatus: setStatus,
    onAgentProgress: setAgentProgress,
  });

  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />

      {activePanel && (
        <div
          className="fixed inset-0 z-[25] bg-black/30"
          onClick={() => setActivePanel(null)}
        />
      )}

      <div className="fixed bottom-0 left-0 top-10 z-[45] w-10 border-bloomberg-border border-r bg-black">
        <PanelButton
          active={activePanel === 'config'}
          title="Configuration"
          onClick={() => togglePanel('config')}
        >
          <ConfigIcon />
        </PanelButton>
        <PanelButton
          active={activePanel === 'history'}
          title="History"
          onClick={() => togglePanel('history')}
        >
          <ClockIcon />
        </PanelButton>
      </div>

      {activePanel === 'config' && (
        <DrawerPanel title="CONFIGURATION" onClose={() => setActivePanel(null)}>
          <FormComponent
            onResult={handleResult}
            onLoading={setLoading}
            onStatus={setStatus}
            onAgentProgress={setAgentProgress}
            selectedResult={result && !result.error ? result : null}
            agentProgress={agentProgress}
            status={status}
          />
        </DrawerPanel>
      )}

      {activePanel === 'history' && (
        <DrawerPanel title="HISTORY" onClose={() => setActivePanel(null)}>
          <HistoryPanel
            backendHistoryEnabled={backendHistoryEnabled}
            currentResourceId={historyResourceId(result)}
            historyKey={historyKey}
            onSelect={(item) => {
              const nextPath = resultPath(resultPathBase, historyResourceId(item));
              if (nextPath) navigate(nextPath);
              setActivePanel(null);
            }}
          />
        </DrawerPanel>
      )}

      <main className="ml-10 min-h-screen min-w-0 pt-10">
        <div className="space-y-4 p-4">
          <StatusBar loading={loading} status={status} />

          {!loading && !result && (
            <div className="border border-bloomberg-border bg-bloomberg-card p-6 text-center shadow-xl shadow-black/40 sm:p-8">
              <div className="font-display text-4xl font-bold tracking-widest text-bloomberg-border sm:text-6xl">
                READY
              </div>
              <div className="mx-auto mt-4 max-w-2xl font-mono text-xs tracking-wider text-bloomberg-muted sm:text-sm">
                {emptyDescription}
              </div>
              <div className="mx-auto mt-6 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
                {['MARKET DATA', 'AI DEBATE', 'DECISION'].map((step, index) => (
                  <div
                    key={step}
                    className="border border-bloomberg-border bg-black p-4 text-center"
                  >
                    <div className="font-mono text-2xl text-bloomberg-border">{index + 1}</div>
                    <div className="mt-2 font-mono text-xs tracking-wider text-bloomberg-muted">
                      {step}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && <AgentLog status={status} agentProgress={agentProgress} />}

          {result && !loading && (
            <ResultCard
              result={result}
              enableReportExport={enableReportExport && Boolean(resultPathBase)}
              mockReport={mockReportExport}
              onRerunSubmit={(payload) => rerunJob.startAnalysis(payload)}
              rerunRunning={rerunJob.running || loading}
            />
          )}
        </div>
      </main>
    </div>
  );
}

AnalysisWorkspace.propTypes = {
  FormComponent: PropTypes.elementType.isRequired,
  historyKey: PropTypes.string.isRequired,
  emptyDescription: PropTypes.string.isRequired,
  resultPathBase: PropTypes.string,
  lookupResult: PropTypes.func,
  backendHistoryEnabled: PropTypes.bool,
  enableReportExport: PropTypes.bool,
  mockReportExport: PropTypes.bool,
};
