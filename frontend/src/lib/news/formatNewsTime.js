export function formatNewsTime(value) {
  if (!value) return 'Recently';

  const time = new Date(value).getTime();

  if (Number.isNaN(time)) return 'Recently';

  const diffMs = Date.now() - time;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);

  return `${diffDays}d ago`;
}
