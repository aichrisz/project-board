import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE=/project-board/ for GitHub Pages project site; default `/` for local.
const base = process.env.VITE_BASE || '/'

// https://vite.dev/config/
export default defineConfig({
  base,
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
