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
 * Straight-line segment (matches client when fistGravity and fistAirDrag are 0),
 * else legacy stepped ballistic for older configs.
 */
export function simulateVoiceShotHit(origin, vel, oppCenter, shotScale = 1) {
  const maxR = C.punchMaxRange
  const size = Math.max(0.15, shotScale)
  const reach = C.punchHitRadius * size + C.botBodyRadius * C.reachMul
  const g = C.fistGravity
  const drag = C.fistAirDrag

  const projMode = Math.max(0, Math.min(2, Math.round(C.voiceProjectileMode ?? 0)))
  if (projMode >= 1 && g < 1e-6 && drag < 1e-6) {
    const speed = Math.hypot(vel.x, vel.y, vel.z) || 1
    const dx0 = vel.x / speed
    const dy0 = vel.y / speed
    const dz0 = vel.z / speed
    const ox = oppCenter.x - origin.x
    const oy = oppCenter.y - origin.y
    const oz = oppCenter.z - origin.z
    const t = ox * dx0 + oy * dy0 + oz * dz0
    const tClamped = Math.max(0, Math.min(maxR, t))
    const px = origin.x + dx0 * tClamped
    const py = origin.y + dy0 * tClamped
    const pz = origin.z + dz0 * tClamped
    const dx = px - oppCenter.x
    const dy = py - oppCenter.y
    const dz = pz - oppCenter.z
    const dist = Math.hypot(dx, dy * 0.75, dz)
    if (dist >= reach) return { hit: false }
    const h = Math.hypot(dx, dz)
    const kx = h > 1e-6 ? dx / h : 0
    const kz = h > 1e-6 ? dz / h : 1
    return { hit: true, dx: kx, dz: kz, hx: px, hy: py, hz: pz }
  }

  if (g < 1e-6 && drag < 1e-6) {
    const speed = Math.hypot(vel.x, vel.y, vel.z) || 1
    const dir = { x: vel.x / speed, y: vel.y / speed, z: vel.z / speed }
    const dt = 1 / 240
    for (let s = 0; s <= maxR + 1e-3; s += speed * dt) {
      const px = origin.x + dir.x * s
      const py = origin.y + dir.y * s
      const pz = origin.z + dir.z * s
      const dx = px - oppCenter.x
      const dy = py - oppCenter.y
      const dz = pz - oppCenter.z
      const dist = Math.hypot(dx, dy * 0.75, dz)
      if (dist < reach) {
        const h = Math.hypot(dx, dz)
        const kx = h > 1e-6 ? dx / h : 0
        const kz = h > 1e-6 ? dz / h : 1
        return { hit: true, dx: kx, dz: kz, hx: px, hy: py, hz: pz }
      }
    }
    return { hit: false }
  }

  const pos = { x: origin.x, y: origin.y, z: origin.z }
  const v = { x: vel.x, y: vel.y, z: vel.z }
  const spawn = { ...pos }
  const dt = 1 / 120

  for (let step = 0; step < 4000; step++) {
    const traveled = Math.hypot(pos.x - spawn.x, pos.y - spawn.y, pos.z - spawn.z)
    if (traveled > maxR + 0.02) return { hit: false }

    const dx = pos.x - oppCenter.x
    const dy = pos.y - oppCenter.y
    const dz = pos.z - oppCenter.z
    const dist = Math.hypot(dx, dy * 0.75, dz)

    if (dist < reach) {
      const h = Math.hypot(dx, dz)
      const kx = h > 1e-6 ? dx / h : 0
      const kz = h > 1e-6 ? dz / h : 1
      return { hit: true, dx: kx, dz: kz, hx: pos.x, hy: pos.y, hz: pos.z }
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

/** @param {{ fighterId: string, center: { x: number, y: number, z: number } }} targets */
export function simulateVoiceShotHitFfa(origin, vel, targets, shotScale = 1) {
  let bestDist = Infinity
  let best = null
  const sorted = [...targets].sort((a, b) => a.fighterId.localeCompare(b.fighterId))
  for (const t of sorted) {
    const sim = simulateVoiceShotHit(origin, vel, t.center, shotScale)
    if (!sim.hit) continue
    const d = Math.hypot(sim.hx - origin.x, sim.hy - origin.y, sim.hz - origin.z)
    if (
      d < bestDist - 1e-6 ||
      (Math.abs(d - bestDist) <= 1e-6 && (!best || t.fighterId.localeCompare(best.victimFighterId) < 0))
    ) {
      bestDist = d
      best = {
        victimFighterId: t.fighterId,
        dx: sim.dx,
        dz: sim.dz,
        hx: sim.hx,
        hy: sim.hy,
        hz: sim.hz,
      }
    }
  }
  return best ? { hit: true, ...best } : { hit: false }
}

/** Feet / ring-out using same cylindrical bound as client `isOutsideArenaBounds`. */
export function checkFeetEliminated(pose) {
  if (!pose || typeof pose.x !== 'number' || typeof pose.z !== 'number') return false
  const fy = typeof pose.fy === 'number' ? pose.fy : 0
  if (fy < C.blastY) return true
  if (fy > C.blastYHigh) return true
  const halfW = C.groundWidth / 2
  const halfD = C.groundDepth / 2
  const r = Math.sqrt(halfW * halfW + halfD * halfD) + C.blastMargin
  return pose.x * pose.x + pose.z * pose.z > r * r
}
