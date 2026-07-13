// Persists chatbot conversations so history survives reloads.
// Shape: [{ id, title, messages: [...], updatedAt }] newest-first.
import { decryptJSON, encryptJSON } from './secureStorage';

export const CHAT_HISTORY_KEY = 'tradingagents:chatbot:history:v1';

// Bound growth so we never silently hit the ~5MB localStorage quota:
// count + age caps, plus a per-conversation byte cap (oldest messages drop first).
const HISTORY_TTL_DAYS = 30;
export const MAX_CONVERSATIONS = 50;
export const MAX_CONVERSATION_BYTES = 200_000;

// ponytail: cap measured on plaintext JSON; the encrypted envelope is larger
// but proportional, so the quota headroom still holds.
function capConversationBytes(convo) {
  if (!Array.isArray(convo?.messages)) return convo;
  let size = JSON.stringify(convo).length;
  if (size <= MAX_CONVERSATION_BYTES) return convo;
  const messages = [...convo.messages];
  while (messages.length > 1 && size > MAX_CONVERSATION_BYTES) {
    size -= JSON.stringify(messages.shift()).length + 1; // +1 for the array comma
  }
  return { ...convo, messages };
}

export function pruneConversations(list) {
  if (!Array.isArray(list)) return [];
  const cutoff = Date.now() - HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000;
  return list
    .filter((c) => {
      const ts = c?.updatedAt ? new Date(c.updatedAt).getTime() : NaN;
      return Number.isNaN(ts) || ts >= cutoff;
    })
    .slice(0, MAX_CONVERSATIONS) // newest-first, so this keeps the latest
    .map(capConversationBytes);
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
