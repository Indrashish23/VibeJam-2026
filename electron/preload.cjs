const { contextBridge, ipcRenderer } = require('electron')

/**
 * PartyKit host for packaged EXE: main reads env + `Assets/Config/partykit-host.txt` and
 * exposes it before the Vite bundle runs, so online lobby works without rebaking `VITE_*`.
 * See `src/net/partyKitHost.ts` (`window.__PARTYKIT_HOST`).
 */
let partyKitHostInject = ''
try {
  partyKitHostInject = String(ipcRenderer.sendSync('vibejam:get-partykit-host') || '').trim()
} catch {
  /* ignore */
}
if (partyKitHostInject) {
  contextBridge.exposeInMainWorld('__PARTYKIT_HOST', partyKitHostInject)
}

/**
 * Context-isolated bridge between the editor (renderer) and main process.
 * Exposed as `window.editorBridge`. The fs API is scoped to `Assets/Scenes/`
 * in the main process (see electron/main.cjs `safeSceneName`) — this preload
 * cannot widen that scope, it only forwards arguments.
 *
 * `ready()` fetches the main-process bootstrap info (editorEnabled, scenesDir)
 * asynchronously; `editorEnabled`/`scenesDir` are also hydrated eagerly on
 * `did-finish-load` via ipcRenderer below so they're available synchronously
 * by the time the renderer's module code runs.
 */

let cachedBootstrap = { editorEnabled: false, scenesDir: '' }

async function hydrateBootstrap() {
  try {
    const res = await ipcRenderer.invoke('editor:bootstrap')
    if (res && typeof res === 'object') cachedBootstrap = res
  } catch {
    /* ignore — editor defaults to disabled */
  }
}
void hydrateBootstrap()

contextBridge.exposeInMainWorld('editorBridge', {
  get editorEnabled() {
    return cachedBootstrap.editorEnabled === true
  },
  get scenesDir() {
    return cachedBootstrap.scenesDir || ''
  },
  ready: () => ipcRenderer.invoke('editor:bootstrap'),
  fs: {
    list: () => ipcRenderer.invoke('editor:fs:list'),
    read: (name) => ipcRenderer.invoke('editor:fs:read', name),
    write: (name, json) => ipcRenderer.invoke('editor:fs:write', name, json),
    delete: (name) => ipcRenderer.invoke('editor:fs:delete', name),
  },
})
