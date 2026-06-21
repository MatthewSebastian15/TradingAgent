import { loadGeneralNews } from '@/hooks/useGeneralNews';

export function prefetchCategory(category, { windowDays = 7, limit = 100 } = {}) {
  try {
    loadGeneralNews({ category, windowDays, limit }).catch(() => {});
  } catch {
    // Silently ignore prefetch errors (e.g. in test environments where the
    // module is mocked without exposing loadGeneralNews).
  }
}
