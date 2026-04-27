import { PerspectiveCamera, Vector3 } from 'three'
import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

/**
 * Plays peer (enemy) movement / weapon SFX in 3D world space.
 *
 * Why a dedicated module: the local SFX (`footstepsSfx`, `playerMoveSfx`, `voiceRecordUiSfx`)
 * are bare `<audio>` element one-shots — non-spatial, no falloff. When we hear another
 * player move around us we want HRTF panning + distance rolloff, which means decoded
 * `AudioBuffer`s on the WebAudio graph. We pre-decode once on the first user gesture,
 * then play via a small Panner per shot.
 *
 * The AudioContext is **independent** of `voiceCharge`'s ctx so this works even when the
 * user denied mic permission (no `voice.ctx` exists in that case).
 */

type SfxKind = 'footstep' | 'jump' | 'land' | 'shoot'

const FOOTSTEP_URLS: string[] = [2, 3, 4, 5, 6, 7].map(
  (n) => new URL(`../../Assets/SFX/Footsteps/footstep-cat-${n}.wav`, import.meta.url).href,
)
const JUMP_URL = new URL('../../Assets/SFX/Footsteps/JumpSound.ogg', import.meta.url).href
const LAND_URL = new URL('../../Assets/SFX/Footsteps/LandingonGround.ogg', import.meta.url).href
const RELEASE_URL = new URL('../../Assets/SFX/Footsteps/ReleaseSound.mp3', import.meta.url).href

let ctx: AudioContext | null = null
let footstepBufs: (AudioBuffer | null)[] = []
let jumpBuf: AudioBuffer | null = null
let landBuf: AudioBuffer | null = null
let shootBuf: AudioBuffer | null = null
let decodeStarted = false

const _listenerPos = new Vector3()
const _listenerFwd = new Vector3()
const _listenerUp = new Vector3(0, 1, 0)

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx
  try {
    ctx = new AudioContext()
  } catch {
    return null
  }
  return ctx
}

async function decodeUrl(url: string): Promise<AudioBuffer | null> {
  const c = ensureCtx()
  if (!c) return null
  try {
    const res = await fetch(url)
    const ab = await res.arrayBuffer()
    return await new Promise<AudioBuffer | null>((resolve) => {
      c.decodeAudioData(
        ab.slice(0),
        (b) => resolve(b),
        () => resolve(null),
      )
    })
  } catch {
    return null
  }
}

function startDecodingAllOnce(): void {
  if (decodeStarted) return
  decodeStarted = true
  void Promise.all(FOOTSTEP_URLS.map((u) => decodeUrl(u))).then((arr) => {
    footstepBufs = arr
  })
  void decodeUrl(JUMP_URL).then((b) => {
    jumpBuf = b
  })
  void decodeUrl(LAND_URL).then((b) => {
    landBuf = b
  })
  void decodeUrl(RELEASE_URL).then((b) => {
    shootBuf = b
  })
}

/**
 * Resume the SFX AudioContext and kick off buffer decoding.
 * Call from any user gesture chain (e.g. wherever `voice.resumeAudio()` is called).
 */
export function resumeEnemySfxAudio(): void {
  const c = ensureCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  startDecodingAllOnce()
}

function bufferForKind(kind: SfxKind): AudioBuffer | null {
  if (kind === 'footstep') {
    if (footstepBufs.length === 0) return null
    const i = Math.floor(Math.random() * footstepBufs.length)
    return footstepBufs[i] ?? null
  }
  if (kind === 'jump') return jumpBuf
  if (kind === 'land') return landBuf
  if (kind === 'shoot') return shootBuf
  return null
}

/** Per-kind dev volume × master SFX chain. Mirrors the local one-shot levels. */
function localLevelForKind(kind: SfxKind): number {
  const chain = getSfxChainMul()
  if (kind === 'footstep') {
    if (gameConfig.footstepSfxEnabled < 0.5) return 0
    return Math.max(0, Math.min(1, gameConfig.footstepVolumeMul * chain))
  }
  if (kind === 'jump') {
    if (gameConfig.jumpSfxEnabled < 0.5) return 0
    return Math.max(0, Math.min(1, gameConfig.jumpSfxVolumeMul * chain))
  }
  if (kind === 'land') {
    if (gameConfig.landSfxEnabled < 0.5) return 0
    return Math.max(0, Math.min(1, gameConfig.landSfxVolumeMul * chain))
  }
  if (kind === 'shoot') {
    if (gameConfig.voiceReleaseSfxEnabled < 0.5) return 0
    return Math.max(0, Math.min(1, gameConfig.voiceReleaseSfxVolumeMul * chain))
  }
  return 0
}

/**
 * Play an enemy/peer SFX at a world position with HRTF + inverse rolloff.
 * Listener is updated from the camera each call (cheap).
 *
 * Reuses the voice-hit panner knobs (`voiceHitRefDistance`, etc.) so the audible range
 * mirrors hit clips — avoids adding a fourth set of distance tunables.
 */
export function playEnemySfxSpatialAt(
  kind: SfxKind,
  soundWorld: Vector3,
  camera: PerspectiveCamera,
): void {
  const c = ensureCtx()
  if (!c) return
  if (c.state === 'suspended') {
    /* Best-effort resume; if no gesture yet, this is a no-op until a later resume call lands. */
    void c.resume()
  }
  const level = localLevelForKind(kind)
  if (level <= 0) return
  const buf = bufferForKind(kind)
  if (!buf) {
    /* Buffers may still be decoding on first match — silent miss is acceptable. */
    return
  }

  try {
    camera.getWorldPosition(_listenerPos)
    camera.getWorldDirection(_listenerFwd)
    _listenerFwd.normalize()

    const listener = c.listener
    listener.positionX.value = _listenerPos.x
    listener.positionY.value = _listenerPos.y
    listener.positionZ.value = _listenerPos.z
    listener.forwardX.value = _listenerFwd.x
    listener.forwardY.value = _listenerFwd.y
    listener.forwardZ.value = _listenerFwd.z
    listener.upX.value = _listenerUp.x
    listener.upY.value = _listenerUp.y
    listener.upZ.value = _listenerUp.z

    const panner = c.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = gameConfig.voiceHitRefDistance
    panner.maxDistance = gameConfig.voiceHitMaxDistance
    panner.rolloffFactor = gameConfig.voiceHitRolloff
    panner.coneInnerAngle = 360
    panner.coneOuterAngle = 360
    panner.setPosition(soundWorld.x, soundWorld.y, soundWorld.z)

    const gain = c.createGain()
    gain.gain.value = level

    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(panner)
    panner.connect(gain)
    gain.connect(c.destination)

    src.onended = () => {
      try {
        src.disconnect()
        panner.disconnect()
        gain.disconnect()
      } catch {
        /* ignore */
      }
    }
    src.start()
  } catch {
    /* WebAudio can throw on odd states (e.g. sample rate mismatch); swallow. */
  }
}

export type { SfxKind }
