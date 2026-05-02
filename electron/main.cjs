const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const isDevServer = process.env.ELECTRON_DEV_SERVER === '1'

/**
 * Editor bridge bootstrap:
 * - `--editor` (anywhere in argv, after the `--` separator or not) opens the editor overlay on boot.
 * - `scenesDir` is the on-disk folder the editor reads/writes scene JSON to.
 *   In prod (packaged exe), it sits next to the exe under `Assets/Scenes/`; `asarUnpack`
 *   in package.json keeps this path real-disk-writable instead of inside the read-only asar.
 *   In dev it points back at the repo's `Assets/Scenes/` so editor edits land in git.
 */
const editorEnabled = process.argv.includes('--editor')

function resolveScenesDir() {
  if (app.isPackaged) {
    /* electron-builder portable: `PORTABLE_EXECUTABLE_DIR` points at the folder the user
     * launched the .exe from; `app.getPath('exe')` would point into a temp extraction dir.
     * Fall back to dirname(exe) for nsis/non-portable distributions. */
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
    const base = portableDir && portableDir.length > 0
      ? portableDir
      : path.dirname(app.getPath('exe'))
    return path.join(base, 'Assets', 'Scenes')
  }
  return path.join(__dirname, '..', 'Assets', 'Scenes')
}

const scenesDir = resolveScenesDir()
try {
  fs.mkdirSync(scenesDir, { recursive: true })
} catch {
  /* best-effort — handlers below will surface the real error */
}

/** Folder for optional `partykit-host.txt` (next to portable exe, same as Scenes/). */
function resolvePortableBaseDir() {
  if (app.isPackaged) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
    return portableDir && portableDir.length > 0
      ? portableDir
      : path.dirname(app.getPath('exe'))
  }
  return path.join(__dirname, '..')
}

function normalizePartyKitHost(raw) {
  if (raw == null || typeof raw !== 'string') return ''
  let t = raw.trim()
  if (!t || t.startsWith('#')) return ''
  const hash = t.indexOf('#')
  if (hash >= 0) t = t.slice(0, hash).trim()
  return t
    .replace(/^wss?:\/\//i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
}

/**
 * Runtime PartyKit host for packaged EXE when `VITE_PARTYKIT_HOST` was not baked at Vite build.
 * Resolution order: `process.env.VITE_PARTYKIT_HOST` / `PARTYKIT_HOST` → `Assets/Config/partykit-host.txt`
 * next to the executable (one host per line, no protocol).
 */
function resolveRuntimePartyKitHost() {
  try {
    const fromEnv = process.env.VITE_PARTYKIT_HOST || process.env.PARTYKIT_HOST
    if (fromEnv) {
      const n = normalizePartyKitHost(String(fromEnv))
      if (n) return n
    }
  } catch {
    /* ignore */
  }
  try {
    const base = resolvePortableBaseDir()
    const configDir = path.join(base, 'Assets', 'Config')
    const p = path.join(configDir, 'partykit-host.txt')
    if (!fs.existsSync(p)) return ''
    const text = fs.readFileSync(p, 'utf8')
    const line =
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('#')) ?? ''
    return normalizePartyKitHost(line)
  } catch {
    return ''
  }
}

ipcMain.on('vibejam:get-partykit-host', (event) => {
  event.returnValue = resolveRuntimePartyKitHost()
})

/** Validate a scene filename to prevent path traversal or escaping scenesDir. */
function safeSceneName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 128) return null
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return null
  if (!name.endsWith('.json')) return null
  return name
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'Vibe Jam',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDevServer) {
    win.loadURL('http://127.0.0.1:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

/* IPC: scoped filesystem access against `scenesDir` only. All handlers reject any
 * filename that fails `safeSceneName`. Nothing outside scenesDir is ever reachable. */
ipcMain.handle('editor:fs:list', async () => {
  try {
    const entries = await fs.promises.readdir(scenesDir)
    return entries.filter((e) => e.endsWith('.json')).sort()
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) }
  }
})

ipcMain.handle('editor:fs:read', async (_event, name) => {
  const safe = safeSceneName(name)
  if (!safe) return { error: 'invalid_filename' }
  try {
    const raw = await fs.promises.readFile(path.join(scenesDir, safe), 'utf-8')
    return { data: raw }
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) }
  }
})

ipcMain.handle('editor:fs:write', async (_event, name, json) => {
  const safe = safeSceneName(name)
  if (!safe) return { error: 'invalid_filename' }
  if (typeof json !== 'string') return { error: 'invalid_payload' }
  try {
    await fs.promises.writeFile(path.join(scenesDir, safe), json, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) }
  }
})

ipcMain.handle('editor:fs:delete', async (_event, name) => {
  const safe = safeSceneName(name)
  if (!safe) return { error: 'invalid_filename' }
  try {
    await fs.promises.unlink(path.join(scenesDir, safe))
    return { ok: true }
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) }
  }
})

ipcMain.handle('editor:bootstrap', async () => {
  return { editorEnabled, scenesDir }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
