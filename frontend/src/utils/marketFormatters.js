function finiteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function decimalConfig(minimumFractionDigits, maximumFractionDigits) {
  return { minimumFractionDigits, maximumFractionDigits };
}

export function formatMarketPrice(value, symbol = '') {
  const numberValue = finiteNumber(value);
  if (numberValue === null) return 'N/A';

  const upperSymbol = String(symbol || '').toUpperCase();
  if (upperSymbol.includes('=X')) {
    return numberValue.toLocaleString('en-US', decimalConfig(4, 5));
  }
  if (upperSymbol.startsWith('^T') || upperSymbol === '^FVX' || upperSymbol === '^IRX') {
    return numberValue.toLocaleString('en-US', decimalConfig(2, 2));
  }
  if (upperSymbol.endsWith('-USD')) {
    const decimals =
      Math.abs(numberValue) < 1
        ? 6
        : upperSymbol === 'BTC-USD' || upperSymbol === 'ETH-USD'
          ? 2
          : 4;
    return numberValue.toLocaleString('en-US', decimalConfig(decimals, decimals));
  }
  if (Math.abs(numberValue) >= 1000) {
    return numberValue.toLocaleString('en-US', decimalConfig(2, 2));
  }
  if (Math.abs(numberValue) < 1) {
    return numberValue.toLocaleString('en-US', decimalConfig(4, 4));
  }
  return numberValue.toLocaleString('en-US', decimalConfig(2, 2));
}

export function formatMarketPercent(value) {
  const numberValue = finiteNumber(value);
  if (numberValue === null) return 'N/A';
  const sign = numberValue > 0 ? '+' : '';
  return `${sign}${numberValue.toFixed(2)}%`;
}

export function formatMarketChange(value) {
  const numberValue = finiteNumber(value);
  if (numberValue === null) return 'N/A';
  const sign = numberValue > 0 ? '+' : '';
  return `${sign}${numberValue.toFixed(2)}`;
}

export function formatMarketVolume(value) {
  const numberValue = finiteNumber(value);
  if (numberValue === null) return 'N/A';
  if (Math.abs(numberValue) >= 1_000_000_000) return `${(numberValue / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(numberValue) >= 1_000_000) return `${(numberValue / 1_000_000).toFixed(1)}M`;
  if (Math.abs(numberValue) >= 1_000) return `${(numberValue / 1_000).toFixed(1)}K`;
  return String(Math.round(numberValue));
}

export function marketChangeState(value) {
  const numberValue = finiteNumber(value);
  if (numberValue === null || numberValue === 0) return 'neutral';
  return numberValue > 0 ? 'positive' : 'negative';
}
