import type { CommandStack } from '../CommandStack'
import type { SceneStore } from '../SceneStore'
import { getBridgeFs } from '../io/bridgeFs'
import type { EditorAPI, EntityTypeDefinition, MenuItemConfig, SceneFile, ToolbarButtonConfig } from '../types'
import type { ViewportHost } from './ViewportHost'

interface ToolbarDeps {
  container: HTMLElement
  store: SceneStore
  commandStack: CommandStack
  viewport: ViewportHost
  api: EditorAPI
  /** Internal helpers that Plugin API can't touch — these fire the Play / SceneApply hooks. */
  internal: {
    fireOnPlay: () => void
    fireOnSceneApply: (scene: SceneFile) => void
    requestClose: () => void
  }
}

/**
 * Top toolbar — File/Edit/View/Play + active-mode indicator. Also implements
 * scenes-io against `window.editorBridge.fs` (Electron) with HTTP fallback
 * (`bridgeFs.ts`). Save writes JSON + fires onSceneApply. Play closes the editor
 * overlay and fires onPlay. Shortcuts:
 *   Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z — undo / redo / redo
 *   W / E / R                       — translate / rotate / scale gizmo
 *   F                               — frame selected
 *   Ctrl+S                          — save
 *   Delete                          — delete selected (forwarded by ViewportHost)
 */
export class Toolbar {
  private fs = getBridgeFs()
  private sceneNameInput: HTMLInputElement
  private fileSelect: HTMLSelectElement
  private modeBadge: HTMLSpanElement
  private undoBtn: HTMLButtonElement
  private redoBtn: HTMLButtonElement
  private currentFilename: string | null = null
  private statusEl: HTMLElement
  private statusTimer: number | null = null
  private keyHandler: (e: KeyboardEvent) => void
  private unsub: () => void
  private customToolbarButtons: HTMLElement
  private customMenuExtras: Map<string, MenuItemConfig[]> = new Map()
  private deps: ToolbarDeps

  constructor(deps: ToolbarDeps) {
    this.deps = deps
    deps.container.className = 'toolbar'

    /* --- File group --- */
    const fileGroup = this.group()
    this.fileSelect = document.createElement('select')
    this.fileSelect.title = 'Scenes on disk'
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = '— scene —'
    this.fileSelect.appendChild(placeholder)
    this.fileSelect.addEventListener('change', () => {
      if (this.fileSelect.value) void this.loadScene(this.fileSelect.value)
    })
    fileGroup.appendChild(this.fileSelect)

    const newBtn = this.button('New')
    newBtn.addEventListener('click', () => this.newScene())
    fileGroup.appendChild(newBtn)

    const saveBtn = this.button('Save')
    saveBtn.addEventListener('click', () => void this.saveScene())
    fileGroup.appendChild(saveBtn)

    const saveAsBtn = this.button('Save As…')
    saveAsBtn.addEventListener('click', () => void this.saveAsScene())
    fileGroup.appendChild(saveAsBtn)

    const reloadBtn = this.button('↻')
    reloadBtn.title = 'Refresh scene list'
    reloadBtn.addEventListener('click', () => void this.refreshFileList())
    fileGroup.appendChild(reloadBtn)

    /* --- Edit group --- */
    const editGroup = this.group()
    this.undoBtn = this.button('Undo')
    this.undoBtn.addEventListener('click', () => deps.commandStack.undo())
    editGroup.appendChild(this.undoBtn)
    this.redoBtn = this.button('Redo')
    this.redoBtn.addEventListener('click', () => deps.commandStack.redo())
    editGroup.appendChild(this.redoBtn)

    /* --- View group --- */
    const viewGroup = this.group()
    const gridBtn = this.button('Grid')
    gridBtn.classList.add('active')
    gridBtn.addEventListener('click', () => {
      const next = !gridBtn.classList.contains('active')
      gridBtn.classList.toggle('active', next)
      deps.viewport.setGridVisible(next)
    })
    viewGroup.appendChild(gridBtn)

    const gizmoBtn = this.button('Gizmo')
    gizmoBtn.classList.add('active')
    gizmoBtn.addEventListener('click', () => {
      const next = !gizmoBtn.classList.contains('active')
      gizmoBtn.classList.toggle('active', next)
      deps.viewport.setGizmoVisible(next)
    })
    viewGroup.appendChild(gizmoBtn)

    /* --- Mode indicator --- */
    const modeGroup = this.group()
    this.modeBadge = document.createElement('span')
    this.modeBadge.className = 'mode-indicator'
    this.modeBadge.textContent = 'TRANSLATE'
    modeGroup.appendChild(this.modeBadge)

    /* --- Plugin-contributed buttons --- */
    this.customToolbarButtons = this.group()
    this.customToolbarButtons.dataset.slot = 'plugin'

    /* --- Play (far right, green) --- */
    const playGroup = this.group()
    const playBtn = this.button('▶ Play')
    playBtn.classList.add('primary')
    playBtn.title = 'Close editor and resume game'
    playBtn.addEventListener('click', () => this.onPlay())
    playGroup.appendChild(playBtn)

    /* --- Status toast (floats at bottom-right over viewport) --- */
    this.statusEl = document.createElement('div')
    this.statusEl.className = 'status-toast'
    deps.container.parentElement?.appendChild(this.statusEl)

    /* --- Name input (hidden, used as edit-in-place for scene name) --- */
    this.sceneNameInput = document.createElement('input')
    this.sceneNameInput.type = 'hidden'

    /* --- Subscriptions --- */
    this.unsub = deps.commandStack.onChange(() => this.refreshUndoRedo())
    this.refreshUndoRedo()

    /* Refresh mode badge whenever viewport mode changes (polled per keydown). */
    /* --- Keyboard shortcuts --- */
    this.keyHandler = (e: KeyboardEvent) => this.onKey(e)
    window.addEventListener('keydown', this.keyHandler)

    /* --- Initial scene list fetch --- */
    void this.refreshFileList()
  }

  dispose(): void {
    this.unsub()
    window.removeEventListener('keydown', this.keyHandler)
    if (this.statusTimer) clearTimeout(this.statusTimer)
    this.statusEl.remove()
  }

  /** Plugin surface: add a custom button to the right toolbar group. */
  addButton(config: ToolbarButtonConfig): void {
    const btn = this.button(config.label)
    if (config.icon) btn.textContent = `${config.icon} ${config.label}`
    btn.title = config.label
    btn.addEventListener('click', config.onClick)
    this.customToolbarButtons.appendChild(btn)
  }

  /** Plugin surface: registers a menu item under a named menu. Stored for future menu opens. */
  addMenuItem(menu: string, config: MenuItemConfig): void {
    let arr = this.customMenuExtras.get(menu)
    if (!arr) {
      arr = []
      this.customMenuExtras.set(menu, arr)
    }
    arr.push(config)
  }

  onModeChange(mode: string): void {
    this.modeBadge.textContent = mode.toUpperCase()
  }

  /* ---------- internal ---------- */

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

    const mod = e.ctrlKey || e.metaKey
    if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault()
      this.deps.commandStack.undo()
    } else if (mod && ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) {
      e.preventDefault()
      this.deps.commandStack.redo()
    } else if (mod && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      void this.saveScene()
    } else if (e.key === 'w' || e.key === 'W') {
      this.deps.viewport.setMode('translate')
      this.onModeChange('translate')
    } else if (e.key === 'e' || e.key === 'E') {
      this.deps.viewport.setMode('rotate')
      this.onModeChange('rotate')
    } else if (e.key === 'r' || e.key === 'R') {
      this.deps.viewport.setMode('scale')
      this.onModeChange('scale')
    }
  }

  private refreshUndoRedo(): void {
    this.undoBtn.disabled = !this.deps.commandStack.canUndo()
    this.redoBtn.disabled = !this.deps.commandStack.canRedo()
    const label = this.deps.commandStack.lastLabel()
    if (label) this.undoBtn.title = `Undo: ${label}`
    else this.undoBtn.title = 'Nothing to undo'
  }

  /* ---------- scene I/O ---------- */

  private async refreshFileList(): Promise<void> {
    const res = await this.fs.list()
    const files = Array.isArray(res) ? res : []
    this.fileSelect.innerHTML = ''
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = files.length > 0 ? '— open scene —' : '— no scenes —'
    this.fileSelect.appendChild(placeholder)
    for (const name of files) {
      const opt = document.createElement('option')
      opt.value = name
      opt.textContent = name
      if (this.currentFilename === name) opt.selected = true
      this.fileSelect.appendChild(opt)
    }
  }

  private newScene(): void {
    if (this.deps.store.getAll().length > 0 && !confirm('Discard current scene?')) return
    this.deps.store.clear()
    this.deps.commandStack.clear()
    /* seed with a single empty root so the user has something in the tree */
    const emptyDef: EntityTypeDefinition | undefined = this.deps.api.entityTypes.get('empty')
    if (emptyDef) this.deps.api.scene.create('empty', { name: 'Scene' })
    this.currentFilename = null
    this.toast('New scene')
  }

  private async loadScene(name: string): Promise<void> {
    const res = await this.fs.read(name)
    if (!res.data) {
      this.toast(`Load failed: ${res.error ?? 'unknown'}`, true)
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(res.data)
    } catch (err) {
      this.toast(`Invalid JSON: ${err instanceof Error ? err.message : err}`, true)
      return
    }
    const file = normalizeSceneFile(parsed, this.deps.api)
    this.deps.store.deserialize(file)
    this.deps.commandStack.clear()
    this.currentFilename = name
    this.toast(`Loaded ${name}`)
    /* Hot-apply on load so user lands into the edited scene visually. */
    this.deps.internal.fireOnSceneApply(this.deps.store.serialize())
  }

  private async saveScene(): Promise<void> {
    let name = this.currentFilename
    if (!name) {
      name = prompt('Scene filename (will be saved as *.json):', 'scene.json')
      if (!name) return
      if (!name.endsWith('.json')) name = `${name}.json`
      this.currentFilename = name
    }
    const file = this.deps.store.serialize()
    file.name = name.replace(/\.json$/, '')
    const raw = JSON.stringify(file, null, 2)
    const res = await this.fs.write(name, raw)
    if (res.ok) {
      this.toast(`Saved ${name}`)
      void this.refreshFileList()
      /* Fire hot-apply so the game reflects the save immediately. */
      this.deps.internal.fireOnSceneApply(file)
    } else {
      this.toast(`Save failed: ${res.error ?? 'unknown'}`, true)
    }
  }

  private async saveAsScene(): Promise<void> {
    const prev = this.currentFilename
    this.currentFilename = null
    await this.saveScene()
    if (!this.currentFilename) this.currentFilename = prev
  }

  private onPlay(): void {
    /* Final apply then close overlay; game resumes its loop. */
    this.deps.internal.fireOnSceneApply(this.deps.store.serialize())
    this.deps.internal.fireOnPlay()
    this.deps.internal.requestClose()
  }

  /* ---------- helpers ---------- */

  private group(): HTMLElement {
    const g = document.createElement('div')
    g.className = 'group'
    this.deps.container.appendChild(g)
    return g
  }

  private button(text: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    return b
  }

  private toast(text: string, error = false): void {
    this.statusEl.textContent = text
    this.statusEl.classList.toggle('error', error)
    this.statusEl.classList.add('show')
    if (this.statusTimer) clearTimeout(this.statusTimer)
    this.statusTimer = window.setTimeout(() => {
      this.statusEl.classList.remove('show')
    }, 2200)
  }
}

/**
 * Load-time coercion: older files or hand-edited JSON may reference entity types that
 * aren't in the registry. Fall back to `empty`, preserve the original type in
 * `metadata.__unknownType` for round-trip, and push a console warn.
 */
function normalizeSceneFile(raw: unknown, api: EditorAPI): SceneFile {
  const base: SceneFile = {
    version: 1,
    name: 'Untitled',
    entities: [],
    metadata: {},
  }
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>
  if (typeof obj.name === 'string') base.name = obj.name
  if (obj.metadata && typeof obj.metadata === 'object') base.metadata = { ...obj.metadata }
  if (Array.isArray(obj.entities)) {
    for (const e of obj.entities) {
      if (!e || typeof e !== 'object') continue
      const ent = e as Record<string, unknown>
      const type = typeof ent.type === 'string' && api.entityTypes.has(ent.type) ? ent.type : 'empty'
      const unknown = type === 'empty' && ent.type !== 'empty' ? ent.type : null
      const tr = (ent.transform as Record<string, unknown>) || {}
      base.entities.push({
        id: typeof ent.id === 'string' ? ent.id : cryptoId(),
        name: typeof ent.name === 'string' ? ent.name : 'Entity',
        type,
        parentId: typeof ent.parentId === 'string' ? ent.parentId : null,
        children: Array.isArray(ent.children) ? (ent.children as string[]).filter((c) => typeof c === 'string') : [],
        transform: {
          position: coerceVec3(tr.position) ?? [0, 0, 0],
          rotation: coerceVec3(tr.rotation) ?? [0, 0, 0],
          scale: coerceVec3(tr.scale) ?? [1, 1, 1],
        },
        properties: ent.properties && typeof ent.properties === 'object' ? { ...(ent.properties as object) } : {},
        components: Array.isArray(ent.components)
          ? (ent.components as Array<Record<string, unknown>>).map((c) => ({
              componentId: String(c.componentId ?? 'unknown'),
              properties: c.properties && typeof c.properties === 'object' ? { ...(c.properties as object) } : {},
            }))
          : [],
        metadata: {
          ...(ent.metadata && typeof ent.metadata === 'object' ? (ent.metadata as object) : {}),
          ...(unknown ? { __unknownType: unknown } : {}),
        },
      })
      if (unknown) console.warn(`[editor] unknown entity type "${unknown}" coerced to empty`)
    }
  }
  return base
}

function coerceVec3(v: unknown): [number, number, number] | null {
  if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')) {
    return [v[0], v[1], v[2]]
  }
  return null
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as { randomUUID: () => string }).randomUUID()
  }
  return `e-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}
