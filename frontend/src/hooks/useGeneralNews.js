import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchGeneralNews } from '../services/generalNewsApi';
import { buildApiUrl, buildAuthHeaders } from '../utils/api';
import { parseSseBlock } from '../utils/sse';

const FALLBACK_POLL_MS = 60000;

export function useGeneralNews({ category = 'all', windowDays = 7, limit = 50 }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(
    async (signal) => {
      setStatus((current) => (current === 'success' ? 'refreshing' : 'loading'));
      setError(null);

      try {
        const result = await fetchGeneralNews({
          category,
          windowDays,
          limit,
          signal,
        });
        setData(result);
        setStatus('success');
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err);
          setStatus('error');
        }
      }
    },
    [category, limit, windowDays]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    let closed = false;
    const controller = new AbortController();

    function startPolling() {
      if (pollRef.current || closed) return;
      pollRef.current = window.setInterval(() => load(), FALLBACK_POLL_MS);
    }

    async function connectStream() {
      try {
        const response = await fetch(buildApiUrl('/news/general/stream'), {
          method: 'GET',
          headers: {
            ...(await buildAuthHeaders()),
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          startPolling();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            const event = parseSseBlock(block);
            if (event?.type === 'general_news_updated') {
              load();
            }
          }
        }

        if (!closed) startPolling();
      } catch (err) {
        if (err.name !== 'AbortError') startPolling();
      }
    }

    connectStream();

    return () => {
      closed = true;
      controller.abort();
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [load]);

  return {
    data,
    status,
    error,
    reload: () => load(),
  };
}
