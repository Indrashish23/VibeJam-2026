import type { ComponentDefinition, IComponentRegistry } from '../types'

/** Reusable-behavior-bag registry. Inspector's "Add Component" dropdown reads `list()`. */
export class ComponentRegistry implements IComponentRegistry {
  private map: Map<string, ComponentDefinition> = new Map()
  private changeCbs: Set<() => void> = new Set()

  register(def: ComponentDefinition): void {
    if (!def.id) throw new Error('[editor] component missing id')
    if (this.map.has(def.id)) {
      console.warn(`[editor] component "${def.id}" re-registered — overwriting`)
    }
    this.map.set(def.id, def)
    this.emitChange()
  }

  get(id: string): ComponentDefinition | undefined {
    return this.map.get(id)
  }

  has(id: string): boolean {
    return this.map.has(id)
  }

  list(): ComponentDefinition[] {
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
        console.error('[editor] ComponentRegistry change listener threw', err)
      }
    }
  }
}
