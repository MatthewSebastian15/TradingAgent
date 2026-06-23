import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchRagChat } from '../api/ragChat';
import { loadConversations, saveConversations, titleFrom } from '../services/chatHistory';
import { readWatchlistState } from '../services/watchlistStorage';
import { buildApiUrl } from '../utils/api';

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function buildWatchlistContext(contextFilter, signal) {
  if (contextFilter !== 'all' && contextFilter !== 'watchlist') return null;

  const state = readWatchlistState();
  const groups = (state?.groups || []).map((g) => ({
    id: g.id,
    name: g.name,
    items: (g.items || []).map(({ symbol, name, exchange, market, type }) => ({
      symbol,
      name,
      exchange,
      market,
      type,
    })),
  }));

  const symbols = groups.flatMap((g) => g.items.map((i) => i.symbol));
  if (!symbols.length) return null;

  let quotes = [];
  try {
    const res = await fetch(buildApiUrl(`/market/quotes?symbols=${symbols.join(',')}`), {
      credentials: 'include',
      signal,
    });
    if (res.ok) quotes = await res.json();
  } catch {
    // non-fatal; send groups without quotes
  }

  return {
    groups,
    quotes: Array.isArray(quotes) ? quotes : [],
    fetched_at: new Date().toISOString(),
  };
}

export function useRagChat(contextFilter = 'all') {
  const [conversations, setConversations] = useState(loadConversations);
  const [activeId, setActiveId] = useState(() => loadConversations()[0]?.id ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const abortRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const messages = useMemo(
    () => conversations.find((c) => c.id === activeId)?.messages ?? [],
    [conversations, activeId]
  );

  // Mutate the active conversation and persist in one step.
  const commit = useCallback((updater) => {
    setConversations((prev) => {
      const next = updater(prev);
      saveConversations(next);
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const now = new Date().toISOString();
      const userMsg = { id: makeId(), role: 'user', content: trimmed, timestamp: now };
      const history = messages.slice(-10).map(({ role, content }) => ({ role, content }));

      // Start a fresh conversation when none is active.
      let convoId = activeId;
      if (convoId == null) {
        convoId = makeId();
        setActiveId(convoId);
        commit((prev) => [
          { id: convoId, title: titleFrom(trimmed), messages: [userMsg], updatedAt: now },
          ...prev,
        ]);
      } else {
        commit((prev) =>
          prev.map((c) =>
            c.id === convoId ? { ...c, messages: [...c.messages, userMsg], updatedAt: now } : c
          )
        );
      }

      setIsLoading(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const watchlistContext = await buildWatchlistContext(contextFilter, controller.signal);
        const data = await fetchRagChat({
          message: trimmed,
          contextFilter,
          chatHistory: history,
          watchlistContext,
          signal: controller.signal,
        });

        if (!mountedRef.current) return;

        const assistantMsg = {
          id: makeId(),
          role: 'assistant',
          content: data.answer,
          sources: data.sources || [],
          poolUsed: data.pool_used || [],
          outOfScope: data.out_of_scope || false,
          timestamp: new Date().toISOString(),
        };
        commit((prev) =>
          prev.map((c) =>
            c.id === convoId
              ? {
                  ...c,
                  messages: [...c.messages, assistantMsg],
                  updatedAt: new Date().toISOString(),
                }
              : c
          )
        );
      } catch (err) {
        // User pressed Stop — leave the partial conversation, no error shown.
        if (err.name === 'AbortError') return;
        if (mountedRef.current) setError(err.message || 'Failed to reach the chatbot.');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (mountedRef.current && !controller.signal.aborted) setIsLoading(false);
      }
    },
    [messages, activeId, isLoading, contextFilter, commit]
  );

  // Interrupt an in-flight request.
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (mountedRef.current) setIsLoading(false);
  }, []);

  const newChat = useCallback(() => {
    setActiveId(null);
    setError(null);
  }, []);

  const selectChat = useCallback((id) => {
    setActiveId(id);
    setError(null);
  }, []);

  const deleteChat = useCallback(
    (id) => {
      commit((prev) => prev.filter((c) => c.id !== id));
      setActiveId((curr) => (curr === id ? null : curr));
    },
    [commit]
  );

  // Empties the active conversation (trash button in the chat window).
  const clearMessages = useCallback(() => {
    setError(null);
    if (activeId == null) return;
    commit((prev) => prev.map((c) => (c.id === activeId ? { ...c, messages: [] } : c)));
  }, [activeId, commit]);

  return {
    messages,
    isLoading,
    error,
    conversations,
    activeId,
    sendMessage,
    stop,
    clearMessages,
    newChat,
    selectChat,
    deleteChat,
  };
}
