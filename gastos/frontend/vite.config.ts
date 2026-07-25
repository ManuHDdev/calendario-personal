import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/gastos/',
  server: {
    port: 5177,
    proxy: {
      '/gastos/api': {
        target: 'http://localhost:3005',
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
