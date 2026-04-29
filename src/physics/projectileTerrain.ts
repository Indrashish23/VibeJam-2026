import { Vector3 } from 'three'
import { gameConfig } from '../gameConfig'
import type { TerrainPhysics } from './terrainPhysics'

/**
 * Move a projectile along segment `prev → next` against Rapier terrain.
 * Upward-facing hits (floor / deck) are skipped so low horizontal shots are not eaten by the ground;
 * vertical surfaces and ceilings stop the shot. Returns true if the projectile should despawn.
 */
export function advanceProjectilePastTerrain(
  terrain: TerrainPhysics,
  prev: Readonly<Vector3>,
  next: Readonly<Vector3>,
  out: Vector3,
): boolean {
  const rdx = next.x - prev.x
  const rdy = next.y - prev.y
  const rdz = next.z - prev.z
  const segLen = Math.hypot(rdx, rdy, rdz)
  if (segLen < 1e-8) {
    out.copy(next)
    return false
  }

  const ux = rdx / segLen
  const uy = rdy / segLen
  const uz = rdz / segLen
  let ox = prev.x
  let oy = prev.y
  let oz = prev.z
  let remain = segLen
  const floorPassY = gameConfig.projectileFloorPassMinNormalY
  const nudge = 0.028

  for (let iter = 0; iter < 36; iter++) {
    if (remain <= 1e-6) {
      out.set(ox, oy, oz)
      return false
    }
    const hit = terrain.raycastTerrainWithNormal(ox, oy, oz, ux, uy, uz, remain + 1e-4)
    if (!hit) {
      out.copy(next)
      return false
    }
    if (hit.ny > floorPassY) {
      const advance = hit.toi + nudge
      if (advance >= remain - 1e-7) {
        out.copy(next)
        return false
      }
      ox += ux * advance
      oy += uy * advance
      oz += uz * advance
      remain -= advance
      continue
    }
    const pull = Math.min(0.07, hit.toi * 0.22)
    const tHit = Math.max(0, hit.toi - pull)
    out.set(ox + ux * tHit, oy + uy * tHit, oz + uz * tHit)
    return true
  }

  out.copy(next)
  return false
}
