import { useMemo } from 'react';

// Quant statistics are noise below ~30 trading days, so grey the tab out instead.
const MIN_QUANT_POINTS = 30;

export function useResultSections(result, buildViewModel) {
  return useMemo(() => {
    const disabledTabs = [];
    if ((result?.price_chart?.points?.length ?? 0) < MIN_QUANT_POINTS) {
      disabledTabs.push('quant');
    }
    return {
      vm: result ? buildViewModel(result) : null,
      disabledTabs,
    };
  }, [result, buildViewModel]);
}
