/**
 * Map registry. Each map is a self-contained world: scene contents + colliders
 * + ring-out predicate + spawn Y. Selected from the lobby; for PvP the host
 * is authoritative and pushes the chosen map to the guest in `hello`.
 */
import {
  Box3,
  Group,
  Material,
  Mesh,
  Object3D,
  Vector3,
  type Scene,
  type BufferGeometry,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { addArena } from './arena'
import { gameConfig } from './gameConfig'

export type MapId = 'default' | 'island'

export const MAP_DEFS: { id: MapId; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'island', label: 'Island' },
]

export function isMapId(value: unknown): value is MapId {
  return value === 'default' || value === 'island'
}

export type MapHandle = {
  id: MapId
  /** Objects considered solid for ground raycasting + bot ground sync. */
  colliders: Object3D[]
  /** Returns true if `pos` should count as a ring-out (death/blast zone). */
  isBlastZone: (pos: Vector3) => boolean
  /** Camera Y where the player should appear at spawn (before gravity drop). */
  getSpawnY: (eyeHeight: number) => number
  /** Bot root Y at spawn (before gravity drop). */
  getBotSpawnY: (footOffset: number) => number
  /** Remove the map's geometry from the scene and dispose its GPU resources. */
  dispose: () => void
}

const ISLAND_GLB_URL = new URL('../Assets/Maps/TestIsland.glb', import.meta.url).href

function disposeObject3D(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Mesh
    const geom = (mesh as { geometry?: BufferGeometry }).geometry
    if (geom && typeof geom.dispose === 'function') geom.dispose()
    const mat = (mesh as { material?: Material | Material[] }).material
    if (Array.isArray(mat)) {
      for (const m of mat) m?.dispose?.()
    } else if (mat) {
      mat.dispose?.()
    }
  })
}

function loadDefaultMap(_scene: Scene, hubRoot: Group): MapHandle {
  const container = new Group()
  container.name = 'map:default'
  hubRoot.add(container)
  const ground = addArena(container)

  return {
    id: 'default',
    colliders: [ground],
    isBlastZone(pos: Vector3): boolean {
      if (pos.y < gameConfig.blastY) return true
      const halfW = gameConfig.groundWidth / 2 + gameConfig.blastMargin
      const halfD = gameConfig.groundDepth / 2 + gameConfig.blastMargin
      return Math.abs(pos.x) > halfW || Math.abs(pos.z) > halfD
    },
    getSpawnY(eyeHeight: number): number {
      return eyeHeight
    },
    getBotSpawnY(footOffset: number): number {
      return footOffset + 0.08
    },
    dispose() {
      hubRoot.remove(container)
      disposeObject3D(container)
    },
  }
}

async function loadIslandMap(_scene: Scene, hubRoot: Group): Promise<MapHandle> {
  const container = new Group()
  container.name = 'map:island'
  hubRoot.add(container)

  const loader = new GLTFLoader()
  const gltf = await new Promise<{ scene: Group }>((resolve, reject) => {
    loader.load(
      ISLAND_GLB_URL,
      (data) => resolve(data as unknown as { scene: Group }),
      undefined,
      (err) => reject(err),
    )
  })

  container.add(gltf.scene)
  const colliders: Object3D[] = []
  gltf.scene.traverse((node) => {
    const mesh = node as Mesh
    if ((mesh as Mesh).isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
      colliders.push(mesh)
    }
  })

  /* Bounding box drives the air-drop spawn so fighters land on top of the island. */
  const bbox = new Box3().setFromObject(gltf.scene)
  const topY = Number.isFinite(bbox.max.y) ? bbox.max.y : 0
  const dropTopY = topY + 6

  return {
    id: 'island',
    colliders,
    isBlastZone(pos: Vector3): boolean {
      return pos.y < gameConfig.blastY
    },
    getSpawnY(eyeHeight: number): number {
      return dropTopY + eyeHeight
    },
    getBotSpawnY(footOffset: number): number {
      return dropTopY + footOffset
    },
    dispose() {
      hubRoot.remove(container)
      disposeObject3D(container)
    },
  }
}

export async function loadMap(id: MapId, scene: Scene, hubRoot: Group): Promise<MapHandle> {
  if (id === 'island') {
    return await loadIslandMap(scene, hubRoot)
  }
  return loadDefaultMap(scene, hubRoot)
}
