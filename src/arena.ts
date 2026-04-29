import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three'
import { gameConfig } from './gameConfig'

/** Shared with Rapier static cuboids in `getArenaCollisionCuboids`. */
const DECK_THICK = 0.45
const RIM_H = 0.22
const RIM_T = 0.35

export type ArenaCuboid = { center: Vector3; halfExtents: Vector3 }

/**
 * Axis-aligned boxes matching `addArena` visuals — use for Rapier `ColliderDesc.cuboid`
 * instead of trimesh-from-mesh (more reliable with the character controller).
 */
export function getArenaCollisionCuboids(): ArenaCuboid[] {
  const w = gameConfig.groundWidth
  const d = gameConfig.groundDepth
  const h = DECK_THICK
  const rimH = RIM_H
  const rimT = RIM_T

  const yRim = rimH / 2 + 0.001
  return [
    {
      center: new Vector3(0, -h / 2, 0),
      halfExtents: new Vector3(w / 2, h / 2, d / 2),
    },
    {
      center: new Vector3(0, yRim, d / 2 + rimT / 2),
      halfExtents: new Vector3((w + rimT * 2) / 2, rimH / 2, rimT / 2),
    },
    {
      center: new Vector3(0, yRim, -d / 2 - rimT / 2),
      halfExtents: new Vector3((w + rimT * 2) / 2, rimH / 2, rimT / 2),
    },
    {
      center: new Vector3(w / 2 + rimT / 2, yRim, 0),
      halfExtents: new Vector3(rimT / 2, rimH / 2, (d + rimT * 2) / 2),
    },
    {
      center: new Vector3(-w / 2 - rimT / 2, yRim, 0),
      halfExtents: new Vector3(rimT / 2, rimH / 2, (d + rimT * 2) / 2),
    },
  ]
}

/**
 * Default stage: one root group, deck + rim boxes. Layout matches `getArenaCollisionCuboids` 1:1
 * (same sizes/positions) so Rapier cuboids align with what you see.
 */
export function addArena(parent: Object3D): Group {
  const w = gameConfig.groundWidth
  const d = gameConfig.groundDepth
  const h = DECK_THICK
  const rimH = RIM_H
  const rimT = RIM_T

  const stage = new Group()
  stage.name = 'arenaStage'
  parent.add(stage)

  const deckMat = new MeshStandardMaterial({
    color: new Color(0x252528),
    roughness: 0.97,
    metalness: 0.03,
  })
  const deck = new Mesh(new BoxGeometry(w, h, d), deckMat)
  deck.name = 'arenaDeck'
  deck.receiveShadow = true
  deck.position.set(0, -h / 2, 0)
  stage.add(deck)

  const rimMat = new MeshStandardMaterial({
    color: new Color(0x3d3d42),
    roughness: 0.88,
    metalness: 0.08,
  })

  const mkRim = (name: string, bw: number, bd: number, px: number, pz: number) => {
    const m = new Mesh(new BoxGeometry(bw, rimH, bd), rimMat)
    m.name = name
    m.receiveShadow = true
    m.castShadow = true
    m.position.set(px, rimH / 2 + 0.001, pz)
    stage.add(m)
  }

  mkRim('arenaRimN', w + rimT * 2, rimT, 0, d / 2 + rimT / 2)
  mkRim('arenaRimS', w + rimT * 2, rimT, 0, -d / 2 - rimT / 2)
  mkRim('arenaRimE', rimT, d + rimT * 2, w / 2 + rimT / 2, 0)
  mkRim('arenaRimW', rimT, d + rimT * 2, -w / 2 - rimT / 2, 0)

  return stage
}

/**
 * Cylindrical blast bound radius (XZ): circumscribed around the rectangular deck
 * + `blastMargin`. A circle (vs. axis-aligned box) prevents corner-leaks where a
 * fighter clips just past the deck diagonal but no single axis exceeds half-width.
 */
export function arenaBlastRadius(): number {
  const halfW = gameConfig.groundWidth / 2
  const halfD = gameConfig.groundDepth / 2
  return Math.sqrt(halfW * halfW + halfD * halfD) + gameConfig.blastMargin
}

/**
 * Authoritative ring-out check used by every KO trigger (offline + PvP, player +
 * bot/peer, banana sim).
 *
 * Catches three escape modes:
 *  - **Below** (`y < blastY`): falling off — original kill plane.
 *  - **Above** (`y > blastYHigh`): bug fix — a vertical knockback could carry a
 *    fighter past the kill plane never being sampled (or hang at extreme Y while
 *    physics drifts), so we KO once they cross the ceiling.
 *  - **Outside cylinder** (`x² + z² > r²`): drifted past the deck horizontally.
 *    Cylindrical (vs. axis box) so corner escapes always trigger.
 */
export function isOutsideArenaBounds(x: number, y: number, z: number): boolean {
  if (y < gameConfig.blastY) return true
  if (y > gameConfig.blastYHigh) return true
  const r = arenaBlastRadius()
  return x * x + z * z > r * r
}

/** Backwards-compat: existing callers pass a `Vector3`. */
export function isBlastZone(pos: Vector3): boolean {
  return isOutsideArenaBounds(pos.x, pos.y, pos.z)
}
