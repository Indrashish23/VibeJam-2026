import { defineConfig, type Plugin } from 'vite'
import * as fs from 'node:fs'
import * as path from 'node:path'

// Electron loads `dist/index.html` via `file://`; relative `base` is required for asset URLs.
// Web / Vercel keep default `/`. Set `ELECTRON=1` when running `vite build` for the desktop bundle.
const electron = process.env.ELECTRON === '1'

/**
 * DEV-only fs bridge for the scene editor. In Electron we use `window.editorBridge`
 * (backed by preload IPC). In plain-browser `npm run dev` we instead hit these HTTP
 * endpoints — same contract, different transport — so the editor works identically
 * in both. The plugin is only active during `vite serve`; production builds never
 * see it.
 *
 * Endpoints (all scoped to `./Assets/Scenes/` relative to the project root):
 *   GET    /__editor_fs/                 → JSON: { files: string[] }
 *   GET    /__editor_fs/:name.json       → raw scene JSON
 *   PUT    /__editor_fs/:name.json       → write raw body to file
 *   DELETE /__editor_fs/:name.json       → delete file
 */
function editorFsDevPlugin(): Plugin {
  return {
    name: 'vibejam-editor-fs-dev',
    apply: 'serve',
    configureServer(server) {
      const projectRoot = server.config.root
      const scenesDir = path.join(projectRoot, 'Assets', 'Scenes')
      try {
        fs.mkdirSync(scenesDir, { recursive: true })
      } catch {
        /* ignore — handlers surface errors */
      }

      function safeName(name: string): string | null {
        if (!name || name.length > 128) return null
        if (name.includes('..') || name.includes('/') || name.includes('\\')) return null
        if (!name.endsWith('.json')) return null
        return name
      }

      server.middlewares.use('/__editor_fs', async (req, res) => {
        const method = (req.method || 'GET').toUpperCase()
        const urlPath = (req.url || '/').split('?')[0]
        const rawName = urlPath === '/' || urlPath === '' ? '' : urlPath.replace(/^\/+/, '')

        try {
          if (method === 'GET' && rawName === '') {
            const entries = await fs.promises.readdir(scenesDir)
            const files = entries.filter((e) => e.endsWith('.json')).sort()
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({ files }))
            return
          }

          const safe = safeName(rawName)
          if (!safe) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'invalid_filename' }))
            return
          }
          const full = path.join(scenesDir, safe)

          if (method === 'GET') {
            const raw = await fs.promises.readFile(full, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(raw)
            return
          }

          if (method === 'PUT') {
            const chunks: Buffer[] = []
            req.on('data', (c: Buffer) => chunks.push(c))
            await new Promise<void>((resolve) => req.on('end', () => resolve()))
            const body = Buffer.concat(chunks).toString('utf-8')
            await fs.promises.writeFile(full, body, 'utf-8')
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true }))
            return
          }

          if (method === 'DELETE') {
            await fs.promises.unlink(full)
            res.statusCode = 200
            res.end(JSON.stringify({ ok: true }))
            return
          }

          res.statusCode = 405
          res.end(JSON.stringify({ error: 'method_not_allowed' }))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }))
        }
      })
    },
  }
}

// Three.js ships as one main chunk (~500kB minified); we keep a single static import for fast first paint (no lazy route).
export default defineConfig({
  base: electron ? './' : '/',
  // `.gltf` (multi-file GLTF) + its companion `.bin` aren't in Vite's default asset list.
  // Treating them as static assets lets `new URL(...)` emit them to dist with hashes.
  // The Vibe Jam exit portal model (`Assets/Props/portall.gltf`) needs both.
  assetsInclude: ['**/*.gltf', '**/*.bin'],
  plugins: [editorFsDevPlugin()],
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
