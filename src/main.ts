/**
 * Single entry, static imports only — keeps the production bundle one chunk and fast to parse (Vibe Jam instant-play goal).
 */
import './style.css'
import {
  AmbientLight,
  BoxGeometry,
  Clock,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { gameConfig } from './gameConfig'
import { addArena, isBlastZone } from './arena'
import { BotFighter, type BotMode } from './boxing/bot'
import { PlayerArms } from './boxing/playerArms'
import { VoiceChargeManager } from './audio/voiceCharge'
import { mountTweaksPanel } from './tweaksPanel'
import { runLobbyGate, type LobbyResult } from './lobbyGate'
import { base64ToBlob, blobToBase64 } from './net/blobCodec'
import {
  createMultiplayerSocket,
  type MultiplayerWire,
} from './net/multiplayerSocket'
import { createBrowserHostAuthority } from './net/browserHostAuthority'
import { isAuthoritativeListenServer } from './net/transportConfig'
import {
  createWebRtcGameChannel,
  type WebRtcGameApi,
} from './net/webrtcGame'
import { readStoredPlayerName, savePlayerName } from './playerName'
import { setPartyKitHostSession, getPartyKitHost } from './net/partyKitHost'
import {
  bootstrapMpDebugUrl,
  isMpDebugMode,
  type MpDiagSnapshot,
} from './mpDebugReport'

/** Production without baked host: open once with `?pk=your-deployment.partykit.dev` (stored in session). */
try {
  const params = new URLSearchParams(window.location.search)
  const pk = params.get('pk')?.trim()
  if (pk) {
    setPartyKitHostSession(pk)
    params.delete('pk')
    const qs = params.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    )
  }
} catch {
  /* ignore */
}

bootstrapMpDebugUrl()

const DOWN = new Vector3(0, -1, 0)

const usernameOverlay = document.getElementById('username-overlay') as HTMLDivElement
const usernameForm = document.getElementById('username-form') as HTMLFormElement
const usernameInput = document.getElementById('username-input') as HTMLInputElement
const gameRoot = document.getElementById('game-root') as HTMLDivElement

const scorePEl = document.getElementById('score-p')
const scoreBEl = document.getElementById('score-b')
const hitsNeedEnemyEl = document.getElementById('hits-need-enemy')
const hitsNeedPlayerEl = document.getElementById('hits-need-player')

const matchEndOverlay = document.getElementById('match-end-overlay') as HTMLDivElement | null
const matchEndTitle = document.getElementById('match-end-title')
const matchEndSub = document.getElementById('match-end-sub')
const matchRematchPrimaryActionsEl = document.getElementById(
  'match-rematch-primary-actions',
) as HTMLDivElement | null
const matchRematchBtnEl = document.getElementById('match-rematch-btn') as HTMLButtonElement | null
const matchCloseBtnEl = document.getElementById('match-close-btn') as HTMLButtonElement | null
const matchRematchStatusEl = document.getElementById(
  'match-rematch-status',
) as HTMLParagraphElement | null
const matchRematchCancelBtnEl = document.getElementById(
  'match-rematch-cancel-btn',
) as HTMLButtonElement | null
const matchRematchIncomingEl = document.getElementById(
  'match-rematch-incoming',
) as HTMLDivElement | null
const matchRematchAcceptBtnEl = document.getElementById(
  'match-rematch-accept-btn',
) as HTMLButtonElement | null
const matchRematchDeclineBtnEl = document.getElementById(
  'match-rematch-decline-btn',
) as HTMLButtonElement | null
const hitFlashEl = document.getElementById('hit-flash') as HTMLDivElement | null
const invulnShineEl = document.getElementById('invuln-shine') as HTMLDivElement | null
const winGameSplashEl = document.getElementById('win-game-splash') as HTMLDivElement | null
const rematchSeqLayer = document.getElementById('rematch-sequence') as HTMLDivElement | null
const rematchBlackSheet = document.getElementById('rematch-black-sheet') as HTMLDivElement | null
const countdownOverlay = document.getElementById('countdown-overlay') as HTMLDivElement | null
const countdownNumEl = document.getElementById('countdown-num') as HTMLSpanElement | null
const dashScanEl = document.getElementById('dash-scanlines') as HTMLDivElement | null
const chargeBarWrap = document.getElementById('charge-bar-wrap') as HTMLDivElement | null
const chargeBarFill = document.getElementById('charge-bar-fill') as HTMLDivElement | null
const chargeBarMinMark = document.getElementById('charge-bar-min') as HTMLDivElement | null
const micBlockedOverlay = document.getElementById('mic-blocked-overlay') as HTMLDivElement | null
const micBlockedSubEl = document.getElementById('mic-blocked-sub') as HTMLParagraphElement | null
const countdownTitleEl = document.getElementById('countdown-title') as HTMLParagraphElement | null
const opponentLabelEl = document.getElementById('opponent-label')
const mpWaitLayer = document.getElementById('mp-wait-layer') as HTMLDivElement | null
const mpWaitText = document.getElementById('mp-wait-text') as HTMLParagraphElement | null
const mpCodeHud = document.getElementById('mp-code-hud') as HTMLDivElement | null
const mpCodeValue = document.getElementById('mp-code-value') as HTMLElement | null
const mpCodeCopy = document.getElementById('mp-code-copy') as HTMLButtonElement | null
const mpToast = document.getElementById('mp-toast') as HTMLDivElement | null

const debugMpPanel = document.getElementById('debug-mp-panel') as HTMLDivElement | null
const debugMpPre = document.getElementById('debug-mp-pre') as HTMLPreElement | null
const debugMpCopyBtn = document.getElementById('debug-mp-copy') as HTMLButtonElement | null

const DEBUG_MP = isMpDebugMode()

const debugMpLineBuf: string[] = []
const mpDiagSnapshot: MpDiagSnapshot = {}
const mpDiagCounters = {
  recvAuthDamage: 0,
  recvVoiceShotMsg: 0,
  sendVoiceShotOk: 0,
  voiceShotSendFail: 0,
}

function debugMpLog(msg: string): void {
  if (!DEBUG_MP) return
  const t = (performance.now() / 1000).toFixed(1)
  const line = `+${t}s ${msg}`
  debugMpLineBuf.push(line)
  if (debugMpLineBuf.length > 80) debugMpLineBuf.shift()
  if (debugMpPre) debugMpPre.textContent = debugMpLineBuf.join('\n')
  console.log('[vibejam-mp]', msg)
}

function buildMpDiagnosticReport(): string {
  const blocks = [
    '=== Vibe Jam multiplayer diagnostic ===',
    `time: ${new Date().toISOString()}`,
    `href: ${typeof location !== 'undefined' ? location.href : ''}`,
    typeof navigator !== 'undefined' ? `ua: ${navigator.userAgent}` : '',
    `VITE_PARTYKIT_HOST (baked at build): ${String(import.meta.env.VITE_PARTYKIT_HOST ?? '')}`,
    `getPartyKitHost() runtime: ${String(getPartyKitHost() ?? 'null')}`,
    `isAuthoritativeListenServer: ${String(isAuthoritativeListenServer())}`,
    '',
    '--- snapshot (last frame from game, if in match) ---',
    JSON.stringify(mpDiagSnapshot, null, 2),
    '',
    '--- counters (session) ---',
    JSON.stringify(mpDiagCounters, null, 2),
    '',
    '--- live log ---',
    debugMpLineBuf.join('\n'),
  ]
  return blocks.filter(Boolean).join('\n')
}

/** Prints full snapshot to console (DevTools → copy log text). Same as `vibejamMpReport()`. */
function logMpDiagnosticToConsole(): string {
  const text = buildMpDiagnosticReport()
  console.log(
    '%c[VibeJam MP] full diagnostic (copy block below)',
    'color:#38bdf8;font-weight:bold;font-size:13px',
  )
  console.log(text)
  return text
}

async function copyMpDiagnosticReport(): Promise<void> {
  const text = logMpDiagnosticToConsole()
  try {
    await navigator.clipboard.writeText(text)
    debugMpLog('full report printed above + copied to clipboard')
  } catch {
    debugMpLog('clipboard blocked — copy from console output above')
  }
}

const _w = window as unknown as {
  __VIBEJAM_MP_REPORT__?: () => string
  vibejamMpReport?: () => string
}
_w.__VIBEJAM_MP_REPORT__ = logMpDiagnosticToConsole
_w.vibejamMpReport = logMpDiagnosticToConsole

function mpDebugLogSend(obj: Record<string, unknown>): void {
  if (!DEBUG_MP) return
  const tyRaw = obj.type
  const ty = typeof tyRaw === 'string' ? tyRaw : '?'
  if (ty === 'pose') return
  if (ty === 'voiceShot') {
    mpDiagCounters.sendVoiceShotOk++
    const ab = obj.audioB64
    const n = typeof ab === 'string' ? ab.length : 0
    debugMpLog(`send voiceShot b64~${n}`)
    return
  }
  let len = 0
  try {
    len = JSON.stringify(obj).length
  } catch {
    len = 0
  }
  debugMpLog(`send ${ty} ${len}b`)
}

if (DEBUG_MP) {
  console.log(
    '%c[vibejam-mp] Debug ON',
    'color:#38bdf8;font-weight:bold',
    'Every line also logs here. Full snapshot: type vibejamMpReport() in this console (or F9 / Copy full report).',
  )
}

if (DEBUG_MP && debugMpPanel) {
  debugMpPanel.hidden = false
  debugMpLog('overlay on — F9 or Copy full report also prints to console')
  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return
    const el = ev.target as HTMLElement | null
    if (
      el?.closest?.('input, textarea, [contenteditable="true"]') &&
      ev.code !== 'F9' &&
      ev.code !== 'F2'
    )
      return
    if (ev.code === 'Backquote' || ev.code === 'F2') {
      debugMpPanel.hidden = !debugMpPanel.hidden
      ev.preventDefault()
      return
    }
    if (ev.code === 'F9') {
      void copyMpDiagnosticReport()
      ev.preventDefault()
    }
  })
  debugMpCopyBtn?.addEventListener('click', () => void copyMpDiagnosticReport())
}

const HUB_SKY = 0x87b8e8
const PIXEL_HUB = 2

const _knDir = new Vector3()
const _fp = new Vector3()
const _camFwd = new Vector3()
const _camRight = new Vector3()
const _worldUp = new Vector3(0, 1, 0)

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runUsernameGate(): Promise<void> {
  const stored = readStoredPlayerName()
  if (stored) {
    usernameOverlay.hidden = true
    gameRoot.hidden = true
    return Promise.resolve()
  }

  usernameOverlay.hidden = false
  gameRoot.hidden = true
  usernameInput.focus()

  return new Promise((resolve) => {
    usernameForm.addEventListener(
      'submit',
      (e) => {
        e.preventDefault()
        const raw = usernameInput.value.trim()
        const name = raw || 'Angler'
        savePlayerName(name)
        usernameOverlay.hidden = true
        gameRoot.hidden = true
        resolve()
      },
      { once: true },
    )
  })
}

function initGame(lobby: LobbyResult) {
  if (DEBUG_MP)
    debugMpLog(
      `initGame role=${lobby.mode === 'online' ? lobby.role : 'offline'} mp=${lobby.mode}`,
    )

  let tweaksPanelOpen = false

  const isOnline = lobby.mode === 'online'
  let mpPhase: 'waiting' | 'starting' | 'live' = isOnline ? 'waiting' : 'live'
  /** Online lobby only: Tweaks "Practice with Dummy" — move and fight vs dummy while still waiting for a peer. */
  let lobbyDummyPractice = false

  function multiplayerBlocksPlay(): boolean {
    return isOnline && mpPhase !== 'live' && !lobbyDummyPractice
  }

  let mpSocket: MultiplayerWire | null = null
  /** When set, game JSON prefers WebRTC data channel; signaling stays on `mpSocket`. */
  let rtcGame: WebRtcGameApi | null = null
  /** Host-only authority when using browser P2P (no Node `pvp-host`). */
  let browserHost: ReturnType<typeof createBrowserHostAuthority> | null = null
  let mpPresenceCount = 0
  let mpOpponentName: string | null = null
  let mpSeqStarted = false
  let mpBeginTimer: ReturnType<typeof setTimeout> | null = null
  let poseSendAcc = 0
  /** Online rematch consent: offer id we sent while waiting on opponent. */
  let pendingOutgoingRematchId: string | null = null
  /** Online rematch: latest offer id from peer (we can accept or decline). */
  let pendingIncomingRematchId: string | null = null
  const seenVoiceShotIds = new Set<string>()
  /** Peer voice clips keyed by shotId — play when authoritative authDamage confirms a hit. */
  const pendingPeerShotAudioById = new Map<string, AudioBuffer>()
  /** authDamage can arrive before async decode finishes — play clip once buffer exists. */
  const pendingVictimVoiceShotIds = new Set<string>()

  const scene = new Scene()
  scene.background = new Color(HUB_SKY)

  const camera = new PerspectiveCamera(
    gameConfig.cameraFov,
    window.innerWidth / Math.max(window.innerHeight, 1),
    gameConfig.cameraNear,
    gameConfig.cameraFar,
  )

  const renderer = new WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  /** Canvas first in DOM so HUD / hit-flash overlays stack above it. */
  gameRoot.prepend(renderer.domElement)

  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const pixelPass = new RenderPixelatedPass(PIXEL_HUB, scene, camera, {
    normalEdgeStrength: 0,
    depthEdgeStrength: 0,
  })
  composer.addPass(pixelPass)
  composer.addPass(new OutputPass())
  composer.setSize(window.innerWidth, Math.max(window.innerHeight, 1))

  const controls = new PointerLockControls(camera, renderer.domElement)
  controls.pointerSpeed = gameConfig.mouseSensitivity

  const ambient = new AmbientLight(0xffffff, gameConfig.ambientIntensity)
  scene.add(ambient)

  const sun = new DirectionalLight(0xffffff, gameConfig.sunIntensity)
  sun.position.set(28, 50, 22)
  scene.add(sun)

  const hubRoot = new Group()
  scene.add(hubRoot)

  const ground = addArena(hubRoot)
  const colliders: Mesh[] = [ground]

  let parryGuardRoot: Group | null = null
  let parryArmMeshL: Mesh | null = null
  let parryArmMeshR: Mesh | null = null

  scene.add(camera)

  {
    const root = new Group()
    const fistCol = new Color(0xc45c6b)
    const pgMat = new MeshStandardMaterial({
      color: fistCol,
      roughness: 0.55,
      metalness: 0.14,
    })
    const pgGeo = new BoxGeometry(0.52, 0.13, 0.3)
    const armL = new Mesh(pgGeo, pgMat)
    const armR = new Mesh(pgGeo, pgMat.clone())
    armL.position.set(-0.44, -0.28, -0.55)
    armR.position.set(0.44, -0.28, -0.55)
    armL.rotation.set(0.28, 0.38, 0.92)
    armR.rotation.set(0.28, -0.38, -0.92)
    root.add(armL, armR)
    root.visible = false
    camera.add(root)
    parryGuardRoot = root
    parryArmMeshL = armL
    parryArmMeshR = armR
  }

  const arms = new PlayerArms(camera, scene)

  let botMode: BotMode = isOnline ? 'dummy' : 'dummy'
  let bot = new BotFighter(scene, botMode, new Vector3())

  function isPvp(): boolean {
    return isOnline && mpPhase === 'live' && bot.mode === 'network'
  }

  /** Dedicated listen server or browser host + open WebRTC game channel. */
  function authPvp(): boolean {
    if (!isPvp()) return false
    if (isAuthoritativeListenServer()) return true
    return rtcGame?.channel?.readyState === 'open'
  }

  function sendMp(obj: Record<string, unknown>): void {
    if (!mpSocket || mpSocket.readyState !== 1) return
    try {
      mpSocket.send(JSON.stringify(obj))
    } catch {
      /* ignore */
    }
  }

  /** Poses / voice shots: prefer RTC when available; falls back to relay (see `webrtcGame`). */
  function sendGameTraffic(obj: Record<string, unknown>): void {
    mpDebugLogSend(obj)
    if (rtcGame) rtcGame.sendGameJson(obj)
    else sendMp(obj)
  }

  if (isOnline && lobby.mode === 'online' && !isAuthoritativeListenServer()) {
    rtcGame = createWebRtcGameChannel({
      role: lobby.role,
      signalSend: (o) => sendMp(o),
      onGameJsonString: (raw) => {
        let data: Record<string, unknown>
        try {
          data = JSON.parse(raw) as Record<string, unknown>
        } catch {
          return
        }
        dispatchPeerGamePayload(data)
      },
      onChannelOpen: () => {
        debugMpLog('rtc dataChannel open')
      },
    })
    if (lobby.role === 'host') {
      /** RTC data channels do not echo sends back to the sender — host must apply the same payloads locally. */
      browserHost = createBrowserHostAuthority((o) => {
        rtcGame!.sendGameJson(o)
        dispatchPeerGamePayload(o)
      })
    }
  }

  let playerHits = 0
  let botHits = 0
  let matchOutcome: null | 'win' | 'lose' = null
  let lastQAt = -1e12

  const playerKnock = new Vector3()
  const dashVel = new Vector3()
  let dashCdMs = 0

  const raycaster = new Raycaster()
  raycaster.far = 400
  const feetRayOrigin = new Vector3()
  const _normal = new Vector3()

  const clock = new Clock()
  const velocity = new Vector3()
  const direction = new Vector3()
  const prevShake = new Vector3()
  let shakeIntensity = 0
  let flashIntensity = 0

  let vy = 0
  let grounded = false
  let lastJumpAt = 0

  const keys = {
    forward: false,
    back: false,
    left: false,
    right: false,
  }

  let shiftDashArmed = true
  let parryGuardUntil = 0
  /** Blocks gameplay during KO rematch cinematic (black → swipe → countdown). */
  let rematchSequenceActive = false

  type PlayerHurtPhase = 'none' | 'air' | 'recover'
  let playerHurt: PlayerHurtPhase = 'none'
  let playerHurtRecoverLeft = 0
  let playerHurtAirSince = 0
  let playerInvulnUntil = 0

  const voice = new VoiceChargeManager()
  let chargingLmb = false
  /** Last smoothed voice charge (for shot power + UI). */
  let voiceChargeSmoothed = 0
  /** −1 = unlimited voice shots per round; otherwise shots left when capped. */
  let voiceAmmoLeft = -1
  /** Gameplay frozen until mic works + optional countdown. */
  let voiceInputBlocked = true
  let voiceResumeCountdownActive = false

  let tweakConfigDebounce: ReturnType<typeof setTimeout> | null = null
  let tweakConfigResetChain: Promise<void> = Promise.resolve()

  function displayPlayerName(): string {
    return readStoredPlayerName()?.trim() || 'Player'
  }

  let micPollId = 0

  function updateMicBlockedUi(): void {
    if (micBlockedSubEl) {
      micBlockedSubEl.textContent = `${displayPlayerName()} is fixing their voice input`
    }
    if (micBlockedOverlay) micBlockedOverlay.hidden = !voiceInputBlocked
    if (chargeBarWrap)
      chargeBarWrap.hidden = voiceInputBlocked || multiplayerBlocksPlay()
  }

  function scheduleRoundResetAfterTweak(): void {
    if (tweakConfigDebounce) window.clearTimeout(tweakConfigDebounce)
    tweakConfigDebounce = window.setTimeout(() => {
      tweakConfigDebounce = null
      tweakConfigResetChain = tweakConfigResetChain.then(() => resetRoundAfterTweakEdit())
    }, 420)
  }

  async function resetRoundAfterTweakEdit(): Promise<void> {
    while (rematchSequenceActive) await sleepMs(55)

    chargingLmb = false
    voice.resetChargeMeter()
    voiceChargeSmoothed = 0
    if (chargeBarFill) chargeBarFill.style.width = '0%'
    if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--overload')
    await voice.finishChargeRecording()

    applyRoundReset()
    await runVoiceResumeCountdown()
    tryPointerLock()
  }

  /** Shared round restart (scores, overlays, actors) without pointer-lock. */
  function applyRoundReset(): void {
    matchOutcome = null
    winFinisher = null
    hideWinGameSplash()
    parryGuardUntil = 0
    playerHits = 0
    botHits = 0
    playerHurt = 'none'
    playerHurtRecoverLeft = 0
    playerInvulnUntil = 0
    if (matchEndOverlay) matchEndOverlay.hidden = true
    browserHost?.reset()
    pendingPeerShotAudioById.clear()
    pendingVictimVoiceShotIds.clear()
    spawnActors()
    syncHud()
  }

  async function runVoiceResumeCountdown(): Promise<void> {
    if (!countdownOverlay || !countdownNumEl) return
    voiceResumeCountdownActive = true
    if (countdownTitleEl) countdownTitleEl.hidden = true
    countdownOverlay.hidden = false
    for (const n of [3, 2, 1] as const) {
      countdownNumEl.textContent = String(n)
      countdownOverlay.classList.remove('countdown-overlay--pulse')
      void countdownOverlay.offsetWidth
      countdownOverlay.classList.add('countdown-overlay--pulse')
      await sleepMs(840)
    }
    countdownOverlay.hidden = true
    countdownOverlay.classList.remove('countdown-overlay--pulse')
    voiceResumeCountdownActive = false
  }

  async function runMatchBeginCountdown(): Promise<void> {
    if (!countdownOverlay || !countdownNumEl) return
    if (countdownTitleEl) {
      countdownTitleEl.hidden = false
      countdownTitleEl.textContent = 'Match begins in'
    }
    countdownOverlay.hidden = false
    for (const n of [3, 2, 1] as const) {
      countdownNumEl.textContent = String(n)
      countdownOverlay.classList.remove('countdown-overlay--pulse')
      void countdownOverlay.offsetWidth
      countdownOverlay.classList.add('countdown-overlay--pulse')
      await sleepMs(840)
    }
    if (countdownTitleEl) countdownTitleEl.hidden = true
    countdownOverlay.hidden = true
    countdownOverlay.classList.remove('countdown-overlay--pulse')
  }

  async function initVoiceInput(): Promise<void> {
    updateMicBlockedUi()
    const ok = await voice.ensureMic()
    voiceInputBlocked = !ok
    updateMicBlockedUi()
    window.clearInterval(micPollId)
    if (ok) {
      if (!isOnline) {
        await runVoiceResumeCountdown()
        tryPointerLock()
      }
    } else {
      micPollId = window.setInterval(() => {
        void (async () => {
          if (!voiceInputBlocked) return
          const r = await voice.ensureMic()
          if (r) {
            voiceInputBlocked = false
            updateMicBlockedUi()
            window.clearInterval(micPollId)
            if (!isOnline) {
              await runVoiceResumeCountdown()
              tryPointerLock()
            }
          }
        })()
      }, 2800)
    }
  }

  function randomOpponentCapsuleColor(): number {
    return new Color().setHSL(
      Math.random(),
      0.42 + Math.random() * 0.48,
      0.34 + Math.random() * 0.3,
    ).getHex()
  }

  async function runMpBeginNow(): Promise<void> {
    if (lobby.mode !== 'online') return
    if (mpSeqStarted || mpPhase === 'live') return
    lobbyDummyPractice = false
    mpSeqStarted = true

    if (isOnline && lobby.mode === 'online') {
      spawnActors()
      const spacing = arenaSpacing()
      const botFeetY = gameConfig.botBodyRadius * 1.15 + 0.72
      const { opponentBotZ } = pvpSpawnZs(spacing)
      bot.dispose(scene)
      botMode = 'network'
      bot = new BotFighter(scene, 'network', new Vector3(0, botFeetY, opponentBotZ), {
        bodyColor: randomOpponentCapsuleColor(),
      })
      bot.alignFacingToward(camera.position)
    }

    const name = mpOpponentName ?? 'Player'
    const toastMsg = lobby.role === 'host' ? `${name} joined` : `Playing vs ${name}`
    if (mpCodeHud) mpCodeHud.hidden = true
    if (mpWaitLayer) mpWaitLayer.hidden = true
    if (opponentLabelEl) opponentLabelEl.textContent = name
    if (mpToast) {
      mpToast.textContent = toastMsg
      mpToast.hidden = false
      mpToast.classList.remove('mp-toast--bad')
    }
    mpPhase = 'starting'
    updateMicBlockedUi()
    await runMatchBeginCountdown()
    mpPhase = 'live'
    updateMicBlockedUi()
    tryPointerLock()
    window.setTimeout(() => {
      if (mpToast) mpToast.hidden = true
    }, 4200)
  }

  function scheduleMpBegin(): void {
    if (!isOnline || mpSeqStarted || mpPhase === 'live') return
    if (mpPresenceCount < 2) return
    if (
      lobby.mode === 'online' &&
      !isAuthoritativeListenServer() &&
      lobby.role === 'host' &&
      rtcGame
    ) {
      void rtcGame.hostStartHandshake()
    }
    if (mpOpponentName) {
      void runMpBeginNow()
      return
    }
    if (mpBeginTimer != null) return
    mpBeginTimer = window.setTimeout(() => {
      mpBeginTimer = null
      if (mpSeqStarted || mpPhase === 'live') return
      if (mpPresenceCount < 2) return
      if (!mpOpponentName) mpOpponentName = 'Player'
      void runMpBeginNow()
    }, 550)
  }

  function generateRematchRoundId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }

  function syncMatchEndRematchControlsIdle(): void {
    if (matchRematchPrimaryActionsEl) matchRematchPrimaryActionsEl.hidden = false
    if (matchRematchBtnEl) matchRematchBtnEl.hidden = false
    if (matchCloseBtnEl) matchCloseBtnEl.hidden = false
    if (matchRematchStatusEl) {
      matchRematchStatusEl.hidden = true
      matchRematchStatusEl.textContent = ''
    }
    if (matchRematchCancelBtnEl) matchRematchCancelBtnEl.hidden = true
    if (matchRematchIncomingEl) matchRematchIncomingEl.hidden = true
  }

  function beginOnlineRematchRequest(): void {
    if (!isOnline || lobby.mode !== 'online' || !matchOutcome) return
    const id = generateRematchRoundId()
    pendingOutgoingRematchId = id
    sendGameTraffic({ type: 'rematchOffer', roundId: id })
    if (matchRematchBtnEl) matchRematchBtnEl.hidden = true
    if (matchRematchStatusEl) {
      matchRematchStatusEl.hidden = false
      matchRematchStatusEl.textContent = 'Waiting for opponent to accept…'
    }
    if (matchRematchCancelBtnEl) matchRematchCancelBtnEl.hidden = false
  }

  function dismissMatchEndOnline(): void {
    if (pendingOutgoingRematchId) {
      sendGameTraffic({ type: 'rematchWithdraw', roundId: pendingOutgoingRematchId })
    }
    if (pendingIncomingRematchId) {
      sendGameTraffic({ type: 'rematchWithdraw', roundId: pendingIncomingRematchId })
    }
    pendingOutgoingRematchId = null
    pendingIncomingRematchId = null
    syncMatchEndRematchControlsIdle()
    if (matchEndOverlay) matchEndOverlay.hidden = true
    controls.unlock()
  }

  function handleRematchOfferFromPeer(roundId: string): void {
    if (!matchOutcome) return
    if (pendingOutgoingRematchId !== null) {
      sendGameTraffic({ type: 'rematchAccept', roundId })
      pendingOutgoingRematchId = null
      pendingIncomingRematchId = null
      syncMatchEndRematchControlsIdle()
      void runRematchSequence()
      return
    }
    pendingIncomingRematchId = roundId
    if (matchRematchPrimaryActionsEl) matchRematchPrimaryActionsEl.hidden = true
    if (matchRematchIncomingEl) matchRematchIncomingEl.hidden = false
    if (matchRematchStatusEl) {
      matchRematchStatusEl.hidden = false
      matchRematchStatusEl.textContent = 'Your opponent wants a rematch.'
    }
  }

  function handleRematchAcceptFromPeer(roundId: string): void {
    if (pendingOutgoingRematchId === roundId) {
      pendingOutgoingRematchId = null
      pendingIncomingRematchId = null
      syncMatchEndRematchControlsIdle()
      void runRematchSequence()
    }
  }

  function handleRematchWithdrawFromPeer(roundId: string): void {
    if (pendingIncomingRematchId === roundId) {
      pendingIncomingRematchId = null
      if (matchRematchIncomingEl) matchRematchIncomingEl.hidden = true
      syncMatchEndRematchControlsIdle()
    }
    if (pendingOutgoingRematchId === roundId) {
      pendingOutgoingRematchId = null
      syncMatchEndRematchControlsIdle()
    }
  }

  function dispatchPeerGamePayload(data: Record<string, unknown>): void {
    if (lobby.mode !== 'online') return
    const ty = data.type as string | undefined

    if (DEBUG_MP) {
      if (ty === 'voiceShot' && typeof data.audioB64 === 'string') {
        debugMpLog(`recv voiceShot b64~${data.audioB64.length}`)
      } else if (ty === 'authDamage') {
        debugMpLog(
          `recv authDamage victim=${String(data.victimRole)} agg=${String(data.aggressorRole)}`,
        )
      } else if (ty && ty !== 'pose') {
        debugMpLog(`recv ${ty}`)
      }
    }

    if (ty === 'presence' && typeof data.count === 'number') {
      mpPresenceCount = data.count
      scheduleMpBegin()
      return
    }
    if (
      ty === 'hello' &&
      typeof data.role === 'string' &&
      typeof data.displayName === 'string'
    ) {
      const other: 'host' | 'guest' = lobby.role === 'host' ? 'guest' : 'host'
      if (data.role === other) {
        mpOpponentName = data.displayName.trim() || 'Player'
        scheduleMpBegin()
      }
      return
    }

    if (ty === 'authDamage' && lobby.mode === 'online') {
      mpDiagCounters.recvAuthDamage++
      const sh = data.scoreHost
      const sg = data.scoreGuest
      if (typeof sh === 'number' && typeof sg === 'number') {
        if (lobby.role === 'host') {
          playerHits = sh
          botHits = sg
        } else {
          playerHits = sg
          botHits = sh
        }
        syncHud()
      }
      const aggressorRole =
        data.aggressorRole === 'host' || data.aggressorRole === 'guest'
          ? data.aggressorRole
          : undefined
      if (aggressorRole === lobby.role) {
        triggerAggressorHitConfirmFx()
      }
      if (
        data.victimRole === lobby.role &&
        typeof data.dx === 'number' &&
        typeof data.dz === 'number'
      ) {
        applyPeerMeleeHit(data.dx, data.dz, { authoritative: true })
        const sid = data.shotId
        if (typeof sid === 'string') {
          const clip = pendingPeerShotAudioById.get(sid)
          if (clip) {
            voice.resumeAudio()
            voice.playBufferFading(clip)
            pendingPeerShotAudioById.delete(sid)
            pendingVictimVoiceShotIds.delete(sid)
          } else {
            pendingVictimVoiceShotIds.add(sid)
          }
        }
      }
      return
    }

    if (ty === 'authMatchEnd' && lobby.mode === 'online' && typeof data.winnerRole === 'string') {
      if (!matchOutcome) {
        if (data.winnerRole === lobby.role) endMatch('win')
        else endMatch('lose')
      }
      return
    }

    if (ty === 'rematchOffer' && typeof data.roundId === 'string') {
      handleRematchOfferFromPeer(data.roundId)
      return
    }
    if (ty === 'rematchAccept' && typeof data.roundId === 'string') {
      handleRematchAcceptFromPeer(data.roundId)
      return
    }
    if (ty === 'rematchWithdraw' && typeof data.roundId === 'string') {
      handleRematchWithdrawFromPeer(data.roundId)
      return
    }

    if (bot.mode !== 'network') return

    if (
      ty === 'pose' &&
      typeof data.x === 'number' &&
      typeof data.z === 'number' &&
      typeof data.fy === 'number' &&
      typeof data.ry === 'number'
    ) {
      if (lobby.role === 'host' && browserHost) {
        browserHost.setPose('guest', {
          x: data.x,
          z: data.z,
          fy: data.fy,
          ry: data.ry,
        })
      }
      bot.networkTargetPos.set(data.x, data.fy + bot.getFootOffset(), data.z)
      bot.networkTargetYaw = data.ry
      return
    }

    if (
      ty === 'voiceShot' &&
      typeof data.shotId === 'string' &&
      typeof data.ox === 'number' &&
      typeof data.oy === 'number' &&
      typeof data.oz === 'number' &&
      typeof data.vx === 'number' &&
      typeof data.vy === 'number' &&
      typeof data.vz === 'number' &&
      typeof data.audioB64 === 'string'
    ) {
      mpDiagCounters.recvVoiceShotMsg++
      const fromRole =
        data.fromRole === 'host' || data.fromRole === 'guest' ? data.fromRole : undefined
      if (lobby.role === 'host' && browserHost && fromRole) {
        browserHost.processVoiceShot(fromRole, data)
      }
      if (fromRole && fromRole !== lobby.role) {
        void handlePeerVoiceShot({
          shotId: data.shotId,
          ox: data.ox,
          oy: data.oy,
          oz: data.oz,
          vx: data.vx,
          vy: data.vy,
          vz: data.vz,
          mime: typeof data.mime === 'string' ? data.mime : 'audio/webm',
          audioB64: data.audioB64,
        })
      }
      return
    }

    if (
      ty === 'hitMelee' &&
      typeof data.dx === 'number' &&
      typeof data.dz === 'number' &&
      !authPvp()
    ) {
      applyPeerMeleeHit(data.dx, data.dz)
      return
    }

    if (ty === 'youLose') {
      if (!matchOutcome) endMatch('win')
      return
    }

    if (ty === 'youWin') {
      if (!matchOutcome) endMatch('lose')
      return
    }
  }

  function onMpSocketMessage(ev: MessageEvent): void {
    if (lobby.mode !== 'online') return
    if (typeof ev.data !== 'string') return
    let data: Record<string, unknown>
    try {
      data = JSON.parse(ev.data) as Record<string, unknown>
    } catch {
      debugMpLog('mp JSON parse error')
      return
    }
    const ty = data.type as string | undefined
    if (DEBUG_MP && (ty === 'rtcIce' || ty === 'rtcOffer' || ty === 'rtcAnswer')) {
      debugMpLog(`recv ${ty}`)
    }
    if (ty === 'rtcIce' || ty === 'rtcOffer' || ty === 'rtcAnswer') {
      void rtcGame?.handleSignal(data)
      return
    }
    dispatchPeerGamePayload(data)
  }

  function applyPeerMeleeHit(
    dx: number,
    dz: number,
    opts?: { authoritative?: boolean },
  ): void {
    _knDir.set(dx, 0, dz)
    if (_knDir.lengthSq() < 1e-8) _knDir.set(0, 0, 1)
    _knDir.normalize()
    const now = performance.now()
    const auth = opts?.authoritative === true
    if (!auth && (now < playerInvulnUntil || playerHurt === 'air' || playerHurt === 'recover'))
      return

    const comboMul =
      auth &&
      (now < playerInvulnUntil || playerHurt === 'air' || playerHurt === 'recover')
        ? gameConfig.pvpAuthComboKnockMul
        : 1

    playerHurt = 'air'
    playerHurtAirSince = now
    dashVel.set(0, 0, 0)
    playerKnock.addScaledVector(
      _knDir,
      gameConfig.knockbackOnPlayer * gameConfig.playerHurtKnockMul * comboMul,
    )
    vy += gameConfig.playerHurtVyBoost * comboMul
    triggerHitImpactFx()
  }

  function triggerAggressorHitConfirmFx(): void {
    shakeIntensity = Math.max(shakeIntensity, gameConfig.pvpAggressorHitShake)
    flashIntensity = Math.max(flashIntensity, gameConfig.pvpAggressorHitFlash)
  }

  async function handlePeerVoiceShot(data: {
    shotId: string
    ox: number
    oy: number
    oz: number
    vx: number
    vy: number
    vz: number
    mime: string
    audioB64: string
  }): Promise<void> {
    if (seenVoiceShotIds.has(data.shotId)) return
    seenVoiceShotIds.add(data.shotId)
    if (seenVoiceShotIds.size > 200) seenVoiceShotIds.clear()
    try {
      const blob = base64ToBlob(data.audioB64, data.mime)
      const buf = await voice.decodeRecording(blob)
      if (buf) {
        pendingPeerShotAudioById.set(data.shotId, buf)
        if (pendingPeerShotAudioById.size > 120) {
          const first = pendingPeerShotAudioById.keys().next().value as string | undefined
          if (first) pendingPeerShotAudioById.delete(first)
        }
      }
      const o = new Vector3(data.ox, data.oy, data.oz)
      const v = new Vector3(data.vx, data.vy, data.vz)
      bot.injectWorldProjectile(o, v, buf)
      if (buf && pendingVictimVoiceShotIds.has(data.shotId)) {
        pendingVictimVoiceShotIds.delete(data.shotId)
        pendingPeerShotAudioById.delete(data.shotId)
        voice.resumeAudio()
        voice.playBufferFading(buf)
      }
    } catch {
      debugMpLog('peer voiceShot decode/inject failed')
    }
  }

  async function releaseVoiceShot(): Promise<void> {
    const blob = await voice.finishChargeRecording()
    const buf = await voice.decodeRecording(blob)
    const raw = voiceChargeSmoothed
    voice.resetChargeMeter()
    voiceChargeSmoothed = 0
    if (chargeBarFill) chargeBarFill.style.width = '0%'
    if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--overload')
    if (raw < gameConfig.voiceChargeMinRelease) return
    const cap = Math.round(gameConfig.voiceShotAmmoMax)
    if (cap > 0 && voiceAmmoLeft <= 0) return
    const span = Math.max(0.05, 1 - gameConfig.voiceChargeMinRelease)
    const t = Math.min(1, (raw - gameConfig.voiceChargeMinRelease) / span)
    const speedMul =
      gameConfig.voiceShotSpeedMinMul +
      t * (gameConfig.voiceShotSpeedMaxMul - gameConfig.voiceShotSpeedMinMul)
    const fired = arms.tryFire(speedMul, buf)
    if (fired && cap > 0 && voiceAmmoLeft > 0) voiceAmmoLeft -= 1

    if (
      fired &&
      isOnline &&
      mpPhase === 'live' &&
      lobby.mode === 'online' &&
      bot.mode === 'network'
    ) {
      const shotId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const o = new Vector3()
      const v = new Vector3()
      arms.copyLastShotWorld(o, v)
      try {
        const audioB64 = await blobToBase64(blob)
        const payload: Record<string, unknown> = {
          type: 'voiceShot',
          shotId,
          ox: o.x,
          oy: o.y,
          oz: o.z,
          vx: v.x,
          vy: v.y,
          vz: v.z,
          mime: blob.type || 'audio/webm',
          audioB64,
          fromRole: lobby.role,
        }
        sendGameTraffic(payload)
        if (lobby.role === 'host' && browserHost) {
          const landed = browserHost.processVoiceShot('host', payload)
          if (landed) triggerAggressorHitConfirmFx()
        }
      } catch {
        mpDiagCounters.voiceShotSendFail++
        debugMpLog('local voiceShot build/send failed (clip size?)')
      }
    }
  }

  function syncHud(): void {
    if (scorePEl) scorePEl.textContent = String(playerHits)
    if (scoreBEl) scoreBEl.textContent = String(botHits)
    if (hitsNeedEnemyEl) hitsNeedEnemyEl.textContent = String(Math.round(gameConfig.enemyHitsToWin))
    if (hitsNeedPlayerEl) hitsNeedPlayerEl.textContent = String(Math.round(gameConfig.hitsToWin))
  }

  let dashTiltDeg = 0

  function arenaSpacing(): number {
    const arenaHalf = Math.min(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 - 2.5
    return Math.min(6.8, arenaHalf * 0.38)
  }

  /** Host at +Z, guest at −Z (mirrored) so both players are not stacked on the same spawn. */
  function pvpSpawnZs(spacing: number): { camZ: number; opponentBotZ: number } {
    if (lobby.mode === 'online' && lobby.role === 'guest') {
      return { camZ: -spacing, opponentBotZ: spacing }
    }
    return { camZ: spacing, opponentBotZ: -spacing }
  }

  function spawnActors(): void {
    const spacing = arenaSpacing()
    const botFeetY = gameConfig.botBodyRadius * 1.15 + 0.72
    const { camZ, opponentBotZ } = pvpSpawnZs(spacing)

    const yaw =
      lobby.mode === 'online' && lobby.role === 'guest' ? Math.PI : 0

    camera.position.set(0, gameConfig.eyeHeight, camZ)
    camera.rotation.reorder('YXZ')
    camera.rotation.set(0, yaw, 0)

    bot.root.position.set(0, botFeetY, opponentBotZ)
    bot.root.rotation.set(0, 0, 0)
    bot.resetRoundState()
    bot.alignFacingToward(camera.position)

    dashTiltDeg = 0
    gameRoot.classList.remove('game-root--dash-tilt')
    gameRoot.style.transform = ''
    if (dashScanEl) dashScanEl.style.opacity = '0'
    playerKnock.set(0, 0, 0)
    dashVel.set(0, 0, 0)
    vy = 0
    shakeIntensity = 0
    flashIntensity = 0
    prevShake.set(0, 0, 0)
    if (hitFlashEl) hitFlashEl.style.opacity = '0'
    arms.resetAll()
    chargingLmb = false
    {
      const cap = Math.round(gameConfig.voiceShotAmmoMax)
      voiceAmmoLeft = cap > 0 ? cap : -1
    }
    playerHurt = 'none'
    playerHurtRecoverLeft = 0
    playerInvulnUntil = 0
  }

  type WinFinisherState =
    | { phase: 'launch'; started: number; sawAir: boolean }
    | { phase: 'flash'; started: number }

  let winFinisher: WinFinisherState | null = null

  function hideWinGameSplash(): void {
    if (!winGameSplashEl) return
    winGameSplashEl.classList.remove('win-game-splash--pulse')
    winGameSplashEl.hidden = true
  }

  function showWinGameSplash(): void {
    if (!winGameSplashEl) return
    winGameSplashEl.hidden = false
    winGameSplashEl.classList.remove('win-game-splash--pulse')
    void winGameSplashEl.offsetWidth
    winGameSplashEl.classList.add('win-game-splash--pulse')
  }

  function updateWinFinisher(_delta: number): void {
    if (!winFinisher || winFinisher.phase !== 'launch') return
    if (isBlastZone(bot.root.position)) {
      winFinisher = { phase: 'flash', started: performance.now() }
      showWinGameSplash()
      return
    }
    const elapse = performance.now() - winFinisher.started
    if (!bot.grounded) winFinisher.sawAir = true
    const landed =
      winFinisher.sawAir &&
      bot.grounded &&
      Math.abs(bot.vy) < 2.35 &&
      elapse > 200
    if (landed || elapse > 4200) {
      winFinisher = { phase: 'flash', started: performance.now() }
      showWinGameSplash()
    }
  }

  function advanceWinFlashTimer(): void {
    if (!winFinisher || winFinisher.phase !== 'flash') return
    if (performance.now() - winFinisher.started > 1120) {
      winFinisher = null
      hideWinGameSplash()
      endMatch('win')
    }
  }

  /** Push direction from fist impact → bot flies along punch line (XZ). */
  function knockDirFromFistImpact(fistWorld: Vector3, out: Vector3): void {
    out.subVectors(bot.bodyCenter, fistWorld)
    out.y = 0
    if (out.lengthSq() < 1e-8) {
      out.subVectors(bot.root.position, camera.position)
      out.y = 0
    }
    if (out.lengthSq() < 1e-8) out.set(0, 0, 1)
    out.normalize()
  }

  async function runRematchSequence(): Promise<void> {
    rematchSequenceActive = true
    pendingOutgoingRematchId = null
    pendingIncomingRematchId = null
    syncMatchEndRematchControlsIdle()
    chargingLmb = false
    controls.unlock()
    keys.forward = false
    keys.back = false
    keys.left = false
    keys.right = false
    matchOutcome = null
    winFinisher = null
    hideWinGameSplash()
    parryGuardUntil = 0
    playerHits = 0
    botHits = 0
    syncHud()
    browserHost?.reset()
    if (matchEndOverlay) matchEndOverlay.hidden = true

    if (rematchSeqLayer && rematchBlackSheet) {
      rematchSeqLayer.hidden = false
      rematchBlackSheet.classList.remove('rematch-black-sheet--slide')
      rematchBlackSheet.style.transform = 'translateX(0)'
      await sleepMs(320)
    }

    spawnActors()
    syncHud()

    if (rematchBlackSheet) {
      void rematchBlackSheet.offsetWidth
      rematchBlackSheet.classList.add('rematch-black-sheet--slide')
      await sleepMs(900)
      if (rematchSeqLayer) rematchSeqLayer.hidden = true
      rematchBlackSheet.classList.remove('rematch-black-sheet--slide')
    }

    if (countdownOverlay && countdownNumEl) {
      if (countdownTitleEl) countdownTitleEl.hidden = true
      countdownOverlay.hidden = false
      for (const n of [3, 2, 1] as const) {
        countdownNumEl.textContent = String(n)
        countdownOverlay.classList.remove('countdown-overlay--pulse')
        void countdownOverlay.offsetWidth
        countdownOverlay.classList.add('countdown-overlay--pulse')
        await sleepMs(840)
      }
      countdownOverlay.hidden = true
      countdownOverlay.classList.remove('countdown-overlay--pulse')
    }

    rematchSequenceActive = false
    tryPointerLock()
  }

  /** Full cinematic (black → swipe → 3-2-1) — used from match-end overlay. */
  function resetMatch(): void {
    void runRematchSequence()
  }

  /** In-round rematch button: instant restart without transition. */
  function instantHudRematch(): void {
    if (isPvp()) return
    applyRoundReset()
    tryPointerLock()
  }

  function endMatch(outcome: 'win' | 'lose'): void {
    if (matchOutcome) return
    hideWinGameSplash()
    winFinisher = null
    matchOutcome = outcome
    controls.unlock()
    if (matchEndOverlay) matchEndOverlay.hidden = false
    if (matchEndTitle) {
      matchEndTitle.textContent = outcome === 'win' ? 'You win!' : 'You lose!'
    }
    if (matchEndSub) {
      matchEndSub.textContent =
        outcome === 'win'
          ? 'Opponent knocked out or out of bounds.'
          : 'You were KO’d or fell off the stage.'
    }
  }

  function hitsToKoEnemy(): number {
    return Math.max(1, Math.round(gameConfig.enemyHitsToWin))
  }

  function hitsToKoPlayer(): number {
    return Math.max(1, Math.round(gameConfig.hitsToWin))
  }

  function recreateBot(mode: BotMode): void {
    if (isPvp()) return
    bot.dispose(scene)
    botMode = mode
    bot = new BotFighter(scene, botMode, new Vector3(0, 1.45, -gameConfig.groundDepth / 2 + 12))
    instantHudRematch()
  }

  async function beginLobbyDummyPractice(): Promise<void> {
    if (!isOnline || lobby.mode !== 'online') return
    if (mpSeqStarted || mpPhase === 'live') return

    lobbyDummyPractice = true
    if (mpWaitLayer) mpWaitLayer.hidden = true
    updateMicBlockedUi()

    if (botMode !== 'dummy') recreateBot('dummy')
    else applyRoundReset()

    if (mpToast) {
      mpToast.textContent = 'Practice vs dummy — a real match still starts when someone joins.'
      mpToast.hidden = false
      mpToast.classList.remove('mp-toast--bad')
      window.setTimeout(() => {
        if (
          mpToast &&
          mpToast.textContent === 'Practice vs dummy — a real match still starts when someone joins.'
        ) {
          mpToast.hidden = true
        }
      }, 5200)
    }

    if (!voiceInputBlocked) await runVoiceResumeCountdown()
    if (!lobbyDummyPractice) return
    tryPointerLock()
  }

  spawnActors()
  syncHud()

  function feetY(): number {
    return camera.position.y - gameConfig.eyeHeight
  }

  /**
   * Raycast must start **above** the deck so we never tunnel through after knockback.
   * Second pass: analytical snap on the stage top (y = 0) when over the platform XZ.
   */
  function resolveGround(): void {
    const fy = feetY()
    const rayY = Math.max(
      camera.position.y + 2,
      fy + 6,
      12,
    )
    feetRayOrigin.set(camera.position.x, rayY, camera.position.z)
    raycaster.set(feetRayOrigin, DOWN)
    const hits = raycaster.intersectObjects(colliders, false)

    const skin = 0.22
    const maxStep = 2.4

    grounded = false
    let bestFloorY = -1e9

    for (const h of hits) {
      if (!h.face) continue
      _normal.copy(h.face.normal).transformDirection(h.object.matrixWorld)
      if (_normal.y < 0.35) continue
      const gy = h.point.y
      if (fy < gy - 0.2) continue
      if (fy - gy > maxStep + skin) continue
      if (gy > bestFloorY) bestFloorY = gy
    }

    if (bestFloorY > -1e8) {
      const deltaFeet = fy - bestFloorY
      if (deltaFeet <= skin && deltaFeet >= -2.5) {
        camera.position.y = bestFloorY + gameConfig.eyeHeight
        if (vy <= 0.55) {
          vy = 0
          grounded = true
        }
      }
    }

    snapDeckSurface()
  }

  /** Hard snap when feet are still over the platform AABB (prevents falling through). */
  function snapDeckSurface(): void {
    const hw = gameConfig.groundWidth / 2 + 0.02
    const hd = gameConfig.groundDepth / 2 + 0.02
    const { x, z } = camera.position
    if (Math.abs(x) > hw || Math.abs(z) > hd) return

    const fy = feetY()
    const deckTop = 0
    if (fy <= deckTop + 0.35 && fy >= deckTop - 4 && vy <= 12) {
      camera.position.y = deckTop + gameConfig.eyeHeight
      vy = Math.min(vy, 0)
      grounded = true
    }
  }

  function tryJump() {
    if (
      tweaksPanelOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      multiplayerBlocksPlay() ||
      playerHurt !== 'none'
    )
      return
    const now = performance.now()
    if (now - lastJumpAt < gameConfig.jumpCooldownMs) return
    if (!grounded) return
    vy = gameConfig.jumpForce
    grounded = false
    lastJumpAt = now
  }

  /** Dash matches WASD in camera-local space (same idea as PointerLock walk). */
  function computeDashDirection(out: Vector3): void {
    const ix = Number(keys.right) - Number(keys.left)
    const iz = Number(keys.forward) - Number(keys.back)
    out.set(ix, 0, -iz)
    if (out.lengthSq() < 1e-10) {
      out.set(0, 0, -1)
    } else {
      out.normalize()
    }
    out.applyQuaternion(camera.quaternion)
    out.y = 0
    if (out.lengthSq() < 1e-10) {
      camera.getWorldDirection(out)
      out.y = 0
    }
    out.normalize()
  }

  function tryDash(): void {
    if (
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      multiplayerBlocksPlay() ||
      dashCdMs > 0 ||
      !grounded ||
      tweaksPanelOpen ||
      playerHurt !== 'none'
    )
      return
    computeDashDirection(_knDir)
    const mul = gameConfig.dashVelocityMul
    dashVel.copy(_knDir).multiplyScalar(gameConfig.dashImpulse * mul)

    camera.getWorldDirection(_camFwd)
    _camFwd.y = 0
    if (_camFwd.lengthSq() < 1e-8) _camFwd.set(0, 0, -1)
    _camFwd.normalize()
    _camRight.crossVectors(_camFwd, _worldUp).normalize()
    const lateral = _camRight.dot(_knDir)
    dashTiltDeg = MathUtils.clamp(lateral * -7.8, -6.8, 6.8)
    gameRoot.classList.add('game-root--dash-tilt')

    dashCdMs = gameConfig.dashCooldownMs
  }

  function resolveCombat(delta: number): void {
    if (
      matchOutcome ||
      rematchSequenceActive ||
      voiceResumeCountdownActive ||
      multiplayerBlocksPlay()
    )
      return

    if (winFinisher) {
      if (isBlastZone(camera.position)) {
        winFinisher = null
        hideWinGameSplash()
        endMatch('lose')
        return
      }
      arms.update(delta)
      bot.update(delta, camera.position, colliders, false)
      updateWinFinisher(delta)
      advanceWinFlashTimer()
      return
    }

    arms.update(delta)

    const playerProjActive = arms.isProjectileActive()
    bot.update(delta, camera.position, colliders, playerProjActive)

    /* Player projectile vs bot — dedicated listen server validates shots when authPvp() */
    if (arms.canDealHit() && !authPvp()) {
      arms.getProjectileWorld(_fp)
      const reach = arms.projectileRadius() + gameConfig.botBodyRadius * 0.88
      if (_fp.distanceTo(bot.bodyCenter) < reach) {
        const hitAudio = arms.takeHitAudio()
        arms.markDealt()
        voice.playBufferFading(hitAudio)
        knockDirFromFistImpact(_fp, _knDir)
        playerHits += 1
        syncHud()
        const clinch = playerHits >= hitsToKoEnemy()

        if (isPvp()) {
          if (clinch) {
            sendMp({ type: 'youLose' })
            endMatch('win')
            triggerHitImpactFx()
            return
          }
          sendMp({ type: 'hitMelee', dx: _knDir.x, dz: _knDir.z })
          triggerHitImpactFx()
        } else if (clinch) {
          winFinisher = { phase: 'launch', started: performance.now(), sawAir: false }
          arms.resetAll()
          bot.applyFinisherKnockback(
            _knDir,
            gameConfig.winFinisherKnockXZ,
            gameConfig.winFinisherVy,
          )
          triggerHitImpactFx()
        } else {
          bot.applyKnockback(_knDir, gameConfig.knockbackOnBot)
          triggerHitImpactFx()
        }
      }
    }

    /* Bot projectile vs player */
    if (bot.canDealHit(camera.position) && !authPvp()) {
      const now = performance.now()
      if (
        now < playerInvulnUntil ||
        playerHurt === 'air' ||
        playerHurt === 'recover'
      ) {
        bot.markHitDealt()
      } else {
        const victimClip = bot.peekProjectileVoice()
        _fp.copy(bot.projPos)
        const parried =
          !chargingLmb &&
          arms.canParry() &&
          now - lastQAt <= gameConfig.parryWindowMs
        bot.markHitDealt()
        if (!parried) {
          if (victimClip) voice.playBufferSpatialAt(victimClip, _fp, camera)
          _knDir.subVectors(camera.position, _fp)
          _knDir.y = 0
          if (_knDir.lengthSq() < 1e-8) _knDir.set(0, 0, 1)
          _knDir.normalize()
          playerHurt = 'air'
          playerHurtAirSince = performance.now()
          dashVel.set(0, 0, 0)
          playerKnock.addScaledVector(
            _knDir,
            gameConfig.knockbackOnPlayer * gameConfig.playerHurtKnockMul,
          )
          vy += gameConfig.playerHurtVyBoost
          botHits += 1
          syncHud()
          triggerHitImpactFx()
          if (botHits >= hitsToKoPlayer()) {
            if (isPvp()) sendMp({ type: 'youWin' })
            endMatch('lose')
          }
        }
      }
    }

    if (!authPvp()) {
      if (isBlastZone(camera.position)) {
        if (isPvp()) sendMp({ type: 'youWin' })
        endMatch('lose')
      }
      if (isBlastZone(bot.root.position)) {
        if (isPvp()) sendMp({ type: 'youLose' })
        endMatch('win')
      }
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === 'KeyQ') {
      if (
        !tweaksPanelOpen &&
        !matchOutcome &&
        !winFinisher &&
        !rematchSequenceActive &&
        !multiplayerBlocksPlay() &&
        playerHurt === 'none' &&
        !chargingLmb &&
        arms.canParry()
      ) {
        lastQAt = performance.now()
        parryGuardUntil = performance.now() + gameConfig.parryGuardVisibleMs
      }
    }

    /** 1 dummy · 2 smart · 3 toggle bot · R restart (also when match-end overlay is open). */
    const shortcutBlock =
      tweaksPanelOpen ||
      rematchSequenceActive ||
      winFinisher ||
      multiplayerBlocksPlay()
    if (!shortcutBlock) {
      switch (e.code) {
        case 'Digit1':
          e.preventDefault()
          recreateBot('dummy')
          return
        case 'Digit2':
          e.preventDefault()
          recreateBot('smart')
          return
        case 'Digit3':
          e.preventDefault()
          recreateBot(botMode === 'dummy' ? 'smart' : 'dummy')
          return
        case 'KeyR':
          e.preventDefault()
          if (isOnline && lobby.mode === 'online' && matchOutcome) {
            beginOnlineRematchRequest()
          } else {
            instantHudRematch()
          }
          return
        default:
          break
      }
    }

    if (
      tweaksPanelOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      multiplayerBlocksPlay() ||
      playerHurt !== 'none'
    )
      return
    switch (e.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        if (shiftDashArmed) {
          shiftDashArmed = false
          tryDash()
        }
        break
      case 'Space':
        e.preventDefault()
        tryJump()
        break
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = true
        break
      case 'KeyS':
      case 'ArrowDown':
        keys.back = true
        break
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = true
        break
      case 'KeyD':
      case 'ArrowRight':
        keys.right = true
        break
      default:
        break
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      shiftDashArmed = true
    }
    if (tweaksPanelOpen || matchOutcome) return
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = false
        break
      case 'KeyS':
      case 'ArrowDown':
        keys.back = false
        break
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = false
        break
      case 'KeyD':
      case 'ArrowRight':
        keys.right = false
        break
      default:
        break
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return
    const ammoCap = Math.round(gameConfig.voiceShotAmmoMax)
    if (ammoCap > 0 && voiceAmmoLeft <= 0) return
    if (
      voiceInputBlocked ||
      voiceResumeCountdownActive ||
      multiplayerBlocksPlay() ||
      tweaksPanelOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      playerHurt !== 'none' ||
      arms.isProjectileActive()
    )
      return
    voice.resumeAudio()
    voice.startChargeRecording()
    chargingLmb = true
  }

  function onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return
    if (!chargingLmb) return
    chargingLmb = false
    void releaseVoiceShot()
  }

  renderer.domElement.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  renderer.domElement.addEventListener('contextmenu', (ev) => ev.preventDefault())

  function onResize() {
    const w = window.innerWidth
    const h = Math.max(window.innerHeight, 1)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  function updateMovement(delta: number) {
    /* Mic blocked must not freeze physics — victims still need knockback integration + pose sync. */
    if (voiceResumeCountdownActive || multiplayerBlocksPlay()) return

    const groundedBeforeResolve = grounded

    vy -= gameConfig.gravity * delta
    camera.position.y += vy * delta

    const canWalk = playerHurt === 'none'

    if (canWalk) {
      velocity.x -= velocity.x * gameConfig.damping * delta
      velocity.z -= velocity.z * gameConfig.damping * delta

      direction.z = Number(keys.forward) - Number(keys.back)
      direction.x = Number(keys.right) - Number(keys.left)
      direction.normalize()

      if (keys.forward || keys.back) {
        velocity.z -= direction.z * gameConfig.moveSpeed * delta
      }
      if (keys.left || keys.right) {
        velocity.x -= direction.x * gameConfig.moveSpeed * delta
      }

      controls.moveRight(-velocity.x * delta)
      controls.moveForward(-velocity.z * delta)
    } else {
      velocity.set(0, 0, 0)
      dashVel.set(0, 0, 0)
    }

    if (dashCdMs > 0) dashCdMs -= delta * 1000

    camera.position.x += (playerKnock.x + dashVel.x) * delta
    camera.position.z += (playerKnock.z + dashVel.z) * delta

    if (playerHurt === 'air') {
      playerKnock.multiplyScalar(Math.exp(-Math.max(0.4, gameConfig.knockHurtAirDrag) * delta))
    } else if (playerHurt === 'recover') {
      playerKnock.multiplyScalar(Math.exp(-14 * delta))
    } else {
      playerKnock.multiplyScalar(Math.exp(-11 * delta))
    }
    dashVel.multiplyScalar(Math.exp(-gameConfig.dashDecay * delta))

    resolveGround()

    if (playerHurt === 'air') {
      const elapsed = performance.now() - playerHurtAirSince
      const landed = !groundedBeforeResolve && grounded
      const slideEnd =
        grounded && playerKnock.length() < 2.4 && elapsed > 175
      const groundedTimeout = grounded && elapsed > 1050
      if (landed || slideEnd || groundedTimeout) {
        playerHurt = 'recover'
        playerHurtRecoverLeft = gameConfig.playerKnockRecoverMs / 1000
        playerKnock.multiplyScalar(0.5)
      }
    } else if (playerHurt === 'recover') {
      playerHurtRecoverLeft -= delta
      if (playerHurtRecoverLeft <= 0) {
        playerHurt = 'none'
        playerInvulnUntil = performance.now() + gameConfig.playerPostKnockInvulnMs
      }
    }

    controls.pointerSpeed = gameConfig.mouseSensitivity
  }

  function triggerHitImpactFx(): void {
    shakeIntensity = Math.max(shakeIntensity, gameConfig.hitScreenShake)
    flashIntensity = Math.max(flashIntensity, gameConfig.hitFlashOpacity)
  }

  function applyHitPresentation(delta: number): void {
    camera.position.sub(prevShake)
    prevShake.set(0, 0, 0)
    if (shakeIntensity > 0.004) {
      shakeIntensity *= Math.exp(-21 * delta)
      prevShake.set(
        (Math.random() - 0.5) * 2 * shakeIntensity,
        (Math.random() - 0.5) * 2 * shakeIntensity * 0.52,
        (Math.random() - 0.5) * 2 * shakeIntensity,
      )
      camera.position.add(prevShake)
    } else {
      shakeIntensity = 0
    }
    if (hitFlashEl) {
      if (flashIntensity > 0.012) {
        flashIntensity *= Math.exp(-26 * delta)
        hitFlashEl.style.opacity = String(Math.min(1, flashIntensity))
      } else {
        flashIntensity = 0
        hitFlashEl.style.opacity = '0'
      }
    }
  }

  let debugMpHb = 0
  function animate() {
    const delta = Math.min(clock.getDelta(), gameConfig.movementMaxDelta)

    if (DEBUG_MP) {
      mpDiagSnapshot.lobbyOnline = lobby.mode === 'online'
      if (isOnline && lobby.mode === 'online') {
        mpDiagSnapshot.mpPhase = mpPhase
        mpDiagSnapshot.lobbyRole = lobby.role
        mpDiagSnapshot.wsReady = mpSocket?.readyState ?? -1
        mpDiagSnapshot.rtcDc = rtcGame?.channel?.readyState ?? 'none'
        mpDiagSnapshot.authPvp = authPvp()
        mpDiagSnapshot.browserHost = !!browserHost
        mpDiagSnapshot.listenRelay = isAuthoritativeListenServer()
        mpDiagSnapshot.partyKitEnv = String(import.meta.env.VITE_PARTYKIT_HOST ?? '')
        mpDiagSnapshot.partyKitRuntime = getPartyKitHost()
        mpDiagSnapshot.cam = {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        }
        mpDiagSnapshot.scoresYou = playerHits
        mpDiagSnapshot.scoresOpp = botHits
      }
    }

    if (DEBUG_MP && isOnline && lobby.mode === 'online') {
      debugMpHb++
      if (debugMpHb % 240 === 0) {
        const ws = mpSocket?.readyState ?? -1
        const dc = rtcGame?.channel?.readyState ?? 'none'
        debugMpLog(
          `hb ws=${ws} rtcDc=${dc} authPvp=${authPvp()} bh=${browserHost ? 1 : 0} mp=${mpPhase}`,
        )
      }
    }

    if (isPvp()) {
      const fy = camera.position.y - gameConfig.eyeHeight
      if (lobby.mode === 'online' && lobby.role === 'host' && browserHost) {
        browserHost.setPose('host', {
          x: camera.position.x,
          z: camera.position.z,
          fy,
          ry: camera.rotation.y,
        })
      }
      poseSendAcc += delta
      if (poseSendAcc >= 0.05) {
        poseSendAcc -= 0.05
        sendGameTraffic({
          type: 'pose',
          x: camera.position.x,
          z: camera.position.z,
          fy,
          ry: camera.rotation.y,
        })
      }
    }

    if ((voiceInputBlocked || multiplayerBlocksPlay()) && chargingLmb) {
      chargingLmb = false
      voice.resetChargeMeter()
      voiceChargeSmoothed = 0
      void voice.finishChargeRecording()
      if (chargeBarFill) chargeBarFill.style.width = '0%'
    }

    if (!voiceInputBlocked && !voiceResumeCountdownActive && !multiplayerBlocksPlay()) {
      voiceChargeSmoothed = voice.tickChargeMeter(delta, chargingLmb)
    }
    if (chargeBarFill) {
      const pct = Math.min(150, voiceChargeSmoothed * 100)
      chargeBarFill.style.width = `${pct}%`
    }
    if (chargeBarMinMark) {
      chargeBarMinMark.style.left = `${gameConfig.voiceChargeMinRelease * 100}%`
    }
    if (chargeBarWrap) {
      if (voiceChargeSmoothed >= gameConfig.voiceOverloadThreshold) {
        chargeBarWrap.classList.add('charge-bar-wrap--overload')
      } else {
        chargeBarWrap.classList.remove('charge-bar-wrap--overload')
      }
    }

    const dashSpd = dashVel.length()
    dashTiltDeg *= Math.exp(-13.5 * delta)
    if (Math.abs(dashTiltDeg) < 0.08) {
      dashTiltDeg = 0
      gameRoot.classList.remove('game-root--dash-tilt')
      gameRoot.style.transform = ''
    } else {
      gameRoot.style.transform = `rotateZ(${dashTiltDeg.toFixed(3)}deg)`
    }
    if (dashScanEl) {
      const o = Math.min(0.72, dashSpd * 0.045 + dashSpd * dashSpd * 0.0012)
      dashScanEl.style.opacity = dashSpd > 0.35 ? String(o) : String(o * 0.65)
      if (dashSpd < 0.18) dashScanEl.style.opacity = '0'
    }

    if (parryArmMeshL && parryArmMeshR && parryGuardRoot) {
      const showGuard =
        performance.now() < parryGuardUntil &&
        !matchOutcome &&
        !tweaksPanelOpen &&
        !winFinisher &&
        !rematchSequenceActive &&
        !multiplayerBlocksPlay() &&
        playerHurt === 'none' &&
        !chargingLmb &&
        !arms.isProjectileActive()
      parryArmMeshL.visible = showGuard
      parryArmMeshR.visible = showGuard
      parryGuardRoot.visible = showGuard
    }

    if (!tweaksPanelOpen) {
      if (
        !matchOutcome &&
        !rematchSequenceActive &&
        !voiceResumeCountdownActive &&
        !multiplayerBlocksPlay()
      ) {
        updateMovement(delta)
        resolveCombat(delta)
      } else if (matchOutcome) {
        arms.update(delta)
      }
    }

    applyHitPresentation(delta)

    if (invulnShineEl) {
      const now = performance.now()
      const left = playerInvulnUntil - now
      if (left > 0) {
        invulnShineEl.hidden = false
        invulnShineEl.classList.add('invuln-shine--on')
        const span = Math.max(400, gameConfig.playerPostKnockInvulnMs)
        const wave = 0.19 + Math.sin(now * 0.0085) * 0.14
        invulnShineEl.style.opacity = String(
          Math.min(0.42, wave * Math.min(1, left / span)),
        )
      } else {
        invulnShineEl.style.opacity = '0'
        invulnShineEl.hidden = true
        invulnShineEl.classList.remove('invuln-shine--on')
      }
    }

    composer.render()
  }

  renderer.setAnimationLoop(animate)

  function tryPointerLock(): void {
    if (
      tweaksPanelOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      voiceInputBlocked ||
      voiceResumeCountdownActive ||
      multiplayerBlocksPlay()
    )
      return
    void controls.lock()
  }

  /** HUD used to sit above the canvas and eat clicks; clicks on the canvas re-request lock after Esc/tab. */
  renderer.domElement.addEventListener('click', () => {
    tryPointerLock()
  })

  if (isOnline && lobby.mode === 'online') {
    const onlineLobby = lobby
    if (mpWaitLayer) mpWaitLayer.hidden = false
    if (mpWaitText) mpWaitText.textContent = 'Waiting for opponent…'
    if (onlineLobby.role === 'host') {
      if (mpCodeHud) mpCodeHud.hidden = false
      if (mpCodeValue) mpCodeValue.textContent = onlineLobby.shortCode
    }
    if (opponentLabelEl) opponentLabelEl.textContent = 'Opponent'

    try {
      mpSocket = createMultiplayerSocket(onlineLobby.roomId)
      mpSocket.addEventListener('open', () => {
        debugMpLog('ws open')
        mpSocket?.send(
          JSON.stringify({
            type: 'hello',
            displayName: displayPlayerName(),
            role: onlineLobby.role,
          }),
        )
      })
      mpSocket.addEventListener('message', (ev: Event) =>
        onMpSocketMessage(ev as MessageEvent),
      )
      mpSocket.addEventListener('error', () => {
        debugMpLog('ws error')
        console.warn(
          '[multiplayer] socket error — check network and that the site was built with online enabled',
        )
        if (mpToast) {
          mpToast.textContent =
            'Couldn’t connect. Check your connection and try again, or refresh and choose Play offline.'
          mpToast.hidden = false
          mpToast.classList.add('mp-toast--bad')
        }
      })
    } catch {
      console.warn('[multiplayer] no transport configured at build time')
      if (mpToast) {
        mpToast.textContent =
          'Online isn’t available right now. Refresh and choose Play offline.'
        mpToast.hidden = false
        mpToast.classList.add('mp-toast--bad')
      }
    }

    async function copyLobbyCodeToClipboard(): Promise<void> {
      try {
        await navigator.clipboard.writeText(onlineLobby.shortCode)
        if (mpToast) {
          mpToast.textContent = 'Code copied'
          mpToast.hidden = false
          mpToast.classList.remove('mp-toast--bad')
          window.setTimeout(() => {
            if (mpToast && mpToast.textContent === 'Code copied') mpToast.hidden = true
          }, 1600)
        }
      } catch {
        /* ignore */
      }
    }

    mpCodeCopy?.addEventListener('click', () => void copyLobbyCodeToClipboard())

    const onLobbyCopyHotkey = (ev: KeyboardEvent) => {
      if (ev.key !== 'c' && ev.key !== 'C') return
      if (!isOnline || lobby.mode !== 'online' || onlineLobby.role !== 'host')
        return
      if (mpPhase !== 'waiting') return
      if (tweaksPanelOpen) return
      const ae = document.activeElement
      if (
        ae &&
        (ae.closest('input') ||
          ae.closest('textarea') ||
          ae.getAttribute?.('contenteditable') === 'true')
      )
        return
      ev.preventDefault()
      void copyLobbyCodeToClipboard()
    }
    window.addEventListener('keydown', onLobbyCopyHotkey)
  }

  /** Browser gesture policy: lock after ready; skip until online match begins. */
  if (!isOnline) {
    queueMicrotask(() => tryPointerLock())
    window.addEventListener('pointerdown', tryPointerLock, { capture: true, once: true })
  }
  queueMicrotask(() => {
    void initVoiceInput()
  })

  matchRematchBtnEl?.addEventListener('click', () => {
    if (isOnline && lobby.mode === 'online') {
      beginOnlineRematchRequest()
    } else {
      resetMatch()
    }
  })
  matchCloseBtnEl?.addEventListener('click', () => {
    if (isOnline && lobby.mode === 'online') {
      dismissMatchEndOnline()
    } else {
      resetMatch()
    }
  })
  matchRematchCancelBtnEl?.addEventListener('click', () => {
    if (pendingOutgoingRematchId) {
      sendGameTraffic({ type: 'rematchWithdraw', roundId: pendingOutgoingRematchId })
    }
    pendingOutgoingRematchId = null
    syncMatchEndRematchControlsIdle()
  })
  matchRematchAcceptBtnEl?.addEventListener('click', () => {
    const id = pendingIncomingRematchId
    if (!id) return
    sendGameTraffic({ type: 'rematchAccept', roundId: id })
    pendingIncomingRematchId = null
    pendingOutgoingRematchId = null
    syncMatchEndRematchControlsIdle()
    void runRematchSequence()
  })
  matchRematchDeclineBtnEl?.addEventListener('click', () => {
    if (pendingIncomingRematchId) {
      sendGameTraffic({ type: 'rematchWithdraw', roundId: pendingIncomingRematchId })
    }
    pendingIncomingRematchId = null
    if (matchRematchIncomingEl) matchRematchIncomingEl.hidden = true
    syncMatchEndRematchControlsIdle()
  })

  const tweaksHost = document.getElementById('tweaks-panel-host')
  if (tweaksHost) {
    mountTweaksPanel(tweaksHost, {
      controls,
      camera,
      ambient,
      sun,
      onToggle(open) {
        tweaksPanelOpen = open
        if (!open) tryPointerLock()
      },
      onConfigChanged: scheduleRoundResetAfterTweak,
      ...(isOnline && lobby.mode === 'online'
        ? { onPracticeWithDummy: beginLobbyDummyPractice }
        : {}),
    })
  }
}

runUsernameGate()
  .then(() => runLobbyGate(readStoredPlayerName()?.trim() || 'Angler'))
  .then((lobby) => {
    gameRoot.hidden = false
    initGame(lobby)
  })
