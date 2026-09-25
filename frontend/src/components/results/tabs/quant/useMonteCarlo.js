import { useEffect, useRef, useState } from 'react';

import { runMonteCarlo } from './stochastic';

// Runs Monte Carlo off the main thread when module workers exist; falls back to a
// synchronous run (tests, very old browsers). `request` must be memoized by the caller.
export function useMonteCarlo(request) {
  const [state, setState] = useState(() => ({ result: null, running: false }));
  const workerRef = useRef(null);
  const idRef = useRef(0);

  useEffect(() => () => workerRef.current?.terminate(), []);

  useEffect(() => {
    if (!request) {
      setState({ result: null, running: false });
      return undefined;
    }
    if (typeof Worker === 'undefined') {
      setState({ result: runMonteCarlo(request), running: false });
      return undefined;
    }
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./mc.worker.js', import.meta.url), {
        type: 'module',
      });
    }
    const worker = workerRef.current;
    idRef.current += 1;
    const id = idRef.current;
    setState((prev) => ({ result: prev.result, running: true }));
    const onMessage = (event) => {
      if (event.data?.id !== id) return;
      setState({ result: event.data.error ? null : event.data.result, running: false });
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ id, method: request.method, args: request.args });
    return () => worker.removeEventListener('message', onMessage);
  }, [request]);

  return state;
}
