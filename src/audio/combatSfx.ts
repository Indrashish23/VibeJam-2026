import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

const HITMARKER = new URL('../../Assets/SFX/hitmarker.ogg', import.meta.url).href

/** Local UI hit-confirm when your attack connects (× Settings SFX × Tweaks). */
export function playHitmarkerOneShot(): void {
  if (gameConfig.hitMarkerSfxEnabled < 0.5) return
  const g = Math.max(0, Math.min(1, gameConfig.hitMarkerSfxVolumeMul * getSfxChainMul()))
  if (g <= 0) return
  const a = new Audio(HITMARKER)
  a.volume = g
  a.loop = false
  void a.play().catch(() => {
    /* ignore */
  })
}
