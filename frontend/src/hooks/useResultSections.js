import { useMemo } from 'react';

export function useResultSections(result, buildViewModel) {
  return useMemo(
    () => ({
      vm: result ? buildViewModel(result) : null,
      disabledTabs: [],
    }),
    [result, buildViewModel]
  );
}
