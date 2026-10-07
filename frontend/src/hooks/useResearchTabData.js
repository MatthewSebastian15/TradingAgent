import { useEffect, useState } from 'react';

const IDLE = { load: null, data: null, error: null };

// Runs `load({ signal })` whenever the `load` function identity changes (wrap it in
// useCallback keyed on its inputs). The settled result is tagged with the `load` that
// produced it, so data for a previous ticker/statement is never shown for the current one.
export function useResearchTabData(load) {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    const controller = new AbortController();

    load({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ load, data, error: null });
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        setState({ load, data: null, error: err.message || 'Failed to load.' });
      });

    return () => controller.abort();
  }, [load]);

  const settled = state.load === load;
  return {
    data: settled ? state.data : null,
    error: settled ? state.error : null,
    loading: !settled,
  };
}
