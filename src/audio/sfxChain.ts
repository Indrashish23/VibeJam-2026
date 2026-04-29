import { gameConfig } from '../gameConfig'
import { getMasterSfxMul, getMasterVolumeMul } from '../userSettingsStorage'

/** Player “Sound effects” in Settings × Tweaks → Sound → SFX level. */
export function getSfxChainMul(): number {
  return Math.max(
    0,
    Math.min(
      1,
      getMasterSfxMul() *
        getMasterVolumeMul() *
        Math.max(0, Math.min(1, gameConfig.sfxTweakVolumeMul)),
    ),
  )
}
