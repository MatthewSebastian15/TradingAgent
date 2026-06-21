import { loadGeneralNews } from '@/hooks/useGeneralNews';

export function prefetchCategory(category, { windowDays = 7, limit = 100 } = {}) {
  loadGeneralNews({ category, windowDays, limit }).catch(() => {});
}
