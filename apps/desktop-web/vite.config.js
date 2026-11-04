import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL;
  const port = Number(env.VITE_DEV_PORT);
  if (!apiUrl) throw new Error('VITE_API_URL is required');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('VITE_DEV_PORT must be an integer from 1 to 65535');
  }

  const proxyTarget = new URL(apiUrl).origin;
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/uploads': { target: proxyTarget, changeOrigin: true },
        '/media': { target: proxyTarget, changeOrigin: true },
        '/socket.io': { target: proxyTarget, ws: true },
      },
    },
  };
});
