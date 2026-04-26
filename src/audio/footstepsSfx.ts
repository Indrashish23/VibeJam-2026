import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

const CLIPS: string[] = [2, 3, 4, 5, 6, 7].map((n) =>
  new URL(`../../Assets/SFX/Footsteps/footstep-cat-${n}.wav`, import.meta.url).href,
)

/**
 * Plays a random footstep; volume = `footstepVolumeMul` × SFX chain (Settings + Tweaks).
 */
export function playFootstepOneShot(): void {
  if (gameConfig.footstepSfxEnabled < 0.5) return
  const u = CLIPS[Math.floor(Math.random() * CLIPS.length)]
  if (!u) return
  const a = new Audio()
  a.src = u
  const dev = Math.max(0, Math.min(1, gameConfig.footstepVolumeMul))
  a.volume = Math.max(0, Math.min(1, dev * getSfxChainMul()))
  void a.play().catch(() => {
    /* ignore */
  })
}
