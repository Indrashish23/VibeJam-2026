import { COMBAT as C } from './combatConstants.mjs'

/**
 * @param {{ x: number; fy: number; z: number }} pose - fy = feet world Y (same as client pose packet)
 */
export function opponentBodyCenterFromPose(pose) {
  if (!pose || typeof pose.fy !== 'number') return null
  const rootY = pose.fy + C.feetFromCenterApprox
  return {
    x: pose.x,
    y: rootY + C.feetFromCenterApprox * 0.52,
    z: pose.z,
  }
}

/**
 * Same ballistic integration as client `PlayerArms` / `BotFighter` projectile.
 */
export function simulateVoiceShotHit(origin, vel, oppCenter) {
  const maxR = C.punchMaxRange
  const reach = C.punchHitRadius + C.botBodyRadius * C.reachMul
  const pos = { x: origin.x, y: origin.y, z: origin.z }
  const v = { x: vel.x, y: vel.y, z: vel.z }
  const spawn = { ...pos }
  const minTravel = maxR * 0.06
  const g = C.fistGravity
  const drag = C.fistAirDrag
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
    const ascentScale = v.y > 0 ? Math.max(0.05, C.fistAscentGravityScale) : 1
    v.y -= g * ascentScale * dt
    pos.x += v.x * dt
    pos.y += v.y * dt
    pos.z += v.z * dt
  }

  return { hit: false }
}

/** Feet / ring-out using same rules as client `isBlastZone`-style bounds. */
export function checkFeetEliminated(pose) {
  if (!pose || typeof pose.x !== 'number' || typeof pose.z !== 'number') return false
  const fy = pose.fy
  if (typeof fy === 'number' && fy < C.blastY) return true
  const hw = C.groundWidth / 2 + C.blastMargin
  const hd = C.groundDepth / 2 + C.blastMargin
  return Math.abs(pose.x) > hw || Math.abs(pose.z) > hd
}
