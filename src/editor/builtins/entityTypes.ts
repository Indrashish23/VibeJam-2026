import type { EntityTypeRegistry } from '../registries/EntityTypeRegistry'
import type { EntityTypeDefinition } from '../types'

/**
 * Eight spec-mandated generic entity types. These are content-agnostic; Vibe-Jam-specific
 * types live in `vibejamTypes.ts` and pre-wire the same data to real asset URLs.
 *
 * Icons use emoji glyphs so no extra asset bundling is required. Schemas drive the
 * Inspector's dynamic field rendering — change a schema here and the UI picks it up
 * automatically.
 */

const DEFS: EntityTypeDefinition[] = [
  {
    id: 'empty',
    label: 'Empty',
    icon: '⚪',
    defaultProperties: {},
    schema: [],
  },
  {
    id: 'static_mesh',
    label: 'Static Mesh',
    icon: '🧊',
    defaultProperties: {
      meshUrl: '',
      castShadow: true,
      receiveShadow: true,
      colliderShape: 'none',
    },
    schema: [
      { key: 'meshUrl', label: 'Mesh', type: 'asset', assetCategory: 'model' },
      { key: 'castShadow', label: 'Cast shadow', type: 'boolean' },
      { key: 'receiveShadow', label: 'Receive shadow', type: 'boolean' },
      {
        key: 'colliderShape',
        label: 'Collider',
        type: 'select',
        options: ['none', 'box', 'trimesh'],
      },
    ],
  },
  {
    id: 'player_spawn',
    label: 'Player Spawn',
    icon: '🚩',
    defaultProperties: { spawnIndex: 0, team: 'a' },
    schema: [
      { key: 'spawnIndex', label: 'Index', type: 'number', min: 0, step: 1 },
      { key: 'team', label: 'Team', type: 'select', options: ['a', 'b'] },
    ],
  },
  {
    id: 'character',
    label: 'Character',
    icon: '🐒',
    defaultProperties: {
      modelUrl: '',
      isPlayer: false,
      health: 100,
      speed: 50,
    },
    schema: [
      { key: 'modelUrl', label: 'Model', type: 'asset', assetCategory: 'model' },
      { key: 'isPlayer', label: 'Is player', type: 'boolean' },
      { key: 'health', label: 'Health', type: 'number', min: 0 },
      { key: 'speed', label: 'Speed', type: 'number', min: 0 },
    ],
  },
  {
    id: 'projectile_def',
    label: 'Projectile',
    icon: '💥',
    defaultProperties: { speed: 56, knockback: 30, damage: 10, model: '' },
    schema: [
      { key: 'speed', label: 'Speed', type: 'number', min: 0 },
      { key: 'knockback', label: 'Knockback', type: 'number', min: 0 },
      { key: 'damage', label: 'Damage', type: 'number', min: 0 },
      { key: 'model', label: 'Model', type: 'asset', assetCategory: 'model' },
    ],
  },
  {
    id: 'pickup',
    label: 'Pickup',
    icon: '🍌',
    defaultProperties: { pickupType: 'banana', respawnTime: 8 },
    schema: [
      { key: 'pickupType', label: 'Kind', type: 'select', options: ['banana', 'ammo', 'health'] },
      { key: 'respawnTime', label: 'Respawn (s)', type: 'number', min: 0 },
    ],
  },
  {
    id: 'audio_emitter',
    label: 'Audio Emitter',
    icon: '🔊',
    defaultProperties: {
      audioUrl: '',
      loop: false,
      volume: 1,
      maxDistance: 24,
      autoPlay: false,
    },
    schema: [
      { key: 'audioUrl', label: 'Audio', type: 'asset', assetCategory: 'audio' },
      { key: 'loop', label: 'Loop', type: 'boolean' },
      { key: 'volume', label: 'Volume', type: 'number', min: 0, max: 2, step: 0.05 },
      { key: 'maxDistance', label: 'Max distance', type: 'number', min: 0 },
      { key: 'autoPlay', label: 'Auto-play', type: 'boolean' },
    ],
  },
  {
    id: 'zone_trigger',
    label: 'Zone Trigger',
    icon: '📦',
    defaultProperties: {
      shape: 'box',
      size: [2, 2, 2],
      eventId: 'on_enter',
    },
    schema: [
      { key: 'shape', label: 'Shape', type: 'select', options: ['box', 'sphere'] },
      { key: 'size', label: 'Size', type: 'vector3' },
      { key: 'eventId', label: 'Event ID', type: 'string' },
    ],
  },
]

export function registerBuiltinEntityTypes(registry: EntityTypeRegistry): void {
  for (const def of DEFS) registry.register(def)
}
