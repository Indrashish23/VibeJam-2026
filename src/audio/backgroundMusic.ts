import { gameConfig } from '../gameConfig'

const TRACKS = [
  new URL(
    '../../Assets/Music/The Dark Bean - imboredbutidontreallywantodoanything (breakcore).mp3',
    import.meta.url,
  ).href,
  new URL(
    '../../Assets/Music/The Dark Bean - wizen_says_this_sounds_like_persona_3_a_little_bit.mp3.mp3',
    import.meta.url,
  ).href,
] as const

let audio: HTMLAudioElement | null = null
let currentIndex = 0
let started = false

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function applyVolumeFromConfig(): void {
  if (!audio) return
  audio.volume = clamp01(gameConfig.bgmVolume)
}

function pickNextIndex(): void {
  if (TRACKS.length < 2) return
  let n = currentIndex
  while (n === currentIndex) {
    n = Math.floor(Math.random() * TRACKS.length)
  }
  currentIndex = n
}

function loadAndPlayNext(): void {
  if (!audio) return
  pickNextIndex()
  audio.src = TRACKS[currentIndex]!
  audio.load()
  void audio.play().catch(() => {
    /* autoplay blocked until gesture */
  })
}

function onEnded(): void {
  loadAndPlayNext()
}

/**
 * One-time: create element, wire shuffle, start rAF to mirror `gameConfig.bgmVolume`.
 * Call `tryStartOnUserGesture` so first play runs after a click.
 */
export function initBackgroundMusic(): void {
  if (audio) return
  audio = new Audio()
  audio.loop = false
  audio.preload = 'auto'
  currentIndex = Math.floor(Math.random() * TRACKS.length)
  audio.src = TRACKS[currentIndex]!
  applyVolumeFromConfig()
  audio.addEventListener('ended', onEnded)

  const tick = (): void => {
    applyVolumeFromConfig()
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** After the first user gesture, start playback if not already. */
export function tryStartOnUserGesture(): void {
  if (started) return
  if (!audio) return
  started = true
  void audio.play().catch(() => {
    started = false
  })
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
