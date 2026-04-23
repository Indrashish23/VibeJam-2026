import { readStoredPlayerName, savePlayerName } from './playerName'
import { isMultiplayerTransportConfigured } from './net/transportConfig'

function randomRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `vj-${s}`
}

export type LobbyResult =
  | { mode: 'offline' }
  | { mode: 'online'; role: 'host' | 'guest'; roomId: string; shortCode: string }

function wireLobbyDom(): {
  overlay: HTMLDivElement
  intro: HTMLElement
  err: HTMLElement
  create: HTMLButtonElement
  joinCode: HTMLInputElement
  joinBtn: HTMLButtonElement
  offline: HTMLButtonElement
  changeName: HTMLButtonElement
} {
  return {
    overlay: document.getElementById('lobby-overlay') as HTMLDivElement,
    intro: document.getElementById('lobby-intro') as HTMLElement,
    err: document.getElementById('lobby-error') as HTMLElement,
    create: document.getElementById('lobby-create') as HTMLButtonElement,
    joinCode: document.getElementById('lobby-join-code') as HTMLInputElement,
    joinBtn: document.getElementById('lobby-join') as HTMLButtonElement,
    offline: document.getElementById('lobby-offline') as HTMLButtonElement,
    changeName: document.getElementById('lobby-change-name') as HTMLButtonElement,
  }
}

/**
 * Display name gate, then pick offline or online (code share / join).
 * Realtime connection is established in-game; no infra details here.
 */
export function runLobbyGate(initialDisplayName: string): Promise<LobbyResult> {
  const ui = wireLobbyDom()
  let displayName = initialDisplayName

  ui.overlay.hidden = false
  ui.intro.textContent = `Signed in as ${displayName}. Create a lobby and share your code, join a friend with theirs, or play offline.`
  ui.err.hidden = true
  ui.err.textContent = ''

  return new Promise((resolve) => {
    const onlineUnavailable = (): boolean => !isMultiplayerTransportConfigured()

    const finish = (result: LobbyResult) => {
      ui.overlay.hidden = true
      resolve(result)
    }

    const setErr = (msg: string) => {
      ui.err.textContent = msg
      ui.err.hidden = false
    }

    const clearErr = () => {
      ui.err.hidden = true
      ui.err.textContent = ''
    }

    ui.changeName.onclick = () => {
      clearErr()
      const userOv = document.getElementById('username-overlay') as HTMLDivElement
      const gameRoot = document.getElementById('game-root') as HTMLDivElement
      ui.overlay.hidden = true
      gameRoot.hidden = true
      userOv.hidden = false
      const input = document.getElementById('username-input') as HTMLInputElement
      input.value = readStoredPlayerName() ?? displayName
      input.focus()

      const form = document.getElementById('username-form') as HTMLFormElement
      const onSubmit = (e: Event) => {
        e.preventDefault()
        const name = input.value.trim() || 'Angler'
        savePlayerName(name)
        displayName = name
        userOv.hidden = true
        ui.overlay.hidden = false
        ui.intro.textContent = `Signed in as ${displayName}. Create a lobby and share your code, join a friend with theirs, or play offline.`
      }
      form.addEventListener('submit', onSubmit, { once: true })
    }

    ui.offline.onclick = () => {
      clearErr()
      finish({ mode: 'offline' })
    }

    ui.create.onclick = () => {
      clearErr()
      if (onlineUnavailable()) {
        setErr('Online play isn’t available right now. Try Play offline, or try again later.')
        return
      }
      const roomId = randomRoomId()
      const shortCode = roomId.replace(/^vj-/, '')
      finish({ mode: 'online', role: 'host', roomId, shortCode })
    }

    ui.joinBtn.onclick = () => {
      clearErr()
      if (onlineUnavailable()) {
        setErr('Online play isn’t available right now. Try Play offline.')
        return
      }
      const raw = ui.joinCode.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      if (raw.length < 4) {
        setErr('Enter a lobby code (at least 4 characters).')
        return
      }
      const roomId = raw.startsWith('vj-') ? raw : `vj-${raw}`
      const shortCode = roomId.replace(/^vj-/, '')
      finish({ mode: 'online', role: 'guest', roomId, shortCode })
    }
  })
}
