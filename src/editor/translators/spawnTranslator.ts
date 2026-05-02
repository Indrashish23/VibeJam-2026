import { Vector3 } from 'three'
import type { MapHandle, SpawnSlot } from '../../maps'
import type { Entity } from '../types'

/**
 * `player_spawn` entities → override `MapHandle.getPlayerSpawn / getBotSpawn /
 * getRespawnFootCandidates` closures. Does NOT build a new MapHandle — this
 * monkey-patches the live one so the editor can re-author spawns without triggering
 * a full arena reload.
 *
 * Slot mapping (day-1 rule — see plan §10.4): sort `player_spawn` entities by
 * `properties.spawnIndex` ascending. entities[0] → slot 'a'. entities[1] → slot 'b'.
 * Missing slots fall back to the map's original built-ins.
 */
export function applyPlayerSpawns(entities: Entity[], map: MapHandle): boolean {
  const spawns = entities
    .filter((e) => e.type === 'player_spawn')
    .sort((a, b) => {
      const ai = Number(a.properties.spawnIndex ?? 0)
      const bi = Number(b.properties.spawnIndex ?? 0)
      return ai - bi
    })

  if (spawns.length === 0) {
    /* Nothing to do. Leave map closures untouched (may already be overridden from a previous
     * apply — see note below on restore). For day-1 we accept that previous overrides persist
     * until a new apply replaces them or the arena is reloaded. */
    return false
  }

  const slotA = spawns[0] ?? null
  const slotB = spawns[1] ?? null

  /* Preserve the map's original functions so fallback for a missing slot still works. */
  const origPlayer = map.getPlayerSpawn.bind(map)
  const origBot = map.getBotSpawn.bind(map)
  const origRespawn = map.getRespawnFootCandidates.bind(map)

  map.getPlayerSpawn = (slot: SpawnSlot, eyeHeight: number): Vector3 => {
    const e = slot === 'a' ? slotA : slotB
    if (!e) return origPlayer(slot, eyeHeight)
    const [x, y, z] = e.transform.position
    return new Vector3(x, y + eyeHeight, z)
  }

  map.getBotSpawn = (slot: SpawnSlot, footOffset: number): Vector3 => {
    const e = slot === 'a' ? slotA : slotB
    if (!e) return origBot(slot, footOffset)
    const [x, y, z] = e.transform.position
    return new Vector3(x, y + footOffset, z)
  }

  map.getRespawnFootCandidates = (slot: SpawnSlot): Vector3[] => {
    const e = slot === 'a' ? slotA : slotB
    if (!e) return origRespawn(slot)
    const [x, y, z] = e.transform.position
    /* One candidate is enough: the game's `pickGroundedRespawnFoot` raycasts + blast-rejects
     * against TerrainPhysics, so additional candidates just repeat the same point. */
    return [new Vector3(x, y, z)]
  }

  return true
}
