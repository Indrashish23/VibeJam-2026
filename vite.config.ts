import { defineConfig } from 'vite'

// Three.js ships as one main chunk (~500kB minified); we keep a single static import for fast first paint (no lazy route).
export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
  preview: {
    port: 4173,
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
})
