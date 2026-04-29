import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three'
import { gameConfig } from '../gameConfig'

/** Approximate peak height (m) from upward impulse vy with ascent gravity `jumpGravity`. */
export function knockArcHeightFromVyDelta(vyDelta: number): number {
  const g = Math.max(1e-3, gameConfig.jumpGravity)
  return (vyDelta * vyDelta) / (2 * g)
}

export function knockQualifiesForTrail(hzKnockLen: number, vyDelta: number): boolean {
  if (hzKnockLen < gameConfig.knockTrailMinHorizontalSpeed) return false
  return knockArcHeightFromVyDelta(vyDelta) >= gameConfig.knockTrailMinArcHeight
}

type TrailSeg = { mesh: Mesh; t0: number }

/**
 * Glowing spheres along the victim’s feet path during a strong horizontal + arcing knockback.
 */
export class KnockbackTrailFx {
  readonly group = new Group()
  private readonly scene: Scene
  private readonly segments: TrailSeg[] = []
  private readonly pool: Mesh[] = []
  private readonly geo = new SphereGeometry(0.11, 7, 5)
  private readonly matPlayer = new MeshBasicMaterial({
    color: 0x7ee0ff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  private readonly matBot = new MeshBasicMaterial({
    color: 0xffb070,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    blending: AdditiveBlending,
  })

  private playerActive = false
  private botActive = false
  private playerAcc = 0
  private botAcc = 0
  private getPlayerFeet: (() => Vector3) | null = null
  private getBotFeet: (() => Vector3) | null = null

  private readonly emitInterval = 0.028
  private readonly segmentLifeSec = 0.48
  private readonly maxSegments = 42

  constructor(scene: Scene) {
    this.scene = scene
    this.group.name = 'knockbackTrailFx'
    scene.add(this.group)
  }

  startPlayerTrail(getFeet: () => Vector3): void {
    this.playerActive = true
    this.playerAcc = 0
    this.getPlayerFeet = getFeet
    this.emitAt(getFeet(), this.matPlayer)
  }

  startBotTrail(getFeet: () => Vector3): void {
    this.botActive = true
    this.botAcc = 0
    this.getBotFeet = getFeet
    this.emitAt(getFeet(), this.matBot)
  }

  private allocMesh(mat: MeshBasicMaterial): Mesh {
    const m = this.pool.pop()
    if (m) {
      m.material = mat
      m.visible = true
      return m
    }
    const mesh = new Mesh(this.geo, mat)
    mesh.name = 'knockTrailSeg'
    mesh.renderOrder = 5
    return mesh
  }

  private freeMesh(mesh: Mesh): void {
    mesh.visible = false
    this.group.remove(mesh)
    this.pool.push(mesh)
  }

  private emitAt(pos: Vector3, mat: MeshBasicMaterial): void {
    const mesh = this.allocMesh(mat)
    mesh.position.copy(pos)
    mesh.position.y += 0.04
    this.group.add(mesh)
    this.segments.push({ mesh, t0: performance.now() * 0.001 })
    while (this.segments.length > this.maxSegments) {
      const old = this.segments.shift()!
      this.freeMesh(old.mesh)
    }
  }

  /**
   * Call once per frame after movement + combat resolve.
   * @param playerKnockAir `playerHurt === 'air'`
   * @param botKnockAir bot `hurtPhase === 'air'` during knock flight
   */
  tick(delta: number, playerKnockAir: boolean, botKnockAir: boolean): void {
    const nowSec = performance.now() * 0.001

    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i]!
      const age = nowSec - s.t0
      if (age >= this.segmentLifeSec) {
        this.segments.splice(i, 1)
        this.freeMesh(s.mesh)
        continue
      }
      const t = age / this.segmentLifeSec
      const m = s.mesh.material as MeshBasicMaterial
      m.opacity = (1 - t * t) * (m === this.matPlayer ? 0.62 : 0.58)
    }

    if (this.playerActive) {
      if (!playerKnockAir || !this.getPlayerFeet) {
        this.playerActive = false
        this.getPlayerFeet = null
      } else {
        this.playerAcc += delta
        while (this.playerAcc >= this.emitInterval) {
          this.playerAcc -= this.emitInterval
          this.emitAt(this.getPlayerFeet(), this.matPlayer)
        }
      }
    }

    if (this.botActive) {
      if (!botKnockAir || !this.getBotFeet) {
        this.botActive = false
        this.getBotFeet = null
      } else {
        this.botAcc += delta
        while (this.botAcc >= this.emitInterval) {
          this.botAcc -= this.emitInterval
          this.emitAt(this.getBotFeet(), this.matBot)
        }
      }
    }
  }

  clear(): void {
    this.playerActive = false
    this.botActive = false
    this.getPlayerFeet = null
    this.getBotFeet = null
    for (const s of this.segments) this.freeMesh(s.mesh)
    this.segments.length = 0
  }

  dispose(): void {
    this.clear()
    this.scene.remove(this.group)
    this.geo.dispose()
    this.matPlayer.dispose()
    this.matBot.dispose()
    for (const m of this.pool) {
      m.geometry.dispose()
    }
  }
}
