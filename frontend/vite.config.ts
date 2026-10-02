import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api/orders-service': { target: 'http://localhost:5090', changeOrigin: true }, '/api': { target: 'http://localhost:5080', changeOrigin: true } }
  }
})

