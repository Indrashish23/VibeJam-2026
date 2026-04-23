import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import { gameConfig } from './gameConfig'
import type { Vector3 } from 'three'

/** Ground + thin rim so the playable surface reads as a bounded ring. */
export function addArena(parent: Object3D): Mesh {
  const w = gameConfig.groundWidth
  const d = gameConfig.groundDepth
  const h = 0.45

  const ground = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({
      color: new Color(0x252528),
      roughness: 0.97,
      metalness: 0.03,
    }),
  )
  ground.position.set(0, -h / 2, 0)
  parent.add(ground)

  const rimH = 0.22
  const rimT = 0.35
  const rimMat = new MeshStandardMaterial({
    color: new Color(0x3d3d42),
    roughness: 0.88,
    metalness: 0.08,
  })

  const rimGroup = new Group()
  parent.add(rimGroup)

  const mkRim = (bw: number, bd: number, px: number, pz: number) => {
    const m = new Mesh(new BoxGeometry(bw, rimH, bd), rimMat)
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
