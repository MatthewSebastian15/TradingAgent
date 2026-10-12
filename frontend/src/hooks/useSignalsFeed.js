import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeBackendHistory, readHistory, writeHistory } from './useAnalysisHistoryStore';
import { fetchAnalysisHistory } from '../utils/analysisHistoryApi';
import { mergeSignals, toSignal } from '../utils/signals';

const HISTORY_KEY = 'ta_analysis_history';
const PAGE_SIZE = 25;

const toSignals = (data) => normalizeBackendHistory(data).map(toSignal).filter(Boolean);

export function useSignalsFeed({ pageSize = PAGE_SIZE } = {}) {
  const [signals, setSignals] = useState([]);
  const [fromMirror, setFromMirror] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const offsetRef = useRef(0); // raw server rows consumed so far
  const idsRef = useRef(new Set()); // ids already shown: detects a page that adds nothing new
  const controllerRef = useRef(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');

    // Start the network request first, capture its outcome as a value (no unhandled
    // rejection while the mirror is read), then paint the saved list without waiting.
    const request = fetchAnalysisHistory({
      limit: pageSize,
      offset: 0,
      signal: controller.signal,
    }).then(
      (data) => ({ data }),
      (failure) => ({ failure })
    );

    const mirror = (await readHistory(HISTORY_KEY)).map(toSignal).filter(Boolean);
    if (controller.signal.aborted) return;
    if (mirror.length) {
      setSignals(mirror);
      setFromMirror(true);
      setLoading(false);
    }

    const { data, failure } = await request;
    if (controller.signal.aborted) return;

    if (failure) {
      if (failure.name !== 'AbortError') {
        setError(
          mirror.length
            ? 'Could not refresh signals. Showing the saved list.'
            : failure.message || 'Could not load signals.'
        );
      }
    } else {
      const first = toSignals(data);
      offsetRef.current = data.length;
      idsRef.current = new Set(first.map((signal) => signal.id));
      setSignals(first);
      setFromMirror(false);
      setHasMore(data.length >= pageSize);
      // Refresh the offline mirror without delaying the paint.
      writeHistory(HISTORY_KEY, normalizeBackendHistory(data)).catch(() => {});
    }
    setLoading(false);
  }, [pageSize]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => {
      aliveRef.current = false;
      controllerRef.current?.abort();
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const controller = controllerRef.current;
    setLoadingMore(true);
    try {
      const data = await fetchAnalysisHistory({
        limit: pageSize,
        offset: offsetRef.current,
        signal: controller?.signal,
      });
      if (!aliveRef.current) return;
      offsetRef.current += data.length;
      const incoming = toSignals(data);
      const fresh = incoming.filter((signal) => !idsRef.current.has(signal.id));
      fresh.forEach((signal) => idsRef.current.add(signal.id));
      setSignals((current) => mergeSignals(current, incoming));
      // A page that adds nothing new (e.g. a server that ignores `offset`) ends paging
      // instead of looping on the same rows.
      setHasMore(data.length >= pageSize && fresh.length > 0);
    } catch (failure) {
      if (failure.name !== 'AbortError' && aliveRef.current) {
        setError(failure.message || 'Could not load more signals.');
      }
    } finally {
      if (aliveRef.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, pageSize]);

  const lookupTicker = useCallback(
    async (ticker) => {
      const symbol = String(ticker || '')
        .trim()
        .toUpperCase();
      if (!symbol) return { found: 0 };
      try {
        const data = await fetchAnalysisHistory({ ticker: symbol, limit: pageSize, offset: 0 });
        const incoming = toSignals(data);
        incoming.forEach((signal) => idsRef.current.add(signal.id));
        if (aliveRef.current) setSignals((current) => mergeSignals(current, incoming));
        return { found: incoming.length };
      } catch (failure) {
        if (aliveRef.current) {
          setError(failure.message || `Could not search analyses for ${symbol}.`);
        }
        return { found: 0, failure };
      }
    },
    [pageSize]
  );

  return {
    signals,
    fromMirror,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh: load,
    loadMore,
    lookupTicker,
  };
}
