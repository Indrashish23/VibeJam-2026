import { readStoredPlayerName, savePlayerName } from './playerName'
import { loadUserSettings } from './userSettingsStorage'
import { isMultiplayerTransportConfigured } from './net/transportConfig'
import { isMapId, MAP_DEFS, type MapId } from './maps'
import { clearTutorialDone, TUTORIAL_ENABLED } from './tutorial'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { gameConfig } from './gameConfig'
import { mountLobbyBackdrop } from './lobbyBackdrop'
import { mountTweaksPanel } from './tweaksPanel'
import {
  QUICK_MATCH_TIMEOUT_MS,
  runQuickMatchQueue,
  type QuickMatchResult,
} from './net/quickMatchQueue'
import { getCoarseRegion } from './net/regionTag'

export function randomRoomId(): string {
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

/**
 * `intent` distinguishes how the match was launched so in-match flows can branch
 * (e.g. private host gets the room code banner, vsBot/practice spawn an AI peer).
 */
export type MatchIntent = 'quickMatch' | 'private' | 'practice' | 'vsBot'

export type LobbyResult =
  | { mode: 'offline'; mapId: MapId }
  | {
      mode: 'online'
      role: 'host' | 'guest'
      roomId: string
      shortCode: string
      mapId: MapId
      intent: MatchIntent
      startWithDummyPractice?: boolean
      startWithSmartBot?: boolean
    }

function wireLobbyDom(): {
  overlay: HTMLDivElement
  intro: HTMLElement
  err: HTMLElement
  quickMatch: HTMLButtonElement
  hostPrivate: HTMLButtonElement
  practice: HTMLButtonElement
  vsBot: HTMLButtonElement
  joinCode: HTMLInputElement
  joinBtn: HTMLButtonElement
  replayTutorial: HTMLButtonElement | null
  changeName: HTMLButtonElement
  mapSelect: HTMLSelectElement
} {
  return {
    overlay: document.getElementById('lobby-overlay') as HTMLDivElement,
    intro: document.getElementById('lobby-intro') as HTMLElement,
    err: document.getElementById('lobby-error') as HTMLElement,
    quickMatch: document.getElementById('lobby-quick-match') as HTMLButtonElement,
    hostPrivate: document.getElementById('lobby-host-private') as HTMLButtonElement,
    practice: document.getElementById('lobby-practice') as HTMLButtonElement,
    vsBot: document.getElementById('lobby-vs-bot') as HTMLButtonElement,
    joinCode: document.getElementById('lobby-join-code') as HTMLInputElement,
    joinBtn: document.getElementById('lobby-join') as HTMLButtonElement,
    replayTutorial: document.getElementById('lobby-replay-tutorial') as HTMLButtonElement | null,
    changeName: document.getElementById('lobby-change-name') as HTMLButtonElement,
    mapSelect: document.getElementById('lobby-map') as HTMLSelectElement,
  }
}

function wireQueueDom(): {
  overlay: HTMLDivElement | null
  timer: HTMLElement | null
  cancel: HTMLButtonElement | null
  title: HTMLElement | null
  sub: HTMLElement | null
} {
  return {
    overlay: document.getElementById('queue-overlay') as HTMLDivElement | null,
    timer: document.getElementById('queue-timer-value'),
    cancel: document.getElementById('queue-cancel-btn') as HTMLButtonElement | null,
    title: document.getElementById('queue-title'),
    sub: document.querySelector('#queue-overlay .queue-sub'),
  }
}

function selectedMapId(ui: ReturnType<typeof wireLobbyDom>): MapId {
  const v = ui.mapSelect?.value
  return isMapId(v) ? v : 'default'
}

function formatTimerMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Display name gate, then pick Quick Match / Host Private / Join via Code / Practice / Vs Bot.
 * Realtime connection is established in-game; no infra details here.
 */
export async function runLobbyGate(initialDisplayName: string): Promise<LobbyResult> {
  const curtain = document.getElementById('lobby-boot-curtain') as HTMLDivElement | null
  curtain?.removeAttribute('hidden')
  curtain?.setAttribute('aria-hidden', 'false')

  const gameRoot = document.getElementById('game-root') as HTMLDivElement
  gameRoot.hidden = false
  gameRoot.classList.add('game-root--lobby')
  gameRoot.classList.add('game-root--hud-suspended')

  let backdrop: Awaited<ReturnType<typeof mountLobbyBackdrop>>
  try {
    backdrop = await mountLobbyBackdrop(gameRoot)
  } catch (err) {
    curtain?.setAttribute('hidden', '')
    curtain?.setAttribute('aria-hidden', 'true')
    throw err
  }

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
        'hideLobbyUi',
        'lobbyMonkeyFlatShading',
        'lobbyMonkeyTexPixelated',
        'lobbyMonkeyTexDownscale',
        'lightingUnlitMode',
        'skyboxColorR',
        'skyboxColorG',
        'skyboxColorB',
        'skyCloudCoverage',
        'skyCloudSoftness',
        'skyCloudScale',
        'skyCloudSpeed',
        'skyCloudOpacity',
        'ambientIntensity',
        'sunIntensity',
        'sunPosX',
        'sunPosY',
        'sunPosZ',
        'lobbyMonkeyPosX',
        'lobbyMonkeyPosY',
        'lobbyMonkeyPosZ',
        'lobbyMonkeyPitchDeg',
        'lobbyMonkeyYawDeg',
        'lobbyMonkeyRollDeg',
        'lobbyMonkeyScale',
      ],
      syncVisualsFromConfig: () => {
        backdrop.syncLobbyBackdropFromConfig()
        document.body.classList.toggle('hide-lobby-html-ui', gameConfig.hideLobbyUi >= 0.5)
      },
      onToggle: () => {},
    })
    disposeLobbyTweaks = () => mounted.dispose()
  }

  const ui = wireLobbyDom()
  const queueUi = wireQueueDom()
  let displayName = initialDisplayName

  return await new Promise<LobbyResult>((resolve) => {
    const onlineUnavailable = (): boolean => !isMultiplayerTransportConfigured()

    let settled = false
    let queueAbort: (() => void) | null = null
    let queueTimerHandle: ReturnType<typeof setInterval> | null = null

    const stopQueue = (): void => {
      if (queueTimerHandle !== null) {
        window.clearInterval(queueTimerHandle)
        queueTimerHandle = null
      }
      const ab = queueAbort
      queueAbort = null
      if (ab) {
        try {
          ab()
        } catch {
          /* ignore */
        }
      }
      if (queueUi.overlay) queueUi.overlay.hidden = true
    }

    const finish = (result: LobbyResult) => {
      if (settled) return
      settled = true
      stopQueue()
      disposeLobbyTweaks?.()
      disposeLobbyTweaks = null
      tweaksHost?.replaceChildren()
      document.body.classList.remove('hide-lobby-html-ui')
      backdrop.dispose()
      const c = document.getElementById('lobby-boot-curtain') as HTMLDivElement | null
      c?.setAttribute('hidden', '')
      c?.setAttribute('aria-hidden', 'true')
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

    ui.overlay.hidden = false
    /* Reveal menu before removing boot curtain so the canvas never flashes without the card. */
    curtain?.setAttribute('hidden', '')
    curtain?.setAttribute('aria-hidden', 'true')
    ui.intro.textContent = `Signed in as ${displayName}. Quick match for fast PvP, host a private game with a code, or warm up against a bot.`
    ui.err.hidden = true
    ui.err.textContent = ''

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

    ui.changeName.onclick = () => {
      clearErr()
      const userOv = document.getElementById('username-overlay') as HTMLDivElement
      const gameRootEl = document.getElementById('game-root') as HTMLDivElement
      ui.overlay.hidden = true
      gameRootEl.hidden = true
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
        ui.intro.textContent = `Signed in as ${displayName}. Quick match for fast PvP, host a private game with a code, or warm up against a bot.`
      }
      form.addEventListener('submit', onSubmit, { once: true })
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

    function startQuickMatch(): void {
      if (settled) return
      if (onlineUnavailable()) {
        setErr('Online play isn’t available right now. Try Practice or Vs Bot instead.')
        /* AutoStart hid the menu; bring it back so the error and other options are visible. */
        ui.overlay.hidden = false
        return
      }
      const mapId = selectedMapId(ui)
      const playerName = displayName
      ui.overlay.hidden = true
      if (queueUi.overlay) {
        queueUi.overlay.hidden = false
        if (queueUi.title) queueUi.title.textContent = 'Searching for opponent…'
        if (queueUi.sub)
          queueUi.sub.textContent =
            'If no one shows up within 20 seconds you\u2019ll fight a smart bot.'
      }
      /* Free the GPU while the queue overlay covers the backdrop; the new gameplay renderer
       * created after pairing was occasionally landing on a black canvas for the second peer
       * when the lobby renderer kept rendering for the full queue duration. */
      backdrop.pauseRendering()
      const queueStartedAt = Date.now()
      if (queueUi.timer) queueUi.timer.textContent = formatTimerMs(0)
      queueTimerHandle = window.setInterval(() => {
        if (!queueUi.timer) return
        queueUi.timer.textContent = formatTimerMs(Date.now() - queueStartedAt)
      }, 250)

      const onCancel = () => {
        if (settled) return
        stopQueue()
        if (queueUi.cancel) queueUi.cancel.removeEventListener('click', onCancel)
        ui.overlay.hidden = false
        backdrop.resumeRendering()
        clearErr()
      }
      queueUi.cancel?.addEventListener('click', onCancel)

      const region = getCoarseRegion()
      console.info('[quickMatch] starting queue', { region, mapId, playerName })
      const queueHandle = runQuickMatchQueue({
        playerName,
        region,
        timeoutMs: QUICK_MATCH_TIMEOUT_MS,
        onTimeoutPhase: () => {
          if (queueUi.title) queueUi.title.textContent = 'No opponent found'
          if (queueUi.sub)
            queueUi.sub.textContent = 'Spinning up a smart bot match — get ready.'
        },
        onGlobalFallback: () => {
          if (queueUi.sub)
            queueUi.sub.textContent =
              'Expanding search to the global queue — hang tight.'
        },
      })
      queueAbort = () => queueHandle.cancel()

      queueHandle.promise
        .then((result: QuickMatchResult) => {
          if (settled) return
          if (queueUi.cancel) queueUi.cancel.removeEventListener('click', onCancel)
          if (result.outcome === 'paired') {
            finish({
              mode: 'online',
              role: result.role,
              roomId: result.roomId,
              shortCode: result.shortCode,
              mapId,
              intent: 'quickMatch',
            })
            return
          }
          if (result.outcome === 'botFallback') {
            const roomId = randomRoomId()
            const shortCode = roomId.replace(/^vj-/, '')
            finish({
              mode: 'online',
              role: 'host',
              roomId,
              shortCode,
              mapId,
              intent: 'quickMatch',
              startWithSmartBot: true,
            })
            return
          }
          /* cancelled — return to menu without resolving */
          stopQueue()
          ui.overlay.hidden = false
          backdrop.resumeRendering()
        })
        .catch((err: unknown) => {
          console.warn('[quickMatch] queue failed', err)
          stopQueue()
          if (settled) return
          ui.overlay.hidden = false
          backdrop.resumeRendering()
          setErr('Quick match failed to start. Try again, or pick another option.')
        })
    }

    ui.quickMatch.onclick = () => {
      clearErr()
      startQuickMatch()
    }

    ui.hostPrivate.onclick = () => {
      clearErr()
      if (onlineUnavailable()) {
        setErr('Online play isn’t available right now.')
        return
      }
      const roomId = randomRoomId()
      const shortCode = roomId.replace(/^vj-/, '')
      finish({
        mode: 'online',
        role: 'host',
        roomId,
        shortCode,
        intent: 'private',
        mapId: selectedMapId(ui),
      })
    }

    ui.practice.onclick = () => {
      clearErr()
      if (onlineUnavailable()) {
        setErr('Practice needs online lobby transport configured.')
        return
      }
      const roomId = randomRoomId()
      const shortCode = roomId.replace(/^vj-/, '')
      finish({
        mode: 'online',
        role: 'host',
        roomId,
        shortCode,
        intent: 'practice',
        startWithDummyPractice: true,
        mapId: selectedMapId(ui),
      })
    }

    ui.vsBot.onclick = () => {
      clearErr()
      if (onlineUnavailable()) {
        setErr('Vs Bot needs online lobby transport configured.')
        return
      }
      const roomId = randomRoomId()
      const shortCode = roomId.replace(/^vj-/, '')
      finish({
        mode: 'online',
        role: 'host',
        roomId,
        shortCode,
        intent: 'vsBot',
        startWithSmartBot: true,
        mapId: selectedMapId(ui),
      })
    }

    ui.joinBtn.onclick = () => {
      clearErr()
      if (onlineUnavailable()) {
        setErr('Online play isn’t available right now.')
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
        intent: 'private',
        mapId: selectedMapId(ui),
      })
    }
  })
}
