import { PerspectiveCamera, Scene, Vector3 } from 'three'
import { gameConfig } from '../gameConfig'
import { applyProjectileArenaBounds } from '../physics/projectileArenaBounds'
import { advanceProjectilePastTerrain } from '../physics/projectileTerrain'
import type { TerrainPhysics } from '../physics/terrainPhysics'
import { VoiceProjectileVisual } from './voiceProjectileVisual'

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
  prevPos: Vector3
  /** Decoded clip to play on hit (optional). */
  hitAudio: AudioBuffer | null
  /** 0..1 at fire time: damage / knock lerp. */
  shotT: number
  /** Visual + collision scale multiplier for this fired shot. */
  sizeMul: number
  /**
   * True when this shot was fired from the experimental pistol mode. Hit-resolve sites read this
   * via `peekIsPistolShot()` to scale knock/percent independently of the legacy voice formula.
   */
  pistolMode: boolean
}

/**
 * Optional extra parameters for `tryFire` / `tryHeadscanFire`. Kept on a single object so adding new
 * pistol-mode metadata or future shot variants stays backward-compatible (legacy callers omit it).
 */
export type FireOptions = {
  /** Tag the spawned projectile as a pistol shot so the hit-resolve site can apply pistol scaling. */
  pistolMode?: boolean
  /**
   * When true, `speedFactor` is used directly without clamping into `[voiceShotSpeedMin, …Max]`.
   * Pistol mode uses this so its dedicated `pistolShotSpeedMul` can sit below the voice min.
   */
  bypassSpeedClamp?: boolean
}

/**
 * Single ballistic projectile — same integration as legacy fists, no rope / reel / spring line.
 */
export class PlayerArms {
  private readonly camera: PerspectiveCamera
  private readonly scene: Scene
  private readonly projVfx: VoiceProjectileVisual

  private readonly proj: ProjectileState

  private dealt = true

  /** When true, this shot is an instant ray (no flying mesh); see `voiceProjectileMode`. */
  private hitscanMode = false
  private readonly hitscanOrigin = new Vector3()
  private readonly hitscanDir = new Vector3()

  /** Last successful fire (world space), for network replication. */
  private readonly lastShotOrigin = new Vector3()
  private readonly lastShotVel = new Vector3()

  private readonly _tmp = new Vector3()
  /** Scratch for `getProjectileContactPoint` (avoid per-hit `target.clone()` alloc). */
  private readonly _cpScratch = new Vector3()
  private readonly _terrainResolve = new Vector3()
  private terrainPhysics: TerrainPhysics | null = null
  /**
   * When false (imported arena GLB), skip the axis-aligned box from `gameConfig.groundWidth/Depth` —
   * it does not match the mesh and kills shots near real spawns. Trimesh handles walls instead.
   */
  private useSyntheticProjectileBounds = true

  constructor(camera: PerspectiveCamera, scene: Scene) {
    this.camera = camera
    this.scene = scene

    this.projVfx = new VoiceProjectileVisual(scene)

    this.proj = {
      active: false,
      flying: false,
      pos: new Vector3(),
      vel: new Vector3(),
      shoulderLocal: new Vector3(),
      spawnPos: new Vector3(),
      prevPos: new Vector3(),
      hitAudio: null,
      shotT: 0,
      sizeMul: 1,
      pistolMode: false,
    }
  }

  dispose(): void {
    this.projVfx.dispose(this.scene)
  }

  /** When set, projectiles use Rapier terrain (walls block; upward floor normals pass through). */
  setTerrainPhysics(terrain: TerrainPhysics | null): void {
    this.terrainPhysics = terrain
  }

  setUseSyntheticProjectileBounds(use: boolean): void {
    this.useSyntheticProjectileBounds = use
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
    options?: FireOptions,
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
    const mul = options?.bypassSpeedClamp
      ? Math.max(0.05, speedFactor)
      : Math.max(
          gameConfig.voiceShotSpeedMinMul,
          Math.min(gameConfig.voiceShotSpeedMaxMul, speedFactor),
        )
    this.proj.vel.normalize().multiplyScalar(base * mul)

    this.proj.pos.copy(this._tmp)
    this.proj.spawnPos.copy(this.proj.pos)
    this.proj.prevPos.copy(this.proj.pos)
    this.proj.hitAudio = hitAudio
    this.proj.shotT = Math.max(0, Math.min(1, shotT))
    this.proj.sizeMul = Math.max(0.15, Math.min(6, sizeMul))
    this.proj.pistolMode = options?.pistolMode === true
    this.proj.active = true
    this.proj.flying = true
    this.dealt = false

    this.lastShotOrigin.copy(this._tmp)
    this.lastShotVel.copy(this.proj.vel)

    return true
  }

  /**
   * Instant hitscan along `dirWorld` from `originWorld` (mouth or eye).
   * Reuses the same charge, audio, and network origin/velocity as ballistic shots.
   */
  tryHeadscanFire(
    speedFactor: number,
    hitAudio: AudioBuffer | null,
    shotT: number,
    sizeMul: number,
    originWorld: Vector3,
    dirWorld: Vector3,
    options?: FireOptions,
  ): boolean {
    if (this.proj.active) return false
    if (!dirWorld || dirWorld.lengthSq() < 1e-8) {
      this.camera.getWorldDirection(this.hitscanDir)
    } else {
      this.hitscanDir.copy(dirWorld).normalize()
    }
    this.hitscanOrigin.copy(originWorld)

    const base = gameConfig.punchProjectileSpeed
    const mul = options?.bypassSpeedClamp
      ? Math.max(0.05, speedFactor)
      : Math.max(
          gameConfig.voiceShotSpeedMinMul,
          Math.min(gameConfig.voiceShotSpeedMaxMul, speedFactor),
        )
    const speed = base * mul

    this.proj.pos.copy(this.hitscanOrigin)
    this.proj.spawnPos.copy(this.hitscanOrigin)
    this.proj.prevPos.copy(this.hitscanOrigin)
    this.proj.vel.copy(this.hitscanDir).multiplyScalar(speed)
    this.proj.hitAudio = hitAudio
    this.proj.shotT = Math.max(0, Math.min(1, shotT))
    this.proj.sizeMul = Math.max(0.15, Math.min(6, sizeMul))
    this.proj.pistolMode = options?.pistolMode === true
    this.proj.active = true
    this.proj.flying = false
    this.hitscanMode = true
    this.dealt = false

    this.lastShotOrigin.copy(this.hitscanOrigin)
    this.lastShotVel.copy(this.hitscanDir).multiplyScalar(speed)
    return true
  }

  /** True while a head-scan shot is waiting for combat resolution this frame. */
  isHeadscan(): boolean {
    return this.hitscanMode && this.proj.active
  }

  /**
   * Closest point on the aim segment [origin, origin+dir*maxRange] for knock FX / hit position.
   */
  getHeadscanContactPoint(target: Vector3, out: Vector3): void {
    const maxR = gameConfig.punchMaxRange
    this._tmp.subVectors(target, this.hitscanOrigin)
    const t = this._tmp.dot(this.hitscanDir)
    const tClamped = Math.max(0, Math.min(maxR, t))
    out.copy(this.hitscanOrigin).addScaledVector(this.hitscanDir, tClamped)
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

  /** Headscan (modes 1–2): ray origin and unit direction for LOS checks. */
  peekHeadscanRay(outOrigin: Vector3, outDirUnit: Vector3): boolean {
    if (!this.hitscanMode || !this.proj.active) return false
    outOrigin.copy(this.hitscanOrigin)
    outDirUnit.copy(this.hitscanDir)
    if (outDirUnit.lengthSq() > 1e-12) outDirUnit.normalize()
    return true
  }

  /** Signed distance along the headscan ray to the perpendicular approach of `target` (clamped to max range). */
  headscanDistanceParamAlongRay(target: Vector3): number {
    this._tmp.subVectors(target, this.hitscanOrigin)
    const len = this.hitscanDir.length()
    if (len < 1e-8) return 0
    const ux = this.hitscanDir.x / len
    const uy = this.hitscanDir.y / len
    const uz = this.hitscanDir.z / len
    const t = this._tmp.x * ux + this._tmp.y * uy + this._tmp.z * uz
    return Math.max(0, Math.min(gameConfig.punchMaxRange, t))
  }

  /**
   * Late-bind audio to the currently-active projectile. Lets `releaseVoiceShot`
   * fire the visual immediately and then attach the decoded clip when ready
   * (avoids a 10–50 ms input → fire latency stall waiting on `decodeAudioData`).
   * No-op when no projectile is active or when the shot already hit.
   */
  attachLastShotHitAudio(buf: AudioBuffer | null): void {
    if (!this.proj.active) return
    if (this.dealt) return
    this.proj.hitAudio = buf
  }

  update(delta: number): void {
    if (!this.proj.active) {
      this.projVfx.update({
        active: false,
        position: this.proj.pos,
        sizeMul: 1,
        camera: this.camera,
        delta,
      })
      return
    }

    if (this.hitscanMode) {
      this.projVfx.update({
        active: false,
        position: this.proj.pos,
        sizeMul: this.proj.sizeMul,
        camera: this.camera,
        delta,
      })
      return
    }

    this.integrate(delta)

    this.projVfx.update({
      active: this.proj.flying,
      position: this.proj.pos,
      sizeMul: this.proj.sizeMul,
      camera: this.camera,
      delta,
    })
  }

  private integrate(delta: number): void {
    if (!this.proj.flying) return
    this.proj.prevPos.copy(this.proj.pos)

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
      if (this.terrainPhysics) {
        if (
          advanceProjectilePastTerrain(
            this.terrainPhysics,
            this.proj.prevPos,
            this.proj.pos,
            this._terrainResolve,
          )
        ) {
          this.proj.pos.copy(this._terrainResolve)
          this.resetProjectile()
        } else {
          this.proj.pos.copy(this._terrainResolve)
          if (
            this.useSyntheticProjectileBounds &&
            applyProjectileArenaBounds(
              this.proj.pos,
              this.proj.vel,
              PROJECTILE_R * this.proj.sizeMul,
            )
          ) {
            this.resetProjectile()
          }
        }
        return
      }
      if (
        this.useSyntheticProjectileBounds &&
        applyProjectileArenaBounds(
          this.proj.pos,
          this.proj.vel,
          PROJECTILE_R * this.proj.sizeMul,
        )
      ) {
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

    if (this.terrainPhysics) {
      if (
        advanceProjectilePastTerrain(
          this.terrainPhysics,
          this.proj.prevPos,
          this.proj.pos,
          this._terrainResolve,
        )
      ) {
        this.proj.pos.copy(this._terrainResolve)
        this.resetProjectile()
      } else {
        this.proj.pos.copy(this._terrainResolve)
        if (
          this.useSyntheticProjectileBounds &&
          applyProjectileArenaBounds(
            this.proj.pos,
            this.proj.vel,
            PROJECTILE_R * this.proj.sizeMul,
          )
        ) {
          this.resetProjectile()
        }
      }
      return
    }

    if (
      this.useSyntheticProjectileBounds &&
      applyProjectileArenaBounds(
        this.proj.pos,
        this.proj.vel,
        PROJECTILE_R * this.proj.sizeMul,
      )
    ) {
      this.resetProjectile()
    }
  }

  private resetProjectile(): void {
    this.proj.active = false
    this.proj.flying = false
    this.proj.vel.set(0, 0, 0)
    this.proj.hitAudio = null
    this.proj.shotT = 0
    this.proj.sizeMul = 1
    this.proj.pistolMode = false
    this.hitscanMode = false
    this.dealt = true
  }

  getProjectileWorld(out: Vector3): void {
    if (!this.proj.active) {
      out.copy(this.camera.position)
      return
    }
    out.copy(this.proj.pos)
  }

  /**
   * Continuous hit point against a target sphere/ellipsoid: closest point on the
   * projectile segment this frame. This keeps close-range shots from tunneling
   * through the opponent between frame updates.
   */
  getProjectileContactPoint(target: Vector3, out: Vector3): void {
    if (!this.proj.active) {
      out.copy(this.camera.position)
      return
    }
    if (this.hitscanMode) {
      this.getHeadscanContactPoint(target, out)
      return
    }
    this._tmp.subVectors(this.proj.pos, this.proj.prevPos)
    const lenSq = this._tmp.lengthSq()
    if (lenSq < 1e-8) {
      out.copy(this.proj.pos)
      return
    }
    const t = Math.max(
      0,
      Math.min(1, this._cpScratch.copy(target).sub(this.proj.prevPos).dot(this._tmp) / lenSq),
    )
    out.copy(this.proj.prevPos).addScaledVector(this._tmp, t)
  }

  canDealHit(): boolean {
    if (this.dealt || !this.proj.active) return false
    if (this.hitscanMode) return true
    if (!this.proj.flying) return false
    return true
  }

  markDealt(): void {
    this.dealt = true
    this.resetProjectile()
  }

  /** Live projectile (for bot / UI logic). Includes head-scan until it resolves. */
  isProjectileActive(): boolean {
    return this.proj.active && (this.proj.flying || this.hitscanMode)
  }

  /** Voice 0..1 for current shot; valid while projectile active. */
  peekShotT(): number {
    if (!this.proj.active) return 0
    return this.proj.shotT
  }

  /** True if the live projectile / headscan was fired in pistol mode (used to apply pistol scaling). */
  peekIsPistolShot(): boolean {
    return this.proj.active && this.proj.pistolMode
  }

  projectileRadius(): number {
    return gameConfig.punchHitRadius * this.proj.sizeMul
  }

  resetAll(): void {
    this.resetProjectile()
  }
}
