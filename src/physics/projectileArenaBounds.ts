import { Vector3 } from 'three'
import { gameConfig } from '../gameConfig'

/**
 * Axis-aligned arena deck / rim bounds for voice projectiles when mesh coverage is incomplete.
 * Matches legacy `PlayerArms.resolveArenaImpact` behavior: mutates `pos` / `vel` on side contact
 * and returns true when the shot should despawn (wall / clamped rim).
 */
export function applyProjectileArenaBounds(
  pos: Vector3,
  vel: Vector3,
  radius: number,
): boolean {
  const rad = radius
  const hw = gameConfig.groundWidth / 2 - rad * 0.5
  const hd = gameConfig.groundDepth / 2 - rad * 0.5
  const minY = rad

  /* Rest on the deck: clamp Y / damp; do not destroy the shot. */
  if (
    Math.abs(pos.x) <= hw &&
    Math.abs(pos.z) <= hd &&
    pos.y <= minY + 0.1
  ) {
    pos.y = minY
    vel.y = 0
    vel.x *= 0.8
    vel.z *= 0.8
  }

  let hit = false
  if (Math.abs(pos.x) > hw) {
    pos.x = Math.sign(pos.x) * hw
    vel.x = 0
    hit = true
  }
  if (Math.abs(pos.z) > hd) {
    pos.z = Math.sign(pos.z) * hd
    vel.z = 0
    hit = true
  }
  if (hit) vel.set(0, 0, 0)
  return hit
}
