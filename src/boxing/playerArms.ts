import {
  BoxGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
} from 'three'
import { gameConfig } from '../gameConfig'

/** Visual / hit size for the voice projectile (matches former fist radius). */
export const PROJECTILE_R = 0.2

type ProjectileState = {
  active: boolean
  flying: boolean
  pos: Vector3
  vel: Vector3
  /** Muzzle offset in camera space at fire time. */
  shoulderLocal: Vector3
  spawnPos: Vector3
  /** Decoded clip to play on hit (optional). */
  hitAudio: AudioBuffer | null
  /** 0..1 at fire time: damage / knock lerp. */
  shotT: number
  /** Visual + collision scale multiplier for this fired shot. */
  sizeMul: number
}

/**
 * Single ballistic projectile — same integration as legacy fists, no rope / reel / spring line.
 */
export class PlayerArms {
  private readonly camera: PerspectiveCamera
  private readonly scene: Scene
  private readonly mesh: Mesh

  private readonly proj: ProjectileState

  private dealt = true

  /** Last successful fire (world space), for network replication. */
  private readonly lastShotOrigin = new Vector3()
  private readonly lastShotVel = new Vector3()

  private readonly _shoulderW = new Vector3()
  private readonly _tmp = new Vector3()
  private readonly _meshQuat = new Quaternion()

  constructor(camera: PerspectiveCamera, scene: Scene) {
    this.camera = camera
    this.scene = scene

    const mat = new MeshStandardMaterial({
      color: new Color(0xc45c6b),
      roughness: 0.55,
      metalness: 0.15,
    })
    const geo = new BoxGeometry(0.38, 0.38, 0.42)
    this.mesh = new Mesh(geo, mat)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.visible = false
    scene.add(this.mesh)

    this.proj = {
      active: false,
      flying: false,
      pos: new Vector3(),
      vel: new Vector3(),
      shoulderLocal: new Vector3(),
      spawnPos: new Vector3(),
      hitAudio: null,
      shotT: 0,
      sizeMul: 1,
    }
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
  }

  private shoulderWorld(out: Vector3): void {
    out.copy(this.proj.shoulderLocal).applyQuaternion(this.camera.quaternion).add(this.camera.position)
  }

  /**
   * `speedFactor` is the lerped speed mul; `shotT` is 0..1 for damage and knock.
   *
   * If `originWorld` is provided, the projectile spawns there (e.g. the monkey's mouth);
   * if `dirWorld` is provided, that vector is the launch direction. Both fall back to the
   * legacy camera-local muzzle + camera forward.
   */
  tryFire(
    speedFactor: number,
    hitAudio: AudioBuffer | null,
    shotT: number,
    sizeMul = 1,
    originWorld?: Vector3,
    dirWorld?: Vector3,
  ): boolean {
    if (this.proj.active) return false

    if (originWorld) {
      this._tmp.copy(originWorld)
    } else {
      this.proj.shoulderLocal.set(0.32, -0.22, -0.48)
      this.shoulderWorld(this._tmp)
    }

    if (dirWorld && dirWorld.lengthSq() > 1e-8) {
      this.proj.vel.copy(dirWorld)
    } else {
      this.camera.getWorldDirection(this.proj.vel)
    }
    const base = gameConfig.punchProjectileSpeed
    const mul = Math.max(
      gameConfig.voiceShotSpeedMinMul,
      Math.min(gameConfig.voiceShotSpeedMaxMul, speedFactor),
    )
    this.proj.vel.normalize().multiplyScalar(base * mul)

    this.proj.pos.copy(this._tmp)
    this.proj.spawnPos.copy(this.proj.pos)
    this.proj.hitAudio = hitAudio
    this.proj.shotT = Math.max(0, Math.min(1, shotT))
    this.proj.sizeMul = Math.max(0.15, Math.min(6, sizeMul))
    this.proj.active = true
    this.proj.flying = true
    this.dealt = false

    this.lastShotOrigin.copy(this._tmp)
    this.lastShotVel.copy(this.proj.vel)

    return true
  }

  copyLastShotWorld(origin: Vector3, vel: Vector3): void {
    origin.copy(this.lastShotOrigin)
    vel.copy(this.lastShotVel)
  }

  /** Audio attached to last fired shot (cleared after consumption). */
  takeHitAudio(): AudioBuffer | null {
    const b = this.proj.hitAudio
    this.proj.hitAudio = null
    return b
  }

  peekHitAudio(): AudioBuffer | null {
    return this.proj.hitAudio
  }

  update(delta: number): void {
    if (!this.proj.active) {
      this.mesh.visible = false
      return
    }

    this.integrate(delta)

    this._meshQuat.copy(this.camera.quaternion)
    this.mesh.setRotationFromQuaternion(this._meshQuat)
    this.mesh.position.copy(this.proj.pos)
    this.mesh.scale.setScalar(this.proj.sizeMul)
    this.mesh.visible = true
  }

  private integrate(delta: number): void {
    if (!this.proj.flying) return

    const maxR = gameConfig.punchMaxRange
    const g = gameConfig.fistGravity
    const drag = gameConfig.fistAirDrag

    if (g < 1e-6 && drag < 1e-6) {
      this.proj.pos.addScaledVector(this.proj.vel, delta)
      this._tmp.subVectors(this.proj.pos, this.proj.spawnPos)
      if (this._tmp.length() > maxR + 1e-3) {
        this.resetProjectile()
        return
      }
      const rad = PROJECTILE_R * this.proj.sizeMul
      const hwIn = gameConfig.groundWidth / 2 - rad * 0.5
      const hdIn = gameConfig.groundDepth / 2 - rad * 0.5
      const minY = rad
      if (
        Math.abs(this.proj.pos.x) <= hwIn &&
        Math.abs(this.proj.pos.z) <= hdIn &&
        this.proj.pos.y <= minY + 0.08
      ) {
        this.resetProjectile()
        return
      }
      const hw = gameConfig.groundWidth / 2 + rad
      const hd = gameConfig.groundDepth / 2 + rad
      if (Math.abs(this.proj.pos.x) > hw || Math.abs(this.proj.pos.z) > hd) {
        this.resetProjectile()
      }
      return
    }

    if (drag > 1e-6) {
      const k = Math.exp(-drag * delta)
      this.proj.vel.x *= k
      this.proj.vel.z *= k
    }
    const ascentScale =
      this.proj.vel.y > 0 ? Math.max(0.05, gameConfig.fistAscentGravityScale) : 1
    this.proj.vel.y -= g * ascentScale * delta
    this.proj.pos.addScaledVector(this.proj.vel, delta)

    this._tmp.subVectors(this.proj.pos, this.proj.spawnPos)
    if (this._tmp.length() > maxR + 1e-3) {
      this.resetProjectile()
      return
    }

    if (this.resolveArenaImpact()) {
      this.resetProjectile()
    }
  }

  private resolveArenaImpact(): boolean {
    const rad = PROJECTILE_R * this.proj.sizeMul
    const hw = gameConfig.groundWidth / 2 - rad * 0.5
    const hd = gameConfig.groundDepth / 2 - rad * 0.5
    const minY = rad

    const onDeck =
      Math.abs(this.proj.pos.x) <= hw &&
      Math.abs(this.proj.pos.z) <= hd &&
      this.proj.pos.y <= minY + 0.08

    if (onDeck) {
      this.proj.pos.y = minY
      this.proj.vel.set(0, 0, 0)
      return true
    }

    let hit = false
    if (Math.abs(this.proj.pos.x) > hw) {
      this.proj.pos.x = Math.sign(this.proj.pos.x) * hw
      this.proj.vel.x = 0
      hit = true
    }
    if (Math.abs(this.proj.pos.z) > hd) {
      this.proj.pos.z = Math.sign(this.proj.pos.z) * hd
      this.proj.vel.z = 0
      hit = true
    }
    if (hit) this.proj.vel.set(0, 0, 0)
    return hit
  }

  private resetProjectile(): void {
    this.proj.active = false
    this.proj.flying = false
    this.proj.vel.set(0, 0, 0)
    this.proj.hitAudio = null
    this.proj.shotT = 0
    this.proj.sizeMul = 1
    this.mesh.scale.setScalar(1)
    this.mesh.visible = false
    this.dealt = true
  }

  getProjectileWorld(out: Vector3): void {
    if (!this.proj.active) {
      out.copy(this.camera.position)
      return
    }
    out.copy(this.proj.pos)
  }

  canDealHit(): boolean {
    if (this.dealt || !this.proj.active || !this.proj.flying) return false
    this.shoulderWorld(this._shoulderW)
    const travel = this._tmp.subVectors(this.proj.pos, this._shoulderW).length()
    return travel > gameConfig.punchMaxRange * 0.08
  }

  markDealt(): void {
    this.dealt = true
    this.resetProjectile()
  }

  /** Live projectile (for bot / UI logic). */
  isProjectileActive(): boolean {
    return this.proj.active && this.proj.flying
  }

  /** Voice 0..1 for current shot; valid while projectile active. */
  peekShotT(): number {
    if (!this.proj.active) return 0
    return this.proj.shotT
  }

  projectileRadius(): number {
    return gameConfig.punchHitRadius * this.proj.sizeMul
  }

  resetAll(): void {
    this.resetProjectile()
  }
}
