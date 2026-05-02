import type { EntityTypeDefinition, IEntityTypeRegistry } from '../types'

/**
 * Entity type registry. Schemas here drive the Inspector's dynamic field rendering.
 * Late registration (e.g. from a plugin) fires `change` so UI lists repaint.
 */
export class EntityTypeRegistry implements IEntityTypeRegistry {
  private map: Map<string, EntityTypeDefinition> = new Map()
  private changeCbs: Set<() => void> = new Set()

  register(def: EntityTypeDefinition): void {
    if (!def.id) throw new Error('[editor] entity type missing id')
    if (this.map.has(def.id)) {
      console.warn(`[editor] entity type "${def.id}" re-registered — overwriting`)
    }
    this.map.set(def.id, def)
    this.emitChange()
  }

  get(id: string): EntityTypeDefinition | undefined {
    return this.map.get(id)
  }

  has(id: string): boolean {
    return this.map.has(id)
  }

  list(): EntityTypeDefinition[] {
    return [...this.map.values()]
  }

  onChange(cb: () => void): () => void {
    this.changeCbs.add(cb)
    return () => this.changeCbs.delete(cb)
  }

  private emitChange(): void {
    for (const cb of [...this.changeCbs]) {
      try {
        cb()
      } catch (err) {
        console.error('[editor] EntityTypeRegistry change listener threw', err)
      }
    }
  }
}
