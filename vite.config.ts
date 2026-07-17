import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Cloudflare Quick Tunnels + LAN access for dev/preview
  server: {
    host: '127.0.0.1',
    allowedHosts: true,
  },
  preview: {
    host: '127.0.0.1',
    // Allow trycloudflare.com reverse-proxy Host headers
    allowedHosts: true,
  },
})
