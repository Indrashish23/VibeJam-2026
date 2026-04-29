import { gameConfig } from '../gameConfig'
import { getBgmMul, getMasterVolumeMul } from '../userSettingsStorage'

const MENU_TRACKS = [new URL('../../Assets/Music/BGMain.mp3', import.meta.url).href] as const
const ROUND_TRACK_URL = new URL('../../Assets/Music/GameMusic.mp3', import.meta.url).href

/** In-round music nominal level (before Music / Master in Settings). Menu BGM chain unchanged. */
const ROUND_BGM_BASE = 0.3

let menuAudio: HTMLAudioElement | null = null
let roundAudio: HTMLAudioElement | null = null
let menuIndex = 0
/** After first user gesture, menu/round tracks may play (subject to match vs menu mode). */
let audioUnlocked = false
/** When true (active match), play round BGM; otherwise menu shuffle. */
let gameplaySuppressed = false

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function applyMenuVolume(): void {
  if (!menuAudio) return
  const vol = gameplaySuppressed
    ? 0
    : clamp01(gameConfig.bgmVolume * getBgmMul() * getMasterVolumeMul())
  menuAudio.volume = vol
}

function applyRoundVolume(): void {
  if (!roundAudio) return
  const vol = gameplaySuppressed
    ? clamp01(ROUND_BGM_BASE * getBgmMul() * getMasterVolumeMul())
    : 0
  roundAudio.volume = vol
}

function syncPlaybackState(): void {
  if (!menuAudio || !roundAudio) return
  applyMenuVolume()
  applyRoundVolume()
  if (gameplaySuppressed) {
    void menuAudio.pause()
    if (audioUnlocked) {
      void roundAudio.play().catch(() => {
        /* autoplay / tab policy */
      })
    }
  } else {
    void roundAudio.pause()
    if (audioUnlocked) {
      void menuAudio.play().catch(() => {
        /* autoplay / tab policy */
      })
    }
  }
}

/** Call when entering/leaving the 3D match so menu vs round BGM swaps. */
export function setBackgroundMusicGameplaySuppressed(suppressed: boolean): void {
  gameplaySuppressed = suppressed
  syncPlaybackState()
}

function pickNextMenuIndex(): void {
  if (MENU_TRACKS.length < 2) return
  let n = menuIndex
  while (n === menuIndex) {
    n = Math.floor(Math.random() * MENU_TRACKS.length)
  }
  menuIndex = n
}

function loadAndPlayNextMenu(): void {
  if (!menuAudio) return
  pickNextMenuIndex()
  menuAudio.src = MENU_TRACKS[menuIndex]!
  menuAudio.load()
  void menuAudio.play().catch(() => {
    /* autoplay blocked until gesture */
  })
}

function onMenuEnded(): void {
  loadAndPlayNextMenu()
}

/**
 * One-time: create menu + round elements, mirror volumes each frame.
 * Call `tryStartOnUserGesture` so first play runs after a click.
 */
export function initBackgroundMusic(): void {
  if (menuAudio || roundAudio) return

  menuAudio = new Audio()
  menuAudio.loop = false
  menuAudio.preload = 'auto'
  menuIndex = Math.floor(Math.random() * MENU_TRACKS.length)
  menuAudio.src = MENU_TRACKS[menuIndex]!
  applyMenuVolume()
  menuAudio.addEventListener('ended', onMenuEnded)

  roundAudio = new Audio()
  roundAudio.loop = true
  roundAudio.preload = 'auto'
  roundAudio.src = ROUND_TRACK_URL
  applyRoundVolume()

  const tick = (): void => {
    applyMenuVolume()
    applyRoundVolume()
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** After the first user gesture, allow menu/round playback (round plays once a match starts). */
export function tryStartOnUserGesture(): void {
  if (!menuAudio || !roundAudio) return
  if (!audioUnlocked) {
    audioUnlocked = true
    void menuAudio.play().catch(() => {
      audioUnlocked = false
    })
  }
  syncPlaybackState()
}

let gestureWired = false
export function wireBackgroundMusicToFirstGesture(): void {
  if (gestureWired) return
  gestureWired = true
  const go = (): void => {
    tryStartOnUserGesture()
    document.removeEventListener('pointerdown', go, true)
    document.removeEventListener('click', go, true)
  }
  document.addEventListener('pointerdown', go, true)
  document.addEventListener('click', go, true)
}
