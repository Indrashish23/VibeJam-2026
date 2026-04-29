import { Vector3 } from 'three'
import type { MapHandle, RandomFootXZBounds } from './maps'
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

/**
 * Sample random XZ in `bounds`, raycast down through static terrain, and accept hits that
 * look walkable (up-facing normal) and are not in the blast zone. Returns foot contact Y.
 */
export function pickRandomGroundedFootInBounds(
  terrain: TerrainPhysics,
  map: MapHandle,
  bounds: RandomFootXZBounds,
  opts?: { maxAttempts?: number; minNormalY?: number },
): Vector3 | null {
  const maxAttempts = opts?.maxAttempts ?? 56
  const minNy = opts?.minNormalY ?? 0.08
  let { minX, maxX, minZ, maxZ } = bounds
  if (maxX < minX) [minX, maxX] = [maxX, minX]
  if (maxZ < minZ) [minZ, maxZ] = [maxZ, minZ]
  const spanX = maxX - minX
  const spanZ = maxZ - minZ
  const rayStartY = 260
  const maxDist = rayStartY + 520

  const tryPoint = (x: number, z: number): Vector3 | null => {
    const hit = terrain.raycastDown(x, rayStartY, z, maxDist)
    if (!hit || hit.normal.y < minNy) return null
    const feet = new Vector3(hit.point.x, hit.point.y, hit.point.z)
    _blastTest.set(feet.x, feet.y + 1.2, feet.z)
    if (map.isBlastZone(_blastTest)) return null
    if (map.isBlastZone(feet)) return null
    return feet
  }

  if (spanX < 1e-6 && spanZ < 1e-6) {
    return tryPoint(minX, minZ)
  }

  for (let i = 0; i < maxAttempts; i++) {
    const x = minX + Math.random() * spanX
    const z = minZ + Math.random() * spanZ
    const feet = tryPoint(x, z)
    if (feet) return feet
  }
  return null
}
