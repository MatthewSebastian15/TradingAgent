import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const viteHost = process.env.VITE_DEV_HOST || '127.0.0.1';
const vitePort = Number(process.env.VITE_DEV_PORT || 3000);

export default defineConfig({
  plugins: [react()],
  server: {
    host: viteHost,
    port: vitePort,
    strictPort: true,
  },
  preview: {
    host: viteHost,
    port: vitePort,
    strictPort: true,
  },
});
