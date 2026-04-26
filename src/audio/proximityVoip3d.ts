import { Vector3 } from 'three'
import { gameConfig } from '../gameConfig'

/**
 * Spatializes the peer’s live voice with a Panner (Web Audio) + master gain.
 * Listener matches the local camera; source is the opponent’s “mouth” position (caller provides).
 */
export function createProximityVoip3d(
  stream: MediaStream,
  getListenerPos: () => Vector3,
  getListenerForward: () => Vector3,
  getSourcePos: () => Vector3,
): { dispose: () => void; tick: () => void; resume: () => void } {
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const out = ctx.createGain()
  out.gain.value = 0

  const panner = ctx.createPanner()
  /* equalpower 3D is more stable than HRTF for some headsets / angles (voice stays audible). */
  panner.panningModel = 'equalpower'
  panner.distanceModel = 'inverse'
  panner.refDistance = gameConfig.proximityVoipRefDistance
  panner.maxDistance = gameConfig.proximityVoipMaxDistance
  panner.rolloffFactor = gameConfig.proximityVoipRolloff
  panner.coneInnerAngle = 360
  panner.coneOuterAngle = 360

  const listener = ctx.listener
  const _f = new Vector3()

  src.connect(panner)
  panner.connect(out)
  out.connect(ctx.destination)

  return {
    resume: () => void ctx.resume(),

    tick: () => {
      if (ctx.state === 'suspended') void ctx.resume()
      if (gameConfig.proximityVoipEnabled < 0.5) {
        out.gain.value = 0
        return
      }
      out.gain.value = Math.max(0, Math.min(2, gameConfig.proximityVoipOutputMul))
      panner.refDistance = gameConfig.proximityVoipRefDistance
      panner.maxDistance = gameConfig.proximityVoipMaxDistance
      panner.rolloffFactor = gameConfig.proximityVoipRolloff

      const p = getListenerPos()
      _f.copy(getListenerForward()).normalize()
      listener.positionX.value = p.x
      listener.positionY.value = p.y
      listener.positionZ.value = p.z
      listener.forwardX.value = _f.x
      listener.forwardY.value = _f.y
      listener.forwardZ.value = _f.z
      listener.upX.value = 0
      listener.upY.value = 1
      listener.upZ.value = 0

      const s = getSourcePos()
      panner.setPosition(s.x, s.y, s.z)
    },

    dispose: () => {
      try {
        src.disconnect()
        panner.disconnect()
        out.disconnect()
      } catch {
        /* ignore */
      }
      void ctx.close()
    },
  }
}
