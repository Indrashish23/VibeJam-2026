import { gameConfig } from './gameConfig'
import { readStoredPlayerName } from './playerName'

const PREFIX = 'vibejam_user_prefs__'

function slugName(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (!t) return 'default'
  return t.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'default'
}

export function getSettingsKeyForPlayer(): string {
  const n = readStoredPlayerName()
  return `${PREFIX}${slugName(n ?? 'default')}`
}

export type UserSettingsPersisted = {
  mouseSensitivity: number
  voiceChargeSensitivity: number
  cameraShakeMul: number
  /** 0..1. Multiplies dev Tweaks BGM. */
  bgmMul: number
  masterSfxMul: number
}

let cameraShakeMul = 1
let bgmMul = 1
let masterSfxMul = 1

export function getCameraShakeMul(): number {
  return cameraShakeMul
}

export function getMasterSfxMul(): number {
  return masterSfxMul
}

export function getBgmMul(): number {
  return bgmMul
}

export function setCameraShakeMul(v: number): void {
  cameraShakeMul = Math.max(0, Math.min(1.5, v))
}

export function setMasterSfxMul(v: number): void {
  masterSfxMul = Math.max(0, Math.min(1, v))
}

export function setBgmMul(v: number): void {
  bgmMul = Math.max(0, Math.min(1, v))
}

/** Load from localStorage for current display name; merges into `gameConfig` for mouse + mic. */
export function loadUserSettings(): void {
  cameraShakeMul = 1
  bgmMul = 1
  masterSfxMul = 1
  const key = getSettingsKeyForPlayer()
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return
  }
  if (!raw) return
  let j: Partial<UserSettingsPersisted>
  try {
    j = JSON.parse(raw) as Partial<UserSettingsPersisted>
  } catch {
    return
  }
  if (typeof j.mouseSensitivity === 'number') {
    gameConfig.mouseSensitivity = j.mouseSensitivity
  }
  if (typeof j.voiceChargeSensitivity === 'number') {
    gameConfig.voiceChargeSensitivity = j.voiceChargeSensitivity
  }
  if (typeof j.cameraShakeMul === 'number') {
    setCameraShakeMul(j.cameraShakeMul)
  }
  if (typeof j.masterSfxMul === 'number') {
    setMasterSfxMul(j.masterSfxMul)
  }
  if (typeof j.bgmMul === 'number') {
    setBgmMul(j.bgmMul)
  }
}

export function saveUserSettings(): void {
  const p: UserSettingsPersisted = {
    mouseSensitivity: gameConfig.mouseSensitivity,
    voiceChargeSensitivity: gameConfig.voiceChargeSensitivity,
    cameraShakeMul,
    bgmMul,
    masterSfxMul,
  }
  try {
    localStorage.setItem(getSettingsKeyForPlayer(), JSON.stringify(p))
  } catch {
    /* quota */
  }
}
