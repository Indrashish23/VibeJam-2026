import { gameConfig } from '../../gameConfig'
import type { EntityTypeRegistry } from '../registries/EntityTypeRegistry'
import type { EntityTypeDefinition } from '../types'
import { getAssetUrl } from './assets'

/**
 * Vibe-Jam-specific entity types — pre-wired to real GLB URLs + gameplay defaults from
 * `gameConfig`. Schemas shadow the generic types from `entityTypes.ts` so the Inspector
 * still renders field-by-field without bespoke UI code.
 *
 * Translator coverage (as of day-1 hot-apply):
 *   - `arena_stage`         → arenaTranslator
 *   - `banana_pickup_node`  → bananaTranslator
 *   - `monkey_player`       → deferred (visual placeholder in viewport only)
 *   - `megaphone_prop`      → deferred
 *   - `lobby_portal`        → deferred
 */

const DEFS: EntityTypeDefinition[] = [
  {
    id: 'arena_stage',
    label: 'Arena Stage',
    icon: '🏟️',
    defaultProperties: {
      meshUrl: getAssetUrl('model.arena_export'),
      colliderNamePrefix: 'col_',
      castShadow: false,
      receiveShadow: true,
    },
    schema: [
      { key: 'meshUrl', label: 'Mesh', type: 'asset', assetCategory: 'model' },
      { key: 'colliderNamePrefix', label: 'Collider prefix', type: 'string' },
      { key: 'castShadow', label: 'Cast shadow', type: 'boolean' },
      { key: 'receiveShadow', label: 'Receive shadow', type: 'boolean' },
    ],
    /** Apply the canonical arena GLB scale used by `src/maps.ts` (ARENA_EXPORT_SCALE). */
    onCreate(e) {
      e.transform.scale = [1.7, 1.7, 1.7]
      e.metadata.__isArena = true
    },
  },
  {
    id: 'monkey_player',
    label: 'Monkey Player',
    icon: '🐵',
    defaultProperties: {
      modelUrl: getAssetUrl('model.lobby_monkey'),
      isPlayer: true,
      speed: gameConfig.moveSpeed,
      eyeHeight: gameConfig.eyeHeight,
    },
    schema: [
      { key: 'modelUrl', label: 'Model', type: 'asset', assetCategory: 'model' },
      { key: 'isPlayer', label: 'Is player', type: 'boolean' },
      { key: 'speed', label: 'Speed', type: 'number', min: 0 },
      { key: 'eyeHeight', label: 'Eye height', type: 'number', min: 0, step: 0.05 },
    ],
  },
  {
    id: 'banana_pickup_node',
    label: 'Banana Pickup',
    icon: '🍌',
    defaultProperties: {
      pickupType: 'banana',
      respawnTime: 8,
      modelUrl: getAssetUrl('model.banana_pickup'),
      hoverAmp: gameConfig.bananaHoverAmp,
    },
    schema: [
      { key: 'pickupType', label: 'Kind', type: 'select', options: ['banana', 'ammo', 'health'] },
      { key: 'respawnTime', label: 'Respawn (s)', type: 'number', min: 0 },
      { key: 'modelUrl', label: 'Model', type: 'asset', assetCategory: 'model' },
      { key: 'hoverAmp', label: 'Hover amp', type: 'number', min: 0, step: 0.01 },
    ],
  },
  {
    id: 'megaphone_prop',
    label: 'Megaphone',
    icon: '📣',
    defaultProperties: {
      meshUrl: getAssetUrl('model.megaphone'),
      scale: gameConfig.megaphoneScaleMul,
    },
    schema: [
      { key: 'meshUrl', label: 'Mesh', type: 'asset', assetCategory: 'model' },
      { key: 'scale', label: 'Scale mul', type: 'number', min: 0, step: 0.05 },
    ],
  },
  {
    id: 'lobby_portal',
    label: 'Lobby Portal',
    icon: '🌀',
    defaultProperties: {
      meshUrl: getAssetUrl('model.portal'),
      swirlSpeed: gameConfig.lobbyPortalSwirlSpeed,
      swirlTightness: gameConfig.lobbyPortalSwirlTightness,
      swirlScale: gameConfig.lobbyPortalSwirlScale,
      pulseSpeed: gameConfig.lobbyPortalPulseSpeed,
      pulseStrength: gameConfig.lobbyPortalPulseStrength,
      intensity: gameConfig.lobbyPortalIntensity,
    },
    schema: [
      { key: 'meshUrl', label: 'Mesh', type: 'asset', assetCategory: 'model' },
      { key: 'swirlSpeed', label: 'Swirl speed', type: 'number', min: 0, step: 0.05 },
      { key: 'swirlTightness', label: 'Tightness', type: 'number', min: 0, step: 0.1 },
      { key: 'swirlScale', label: 'Swirl scale', type: 'number', min: 0, step: 0.1 },
      { key: 'pulseSpeed', label: 'Pulse speed', type: 'number', min: 0, step: 0.05 },
      { key: 'pulseStrength', label: 'Pulse strength', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'intensity', label: 'Intensity', type: 'number', min: 0, step: 0.05 },
    ],
  },
]

export function registerVibeJamEntityTypes(registry: EntityTypeRegistry): void {
  for (const def of DEFS) registry.register(def)
}
