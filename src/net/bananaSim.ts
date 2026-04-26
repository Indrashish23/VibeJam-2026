import { Vector3 } from 'three'
import { gameConfig } from '../gameConfig'

const _p = new Vector3()
const _v = new Vector3()
const _start = new Vector3()
const _horiz = new Vector3()

/**
 * Parabolic throw with gravity; returns landing on terrain.
 */
export function simBananaThrowToLanding(
  origin: Vector3,
  camDirXZ: Vector3,
  throwSpeed: number,
  upArcMul: number,
  gravity: number,
  maxDistance: number,
  raycastDown: (
    x: number,
    y: number,
    z: number,
    maxD: number,
  ) => { point: Vector3; normal: Vector3 } | null,
  outLanding: Vector3,
): boolean {
  _v.copy(camDirXZ).setY(0)
  if (_v.lengthSq() < 1e-8) _v.set(0, 0, -1)
  _v.normalize()
  _v.y = 0.25 * upArcMul
  _v.normalize()
  _v.multiplyScalar(throwSpeed)

  _p.copy(origin)
  _start.copy(origin)

  const dt = 1 / 50
  for (let i = 0; i < 800; i++) {
    _v.y -= gravity * dt
    _p.addScaledVector(_v, dt)

    _horiz.subVectors(_p, _start)
    _horiz.y = 0
    if (_horiz.length() > maxDistance * 1.08) {
      const h = raycastDown(_p.x, _p.y + 2.5, _p.z, 200)
      if (h) {
        outLanding.copy(h.point)
        return true
      }
      outLanding.set(_p.x, Math.max(gameConfig.blastY + 0.5, _p.y - 0.1), _p.z)
      return true
    }

    const h = raycastDown(_p.x, _p.y + 0.5, _p.z, 160)
    if (h && i > 1 && _p.y < h.point.y + 0.5 && _v.y <= 0) {
      outLanding.copy(h.point)
      return true
    }
    if (_p.y < gameConfig.blastY) {
      outLanding.copy(_p)
      return true
    }
  }
  {
    const h = raycastDown(_p.x, _p.y + 2, _p.z, 200)
    if (h) outLanding.copy(h.point)
    else outLanding.copy(_p)
  }
  return true
}

export type PeelTest = { x: number; y: number; z: number; id: string | number }

export function feetOnPeel(
  feet: Vector3,
  peel: PeelTest,
  radius: number,
  yTolerance: number,
): boolean {
  const dx = feet.x - peel.x
  const dz = feet.z - peel.z
  if (Math.hypot(dx, dz) > radius) return false
  return Math.abs(feet.y - peel.y) < yTolerance
}

export function clampDirectionXZ(out: Vector3, dir: Vector3): void {
  out.set(dir.x, 0, dir.z)
  if (out.lengthSq() < 1e-8) out.set(0, 0, -1)
  out.normalize()
}

export function isFeetInPickUpRange(
  feet: Vector3,
  pickup: { x: number; y: number; z: number },
  radius: number,
): boolean {
  const yTol = 2.2
  const h = Math.hypot(feet.x - pickup.x, feet.z - pickup.z)
  return h < radius && Math.abs(feet.y - pickup.y) < yTol
}
