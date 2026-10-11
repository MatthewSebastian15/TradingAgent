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
