import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/locales/',
  server: {
    port: 5185,
    proxy: {
      // Shared app launcher (served by nginx in production): launcher/ dev server.
      '/launcher': {
        target: 'http://localhost:5195',
        changeOrigin: true,
      },
      '/locales/api': {
        target: 'http://localhost:3013',
        changeOrigin: true,
      },
      '/keycloak': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/keycloak/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
