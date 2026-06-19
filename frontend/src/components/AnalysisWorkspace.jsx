import PropTypes from 'prop-types';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import AgentLog from './AgentLog';
import {
  ClockIcon,
  ConfigIcon,
  DrawerPanel,
  HistoryPanel,
  PanelButton,
  StatusBar,
} from './AnalysisWorkspacePanels';
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
  mockReportExport = false,
}) {
  const navigate = useNavigate();
  const { resourceId } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(Boolean(resourceId));
  const [status, setStatus] = useState(resourceId ? 'Loading saved analysis...' : '');
  const [agentProgress, setAgentProgress] = useState(null);
  const initialPanel = resourceId ? null : 'config';
  const [activePanel, setActivePanel] = useState(initialPanel);
  const [visiblePanel, setVisiblePanel] = useState(initialPanel);
  const isReadyState = !loading && !result && !resourceId;
  const wasReadyState = useRef(isReadyState);

  function togglePanel(name) {
    if (activePanel === name) {
      setActivePanel(null);
      return;
    }

    setVisiblePanel(name);
    setActivePanel(name);
  }

  useEffect(() => {
    const enteredReadyState = isReadyState && !wasReadyState.current;
    wasReadyState.current = isReadyState;

    if (enteredReadyState) {
      setVisiblePanel('config');
      setActivePanel('config');
      return;
    }

    if (result || resourceId) {
      setActivePanel((currentPanel) => (currentPanel === 'config' ? null : currentPanel));
    }
  }, [isReadyState, result, resourceId]);

  useEffect(() => {
    if (activePanel) {
      setVisiblePanel(activePanel);
      return undefined;
    }

    if (!visiblePanel) return undefined;

    const timeoutId = setTimeout(() => setVisiblePanel(null), 200);
    return () => clearTimeout(timeoutId);
  }, [activePanel, visiblePanel]);

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

  const panelOpen = Boolean(activePanel);
  const mainOffsetClass = panelOpen ? 'ml-10 md:ml-[22.5rem]' : 'ml-10';

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px]">
      <Navbar />

      <div className="fixed bottom-0 left-0 top-[60px] z-[45] w-10 border-bloomberg-border border-r bg-black">
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

      {visiblePanel === 'config' && (
        <DrawerPanel
          open={activePanel === 'config'}
          title="CONFIGURATION"
          onClose={() => setActivePanel(null)}
        >
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

      {visiblePanel === 'history' && (
        <DrawerPanel
          open={activePanel === 'history'}
          title="HISTORY"
          onClose={() => setActivePanel(null)}
        >
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

      <main
        data-testid="analysis-main"
        className={`${mainOffsetClass} min-h-screen min-w-0 transition-[margin-left] duration-200 ease-out will-change-[margin-left]`}
      >
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
