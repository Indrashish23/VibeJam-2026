import { gameConfig } from './gameConfig'
import {
  getBgmMul,
  getCameraShakeMul,
  getMasterSfxMul,
  getMasterVolumeMul,
  getVoicePlaybackMul,
  loadUserSettings,
  saveUserSettings,
  setBgmMul,
  setCameraShakeMul,
  setMasterSfxMul,
  setMasterVolumeMul,
  setVoicePlaybackMul,
} from './userSettingsStorage'
import { tryStartOnUserGesture } from './audio/backgroundMusic'

type ControlsLike = { unlock: () => void }

const SETTING_KEYS = [
  'mouse',
  'fov',
  'shake',
  'master',
  'bgm',
  'sfx',
  'voice',
] as const
type SettingKey = (typeof SETTING_KEYS)[number]

let controlsForUnlock: ControlsLike | null = null
export function setUserSettingsPointerControls(c: ControlsLike | null): void {
  controlsForUnlock = c
}

function qSetting(key: SettingKey): NodeListOf<HTMLInputElement> {
  return document.querySelectorAll(`[data-user-setting="${key}"]`)
}

function readFromState(): void {
  loadUserSettings()
  syncKeyValue('mouse', String(gameConfig.mouseSensitivity))
  syncKeyValue('fov', String(gameConfig.cameraFov))
  syncKeyValue('shake', String(getCameraShakeMul()))
  syncKeyValue('master', String(getMasterVolumeMul()))
  syncKeyValue('bgm', String(getBgmMul()))
  syncKeyValue('sfx', String(getMasterSfxMul()))
  syncKeyValue('voice', String(getVoicePlaybackMul()))
}

function syncKeyValue(key: SettingKey, value: string, skipEl?: HTMLInputElement): void {
  qSetting(key).forEach((el) => {
    if (el !== skipEl) el.value = value
  })
}

/** 0..1 sliders — must allow 0 (mute); `v || 1` wrongly turns 0 into 1. */
function parseUnitInterval(raw: string, fallback: number): number {
  const v = parseFloat(raw)
  if (!Number.isFinite(v)) return fallback
  return Math.max(0, Math.min(1, v))
}

function applyKey(key: SettingKey, raw: string): void {
  switch (key) {
    case 'mouse': {
      const v = parseFloat(raw)
      gameConfig.mouseSensitivity = Number.isFinite(v)
        ? Math.max(0.01, Math.min(8, v))
        : 1
      break
    }
    case 'fov': {
      const v = parseFloat(raw)
      gameConfig.cameraFov = Number.isFinite(v)
        ? Math.max(20, Math.min(120, v))
        : gameConfig.cameraFov
      break
    }
    case 'shake': {
      const v = parseFloat(raw)
      setCameraShakeMul(Number.isFinite(v) ? v : 1)
      break
    }
    case 'master':
      setMasterVolumeMul(parseUnitInterval(raw, 1))
      break
    case 'bgm':
      setBgmMul(parseUnitInterval(raw, 1))
      break
    case 'sfx':
      setMasterSfxMul(parseUnitInterval(raw, 1))
      break
    case 'voice':
      setVoicePlaybackMul(parseUnitInterval(raw, 1))
      break
    default:
      break
  }
}

let settingInputsBound = false

function bindSettingInputsOnce(): void {
  if (settingInputsBound) return
  settingInputsBound = true
  SETTING_KEYS.forEach((key) => {
    qSetting(key).forEach((el) => {
      const onAdjust = (): void => {
        applyKey(key, el.value)
        syncKeyValue(key, el.value, el)
        saveUserSettings()
      }
      el.addEventListener('input', onAdjust)
      /* Range sliders: some environments only fire `change` on release. */
      el.addEventListener('change', onAdjust)
    })
  })
}

export function mountUserSettingsPanel(opts: { root: HTMLElement }): { open: boolean } {
  const { root } = opts
  const state = { open: false }
  const btn = root.querySelector('#user-settings-btn') as HTMLButtonElement | null
  const panel = root.querySelector('#user-settings-panel') as HTMLDivElement | null
  const back = root.querySelector('#user-settings-backdrop') as HTMLDivElement | null
  const closeBtn = root.querySelector('#user-settings-close') as HTMLButtonElement | null
  if (!btn || !panel) return state

  const pan = panel

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
      /* Persist latest DOM → storage */
      SETTING_KEYS.forEach((key) => {
        const first = qSetting(key)[0]
        if (first) applyKey(key, first.value)
      })
      saveUserSettings()
    }
  }

  readFromState()
  bindSettingInputsOnce()

  btn.setAttribute('aria-haspopup', 'true')
  btn.setAttribute('aria-controls', 'user-settings-panel')
  pan.setAttribute('role', 'dialog')
  pan.setAttribute('aria-label', 'Settings')
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

export function mountLobbySettingsShell(): void {
  const overlayEl = document.getElementById('lobby-overlay')
  const openBtnEl = document.getElementById('lobby-settings-open') as HTMLButtonElement | null
  const closeBtn = document.getElementById('lobby-settings-close') as HTMLButtonElement | null
  const asideEl = document.getElementById('lobby-settings-aside') as HTMLElement | null
  if (!overlayEl || !openBtnEl || !asideEl) return

  const lobbyOverlay = overlayEl
  const lobbyAside = asideEl
  const lobbyOpenBtn = openBtnEl

  let lobbySettingsOpen = false

  function setLobbySettingsOpen(v: boolean): void {
    lobbySettingsOpen = v
    lobbyOverlay.classList.toggle('lobby-overlay--settings-open', v)
    lobbyAside.toggleAttribute('hidden', !v)
    lobbyAside.setAttribute('aria-hidden', v ? 'false' : 'true')
    lobbyOpenBtn.setAttribute('aria-expanded', v ? 'true' : 'false')
    if (v) {
      readFromState()
      tryStartOnUserGesture()
    } else {
      SETTING_KEYS.forEach((key) => {
        const first = qSetting(key)[0]
        if (first) applyKey(key, first.value)
      })
      saveUserSettings()
    }
  }

  readFromState()
  bindSettingInputsOnce()

  lobbyOpenBtn.setAttribute('aria-controls', 'lobby-settings-aside')
  lobbyOpenBtn.setAttribute('aria-expanded', 'false')
  lobbyOpenBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    setLobbySettingsOpen(true)
  })
  closeBtn?.addEventListener('click', () => setLobbySettingsOpen(false))

  window.addEventListener(
    'keydown',
    (ev) => {
      if (!lobbySettingsOpen) return
      if (ev.code === 'Escape') {
        ev.stopPropagation()
        setLobbySettingsOpen(false)
      }
    },
    true,
  )
}
