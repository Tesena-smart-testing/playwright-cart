import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the server during local dev
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy report static files to the server during local dev
      '/reports': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
