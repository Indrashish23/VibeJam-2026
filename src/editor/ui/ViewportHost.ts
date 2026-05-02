import {
  Box3,
  BoxGeometry,
  BoxHelper,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { setTransformCmd } from '../commands'
import type { CommandStack } from '../CommandStack'
import type { SceneStore } from '../SceneStore'
import type { AssetRegistry } from '../registries/AssetRegistry'
import type { EntityTypeRegistry } from '../registries/EntityTypeRegistry'
import type { EditorAPI, Entity, Vec3 } from '../types'

interface ViewportHostDeps {
  slot: HTMLElement
  three: { scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer }
  store: SceneStore
  commandStack: CommandStack
  entityTypes: EntityTypeRegistry
  assets: AssetRegistry
  api: EditorAPI
}

type GizmoMode = 'translate' | 'rotate' | 'scale'

/**
 * Viewport host — **does not own** a WebGLRenderer. Attaches OrbitControls +
 * TransformControls + GridHelper + BoxHelper outline to the game's scene/camera
 * while the editor is open. Every editor-owned Object3D is tagged
 * `userData.__editorOnly = true` so scene serialization can filter it out.
 *
 * Input model: the editor overlay's viewport slot is `pointer-events: none`, so all
 * clicks reach `renderer.domElement` directly. That lets TransformControls use its
 * default coord math without slot-size remapping gymnastics.
 */
export class ViewportHost {
  /** Map of entity id → Object3D mirror in the game scene. */
  private entityObjects: Map<string, Object3D> = new Map()
  private orbit: OrbitControls
  private gizmo: TransformControls
  private grid: GridHelper
  private outline: BoxHelper | null = null
  private gltfLoader = new GLTFLoader()

  private isOpen = false
  private showGrid = true
  private showGizmo = true
  private mode: GizmoMode = 'translate'

  private subs: (() => void)[] = []
  private keyHandler: (e: KeyboardEvent) => void
  private clickHandler: (e: MouseEvent) => void
  private dragOverHandler: (e: DragEvent) => void
  private dropHandler: (e: DragEvent) => void

  /** During gizmo drag we mutate the object live but only flush ONE undo-command on mouseup. */
  private gizmoDragSnapshot: {
    entityId: string
    position: Vec3
    rotation: Vec3
    scale: Vec3
  } | null = null
  private deps: ViewportHostDeps

  constructor(deps: ViewportHostDeps) {
    this.deps = deps
    const { three, slot } = deps

    /* Ensure the slot lets clicks reach the renderer canvas below. */
    slot.style.pointerEvents = 'none'

    this.orbit = new OrbitControls(three.camera, three.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.dampingFactor = 0.08
    this.orbit.enabled = false

    this.gizmo = new TransformControls(three.camera, three.renderer.domElement)
    this.gizmo.setMode('translate')
    markEditorOnly(this.gizmo as unknown as Object3D)
    three.scene.add(this.gizmo as unknown as Object3D)

    this.gizmo.addEventListener('dragging-changed', (event) => {
      const dragging = !!(event as unknown as { value: boolean }).value
      this.orbit.enabled = !dragging
      if (dragging) this.beginGizmoDrag()
      else this.endGizmoDrag()
    })
    this.gizmo.addEventListener('objectChange', () => this.onGizmoObjectChange())

    this.grid = new GridHelper(80, 80, 0x606060, 0x303030)
    markEditorOnly(this.grid)
    this.grid.visible = this.showGrid
    three.scene.add(this.grid)

    /* Bind store events so new/updated/deleted entities reflect in the scene. */
    this.subs.push(
      deps.store.subscribe('entity:create', (p) => {
        if (p.entityId && p.entity) this.ensureObject(p.entity)
      }),
    )
    this.subs.push(
      deps.store.subscribe('entity:update', (p) => {
        if (!p.entity) return
        const obj = this.entityObjects.get(p.entity.id)
        if (!obj) {
          this.ensureObject(p.entity)
          return
        }
        this.applyTransform(obj, p.entity)
        this.maybeRebuildMesh(obj, p.entity)
        if (this.deps.store.getSelectedId() === p.entity.id) this.refreshOutline()
      }),
    )
    this.subs.push(
      deps.store.subscribe('entity:delete', (p) => {
        if (p.entityId) this.disposeObject(p.entityId)
      }),
    )
    this.subs.push(
      deps.store.subscribe('entity:select', (p) => {
        this.syncGizmoAndOutline(p.entityId ?? null)
      }),
    )
    this.subs.push(
      deps.store.subscribe('scene:load', () => this.reconcileAll()),
    )
    this.subs.push(
      deps.store.subscribe('scene:clear', () => this.clearAllObjects()),
    )

    this.clickHandler = (e: MouseEvent) => this.onCanvasClick(e)
    this.keyHandler = (e: KeyboardEvent) => this.onKey(e)
    this.dragOverHandler = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('application/x-editor-asset')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    }
    this.dropHandler = (e: DragEvent) => this.onDrop(e)
  }

  open(): void {
    if (this.isOpen) return
    this.isOpen = true
    this.orbit.enabled = true
    this.grid.visible = this.showGrid
    if (this.showGizmo) (this.gizmo as unknown as { visible: boolean }).visible = true

    const canvas = this.deps.three.renderer.domElement
    canvas.addEventListener('click', this.clickHandler)
    canvas.addEventListener('dragover', this.dragOverHandler)
    canvas.addEventListener('drop', this.dropHandler)
    window.addEventListener('keydown', this.keyHandler)

    this.reconcileAll()
    this.syncGizmoAndOutline(this.deps.store.getSelectedId())
  }

  close(): void {
    if (!this.isOpen) return
    this.isOpen = false
    this.orbit.enabled = false
    this.grid.visible = false
    ;(this.gizmo as unknown as { visible: boolean }).visible = false
    this.gizmo.detach()
    this.clearOutline()

    const canvas = this.deps.three.renderer.domElement
    canvas.removeEventListener('click', this.clickHandler)
    canvas.removeEventListener('dragover', this.dragOverHandler)
    canvas.removeEventListener('drop', this.dropHandler)
    window.removeEventListener('keydown', this.keyHandler)
  }

  dispose(): void {
    this.close()
    for (const u of this.subs) u()
    this.subs = []
    this.deps.three.scene.remove(this.gizmo as unknown as Object3D)
    this.deps.three.scene.remove(this.grid)
    this.clearAllObjects()
    ;(this.gizmo as unknown as { dispose?: () => void }).dispose?.()
  }

  setMode(mode: GizmoMode): void {
    this.mode = mode
    this.gizmo.setMode(mode)
  }

  getMode(): GizmoMode {
    return this.mode
  }

  setGridVisible(v: boolean): void {
    this.showGrid = v
    this.grid.visible = v && this.isOpen
  }

  setGizmoVisible(v: boolean): void {
    this.showGizmo = v
    ;(this.gizmo as unknown as { visible: boolean }).visible = v && this.isOpen
  }

  frameSelected(): void {
    const id = this.deps.store.getSelectedId()
    const obj = id ? this.entityObjects.get(id) : null
    if (!obj) return
    const box = new Box3().setFromObject(obj)
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const radius = Math.max(size.x, size.y, size.z, 1)
    const dir = new Vector3().subVectors(this.deps.three.camera.position, center).normalize()
    this.deps.three.camera.position.copy(center).addScaledVector(dir, radius * 2.5)
    this.orbit.target.copy(center)
    this.orbit.update()
  }

  /* ---------- entity <-> Object3D sync ---------- */

  private reconcileAll(): void {
    this.clearAllObjects()
    for (const entity of this.deps.store.getAll()) {
      this.ensureObject(entity)
    }
    this.syncGizmoAndOutline(this.deps.store.getSelectedId())
  }

  private clearAllObjects(): void {
    for (const [id] of this.entityObjects) this.disposeObject(id)
    this.entityObjects.clear()
    this.clearOutline()
  }

  private disposeObject(id: string): void {
    const obj = this.entityObjects.get(id)
    if (!obj) return
    this.deps.three.scene.remove(obj)
    disposeTree(obj)
    this.entityObjects.delete(id)
  }

  private ensureObject(entity: Entity): void {
    if (this.entityObjects.has(entity.id)) return
    const group = new Group()
    group.name = `editor:${entity.type}:${entity.id.slice(0, 6)}`
    markEditorOnly(group)
    group.userData.__entityId = entity.id
    this.applyTransform(group, entity)
    this.deps.three.scene.add(group)
    this.entityObjects.set(entity.id, group)
    this.buildMeshFor(group, entity)
  }

  private applyTransform(obj: Object3D, entity: Entity): void {
    const [px, py, pz] = entity.transform.position
    const [rx, ry, rz] = entity.transform.rotation
    const [sx, sy, sz] = entity.transform.scale
    obj.position.set(px, py, pz)
    obj.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz))
    obj.scale.set(sx || 1, sy || 1, sz || 1)
  }

  private maybeRebuildMesh(obj: Object3D, entity: Entity): void {
    /* Entities that carry an asset URL rebuild only when the URL changes.
     * Track the last URL we loaded on the object; if different, rebuild. */
    const currentUrl = String(
      entity.properties.meshUrl ?? entity.properties.modelUrl ?? entity.properties.audioUrl ?? '',
    )
    const mounted = obj.userData.__mountedUrl ?? ''
    if (currentUrl === mounted) return
    this.buildMeshFor(obj, entity)
  }

  private buildMeshFor(obj: Object3D, entity: Entity): void {
    /* Drop existing visual children (keep the group itself). */
    for (const child of [...obj.children]) {
      disposeTree(child)
      obj.remove(child)
    }
    obj.userData.__mountedUrl = ''

    const modelUrl = String(entity.properties.meshUrl ?? entity.properties.modelUrl ?? '')
    if (modelUrl && (entity.type === 'static_mesh' || entity.type === 'arena_stage' || entity.type === 'megaphone_prop' || entity.type === 'lobby_portal' || entity.type === 'character' || entity.type === 'monkey_player' || entity.type === 'pickup' || entity.type === 'banana_pickup_node')) {
      obj.userData.__mountedUrl = modelUrl
      this.gltfLoader.load(
        modelUrl,
        (gltf) => {
          const loaded = gltf.scene
          markEditorOnly(loaded)
          obj.add(loaded)
          if (this.deps.store.getSelectedId() === entity.id) this.refreshOutline()
        },
        undefined,
        () => {
          obj.add(placeholderFor(entity.type))
        },
      )
      return
    }

    /* Non-model entities use typed placeholders. */
    obj.add(placeholderFor(entity.type))
  }

  /* ---------- selection / gizmo / outline ---------- */

  private syncGizmoAndOutline(entityId: string | null): void {
    if (!entityId) {
      this.gizmo.detach()
      this.clearOutline()
      return
    }
    const obj = this.entityObjects.get(entityId)
    if (!obj) {
      this.gizmo.detach()
      this.clearOutline()
      return
    }
    if (this.showGizmo && this.isOpen) this.gizmo.attach(obj)
    this.refreshOutline()
  }

  private refreshOutline(): void {
    this.clearOutline()
    const id = this.deps.store.getSelectedId()
    const obj = id ? this.entityObjects.get(id) : null
    if (!obj) return
    const outline = new BoxHelper(obj, 0x22c55e)
    markEditorOnly(outline)
    this.deps.three.scene.add(outline)
    this.outline = outline
  }

  private clearOutline(): void {
    if (this.outline) {
      this.deps.three.scene.remove(this.outline)
      this.outline.geometry.dispose()
      this.outline = null
    }
  }

  private beginGizmoDrag(): void {
    const id = this.deps.store.getSelectedId()
    const entity = id ? this.deps.store.get(id) : null
    if (!entity) return
    this.gizmoDragSnapshot = {
      entityId: entity.id,
      position: [...entity.transform.position] as Vec3,
      rotation: [...entity.transform.rotation] as Vec3,
      scale: [...entity.transform.scale] as Vec3,
    }
  }

  private endGizmoDrag(): void {
    const snap = this.gizmoDragSnapshot
    this.gizmoDragSnapshot = null
    if (!snap) return
    const obj = this.entityObjects.get(snap.entityId)
    if (!obj) return
    const next: { position: Vec3; rotation: Vec3; scale: Vec3 } = {
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [
        radToDeg(obj.rotation.x),
        radToDeg(obj.rotation.y),
        radToDeg(obj.rotation.z),
      ],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    }
    /* Route through commands.ts so the drag is one undoable step. */
    this.deps.commandStack.execute(setTransformCmd(this.deps.store, snap.entityId, next))
  }

  private onGizmoObjectChange(): void {
    /* Live-update outline box while dragging. We don't patch the Entity mid-drag — the
     * snapshot flush on mouseup writes one clean command. */
    if (this.outline) this.outline.update()
  }

  /* ---------- input ---------- */

  private onCanvasClick(e: MouseEvent): void {
    if (!this.isOpen) return
    /* Ignore if gizmo is actively dragging (TransformControls eats drags itself). */
    const tc = this.gizmo as unknown as { dragging: boolean }
    if (tc.dragging) return

    const canvas = this.deps.three.renderer.domElement
    const rect = canvas.getBoundingClientRect()
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new Raycaster()
    raycaster.setFromCamera(ndc, this.deps.three.camera)

    const candidates: Object3D[] = []
    for (const obj of this.entityObjects.values()) candidates.push(obj)
    const hits = raycaster.intersectObjects(candidates, true)
    if (hits.length === 0) {
      this.deps.api.scene.select(null)
      return
    }
    const topHit = hits[0].object
    /* Walk up to find the entity root. */
    let cursor: Object3D | null = topHit
    while (cursor) {
      const id = cursor.userData.__entityId
      if (typeof id === 'string') {
        this.deps.api.scene.select(id)
        return
      }
      cursor = cursor.parent
    }
  }

  private onDrop(e: DragEvent): void {
    if (!e.dataTransfer) return
    if (!e.dataTransfer.types.includes('application/x-editor-asset')) return
    e.preventDefault()
    const assetId = e.dataTransfer.getData('application/x-editor-asset')
    if (!assetId) return
    const asset = this.deps.assets.get(assetId)
    if (!asset) return

    const canvas = this.deps.three.renderer.domElement
    const rect = canvas.getBoundingClientRect()
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new Raycaster()
    raycaster.setFromCamera(ndc, this.deps.three.camera)

    /* Raycast against ground plane y=0 for drop position. */
    const groundPlane = new Plane(new Vector3(0, 1, 0), 0)
    const hit = new Vector3()
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return

    const typeId = asset.category === 'model' ? 'static_mesh' : 'audio_emitter'
    const created = this.deps.api.scene.create(typeId, {
      name: asset.label,
      transform: {
        position: [hit.x, hit.y, hit.z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      properties:
        asset.category === 'model'
          ? { meshUrl: asset.url, castShadow: true, receiveShadow: true, colliderShape: 'none' }
          : { audioUrl: asset.url, loop: false, volume: 1, maxDistance: 24, autoPlay: false },
    })
    this.deps.api.scene.select(created.id)
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return
    /* Ignore shortcuts while typing in an input/textarea/contenteditable. */
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

    if (e.key === 'w' || e.key === 'W') this.setMode('translate')
    else if (e.key === 'e' || e.key === 'E') this.setMode('rotate')
    else if (e.key === 'r' || e.key === 'R') this.setMode('scale')
    else if (e.key === 'f' || e.key === 'F') this.frameSelected()
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      const id = this.deps.store.getSelectedId()
      if (id) this.deps.api.scene.delete(id)
    }
  }
}

/* ---------- helpers ---------- */

function markEditorOnly(obj: Object3D): void {
  obj.userData.__editorOnly = true
  obj.traverse((c) => {
    c.userData.__editorOnly = true
  })
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180
}

function radToDeg(r: number): number {
  return (r * 180) / Math.PI
}

function disposeTree(obj: Object3D): void {
  obj.traverse((c) => {
    const mesh = c as unknown as { geometry?: { dispose?: () => void }; material?: unknown }
    mesh.geometry?.dispose?.()
    const mat = mesh.material
    if (Array.isArray(mat)) {
      for (const m of mat) (m as { dispose?: () => void }).dispose?.()
    } else if (mat && typeof (mat as { dispose?: () => void }).dispose === 'function') {
      ;(mat as { dispose: () => void }).dispose()
    }
  })
}

/** Colored primitive mesh per entity type as a visual stand-in when there's no GLB. */
function placeholderFor(type: string): Object3D {
  const group = new Group()
  markEditorOnly(group)
  let mesh: Mesh
  switch (type) {
    case 'character':
    case 'monkey_player':
      mesh = new Mesh(new SphereGeometry(0.6, 16, 12), new MeshStandardMaterial({ color: 0x3b82f6 }))
      break
    case 'player_spawn':
      mesh = new Mesh(
        new BoxGeometry(0.5, 1.5, 0.5),
        new MeshStandardMaterial({ color: 0xef4444, transparent: true, opacity: 0.75 }),
      )
      mesh.position.y = 0.75
      break
    case 'pickup':
    case 'banana_pickup_node':
      mesh = new Mesh(new SphereGeometry(0.4, 12, 10), new MeshStandardMaterial({ color: 0xfacc15 }))
      break
    case 'audio_emitter':
      mesh = new Mesh(
        new SphereGeometry(0.3, 10, 8),
        new MeshBasicMaterial({ color: 0x8b5cf6, wireframe: true }),
      )
      break
    case 'zone_trigger':
      mesh = new Mesh(
        new BoxGeometry(2, 2, 2),
        new MeshBasicMaterial({ color: 0x22c55e, wireframe: true, transparent: true, opacity: 0.6 }),
      )
      break
    case 'projectile_def':
      mesh = new Mesh(new BoxGeometry(0.3, 0.3, 0.3), new MeshStandardMaterial({ color: 0xf97316 }))
      break
    case 'empty':
    default:
      mesh = new Mesh(
        new BoxGeometry(0.4, 0.4, 0.4),
        new MeshBasicMaterial({ color: 0xa1a1aa, wireframe: true }),
      )
  }
  markEditorOnly(mesh)
  group.add(mesh)
  return group
}
