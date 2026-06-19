export function normalizeWatchlistSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

export function formatLastPrice(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '-';

  return numberValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatChangePercent(value) {
  if (value === null || value === undefined || value === '' || value === 'N/A') return '-';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed && trimmed !== 'N/A' ? trimmed : '-';
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '-';
  const sign = numberValue > 0 ? '+' : '';
  return `${sign}${numberValue.toFixed(2)}%`;
}

export function formatVolume(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return '-';

  if (numberValue >= 1_000_000_000) return `${(numberValue / 1_000_000_000).toFixed(1)}B`;
  if (numberValue >= 1_000_000) return `${(numberValue / 1_000_000).toFixed(1)}M`;
  if (numberValue >= 1_000) return `${(numberValue / 1_000).toFixed(1)}K`;
  return numberValue.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
