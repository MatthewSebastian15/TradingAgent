import { ChevronLeft, ChevronRight } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import AgentLog from './AgentLog';
import { HistoryPanel, StatusBar } from './AnalysisWorkspacePanels';
import Navbar from './Navbar';
import ResultCard from './ResultCard';
import {
  historyResourceId,
  saveToHistory,
  withAnalysisCreatedAt,
} from '../hooks/useAnalysisHistoryStore';
import { useAnalysisJob } from '../hooks/useAnalysisJob';
import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';

const RESULT_EXPIRED_MESSAGE = 'Result expired. Please submit a new analysis.';

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
    credentials: 'include',
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
}) {
  const navigate = useNavigate();
  const { resourceId } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(Boolean(resourceId));
  const [status, setStatus] = useState(resourceId ? 'Loading saved analysis...' : '');
  const [agentProgress, setAgentProgress] = useState(null);
  const [activeTab, setActiveTab] = useState('configuration');
  const [panelCollapsed, setPanelCollapsed] = useState(false);

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
          void saveToHistory(historyKey, enrichedResult);
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
        void saveToHistory(historyKey, enrichedResult);
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
    void saveToHistory(historyKey, enrichedResult);

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
    <div className="h-screen bg-bloomberg-bg pt-[60px]">
      <Navbar />

      {/* Content area: starts to the right of the global nav sidebar (w-12) */}
      <div className="fixed bottom-0 left-12 right-0 top-[60px] flex">
        {/* Collapsed: panel takes no width; floating button re-expands it. */}
        {panelCollapsed && (
          <button
            type="button"
            onClick={() => setPanelCollapsed(false)}
            aria-label="Expand panel"
            className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center border border-bloomberg-border bg-bloomberg-surface/90 text-bloomberg-orange backdrop-blur"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {/* Tab panel — collapses to none, expands to 280px */}
        <div
          className={`${panelCollapsed ? 'hidden' : 'flex w-[280px]'} flex-shrink-0 flex-col border-r border-bloomberg-border bg-card/95 shadow-2xl shadow-black/60 backdrop-blur`}
        >
          {/* Tab bar */}
          <div className="flex h-10 flex-shrink-0 border-b border-bloomberg-border bg-bloomberg-surface/70">
            <button
              type="button"
              aria-label="Configuration"
              onClick={() => setActiveTab('configuration')}
              className={`flex-1 border-b-2 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors ${
                activeTab === 'configuration'
                  ? 'border-bloomberg-orange bg-bloomberg-orange/10 text-bloomberg-orange'
                  : 'border-transparent text-bloomberg-muted hover:bg-bloomberg-surface/50 hover:text-bloomberg-white'
              }`}
            >
              CONFIGURATION
            </button>
            <button
              type="button"
              aria-label="History"
              onClick={() => setActiveTab('history')}
              className={`flex-1 border-b-2 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors ${
                activeTab === 'history'
                  ? 'border-bloomberg-orange bg-bloomberg-orange/10 text-bloomberg-orange'
                  : 'border-transparent text-bloomberg-muted hover:bg-bloomberg-surface/50 hover:text-bloomberg-white'
              }`}
            >
              HISTORY
            </button>
            <button
              type="button"
              onClick={() => setPanelCollapsed(true)}
              aria-label="Collapse panel"
              className="flex w-7 shrink-0 items-center justify-center border-l border-bloomberg-border text-bloomberg-orange"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <div key={activeTab} className="animate-fade-up h-full">
              {activeTab === 'configuration' ? (
                <FormComponent
                  onResult={handleResult}
                  onLoading={setLoading}
                  onStatus={setStatus}
                  onAgentProgress={setAgentProgress}
                  selectedResult={result && !result.error ? result : null}
                  agentProgress={agentProgress}
                  status={status}
                />
              ) : (
                <HistoryPanel
                  backendHistoryEnabled={backendHistoryEnabled}
                  currentResourceId={historyResourceId(result)}
                  historyKey={historyKey}
                  onSelect={(item) => {
                    const nextPath = resultPath(resultPathBase, historyResourceId(item));
                    if (nextPath) navigate(nextPath);
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Main content */}
        <main data-testid="analysis-main" className="flex-1 h-full min-w-0 overflow-auto">
          <div className="space-y-3 p-3">
            <StatusBar loading={loading} status={status} />

            {!loading && !result && (
              <div className="border border-bloomberg-border bg-bloomberg-card p-4 text-center shadow-xl shadow-black/40 sm:p-5">
                <div className="font-display text-3xl font-bold tracking-widest text-bloomberg-border sm:text-5xl">
                  READY
                </div>
                <div className="mx-auto mt-2.5 max-w-2xl font-mono text-[11px] tracking-wider text-bloomberg-muted sm:text-xs">
                  {emptyDescription}
                </div>
                <div className="mx-auto mt-4 grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-3">
                  {['MARKET DATA', 'AI DEBATE', 'DECISION'].map((step, index) => (
                    <div
                      key={step}
                      className="border border-bloomberg-border bg-black p-3 text-center"
                    >
                      <div className="font-mono text-xl text-bloomberg-border">{index + 1}</div>
                      <div className="mt-1.5 font-mono text-[11px] tracking-wider text-bloomberg-muted">
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
                onRerunSubmit={(payload) => rerunJob.startAnalysis(payload)}
                rerunRunning={rerunJob.running || loading}
              />
            )}
          </div>
        </main>
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
  backendHistoryEnabled: PropTypes.bool,
  enableReportExport: PropTypes.bool,
};
