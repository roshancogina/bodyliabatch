import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// batch.bodylia.in — public verification portal + staff console (static SPA).
// Hash routing (src/lib/router.ts) means no server rewrites are needed,
// but preview/host is pinned to the canonical subdomain for QR deep links.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})

