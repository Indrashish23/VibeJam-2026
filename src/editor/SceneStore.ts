import { EventBus } from './EventBus'
import type {
  Entity,
  SceneEvent,
  SceneEventCallback,
  SceneEventPayload,
  SceneFile,
} from './types'

type SceneEventMap = Record<SceneEvent, SceneEventPayload>

/**
 * Flat entity map + tree-shape derived from parentId/children.
 *
 * Underscored methods (`_insert`, `_patch`, `_remove`, `_setParent`, `_setSelected`) are the
 * low-level mutators — intended to be called **only** from Commands in `commands.ts` so
 * every mutation is undoable. Public convenience getters are safe to use anywhere.
 */
export class SceneStore {
  private entities: Map<string, Entity> = new Map()
  private rootIdsSet: Set<string> = new Set()
  private selectedId: string | null = null
  private name = 'Untitled Scene'
  private metadata: Record<string, unknown> = {}
  private bus = new EventBus<SceneEventMap>()

  /* ---------- public read surface ---------- */

  getAll(): Entity[] {
    return [...this.entities.values()]
  }

  get(id: string): Entity | undefined {
    return this.entities.get(id)
  }

  has(id: string): boolean {
    return this.entities.has(id)
  }

  getRootIds(): string[] {
    return [...this.rootIdsSet]
  }

  getSelectedId(): string | null {
    return this.selectedId
  }

  getSelected(): Entity | null {
    if (!this.selectedId) return null
    return this.entities.get(this.selectedId) ?? null
  }

  getName(): string {
    return this.name
  }

  setName(next: string): void {
    this.name = next
  }

  getMetadata(): Record<string, unknown> {
    return this.metadata
  }

  subscribe(event: SceneEvent, cb: SceneEventCallback): () => void {
    return this.bus.on(event, cb)
  }

  /* ---------- serialize / deserialize ---------- */

  serialize(): SceneFile {
    return {
      version: 1,
      name: this.name,
      entities: this.getAll().map(cloneEntity),
      metadata: { ...this.metadata },
    }
  }

  /** Replaces the entire scene. Emits `scene:clear` then `scene:load`. Selection is cleared. */
  deserialize(file: SceneFile): void {
    this.entities.clear()
    this.rootIdsSet.clear()
    this.selectedId = null
    this.bus.emit('scene:clear', {})

    this.name = typeof file.name === 'string' ? file.name : 'Untitled Scene'
    this.metadata = file.metadata && typeof file.metadata === 'object' ? { ...file.metadata } : {}

    if (Array.isArray(file.entities)) {
      for (const e of file.entities) {
        const normalized = cloneEntity(e)
        this.entities.set(normalized.id, normalized)
        if (normalized.parentId == null) this.rootIdsSet.add(normalized.id)
      }
    }

    this.bus.emit('scene:load', {})
  }

  clear(): void {
    this.entities.clear()
    this.rootIdsSet.clear()
    this.selectedId = null
    this.name = 'Untitled Scene'
    this.metadata = {}
    this.bus.emit('scene:clear', {})
  }

  /* ---------- low-level mutators (commands only) ---------- */

  _insert(entity: Entity): void {
    this.entities.set(entity.id, entity)
    if (entity.parentId == null) {
      this.rootIdsSet.add(entity.id)
    } else {
      const parent = this.entities.get(entity.parentId)
      if (parent && !parent.children.includes(entity.id)) {
        parent.children.push(entity.id)
      }
    }
    this.bus.emit('entity:create', { entityId: entity.id, entity })
  }

  _remove(id: string): Entity | null {
    const e = this.entities.get(id)
    if (!e) return null
    for (const childId of [...e.children]) this._remove(childId)
    if (e.parentId != null) {
      const parent = this.entities.get(e.parentId)
      if (parent) parent.children = parent.children.filter((c) => c !== id)
    }
    this.rootIdsSet.delete(id)
    this.entities.delete(id)
    if (this.selectedId === id) this.selectedId = null
    this.bus.emit('entity:delete', { entityId: id, entity: e })
    return e
  }

  _patch(id: string, patch: Partial<Entity>): void {
    const e = this.entities.get(id)
    if (!e) return
    if (patch.name !== undefined) e.name = patch.name
    if (patch.transform) {
      e.transform = {
        position: [...patch.transform.position] as [number, number, number],
        rotation: [...patch.transform.rotation] as [number, number, number],
        scale: [...patch.transform.scale] as [number, number, number],
      }
    }
    if (patch.properties) {
      e.properties = { ...e.properties, ...patch.properties }
    }
    if (patch.components) {
      e.components = patch.components.map((c) => ({
        componentId: c.componentId,
        properties: { ...c.properties },
      }))
    }
    if (patch.metadata) {
      e.metadata = { ...e.metadata, ...patch.metadata }
    }
    this.bus.emit('entity:update', { entityId: id, entity: e })
  }

  _setParent(childId: string, nextParentId: string | null): void {
    const child = this.entities.get(childId)
    if (!child) return
    if (child.parentId === nextParentId) return
    const prev = child.parentId

    if (prev == null) {
      this.rootIdsSet.delete(childId)
    } else {
      const prevParent = this.entities.get(prev)
      if (prevParent) prevParent.children = prevParent.children.filter((c) => c !== childId)
    }

    child.parentId = nextParentId
    if (nextParentId == null) {
      this.rootIdsSet.add(childId)
    } else {
      const nextParent = this.entities.get(nextParentId)
      if (nextParent && !nextParent.children.includes(childId)) {
        nextParent.children.push(childId)
      }
    }

    this.bus.emit('entity:reparent', {
      entityId: childId,
      entity: child,
      previousParentId: prev,
      nextParentId,
    })
  }

  _setSelected(id: string | null): void {
    if (this.selectedId === id) return
    this.selectedId = id
    this.bus.emit('entity:select', {
      entityId: id ?? undefined,
      entity: id ? this.entities.get(id) : undefined,
    })
  }

  /** Used by CompositeCommand diagnostics + debugging. Returns a stable structural hash. */
  snapshot(id: string): Entity | null {
    const e = this.entities.get(id)
    return e ? cloneEntity(e) : null
  }
}

export function cloneEntity(e: Entity): Entity {
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    parentId: e.parentId,
    children: [...e.children],
    transform: {
      position: [...e.transform.position] as [number, number, number],
      rotation: [...e.transform.rotation] as [number, number, number],
      scale: [...e.transform.scale] as [number, number, number],
    },
    properties: { ...e.properties },
    components: e.components.map((c) => ({
      componentId: c.componentId,
      properties: { ...c.properties },
    })),
    metadata: { ...e.metadata },
  }
}
