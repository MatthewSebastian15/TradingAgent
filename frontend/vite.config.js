import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const viteHost = process.env.VITE_DEV_HOST || '127.0.0.1';
const vitePort = Number(process.env.VITE_DEV_PORT || 3000);
const backendProxyTarget = process.env.VITE_BACKEND_PROXY_TARGET || 'http://backend:8000';

export default defineConfig({
  plugins: [react()],
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
});
