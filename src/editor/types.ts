/**
 * Editor data model — single source of truth for Entity, registries, schemas, commands,
 * and the plugin surface. Everything in `src/editor/` imports from here; nothing in
 * the game imports from here except the translators in `src/editor/translators/`.
 *
 * Scene graph note: entities live in a flat Map keyed by `id`. Hierarchy is derived from
 * `parentId` / `children` — never nest objects. This keeps serialization + undo trivial.
 */

export type Vec3 = [number, number, number]

export interface Entity {
  id: string
  name: string
  type: string
  parentId: string | null
  children: string[]
  transform: {
    position: Vec3
    rotation: Vec3
    scale: Vec3
  }
  properties: Record<string, unknown>
  components: ComponentInstance[]
  metadata: Record<string, unknown>
}

export interface ComponentInstance {
  componentId: string
  properties: Record<string, unknown>
}

export type PropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'color'
  | 'vector3'
  | 'select'
  | 'asset'

export interface PropertySchema {
  key: string
  label: string
  type: PropertyType
  options?: string[]
  min?: number
  max?: number
  step?: number
  default?: unknown
  /** For asset fields: hint which category the picker should show. */
  assetCategory?: AssetCategory
}

export interface EntityTypeDefinition {
  id: string
  label: string
  icon: string
  defaultProperties: Record<string, unknown>
  schema: PropertySchema[]
  /** Called once when an entity of this type is created (pre-insert into store). */
  onCreate?: (entity: Entity) => void
  /** Called on selection change. Non-mutating side-effects only (e.g. open helper panels). */
  onSelect?: (entity: Entity) => void
}

export interface ComponentDefinition {
  id: string
  label: string
  schema: PropertySchema[]
  defaultProperties: Record<string, unknown>
  allowMultiple?: boolean
}

export type AssetCategory = 'model' | 'audio' | 'texture' | 'scene'

export interface AssetDefinition {
  id: string
  label: string
  category: AssetCategory
  url: string
  thumbnail?: string
}

/** Top-level JSON shape written to `Assets/Scenes/*.json`. */
export interface SceneFile {
  version: 1
  name: string
  entities: Entity[]
  metadata: Record<string, unknown>
}

/** Command stack contract. All SceneStore mutations go through a Command. */
export interface Command {
  label: string
  execute(): void
  undo(): void
}

export type SceneEvent =
  | 'entity:create'
  | 'entity:update'
  | 'entity:delete'
  | 'entity:reparent'
  | 'entity:select'
  | 'scene:load'
  | 'scene:clear'

/**
 * Plugin / module API surface. Exposed as `window.EditorAPI` for debug + plugin use;
 * every plugin receives it as `api` in `onRegister`.
 */
export interface ToolbarButtonConfig {
  id: string
  label: string
  icon?: string
  onClick: () => void
  /** Optional placement hint; defaults to 'right'. */
  side?: 'left' | 'center' | 'right'
}

export interface MenuItemConfig {
  id: string
  label: string
  onClick: () => void
  shortcut?: string
}

export interface PanelTabConfig {
  id: string
  label: string
  mount: (container: HTMLElement) => void | (() => void)
}

export interface EditorPlugin {
  id: string
  onRegister(api: EditorAPI): void
}

/** Shared fs contract — implemented by Electron preload (`window.editorBridge.fs`)
 * and by the HTTP fallback in `src/editor/io/bridgeFs.ts`. */
export interface BridgeFsApi {
  list(): Promise<string[] | { error: string }>
  read(name: string): Promise<{ data?: string; error?: string }>
  write(name: string, json: string): Promise<{ ok?: true; error?: string }>
  delete(name: string): Promise<{ ok?: true; error?: string }>
}

export interface EditorAPI {
  entityTypes: IEntityTypeRegistry
  components: IComponentRegistry
  assets: IAssetRegistry
  scene: {
    getAll(): Entity[]
    get(id: string): Entity | undefined
    create(type: string, partial?: Partial<Entity>): Entity
    update(id: string, patch: Partial<Entity>): void
    delete(id: string): void
    setParent(childId: string, parentId: string | null): void
    select(id: string | null): void
    getSelected(): Entity | null
    subscribe(event: SceneEvent, cb: SceneEventCallback): () => void
  }
  three: {
    scene: import('three').Scene
    camera: import('three').PerspectiveCamera
    renderer: import('three').WebGLRenderer
  }
  ui: {
    addToolbarButton(config: ToolbarButtonConfig): void
    addMenuItem(menu: string, config: MenuItemConfig): void
    addPanelTab(panel: 'left' | 'right' | 'bottom', config: PanelTabConfig): void
  }
  /** Play button hook — user-supplied callback fires when user exits editor to game. */
  onPlay(cb: () => void): () => void
  /** Hot-apply hook — fires on Save and on editor Close with the current SceneFile. */
  onSceneApply(cb: (scene: SceneFile) => void): () => void
}

export type SceneEventCallback = (payload: SceneEventPayload) => void

export interface SceneEventPayload {
  entityId?: string
  entity?: Entity
  previousParentId?: string | null
  nextParentId?: string | null
}

/** Registry shapes surfaced on the EditorAPI. */
export interface IEntityTypeRegistry {
  register(def: EntityTypeDefinition): void
  get(id: string): EntityTypeDefinition | undefined
  has(id: string): boolean
  list(): EntityTypeDefinition[]
  onChange(cb: () => void): () => void
}

export interface IComponentRegistry {
  register(def: ComponentDefinition): void
  get(id: string): ComponentDefinition | undefined
  has(id: string): boolean
  list(): ComponentDefinition[]
  onChange(cb: () => void): () => void
}

export interface IAssetRegistry {
  register(def: AssetDefinition): void
  get(id: string): AssetDefinition | undefined
  has(id: string): boolean
  list(): AssetDefinition[]
  listByCategory(category: AssetCategory): AssetDefinition[]
  onChange(cb: () => void): () => void
}

/** Globals declared for TypeScript; actual values are set by preload + main.ts. */
declare global {
  interface Window {
    editorBridge?: {
      readonly editorEnabled: boolean
      readonly scenesDir: string
      ready?: () => Promise<{ editorEnabled: boolean; scenesDir: string }>
      fs: BridgeFsApi
    }
    EditorAPI?: EditorAPI
    __editorPlugins?: EditorPlugin[]
  }
}

export {}
