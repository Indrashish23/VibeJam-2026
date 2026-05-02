import type { BananaWorld } from '../../powerups/bananaWorld'
import type { Entity } from '../types'

/**
 * `pickup` / `banana_pickup_node` entities → `BananaWorld.applyInitPickups`.
 *
 * We reuse the exact path PvP guests already use (bananaWorld.ts `applyInitPickups`) so
 * everything downstream — hover bob, pickup radius, respawn timers, PvP broadcast shape
 * — keeps working unchanged. No procedural `respawnLocal` fallback; editor placement
 * is authoritative.
 */
export async function applyBananaPickups(
  entities: Entity[],
  bananaWorld: BananaWorld,
): Promise<boolean> {
  const bananas = entities.filter(
    (e) =>
      (e.type === 'pickup' && e.properties.pickupType === 'banana') ||
      e.type === 'banana_pickup_node',
  )

  bananaWorld.clear()
  if (bananas.length === 0) return false

  await bananaWorld.applyInitPickups(
    bananas.map((e) => ({
      id: `editor-${e.id}`,
      x: e.transform.position[0],
      y: e.transform.position[1],
      z: e.transform.position[2],
    })),
  )
  return true
}
