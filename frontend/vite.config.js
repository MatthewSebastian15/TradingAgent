import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const DEFAULT_DEV_HOST = '127.0.0.1';
const DEFAULT_DEV_PORT = 3000;
const DEFAULT_BACKEND_PROXY_TARGET = 'http://backend:8000';

function readStringEnv(env, name, fallback) {
  const value = env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readPortEnv(env, name, fallback) {
  const value = Number(env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const viteHost = readStringEnv(env, 'VITE_DEV_HOST', DEFAULT_DEV_HOST);
  const vitePort = readPortEnv(env, 'VITE_DEV_PORT', DEFAULT_DEV_PORT);
  const backendProxyTarget = readStringEnv(
    env,
    'VITE_BACKEND_PROXY_TARGET',
    DEFAULT_BACKEND_PROXY_TARGET
  );

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: viteHost,
      port: vitePort,
      strictPort: true,
      proxy: {
        '/api': {
          target: backendProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: viteHost,
      port: vitePort,
      strictPort: true,
    },
  };
});
