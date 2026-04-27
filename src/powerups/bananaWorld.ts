import {
  Box3,
  Group,
  Mesh,
  Object3D,
  PointLight,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { gameConfig } from '../gameConfig'
import type { MapHandle, MapId } from '../maps'
import type { TerrainPhysics } from '../physics/terrainPhysics'
const _aim = new Vector3()

const BANANA_GLB = new URL('../../Assets/Props/Banana_Pickup.glb', import.meta.url).href
const OPENED_BANANA_GLB = new URL('../../Assets/Props/OpenedBanana.glb', import.meta.url).href

/** Pickup visual height above terrain contact point (matches prior crate lift). */
const PICKUP_Y_OFFSET = 0.35
/** Peel mesh sits slightly above the hit point so it does not clip into the floor. */
const PEEL_Y_OFFSET = 0.077

function disposeBananaVisual(root: Object3D): void {
  root.traverse((o) => {
    if (o instanceof PointLight) o.dispose()
    if (o instanceof Mesh) {
      o.geometry?.dispose?.()
      const mat = o.material
      if (Array.isArray(mat)) for (const m of mat) m?.dispose?.()
      else mat?.dispose?.()
    }
  })
}

export type BananaPeelRecord = {
  id: string
  x: number
  y: number
  z: number
  mesh: Object3D
}

export type BananaPickupRecord = {
  id: string
  x: number
  y: number
  z: number
  baseY: number
  mesh: Object3D
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
  if (mapId === 'island' || mapId === 'godotExport') return islandSpawnPoints()
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
  private flying: { pos: Vector3; vel: Vector3; mesh: Object3D; start: Vector3 } | null = null

  /** Normalized banana (bottom on y=0, ~0.55 units tall); clones only, never added to scene. */
  private bananaPivot: Group | null = null
  private bananaLoadPromise: Promise<Group> | null = null
  /** Opened-peel model for landed throws only (same size normalization as pickup). */
  private openedBananaPivot: Group | null = null
  private openedBananaLoadPromise: Promise<Group> | null = null
  private handBananaFilled = false

  constructor(scene: Scene) {
    this.scene = scene
    this.handGroup = new Group()
    this.handGroup.name = 'bananaHandProp'
    this.handGroup.visible = false
    void this.loadBananaTemplate().then(() => this.ensureHandBananaClone())
  }

  /**
   * Loads `Banana_Pickup.glb` once; scales so max extent ~0.55 and rests pivot on ground plane.
   */
  private loadBananaTemplate(): Promise<Group> {
    if (this.bananaPivot) return Promise.resolve(this.bananaPivot)
    if (!this.bananaLoadPromise) {
      const loader = new GLTFLoader()
      this.bananaLoadPromise = loader.loadAsync(BANANA_GLB).then((gltf) => {
        const root = gltf.scene as Group
        root.name = 'bananaPickupModel'
        root.updateMatrixWorld(true)
        root.traverse((o) => {
          if (o instanceof Mesh) {
            o.castShadow = true
            o.receiveShadow = true
          }
        })
        const box = new Box3().setFromObject(root)
        const size = new Vector3()
        box.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z, 1e-6)
        root.scale.multiplyScalar(0.55 / maxDim)
        root.updateMatrixWorld(true)
        const box2 = new Box3().setFromObject(root)
        root.position.y -= box2.min.y
        this.bananaPivot = root
        return root
      })
    }
    return this.bananaLoadPromise
  }

  /**
   * Landed peel uses `OpenedBanana.glb`; normalized like the pickup so scale matches gameplay.
   */
  private loadOpenedBananaTemplate(): Promise<Group> {
    if (this.openedBananaPivot) return Promise.resolve(this.openedBananaPivot)
    if (!this.openedBananaLoadPromise) {
      const loader = new GLTFLoader()
      this.openedBananaLoadPromise = loader.loadAsync(OPENED_BANANA_GLB).then((gltf) => {
        const root = gltf.scene as Group
        root.name = 'openedBananaPeelModel'
        root.updateMatrixWorld(true)
        root.traverse((o) => {
          if (o instanceof Mesh) {
            o.castShadow = true
            o.receiveShadow = true
          }
        })
        const box = new Box3().setFromObject(root)
        const size = new Vector3()
        box.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z, 1e-6)
        root.scale.multiplyScalar(0.55 / maxDim)
        root.updateMatrixWorld(true)
        const box2 = new Box3().setFromObject(root)
        root.position.y -= box2.min.y
        this.openedBananaPivot = root
        return root
      })
    }
    return this.openedBananaLoadPromise
  }

  private async clonePickupVisual(): Promise<Object3D> {
    const pivot = await this.loadBananaTemplate()
    const node = pivot.clone(true)
    node.name = 'bananaPickupCrate'
    const glow = new PointLight(0xffe588, 0.85, 5.2, 1.35)
    glow.name = 'bananaPickupGlow'
    node.add(glow)
    return node
  }

  private async clonePeelVisual(): Promise<Object3D> {
    const pivot = await this.loadOpenedBananaTemplate()
    const node = pivot.clone(true)
    node.name = 'bananaPeel'
    node.rotation.y = Math.PI * 0.15
    node.scale.multiplyScalar(1.08)
    return node
  }

  private async cloneFlyingVisual(): Promise<Object3D> {
    const pivot = await this.loadBananaTemplate()
    const node = pivot.clone(true)
    node.name = 'bananaFlight'
    node.scale.multiplyScalar(0.72)
    return node
  }

  /** In-hand prop: same mesh as pickup, slightly smaller. */
  private ensureHandBananaClone(): void {
    if (this.handBananaFilled || !this.bananaPivot) return
    const node = this.bananaPivot.clone(true)
    node.name = 'bananaHandMesh'
    node.scale.multiplyScalar(0.88)
    this.handGroup.clear()
    this.handGroup.add(node)
    this.handBananaFilled = true
  }

  attachHandToCamera(camera: PerspectiveCamera): void {
    this.handGroup.removeFromParent()
    this.syncHandPoseFromConfig()
    camera.add(this.handGroup)
    void this.loadBananaTemplate().then(() => this.ensureHandBananaClone())
  }

  /** Re-apply camera-local offset from Tweaks every frame so live edits work. */
  syncHandPoseFromConfig(): void {
    this.handGroup.position.set(
      gameConfig.bananaHandLocalX,
      gameConfig.bananaHandLocalY,
      gameConfig.bananaHandLocalZ,
    )
    this.handGroup.rotation.set(0, 0, 0)
  }

  /** Idle sway on top of `syncHandPoseFromConfig` (only when standing — not while walking). */
  applyHandPresentationSway(idleSway = true): void {
    if (!idleSway) return
    const wm = Math.max(0, Math.min(1, gameConfig.fpWeaponSwayMul))
    if (wm < 1e-4) return
    const sway = wm
    const tt = performance.now() * 0.001
    this.handGroup.position.x += Math.sin(tt * 2.05) * 0.0034 * sway
    this.handGroup.position.y += Math.cos(tt * 2.45) * 0.0027 * sway
    this.handGroup.position.z += Math.sin(tt * 1.85) * 0.0023 * sway
    this.handGroup.rotation.x = Math.sin(tt * 1.25) * 0.018 * sway
    this.handGroup.rotation.y = Math.cos(tt * 1.05) * 0.014 * sway
    this.handGroup.rotation.z = Math.sin(tt * 1.65) * 0.017 * sway
  }

  clear(): void {
    for (const p of this.pickups) {
      this.scene.remove(p.mesh)
      disposeBananaVisual(p.mesh)
    }
    for (const p of this.peels) {
      this.scene.remove(p.mesh)
      disposeBananaVisual(p.mesh)
    }
    this.pickups = []
    this.peels = []
    this.clearFlying()
  }

  clearFlying(): void {
    if (!this.flying) return
    this.scene.remove(this.flying.mesh)
    disposeBananaVisual(this.flying.mesh)
    this.flying = null
  }

  /**
   * Full local reset: candidates + raycast to terrain.
   */
  async respawnLocal(
    map: MapHandle,
    terrain: TerrainPhysics,
    count: number,
  ): Promise<{ id: string; x: number; y: number; z: number }[]> {
    this.clear()
    const candidates = getBananaSpawnCandidates(map.id)
    const placed: { x: number; y: number; z: number }[] = []
    placeOnTerrain(candidates, terrain, placed, count, (p) => map.isBlastZone(p))
    const out: { id: string; x: number; y: number; z: number }[] = []
    for (const pos of placed) {
      const id = `p${this.nextId++}`
      const m = await this.clonePickupVisual()
      const yVis = pos.y + PICKUP_Y_OFFSET
      m.position.set(pos.x, yVis, pos.z)
      this.scene.add(m)
      this.pickups.push({
        id,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        baseY: yVis,
        mesh: m,
      })
      out.push({ id, x: pos.x, y: pos.y, z: pos.z })
    }
    return out
  }

  /**
   * Apply network init (host sends positions).
   */
  async applyInitPickups(
    list: { id: string; x: number; y: number; z: number }[],
  ): Promise<void> {
    this.clear()
    for (const it of list) {
      const m = await this.clonePickupVisual()
      const yVis = it.y + PICKUP_Y_OFFSET
      m.position.set(it.x, yVis, it.z)
      this.scene.add(m)
      this.pickups.push({
        id: it.id,
        x: it.x,
        y: it.y,
        z: it.z,
        baseY: yVis,
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
    disposeBananaVisual(p.mesh)
    this.pickups.splice(i, 1)
  }

  private async addPeelAsync(
    x: number,
    y: number,
    z: number,
    id: string,
  ): Promise<BananaPeelRecord> {
    const m = await this.clonePeelVisual()
    m.position.set(x, y + PEEL_Y_OFFSET, z)
    this.scene.add(m)
    const r: BananaPeelRecord = { id, x, y, z, mesh: m }
    this.peels.push(r)
    return r
  }

  addPeel(x: number, y: number, z: number, id: string): void {
    void this.addPeelAsync(x, y, z, id)
  }

  addPeelFromId(id: string, x: number, y: number, z: number): void {
    this.addPeel(x, y, z, id)
  }

  removePeelById(id: string): void {
    const i = this.peels.findIndex((p) => p.id === id)
    if (i < 0) return
    const p = this.peels[i]!
    this.scene.remove(p.mesh)
    disposeBananaVisual(p.mesh)
    this.peels.splice(i, 1)
  }

  /**
   * Local start throw: flying mesh + will land via tickFlying.
   */
  private async beginLocalThrowAsync(muzzle: Vector3, cam: PerspectiveCamera): Promise<void> {
    this.clearFlying()
    const mesh = await this.cloneFlyingVisual()
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

  beginLocalThrow(muzzle: Vector3, cam: PerspectiveCamera): void {
    void this.beginLocalThrowAsync(muzzle, cam)
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
        else mat?.dispose?.()
      }
    })
  }
}
