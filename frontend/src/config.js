const DEFAULT_FRONTEND_CONFIG = Object.freeze({
  apiBaseUrl: '/api',
  apiUrl: '',
});

function hasOwnEnvValue(env, key) {
  return env && Object.prototype.hasOwnProperty.call(env, key);
}

function readStringEnv(env, key, fallback) {
  if (!hasOwnEnvValue(env, key)) return fallback;
  const value = env[key];
  return typeof value === 'string' ? value.trim() : fallback;
}

export function resolveFrontendConfig(env = import.meta.env) {
  return {
    apiBaseUrl: readStringEnv(env, 'VITE_API_BASE_URL', DEFAULT_FRONTEND_CONFIG.apiBaseUrl),
    apiUrl: readStringEnv(env, 'VITE_API_URL', DEFAULT_FRONTEND_CONFIG.apiUrl),
  };
}

export const frontendConfig = resolveFrontendConfig();
