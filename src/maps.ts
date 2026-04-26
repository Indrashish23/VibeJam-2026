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
export type SpawnSlot = 'a' | 'b'

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
  /** Camera world position for a spawn marker. */
  getPlayerSpawn: (slot: SpawnSlot, eyeHeight: number) => Vector3
  /** Bot root world position for a spawn marker. */
  getBotSpawn: (slot: SpawnSlot, footOffset: number) => Vector3
  /** Remove the map's geometry from the scene and dispose its GPU resources. */
  dispose: () => void
}

const ISLAND_GLB_URL = new URL('../Assets/Maps/lowpoly_islandtest.glb', import.meta.url).href

function normalizeSceneName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function isColliderNodeName(name: string): boolean {
  const n = normalizeSceneName(name)
  return n.startsWith('col_') || n.startsWith('coll_') || n.startsWith('collision_')
}

function hasColliderMarker(node: Object3D): boolean {
  let cur: Object3D | null = node
  while (cur) {
    if (isColliderNodeName(cur.name)) return true
    cur = cur.parent
  }
  return false
}

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

  function defaultFeetSpawn(slot: SpawnSlot): Vector3 {
    const arenaHalf = Math.min(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 - 2.5
    const spacing = Math.min(6.8, arenaHalf * 0.38)
    return new Vector3(0, 0, slot === 'a' ? spacing : -spacing)
  }

  return {
    id: 'default',
    colliders: [ground],
    isBlastZone(pos: Vector3): boolean {
      if (pos.y < gameConfig.blastY) return true
      const halfW = gameConfig.groundWidth / 2 + gameConfig.blastMargin
      const halfD = gameConfig.groundDepth / 2 + gameConfig.blastMargin
      return Math.abs(pos.x) > halfW || Math.abs(pos.z) > halfD
    },
    getPlayerSpawn(slot: SpawnSlot, eyeHeight: number): Vector3 {
      const feet = defaultFeetSpawn(slot)
      return new Vector3(feet.x, feet.y + eyeHeight, feet.z)
    },
    getBotSpawn(slot: SpawnSlot, footOffset: number): Vector3 {
      const feet = defaultFeetSpawn(slot)
      return new Vector3(feet.x, feet.y + footOffset + 0.08, feet.z)
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
  const allMeshes: Object3D[] = []
  let spawnA: Vector3 | null = null
  let spawnB: Vector3 | null = null
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((node) => {
    const normalizedName = normalizeSceneName(node.name)
    if (normalizedName === 'spawn_player') {
      spawnA = node.getWorldPosition(new Vector3())
    } else if (normalizedName === 'spawn_player_2' || normalizedName === 'spawn_player2') {
      spawnB = node.getWorldPosition(new Vector3())
    }

    const mesh = node as Mesh
    if ((mesh as Mesh).isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
      allMeshes.push(mesh)
      if (hasColliderMarker(mesh)) colliders.push(mesh)
    }
  })
  if (colliders.length === 0) colliders.push(...allMeshes)

  /* Fallback keeps broken test exports playable, but named spawn markers win. */
  const bbox = new Box3().setFromObject(gltf.scene)
  const topY = Number.isFinite(bbox.max.y) ? bbox.max.y : 0
  const dropTopY = topY + 6
  const fallbackA = new Vector3(0, dropTopY, 6.8)
  const fallbackB = new Vector3(0, dropTopY, -6.8)

  function feetSpawn(slot: SpawnSlot): Vector3 {
    return (slot === 'a' ? spawnA : spawnB)?.clone() ?? (slot === 'a' ? fallbackA : fallbackB).clone()
  }

  return {
    id: 'island',
    colliders,
    isBlastZone(pos: Vector3): boolean {
      return pos.y < gameConfig.blastY
    },
    getPlayerSpawn(slot: SpawnSlot, eyeHeight: number): Vector3 {
      const feet = feetSpawn(slot)
      feet.y += eyeHeight
      return feet
    },
    getBotSpawn(slot: SpawnSlot, footOffset: number): Vector3 {
      const feet = feetSpawn(slot)
      feet.y += footOffset
      return feet
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
