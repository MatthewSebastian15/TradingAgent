import { useEffect, useRef, useState } from 'react';

import { buildApiUrl, buildAuthHeaders } from '@/utils/api';

const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const REFRESH_THROTTLE_MS = 5000;

function parseSseBlock(block) {
  const event = { type: 'message', data: '' };

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;

    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1).replace(/^ /, '');

    if (field === 'event') event.type = value;
    if (field === 'data') event.data = event.data ? `${event.data}\n${value}` : value;
  }

  return event;
}

export function useTickerNewsStream({
  ticker,
  windowDays = 30,
  limit = 30,
  pollSeconds = 120,
  enabled = true,
  onUpdate,
} = {}) {
  const onUpdateRef = useRef(onUpdate);
  const [newCount, setNewCount] = useState(0);
  const [streamStatus, setStreamStatus] = useState('idle');

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled || !ticker) return undefined;

    let cancelled = false;
    let reconnectDelay = RECONNECT_MIN_MS;
    let reconnectTimer = null;
    let controller = null;
    let lastUpdateAt = 0;

    async function triggerUpdate(payload) {
      setNewCount((value) => value + 1);
      const elapsed = Date.now() - lastUpdateAt;
      if (elapsed < REFRESH_THROTTLE_MS) return;
      lastUpdateAt = Date.now();
      await onUpdateRef.current?.(payload);
    }

    async function connect() {
      controller = new AbortController();
      setStreamStatus('connecting');
      const params = new URLSearchParams({
        window_days: String(windowDays),
        limit: String(limit),
        poll_seconds: String(pollSeconds),
      });

      try {
        const response = await fetch(
          buildApiUrl(`/news/${encodeURIComponent(ticker)}/stream?${params}`),
          {
            method: 'GET',
            headers: await buildAuthHeaders(),
            credentials: 'include',
            signal: controller.signal,
          }
        );

        if (!response.ok || !response.body)
          throw new Error(`Ticker news stream failed: HTTP ${response.status}`);

        setStreamStatus('connected');
        reconnectDelay = RECONNECT_MIN_MS;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            const event = parseSseBlock(block);
            if (event.type === 'ticker_news_stream_ready') setStreamStatus('connected');
            if (event.type === 'ticker_news_updated') {
              let payload = null;
              try {
                payload = JSON.parse(event.data || '{}');
              } catch {
                payload = null;
              }
              await triggerUpdate(payload);
            }
          }
        }
      } catch (error) {
        if (cancelled || error?.name === 'AbortError') return;
        setStreamStatus('fallback');
      }

      if (!cancelled) {
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      controller?.abort();
    };
  }, [enabled, limit, pollSeconds, ticker, windowDays]);

  return { newCount, streamStatus, clearNewCount: () => setNewCount(0) };
}
