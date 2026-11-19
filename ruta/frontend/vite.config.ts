import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/ruta/',
  server: {
    port: 5183,
    proxy: {
      // Shared app launcher (served by nginx in production): launcher/ dev server.
      '/launcher': {
        target: 'http://localhost:5195',
        changeOrigin: true,
      },
      '/ruta/api': {
        target: 'http://localhost:3011',
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
