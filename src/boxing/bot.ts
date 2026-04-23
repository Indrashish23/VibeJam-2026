import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  Scene,
  Vector3,
} from 'three'
import { gameConfig } from '../gameConfig'
import { PROJECTILE_R } from './playerArms'

export type BotMode = 'dummy' | 'smart'

const DOWN = new Vector3(0, -1, 0)
const _ray = new Raycaster()

const KNOCK_ESCAPE_EDGE = 3.1

export class BotFighter {
  readonly root = new Group()
  readonly mode: BotMode
  readonly bodyCenter = new Vector3()

  velocity = new Vector3()
  knockXZ = new Vector3()
  vy = 0
  grounded = true

  dashCd = 0

  private hurtPhase: 'none' | 'air' | 'recover' = 'none'
  private hurtRecoverLeft = 0
  private hurtFinisher = false
  private hurtAirSince = 0

  private smartStrafePickT = 0
  private readonly smartMoveDir = new Vector3(0, 0, 1)
  private smartShotGapMs = 2500

  mesh: Mesh
  readonly projMesh: Mesh

  private readonly feetFromCenter: number

  /** World-space ballistic (matches player projectile integration). */
  projActive = false
  projFlying = false
  readonly projPos = new Vector3()
  readonly projVel = new Vector3()
  private readonly projSpawn = new Vector3()
  projDealt = true

  /** Optional decoded clip on bot projectile (PvP / future); spatial playback for victim. */
  private projHitAudio: AudioBuffer | null = null

  constructor(scene: Scene, mode: BotMode, startPos: Vector3) {
    this.mode = mode
    const mat = new MeshStandardMaterial({
      color: new Color(mode === 'dummy' ? 0x5b8cff : 0xff6b4a),
      roughness: 0.78,
      metalness: 0.12,
    })
    let geo: BoxGeometry | CapsuleGeometry
    let feet: number
    try {
      geo = new CapsuleGeometry(gameConfig.botBodyRadius * 0.85, 1.45, 5, 10)
      const p = geo.parameters
      feet = p.height * 0.5 + p.radius
    } catch {
      geo = new BoxGeometry(
        gameConfig.botBodyRadius * 1.6,
        1.65,
        gameConfig.botBodyRadius * 1.6,
      )
      feet = geo.parameters.height * 0.5
    }
    this.feetFromCenter = feet
    this.mesh = new Mesh(geo, mat)
    this.root.add(this.mesh)

    const pm = new MeshStandardMaterial({
      color: new Color(0xff7a4a),
      roughness: 0.42,
      metalness: 0.2,
    })
    this.projMesh = new Mesh(new BoxGeometry(PROJECTILE_R * 2, PROJECTILE_R * 2, PROJECTILE_R * 2), pm)
    this.projMesh.visible = false
    scene.add(this.projMesh)

    this.root.position.copy(startPos)
    scene.add(this.root)

    this.smartShotGapMs = 2000 + Math.random() * 1000
  }

  dispose(scene: Scene): void {
    scene.remove(this.root)
    scene.remove(this.projMesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
    this.projMesh.geometry.dispose()
    ;(this.projMesh.material as MeshStandardMaterial).dispose()
  }

  resetRoundState(): void {
    this.velocity.set(0, 0, 0)
    this.knockXZ.set(0, 0, 0)
    this.vy = 0
    this.smartStrafePickT = 0
    this.smartShotGapMs = 2100 + Math.random() * 950
    this.smartMoveDir.set(0, 0, 1)
    this.hurtPhase = 'none'
    this.hurtRecoverLeft = 0
    this.hurtFinisher = false
    this.clearProjectile()
  }

  alignFacingToward(worldPos: Vector3): void {
    this.faceToward(worldPos)
  }

  private syncGround(colliders: Object3D[]): void {
    const feetY = this.root.position.y - this.feetFromCenter
    _ray.set(
      new Vector3(this.root.position.x, this.root.position.y + 12, this.root.position.z),
      DOWN,
    )
    _ray.far = 120
    const hits = _ray.intersectObjects(colliders, false)
    let best = -1e9
    for (const h of hits) {
      if (h.point.y > best) best = h.point.y
    }
    const skin = 0.06
    if (best > -1e8 && feetY <= best + skin + 0.15) {
      this.root.position.y = best + this.feetFromCenter + skin
      if (this.vy <= 0.6) this.vy = 0
      this.grounded = true
    }
  }

  private faceToward(target: Vector3): void {
    const dx = target.x - this.root.position.x
    const dz = target.z - this.root.position.z
    if (Math.abs(dx) + Math.abs(dz) < 1e-5) return
    this.root.rotation.y = Math.atan2(dx, dz)
  }

  applyKnockback(dirXZ: Vector3, strength: number): void {
    if (dirXZ.lengthSq() < 1e-8) return
    dirXZ.normalize()
    this.hurtPhase = 'air'
    this.hurtFinisher = false
    this.hurtAirSince = performance.now()
    this.velocity.set(0, 0, 0)
    this.clearProjectile()
    const xzImpulse = strength * 1.12
    this.knockXZ.addScaledVector(dirXZ, xzImpulse)
    this.vy += strength * 0.1
  }

  applyFinisherKnockback(dirXZ: Vector3, xzImpulse: number, yImpulse: number): void {
    if (dirXZ.lengthSq() < 1e-8) dirXZ.set(0, 0, 1)
    dirXZ.normalize()
    this.hurtPhase = 'air'
    this.hurtFinisher = true
    this.hurtAirSince = performance.now()
    this.velocity.set(0, 0, 0)
    this.clearProjectile()
    this.knockXZ.addScaledVector(dirXZ, xzImpulse)
    this.vy += yImpulse
  }

  get inHitstun(): boolean {
    return this.hurtPhase !== 'none'
  }

  private clearProjectile(): void {
    this.projActive = false
    this.projFlying = false
    this.projVel.set(0, 0, 0)
    this.projDealt = true
    this.projHitAudio = null
    this.projMesh.visible = false
  }

  /** Voice clip attached to the current bot shot (if any), for victim-side spatial playback. */
  peekProjectileVoice(): AudioBuffer | null {
    return this.projHitAudio
  }

  private spawnProjectile(
    playerPos: Vector3,
    speedMul: number,
    voiceClip: AudioBuffer | null = null,
  ): void {
    if (this.projActive) return
    this.faceToward(playerPos)
    const muzzleY = this.root.position.y + this.feetFromCenter * 0.52 + 0.55
    this.projPos.set(this.root.position.x, muzzleY, this.root.position.z)
    this.projSpawn.copy(this.projPos)
    _work.subVectors(playerPos, this.projPos)
    _work.y *= 0.85
    if (_work.lengthSq() < 1e-6) _work.set(0, 0, 1)
    _work.normalize()
    const base = gameConfig.punchProjectileSpeed
    this.projVel.copy(_work).multiplyScalar(base * speedMul)
    this.projActive = true
    this.projFlying = true
    this.projDealt = false
    this.projHitAudio = voiceClip
  }

  private integrateProjectile(delta: number): void {
    if (!this.projFlying) return
    const maxR = gameConfig.punchMaxRange
    const g = gameConfig.fistGravity
    const drag = gameConfig.fistAirDrag
    if (drag > 1e-6) {
      const k = Math.exp(-drag * delta)
      this.projVel.x *= k
      this.projVel.z *= k
    }
    const ascentScale =
      this.projVel.y > 0 ? Math.max(0.05, gameConfig.fistAscentGravityScale) : 1
    this.projVel.y -= g * ascentScale * delta
    this.projPos.addScaledVector(this.projVel, delta)

    _work.subVectors(this.projPos, this.projSpawn)
    if (_work.length() > maxR + 1e-3) {
      this.clearProjectile()
      return
    }

    const hw = gameConfig.groundWidth / 2 - PROJECTILE_R * 0.5
    const hd = gameConfig.groundDepth / 2 - PROJECTILE_R * 0.5
    const minY = PROJECTILE_R
    const onDeck =
      Math.abs(this.projPos.x) <= hw &&
      Math.abs(this.projPos.z) <= hd &&
      this.projPos.y <= minY + 0.08
    if (onDeck) {
      this.clearProjectile()
      return
    }
    let hit = false
    if (Math.abs(this.projPos.x) > hw) {
      this.projPos.x = Math.sign(this.projPos.x) * hw
      hit = true
    }
    if (Math.abs(this.projPos.z) > hd) {
      this.projPos.z = Math.sign(this.projPos.z) * hd
      hit = true
    }
    if (hit) this.clearProjectile()
  }

  update(
    delta: number,
    playerPos: Vector3,
    colliders: Object3D[],
    _playerProjectileActive: boolean,
  ): void {
    const groundedAtStart = this.grounded
    this.grounded = false

    this.bodyCenter.copy(this.root.position)
    this.bodyCenter.y += this.feetFromCenter * 0.52

    if (this.hurtPhase === 'recover') {
      this.hurtRecoverLeft -= delta
      this.velocity.set(0, 0, 0)
      this.knockXZ.multiplyScalar(Math.exp(-14 * delta))
      if (this.hurtRecoverLeft <= 0) {
        this.hurtPhase = 'none'
        this.knockXZ.multiplyScalar(0.35)
      }
    } else if (this.hurtFinisher) {
      this.knockXZ.multiplyScalar(Math.exp(-4.2 * delta))
    } else if (this.hurtPhase === 'air') {
      this.knockXZ.multiplyScalar(
        Math.exp(-Math.max(0.4, gameConfig.knockHurtAirDrag) * delta),
      )
    } else {
      this.knockXZ.multiplyScalar(Math.exp(-10 * delta))
    }

    this.vy -= gameConfig.gravity * delta
    this.root.position.y += this.vy * delta

    if (this.dashCd > 0) this.dashCd -= delta * 1000

    const canThink = this.hurtPhase === 'none'

    const toPx = playerPos.x - this.root.position.x
    const toPz = playerPos.z - this.root.position.z
    const dist = Math.hypot(toPx, toPz) || 1

    if (canThink && this.mode === 'smart') {
      this.faceToward(playerPos)
      const rdx = toPx / dist
      const rdz = toPz / dist
      _rad.set(rdx, 0, rdz)
      _tan.set(-rdz, 0, rdx)

      const engage = gameConfig.botPunchRange * 1.22
      if (dist > engage) {
        const wobbleT = performance.now() * 0.0022
        this.smartMoveDir
          .copy(_rad)
          .addScaledVector(_tan, Math.sin(wobbleT) * 0.35 + Math.cos(wobbleT * 0.7) * 0.14)
        if (this.smartMoveDir.lengthSq() < 1e-8) this.smartMoveDir.copy(_rad)
        this.smartMoveDir.normalize()
        this.smartStrafePickT = Math.min(this.smartStrafePickT, 0.2)
      } else {
        this.smartStrafePickT -= delta
        if (this.smartStrafePickT <= 0) {
          this.smartStrafePickT = 0.38 + Math.random() * 0.72
          const strafe = (Math.random() - 0.5) * 2
          const inOut = (Math.random() - 0.5) * 2 * 0.45
          this.smartMoveDir.copy(_tan).multiplyScalar(strafe).addScaledVector(_rad, inOut)
          if (this.smartMoveDir.lengthSq() < 1e-8) this.smartMoveDir.copy(_tan)
          this.smartMoveDir.normalize()
        }
      }

      const spd = gameConfig.moveSpeed * delta * 0.48
      this.velocity.x = (this.smartMoveDir.x * spd) / delta
      this.velocity.z = (this.smartMoveDir.z * spd) / delta

      this.smartShotGapMs -= delta * 1000

      const range = gameConfig.botPunchRange
      const commitDist = range * 1.85
      const wantsShot =
        !this.projActive &&
        this.smartShotGapMs <= 0 &&
        dist <= commitDist &&
        dist >= 0.32

      if (wantsShot) {
        const speedMul =
          gameConfig.voiceShotSpeedMinMul +
          Math.random() * (gameConfig.voiceShotSpeedMaxMul - gameConfig.voiceShotSpeedMinMul) * 0.85
        this.spawnProjectile(playerPos, speedMul)
        this.smartShotGapMs = 1650 + Math.random() * 750
      }
    } else if (canThink) {
      this.faceToward(playerPos)
      this.velocity.set(0, 0, 0)
    } else {
      this.velocity.set(0, 0, 0)
    }

    if (!canThink) {
      this.clearProjectile()
    }

    this.root.position.x += (this.velocity.x + this.knockXZ.x) * delta
    this.root.position.z += (this.velocity.z + this.knockXZ.z) * delta

    const knockFree =
      this.hurtPhase === 'none' && this.knockXZ.length() < KNOCK_ESCAPE_EDGE
    if (knockFree) {
      const hw = gameConfig.groundWidth * 0.5 - gameConfig.botBodyRadius - 0.72
      const hd = gameConfig.groundDepth * 0.5 - gameConfig.botBodyRadius - 0.72
      const pad = 1.85
      let x = this.root.position.x
      let z = this.root.position.z
      const vx = this.velocity.x
      const vz = this.velocity.z
      if (x > hw - pad && vx > 0) this.velocity.x = 0
      if (x < -hw + pad && vx < 0) this.velocity.x = 0
      if (z > hd - pad && vz > 0) this.velocity.z = 0
      if (z < -hd + pad && vz < 0) this.velocity.z = 0
      x = Math.max(-hw, Math.min(hw, x))
      z = Math.max(-hd, Math.min(hd, z))
      this.root.position.x = x
      this.root.position.z = z
    }

    this.syncGround(colliders)

    if (this.hurtPhase === 'air' && !this.hurtFinisher) {
      const elapsed = performance.now() - this.hurtAirSince
      const landed = !groundedAtStart && this.grounded
      const slideEnd =
        this.grounded && this.knockXZ.length() < 2.1 && elapsed > 160
      const groundedTimeout = this.grounded && elapsed > 980
      if (landed || slideEnd || groundedTimeout) {
        this.hurtPhase = 'recover'
        this.hurtRecoverLeft = gameConfig.botKnockRecoverMs / 1000
        this.knockXZ.multiplyScalar(0.55)
      }
    }

    this.integrateProjectile(delta)
    if (this.projActive) {
      this.projMesh.position.copy(this.projPos)
      this.projMesh.visible = true
    }
  }

  canDealHit(playerPos: Vector3): boolean {
    if (this.inHitstun) return false
    if (this.projDealt || !this.projActive || !this.projFlying) return false
    const eyeY = gameConfig.eyeHeight
    const dx = playerPos.x - this.projPos.x
    const dy = playerPos.y - eyeY * 0.42 - this.projPos.y
    const dz = playerPos.z - this.projPos.z
    const travel = _work.subVectors(this.projPos, this.projSpawn).length()
    if (travel < gameConfig.punchMaxRange * 0.06) return false
    return Math.hypot(dx, dy * 0.75, dz) < gameConfig.botHitRadius
  }

  markHitDealt(): void {
    this.projDealt = true
    this.clearProjectile()
  }
}

const _work = new Vector3()
const _rad = new Vector3()
const _tan = new Vector3()
