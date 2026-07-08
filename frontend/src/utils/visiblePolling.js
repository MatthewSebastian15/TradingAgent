// Poll only while the tab is visible, and fire once immediately when the tab
// becomes visible again so stale data refreshes without waiting a full interval.
// Returns a cleanup function.
export function startVisiblePolling(callback, intervalMs) {
  const tick = () => {
    if (document.visibilityState === 'visible') callback();
  };

  const intervalId = window.setInterval(tick, intervalMs);
  document.addEventListener('visibilitychange', tick);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', tick);
  };
}
