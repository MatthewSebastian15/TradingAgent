import { useEffect, useRef } from 'react';

import { buildApiUrl, buildAuthHeaders } from '../utils/api';

export const SSE_REFRESH_THROTTLE_MS = 5000;
const SSE_RECONNECT_MIN_MS = 2000;
const SSE_RECONNECT_MAX_MS = 30000;

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

function createThrottledUpdate(onUpdate, throttleMs) {
  let lastRunAt = 0;
  let timeoutId = null;
  let running = false;

  const run = async () => {
    timeoutId = null;
    if (running) return;

    running = true;
    lastRunAt = Date.now();
    try {
      await onUpdate?.();
    } finally {
      running = false;
    }
  };

  const trigger = () => {
    const elapsed = Date.now() - lastRunAt;
    if (!lastRunAt || elapsed >= throttleMs) {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      run();
      return;
    }

    if (!timeoutId) {
      timeoutId = window.setTimeout(run, throttleMs - elapsed);
    }
  };

  const cancel = () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = null;
  };

  return { trigger, cancel };
}

export function useGeneralNewsStream({
  enabled = true,
  onUpdate,
  throttleMs = SSE_REFRESH_THROTTLE_MS,
} = {}) {
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let reconnectDelay = SSE_RECONNECT_MIN_MS;
    let reconnectTimer = null;
    let controller = null;
    const throttledUpdate = createThrottledUpdate(() => onUpdateRef.current?.(), throttleMs);

    async function connect() {
      controller = new AbortController();

      try {
        const response = await fetch(buildApiUrl('/news/general/stream'), {
          method: 'GET',
          headers: await buildAuthHeaders(),
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`General news stream failed: HTTP ${response.status}`);
        }

        reconnectDelay = SSE_RECONNECT_MIN_MS;
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
            if (event.type === 'general_news_updated') throttledUpdate.trigger();
          }
        }
      } catch (error) {
        if (cancelled || error?.name === 'AbortError') return;
      }

      if (!cancelled) {
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, SSE_RECONNECT_MAX_MS);
      }
    }

    connect();

    return () => {
      cancelled = true;
      throttledUpdate.cancel();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      controller?.abort();
    };
  }, [enabled, throttleMs]);
}
