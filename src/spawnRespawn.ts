import { Vector3 } from 'three'
import type { MapHandle } from './maps'
import type { TerrainPhysics } from './physics/terrainPhysics'

export function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]!
    arr[i] = arr[j]!
    arr[j] = t
  }
}

const _blastTest = new Vector3()

/**
 * Pick a grounded foot position from shuffled candidates: raycast down from high Y
 * and reject hits that still read as blast (e.g. out of arena on default map).
 */
export function pickGroundedRespawnFoot(
  terrain: TerrainPhysics,
  map: MapHandle,
  candidatesFeetApprox: readonly Vector3[],
): Vector3 | null {
  if (candidatesFeetApprox.length === 0) return null
  const cand = [...candidatesFeetApprox]
  shuffleInPlace(cand)
  for (const approx of cand) {
    const rayStartY = Math.max(220, approx.y + 220)
    const maxDist = rayStartY + 500
    const hit = terrain.raycastDown(approx.x, rayStartY, approx.z, maxDist)
    if (!hit) continue
    const feet = new Vector3(hit.point.x, hit.point.y, hit.point.z)
    _blastTest.set(feet.x, feet.y + 1.2, feet.z)
    if (map.isBlastZone(_blastTest)) continue
    if (map.isBlastZone(feet)) continue
    return feet
  }
  return null
}
