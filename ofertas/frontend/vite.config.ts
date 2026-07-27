import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/ofertas/',
  server: {
    port: 5178,
    proxy: {
      '/ofertas/api': {
        target: 'http://localhost:3006',
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
