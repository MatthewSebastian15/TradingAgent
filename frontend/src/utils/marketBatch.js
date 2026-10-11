export const QUOTE_BATCH_SIZE = 20; // backend caps /market/quotes and /market/sparklines at 20 symbols
const MAX_PARALLEL_BATCHES = 3;

export function chunk(items, size = QUOTE_BATCH_SIZE) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function runBatch(batch, fetchBatch, { onBatch, failed }) {
  try {
    onBatch(await fetchBatch(batch), batch);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    // HTTP 400 means the server rejected something in this batch (for example one
    // malformed symbol). Bisect to isolate it; never bisect 5xx/network errors,
    // that would multiply requests during an outage.
    if (err?.status === 400 && batch.length > 1) {
      const middle = Math.ceil(batch.length / 2);
      await runBatch(batch.slice(0, middle), fetchBatch, { onBatch, failed });
      await runBatch(batch.slice(middle), fetchBatch, { onBatch, failed });
      return;
    }
    failed.push({ symbols: batch, error: err });
  }
}

export async function fetchInBatches(
  symbols,
  fetchBatch,
  { onBatch = () => {}, size = QUOTE_BATCH_SIZE } = {}
) {
  const queue = chunk(symbols, size);
  const failed = [];
  const worker = async () => {
    while (queue.length) {
      await runBatch(queue.shift(), fetchBatch, { onBatch, failed });
    }
  };
  const workers = Array.from({ length: Math.min(MAX_PARALLEL_BATCHES, queue.length) }, worker);
  await Promise.all(workers);
  return { failed };
}

export const QUOTE_TIMEOUT_MS = 15_000;
export const SPARKLINE_TIMEOUT_MS = 20_000;
export const VALIDATE_TIMEOUT_MS = 10_000;

export function withDeadline(run, { signal, timeoutMs }) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onParentAbort, { once: true });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return Promise.resolve()
    .then(() => run(controller.signal))
    .catch((error) => {
      if (timedOut && !signal?.aborted) {
        throw Object.assign(new Error('Request timed out.'), { code: 'TIMEOUT' });
      }
      throw error;
    })
    .finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onParentAbort);
    });
}

function isTransient(error) {
  if (error?.name === 'AbortError') return false;
  return (
    error?.code === 'TIMEOUT' ||
    error instanceof TypeError || // fetch network failure
    error?.status === 429 ||
    error?.status >= 500
  );
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

export async function withRetry(
  run,
  { signal, retries = 2, baseDelayMs = 2000, wait = sleep } = {}
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (attempt >= retries || !isTransient(error) || signal?.aborted || hidden) throw error;
      const delay = baseDelayMs * 3 ** attempt * (0.8 + Math.random() * 0.4); // ~2 s, ~6 s, ±20 % jitter
      await wait(delay, signal);
    }
  }
}
