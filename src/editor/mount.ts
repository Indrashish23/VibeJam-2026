import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import './ui/styles.css'
import { registerBuiltinAssets } from './builtins/assets'
import { registerBuiltinComponents } from './builtins/components'
import { registerBuiltinEntityTypes } from './builtins/entityTypes'
import { registerVibeJamEntityTypes } from './builtins/vibejamTypes'
import { CommandStack } from './CommandStack'
import { createEditorAPI } from './EditorAPI'
import { AssetRegistry } from './registries/AssetRegistry'
import { ComponentRegistry } from './registries/ComponentRegistry'
import { EntityTypeRegistry } from './registries/EntityTypeRegistry'
import { SceneStore } from './SceneStore'
import { registerTranslators, type GameApi } from './translators'
import type { EditorAPI, MenuItemConfig, PanelTabConfig, ToolbarButtonConfig } from './types'
import { Shell } from './ui/Shell'

export interface MountEditorOptions {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  gameApi: GameApi
}

export interface EditorHandle {
  api: EditorAPI
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
  dispose(): void
}

/**
 * Editor entry point. Wires registries → store → command stack → EditorAPI → Shell
 * → translators → plugins. Idempotent: calling `mountEditor` twice returns the first
 * handle (mount lives on `window.EditorAPI`).
 */
export async function mountEditor(opts: MountEditorOptions): Promise<EditorHandle> {
  if (window.EditorAPI && (window as unknown as { __editorHandle?: EditorHandle }).__editorHandle) {
    return (window as unknown as { __editorHandle: EditorHandle }).__editorHandle
  }

  const entityTypes = new EntityTypeRegistry()
  const components = new ComponentRegistry()
  const assets = new AssetRegistry()

  registerBuiltinEntityTypes(entityTypes)
  registerBuiltinComponents(components)
  registerBuiltinAssets(assets)
  registerVibeJamEntityTypes(entityTypes)

  const store = new SceneStore()
  const commandStack = new CommandStack()

  /* UI delegate is populated after Shell constructs (circular: Shell needs api, api needs Shell). */
  const uiDelegate = {
    addToolbarButton: (_c: ToolbarButtonConfig) => {
      /* replaced post-construction */
    },
    addMenuItem: (_m: string, _c: MenuItemConfig) => {
      /* replaced post-construction */
    },
    addPanelTab: (_p: 'left' | 'right' | 'bottom', _c: PanelTabConfig) => {
      /* replaced post-construction */
    },
  }

  const editorApi = createEditorAPI({
    entityTypes,
    components,
    assets,
    store,
    commandStack,
    three: { scene: opts.scene, camera: opts.camera, renderer: opts.renderer },
    ui: uiDelegate,
  })

  /* Hot-apply: register game-side translators before the Shell mounts, so the
   * Toolbar's first Save fires into a wired pipeline. */
  registerTranslators(editorApi, opts.gameApi)

  let shell: Shell | null = null
  let closed = true

  const requestClose = () => {
    handle.close()
  }

  shell = new Shell({
    three: { scene: opts.scene, camera: opts.camera, renderer: opts.renderer },
    store,
    commandStack,
    entityTypes,
    components,
    assets,
    api: editorApi,
    internal: {
      fireOnPlay: editorApi._fireOnPlay,
      fireOnSceneApply: editorApi._fireOnSceneApply,
      requestClose,
    },
  })

  /* Replace UI delegate placeholders with real Shell methods now that it exists. */
  uiDelegate.addToolbarButton = (c) => shell!.addToolbarButton(c)
  uiDelegate.addMenuItem = (m, c) => shell!.addMenuItem(m, c)
  uiDelegate.addPanelTab = (p, c) => shell!.addPanelTab(p, c)

  /* Boot plugins. They receive the EditorAPI and can register types/buttons/tabs. */
  const plugins = window.__editorPlugins ?? []
  for (const plug of plugins) {
    try {
      plug.onRegister(editorApi)
    } catch (err) {
      console.error(`[editor] plugin "${plug.id}" onRegister threw`, err)
    }
  }

  /* Seed scene if empty so the user always has a root to attach things to. */
  if (store.getAll().length === 0) {
    editorApi.scene.create('empty', { name: 'Scene' })
  }

  const handle: EditorHandle = {
    api: editorApi,
    open() {
      if (!closed) return
      shell!.open()
      closed = false
    },
    close() {
      if (closed) return
      shell!.close()
      closed = true
    },
    toggle() {
      if (closed) handle.open()
      else handle.close()
    },
    isOpen() {
      return !closed
    },
    dispose() {
      shell!.dispose()
      closed = true
    },
  }

  window.EditorAPI = editorApi
  ;(window as unknown as { __editorHandle: EditorHandle }).__editorHandle = handle

  return handle
}
