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

/** Ground + thin rim so the playable surface reads as a bounded ring. */
export function addArena(parent: Object3D): Mesh {
  const w = gameConfig.groundWidth
  const d = gameConfig.groundDepth
  const h = DECK_THICK

  const ground = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({
      color: new Color(0x252528),
      roughness: 0.97,
      metalness: 0.03,
    }),
  )
  ground.receiveShadow = true
  ground.position.set(0, -h / 2, 0)
  parent.add(ground)

  const rimH = RIM_H
  const rimT = RIM_T
  const rimMat = new MeshStandardMaterial({
    color: new Color(0x3d3d42),
    roughness: 0.88,
    metalness: 0.08,
  })

  const rimGroup = new Group()
  parent.add(rimGroup)

  const mkRim = (bw: number, bd: number, px: number, pz: number) => {
    const m = new Mesh(new BoxGeometry(bw, rimH, bd), rimMat)
    m.receiveShadow = true
    m.castShadow = true
    m.position.set(px, rimH / 2 + 0.001, pz)
    rimGroup.add(m)
  }

  mkRim(w + rimT * 2, rimT, 0, d / 2 + rimT / 2)
  mkRim(w + rimT * 2, rimT, 0, -d / 2 - rimT / 2)
  mkRim(rimT, d + rimT * 2, w / 2 + rimT / 2, 0)
  mkRim(rimT, d + rimT * 2, -w / 2 - rimT / 2, 0)

  return ground
}

export function isBlastZone(pos: Vector3): boolean {
  if (pos.y < gameConfig.blastY) return true
  const halfW = gameConfig.groundWidth / 2 + gameConfig.blastMargin
  const halfD = gameConfig.groundDepth / 2 + gameConfig.blastMargin
  return Math.abs(pos.x) > halfW || Math.abs(pos.z) > halfD
}
