import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const OCR_PROXY_TIMEOUT_MS = 600000

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: OCR_PROXY_TIMEOUT_MS,
        proxyTimeout: OCR_PROXY_TIMEOUT_MS,
      },
    },
  }
})
