import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/finanzas/',
  server: {
    port: 5187,
    proxy: {
      // Shared app launcher (served by nginx in production): launcher/ dev server.
      '/launcher': {
        target: 'http://localhost:5195',
        changeOrigin: true,
      },
      '/finanzas/api': {
        target: 'http://localhost:3014',
        changeOrigin: true,
      },
      // Proxy para Keycloak: strips /keycloak prefix (Keycloak en local está en raíz)
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
