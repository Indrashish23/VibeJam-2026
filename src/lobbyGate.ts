import { readStoredPlayerName, savePlayerName } from './playerName'
import { isMultiplayerTransportConfigured } from './net/transportConfig'
import { PublicLobbyDirectoryClient, type PublicLobbyListing } from './net/publicLobbyDirectory'

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
  | {
      mode: 'online'
      role: 'host' | 'guest'
      roomId: string
      shortCode: string
      startWithDummyPractice?: boolean
      /** `public` = listed in the browser room list; `private` = join by code only. */
      lobbyVisibility?: 'public' | 'private'
    }

function wireLobbyDom(): {
  overlay: HTMLDivElement
  intro: HTMLElement
  err: HTMLElement
  create: HTMLButtonElement
  practice: HTMLButtonElement
  joinCode: HTMLInputElement
  joinBtn: HTMLButtonElement
  offline: HTMLButtonElement
  changeName: HTMLButtonElement
  visPrivate: HTMLInputElement
  visPublic: HTMLInputElement
  browserSection: HTMLDivElement
  browserList: HTMLUListElement
  browserRefresh: HTMLButtonElement
  browserHint: HTMLElement
} {
  return {
    overlay: document.getElementById('lobby-overlay') as HTMLDivElement,
    intro: document.getElementById('lobby-intro') as HTMLElement,
    err: document.getElementById('lobby-error') as HTMLElement,
    create: document.getElementById('lobby-create') as HTMLButtonElement,
    practice: document.getElementById('lobby-practice') as HTMLButtonElement,
    joinCode: document.getElementById('lobby-join-code') as HTMLInputElement,
    joinBtn: document.getElementById('lobby-join') as HTMLButtonElement,
    offline: document.getElementById('lobby-offline') as HTMLButtonElement,
    changeName: document.getElementById('lobby-change-name') as HTMLButtonElement,
    visPrivate: document.getElementById('lobby-vis-private') as HTMLInputElement,
    visPublic: document.getElementById('lobby-vis-public') as HTMLInputElement,
    browserSection: document.getElementById('lobby-browser-section') as HTMLDivElement,
    browserList: document.getElementById('lobby-browser-list') as HTMLUListElement,
    browserRefresh: document.getElementById('lobby-browser-refresh') as HTMLButtonElement,
    browserHint: document.getElementById('lobby-browser-hint') as HTMLElement,
  }
}

function selectedLobbyVisibility(ui: ReturnType<typeof wireLobbyDom>): 'public' | 'private' {
  return ui.visPublic.checked ? 'public' : 'private'
}

/**
 * Display name gate, then pick offline or online (code share / join / public browser).
 * Realtime connection is established in-game; no infra details here.
 */
export function runLobbyGate(initialDisplayName: string): Promise<LobbyResult> {
  const ui = wireLobbyDom()
  let displayName = initialDisplayName

  return new Promise((resolve) => {
    const onlineUnavailable = (): boolean => !isMultiplayerTransportConfigured()

    let browserClient: PublicLobbyDirectoryClient | null = null
    let browserPruneTimer: ReturnType<typeof setInterval> | null = null

    function stopBrowserClient(): void {
      if (browserPruneTimer !== null) {
        window.clearInterval(browserPruneTimer)
        browserPruneTimer = null
      }
      if (browserClient) {
        browserClient.disconnect()
        browserClient = null
      }
    }

    let settled = false
    const finish = (result: LobbyResult) => {
      if (settled) return
      settled = true
      stopBrowserClient()
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

    function renderBrowserList(list: PublicLobbyListing[]): void {
      ui.browserList.replaceChildren()
      if (list.length === 0) {
        const li = document.createElement('li')
        li.className = 'lobby-browser-empty'
        li.textContent = 'No public lobbies right now. Try Refresh or host one as Public.'
        ui.browserList.appendChild(li)
        return
      }
      for (const row of list) {
        const li = document.createElement('li')
        li.className = 'lobby-browser-row'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'lobby-browser-join'
        btn.textContent = `Join ${row.hostName} (${row.shortCode})`
        btn.title = `Join room ${row.roomId}`
        btn.addEventListener('click', () => {
          clearErr()
          stopBrowserClient()
          finish({
            mode: 'online',
            role: 'guest',
            roomId: row.roomId,
            shortCode: row.shortCode,
          })
        })
        li.appendChild(btn)
        ui.browserList.appendChild(li)
      }
    }

    function startBrowserClient(): void {
      stopBrowserClient()
      if (!isMultiplayerTransportConfigured()) return
      const client = new PublicLobbyDirectoryClient((list) => renderBrowserList(list))
      browserClient = client
      client.connect()
      browserPruneTimer = window.setInterval(() => {
        browserClient?.pruneStaleNow()
      }, 3000)
    }

    ui.overlay.hidden = false
    ui.intro.textContent = `Signed in as ${displayName}. Host a public match (listed for anyone), a private code lobby, join a friend’s code, or play offline.`
    ui.err.hidden = true
    ui.err.textContent = ''
    ui.visPublic.checked = true

    if (!onlineUnavailable()) {
      queueMicrotask(() => startBrowserClient())
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
        ui.intro.textContent = `Signed in as ${displayName}. Host a public match (listed for anyone), a private code lobby, join a friend’s code, or play offline.`
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
      finish({
        mode: 'online',
        role: 'host',
        roomId,
        shortCode,
        lobbyVisibility: selectedLobbyVisibility(ui),
      })
    }

    ui.practice.onclick = () => {
      clearErr()
      if (onlineUnavailable()) {
        setErr('Practice with Dummy needs online lobby transport configured.')
        return
      }
      const roomId = randomRoomId()
      const shortCode = roomId.replace(/^vj-/, '')
      finish({
        mode: 'online',
        role: 'host',
        roomId,
        shortCode,
        startWithDummyPractice: true,
        lobbyVisibility: 'private',
      })
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
      finish({
        mode: 'online',
        role: 'guest',
        roomId,
        shortCode,
        lobbyVisibility: 'private',
      })
    }

    ui.browserRefresh.onclick = () => {
      clearErr()
      if (onlineUnavailable()) {
        setErr('Online play isn’t available right now.')
        return
      }
      startBrowserClient()
    }
  })
}

