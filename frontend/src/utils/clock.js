const FALLBACK_TIME_ZONE = 'UTC';

function isSupportedTimeZone(timeZone) {
  if (!timeZone) return false;

  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getTimeZoneName(timeZone, date, timeZoneName) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName,
    }).formatToParts(date);

    return parts.find((part) => part.type === 'timeZoneName')?.value?.trim() || '';
  } catch {
    return '';
  }
}

function getDatePart(parts, type, fallback = '0') {
  return Number(parts.find((part) => part.type === type)?.value ?? fallback);
}

function formatOffsetLabel(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const utcTime = Date.UTC(
    getDatePart(parts, 'year'),
    getDatePart(parts, 'month') - 1,
    getDatePart(parts, 'day'),
    getDatePart(parts, 'hour'),
    getDatePart(parts, 'minute'),
    getDatePart(parts, 'second')
  );
  const offsetMinutes = Math.round((utcTime - date.getTime()) / 60000);

  if (offsetMinutes === 0) return 'UTC';

  const sign = offsetMinutes > 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

export function resolveDeviceTimeZone() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isSupportedTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
}

export function resolveTimeZoneLabel(timeZone, date = new Date()) {
  if (!isSupportedTimeZone(timeZone)) return FALLBACK_TIME_ZONE;

  return (
    getTimeZoneName(timeZone, date, 'shortOffset') ||
    getTimeZoneName(timeZone, date, 'short') ||
    formatOffsetLabel(timeZone, date)
  );
}

export function resolveClockConfig(date = new Date()) {
  const timeZone = resolveDeviceTimeZone();

  return {
    timeZone,
    label: resolveTimeZoneLabel(timeZone, date),
  };
}

export function createClockFormatter(config = resolveClockConfig()) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: config.timeZone,
  });
}
