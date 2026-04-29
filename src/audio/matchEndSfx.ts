import { gameConfig } from '../gameConfig'
import { getSfxChainMul } from './sfxChain'

/**
 * One combined clip: victory uses 0–1.8s, defeat uses 2–5s (see `SEGMENT`).
 * Replace `match_victory.mp3` with a single asset that contains both parts back-to-back.
 */
const MATCH_END_ANNOUNCER = new URL('../../Assets/SFX/match_victory.mp3', import.meta.url).href

const SEGMENT: Record<'win' | 'lose', { start: number; end: number }> = {
  win: { start: 0, end: 1.8 },
  lose: { start: 2, end: 5 },
}

/** Playback starts this many ms before the GAME splash flash. */
export const MATCH_END_ANNOUNCER_LEAD_MS = 200

/**
 * Plays the match-end announcer slice for the outcome. Call ~`MATCH_END_ANNOUNCER_LEAD_MS`
 * before showing the GAME text flash. Uses Settings SFX × master × Tweaks SFX chain.
 */
export function playMatchGameSplashAnnouncer(outcome: 'win' | 'lose'): void {
  if (gameConfig.matchEndAnnouncerEnabled < 0.5) return
  const g = Math.max(
    0,
    Math.min(1, gameConfig.matchEndAnnouncerVolumeMul * getSfxChainMul()),
  )
  if (g <= 0) return
  const seg = SEGMENT[outcome]
  const a = new Audio(MATCH_END_ANNOUNCER)
  a.volume = g
  a.loop = false
  a.preload = 'auto'

  const stopIfPastEnd = () => {
    if (a.currentTime >= seg.end - 0.02) {
      try {
        a.pause()
      } catch {
        /* ignore */
      }
      a.removeEventListener('timeupdate', stopIfPastEnd)
    }
  }

  const startPlayback = () => {
    try {
      a.currentTime = seg.start
    } catch {
      /* ignore */
    }
    a.addEventListener('timeupdate', stopIfPastEnd)
    void a.play().catch(() => {
      a.removeEventListener('timeupdate', stopIfPastEnd)
    })
  }

  if (a.readyState >= HTMLMediaElement.HAVE_METADATA) {
    startPlayback()
  } else {
    a.addEventListener('loadedmetadata', startPlayback, { once: true })
  }
}
