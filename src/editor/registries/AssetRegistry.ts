import type { AssetCategory, AssetDefinition, IAssetRegistry } from '../types'

/**
 * Asset registry for the editor's drag-and-drop panel and the `asset` property field's
 * picker. Entries are static declarations; loading of the actual bytes happens lazily
 * at viewport spawn time.
 */
export class AssetRegistry implements IAssetRegistry {
  private map: Map<string, AssetDefinition> = new Map()
  private changeCbs: Set<() => void> = new Set()

  register(def: AssetDefinition): void {
    if (!def.id) throw new Error('[editor] asset missing id')
    if (this.map.has(def.id)) {
      console.warn(`[editor] asset "${def.id}" re-registered — overwriting`)
    }
    this.map.set(def.id, def)
    this.emitChange()
  }

  get(id: string): AssetDefinition | undefined {
    return this.map.get(id)
  }

  has(id: string): boolean {
    return this.map.has(id)
  }

  list(): AssetDefinition[] {
    return [...this.map.values()]
  }

  listByCategory(category: AssetCategory): AssetDefinition[] {
    return this.list().filter((a) => a.category === category)
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
        console.error('[editor] AssetRegistry change listener threw', err)
      }
    }
  }
}
