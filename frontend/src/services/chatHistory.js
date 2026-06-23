// Persists chatbot conversations so history survives reloads.
// Shape: [{ id, title, messages: [...], updatedAt }] newest-first.
export const CHAT_HISTORY_KEY = 'tradingagents:chatbot:history:v1';

export function loadConversations() {
  try {
    const list = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveConversations(list) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(list));
  } catch {
    // ponytail: ignore quota/serialization errors — history is best-effort
  }
}

export function titleFrom(text) {
  const t = String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
  return t.length > 40 ? `${t.slice(0, 40)}…` : t || 'New chat';
}
