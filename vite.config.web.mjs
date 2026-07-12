// Web (PWA) build target for Sniddy — serves the same React renderer as a
// plain website so it can be hosted and installed to a phone home screen.
// The Electron build still uses electron.vite.config.mjs; this is separate.
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true
  },
  server: {
    host: true, // expose on the LAN so a phone/tunnel can reach the dev server
    port: 5175,
    allowedHosts: true, // accept LAN-IP and ngrok/tunnel Host headers
    // One origin serves both app and API. In local dev, media calls go to the
    // deployed Cloudflare Functions (R2-backed); other /api → the local auth
    // backend. (More specific /api/media key must come first.)
    proxy: {
      '/api/media': { target: 'https://sniddy.pages.dev', changeOrigin: true, secure: true },
      '/api': { target: 'http://localhost:4500', changeOrigin: true }
    }
  },
  preview: {
    host: true,
    port: 5175,
    allowedHosts: true
  }
})
