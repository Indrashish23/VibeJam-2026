import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

const URL_RELEASE = new URL('../../Assets/SFX/ThrowSound.ogg', import.meta.url).href

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
 * Recording-start sound removed by design; keep API as a no-op.
 */
export function playLocalVoiceRecordStartSfx(): void {
  stopLocalVoiceRecordUiSfx()
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
