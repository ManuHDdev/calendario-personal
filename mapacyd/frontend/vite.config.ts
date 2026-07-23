import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/mapacyd/',
  server: {
    port: 5175,
    proxy: {
      '/mapacyd/api': {
        target: 'http://localhost:3003',
        rewrite: (path) => path.replace(/^\/mapacyd/, ''),
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
})
