import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';
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
    // These are shared by lazy Quiz/Results routes. Discover them before route
    // navigation so dev optimization does not invalidate an in-flight import.
    optimizeDeps: { include: ['react-markdown', 'remark-math', 'rehype-katex'] },
    server: {
      port,
      fs: { allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL('../../contracts', import.meta.url))] },
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/uploads': { target: proxyTarget, changeOrigin: true },
        '/media': { target: proxyTarget, changeOrigin: true },
        '/socket.io': { target: proxyTarget, ws: true },
      },
    },
  };
});
