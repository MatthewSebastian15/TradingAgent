import { runMonteCarlo } from './stochastic';

self.addEventListener('message', (event) => {
  const { id, method, args } = event.data || {};
  try {
    self.postMessage({ id, result: runMonteCarlo({ method, args }) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
});
