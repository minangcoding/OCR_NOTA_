import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const OCR_PROXY_TIMEOUT_MS = 600000

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4001,
    allowedHosts: ['recipfly.inspirova.my.id'],
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        timeout: OCR_PROXY_TIMEOUT_MS,
        proxyTimeout: OCR_PROXY_TIMEOUT_MS,
      },
    },
  },
})
