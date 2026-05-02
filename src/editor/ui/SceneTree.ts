import type { CommandStack } from '../CommandStack'
import type { SceneStore } from '../SceneStore'
import { buildEntityFromTypeDef, createEntityCmd, deleteEntityCmd } from '../commands'
import type { EntityTypeRegistry } from '../registries/EntityTypeRegistry'
import type { EditorAPI, Entity } from '../types'
import { openAddEntityModal } from './AddEntityModal'

interface SceneTreeDeps {
  container: HTMLElement
  store: SceneStore
  commandStack: CommandStack
  entityTypes: EntityTypeRegistry
  api: EditorAPI
}

/**
 * Left panel — hierarchical tree, click-select, right-click menu, drag-to-reparent, + button.
 * Subscribes to every store mutation; full re-render each time. Tree size is small and flat;
 * reconciliation machinery would cost more than it saves.
 */
export class SceneTree {
  private subs: (() => void)[] = []
  private expanded: Set<string> = new Set()
  private bodyEl: HTMLElement
  private deps: SceneTreeDeps

  constructor(deps: SceneTreeDeps) {
    this.deps = deps
    deps.container.classList.add('panel', 'panel-left')

    const header = document.createElement('div')
    header.className = 'panel-header'
    const title = document.createElement('span')
    title.textContent = 'Scene'
    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.textContent = '+'
    addBtn.title = 'Add entity'
    addBtn.addEventListener('click', () => openAddEntityModal(deps.api, null))
    header.appendChild(title)
    header.appendChild(addBtn)
    deps.container.appendChild(header)

    this.bodyEl = document.createElement('div')
    this.bodyEl.className = 'panel-body'
    deps.container.appendChild(this.bodyEl)

    this.rebuild()
    const rebuild = () => this.rebuild()
    for (const ev of [
      'entity:create',
      'entity:update',
      'entity:delete',
      'entity:reparent',
      'entity:select',
      'scene:load',
      'scene:clear',
    ] as const) {
      this.subs.push(deps.store.subscribe(ev, rebuild))
    }
  }

  dispose(): void {
    for (const u of this.subs) u()
    this.subs = []
  }

  private rebuild(): void {
    const { store } = this.deps
    const roots = store.getRootIds()
    this.bodyEl.innerHTML = ''

    for (const id of roots) this.renderNode(id, 0, this.bodyEl)
  }

  private renderNode(entityId: string, depth: number, parentEl: HTMLElement): void {
    const entity = this.deps.store.get(entityId)
    if (!entity) return
    const row = this.renderRow(entity, depth)
    parentEl.appendChild(row)
    if (this.expanded.has(entityId) || depth < 1) {
      this.expanded.add(entityId)
    }
    if (entity.children.length > 0 && this.expanded.has(entityId)) {
      for (const childId of entity.children) this.renderNode(childId, depth + 1, parentEl)
    }
  }

  private renderRow(entity: Entity, depth: number): HTMLElement {
    const row = document.createElement('div')
    row.className = 'tree-row'
    row.style.paddingLeft = `${6 + depth * 14}px`
    row.draggable = true
    row.dataset.entityId = entity.id

    if (this.deps.store.getSelectedId() === entity.id) row.classList.add('selected')

    const typeDef = this.deps.entityTypes.get(entity.type)

    const toggle = document.createElement('span')
    toggle.className = 'expand-toggle'
    if (entity.children.length > 0) {
      toggle.textContent = this.expanded.has(entity.id) ? '▾' : '▸'
      toggle.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.expanded.has(entity.id)) this.expanded.delete(entity.id)
        else this.expanded.add(entity.id)
        this.rebuild()
      })
    } else {
      toggle.textContent = ' '
    }
    row.appendChild(toggle)

    const icon = document.createElement('span')
    icon.className = 'icon'
    icon.textContent = typeDef?.icon ?? '⚪'
    row.appendChild(icon)

    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = entity.name
    row.appendChild(name)

    const badge = document.createElement('span')
    badge.className = 'type-badge'
    badge.textContent = typeDef?.label ?? entity.type
    row.appendChild(badge)

    row.addEventListener('click', () => this.deps.api.scene.select(entity.id))
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      this.openContextMenu(entity, e.clientX, e.clientY)
    })

    /* drag-and-drop reparent — native HTML5. `dataTransfer.setData` is required for
     * Firefox to actually fire the drop event. */
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('application/x-editor-entity', entity.id)
      e.dataTransfer!.effectAllowed = 'move'
    })
    row.addEventListener('dragover', (e) => {
      if (this.canAcceptDrop(e, entity.id)) {
        e.preventDefault()
        e.dataTransfer!.dropEffect = 'move'
        row.classList.add('drop-target-inside')
      }
    })
    row.addEventListener('dragleave', () => row.classList.remove('drop-target-inside'))
    row.addEventListener('drop', (e) => {
      row.classList.remove('drop-target-inside')
      if (!this.canAcceptDrop(e, entity.id)) return
      e.preventDefault()
      const childId = e.dataTransfer!.getData('application/x-editor-entity')
      if (!childId) return
      this.deps.api.scene.setParent(childId, entity.id)
    })

    return row
  }

  private canAcceptDrop(e: DragEvent, targetId: string): boolean {
    const sourceId = e.dataTransfer?.types.includes('application/x-editor-entity')
      ? e.dataTransfer.getData('application/x-editor-entity')
      : ''
    if (!sourceId) return false
    if (sourceId === targetId) return false
    return true
  }

  private openContextMenu(entity: Entity, x: number, y: number): void {
    const menu = document.createElement('div')
    menu.className = 'editor-root-context-menu'
    menu.style.left = `${x}px`
    menu.style.top = `${y}px`

    const item = (label: string, onClick: () => void) => {
      const el = document.createElement('div')
      el.className = 'item'
      el.textContent = label
      el.addEventListener('click', () => {
        onClick()
        close()
      })
      menu.appendChild(el)
    }

    item('Rename', () => {
      const next = prompt('Rename entity', entity.name)
      if (next && next.trim() && next !== entity.name) {
        this.deps.api.scene.update(entity.id, { name: next })
      }
    })
    item('Duplicate', () => {
      const def = this.deps.entityTypes.get(entity.type)
      if (!def) return
      const clone = buildEntityFromTypeDef(def, {
        name: `${entity.name} Copy`,
        parentId: entity.parentId,
        transform: {
          position: [...entity.transform.position] as [number, number, number],
          rotation: [...entity.transform.rotation] as [number, number, number],
          scale: [...entity.transform.scale] as [number, number, number],
        },
        properties: { ...entity.properties },
        components: entity.components.map((c) => ({
          componentId: c.componentId,
          properties: { ...c.properties },
        })),
        metadata: { ...entity.metadata },
      })
      this.deps.commandStack.execute(createEntityCmd(this.deps.store, clone))
      this.deps.api.scene.select(clone.id)
    })
    item('Add Child', () => openAddEntityModal(this.deps.api, entity.id))

    const div = document.createElement('div')
    div.className = 'divider'
    menu.appendChild(div)

    item('Delete', () => {
      this.deps.commandStack.execute(deleteEntityCmd(this.deps.store, entity.id))
    })

    const close = () => {
      menu.remove()
      window.removeEventListener('click', onDocClick, true)
      window.removeEventListener('keydown', onEsc, true)
    }
    const onDocClick = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) close()
    }
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close()
    }
    window.addEventListener('click', onDocClick, true)
    window.addEventListener('keydown', onEsc, true)

    document.body.appendChild(menu)
    /* Clamp to viewport in case of edge open. */
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect()
      if (r.right > window.innerWidth) menu.style.left = `${window.innerWidth - r.width - 4}px`
      if (r.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - r.height - 4}px`
    })
  }
}
