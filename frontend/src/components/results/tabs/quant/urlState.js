import { useEffect, useState } from 'react';

// Query-string state for shareable Quant links. replaceState keeps the router's
// history.state (its index) and adds no history entries.
export function readQuantUrl(search = window.location.search) {
  return Object.fromEntries(new URLSearchParams(search));
}

export function writeQuantUrl(patch) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) window.history.replaceState(window.history.state, '', next);
}

export function useUrlState(
  key,
  defaultValue,
  { enabled = true, parse = (s) => s, isValid = () => true } = {}
) {
  const [value, setValue] = useState(() => {
    if (!enabled) return defaultValue;
    const raw = new URLSearchParams(window.location.search).get(key);
    if (raw === null) return defaultValue;
    const parsed = parse(raw);
    return isValid(parsed) ? parsed : defaultValue;
  });

  useEffect(() => {
    if (!enabled) return;
    writeQuantUrl({ [key]: value === defaultValue ? null : String(value) });
  }, [enabled, key, value, defaultValue]);

  return [value, setValue];
}
