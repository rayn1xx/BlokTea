import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      // на Windows "localhost" может слушаться только как IPv6 (::1) — браузер не подключается
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        // запросы к /api проксируются на бэкенд
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
