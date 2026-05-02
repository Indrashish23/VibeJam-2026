import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { CommandStack } from '../CommandStack'
import type { SceneStore } from '../SceneStore'
import type { AssetRegistry } from '../registries/AssetRegistry'
import type { ComponentRegistry } from '../registries/ComponentRegistry'
import type { EntityTypeRegistry } from '../registries/EntityTypeRegistry'
import type { EditorAPI, MenuItemConfig, PanelTabConfig, SceneFile, ToolbarButtonConfig } from '../types'
import { AssetPanel } from './AssetPanel'
import { Inspector } from './Inspector'
import { SceneTree } from './SceneTree'
import { Toolbar } from './Toolbar'
import { ViewportHost } from './ViewportHost'

const LAYOUT_STORAGE_KEY = 'vibejam_editor_layout'

interface ShellDeps {
  three: { scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer }
  store: SceneStore
  commandStack: CommandStack
  entityTypes: EntityTypeRegistry
  components: ComponentRegistry
  assets: AssetRegistry
  api: EditorAPI
  internal: {
    fireOnPlay: () => void
    fireOnSceneApply: (scene: SceneFile) => void
    requestClose: () => void
  }
}

/** Saved layout widths/heights (px). */
interface PersistedLayout {
  leftWidth?: number
  rightWidth?: number
  bottomHeight?: number
}

/**
 * The editor overlay shell — mounts one root div with CSS-grid:
 *   [toolbar] / [tree | viewport | inspector] / [asset panel]
 *
 * The viewport slot is `pointer-events: none` so clicks reach the game's
 * renderer canvas underneath (see ViewportHost). Split bars drag to resize
 * left/right panels and the bottom drawer; widths persist to localStorage.
 */
export class Shell {
  readonly root: HTMLElement
  readonly toolbar: Toolbar
  readonly sceneTree: SceneTree
  readonly inspector: Inspector
  readonly viewport: ViewportHost
  readonly assetPanel: AssetPanel
  private leftCol: HTMLElement
  private rightCol: HTMLElement
  private bottomRow: HTMLElement
  private extraTabs: Map<string, { host: HTMLElement; cleanup?: () => void }> = new Map()

  constructor(deps: ShellDeps) {
    this.root = document.createElement('div')
    this.root.className = 'editor-root'
    this.root.hidden = true

    const toolbarEl = document.createElement('div')
    toolbarEl.className = 'toolbar'
    this.root.appendChild(toolbarEl)

    this.leftCol = document.createElement('div')
    this.root.appendChild(this.leftCol)

    const viewportSlot = document.createElement('div')
    viewportSlot.className = 'viewport-slot'
    this.root.appendChild(viewportSlot)

    this.rightCol = document.createElement('div')
    this.root.appendChild(this.rightCol)

    this.bottomRow = document.createElement('div')
    this.root.appendChild(this.bottomRow)

    /* Split bars for resizing — positioned absolutely within root (grid cells aren't
     * resize-aware by default). */
    const splitLeft = document.createElement('div')
    splitLeft.className = 'split-bar-v'
    splitLeft.style.left = '220px'
    this.root.appendChild(splitLeft)

    const splitRight = document.createElement('div')
    splitRight.className = 'split-bar-v'
    splitRight.style.right = '280px'
    this.root.appendChild(splitRight)

    const splitBottom = document.createElement('div')
    splitBottom.className = 'split-bar-h'
    splitBottom.style.bottom = '180px'
    this.root.appendChild(splitBottom)

    this.viewport = new ViewportHost({
      slot: viewportSlot,
      three: deps.three,
      store: deps.store,
      commandStack: deps.commandStack,
      entityTypes: deps.entityTypes,
      assets: deps.assets,
      api: deps.api,
    })

    this.sceneTree = new SceneTree({
      container: this.leftCol,
      store: deps.store,
      commandStack: deps.commandStack,
      entityTypes: deps.entityTypes,
      api: deps.api,
    })

    this.rightCol.className = 'panel panel-right'
    const rightHeader = document.createElement('div')
    rightHeader.className = 'panel-header'
    const rightTitle = document.createElement('span')
    rightTitle.textContent = 'Inspector'
    rightHeader.appendChild(rightTitle)
    this.rightCol.appendChild(rightHeader)
    const rightBody = document.createElement('div')
    rightBody.className = 'panel-body'
    this.rightCol.appendChild(rightBody)
    this.inspector = new Inspector({
      container: rightBody,
      store: deps.store,
      commandStack: deps.commandStack,
      entityTypes: deps.entityTypes,
      components: deps.components,
      assets: deps.assets,
    })

    this.assetPanel = new AssetPanel({ container: this.bottomRow, assets: deps.assets })

    this.toolbar = new Toolbar({
      container: toolbarEl,
      store: deps.store,
      commandStack: deps.commandStack,
      viewport: this.viewport,
      api: deps.api,
      internal: deps.internal,
    })

    this.applyLayout(readLayout())
    this.bindSplit(splitLeft, 'left')
    this.bindSplit(splitRight, 'right')
    this.bindSplit(splitBottom, 'bottom')

    document.body.appendChild(this.root)
  }

  open(): void {
    this.root.hidden = false
    this.viewport.open()
  }

  close(): void {
    this.viewport.close()
    this.root.hidden = true
  }

  isOpen(): boolean {
    return !this.root.hidden
  }

  dispose(): void {
    this.toolbar.dispose()
    this.sceneTree.dispose()
    this.inspector.dispose()
    this.assetPanel.dispose()
    this.viewport.dispose()
    for (const tab of this.extraTabs.values()) tab.cleanup?.()
    this.root.remove()
  }

  /* ---------- plugin UI surface ---------- */

  addToolbarButton(config: ToolbarButtonConfig): void {
    this.toolbar.addButton(config)
  }

  addMenuItem(menu: string, config: MenuItemConfig): void {
    this.toolbar.addMenuItem(menu, config)
  }

  addPanelTab(panel: 'left' | 'right' | 'bottom', config: PanelTabConfig): void {
    /* v1: append a labeled section at the bottom of the host column. A full tab-switcher
     * could replace this later; for now it's a labelled drop-in so plugins have somewhere
     * to render. */
    const host = panel === 'left' ? this.leftCol : panel === 'right' ? this.rightCol : this.bottomRow
    const wrap = document.createElement('div')
    wrap.style.borderTop = '1px solid #2e2e33'
    wrap.style.padding = '4px 0'
    const header = document.createElement('div')
    header.className = 'panel-header'
    header.style.background = 'rgba(0,0,0,0.2)'
    const title = document.createElement('span')
    title.textContent = config.label
    header.appendChild(title)
    const body = document.createElement('div')
    body.style.padding = '6px'
    wrap.appendChild(header)
    wrap.appendChild(body)
    host.appendChild(wrap)
    const cleanup = config.mount(body)
    this.extraTabs.set(config.id, { host: wrap, cleanup: typeof cleanup === 'function' ? cleanup : undefined })
  }

  /* ---------- split drag ---------- */

  private bindSplit(bar: HTMLElement, axis: 'left' | 'right' | 'bottom'): void {
    let dragging = false
    let startX = 0
    let startY = 0
    let startLeft = 220
    let startRight = 280
    let startBottom = 180

    const onMove = (e: MouseEvent) => {
      if (!dragging) return
      const layout = readLayout()
      if (axis === 'left') {
        const next = Math.max(140, Math.min(480, startLeft + (e.clientX - startX)))
        layout.leftWidth = next
      } else if (axis === 'right') {
        const next = Math.max(160, Math.min(520, startRight - (e.clientX - startX)))
        layout.rightWidth = next
      } else if (axis === 'bottom') {
        const next = Math.max(80, Math.min(420, startBottom - (e.clientY - startY)))
        layout.bottomHeight = next
      }
      this.applyLayout(layout)
      writeLayout(layout)
    }
    const onUp = () => {
      dragging = false
      bar.classList.remove('dragging')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    bar.addEventListener('mousedown', (e) => {
      dragging = true
      bar.classList.add('dragging')
      startX = e.clientX
      startY = e.clientY
      const layout = readLayout()
      startLeft = layout.leftWidth ?? 220
      startRight = layout.rightWidth ?? 280
      startBottom = layout.bottomHeight ?? 180
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      e.preventDefault()
    })
  }

  private applyLayout(layout: PersistedLayout): void {
    const left = layout.leftWidth ?? 220
    const right = layout.rightWidth ?? 280
    const bottom = layout.bottomHeight ?? 180
    this.root.style.gridTemplateColumns = `${left}px 1fr ${right}px`
    this.root.style.gridTemplateRows = `36px 1fr ${bottom}px`
    const splitBars = this.root.querySelectorAll<HTMLElement>('.split-bar-v')
    if (splitBars[0]) splitBars[0].style.left = `${left}px`
    if (splitBars[1]) splitBars[1].style.right = `${right}px`
    const bottomBar = this.root.querySelector<HTMLElement>('.split-bar-h')
    if (bottomBar) bottomBar.style.bottom = `${bottom}px`
    const splitsV = this.root.querySelectorAll<HTMLElement>('.split-bar-v')
    for (const s of splitsV) {
      s.style.bottom = `${bottom}px`
    }
  }
}

function readLayout(): PersistedLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedLayout
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLayout(layout: PersistedLayout): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    /* quota or private mode — ignore */
  }
}
