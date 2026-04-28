import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

const HIT_UNDER_20 = new URL('../../Assets/SFX/HitEffects/Under 20%.ogg', import.meta.url).href
const HIT_OVER_20_A = new URL('../../Assets/SFX/HitEffects/Over20%.ogg', import.meta.url).href
const HIT_OVER_20_B = new URL('../../Assets/SFX/HitEffects/Over20%v2.ogg', import.meta.url).href
const HIT_OVER_50 = new URL('../../Assets/SFX/HitEffects/Over50%.ogg', import.meta.url).href
const HIT_OVER_70 = new URL('../../Assets/SFX/HitEffects/Over70%.ogg', import.meta.url).href
let activeHitImpactAudio: HTMLAudioElement | null = null

/** Local hit-confirm tier SFX based on victim launch percent *after* impact. */
export function playTieredHitImpactOneShot(victimPercentAfterHit: number): void {
  if (gameConfig.hitImpactTierSfxEnabled < 0.5) return
  const p = Math.max(0, victimPercentAfterHit)
  let clip = HIT_UNDER_20
  let mul = gameConfig.hitImpactUnder20VolumeMul
  if (p >= 70) {
    clip = HIT_OVER_70
    mul = gameConfig.hitImpactOver70VolumeMul
  } else if (p >= 50) {
    clip = HIT_OVER_50
    mul = gameConfig.hitImpactOver50VolumeMul
  } else if (p >= 22) {
    clip = Math.random() < 0.5 ? HIT_OVER_20_A : HIT_OVER_20_B
    mul = gameConfig.hitImpactOver20VolumeMul
  }
  const g = Math.max(0, Math.min(1, mul * getSfxChainMul()))
  if (g <= 0) return
  if (activeHitImpactAudio) {
    activeHitImpactAudio.pause()
    activeHitImpactAudio.currentTime = 0
  }
  const a = new Audio(clip)
  activeHitImpactAudio = a
  a.volume = g
  a.loop = false
  void a.play().catch(() => {
    /* ignore */
  })
}
