import { readStoredPlayerName, savePlayerName } from './playerName'
import { loadUserSettings } from './userSettingsStorage'
import { isMultiplayerTransportConfigured } from './net/transportConfig'
import { PublicLobbyDirectoryClient, type PublicLobbyListing } from './net/publicLobbyDirectory'
import { isMapId, MAP_DEFS, type MapId } from './maps'
import { clearTutorialDone, TUTORIAL_ENABLED } from './tutorial'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { mountLobbyBackdrop } from './lobbyBackdrop'
import { mountTweaksPanel } from './tweaksPanel'

function randomRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `vj-${s}`
}

const MAP_STORAGE_KEY = 'vibejam_lobby_map'

function readStoredMapId(): MapId {
  try {
    const raw = sessionStorage.getItem(MAP_STORAGE_KEY)
    if (raw && isMapId(raw)) return raw
  } catch {
    /* sessionStorage may be blocked; fall through. */
  }
  return 'default'
}

function saveStoredMapId(id: MapId): void {
  try {
    sessionStorage.setItem(MAP_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export type LobbyResult =
  | { mode: 'offline'; mapId: MapId }
  | {
      mode: 'online'
      role: 'host' | 'guest'
      roomId: string
      shortCode: string
      mapId: MapId
      startWithDummyPractice?: boolean
      startWithSmartBot?: boolean
      /** `public` = listed in the browser room list; `private` = join by code only. */
      lobbyVisibility?: 'public' | 'private'
      /** Guest joining from the public browser: host display name from the listing (until hello overwrites HUD). */
      listingHostName?: string
    }

function wireLobbyDom(): {
  overlay: HTMLDivElement
  intro: HTMLElement
  err: HTMLElement
  create: HTMLButtonElement
  practice: HTMLButtonElement
  soloBot: HTMLButtonElement
  joinCode: HTMLInputElement
  joinBtn: HTMLButtonElement
  offline: HTMLButtonElement
  replayTutorial: HTMLButtonElement | null
  changeName: HTMLButtonElement
  visPrivate: HTMLInputElement
  visPublic: HTMLInputElement
  browserSection: HTMLDivElement
  browserList: HTMLUListElement
  browserRefresh: HTMLButtonElement
  browserHint: HTMLElement
  mapSelect: HTMLSelectElement
} {
  return {
    overlay: document.getElementById('lobby-overlay') as HTMLDivElement,
    intro: document.getElementById('lobby-intro') as HTMLElement,
    err: document.getElementById('lobby-error') as HTMLElement,
    create: document.getElementById('lobby-create') as HTMLButtonElement,
    practice: document.getElementById('lobby-practice') as HTMLButtonElement,
    soloBot: document.getElementById('lobby-solo-bot') as HTMLButtonElement,
    joinCode: document.getElementById('lobby-join-code') as HTMLInputElement,
    joinBtn: document.getElementById('lobby-join') as HTMLButtonElement,
    offline: document.getElementById('lobby-offline') as HTMLButtonElement,
    replayTutorial: document.getElementById('lobby-replay-tutorial') as HTMLButtonElement | null,
    changeName: document.getElementById('lobby-change-name') as HTMLButtonElement,
    visPrivate: document.getElementById('lobby-vis-private') as HTMLInputElement,
    visPublic: document.getElementById('lobby-vis-public') as HTMLInputElement,
    browserSection: document.getElementById('lobby-browser-section') as HTMLDivElement,
    browserList: document.getElementById('lobby-browser-list') as HTMLUListElement,
    browserRefresh: document.getElementById('lobby-browser-refresh') as HTMLButtonElement,
    browserHint: document.getElementById('lobby-browser-hint') as HTMLElement,
    mapSelect: document.getElementById('lobby-map') as HTMLSelectElement,
  }
}

function selectedMapId(ui: ReturnType<typeof wireLobbyDom>): MapId {
  const v = ui.mapSelect?.value
  return isMapId(v) ? v : 'default'
}

function selectedLobbyVisibility(ui: ReturnType<typeof wireLobbyDom>): 'public' | 'private' {
  return ui.visPublic.checked ? 'public' : 'private'
}

/**
 * Display name gate, then pick offline or online (code share / join / public browser).
 * Realtime connection is established in-game; no infra details here.
 */
export async function runLobbyGate(initialDisplayName: string): Promise<LobbyResult> {
  const gameRoot = document.getElementById('game-root') as HTMLDivElement
  gameRoot.hidden = false
  gameRoot.classList.add('game-root--lobby')

  const backdrop = await mountLobbyBackdrop(gameRoot)

  const tweaksHost = document.getElementById('tweaks-panel-host')
  let disposeLobbyTweaks: (() => void) | null = null
  if (tweaksHost) {
    const controls = new PointerLockControls(backdrop.camera, gameRoot)
    const mounted = mountTweaksPanel(tweaksHost, {
      controls,
      camera: backdrop.camera,
      ambient: backdrop.ambient,
      sun: backdrop.sun,
      keysThatSkipRoundReset: [
        'lobbyMonkeyPosX',
        'lobbyMonkeyPosY',
        'lobbyMonkeyPosZ',
        'lobbyMonkeyPitchDeg',
        'lobbyMonkeyYawDeg',
        'lobbyMonkeyRollDeg',
        'lobbyMonkeyScale',
      ],
      syncVisualsFromConfig: () => {
        backdrop.syncLobbyMonkeyFromConfig()
      },
      onToggle: () => {},
    })
    disposeLobbyTweaks = () => mounted.dispose()
  }

  const ui = wireLobbyDom()
  let displayName = initialDisplayName

  return await new Promise<LobbyResult>((resolve) => {
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
      disposeLobbyTweaks?.()
      disposeLobbyTweaks = null
      tweaksHost?.replaceChildren()
      backdrop.dispose()
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
            listingHostName: row.hostName,
            mapId: selectedMapId(ui),
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

    if (ui.mapSelect) {
      /* Repopulate options so the map registry is the single source of truth. */
      if (ui.mapSelect.options.length !== MAP_DEFS.length) {
        ui.mapSelect.replaceChildren()
        for (const def of MAP_DEFS) {
          const opt = document.createElement('option')
          opt.value = def.id
          opt.textContent = def.label
          ui.mapSelect.appendChild(opt)
        }
      }
      ui.mapSelect.value = readStoredMapId()
      ui.mapSelect.addEventListener('change', () => {
        saveStoredMapId(selectedMapId(ui))
      })
    }

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
        loadUserSettings()
        displayName = name
        userOv.hidden = true
        ui.overlay.hidden = false
        ui.intro.textContent = `Signed in as ${displayName}. Host a public match (listed for anyone), a private code lobby, join a friend’s code, or play offline.`
      }
      form.addEventListener('submit', onSubmit, { once: true })
    }

    ui.offline.onclick = () => {
      clearErr()
      finish({ mode: 'offline', mapId: selectedMapId(ui) })
    }

    if (ui.replayTutorial) {
      if (!TUTORIAL_ENABLED) {
        ui.replayTutorial.hidden = true
      } else {
        ui.replayTutorial.onclick = () => {
          clearErr()
          clearTutorialDone()
          /* Force default map so the tutorial runs in the stage it was authored for. */
          finish({ mode: 'offline', mapId: 'default' })
        }
      }
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
        mapId: selectedMapId(ui),
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
        mapId: selectedMapId(ui),
      })
    }

    ui.soloBot.onclick = () => {
      clearErr()
      if (onlineUnavailable()) {
        setErr('Solo vs Bot needs online lobby transport configured.')
        return
      }
      const roomId = randomRoomId()
      const shortCode = roomId.replace(/^vj-/, '')
      finish({
        mode: 'online',
        role: 'host',
        roomId,
        shortCode,
        startWithSmartBot: true,
        lobbyVisibility: 'private',
        mapId: selectedMapId(ui),
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
        mapId: selectedMapId(ui),
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


