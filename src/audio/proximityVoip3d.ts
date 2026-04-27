import { Vector3 } from 'three'
import { gameConfig } from '../gameConfig'

/**
 * Spatializes the peer’s live voice with a Panner (Web Audio) + master gain.
 * Listener matches the local camera; source is the opponent’s “mouth” position (caller provides).
 *
 * IMPORTANT (Chromium bug 933677 / 121673): a remote WebRTC `MediaStream` connected ONLY to
 * `MediaStreamAudioSourceNode → ...` is silent in Chromium until the same stream is also bound
 * to a sink `<audio>`/`<video>` element so the underlying decoder actually pulls packets.
 * We attach a hidden, *muted* `<audio>` element to “kick” the decoder; the real audible output
 * is the panner graph below. This is the canonical workaround used by every voice-chat web
 * stack we’ve seen; without it, proximity voice never plays no matter what gain we set.
 */
export function createProximityVoip3d(
  stream: MediaStream,
  getListenerPos: () => Vector3,
  getListenerForward: () => Vector3,
  getSourcePos: () => Vector3,
): { dispose: () => void; tick: () => void; resume: () => void } {
  /* Sink element (muted) — kicks the WebRTC audio pipeline so the panner actually hears samples. */
  const sinkEl = document.createElement('audio')
  sinkEl.autoplay = true
  sinkEl.muted = true
  sinkEl.setAttribute('playsinline', 'true')
  /* Some Chromium versions need the element in the DOM tree to schedule decode. Hidden, off-screen. */
  sinkEl.style.position = 'absolute'
  sinkEl.style.width = '0'
  sinkEl.style.height = '0'
  sinkEl.style.opacity = '0'
  sinkEl.style.pointerEvents = 'none'
  sinkEl.srcObject = stream
  document.body.appendChild(sinkEl)
  void sinkEl.play().catch(() => {
    /* play() may reject pre-gesture; once user has clicked anywhere it succeeds on the next tick. */
  })

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
    resume: () => {
      void ctx.resume()
      /* Retry sink play() — first attempt may have failed pre-gesture. */
      void sinkEl.play().catch(() => {
        /* still no gesture; the next tick will try again */
      })
    },

    tick: () => {
      if (ctx.state === 'suspended') void ctx.resume()
      if (sinkEl.paused) {
        void sinkEl.play().catch(() => {
          /* ignore: next tick will retry */
        })
      }
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
      try {
        sinkEl.pause()
        sinkEl.srcObject = null
        sinkEl.remove()
      } catch {
        /* ignore */
      }
      void ctx.close()
    },
  }
}
