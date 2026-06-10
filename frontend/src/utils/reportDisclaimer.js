import { buildApiUrl } from './api';

let disclaimerPromise = null;

export async function fetchReportDisclaimer() {
  if (!disclaimerPromise) {
    disclaimerPromise = fetch(buildApiUrl('/reports/disclaimer'), {
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) return '';
        const payload = await response.json();
        return typeof payload?.disclaimer === 'string' ? payload.disclaimer : '';
      })
      .catch(() => '');
  }

  return disclaimerPromise;
}
