import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { CommandStack } from './CommandStack'
import type { SceneStore } from './SceneStore'
import {
  addComponentCmd,
  buildEntityFromTypeDef,
  createEntityCmd,
  deleteEntityCmd,
  reparentCmd,
  selectEntity,
  updateEntityCmd,
} from './commands'
import type { AssetRegistry } from './registries/AssetRegistry'
import type { ComponentRegistry } from './registries/ComponentRegistry'
import type { EntityTypeRegistry } from './registries/EntityTypeRegistry'
import type {
  EditorAPI,
  Entity,
  MenuItemConfig,
  PanelTabConfig,
  SceneEvent,
  SceneEventCallback,
  SceneFile,
  ToolbarButtonConfig,
} from './types'

export interface UiDelegate {
  addToolbarButton(config: ToolbarButtonConfig): void
  addMenuItem(menu: string, config: MenuItemConfig): void
  addPanelTab(panel: 'left' | 'right' | 'bottom', config: PanelTabConfig): void
}

export interface EditorAPIDeps {
  entityTypes: EntityTypeRegistry
  components: ComponentRegistry
  assets: AssetRegistry
  store: SceneStore
  commandStack: CommandStack
  three: { scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer }
  ui: UiDelegate
}

/**
 * Builds the EditorAPI surface. All scene mutations go through the command stack so
 * every change is undoable.
 *
 * Also exposes `_onPlay.fire()` / `_onSceneApply.fire(sceneFile)` as internal helpers
 * for the Toolbar + Save paths. Plugins see only the read-only `onPlay` / `onSceneApply`
 * registration methods.
 */
export function createEditorAPI(deps: EditorAPIDeps): EditorAPI & {
  _fireOnPlay: () => void
  _fireOnSceneApply: (scene: SceneFile) => void
} {
  const playCbs = new Set<() => void>()
  const applyCbs = new Set<(scene: SceneFile) => void>()

  const api: EditorAPI = {
    entityTypes: deps.entityTypes,
    components: deps.components,
    assets: deps.assets,
    three: deps.three,
    ui: deps.ui,
    scene: {
      getAll(): Entity[] {
        return deps.store.getAll()
      },
      get(id: string): Entity | undefined {
        return deps.store.get(id)
      },
      create(type: string, partial?: Partial<Entity>): Entity {
        const def = deps.entityTypes.get(type)
        if (!def) throw new Error(`[editor] unknown entity type "${type}"`)
        const entity = buildEntityFromTypeDef(def, partial)
        deps.commandStack.execute(createEntityCmd(deps.store, entity))
        return entity
      },
      update(id: string, patch: Partial<Entity>): void {
        if (!deps.store.has(id)) return
        deps.commandStack.execute(updateEntityCmd(deps.store, id, patch))
      },
      delete(id: string): void {
        if (!deps.store.has(id)) return
        deps.commandStack.execute(deleteEntityCmd(deps.store, id))
      },
      setParent(childId: string, parentId: string | null): void {
        if (!deps.store.has(childId)) return
        if (parentId != null && !deps.store.has(parentId)) return
        /* reject obvious cycles: can't parent to self or a descendant */
        if (parentId != null && wouldCreateCycle(deps.store, childId, parentId)) {
          console.warn('[editor] reparent rejected — would create cycle')
          return
        }
        deps.commandStack.execute(reparentCmd(deps.store, childId, parentId))
      },
      select(id: string | null): void {
        selectEntity(deps.store, id)
      },
      getSelected(): Entity | null {
        return deps.store.getSelected()
      },
      subscribe(event: SceneEvent, cb: SceneEventCallback): () => void {
        return deps.store.subscribe(event, cb)
      },
    },
    onPlay(cb: () => void): () => void {
      playCbs.add(cb)
      return () => playCbs.delete(cb)
    },
    onSceneApply(cb: (scene: SceneFile) => void): () => void {
      applyCbs.add(cb)
      return () => applyCbs.delete(cb)
    },
  }

  /** Convenience: programmatically attach a component; goes through the command stack. */
  ;(api as unknown as { addComponent: (entityId: string, componentId: string) => void }).addComponent = (
    entityId,
    componentId,
  ) => {
    const def = deps.components.get(componentId)
    if (!def) return
    deps.commandStack.execute(
      addComponentCmd(deps.store, entityId, { componentId, properties: { ...def.defaultProperties } }),
    )
  }

  return Object.assign(api, {
    _fireOnPlay() {
      for (const cb of [...playCbs]) {
        try {
          cb()
        } catch (err) {
          console.error('[editor] onPlay listener threw', err)
        }
      }
    },
    _fireOnSceneApply(scene: SceneFile) {
      for (const cb of [...applyCbs]) {
        try {
          cb(scene)
        } catch (err) {
          console.error('[editor] onSceneApply listener threw', err)
        }
      }
    },
  })
}

function wouldCreateCycle(store: SceneStore, childId: string, candidateParentId: string): boolean {
  let cursor: string | null = candidateParentId
  while (cursor != null) {
    if (cursor === childId) return true
    const node = store.get(cursor)
    cursor = node?.parentId ?? null
  }
  return false
}
