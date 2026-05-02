import type { Group, Scene } from 'three'
import { loadArenaFromGlbUrl, type MapHandle } from '../../maps'
import type { TerrainPhysics } from '../../physics/terrainPhysics'
import type { Entity } from '../types'

export interface ArenaTranslatorGameApi {
  scene: Scene
  hubRoot: Group
  terrainPhysics: TerrainPhysics
  getMap(): MapHandle
  setMap(m: MapHandle): void
  spawnActors(): void
  warpRapierCapsulesToCurrentActors?(): void
  syncProjectileSyntheticBoundsForMap?(): void
  syncBlastBoundsLine?(): void
}

/**
 * `arena_stage` / `static_mesh` → real MapHandle swap. Mirrors the existing `swapMap`
 * pattern in src/main.ts (~line 4230) but sources the URL + scale from the editor-authored
 * entity instead of the hardcoded `'arena' | 'default'` ids.
 *
 * Diff optimization: caches the last-applied `{url, posHash, scaleHash}` so that
 * re-Saving the same scene (user tweaked an unrelated property) doesn't needlessly
 * dispose Rapier terrain and teleport actors.
 *
 * If no `arena_stage` entity is present, and no `static_mesh` has `metadata.__isArena`,
 * we leave the current map untouched. This lets the editor be used for prop placement
 * without demanding the user also author an arena every time.
 */
export class ArenaTranslator {
  private lastFingerprint: string | null = null
  private busy = false
  private gameApi: ArenaTranslatorGameApi

  constructor(gameApi: ArenaTranslatorGameApi) {
    this.gameApi = gameApi
  }

  /** Returns true if the arena actually changed — callers use this to decide if they need to respawn actors. */
  async apply(entities: Entity[]): Promise<boolean> {
    if (this.busy) return false

    const pick = selectArenaEntity(entities)
    if (!pick) {
      /* No editor-authored arena. Keep current map. */
      return false
    }

    const url = String(pick.entity.properties.meshUrl ?? pick.entity.properties.modelUrl ?? '')
    if (!url) return false

    const fingerprint = fingerprintArena(pick.entity, url)
    if (fingerprint === this.lastFingerprint) return false

    this.busy = true
    try {
      const old = this.gameApi.getMap()
      const scale = pick.entity.transform.scale[0] || 1
      const next = await loadArenaFromGlbUrl(this.gameApi.scene, this.gameApi.hubRoot, url, scale, {
        applyTriplanar: url.includes('arena_export.glb'),
      })

      /* Position + rotation apply to the container group inside hubRoot. The last-added
       * child of hubRoot is always the new arena container (see maps.ts `hubRoot.add(container)`). */
      const container = this.gameApi.hubRoot.children[this.gameApi.hubRoot.children.length - 1]
      if (container) {
        const [px, py, pz] = pick.entity.transform.position
        container.position.set(px, py, pz)
        const [rx, ry, rz] = pick.entity.transform.rotation
        container.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz))
      }

      /* Order matters (mirrors swapMap in src/main.ts):
       *   1. Replace map reference first so spawn translators can monkey-patch it.
       *   2. Swap Rapier terrain to the new collision meshes.
       *   3. Dispose old visuals + GPU resources AFTER terrain is swapped so there's no
       *      one-frame gap where Rapier references freed geometry. */
      this.gameApi.setMap(next)
      this.gameApi.terrainPhysics.setTerrainMeshes(next.collisionMeshes, next.rapierCuboids)
      old.dispose()

      this.gameApi.syncProjectileSyntheticBoundsForMap?.()
      this.gameApi.syncBlastBoundsLine?.()

      this.lastFingerprint = fingerprint
      return true
    } finally {
      this.busy = false
    }
  }
}

function selectArenaEntity(entities: Entity[]): { entity: Entity } | null {
  /* Priority 1: a dedicated arena_stage entity. */
  const stage = entities.find((e) => e.type === 'arena_stage')
  if (stage) return { entity: stage }

  /* Priority 2: a static_mesh with __isArena metadata flag. */
  const tagged = entities.find(
    (e) => e.type === 'static_mesh' && e.metadata && (e.metadata as Record<string, unknown>).__isArena === true,
  )
  if (tagged) return { entity: tagged }

  return null
}

function fingerprintArena(entity: Entity, url: string): string {
  const [px, py, pz] = entity.transform.position
  const [rx, ry, rz] = entity.transform.rotation
  const [sx, sy, sz] = entity.transform.scale
  return [
    url,
    px.toFixed(4),
    py.toFixed(4),
    pz.toFixed(4),
    rx.toFixed(4),
    ry.toFixed(4),
    rz.toFixed(4),
    sx.toFixed(4),
    sy.toFixed(4),
    sz.toFixed(4),
  ].join('|')
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180
}
