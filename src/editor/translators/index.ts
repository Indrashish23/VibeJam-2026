import type { Group, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { MapHandle } from '../../maps'
import type { TerrainPhysics } from '../../physics/terrainPhysics'
import type { BananaWorld } from '../../powerups/bananaWorld'
import type { EditorAPI, SceneFile } from '../types'
import { ArenaTranslator } from './arenaTranslator'
import { applyBananaPickups } from './bananaTranslator'
import { applyPlayerSpawns } from './spawnTranslator'

/**
 * Shape of the game-side handle the editor receives from `src/main.ts`. This is the
 * only crack through which editor translators touch game closure state. Keep it
 * minimal.
 */
export interface GameApi {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  hubRoot: Group
  terrainPhysics: TerrainPhysics
  bananaWorld: BananaWorld
  getMap(): MapHandle
  setMap(m: MapHandle): void
  spawnActors(): void
  warpRapierCapsulesToCurrentActors?(): void
  syncProjectileSyntheticBoundsForMap?(): void
  syncBlastBoundsLine?(): void
}

/**
 * Wires the editor's `onSceneApply` to the three day-1 translators. Runs in the order
 * documented in plan §10.6:
 *
 *   arena → spawns → spawnActors + warp → bananas → post-sync
 *
 * Why this order:
 *   1. Arena may dispose and reload Rapier terrain — must happen before actors respawn
 *      into positions that depend on new colliders.
 *   2. Spawns monkey-patch the current MapHandle's closures — must happen before
 *      spawnActors() reads them.
 *   3. spawnActors() moves the player + bot to their (now-authored) slots.
 *   4. warpRapierCapsulesToCurrentActors() snaps physics capsules to match visual position.
 *   5. Bananas re-populate after actors are in position so hover bob updates don't collide
 *      with actor-spawn teleports.
 */
export function registerTranslators(api: EditorAPI, gameApi: GameApi): void {
  const arenaTranslator = new ArenaTranslator({
    scene: gameApi.scene,
    hubRoot: gameApi.hubRoot,
    terrainPhysics: gameApi.terrainPhysics,
    getMap: gameApi.getMap,
    setMap: gameApi.setMap,
    spawnActors: gameApi.spawnActors,
    warpRapierCapsulesToCurrentActors: gameApi.warpRapierCapsulesToCurrentActors,
    syncProjectileSyntheticBoundsForMap: gameApi.syncProjectileSyntheticBoundsForMap,
    syncBlastBoundsLine: gameApi.syncBlastBoundsLine,
  })

  api.onSceneApply(async (sceneFile: SceneFile) => {
    try {
      const arenaChanged = await arenaTranslator.apply(sceneFile.entities)
      const spawnsChanged = applyPlayerSpawns(sceneFile.entities, gameApi.getMap())

      /* Only respawn actors if the arena was just rebuilt OR spawns were explicitly changed.
       * Otherwise Save would tele­port the player on every edit, which is maddening. */
      if (arenaChanged || spawnsChanged) {
        try {
          gameApi.spawnActors()
          gameApi.warpRapierCapsulesToCurrentActors?.()
        } catch (err) {
          console.error('[editor:translator] spawnActors/warp threw', err)
        }
      }

      await applyBananaPickups(sceneFile.entities, gameApi.bananaWorld)
    } catch (err) {
      console.error('[editor:translator] onSceneApply failed', err)
    }
  })
}
