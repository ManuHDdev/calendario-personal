import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/mapacyd/',
  server: {
    port: 5174,
    proxy: {
      '/mapacyd/api': {
        target: 'http://localhost:3003',
        rewrite: (path) => path.replace(/^\/mapacyd/, ''),
        changeOrigin: true,
      },
    },
  },
})
