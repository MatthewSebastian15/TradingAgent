import { useCallback, useEffect, useRef, useState } from 'react';

function makeMockAbortError() {
  const error = new Error('Analysis cancelled.');
  error.name = 'AbortError';
  return error;
}

export function useMockAnalysisJob({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [running, setRunning] = useState(false);
  const timersRef = useRef([]);
  const mountedRef = useRef(true);
  const cancelledRef = useRef(false);
  const callbacksRef = useRef({ onResult, onLoading, onStatus, onAgentProgress });

  useEffect(() => {
    callbacksRef.current = { onResult, onLoading, onStatus, onAgentProgress };
  }, [onAgentProgress, onLoading, onResult, onStatus]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      clearTimers();
    };
  }, [clearTimers]);

  const schedule = useCallback((callback, delayMs) => {
    const timerId = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((id) => id !== timerId);
      if (!mountedRef.current || cancelledRef.current) return;
      callback();
    }, delayMs);
    timersRef.current.push(timerId);
  }, []);

  const stopAnalysis = useCallback(() => {
    cancelledRef.current = true;
    clearTimers();

    if (!mountedRef.current) return;
    callbacksRef.current.onStatus('Analysis cancelled.');
    callbacksRef.current.onResult({ error: makeMockAbortError().message });
    callbacksRef.current.onLoading(false);
    if (callbacksRef.current.onAgentProgress) callbacksRef.current.onAgentProgress(null);
    setRunning(false);
  }, [clearTimers]);

  const startAnalysis = useCallback(
    async (payload) => {
      clearTimers();
      cancelledRef.current = false;
      setRunning(true);

      callbacksRef.current.onLoading(true);
      callbacksRef.current.onStatus('Creating analysis job...');
      callbacksRef.current.onResult(null);
      if (callbacksRef.current.onAgentProgress) callbacksRef.current.onAgentProgress(null);

      const { getMockAnalysisResponse, MOCK_PIPELINE_STEPS } = await import('../../dev/mockData');

      const jobId = `mock-${String(payload?.ticker || 'analysis')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

      schedule(() => callbacksRef.current.onStatus(`Job queued: ${jobId}`), 120);
      schedule(() => callbacksRef.current.onStatus('Job status: RUNNING'), 260);

      const stepGap = 420;
      const stepDuration = 240;
      const startOffset = 420;

      MOCK_PIPELINE_STEPS.forEach((step, index) => {
        const startAt = startOffset + index * stepGap;
        const completeAt = startAt + stepDuration;

        schedule(() => {
          callbacksRef.current.onStatus(step.running);
          if (callbacksRef.current.onAgentProgress) {
            callbacksRef.current.onAgentProgress({
              agent_id: step.agent_id,
              agent_name: step.agent_name,
              status: 'started',
              status_message: step.running,
            });
          }
        }, startAt);

        schedule(() => {
          callbacksRef.current.onStatus(step.completed);
          if (callbacksRef.current.onAgentProgress) {
            callbacksRef.current.onAgentProgress({
              agent_id: step.agent_id,
              agent_name: step.agent_name,
              status: 'completed',
              status_message: step.completed,
            });
          }
        }, completeAt);
      });

      schedule(() => {
        const result = getMockAnalysisResponse({ ...payload, request_id: jobId });
        callbacksRef.current.onResult(result);
        callbacksRef.current.onLoading(false);
        callbacksRef.current.onStatus('');
        if (callbacksRef.current.onAgentProgress) callbacksRef.current.onAgentProgress(null);
        setRunning(false);
        clearTimers();
      }, startOffset + MOCK_PIPELINE_STEPS.length * stepGap + 280);
    },
    [clearTimers, schedule]
  );

  return {
    running,
    startAnalysis,
    stopAnalysis,
  };
}
