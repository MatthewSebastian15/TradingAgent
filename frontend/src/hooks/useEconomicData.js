import { useEffect, useState } from 'react';

import { getEconomicData } from '../api/economic';

// Fetches one Economic-tab source/command. params is serialized into the query.
export function useEconomicData(source, command, params = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    if (!source || !command) return undefined;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getEconomicData(source, command, { params: JSON.parse(paramsKey), signal: controller.signal })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Failed to load economic data.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [source, command, paramsKey]);

  return { data, loading, error };
}
