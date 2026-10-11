export const QUOTE_POLL_MS = 100 * 1000;
export const TREND_CACHE_TTL_MS = 5 * 60 * 1000;
export const STALE_AFTER_MS = QUOTE_POLL_MS * 2.5; // no successful quote update for ~2 missed polls
