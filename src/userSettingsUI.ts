import { gameConfig } from './gameConfig'
import {
  getCameraShakeMul,
  getMasterSfxMul,
  loadUserSettings,
  saveUserSettings,
  setCameraShakeMul,
  setMasterSfxMul,
} from './userSettingsStorage'
import { tryStartOnUserGesture } from './audio/backgroundMusic'

type ControlsLike = { unlock: () => void }

let controlsForUnlock: ControlsLike | null = null
export function setUserSettingsPointerControls(c: ControlsLike | null): void {
  controlsForUnlock = c
}

export function mountUserSettingsPanel(opts: { root: HTMLElement }): { open: boolean } {
  const { root } = opts
  const state = { open: false }
  const btn = root.querySelector('#user-settings-btn') as HTMLButtonElement | null
  const panel = root.querySelector('#user-settings-panel') as HTMLDivElement | null
  const back = root.querySelector('#user-settings-backdrop') as HTMLDivElement | null
  const closeBtn = root.querySelector('#user-settings-close') as HTMLButtonElement | null
  if (!btn || !panel) return state

  const inMouse = root.querySelector('#user-s-mouse') as HTMLInputElement | null
  const inMic = root.querySelector('#user-s-mic') as HTMLInputElement | null
  const inShake = root.querySelector('#user-s-shake') as HTMLInputElement | null
  const inSfx = root.querySelector('#user-s-sfx') as HTMLInputElement | null
  if (!inMouse || !inMic || !inShake || !inSfx || !panel) return state
  const elMouse = inMouse
  const elMic = inMic
  const elShake = inShake
  const elSfx = inSfx
  const pan = panel

  function readFromState(): void {
    loadUserSettings()
    elMouse.value = String(gameConfig.mouseSensitivity)
    elMic.value = String(gameConfig.voiceChargeSensitivity)
    elShake.value = String(getCameraShakeMul())
    elSfx.value = String(getMasterSfxMul())
  }

  function applyFromControls(): void {
    gameConfig.mouseSensitivity = Math.max(0.01, Math.min(8, parseFloat(elMouse.value) || 1))
    gameConfig.voiceChargeSensitivity = Math.max(0.05, Math.min(4, parseFloat(elMic.value) || 1.85))
    setCameraShakeMul(parseFloat(elShake.value) || 1)
    setMasterSfxMul(parseFloat(elSfx.value) || 1)
  }

  function setOpen(v: boolean): void {
    state.open = v
    pan.classList.toggle('user-settings-panel--open', v)
    pan.toggleAttribute('hidden', !v)
    pan.setAttribute('aria-hidden', v ? 'false' : 'true')
    if (back) {
      back.hidden = !v
    }
    if (v) {
      try {
        controlsForUnlock?.unlock()
      } catch {
        /* ignore */
      }
      readFromState()
      tryStartOnUserGesture()
    } else {
      applyFromControls()
      saveUserSettings()
    }
  }

  readFromState()

  btn.setAttribute('aria-haspopup', 'true')
  btn.setAttribute('aria-controls', 'user-settings-panel')
  pan.setAttribute('role', 'dialog')
  pan.setAttribute('aria-label', 'Settings')
  ;[elMouse, elMic, elShake, elSfx].forEach((el) => {
    el.addEventListener('input', () => {
      applyFromControls()
      saveUserSettings()
    })
  })

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
  })
  closeBtn?.addEventListener('click', () => setOpen(false))
  back?.addEventListener('click', () => setOpen(false))
  window.addEventListener(
    'keydown',
    (ev) => {
      if (!state.open) return
      if (ev.code === 'Escape') {
        ev.stopPropagation()
        setOpen(false)
      }
    },
    true,
  )
  return state
}
