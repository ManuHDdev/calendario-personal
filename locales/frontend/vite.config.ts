import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/locales/',
  server: {
    port: 5185,
    proxy: {
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
