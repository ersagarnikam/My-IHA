import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the API runs on :8080; proxying /api keeps the browser on one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Lets a Cloudflare quick tunnel (cloudflared tunnel --url http://localhost:5173) reach the dev server.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        // The browser only ever talks to this dev server, so API calls are same-origin from its
        // point of view. Presenting the dev origin keeps the API's CORS check (which allows only
        // http://localhost:5173) from rejecting pages opened through another host name, e.g. a tunnel.
        headers: { origin: 'http://localhost:5173' },
      },
    },
  },
})
