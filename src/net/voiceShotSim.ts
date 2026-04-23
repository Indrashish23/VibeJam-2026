import { gameConfig } from '../gameConfig'

export type PoseLite = { x: number; fy: number; z: number; ry?: number }

/** Matches dedicated server `scripts/lib/voiceShotSim.mjs`. */
export function opponentBodyCenterFromPose(pose: PoseLite | null): { x: number; y: number; z: number } | null {
  if (!pose || typeof pose.fy !== 'number') return null
  const feetOffset = gameConfig.botBodyRadius * 1.15 + 0.72
  const rootY = pose.fy + feetOffset
  return {
    x: pose.x,
    y: rootY + feetOffset * 0.52,
    z: pose.z,
  }
}

export function simulateVoiceShotHit(
  origin: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  oppCenter: { x: number; y: number; z: number },
): { hit: false } | { hit: true; dx: number; dz: number } {
  const maxR = gameConfig.punchMaxRange
  const reach = gameConfig.punchHitRadius + gameConfig.botBodyRadius * 0.88
  const pos = { ...origin }
  const v = { ...vel }
  const spawn = { ...origin }
  const minTravel = maxR * 0.06
  const g = gameConfig.fistGravity
  const drag = gameConfig.fistAirDrag
  const dt = 1 / 120

  for (let step = 0; step < 4000; step++) {
    const traveled = Math.hypot(pos.x - spawn.x, pos.y - spawn.y, pos.z - spawn.z)
    if (traveled > maxR + 0.02) return { hit: false }

    const dx = pos.x - oppCenter.x
    const dy = pos.y - oppCenter.y
    const dz = pos.z - oppCenter.z
    const dist = Math.hypot(dx, dy * 0.75, dz)

    if (dist < reach && traveled > minTravel) {
      const h = Math.hypot(dx, dz)
      const kx = h > 1e-6 ? dx / h : 0
      const kz = h > 1e-6 ? dz / h : 1
      return { hit: true, dx: kx, dz: kz }
    }

    if (drag > 1e-6) {
      const k = Math.exp(-drag * dt)
      v.x *= k
      v.z *= k
    }
    const ascentScale = v.y > 0 ? Math.max(0.05, gameConfig.fistAscentGravityScale) : 1
    v.y -= g * ascentScale * dt
    pos.x += v.x * dt
    pos.y += v.y * dt
    pos.z += v.z * dt
  }

  return { hit: false }
}

export function checkFeetEliminated(pose: PoseLite): boolean {
  const fy = pose.fy
  if (typeof fy === 'number' && fy < gameConfig.blastY) return true
  const hw = gameConfig.groundWidth / 2 + gameConfig.blastMargin
  const hd = gameConfig.groundDepth / 2 + gameConfig.blastMargin
  return Math.abs(pose.x) > hw || Math.abs(pose.z) > hd
}
