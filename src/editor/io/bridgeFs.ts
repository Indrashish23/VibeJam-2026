import type { BridgeFsApi } from '../types'

/**
 * Unified fs client for scene I/O. Prefers the Electron preload bridge
 * (`window.editorBridge.fs`) when running inside the desktop exe; falls back to the
 * Vite DEV middleware at `/__editor_fs/` when running in a plain browser.
 *
 * Both transports follow the same contract (see `BridgeFsApi`). Any production web
 * build without the Electron bridge and without the dev middleware will see
 * "bridge_unavailable" errors and should hide the File menu.
 */

const DEV_FS_BASE = '/__editor_fs'

function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && !!window.editorBridge?.fs
}

const httpBridge: BridgeFsApi = {
  async list() {
    try {
      const res = await fetch(`${DEV_FS_BASE}/`)
      if (!res.ok) return { error: `http_${res.status}` }
      const body = (await res.json()) as { files?: string[]; error?: string }
      if (body.error) return { error: body.error }
      return body.files ?? []
    } catch (err) {
      return { error: String(err instanceof Error ? err.message : err) }
    }
  },
  async read(name: string) {
    try {
      const res = await fetch(`${DEV_FS_BASE}/${encodeURIComponent(name)}`)
      if (!res.ok) return { error: `http_${res.status}` }
      const data = await res.text()
      return { data }
    } catch (err) {
      return { error: String(err instanceof Error ? err.message : err) }
    }
  },
  async write(name: string, json: string) {
    try {
      const res = await fetch(`${DEV_FS_BASE}/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      })
      if (!res.ok) return { error: `http_${res.status}` }
      return { ok: true }
    } catch (err) {
      return { error: String(err instanceof Error ? err.message : err) }
    }
  },
  async delete(name: string) {
    try {
      const res = await fetch(`${DEV_FS_BASE}/${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (!res.ok) return { error: `http_${res.status}` }
      return { ok: true }
    } catch (err) {
      return { error: String(err instanceof Error ? err.message : err) }
    }
  },
}

export function getBridgeFs(): BridgeFsApi {
  if (hasElectronBridge()) return window.editorBridge!.fs
  return httpBridge
}

export async function isFsAvailable(): Promise<boolean> {
  const fs = getBridgeFs()
  const res = await fs.list()
  if (Array.isArray(res)) return true
  return false
}
