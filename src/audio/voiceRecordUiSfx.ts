import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

const URL_RECORD = new URL('../../Assets/SFX/Footsteps/RecordingSound.mp3', import.meta.url).href
const RECORD_SFX_OUT_MUL = 0.2
const URL_RELEASE = new URL('../../Assets/SFX/Footsteps/ReleaseSound.ogg', import.meta.url).href

let currentRecording: HTMLAudioElement | null = null

function level(enabled: number, devMul: number): number {
  if (enabled < 0.5) return 0
  return Math.max(0, Math.min(1, devMul * getSfxChainMul()))
}

/** Stops the local “recording” UI SFX (e.g. on release or before a new start). */
export function stopLocalVoiceRecordUiSfx(): void {
  if (currentRecording) {
    currentRecording.pause()
    currentRecording.currentTime = 0
    currentRecording = null
  }
}

/**
 * One-shot when the local player actually starts mic capture for a charge (not networked).
 * Does not loop.
 */
export function playLocalVoiceRecordStartSfx(): void {
  const g = level(gameConfig.voiceRecordSfxEnabled, gameConfig.voiceRecordSfxVolumeMul)
  if (g <= 0) return
  stopLocalVoiceRecordUiSfx()
  const a = new Audio(URL_RECORD)
  currentRecording = a
  a.volume = Math.max(0, Math.min(1, g * RECORD_SFX_OUT_MUL))
  a.loop = false
  const clear = () => {
    if (currentRecording === a) currentRecording = null
  }
  a.addEventListener('ended', clear)
  a.addEventListener('error', clear)
  void a.play().catch(clear)
}

/**
 * One-shot on local release of charge (LMB or pistol RMB). Stops the recording SFX if still playing.
 * Does not loop.
 */
export function playLocalVoiceRecordReleaseSfx(): void {
  stopLocalVoiceRecordUiSfx()
  const g = level(gameConfig.voiceReleaseSfxEnabled, gameConfig.voiceReleaseSfxVolumeMul)
  if (g <= 0) return
  const a = new Audio(URL_RELEASE)
  a.volume = g
  a.loop = false
  void a.play().catch(() => {
    /* ignore */
  })
}
