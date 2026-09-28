import { useEffect, useState } from 'react';

// Trailing debounce: controls stay instant, expensive math waits until input settles.
export function useDebouncedValue(value, delayMs = 150) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
