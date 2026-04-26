import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

const JUMP = new URL('../../Assets/SFX/Footsteps/JumpSound.ogg', import.meta.url).href
const LAND = new URL('../../Assets/SFX/Footsteps/LandingonGround.ogg', import.meta.url).href

function playLocal(enabled: number, devMul: number, url: string): void {
  if (enabled < 0.5) return
  const g = Math.max(0, Math.min(1, devMul * getSfxChainMul()))
  if (g <= 0) return
  const a = new Audio(url)
  a.volume = g
  a.loop = false
  void a.play().catch(() => {
    /* ignore */
  })
}

export function playJumpOneShot(): void {
  playLocal(
    gameConfig.jumpSfxEnabled,
    Math.max(0, Math.min(1, gameConfig.jumpSfxVolumeMul)),
    JUMP,
  )
}

export function playLandOneShot(): void {
  playLocal(
    gameConfig.landSfxEnabled,
    Math.max(0, Math.min(1, gameConfig.landSfxVolumeMul)),
    LAND,
  )
}
