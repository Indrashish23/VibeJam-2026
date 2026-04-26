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

export function isBlastZone(pos: Vector3): boolean {
  if (pos.y < gameConfig.blastY) return true
  const halfW = gameConfig.groundWidth / 2 + gameConfig.blastMargin
  const halfD = gameConfig.groundDepth / 2 + gameConfig.blastMargin
  return Math.abs(pos.x) > halfW || Math.abs(pos.z) > halfD
}
