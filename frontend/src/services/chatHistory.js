// Persists chatbot conversations so history survives reloads.
// Shape: [{ id, title, messages: [...], updatedAt }] newest-first.
import { decryptJSON, encryptJSON } from './secureStorage';

export const CHAT_HISTORY_KEY = 'tradingagents:chatbot:history:v1';

// Bound growth so we never silently hit the ~5MB localStorage quota.
// ponytail: count + age caps only; a single giant conversation can still
// exceed quota — split per-conversation if that ever shows up.
const HISTORY_TTL_DAYS = 30;
export const MAX_CONVERSATIONS = 50;

export function pruneConversations(list) {
  if (!Array.isArray(list)) return [];
  const cutoff = Date.now() - HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000;
  return list
    .filter((c) => {
      const ts = c?.updatedAt ? new Date(c.updatedAt).getTime() : NaN;
      return Number.isNaN(ts) || ts >= cutoff;
    })
    .slice(0, MAX_CONVERSATIONS); // newest-first, so this keeps the latest
}

export async function loadConversations() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    let list = await decryptJSON(raw); // new envelope
    if (list === null) {
      try {
        list = JSON.parse(raw);
      } catch {
        list = [];
      }
    } // legacy plaintext
    return pruneConversations(Array.isArray(list) ? list : []);
  } catch {
    return [];
  }
}

export async function saveConversations(list) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, await encryptJSON(pruneConversations(list)));
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
