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
  Vector3,
  type Scene,
  type BufferGeometry,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { addArena, getArenaCollisionCuboids } from './arena'
import { gameConfig } from './gameConfig'
import { createArenaTriplanarMaterial, loadArenaTriplanarTexture } from './maps/arenaTriplanarMaterial'

export type MapId = 'arena' | 'default'

export type MapDef = { id: MapId; label: string; devOnly?: boolean }

export const MAP_DEFS: MapDef[] = [
  { id: 'arena', label: 'Arena' },
  { id: 'default', label: 'Battleground', devOnly: true },
]

/** Lobby dropdown: hide dev-only maps in production builds. */
export function mapDefsForLobby(): MapDef[] {
  if (import.meta.env.DEV) return MAP_DEFS
  return MAP_DEFS.filter((d) => !d.devOnly)
}

export type SpawnSlot = 'a' | 'b'

export function isMapId(value: unknown): value is MapId {
  return value === 'arena' || value === 'default'
}

/** Old sessions / URLs may reference removed maps — coerce to Arena. */
export function migrateLegacyMapId(raw: string | null | undefined): MapId {
  if (raw === 'godotExport' || raw === 'floatingIslandStage') return 'arena'
  if (isMapId(raw)) return raw
  return 'arena'
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
  /** When set, banana pickups use only these world XZ/Y candidates (GLB empties). */
  bananaSpawnPoints?: Vector3[]
  /** Returns true if `pos` should count as a ring-out (death/blast zone). */
  isBlastZone: (pos: Vector3) => boolean
  /** Camera world position for a spawn marker. */
  getPlayerSpawn: (slot: SpawnSlot, eyeHeight: number) => Vector3
  /** Bot root world position for a spawn marker. */
  getBotSpawn: (slot: SpawnSlot, footOffset: number) => Vector3
  /**
   * Foot-space spawn candidates for respawn raycasts (Y may be approximate for GLTF maps).
   * Combined with {@link pickGroundedRespawnFoot} + TerrainPhysics for grounded picks.
   */
  getRespawnFootCandidates: (slot: SpawnSlot) => Vector3[]
  /** Remove the map's geometry from the scene and dispose its GPU resources. */
  dispose: () => void
}

const ARENA_EXPORT_GLB_URL = new URL('../Assets/Maps/arena_export.glb', import.meta.url).href
/** Uniform scale for authored arena GLB (collision + spawns use world space after this). */
const ARENA_EXPORT_SCALE = 1.7

function normalizeSceneName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * GLB / Blender object naming for static Rapier trimesh (rebuilt from `arena_export.glb` each load):
 * `col_*` (e.g. `col_arena`, `col_mesh`, `col_block`), `coll_…`, or `collision…`.
 * Parents count — a `Mesh` under an empty named `col_mesh` / `col_…` is included.
 * Avoid naming visuals `color…` / `colum…` (those are ignored by the `col` prefix path below).
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

/** Godot CSG baked exports use mesh names like CSGBakedMeshInstance3D — no col_ prefix. */
function isGodotCsgBakedCollisionName(normalizedMeshName: string): boolean {
  return (
    normalizedMeshName.includes('csgbakedmesh') ||
    normalizedMeshName.includes('csg_mesh') ||
    normalizedMeshName.includes('staticbody3d')
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

function meshCountsAsTerrainCollision(mesh: Mesh, normalizedMeshName: string): boolean {
  return hasCollisionMarker(mesh) || isGodotCsgBakedCollisionName(normalizedMeshName)
}

/**
 * Empties or any node with a world position; case-insensitive after normalize.
 * Player A: spawn_player, spawn_a, spawn_p1, player_spawn, PlayerSpawn1, …
 * Player B: spawn_player_2, spawn_b, spawn_p2, PlayerSpawn2, PlayerSpawn1.001 (Blender dup), …
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
    /^(playerspawn1?|player_spawn|spawn_player|spawn_a|spawn_p1)_\d{3,}$/.test(normalized)
  ) {
    return 'b'
  }
  return null
}

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

/** Empties for banana pickup placement (name must suggest banana + spawn/pickup). */
function isBananaSpawnEmptyName(normalized: string): boolean {
  if (!normalized.includes('banana')) return false
  return (
    normalized.includes('spawn') ||
    normalized.includes('pickup') ||
    normalized.includes('spot') ||
    normalized.includes('marker')
  )
}

function collectGltfArenaData(root: Group): {
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
    if (meshCountsAsTerrainCollision(mesh, normalizedName)) {
      collisionMeshes.push(mesh)
    }
  })
  return { collisionMeshes, spawnA, spawnB, looseSpawns }
}

function logArenaCollisionMeshesDev(meshes: Mesh[]): void {
  if (!import.meta.env.DEV) return
  const names = meshes.map((m) => m.name || '(unnamed mesh)')
  console.info(`[map:arena] Collision → Rapier (${meshes.length} mesh(es)):`, names.join(' | '))
}

/**
 * Fixed cuboids under / flush with the arena footprint: pit catch + thin floor deck.
 * Supplements GLTF trimesh so players/bots don’t fall through mesh gaps or seams.
 */
function getArenaExportSafetyCuboids(collisionMeshes: Mesh[], sceneRoot: Group): {
  center: Vector3
  halfExtents: Vector3
}[] {
  const colBox = new Box3()
  let expanded = false
  for (const m of collisionMeshes) {
    colBox.expandByObject(m)
    expanded = true
  }
  if (!expanded || colBox.isEmpty()) {
    sceneRoot.updateMatrixWorld(true)
    colBox.setFromObject(sceneRoot)
  }
  if (colBox.isEmpty()) return []

  sceneRoot.updateMatrixWorld(true)
  const sceneBox = new Box3().setFromObject(sceneRoot)

  const colCenter = new Vector3()
  const colSize = new Vector3()
  colBox.getCenter(colCenter)
  colBox.getSize(colSize)

  const sceneCenter = new Vector3()
  const sceneSize = new Vector3()
  sceneBox.getCenter(sceneCenter)
  sceneBox.getSize(sceneSize)

  const padXZ = 8
  const slabHalfY = 0.55
  const topY = colBox.min.y - 0.02
  const hx = Math.max(colSize.x * 0.5 + padXZ, 34)
  const hz = Math.max(colSize.z * 0.5 + padXZ, 34)

  const out: { center: Vector3; halfExtents: Vector3 }[] = []

  out.push({
    center: new Vector3(colCenter.x, topY - slabHalfY, colCenter.z),
    halfExtents: new Vector3(hx, slabHalfY, hz),
  })

  const deckPad = 14
  const deckHalfY = 0.16
  const deckBottomY = colBox.min.y - 0.02
  const deckCenterY = deckBottomY + deckHalfY
  const deckHx = Math.max(sceneSize.x * 0.5 + deckPad, hx + 4)
  const deckHz = Math.max(sceneSize.z * 0.5 + deckPad, hz + 4)

  out.push({
    center: new Vector3(sceneCenter.x, deckCenterY, sceneCenter.z),
    halfExtents: new Vector3(deckHx, deckHalfY, deckHz),
  })

  return out
}

function collectBananaSpawnEmpties(root: Group): Vector3[] {
  const pts: Vector3[] = []
  root.updateMatrixWorld(true)
  root.traverse((node) => {
    const n = normalizeSceneName(node.name)
    if (isBananaSpawnEmptyName(n)) {
      pts.push(node.getWorldPosition(new Vector3()))
    }
  })
  return dedupeSpawnPoints(pts, 0.55)
}

function dedupeSpawnPoints(points: readonly Vector3[], eps: number): Vector3[] {
  const epsSq = eps * eps
  const out: Vector3[] = []
  for (const p of points) {
    let dup = false
    for (const q of out) {
      if (p.distanceToSquared(q) < epsSq) {
        dup = true
        break
      }
    }
    if (!dup) out.push(p.clone())
  }
  return out
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
    getRespawnFootCandidates(slot: SpawnSlot): Vector3[] {
      const arenaHalf = Math.min(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 - 2.5
      const spacing = Math.min(6.8, arenaHalf * 0.38)
      const wx = gameConfig.groundWidth * 0.32
      const dz = gameConfig.groundDepth * 0.32
      const list = [
        defaultFeetSpawn(slot),
        defaultFeetSpawn(slot === 'a' ? 'b' : 'a'),
        new Vector3(wx, 0, spacing * 0.4),
        new Vector3(-wx, 0, spacing * 0.4),
        new Vector3(wx * 0.62, 0, -spacing * 0.48),
        new Vector3(-wx * 0.62, 0, -spacing * 0.48),
        new Vector3(0, 0, spacing * 1.15),
        new Vector3(0, 0, -spacing * 1.15),
        new Vector3(spacing * 0.52, 0, 0),
        new Vector3(-spacing * 0.52, 0, 0),
        new Vector3(wx * 0.35, 0, dz * 0.35),
        new Vector3(-wx * 0.35, 0, -dz * 0.35),
      ]
      return dedupeSpawnPoints(list, 0.85)
    },
    dispose() {
      hubRoot.remove(container)
      disposeObject3D(container)
    },
  }
}

function applyTriplanarToArenaVisuals(root: Group): void {
  void loadArenaTriplanarTexture().then((tex) => {
    root.traverse((node) => {
      const mesh = node as Mesh
      if (!mesh.isMesh || !mesh.material) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const next: MeshStandardMaterial[] = []
      for (const raw of mats) {
        if (
          raw instanceof MeshStandardMaterial ||
          raw instanceof MeshPhysicalMaterial ||
          raw instanceof MeshLambertMaterial
        ) {
          raw.dispose()
          next.push(createArenaTriplanarMaterial(tex))
        } else {
          return
        }
      }
      if (next.length > 0) {
        mesh.material = next.length === 1 ? next[0]! : next
      }
    })
  })
}

async function loadArenaExportMap(_scene: Scene, hubRoot: Group): Promise<MapHandle> {
  const container = new Group()
  container.name = 'map:arena'
  hubRoot.add(container)

  const loader = new GLTFLoader()
  const gltf = await new Promise<{ scene: Group }>((resolve, reject) => {
    loader.load(
      ARENA_EXPORT_GLB_URL,
      (data) => resolve(data as unknown as { scene: Group }),
      undefined,
      (err) => reject(err),
    )
  })

  container.add(gltf.scene)
  gltf.scene.scale.setScalar(ARENA_EXPORT_SCALE)
  gltf.scene.updateMatrixWorld(true)
  const { collisionMeshes: tagged, spawnA: sA, spawnB: sB, looseSpawns } = collectGltfArenaData(
    gltf.scene,
  )
  let collisionMeshes = tagged
  if (collisionMeshes.length === 0) {
    console.warn(
      '[map:arena] No collision meshes found (need names like col_arena, col_mesh, or parent col_*). Re-export arena_export.glb with Mesh collision objects.',
    )
    const fallback: Mesh[] = []
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((node) => {
      const mesh = node as Mesh
      if (!mesh.isMesh) return
      fallback.push(mesh)
    })
    if (fallback.length >= 1) {
      collisionMeshes = [fallback[0]!]
      console.info('[map:arena] Using first mesh as collision only.')
    }
  } else if (collisionMeshes.length > 1) {
    console.info(
      `[map:arena] ${collisionMeshes.length} collision meshes — using all for Rapier trimesh.`,
    )
  } else {
    console.info('[map:arena] 1 collision mesh → Rapier trimesh.')
  }
  logArenaCollisionMeshesDev(collisionMeshes)

  applyTriplanarToArenaVisuals(gltf.scene)

  let spawnA = sA
  let spawnB = sB
  if (!spawnA && looseSpawns.length > 0) spawnA = looseSpawns.shift() ?? null
  if (!spawnB && looseSpawns.length > 0) spawnB = looseSpawns.shift() ?? null

  const bananaSpawnPoints = collectBananaSpawnEmpties(gltf.scene)
  if (bananaSpawnPoints.length === 0) {
    console.warn(
      '[map:arena] No banana spawn empties (name like banana_spawn_1). Bananas will not spawn on this map until markers exist.',
    )
  }

  const bbox = new Box3().setFromObject(gltf.scene)
  const topY = Number.isFinite(bbox.max.y) ? bbox.max.y : 0
  const dropTopY = topY + 6
  const fallbackA = new Vector3(0, dropTopY, 6.8)
  const fallbackB = new Vector3(0, dropTopY, -6.8)

  const respawnPool: Vector3[] = []
  if (spawnA) respawnPool.push(spawnA.clone())
  if (spawnB) respawnPool.push(spawnB.clone())
  for (const ls of looseSpawns) respawnPool.push(ls.clone())
  respawnPool.push(fallbackA.clone(), fallbackB.clone())

  function feetSpawn(slot: SpawnSlot): Vector3 {
    return (slot === 'a' ? spawnA : spawnB)?.clone() ?? (slot === 'a' ? fallbackA : fallbackB).clone()
  }

  if (!spawnA || !spawnB) {
    console.warn(
      '[map:arena] Missing player spawn(s); using bbox fallbacks. Name empties PlayerSpawn1 / PlayerSpawn2 (or spawn_player / spawn_player_2).',
    )
  }

  return {
    id: 'arena',
    collisionMeshes,
    rapierCuboids: getArenaExportSafetyCuboids(collisionMeshes, gltf.scene),
    bananaSpawnPoints: bananaSpawnPoints.length > 0 ? bananaSpawnPoints : undefined,
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
    getRespawnFootCandidates(slot: SpawnSlot): Vector3[] {
      const opp: SpawnSlot = slot === 'a' ? 'b' : 'a'
      const merged = [feetSpawn(slot), feetSpawn(opp), ...respawnPool.map((v) => v.clone())]
      return dedupeSpawnPoints(merged, 1.6)
    },
    dispose() {
      hubRoot.remove(container)
      disposeObject3D(container)
    },
  }
}

export async function loadMap(id: MapId, scene: Scene, hubRoot: Group): Promise<MapHandle> {
  if (id === 'arena') {
    return await loadArenaExportMap(scene, hubRoot)
  }
  return loadDefaultMap(scene, hubRoot)
}
