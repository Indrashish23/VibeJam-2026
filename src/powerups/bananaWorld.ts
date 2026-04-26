import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three'
import { gameConfig } from '../gameConfig'
import type { MapHandle, MapId } from '../maps'
import type { TerrainPhysics } from '../physics/terrainPhysics'
const _aim = new Vector3()

function disposeMeshWithLights(m: Mesh): void {
  m.traverse((o) => {
    if (o instanceof PointLight) o.dispose()
  })
  m.geometry.dispose()
  ;(m.material as MeshStandardMaterial).dispose()
}

export type BananaPeelRecord = {
  id: string
  x: number
  y: number
  z: number
  mesh: Mesh
}

export type BananaPickupRecord = {
  id: string
  x: number
  y: number
  z: number
  baseY: number
  mesh: Mesh
}

function makePickupMesh(): Mesh {
  const geo = new BoxGeometry(0.55, 0.55, 0.55)
  const mat = new MeshStandardMaterial({
    color: new Color(0xffd12a),
    emissive: new Color(0xffa800),
    emissiveIntensity: 1.2,
    metalness: 0.1,
    roughness: 0.36,
  })
  const m = new Mesh(geo, mat)
  m.name = 'bananaPickupCrate'
  const glow = new PointLight(0xffe588, 0.85, 5.2, 1.35)
  glow.name = 'bananaPickupGlow'
  m.add(glow)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function makePeelMesh(): Mesh {
  const geo = new BoxGeometry(0.9, 0.05, 0.55)
  const mat = new MeshStandardMaterial({
    color: new Color(0xffe14a),
    emissive: new Color(0xffc820),
    emissiveIntensity: 0.72,
    metalness: 0.1,
    roughness: 0.44,
  })
  const m = new Mesh(geo, mat)
  m.name = 'bananaPeel'
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function makeFlyingMesh(): Mesh {
  const geo = new BoxGeometry(0.32, 0.12, 0.4)
  const mat = new MeshStandardMaterial({
    color: new Color(0xffe22a),
    emissive: new Color(0xffb800),
    emissiveIntensity: 0.6,
    metalness: 0.08,
    roughness: 0.45,
  })
  const m = new Mesh(geo, mat)
  m.castShadow = true
  m.name = 'bananaFlight'
  return m
}

function makeHandProp(): Group {
  const g = new Group()
  g.name = 'bananaHandProp'
  const body = new Mesh(
    new BoxGeometry(0.2, 0.08, 0.32),
    new MeshStandardMaterial({
      color: new Color(0xffe24a),
      emissive: new Color(0xccaa20),
      emissiveIntensity: 0.3,
    }),
  )
  g.add(body)
  g.visible = false
  return g
}

/**
 * Procedural XZ points inside the default arena, away from spawns.
 */
function defaultArenaSpawnPoints(): Vector3[] {
  const w = gameConfig.groundWidth * 0.5 - 3.2
  const d = gameConfig.groundDepth * 0.5 - 3.2
  return [
    new Vector3(-w * 0.45, 0, 0),
    new Vector3(w * 0.5, 0, d * 0.4),
    new Vector3(0, 0, d * 0.55),
    new Vector3(w * 0.3, 0, -d * 0.45),
    new Vector3(-w * 0.2, 0, -d * 0.35),
  ]
}

/**
 * Island: spread around origin, ray will correct Y.
 */
function islandSpawnPoints(): Vector3[] {
  return [
    new Vector3(4, 0, 4),
    new Vector3(-5, 0, 2),
    new Vector3(2, 0, -6),
    new Vector3(-3, 0, -4),
    new Vector3(6, 0, -1),
  ]
}

export function getBananaSpawnCandidates(mapId: MapId): Vector3[] {
  if (mapId === 'island') return islandSpawnPoints()
  return defaultArenaSpawnPoints()
}

function placeOnTerrain(
  pts: Vector3[],
  terrain: TerrainPhysics,
  out: { x: number; y: number; z: number }[],
  maxCount: number,
  isBlast: (p: Vector3) => boolean,
): void {
  for (const p0 of pts) {
    if (out.length >= maxCount) return
    const o = p0
    const hit = terrain.raycastDown(o.x, 22, o.z, 200)
    if (!hit) continue
    if (isBlast(hit.point)) continue
    out.push({ x: o.x, y: hit.point.y, z: o.z })
  }
}

export class BananaWorld {
  readonly handGroup: Group
  private readonly scene: Scene
  private nextId = 0
  pickups: BananaPickupRecord[] = []
  peels: BananaPeelRecord[] = []
  private flying: { pos: Vector3; vel: Vector3; mesh: Mesh; start: Vector3 } | null = null

  constructor(scene: Scene) {
    this.scene = scene
    this.handGroup = makeHandProp()
  }

  attachHandToCamera(camera: PerspectiveCamera): void {
    this.handGroup.removeFromParent()
    const g = this.handGroup
    g.position.set(
      gameConfig.bananaHandLocalX,
      gameConfig.bananaHandLocalY,
      gameConfig.bananaHandLocalZ,
    )
    camera.add(g)
  }

  clear(): void {
    for (const p of this.pickups) {
      this.scene.remove(p.mesh)
      disposeMeshWithLights(p.mesh)
    }
    for (const p of this.peels) {
      this.scene.remove(p.mesh)
      disposeMeshWithLights(p.mesh)
    }
    this.pickups = []
    this.peels = []
    this.clearFlying()
  }

  clearFlying(): void {
    if (!this.flying) return
    this.scene.remove(this.flying.mesh)
    disposeMeshWithLights(this.flying.mesh)
    this.flying = null
  }

  /**
   * Full local reset: candidates + raycast to terrain.
   */
  respawnLocal(
    map: MapHandle,
    terrain: TerrainPhysics,
    count: number,
  ): { id: string; x: number; y: number; z: number }[] {
    this.clear()
    const candidates = getBananaSpawnCandidates(map.id)
    const placed: { x: number; y: number; z: number }[] = []
    placeOnTerrain(candidates, terrain, placed, count, (p) => map.isBlastZone(p))
    const out: { id: string; x: number; y: number; z: number }[] = []
    for (const pos of placed) {
      const id = `p${this.nextId++}`
      const m = makePickupMesh()
      m.position.set(pos.x, pos.y + 0.35, pos.z)
      this.scene.add(m)
      this.pickups.push({
        id,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        baseY: pos.y + 0.35,
        mesh: m,
      })
      out.push({ id, x: pos.x, y: pos.y, z: pos.z })
    }
    return out
  }

  /**
   * Apply network init (host sends positions).
   */
  applyInitPickups(
    list: { id: string; x: number; y: number; z: number }[],
  ): void {
    this.clear()
    for (const it of list) {
      const m = makePickupMesh()
      m.position.set(it.x, it.y + 0.35, it.z)
      this.scene.add(m)
      this.pickups.push({
        id: it.id,
        x: it.x,
        y: it.y,
        z: it.z,
        baseY: it.y + 0.35,
        mesh: m,
      })
    }
  }

  tickPickupsHover(timeSec: number): void {
    const amp = gameConfig.bananaHoverAmp
    const s = 2.1
    for (const p of this.pickups) {
      p.mesh.position.y = p.baseY + Math.sin(timeSec * s + p.x * 0.7) * amp
    }
  }

  removePickupById(id: string): void {
    const i = this.pickups.findIndex((p) => p.id === id)
    if (i < 0) return
    const p = this.pickups[i]!
    this.scene.remove(p.mesh)
    disposeMeshWithLights(p.mesh)
    this.pickups.splice(i, 1)
  }

  addPeel(
    x: number,
    y: number,
    z: number,
    id: string,
  ): BananaPeelRecord {
    const m = makePeelMesh()
    m.position.set(x, y + 0.04, z)
    this.scene.add(m)
    const r: BananaPeelRecord = { id, x, y, z, mesh: m }
    this.peels.push(r)
    return r
  }

  addPeelFromId(id: string, x: number, y: number, z: number): void {
    this.addPeel(x, y, z, id)
  }

  removePeelById(id: string): void {
    const i = this.peels.findIndex((p) => p.id === id)
    if (i < 0) return
    const p = this.peels[i]!
    this.scene.remove(p.mesh)
    disposeMeshWithLights(p.mesh)
    this.peels.splice(i, 1)
  }

  /**
   * Local start throw: flying mesh + will land via tickFlying.
   */
  beginLocalThrow(muzzle: Vector3, cam: PerspectiveCamera): void {
    this.clearFlying()
    const mesh = makeFlyingMesh()
    this.scene.add(mesh)
    mesh.position.copy(muzzle)
    cam.getWorldDirection(_aim)
    const upMul = gameConfig.bananaThrowUpMul
    _aim.y = 0.22 * upMul
    if (_aim.lengthSq() < 1e-8) _aim.set(0, 0.1, -1)
    _aim.normalize()
    _aim.multiplyScalar(gameConfig.bananaThrowSpeed)
    this.flying = { pos: muzzle.clone(), vel: _aim.clone(), mesh, start: muzzle.clone() }
  }

  /**
   * Integrate one frame; returns true when reached landing to spawn peel.
   */
  tickFlying(
    delta: number,
    onLand: (x: number, y: number, z: number) => void,
    raycastDown: (x: number, y: number, z: number, maxD: number) => ReturnType<
      TerrainPhysics['raycastDown']
    >,
  ): void {
    if (!this.flying) return
    const { pos, vel, mesh, start } = this.flying
    const g = gameConfig.gravity
    vel.y -= g * delta
    pos.addScaledVector(vel, delta)
    mesh.position.copy(pos)
    const dx = pos.x - start.x
    const dz = pos.z - start.z
    if (Math.hypot(dx, dz) > gameConfig.bananaThrowMaxRange) {
      const h = raycastDown(pos.x, pos.y + 0.2, pos.z, 200)
      if (h) onLand(h.point.x, h.point.y, h.point.z)
      else onLand(pos.x, Math.max(gameConfig.blastY, pos.y), pos.z)
      this.clearFlying()
      return
    }
    const hit = raycastDown(pos.x, pos.y + 0.2, pos.z, 200)
    if (hit && pos.y < hit.point.y + 0.3 && vel.y < 0) {
      onLand(hit.point.x, hit.point.y, hit.point.z)
      this.clearFlying()
      return
    }
    if (pos.y < gameConfig.blastY) {
      onLand(pos.x, pos.y, pos.z)
      this.clearFlying()
    }
  }

  dispose(): void {
    this.clear()
    this.handGroup.traverse((c) => {
      const o = c as Mesh
      if (o.isMesh) {
        o.geometry?.dispose?.()
        const mat = o.material
        if (Array.isArray(mat)) for (const m of mat) m?.dispose?.()
        else (mat as MeshStandardMaterial | undefined)?.dispose?.()
      }
    })
  }
}
