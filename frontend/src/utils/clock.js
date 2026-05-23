const DEFAULT_CLOCK_CONFIG = Object.freeze({
  timeZone: 'Asia/Jakarta',
  label: 'WIB',
});

function envValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSupportedTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveClockConfig(env = import.meta.env) {
  const configuredTimeZone = envValue(env?.VITE_CLOCK_TIME_ZONE);
  const configuredLabel = envValue(env?.VITE_CLOCK_LABEL);
  const timeZone = configuredTimeZone || DEFAULT_CLOCK_CONFIG.timeZone;

  if (!isSupportedTimeZone(timeZone)) {
    return { ...DEFAULT_CLOCK_CONFIG };
  }

  return {
    timeZone,
    label: configuredLabel || DEFAULT_CLOCK_CONFIG.label,
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
