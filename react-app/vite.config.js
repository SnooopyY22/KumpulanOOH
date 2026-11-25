import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 550
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com']
  }
})
