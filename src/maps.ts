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
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type Scene,
  type BufferGeometry,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { addArena, getArenaCollisionCuboids } from './arena'
import { gameConfig } from './gameConfig'

export type MapId = 'default' | 'island' | 'godotExport'
export type SpawnSlot = 'a' | 'b'

export const MAP_DEFS: { id: MapId; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'island', label: 'Island' },
  { id: 'godotExport', label: 'Godot export test' },
]

export function isMapId(value: unknown): value is MapId {
  return value === 'default' || value === 'island' || value === 'godotExport'
}

export type MapHandle = {
  id: MapId
  /** Meshes used to build static terrain colliders in Rapier. */
  collisionMeshes: Mesh[]
  /**
   * Optional fixed cuboids (half-extents, world-space centers) — preferred for the default arena
   * instead of trimesh-from-box meshes.
   */
  rapierCuboids?: { center: Vector3; halfExtents: Vector3 }[]
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
const GODOT_EXPORT_GLB_URL = new URL('../Assets/Maps/Godot_ExportTest.glb', import.meta.url).href
const GODOT_DIFFUSE_MAP_URL = new URL('../Assets/Maps/texture_08.png', import.meta.url).href
/** Solid albedo for island visuals; GLB textures are stripped after load. */
const ISLAND_SOLID_BASE_HEX = 0x2a235b

function assignDiffuseMap(
  raw: MeshStandardMaterial | MeshPhysicalMaterial | MeshLambertMaterial,
  tex: Texture,
  oldMaps: Set<Texture>,
): void {
  if (raw.map && raw.map !== tex) oldMaps.add(raw.map)
  raw.map = tex
  raw.color.setHex(0xffffff)
  raw.needsUpdate = true
}

/** Replaces embedded GLB albedo with the shared checker PNG (disposes old map textures). */
function applyGodotDiffuseMap(root: Object3D, tex: Texture): void {
  const oldMaps = new Set<Texture>()
  root.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh || !mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const raw of mats) {
      if (
        raw instanceof MeshStandardMaterial ||
        raw instanceof MeshPhysicalMaterial ||
        raw instanceof MeshLambertMaterial
      ) {
        assignDiffuseMap(raw, tex, oldMaps)
      }
    }
  })
  for (const t of oldMaps) t.dispose()
}

function loadGodotDiffuseTexture(): Promise<Texture> {
  const loader = new TextureLoader()
  return new Promise((resolve, reject) => {
    loader.load(
      GODOT_DIFFUSE_MAP_URL,
      (tex) => {
        tex.colorSpace = SRGBColorSpace
        tex.flipY = false
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

function applyIslandSolidMaterials(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh) return
    const olds = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const nextMats = olds.map(
      () =>
        new MeshStandardMaterial({
          color: ISLAND_SOLID_BASE_HEX,
          roughness: 0.82,
          metalness: 0.06,
        }),
    )
    mesh.material = nextMats.length === 1 ? nextMats[0]! : nextMats
    for (const m of olds) {
      m.dispose()
    }
  })
}

function normalizeSceneName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * GLB / Blender object naming for static Rapier trimesh: include `col_` (preferred),
 * `coll_…`, or `collision…` in the name. Parents count — meshes can be children of a
 * `col_…` group. Avoid naming visuals `color…` / `colum…` (those are ignored by the
 * `col` prefix path below).
 */
function isCollisionNodeName(name: string): boolean {
  const n = normalizeSceneName(name)
  if (n.startsWith('col_') || n.startsWith('coll_') || n.startsWith('collision_')) return true
  if (n === 'collision' || n.startsWith('collision')) return true
  if (
    n.length >= 4 &&
    n.startsWith('col') &&
    !n.startsWith('color') &&
    !n.startsWith('colum')
  ) {
    return true
  }
  return false
}

/**
 * Empties or any node with a world position; case-insensitive after normalize.
 * Player A: spawn_player, spawn_a, spawn_p1, player_spawn, PlayerSpawn1, …
 * Player B: spawn_player_2, spawn_b, spawn_p2, PlayerSpawn2, PlayerSpawn1.001 (Blender dup), …
 *
 * Note: Blender appends `.001`, `.002`, … when an object is duplicated; after
 * normalization those become `_001`, `_002`, …  We treat the first such duplicate
 * of a slot-A name as slot B so authors can copy the spawn empty in Blender.
 */
function spawnSlotFromName(normalized: string): SpawnSlot | null {
  if (
    normalized === 'spawn_player' ||
    normalized === 'spawn_a' ||
    normalized === 'spawn_p1' ||
    normalized === 'player_spawn' ||
    normalized === 'player_spawn_1' ||
    normalized === 'spawn_1' ||
    normalized === 'p1' ||
    normalized === 'spawna' ||
    normalized === 'playerspawn' ||
    normalized === 'playerspawn1' ||
    normalized === 'playerspawn_1'
  ) {
    return 'a'
  }
  if (
    normalized === 'spawn_player_2' ||
    normalized === 'spawn_player2' ||
    normalized === 'spawn_b' ||
    normalized === 'spawn_p2' ||
    normalized === 'player_spawn_2' ||
    normalized === 'spawn_2' ||
    normalized === 'p2' ||
    normalized === 'spawnb' ||
    normalized === 'playerspawn2' ||
    normalized === 'playerspawn_2' ||
    /* Blender duplicate of an A-named spawn → use as B. */
    /^(playerspawn1?|player_spawn|spawn_player|spawn_a|spawn_p1)_\d{3,}$/.test(normalized)
  ) {
    return 'b'
  }
  return null
}

/** Loosely identifies any node likely to be a player spawn marker (used for ordered fallback). */
function looksLikeSpawnMarker(normalized: string): boolean {
  return (
    normalized.startsWith('playerspawn') ||
    normalized.startsWith('spawn_player') ||
    normalized.startsWith('player_spawn') ||
    normalized.startsWith('spawn_p') ||
    normalized.startsWith('spawn_a') ||
    normalized.startsWith('spawn_b') ||
    normalized === 'p1' ||
    normalized === 'p2'
  )
}

function hasCollisionMarker(node: Object3D): boolean {
  let cur: Object3D | null = node
  while (cur) {
    if (isCollisionNodeName(cur.name)) return true
    cur = cur.parent
  }
  return false
}

/** Godot CSG baked exports use mesh names like CSGBakedMeshInstance3D — no col_ prefix. */
function isGodotCsgBakedCollisionName(normalizedMeshName: string): boolean {
  return (
    normalizedMeshName.includes('csgbakedmesh') ||
    normalizedMeshName.includes('csg_mesh') ||
    normalizedMeshName.includes('staticbody3d')
  )
}

type GltfCollisionPolicy = 'markersOnly' | 'markersOrGodotCsgMesh'

function meshCountsAsTerrainCollision(
  mesh: Mesh,
  normalizedMeshName: string,
  policy: GltfCollisionPolicy,
): boolean {
  if (policy === 'markersOnly') return hasCollisionMarker(mesh)
  return hasCollisionMarker(mesh) || isGodotCsgBakedCollisionName(normalizedMeshName)
}

function collectGltfArenaData(root: Group, collisionPolicy: GltfCollisionPolicy): {
  collisionMeshes: Mesh[]
  spawnA: Vector3 | null
  spawnB: Vector3 | null
  looseSpawns: Vector3[]
} {
  const collisionMeshes: Mesh[] = []
  let spawnA: Vector3 | null = null
  let spawnB: Vector3 | null = null
  const looseSpawns: Vector3[] = []
  root.updateMatrixWorld(true)
  root.traverse((node) => {
    const normalizedName = normalizeSceneName(node.name)
    const slot = spawnSlotFromName(normalizedName)
    if (slot === 'a') {
      spawnA = node.getWorldPosition(new Vector3())
    } else if (slot === 'b') {
      spawnB = node.getWorldPosition(new Vector3())
    } else if (looksLikeSpawnMarker(normalizedName)) {
      looseSpawns.push(node.getWorldPosition(new Vector3()))
    }

    const mesh = node as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (meshCountsAsTerrainCollision(mesh, normalizedName, collisionPolicy)) {
      collisionMeshes.push(mesh)
    }
  })
  return { collisionMeshes, spawnA, spawnB, looseSpawns }
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
  addArena(container)

  function defaultFeetSpawn(slot: SpawnSlot): Vector3 {
    const arenaHalf = Math.min(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 - 2.5
    const spacing = Math.min(6.8, arenaHalf * 0.38)
    return new Vector3(0, 0, slot === 'a' ? spacing : -spacing)
  }

  return {
    id: 'default',
    collisionMeshes: [],
    rapierCuboids: getArenaCollisionCuboids(),
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
  applyIslandSolidMaterials(gltf.scene)
  const { collisionMeshes, spawnA: sA, spawnB: sB, looseSpawns } = collectGltfArenaData(
    gltf.scene,
    'markersOnly',
  )
  let spawnA = sA
  let spawnB = sB

  /* Fill missing slots from loose spawn markers in document order. */
  if (!spawnA && looseSpawns.length > 0) spawnA = looseSpawns.shift() ?? null
  if (!spawnB && looseSpawns.length > 0) spawnB = looseSpawns.shift() ?? null

  if (collisionMeshes.length === 0) {
    console.warn(
      '[map:island] No collision meshes. Name objects (or a parent) with col_*, coll_*, or collision* so Rapier can build trimesh colliders.',
    )
  } else {
    console.info(`[map:island] ${collisionMeshes.length} collision mesh(es), trimesh → Rapier.`)
  }
  if (!spawnA || !spawnB) {
    console.warn(
      '[map:island] Missing player spawn(s); using bbox fallbacks. Add empties named spawn_player (A) and spawn_player_2 (B) (or spawn_a / spawn_b, etc.).',
    )
  }

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
    collisionMeshes,
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

async function loadGodotExportMap(_scene: Scene, hubRoot: Group): Promise<MapHandle> {
  const container = new Group()
  container.name = 'map:godotExport'
  hubRoot.add(container)

  const loader = new GLTFLoader()
  const [gltf, diffuseTex] = await Promise.all([
    new Promise<{ scene: Group }>((resolve, reject) => {
      loader.load(
        GODOT_EXPORT_GLB_URL,
        (data) => resolve(data as unknown as { scene: Group }),
        undefined,
        (err) => reject(err),
      )
    }),
    loadGodotDiffuseTexture(),
  ])

  container.add(gltf.scene)
  applyGodotDiffuseMap(gltf.scene, diffuseTex)
  const { collisionMeshes, spawnA: sA, spawnB: sB, looseSpawns } = collectGltfArenaData(
    gltf.scene,
    'markersOrGodotCsgMesh',
  )
  let spawnA = sA
  let spawnB = sB

  if (!spawnA && looseSpawns.length > 0) spawnA = looseSpawns.shift() ?? null
  if (!spawnB && looseSpawns.length > 0) spawnB = looseSpawns.shift() ?? null

  if (collisionMeshes.length === 0) {
    console.warn(
      '[map:godotExport] No collision meshes. Use col_* node names, or CSGBakedMeshInstance / StaticBody-style mesh names from Godot.',
    )
  } else {
    console.info(`[map:godotExport] ${collisionMeshes.length} collision mesh(es), trimesh → Rapier.`)
  }
  if (!spawnA || !spawnB) {
    console.warn(
      '[map:godotExport] Missing player spawn(s); using bbox fallbacks. Name empties PlayerSpawn1 / PlayerSpawn2 (or spawn_player / spawn_player_2).',
    )
  }

  const bbox = new Box3().setFromObject(gltf.scene)
  const topY = Number.isFinite(bbox.max.y) ? bbox.max.y : 0
  const dropTopY = topY + 6
  const fallbackA = new Vector3(0, dropTopY, 6.8)
  const fallbackB = new Vector3(0, dropTopY, -6.8)

  function feetSpawn(slot: SpawnSlot): Vector3 {
    return (slot === 'a' ? spawnA : spawnB)?.clone() ?? (slot === 'a' ? fallbackA : fallbackB).clone()
  }

  return {
    id: 'godotExport',
    collisionMeshes,
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
  if (id === 'godotExport') {
    return await loadGodotExportMap(scene, hubRoot)
  }
  return loadDefaultMap(scene, hubRoot)
}
