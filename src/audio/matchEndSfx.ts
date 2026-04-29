import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

const MATCH_VICTORY = new URL('../../Assets/SFX/match_victory.mp3', import.meta.url).href
const MATCH_DEFEAT = new URL('../../Assets/SFX/match_defeat.mp3', import.meta.url).href

/** Plays when the match ends (last stock). Uses Settings SFX × master × Tweaks SFX chain. */
export function playMatchEndStinger(outcome: 'win' | 'lose'): void {
  if (gameConfig.matchEndAnnouncerEnabled < 0.5) return
  const clip = outcome === 'win' ? MATCH_VICTORY : MATCH_DEFEAT
  const g = Math.max(
    0,
    Math.min(1, gameConfig.matchEndAnnouncerVolumeMul * getSfxChainMul()),
  )
  if (g <= 0) return
  const a = new Audio(clip)
  a.volume = g
  a.loop = false
  void a.play().catch(() => {
    /* autoplay / decode */
  })
}
