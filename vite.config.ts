import { defineConfig } from 'vite'

// Three.js ships as one main chunk (~500kB minified); we keep a single static import for fast first paint (no lazy route).
export default defineConfig({
  // `.gltf` (multi-file GLTF) + its companion `.bin` aren't in Vite's default asset list.
  // Treating them as static assets lets `new URL(...)` emit them to dist with hashes.
  // The Vibe Jam exit portal model (`Assets/Props/portall.gltf`) needs both.
  assetsInclude: ['**/*.gltf', '**/*.bin'],
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
