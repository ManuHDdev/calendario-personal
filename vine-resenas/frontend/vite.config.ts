/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/vine-resenas/',
  server: {
    port: 5193,
    proxy: {
      // Shared app launcher (served by nginx in production): launcher/ dev server.
      '/launcher': {
        target: 'http://localhost:5195',
        changeOrigin: true,
      },
      '/vine-resenas/api': {
        target: 'http://localhost:3018',
        changeOrigin: true,
      },
      // Keycloak locally lives at the root, so strip the /keycloak prefix.
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
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
