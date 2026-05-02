import type { ComponentRegistry } from '../registries/ComponentRegistry'
import type { ComponentDefinition } from '../types'

/**
 * Five spec-mandated behavior-bag components. Only `rapier_collider` is allow-multiple
 * (multi-shape bodies). Schemas drive the Inspector component-card UI the same way
 * entity schemas drive the main inspector.
 */

const DEFS: ComponentDefinition[] = [
  {
    id: 'rapier_collider',
    label: 'Rapier Collider',
    allowMultiple: true,
    defaultProperties: {
      shape: 'box',
      isSensor: false,
      restitution: 0,
      friction: 0.5,
    },
    schema: [
      { key: 'shape', label: 'Shape', type: 'select', options: ['box', 'ball', 'trimesh'] },
      { key: 'isSensor', label: 'Sensor', type: 'boolean' },
      { key: 'restitution', label: 'Restitution', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'friction', label: 'Friction', type: 'number', min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    id: 'voice_charge',
    label: 'Voice Charge',
    allowMultiple: false,
    defaultProperties: {
      chargeRate: 0.66,
      maxCharge: 1,
      minFireThreshold: 0.36,
      projectileDefId: '',
    },
    schema: [
      { key: 'chargeRate', label: 'Charge rate', type: 'number', min: 0, step: 0.05 },
      { key: 'maxCharge', label: 'Max charge', type: 'number', min: 0, step: 0.05 },
      { key: 'minFireThreshold', label: 'Min fire', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'projectileDefId', label: 'Projectile ID', type: 'string' },
    ],
  },
  {
    id: 'knockback_target',
    label: 'Knockback Target',
    allowMultiple: false,
    defaultProperties: {
      currentPercent: 0,
      maxPercent: 999,
      launchMultiplier: 1,
      invulnAfterHit: 400,
    },
    schema: [
      { key: 'currentPercent', label: 'Current %', type: 'number', min: 0 },
      { key: 'maxPercent', label: 'Max %', type: 'number', min: 0 },
      { key: 'launchMultiplier', label: 'Launch ×', type: 'number', min: 0, step: 0.05 },
      { key: 'invulnAfterHit', label: 'Invuln (ms)', type: 'number', min: 0 },
    ],
  },
  {
    id: 'respawn',
    label: 'Respawn',
    allowMultiple: false,
    defaultProperties: { stockCount: 2, respawnDelay: 1000, homeSpawnId: '' },
    schema: [
      { key: 'stockCount', label: 'Stocks', type: 'number', min: 0, step: 1 },
      { key: 'respawnDelay', label: 'Delay (ms)', type: 'number', min: 0 },
      { key: 'homeSpawnId', label: 'Home spawn', type: 'string' },
    ],
  },
  {
    id: 'nameplate',
    label: 'Nameplate',
    allowMultiple: false,
    defaultProperties: { displayName: '', showHealthBar: true },
    schema: [
      { key: 'displayName', label: 'Name', type: 'string' },
      { key: 'showHealthBar', label: 'Show HP bar', type: 'boolean' },
    ],
  },
]

export function registerBuiltinComponents(registry: ComponentRegistry): void {
  for (const def of DEFS) registry.register(def)
}
