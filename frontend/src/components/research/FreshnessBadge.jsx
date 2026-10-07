import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

const LIVE_WINDOW_MS = 15_000; // one 10s poll plus margin

function formatAge(ageMs) {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

// Local 1s tick re-renders only this badge, not the page. The word LIVE/UPDATED carries the
// state; colour (green vs amber) only reinforces it.
export default function FreshnessBadge({ updatedAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (updatedAt == null) return null;

  const ageMs = now - updatedAt;
  const live = ageMs < LIVE_WINDOW_MS;
  return (
    <span
      aria-live="polite"
      className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-bloomberg-white/60"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-bloomberg-green animate-pulse-dot' : 'bg-bloomberg-amber'}`}
        aria-hidden="true"
      />
      {live ? 'Live' : 'Updated'} {formatAge(ageMs)}
    </span>
  );
}

FreshnessBadge.propTypes = { updatedAt: PropTypes.number };
