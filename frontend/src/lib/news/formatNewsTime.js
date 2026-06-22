// Compact relative time: 45s, 5m, 12h, 7d, 2w, 6mo, 5y. No verbose "ago" forms.
export function formatNewsTime(value) {
  if (!value) return '';

  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(time)) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${Math.max(1, seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  // ponytail: 30d≈1mo, 365d≈1y — calendar drift acceptable for relative labels.
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function formatNewsTimestamp(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
