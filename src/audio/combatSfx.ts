import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

const HIT_UNDER_20 = new URL('../../Assets/SFX/HitEffects/Under 20%.ogg', import.meta.url).href
const HIT_OVER_20_A = new URL('../../Assets/SFX/HitEffects/Over20%.ogg', import.meta.url).href
const HIT_OVER_20_B = new URL('../../Assets/SFX/HitEffects/Over20%v2.ogg', import.meta.url).href
const HIT_OVER_50 = new URL('../../Assets/SFX/HitEffects/Over50%.ogg', import.meta.url).href
const HIT_OVER_70 = new URL('../../Assets/SFX/HitEffects/Over70%.ogg', import.meta.url).href
const BOT_HIT_VOICE_A = new URL('../../Assets/SFX/HitEffects/Boi what the hell Bruh.mp3', import.meta.url).href
const BOT_HIT_VOICE_B = new URL(
  '../../Assets/SFX/HitEffects/You Should K Yourself Now Sound Effect  Soundboard Link.mp3',
  import.meta.url,
).href

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
  const a = new Audio(clip)
  a.volume = g
  a.loop = false
  void a.play().catch(() => {
    /* ignore */
  })
}

/** Bot-on-player hit VO one-shot, pitched like voice delivery (`voiceDeliveryPlaybackRate`). */
export function playRandomBotHitVoiceOneShot(): void {
  const clip = Math.random() < 0.5 ? BOT_HIT_VOICE_A : BOT_HIT_VOICE_B
  const g = Math.max(0, Math.min(1, getSfxChainMul()))
  if (g <= 0) return
  const a = new Audio(clip)
  a.volume = g
  a.loop = false
  a.playbackRate = Math.max(0.5, Math.min(2.6, gameConfig.voiceDeliveryPlaybackRate))
  void a.play().catch(() => {
    /* ignore */
  })
}
