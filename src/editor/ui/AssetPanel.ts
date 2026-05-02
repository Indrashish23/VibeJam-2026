import type { AssetRegistry } from '../registries/AssetRegistry'
import type { AssetCategory } from '../types'

interface AssetPanelDeps {
  container: HTMLElement
  assets: AssetRegistry
}

/**
 * Bottom drawer — Models / Audio / Textures / Scenes tabs, tile grid, HTML5 drag source.
 * Drag payload: `application/x-editor-asset` = asset id. ViewportHost picks it up on drop,
 * raycasts the ground plane, and creates either a `static_mesh` or `audio_emitter` entity
 * with the asset URL pre-filled.
 */
export class AssetPanel {
  private activeCategory: AssetCategory = 'model'
  private grid: HTMLElement
  private tabs: Record<AssetCategory, HTMLElement>
  private unsub: () => void
  private deps: AssetPanelDeps

  constructor(deps: AssetPanelDeps) {
    this.deps = deps
    deps.container.classList.add('panel', 'panel-bottom')

    const header = document.createElement('div')
    header.className = 'panel-header'
    const title = document.createElement('span')
    title.textContent = 'Assets'
    header.appendChild(title)
    deps.container.appendChild(header)

    const tabsRow = document.createElement('div')
    tabsRow.className = 'asset-tabs'
    deps.container.appendChild(tabsRow)

    this.tabs = {} as Record<AssetCategory, HTMLElement>
    for (const cat of ['model', 'audio', 'texture', 'scene'] as AssetCategory[]) {
      const tab = document.createElement('div')
      tab.className = 'asset-tab'
      tab.textContent = labelFor(cat)
      tab.addEventListener('click', () => this.setCategory(cat))
      tabsRow.appendChild(tab)
      this.tabs[cat] = tab
    }

    this.grid = document.createElement('div')
    this.grid.className = 'asset-grid'
    deps.container.appendChild(this.grid)

    this.unsub = deps.assets.onChange(() => this.rebuild())
    this.setCategory('model')
  }

  dispose(): void {
    this.unsub()
  }

  setCategory(cat: AssetCategory): void {
    this.activeCategory = cat
    for (const [k, el] of Object.entries(this.tabs)) {
      el.classList.toggle('active', k === cat)
    }
    this.rebuild()
  }

  private rebuild(): void {
    this.grid.innerHTML = ''
    const entries = this.deps.assets.listByCategory(this.activeCategory)
    if (entries.length === 0) {
      const empty = document.createElement('div')
      empty.style.color = '#71717a'
      empty.style.fontStyle = 'italic'
      empty.style.padding = '10px'
      empty.textContent = `No ${labelFor(this.activeCategory).toLowerCase()} registered.`
      this.grid.appendChild(empty)
      return
    }

    for (const asset of entries) {
      const tile = document.createElement('div')
      tile.className = 'asset-tile'
      tile.draggable = true
      tile.title = asset.url

      const icon = document.createElement('div')
      icon.className = 'icon'
      if (asset.thumbnail) {
        const img = document.createElement('img')
        img.src = asset.thumbnail
        img.style.width = '40px'
        img.style.height = '40px'
        img.style.objectFit = 'cover'
        icon.appendChild(img)
      } else {
        icon.textContent = iconFor(asset.category)
      }

      const label = document.createElement('div')
      label.className = 'label'
      label.textContent = asset.label

      tile.appendChild(icon)
      tile.appendChild(label)

      tile.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('application/x-editor-asset', asset.id)
        e.dataTransfer!.effectAllowed = 'copy'
      })
      this.grid.appendChild(tile)
    }
  }
}

function labelFor(cat: AssetCategory): string {
  switch (cat) {
    case 'model':
      return 'Models'
    case 'audio':
      return 'Audio'
    case 'texture':
      return 'Textures'
    case 'scene':
      return 'Scenes'
  }
}

function iconFor(cat: AssetCategory): string {
  switch (cat) {
    case 'model':
      return '🧊'
    case 'audio':
      return '🔊'
    case 'texture':
      return '🖼️'
    case 'scene':
      return '📄'
  }
}
