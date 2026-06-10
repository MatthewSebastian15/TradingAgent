import { useCallback, useEffect, useRef, useState } from 'react';

import { SSE_EVENTS, PIPELINE_STATUSES } from '../domain/analysisContract';
import { buildApiUrl, buildAuthHeaders, buildHeaders, readHttpError } from '../utils/api';
import { parseSseBlock } from '../utils/sse';

function abortError() {
  const error = new Error('Analysis aborted.');
  error.name = 'AbortError';
  return error;
}

function errorMessageFromPayload(payload, fallback = 'Analysis failed.') {
  const errorPayload = payload?.error || payload?.message || fallback;
  return typeof errorPayload === 'string' ? errorPayload : errorPayload.message || fallback;
}

export function useAnalysisJob({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [running, setRunning] = useState(false);
  const abortRef = useRef(null);
  const jobIdRef = useRef(null);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onResult, onLoading, onStatus, onAgentProgress });

  useEffect(() => {
    callbacksRef.current = { onResult, onLoading, onStatus, onAgentProgress };
  }, [onAgentProgress, onLoading, onResult, onStatus]);

  const ensureMounted = useCallback(() => {
    if (!mountedRef.current) throw abortError();
  }, []);

  const cancelCurrentJob = useCallback(async ({ keepalive = false } = {}) => {
    const jobId = jobIdRef.current;
    if (!jobId) return Promise.resolve();

    const controller = keepalive ? null : new AbortController();
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), 3000) : null;

    try {
      await fetch(buildApiUrl(`/analysis/jobs/${jobId}`), {
        method: 'DELETE',
        headers: await buildAuthHeaders(),
        credentials: 'include',
        signal: controller?.signal,
        keepalive,
      });
    } catch {
      // Abort still closes the client stream; backend cancellation is best-effort.
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      cancelCurrentJob({ keepalive: true });
    };
  }, [cancelCurrentJob]);

  const stopAnalysis = useCallback(() => {
    callbacksRef.current.onStatus('Cancelling analysis...');
    abortRef.current?.abort();
    cancelCurrentJob();
  }, [cancelCurrentJob]);

  const handleStreamEvent = useCallback((event) => {
    const {
      onAgentProgress: emitAgentProgress,
      onResult: emitResult,
      onStatus: emitStatus,
    } = callbacksRef.current;

    if (event.type === 'job') {
      emitStatus(`Job status: ${(event.payload.status || 'queued').toUpperCase()}`);
      if (event.payload.result) {
        emitResult({ job_id: jobIdRef.current, ...event.payload.result });
        return true;
      }
      if (event.payload.error) {
        const message = errorMessageFromPayload(event.payload.error);
        const rid = event.payload.error.request_id ? ` [${event.payload.error.request_id}]` : '';
        emitResult({ error: `${message}${rid}` });
        return true;
      }
    }

    if (event.type === SSE_EVENTS.HEARTBEAT) {
      callbacksRef.current.onStatus(
        `Pipeline heartbeat: ${(event.payload.status || PIPELINE_STATUSES.RUNNING).toUpperCase()}`
      );
    }
    if (event.type === SSE_EVENTS.PROGRESS) {
      callbacksRef.current.onStatus(event.payload.status_message || 'Running...');
      if (emitAgentProgress) emitAgentProgress(event.payload);
    }
    if (event.type === SSE_EVENTS.RESULT) {
      emitResult({ job_id: jobIdRef.current, ...event.payload });
      return true;
    }
    if (event.type === SSE_EVENTS.ERROR) {
      const message = errorMessageFromPayload(event.payload);
      const rid = event.payload.request_id ? ` [${event.payload.request_id}]` : '';
      emitResult({ error: `${message}${rid}` });
      return true;
    }
    return false;
  }, []);

  const runJobStream = useCallback(
    async (payload) => {
      const controller = new AbortController();
      abortRef.current = controller;

      const createRes = await fetch(buildApiUrl('/analysis/jobs'), {
        method: 'POST',
        headers: await buildHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!createRes.ok) throw new Error(await readHttpError(createRes));
      ensureMounted();
      const job = await createRes.json();
      ensureMounted();
      jobIdRef.current = job.job_id;
      callbacksRef.current.onStatus(`Job queued: ${job.job_id}`);

      const streamRes = await fetch(buildApiUrl(`/analysis/jobs/${job.job_id}/events`), {
        method: 'GET',
        headers: {
          ...(await buildAuthHeaders()),
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        credentials: 'include',
        signal: controller.signal,
      });

      if (!streamRes.ok) throw new Error(await readHttpError(streamRes));
      if (!streamRes.body) throw new Error('SSE stream not supported by browser.');
      ensureMounted();

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        ensureMounted();
        const { done, value } = await reader.read();
        if (done) {
          buf += decoder.decode();
          break;
        }
        ensureMounted();
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split(/\r?\n\r?\n/);
        buf = blocks.pop() || '';

        for (const block of blocks) {
          const event = parseSseBlock(block);
          if (!event) continue;
          ensureMounted();

          if (handleStreamEvent(event)) {
            return;
          }
        }
      }

      ensureMounted();
      const trailingEvent = parseSseBlock(buf);
      if (trailingEvent && handleStreamEvent(trailingEvent)) {
        return;
      }
      throw new Error('SSE stream ended before result.');
    },
    [ensureMounted, handleStreamEvent]
  );

  const startAnalysis = useCallback(
    async (payload) => {
      setRunning(true);
      callbacksRef.current.onLoading(true);
      callbacksRef.current.onStatus('Creating analysis job...');
      callbacksRef.current.onResult(null);
      if (callbacksRef.current.onAgentProgress) callbacksRef.current.onAgentProgress(null);

      try {
        await runJobStream(payload);
      } catch (ex) {
        if (!mountedRef.current) return;
        if (ex.name === 'AbortError') {
          callbacksRef.current.onResult({ error: 'Analysis cancelled.' });
        } else {
          callbacksRef.current.onResult({ error: ex.message || 'Analysis failed.' });
        }
      } finally {
        if (mountedRef.current) {
          setRunning(false);
          callbacksRef.current.onLoading(false);
          callbacksRef.current.onStatus('');
          abortRef.current = null;
          jobIdRef.current = null;
        }
      }
    },
    [runJobStream]
  );

  return {
    running,
    startAnalysis,
    stopAnalysis,
  };
}
