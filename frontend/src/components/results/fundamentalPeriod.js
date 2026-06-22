export function expandYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  if (year < 100) return year < 50 ? 2000 + year : 1900 + year;
  return year;
}

export function displayPeriodLabel(period) {
  const raw = String(period?.display_period || period?.label || period?.period || '').trim();
  let match = raw.match(/^FY\s?(\d{2}|\d{4})$/i);
  if (match) {
    const year = expandYear(match[1]);
    return year ? `FY ${year}` : '-';
  }

  match = raw.match(/^FY\s?(\d{2}|\d{4})Q([1-4])$/i) || raw.match(/^Q([1-4])\s?(\d{2}|\d{4})$/i);
  if (match) {
    const quarter = match[0].toUpperCase().startsWith('FY') ? match[2] : match[1];
    const year = expandYear(match[0].toUpperCase().startsWith('FY') ? match[1] : match[2]);
    return year ? `Q${quarter} ${year}` : '-';
  }

  return raw || '-';
}
