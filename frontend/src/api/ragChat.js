import { buildApiUrl, buildHeaders } from '../utils/api';

/**
 * @param {{ message: string, contextFilter: string, chatHistory: Array<{role:string,content:string}>, watchlistContext: object|null, portfolioContext: object|null, signal?: AbortSignal }} params
 * @returns {Promise<{answer: string, out_of_scope: boolean, pool_used: string[], sources: object[]}>}
 */
export async function fetchRagChat({
  message,
  contextFilter,
  chatHistory,
  watchlistContext,
  portfolioContext,
  signal,
}) {
  const body = {
    message,
    context_filter: contextFilter || 'all',
    chat_history: chatHistory || [],
  };
  if (watchlistContext) {
    body.watchlist_context = watchlistContext;
  }
  if (portfolioContext) {
    body.portfolio_context = portfolioContext;
  }

  const res = await fetch(buildApiUrl('/rag/chat'), {
    method: 'POST',
    credentials: 'include',
    headers: await buildHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `RAG chat failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchPoolStatus() {
  const res = await fetch(buildApiUrl('/rag/pool/status'), {
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
}
