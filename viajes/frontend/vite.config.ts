import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/viajes/',
  server: {
    port: 5191,
    proxy: {
      '/viajes/api': {
        target: 'http://localhost:3017',
        changeOrigin: true,
      },
      // Keycloak proxy: strips the /keycloak prefix (Keycloak lives at the root locally)
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
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
