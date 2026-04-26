/**
 * Single entry, static imports only — keeps the production bundle one chunk and fast to parse (Vibe Jam instant-play goal).
 */
import './style.css'
import {
  AmbientLight,
  BasicShadowMap,
  CapsuleGeometry,
  Clock,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  EdgesGeometry,
  Group,
  BufferGeometry,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
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
import { PublicLobbyDirectoryClient } from './net/publicLobbyDirectory'
import { isAuthoritativeListenServer } from './net/transportConfig'
import {
  createWebRtcGameChannel,
  type WebRtcGameApi,
} from './net/webrtcGame'
import { LowEndDitherShader } from './post/lowEndDitherShader'
import { readStoredPlayerName, savePlayerName } from './playerName'
import { setPartyKitHostSession, getPartyKitHost } from './net/partyKitHost'
import {
  bootstrapMpDebugUrl,
  isMpDebugMode,
  type MpDiagSnapshot,
} from './mpDebugReport'
/** Stunned FX SVGs live in `public/ui/` so Vercel/production resolves them without bundling `../Assets/`. */
const stunnedEffectBgUrl = `${import.meta.env.BASE_URL}ui/StunnedEffectBg.svg`
const stunnedStarUrl = `${import.meta.env.BASE_URL}ui/StunnedStar.svg`
/** Same resolution as monkey GLBs: bundled from `Assets/` so dev/prod always load this file, not a stale `public/` copy. */
const skyboxEquirectUrl = new URL(
  '../Assets/Skyboxes/vz_clear_ocean_back.png',
  import.meta.url,
).href

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

const percentYouEl = document.getElementById('percent-you')
const percentFoeEl = document.getElementById('percent-foe')
const percentLabelYouEl = document.getElementById('percent-label-you')
const percentLabelFoeEl = document.getElementById('percent-label-foe')
const seriesScoreOverlay = document.getElementById('series-score-overlay') as HTMLDivElement | null
const seriesScoreLineEl = document.getElementById('series-score-line') as HTMLParagraphElement | null
const victimHitFlashEl = document.getElementById('victim-hit-flash') as HTMLDivElement | null
const stunnedOverlayEl = document.getElementById('stunned-overlay') as HTMLDivElement | null
const stunnedBgEl = document.getElementById('stunned-bg') as HTMLImageElement | null
const stunnedStarsEl = document.getElementById('stunned-stars') as HTMLDivElement | null

if (stunnedBgEl) stunnedBgEl.src = stunnedEffectBgUrl

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
const leaveMatchOverlay = document.getElementById('leave-match-overlay') as HTMLDivElement | null
const leaveMatchConfirmBtn = document.getElementById('leave-match-confirm') as HTMLButtonElement | null
const leaveMatchCancelBtn = document.getElementById('leave-match-cancel') as HTMLButtonElement | null
const matchCancelledOverlay = document.getElementById(
  'match-cancelled-overlay',
) as HTMLDivElement | null
const matchCancelledOkBtn = document.getElementById('match-cancelled-ok') as HTMLButtonElement | null
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
const chargeBarStatus = document.getElementById('charge-bar-status') as HTMLDivElement | null
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

/** Fallback clear color if the equirect sky texture fails to load. */
const HUB_SKY = 0x1a2330

const _knDir = new Vector3()
const _fp = new Vector3()
const _camFwd = new Vector3()
const _camRight = new Vector3()
const _worldUp = new Vector3(0, 1, 0)
const _muzzleWorld = new Vector3()
const _aimDir = new Vector3()

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
  let leaveMatchDialogOpen = false

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

  /** Percent HUD foe line: peer hello name, else public-listing host name for guests; never internal dummy label. */
  function opponentHudName(): string {
    if (lobby.mode === 'online') {
      const n = mpOpponentName?.trim()
      if (n) return n
      if (lobby.role === 'guest') {
        const listed = lobby.listingHostName?.trim()
        if (listed) return listed
      }
    }
    return 'Opponent'
  }

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
  /** Local aggressor: replay own shot clip on authoritative hit confirm. */
  const pendingAttackerShotAudioById = new Map<string, AudioBuffer>()
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
  renderer.shadowMap.enabled = true
  /* Hard-edged shadows (harsher than PCF soft). */
  renderer.shadowMap.type = BasicShadowMap
  /** Canvas first in DOM so HUD / hit-flash overlays stack above it. */
  gameRoot.prepend(renderer.domElement)

  const skyLoader = new TextureLoader()
  skyLoader.load(
    skyboxEquirectUrl,
    (tex) => {
      tex.colorSpace = SRGBColorSpace
      tex.mapping = EquirectangularReflectionMapping
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
      scene.background = tex
    },
    undefined,
    () => {
      scene.background = new Color(HUB_SKY)
    },
  )

  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const pixelPass = new RenderPixelatedPass(Math.max(1, gameConfig.retroPixelScale), scene, camera, {
    normalEdgeStrength: Math.max(0, gameConfig.retroEdgeStrength * 0.65),
    depthEdgeStrength: Math.max(0, gameConfig.retroEdgeStrength),
  })
  composer.addPass(pixelPass)
  composer.addPass(new OutputPass())
  /* After color space / tone mapping: cheap screen-space noise to reduce gradient banding. */
  composer.addPass(new ShaderPass(LowEndDitherShader))
  composer.setSize(window.innerWidth, Math.max(window.innerHeight, 1))

  const controls = new PointerLockControls(camera, renderer.domElement)
  controls.pointerSpeed = gameConfig.mouseSensitivity

  const ambient = new AmbientLight(0xffffff, gameConfig.ambientIntensity)
  scene.add(ambient)

  const sun = new DirectionalLight(0xffffff, gameConfig.sunIntensity)
  /* Low sun angle → longer, harsher shadows on the deck (reads against moody skybox). */
  sun.position.set(58, 34, 42)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 220
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.035
  function applySunShadowFrustum(): void {
    const ext = Math.max(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 + gameConfig.blastMargin + 10
    const cam = sun.shadow.camera
    cam.left = -ext
    cam.right = ext
    cam.top = ext
    cam.bottom = -ext
    cam.updateProjectionMatrix()
  }
  applySunShadowFrustum()
  scene.add(sun)
  scene.add(sun.target)
  sun.target.position.set(0, 0, 0)

  const hubRoot = new Group()
  scene.add(hubRoot)

  const ground = addArena(hubRoot)
  const colliders: Mesh[] = [ground]

  scene.add(camera)

  const arms = new PlayerArms(camera, scene)
  /** Outgoing compact anim state for networked enemy playback (local mesh is intentionally disabled). */
  type NetAnimBase = 'idle' | 'running' | 'jumping' | 'hitreact'
  type NetAnimOneShot = 'recording' | 'shooting' | null
  let localAnimOneShot: NetAnimOneShot = null
  let localAnimEpoch = 0
  function queueLocalAnimOneShot(name: Exclude<NetAnimOneShot, null>): void {
    localAnimOneShot = name
    localAnimEpoch += 1
  }

  let botMode: BotMode = isOnline ? 'dummy' : 'dummy'
  let bot = new BotFighter(scene, botMode, new Vector3())

  /**
   * Red wireframe capsule debug helpers. Lazily-rebuilt geometry when sizing changes; always-on listener
   * for the matching `*CollisionView` flag in the tweaks panel.
   */
  type CapsuleDebug = {
    line: LineSegments
    radius: number
    height: number
  }
  const _capsuleMaterial = new LineBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.85 })
  function makeCapsuleDebug(radius: number, height: number): CapsuleDebug {
    const cylH = Math.max(0.05, height - radius * 2)
    const geom = new EdgesGeometry(new CapsuleGeometry(radius, cylH, 6, 12))
    const line = new LineSegments(geom, _capsuleMaterial)
    line.visible = false
    scene.add(line)
    return { line, radius, height }
  }
  function syncCapsuleDebug(
    debug: CapsuleDebug,
    radius: number,
    height: number,
    centerX: number,
    centerY: number,
    centerZ: number,
    visible: boolean,
  ): void {
    debug.line.visible = visible
    if (!visible) return
    if (Math.abs(debug.radius - radius) > 1e-3 || Math.abs(debug.height - height) > 1e-3) {
      const cylH = Math.max(0.05, height - radius * 2)
      debug.line.geometry.dispose()
      debug.line.geometry = new EdgesGeometry(new CapsuleGeometry(radius, cylH, 6, 12))
      debug.radius = radius
      debug.height = height
    }
    debug.line.position.set(centerX, centerY, centerZ)
  }
  const playerCapsuleDebug = makeCapsuleDebug(
    gameConfig.pcCapsuleRadius,
    gameConfig.pcCapsuleHeight,
  )
  const enemyCapsuleDebug = makeCapsuleDebug(
    gameConfig.pcCapsuleRadius,
    gameConfig.pcCapsuleHeight,
  )

  /** Green XZ loop: ring-out boundary (|x|/|z| vs half-extent + blast margin). Toggle via Tweaks `showBlastBounds`. */
  const blastBoundsGeom = new BufferGeometry()
  const blastBoundsLine = new LineLoop(
    blastBoundsGeom,
    new LineBasicMaterial({ color: 0x33ee66, transparent: true, opacity: 0.9 }),
  )
  blastBoundsLine.visible = false
  scene.add(blastBoundsLine)

  function syncBlastBoundsLine(): void {
    const show = gameConfig.showBlastBounds >= 0.5
    blastBoundsLine.visible = show
    if (!show) return
    const hw = gameConfig.groundWidth * 0.5 + gameConfig.blastMargin
    const hd = gameConfig.groundDepth * 0.5 + gameConfig.blastMargin
    const y = 0.065
    blastBoundsGeom.setFromPoints([
      new Vector3(-hw, y, -hd),
      new Vector3(hw, y, -hd),
      new Vector3(hw, y, hd),
      new Vector3(-hw, y, hd),
    ])
  }
  syncBlastBoundsLine()

  let publicHostDirClient: PublicLobbyDirectoryClient | null = null
  let publicHostDirTimer: ReturnType<typeof setInterval> | null = null

  function stopPublicHostAnnounce(): void {
    if (publicHostDirTimer !== null) {
      window.clearInterval(publicHostDirTimer)
      publicHostDirTimer = null
    }
    if (publicHostDirClient) {
      publicHostDirClient.disconnect()
      publicHostDirClient = null
    }
  }

  function maybeStartPublicHostAnnounce(): void {
    stopPublicHostAnnounce()
    if (!isOnline || lobby.mode !== 'online') return
    if (lobby.role !== 'host') return
    if (lobby.lobbyVisibility !== 'public') return
    if (lobby.startWithDummyPractice) return
    if (mpPhase !== 'waiting') return
    const client = new PublicLobbyDirectoryClient(() => {})
    publicHostDirClient = client
    client.connect()
    const pulse = () => {
      if (mpPhase !== 'waiting' || !publicHostDirClient) {
        stopPublicHostAnnounce()
        return
      }
      const hostName = readStoredPlayerName()?.trim() || displayPlayerName()
      publicHostDirClient.sendHostPing(lobby.roomId, lobby.shortCode, hostName)
    }
    pulse()
    publicHostDirTimer = window.setInterval(pulse, 4000)
  }

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

  let playerPercent = 0
  let enemyPercent = 0
  let matchOutcome: null | 'win' | 'lose' = null
  /** Best-of-3 rounds won (ring-out / elimination). */
  let seriesWinsSelf = 0
  let seriesWinsOpp = 0
  let seriesTransitionActive = false
  let victimWhiteFlashUntil = 0

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
  /** One look-down voice shot hop per airborne cycle; reset on landing. */
  let voiceDownBoostReady = true
  /** One Shift dash while airborne per flight; reset on landing. */
  let airDashReady = true
  /** Mid-air jumps remaining (e.g. double-jump = 1). Refilled on every landing. */
  let airJumpsLeft = Math.max(0, Math.round(gameConfig.airJumpsMax))

  const keys = {
    forward: false,
    back: false,
    left: false,
    right: false,
  }

  function isGameTextInputTarget(t: EventTarget | null): boolean {
    if (!(t instanceof Element)) return false
    return Boolean(t.closest('input, textarea, select, [contenteditable="true"]'))
  }

  function movementKeyTrackingEnabled(): boolean {
    return !tweaksPanelOpen && !leaveMatchDialogOpen && !matchOutcome
  }

  function clearMovementKeys(): void {
    keys.forward = false
    keys.back = false
    keys.left = false
    keys.right = false
  }

  function onMovementKeyDown(e: KeyboardEvent): void {
    if (isGameTextInputTarget(e.target)) return
    if (!movementKeyTrackingEnabled()) return
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = true
        return
      case 'KeyS':
      case 'ArrowDown':
        keys.back = true
        return
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = true
        return
      case 'KeyD':
      case 'ArrowRight':
        keys.right = true
        return
      default:
    }
  }

  function onMovementKeyUp(e: KeyboardEvent): void {
    if (isGameTextInputTarget(e.target)) return
    if (!movementKeyTrackingEnabled()) return
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = false
        return
      case 'KeyS':
      case 'ArrowDown':
        keys.back = false
        return
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = false
        return
      case 'KeyD':
      case 'ArrowRight':
        keys.right = false
        return
      default:
    }
  }

  /** Blocks gameplay during KO rematch cinematic (black → swipe → countdown). */
  let rematchSequenceActive = false

  type PlayerHurtPhase = 'none' | 'air' | 'recover'
  let playerHurt: PlayerHurtPhase = 'none'
  let playerHurtRecoverLeft = 0
  let playerHurtAirSince = 0
  let playerInvulnUntil = 0

  /** Stunned vignette + stars: stays up until hurt ends and post-knock invuln expires. */
  let stunnedFxActive = false

  function hideStunnedFxOverlay(): void {
    if (!stunnedOverlayEl || !stunnedStarsEl) return
    stunnedFxActive = false
    stunnedOverlayEl.hidden = true
    stunnedOverlayEl.classList.remove('stunned-overlay--active')
    stunnedStarsEl.replaceChildren()
  }

  function triggerStunnedHitOverlay(): void {
    if (!stunnedOverlayEl || !stunnedStarsEl) return
    stunnedStarsEl.replaceChildren()
    stunnedOverlayEl.classList.remove('stunned-overlay--active')
    void stunnedOverlayEl.offsetWidth
    stunnedOverlayEl.classList.add('stunned-overlay--active')

    const w = window.innerWidth
    const h = window.innerHeight
    const minDim = Math.min(w, h)
    const count = 4 + Math.floor(Math.random() * 4)
    const spreadMul = MathUtils.clamp(gameConfig.stunnedStarSpreadMul, 0.4, 2.35)
    const spinMul = MathUtils.clamp(gameConfig.stunnedStarSpinMul, 0.45, 5)
    const scaleMul = MathUtils.clamp(gameConfig.stunnedStarScaleMul, 0.35, 2.5)

    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2
      const r0 = 0.22 + Math.random() * 0.26
      const r = Math.min(minDim * 0.54, minDim * r0 * spreadMul)
      const jitter = 0.08 * spreadMul
      const cx = w * 0.5 + Math.cos(ang) * r + (Math.random() - 0.5) * minDim * jitter
      const cy = h * 0.5 + Math.sin(ang) * r + (Math.random() - 0.5) * minDim * jitter
      const slotRot = Math.random() * 360
      const px = (72 + Math.random() * 148) * scaleMul
      const spinS = (0.42 + Math.random() * 0.55) * spinMul
      const shimDur = (0.58 + Math.random() * 0.62) * Math.sqrt(spinMul)

      const slot = document.createElement('div')
      slot.className = 'stunned-overlay__star-slot'
      slot.style.left = `${cx}px`
      slot.style.top = `${cy}px`
      slot.style.transform = `translate(-50%, -50%) rotate(${slotRot}deg)`

      const shim = document.createElement('div')
      shim.className = 'stunned-overlay__star-shim'
      shim.style.setProperty('--shim-dur', `${shimDur}s`)

      const img = document.createElement('img')
      img.className = 'stunned-overlay__star-img'
      img.src = stunnedStarUrl
      img.alt = ''
      img.decoding = 'async'
      img.draggable = false
      img.style.width = `${px}px`
      img.style.animationDuration = `${spinS}s`
      img.style.animationDirection = Math.random() < 0.5 ? 'reverse' : 'normal'

      shim.appendChild(img)
      slot.appendChild(shim)
      stunnedStarsEl.appendChild(slot)
    }

    stunnedOverlayEl.hidden = false
    stunnedFxActive = true
  }

  function syncStunnedFxOverlay(): void {
    if (!stunnedFxActive || !stunnedOverlayEl) return
    const now = performance.now()
    const done = playerHurt === 'none' && now >= playerInvulnUntil
    if (done) hideStunnedFxOverlay()
  }

  function deriveLocalAnimBase(): NetAnimBase {
    if (playerHurt !== 'none') return 'hitreact'
    if (!grounded || performance.now() < slideAnimUntilMs) return 'jumping'
    const moving =
      keys.forward ||
      keys.back ||
      keys.left ||
      keys.right ||
      Math.abs(velocity.x) > 0.08 ||
      Math.abs(velocity.z) > 0.08
    return moving ? 'running' : 'idle'
  }

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
    /* While in debug room, never trigger a round reset on slider edits — the user is live-tuning. */
    if (gameConfig.debugRoomActive >= 0.5) return
    if (tweakConfigDebounce) window.clearTimeout(tweakConfigDebounce)
    tweakConfigDebounce = window.setTimeout(() => {
      tweakConfigDebounce = null
      tweakConfigResetChain = tweakConfigResetChain.then(() => resetRoundAfterTweakEdit())
    }, 420)
  }

  /* Debug Room: stay on the existing arena (no off-deck blast zone), force a dummy bot in front, suppress
     round resets on tweak. Restores prior state on exit. Disabled in online/PvP mode. */
  let debugRoomActiveLast = 0
  const debugRoomSaved = {
    playerX: 0,
    playerY: 0,
    playerZ: 0,
    botX: 0,
    botY: 0,
    botZ: 0,
    botMode: 'dummy' as BotMode,
    pcCollisionView: 0,
  }
  /** Place player + dummy at the corner of the deck so they don't collide with regular spawn or fall off. */
  const DEBUG_ROOM_PLAYER_FEET = new Vector3(-18, 0, -18)
  const DEBUG_ROOM_BOT_OFFSET = new Vector3(0, 0, 4) // 4m in front along +Z
  function updateDebugRoom(): void {
    const requested = gameConfig.debugRoomActive >= 0.5 ? 1 : 0
    /* Online / PvP: refuse and reset the flag so the user gets a clear no-op rather than weird teleports. */
    if (requested === 1 && (isOnline || bot.mode === 'network')) {
      gameConfig.debugRoomActive = 0
      return
    }
    if (requested === debugRoomActiveLast) return
    if (requested === 1) {
      debugRoomSaved.playerX = camera.position.x
      debugRoomSaved.playerY = camera.position.y
      debugRoomSaved.playerZ = camera.position.z
      debugRoomSaved.botX = bot.root.position.x
      debugRoomSaved.botY = bot.root.position.y
      debugRoomSaved.botZ = bot.root.position.z
      debugRoomSaved.botMode = bot.mode
      debugRoomSaved.pcCollisionView = gameConfig.pcCollisionView
      gameConfig.pcCollisionView = 1

      const botStart = new Vector3(
        DEBUG_ROOM_PLAYER_FEET.x + DEBUG_ROOM_BOT_OFFSET.x,
        bot.getFootOffset() + 0.08,
        DEBUG_ROOM_PLAYER_FEET.z + DEBUG_ROOM_BOT_OFFSET.z,
      )
      if (bot.mode !== 'dummy') {
        bot.dispose(scene)
        bot = new BotFighter(scene, 'dummy', botStart)
      } else {
        bot.root.position.copy(botStart)
      }
      bot.resetRoundState()

      camera.position.set(
        DEBUG_ROOM_PLAYER_FEET.x,
        DEBUG_ROOM_PLAYER_FEET.y + eyeH(),
        DEBUG_ROOM_PLAYER_FEET.z,
      )
      velocity.set(0, 0, 0)
      vy = 0
      grounded = true
    } else {
      gameConfig.pcCollisionView = debugRoomSaved.pcCollisionView
      camera.position.set(debugRoomSaved.playerX, debugRoomSaved.playerY, debugRoomSaved.playerZ)
      velocity.set(0, 0, 0)
      vy = 0
      if (bot.mode !== debugRoomSaved.botMode) {
        bot.dispose(scene)
        bot = new BotFighter(
          scene,
          debugRoomSaved.botMode,
          new Vector3(debugRoomSaved.botX, debugRoomSaved.botY, debugRoomSaved.botZ),
        )
      } else {
        bot.root.position.set(debugRoomSaved.botX, debugRoomSaved.botY, debugRoomSaved.botZ)
      }
      bot.resetRoundState()
    }
    debugRoomActiveLast = requested
  }

  async function resetRoundAfterTweakEdit(): Promise<void> {
    while (rematchSequenceActive) await sleepMs(55)

    chargingLmb = false
    voice.resetChargeMeter()
    voiceChargeSmoothed = 0
    if (chargeBarFill) chargeBarFill.style.width = '0%'
    if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--overload')
    if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--ready')
    updateChargeStatusUi(0)
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
    seriesWinsSelf = 0
    seriesWinsOpp = 0
    playerPercent = 0
    enemyPercent = 0
    playerHurt = 'none'
    playerHurtRecoverLeft = 0
    playerInvulnUntil = 0
    if (matchEndOverlay) matchEndOverlay.hidden = true
    browserHost?.reset()
    pendingPeerShotAudioById.clear()
    pendingAttackerShotAudioById.clear()
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
    countdownOverlay.classList.remove('countdown-overlay--opaque')
    voiceResumeCountdownActive = false
  }

  function pvpExpectedSpawn(): { camZ: number; oppZ: number; oppRootY: number } {
    const spacing = arenaSpacing()
    const { camZ, opponentBotZ } = pvpSpawnZs(spacing)
    const oppRootY = bot.getFootOffset() + 0.08
    return { camZ, oppZ: opponentBotZ, oppRootY }
  }

  /** Wait until local camera + replicated opponent capsule are near spawn (extends countdown). */
  async function waitForPvpSpawnSettled(maxWaitMs: number): Promise<void> {
    if (!isOnline || lobby.mode !== 'online' || bot.mode !== 'network') return
    const t0 = performance.now()
    const epsXZ = 2.6
    const epsY = 2.2
    const exp = pvpExpectedSpawn()
    const expOpp = new Vector3(0, exp.oppRootY, exp.oppZ)
    while (performance.now() - t0 < maxWaitMs) {
      const camOk =
        Math.abs(camera.position.x) < epsXZ &&
        Math.abs(camera.position.z - exp.camZ) < epsXZ &&
        Math.abs(feetY()) < 1.15
      const opp = bot.root.position
      const oppOk = opp.distanceTo(expOpp) < epsXZ && Math.abs(opp.y - exp.oppRootY) < epsY
      if (camOk && oppOk) return
      await sleepMs(72)
    }
  }

  function triggerLocalVictimWhiteFlash(): void {
    victimWhiteFlashUntil = performance.now() + gameConfig.hitVictimWhiteFlashMs
    triggerStunnedHitOverlay()
  }

  async function flashSeriesScoreLineThenHide(): Promise<void> {
    if (!seriesScoreOverlay || !seriesScoreLineEl) return
    const you = displayPlayerName()
    const opp = opponentHudName()
    seriesScoreLineEl.textContent = `${you} ${seriesWinsSelf} – ${opp} ${seriesWinsOpp}`
    seriesScoreOverlay.hidden = false
    seriesScoreOverlay.classList.remove('series-score-overlay--pulse')
    void seriesScoreOverlay.offsetWidth
    seriesScoreOverlay.classList.add('series-score-overlay--pulse')
    await sleepMs(2400)
    seriesScoreOverlay.classList.remove('series-score-overlay--pulse')
    seriesScoreOverlay.hidden = true
  }

  async function beginNextSeriesRoundFromElimination(): Promise<void> {
    browserHost?.reset()
    if (lobby.mode === 'online' && lobby.role === 'host' && isAuthoritativeListenServer()) {
      sendMp({ type: 'seriesHostBeginNext' })
    }
    winFinisher = null
    hideWinGameSplash()
    playerPercent = 0
    enemyPercent = 0
    matchOutcome = null
    pendingOutgoingRematchId = null
    pendingIncomingRematchId = null
    hideMatchEndAndRematchUiFully()
    if (matchEndOverlay) matchEndOverlay.hidden = true
    spawnActors()
    syncHud()
    await runPvpCountdown321()
    tryPointerLock()
  }

  async function concludeRoundElimination(iWonRound: boolean): Promise<void> {
    if (seriesTransitionActive || matchOutcome) return
    seriesTransitionActive = true
    try {
      if (iWonRound) seriesWinsSelf += 1
      else seriesWinsOpp += 1
      await flashSeriesScoreLineThenHide()
      if (seriesWinsSelf >= 2 || seriesWinsOpp >= 2) {
        endMatch(seriesWinsSelf >= 2 ? 'win' : 'lose', { seriesFinal: true })
        return
      }
      await beginNextSeriesRoundFromElimination()
    } finally {
      seriesTransitionActive = false
    }
  }

  async function runPvpCountdown321(): Promise<void> {
    if (!countdownOverlay || !countdownNumEl) return
    hideMatchEndAndRematchUiFully()
    if (matchEndOverlay) matchEndOverlay.hidden = true
    countdownOverlay.classList.add('countdown-overlay--opaque')
    if (countdownTitleEl) {
      countdownTitleEl.hidden = false
      countdownTitleEl.textContent = 'Match begins in'
    }
    countdownOverlay.hidden = false
    for (const n of [3, 2, 1] as const) {
      if (isOnline && lobby.mode === 'online' && bot.mode === 'network') {
        await waitForPvpSpawnSettled(4800)
      }
      countdownNumEl.textContent = String(n)
      countdownOverlay.classList.remove('countdown-overlay--pulse')
      void countdownOverlay.offsetWidth
      countdownOverlay.classList.add('countdown-overlay--pulse')
      await sleepMs(840)
    }
    if (countdownTitleEl) countdownTitleEl.hidden = true
    countdownOverlay.hidden = true
    countdownOverlay.classList.remove('countdown-overlay--pulse')
    countdownOverlay.classList.remove('countdown-overlay--opaque')
  }

  async function runMatchBeginCountdown(): Promise<void> {
    await runPvpCountdown321()
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
    stopPublicHostAnnounce()
    lobbyDummyPractice = false
    mpSeqStarted = true
    seriesWinsSelf = 0
    seriesWinsOpp = 0

    if (isOnline && lobby.mode === 'online') {
      spawnActors()
      const spacing = arenaSpacing()
      const { opponentBotZ } = pvpSpawnZs(spacing)
      bot.dispose(scene)
      botMode = 'network'
      bot = new BotFighter(scene, 'network', new Vector3(0, 0, opponentBotZ), {
        bodyColor: randomOpponentCapsuleColor(),
      })
      bot.root.position.set(0, bot.getFootOffset() + 0.08, opponentBotZ)
      bot.networkTargetPos.copy(bot.root.position)
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
      if (!mpOpponentName) {
        const hint =
          lobby.mode === 'online' && lobby.role === 'guest'
            ? lobby.listingHostName?.trim() || null
            : null
        mpOpponentName = hint || 'Player'
      }
      void runMpBeginNow()
    }, 550)
  }

  function generateRematchRoundId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }

  /** Hide match-end overlay and all rematch negotiation UI (incoming / waiting / cancel). */
  function hideMatchEndAndRematchUiFully(): void {
    if (matchEndOverlay) matchEndOverlay.hidden = true
    if (matchRematchIncomingEl) matchRematchIncomingEl.hidden = true
    if (matchRematchPrimaryActionsEl) matchRematchPrimaryActionsEl.hidden = true
    if (matchRematchBtnEl) matchRematchBtnEl.hidden = true
    if (matchCloseBtnEl) matchCloseBtnEl.hidden = true
    if (matchRematchStatusEl) {
      matchRematchStatusEl.hidden = true
      matchRematchStatusEl.textContent = ''
    }
    if (matchRematchCancelBtnEl) matchRematchCancelBtnEl.hidden = true
  }

  /** After a match ends: show Rematch + Continue (no incoming offer). */
  function showMatchEndRematchControlsDefault(): void {
    if (!matchOutcome) return
    if (matchRematchIncomingEl) matchRematchIncomingEl.hidden = true
    if (matchRematchPrimaryActionsEl) matchRematchPrimaryActionsEl.hidden = false
    if (matchRematchBtnEl) matchRematchBtnEl.hidden = false
    if (matchCloseBtnEl) matchCloseBtnEl.hidden = false
    if (matchRematchStatusEl) {
      matchRematchStatusEl.hidden = true
      matchRematchStatusEl.textContent = ''
    }
    if (matchRematchCancelBtnEl) matchRematchCancelBtnEl.hidden = true
  }

  function syncMatchEndRematchControlsIdle(): void {
    if (matchOutcome) {
      showMatchEndRematchControlsDefault()
    } else {
      hideMatchEndAndRematchUiFully()
    }
  }

  function returnToLobbyReload(notifyOpponent: boolean = false): void {
    if (notifyOpponent && isOnline && lobby.mode === 'online' && (mpSocket?.readyState === 1 || rtcGame)) {
      try {
        sendGameTraffic({ type: 'matchCancelled' })
      } catch {
        /* ignore */
      }
    }
    try {
      mpSocket?.close()
    } catch {
      /* ignore */
    }
    const delay = notifyOpponent ? 150 : 80
    window.setTimeout(() => {
      window.location.reload()
    }, delay)
  }

  function beginOnlineRematchRequest(): void {
    if (!isOnline || lobby.mode !== 'online' || !matchOutcome) return
    if (pendingIncomingRematchId !== null) return
    const id = generateRematchRoundId()
    pendingOutgoingRematchId = id
    sendGameTraffic({ type: 'rematchOffer', roundId: id })
    if (matchRematchBtnEl) matchRematchBtnEl.hidden = true
    if (matchRematchStatusEl) {
      matchRematchStatusEl.hidden = false
      matchRematchStatusEl.textContent = 'Waiting for rematch…'
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
      hideMatchEndAndRematchUiFully()
      void runRematchSequence()
      return
    }
    pendingIncomingRematchId = roundId
    if (matchRematchPrimaryActionsEl) matchRematchPrimaryActionsEl.hidden = true
    if (matchRematchBtnEl) matchRematchBtnEl.hidden = true
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
      hideMatchEndAndRematchUiFully()
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
      const ph = data.percentHost
      const pg = data.percentGuest
      const gain =
        typeof data.percentGain === 'number' && Number.isFinite(data.percentGain) ? data.percentGain : 0
      const victimRoleKnown =
        data.victimRole === 'host' || data.victimRole === 'guest' ? data.victimRole : undefined
      let crossedLaunch150 = false
      if (
        typeof ph === 'number' &&
        typeof pg === 'number' &&
        victimRoleKnown &&
        gain > 0
      ) {
        const victimNew = victimRoleKnown === 'host' ? ph : pg
        const victimOld = victimNew - gain
        crossedLaunch150 = victimNew >= 150 && victimOld < 150 - 1e-6
      }
      if (typeof ph === 'number' && typeof pg === 'number') {
        if (lobby.role === 'host') {
          playerPercent = ph
          enemyPercent = pg
        } else {
          playerPercent = pg
          enemyPercent = ph
        }
        syncHud()
      }
      if (crossedLaunch150) triggerLaunchPercent150Spectacle()
      const aggressorRole =
        data.aggressorRole === 'host' || data.aggressorRole === 'guest'
          ? data.aggressorRole
          : undefined
      if (aggressorRole === lobby.role) {
        triggerAggressorHitConfirmFx()
        const vr = data.victimRole === 'host' || data.victimRole === 'guest' ? data.victimRole : undefined
        if (vr && vr !== lobby.role) {
          bot.flashVictimInvuln(gameConfig.hitVictimWhiteFlashMs)
        }
        const sid = typeof data.shotId === 'string' ? data.shotId : null
        if (sid) {
          const attackerClip = pendingAttackerShotAudioById.get(sid)
          if (attackerClip) {
            voice.resumeAudio()
            voice.playBuffer(attackerClip)
            pendingAttackerShotAudioById.delete(sid)
          }
        }
      }
      if (
        data.victimRole === lobby.role &&
        typeof data.dx === 'number' &&
        typeof data.dz === 'number'
      ) {
        /* `playerPercent` was just set from auth payload — that is always the local player's launch %. */
        applyPeerMeleeHit(data.dx, data.dz, {
          authoritative: true,
          victimPercent: playerPercent,
          overkill150: crossedLaunch150,
        })
        const sid = data.shotId
        if (typeof sid === 'string') {
          const clip = pendingPeerShotAudioById.get(sid)
          if (clip) {
            voice.resumeAudio()
            voice.playBuffer(clip)
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
      if (!matchOutcome && !seriesTransitionActive) {
        const wr =
          data.winnerRole === 'host' || data.winnerRole === 'guest' ? data.winnerRole : undefined
        if (wr) void concludeRoundElimination(wr === lobby.role)
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
    if (ty === 'rematchDeclineToLobby') {
      hideMatchEndAndRematchUiFully()
      returnToLobbyReload()
      return
    }

    if (ty === 'matchCancelled' && lobby.mode === 'online') {
      if (matchCancelledOverlay) {
        try {
          controls.unlock()
        } catch {
          /* ignore */
        }
        matchCancelledOverlay.hidden = false
        requestAnimationFrame(() => matchCancelledOkBtn?.focus())
      } else {
        returnToLobbyReload(false)
      }
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
      bot.setRecordingTelegraph(data.recording === true)
      const baseRaw = typeof data.animBase === 'string' ? data.animBase : null
      const base: 'idle' | 'running' | 'jumping' | 'hitreact' =
        baseRaw === 'idle' ||
        baseRaw === 'running' ||
        baseRaw === 'jumping' ||
        baseRaw === 'hitreact'
          ? baseRaw
          : data.recording === true
            ? 'idle'
            : 'idle'
      const oneShotRaw = typeof data.animOneShot === 'string' ? data.animOneShot : null
      const oneShot: 'recording' | 'shooting' | null =
        oneShotRaw === 'recording' || oneShotRaw === 'shooting' ? oneShotRaw : null
      const epoch = typeof data.animEpoch === 'number' ? data.animEpoch : undefined
      bot.setRemoteAnimState(base, oneShot, epoch)
      if (typeof data.speedN === 'number') bot.speedN = Math.max(0, Math.min(1, data.speedN))
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
          shotScale: typeof data.shotScale === 'number' ? data.shotScale : 1,
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
      if (!matchOutcome && !seriesTransitionActive) void concludeRoundElimination(false)
      return
    }

    if (ty === 'youWin') {
      if (!matchOutcome && !seriesTransitionActive) void concludeRoundElimination(true)
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
    opts?: { authoritative?: boolean; victimPercent?: number; overkill150?: boolean },
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
    const victimPct = Math.max(0, opts?.victimPercent ?? playerPercent)

    if (opts?.overkill150) {
      playerKnock.copy(_knDir).multiplyScalar(10_000)
      vy += 4200
      triggerLocalVictimWhiteFlash()
      victimWhiteFlashUntil = Math.max(
        victimWhiteFlashUntil,
        performance.now() + Math.max(gameConfig.hitVictimWhiteFlashMs, 960),
      )
      return
    }

    const launchMul = launchKnockMulFromPercent(victimPct)
    const pctN = Math.max(0, Math.min(1, victimPct / 100))
    const highGate = Math.max(0.05, Math.min(0.98, gameConfig.knockHighPctVictimThreshold))
    const highMul =
      pctN > highGate ? Math.max(0.05, Math.min(1.5, gameConfig.knockHighPctSpeedMul)) : 1
    const impulseMul = Math.max(0.05, Math.min(1.5, gameConfig.knockLaunchImpulseMul)) * highMul
    const pctLift = Math.min(2.5, victimPct / 100)
    const vyMul = 1 + pctLift * 0.52
    playerKnock.addScaledVector(
      _knDir,
      gameConfig.knockbackOnPlayer *
        gameConfig.playerHurtKnockMul *
        comboMul *
        launchMul *
        impulseMul,
    )
    vy += gameConfig.playerHurtVyBoost * comboMul * vyMul
    triggerHitImpactFx()
    triggerLocalVictimWhiteFlash()
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
    shotScale: number
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
      bot.injectWorldProjectile(o, v, buf, data.shotScale)
      if (buf && pendingVictimVoiceShotIds.has(data.shotId)) {
        pendingVictimVoiceShotIds.delete(data.shotId)
        pendingPeerShotAudioById.delete(data.shotId)
        voice.resumeAudio()
        voice.playBuffer(buf)
      }
    } catch {
      debugMpLog('peer voiceShot decode/inject failed')
    }
  }

  async function releaseVoiceShot(): Promise<void> {
    const blob = await voice.finishChargeRecording()
    queueLocalAnimOneShot('shooting')
    const buf = await voice.decodeRecording(blob)
    const raw = voiceInputBlocked
      ? Math.max(0, Math.min(1, gameConfig.voiceDryFireT))
      : voiceChargeSmoothed
    const minCharge = Math.max(0.01, Math.min(1, gameConfig.voiceMinChargeToFire))
    if (raw < minCharge) return
    const cap = Math.round(gameConfig.voiceShotAmmoMax)
    if (cap > 0 && voiceAmmoLeft <= 0) return
    const span = Math.max(0.05, 1 - minCharge)
    const t = Math.min(1, (raw - minCharge) / span)
    const speedMul =
      gameConfig.voiceShotSpeedMinMul +
      t * (gameConfig.voiceShotSpeedMaxMul - gameConfig.voiceShotSpeedMinMul)
    const sizeMul = Math.max(
      0.15,
      gameConfig.projectileSizeBase * (1 + gameConfig.projectileSizeChargeMaxBonus * t),
    )

    /* Build the monkey-mouth muzzle in world space (forward / up / right offsets from the camera) and fire from there. */
    camera.getWorldDirection(_aimDir)
    _camFwd.copy(_aimDir).normalize()
    _camRight.crossVectors(_camFwd, _worldUp)
    if (_camRight.lengthSq() < 1e-6) _camRight.set(1, 0, 0)
    _camRight.normalize()
    _muzzleWorld
      .copy(camera.position)
      .addScaledVector(_camFwd, gameConfig.pcMouthForward)
      .addScaledVector(_worldUp, gameConfig.pcMouthHeight)
      .addScaledVector(_camRight, gameConfig.pcMouthSide)
    const fired = arms.tryFire(speedMul, buf, t, sizeMul, _muzzleWorld, _aimDir)
    if (fired) {
      voice.stopVoiceClipPlayback()
      voice.resetChargeMeter()
      voiceChargeSmoothed = 0
      if (chargeBarFill) chargeBarFill.style.width = '0%'
      if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--overload')
      if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--ready')
      if (voiceDownBoostReady && camera.rotation.x <= -gameConfig.voiceLookdownPitchMin) {
        vy = Math.min(
          gameConfig.voiceLookdownBoostMaxVy,
          vy + Math.max(0, gameConfig.voiceLookdownBoostVy),
        )
        grounded = false
        voiceDownBoostReady = false
      }
    }
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
          chargeT: raw,
          shotScale: sizeMul,
          mime: blob.type || 'audio/webm',
          audioB64,
          fromRole: lobby.role,
        }
        if (buf) {
          pendingAttackerShotAudioById.set(shotId, buf)
          if (pendingAttackerShotAudioById.size > 240) {
            const first = pendingAttackerShotAudioById.keys().next().value as string | undefined
            if (first) pendingAttackerShotAudioById.delete(first)
          }
        }
        sendGameTraffic(payload)
        if (lobby.role === 'host' && browserHost) {
          browserHost.processVoiceShot('host', payload)
        }
      } catch {
        mpDiagCounters.voiceShotSendFail++
        debugMpLog('local voiceShot build/send failed (clip size?)')
      }
    }
  }

  function syncHud(): void {
    if (percentLabelYouEl) percentLabelYouEl.textContent = `${displayPlayerName()}[you]`
    if (percentLabelFoeEl) percentLabelFoeEl.textContent = opponentHudName()
    if (percentYouEl)
      percentYouEl.textContent = `${Math.round(Math.min(999, Math.max(0, playerPercent)))}%`
    if (percentFoeEl)
      percentFoeEl.textContent = `${Math.round(Math.min(999, Math.max(0, enemyPercent)))}%`
    if (chargeBarMinMark) {
      chargeBarMinMark.style.left = `${Math.max(0, Math.min(1, gameConfig.voiceMinChargeToFire)) * 100}%`
    }
    updateChargeStatusUi(voiceChargeSmoothed)
  }

  function updateChargeStatusUi(charge: number): void {
    if (!chargeBarWrap || !chargeBarStatus) return
    const min = Math.max(0.01, Math.min(1, gameConfig.voiceMinChargeToFire))
    const ready = charge >= min && !voiceInputBlocked && !multiplayerBlocksPlay()
    chargeBarStatus.textContent = ready ? 'Ready to Shoot' : 'Make Sound to Charge'
    chargeBarStatus.classList.toggle('charge-bar-label--ready', ready)
    chargeBarStatus.classList.toggle('charge-bar-label--prompt', !ready)
    chargeBarStatus.classList.toggle('shimmer', ready)
    chargeBarWrap.classList.toggle('charge-bar-wrap--ready', ready)
  }

  let dashTiltDeg = 0
  let slideAnimUntilMs = 0

  function arenaSpacing(): number {
    const arenaHalf = Math.min(gameConfig.groundWidth, gameConfig.groundDepth) * 0.5 - 2.5
    return Math.min(6.8, arenaHalf * 0.38)
  }

  /** Effective eye height = base + live bias from PlayerCamera tweaks (clamped to a sane min). */
  function eyeH(): number {
    return Math.max(0.2, gameConfig.eyeHeight + gameConfig.pcCameraHeightBias)
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
    const { camZ, opponentBotZ } = pvpSpawnZs(spacing)

    const yaw =
      lobby.mode === 'online' && lobby.role === 'guest' ? Math.PI : 0

    camera.position.set(0, eyeH(), camZ)
    camera.rotation.reorder('YXZ')
    camera.rotation.set(0, yaw, 0)

    const oppRootY = bot.getFootOffset() + 0.08
    bot.root.position.set(0, oppRootY, opponentBotZ)
    bot.root.rotation.set(0, 0, 0)
    bot.resetRoundState()
    if (bot.mode === 'network') {
      bot.networkTargetPos.copy(bot.root.position)
    }
    bot.alignFacingToward(camera.position)

    dashTiltDeg = 0
    slideAnimUntilMs = 0
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
    hideStunnedFxOverlay()
    bot.setRecordingTelegraph(false)
    /** Spawn pose is always on the deck; keep in sync when movement ticks are skipped (e.g. voice countdown). */
    grounded = true
    voiceDownBoostReady = true
    airDashReady = true
    airJumpsLeft = Math.max(0, Math.round(gameConfig.airJumpsMax))
    applySunShadowFrustum()
    syncBlastBoundsLine()
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
      void concludeRoundElimination(true)
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

  function percentGainFromCharge(charge: number): number {
    const minCharge = Math.max(0.01, Math.min(0.99, gameConfig.voiceMinChargeToFire))
    const c = Math.max(minCharge, Math.min(1, charge))
    const t = (c - minCharge) / (1 - minCharge + 1e-6)
    return gameConfig.percentGainMin + t * (gameConfig.percentGainMax - gameConfig.percentGainMin)
  }

  function launchKnockMulFromPercent(victimPercent: number): number {
    const p = Math.max(0, Math.min(250, victimPercent)) / 100
    const expo = Math.max(0.25, gameConfig.launchKnockExponent)
    return (
      Math.max(0, gameConfig.launchKnockFloor) +
      Math.max(0, gameConfig.launchKnockScale) * Math.pow(p, expo)
    )
  }

  /** When a victim crosses 150% launch — heavy shake + main hit-flash on this client (host and guest). */
  function triggerLaunchPercent150Spectacle(): void {
    shakeIntensity = Math.max(shakeIntensity, 5.4)
    flashIntensity = Math.max(flashIntensity, 1)
  }

  async function runRematchSequence(): Promise<void> {
    rematchSequenceActive = true
    pendingOutgoingRematchId = null
    pendingIncomingRematchId = null
    matchOutcome = null
    seriesWinsSelf = 0
    seriesWinsOpp = 0
    hideMatchEndAndRematchUiFully()
    chargingLmb = false
    controls.unlock()
    keys.forward = false
    keys.back = false
    keys.left = false
    keys.right = false
    winFinisher = null
    hideWinGameSplash()
    playerPercent = 0
    enemyPercent = 0
    syncHud()
    browserHost?.reset()
    hideMatchEndAndRematchUiFully()

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

    await runPvpCountdown321()

    rematchSequenceActive = false
    hideMatchEndAndRematchUiFully()
    if (matchEndOverlay) matchEndOverlay.hidden = true
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

  function endMatch(outcome: 'win' | 'lose', opts?: { seriesFinal?: boolean }): void {
    if (matchOutcome) return
    clearMovementKeys()
    hideWinGameSplash()
    winFinisher = null
    matchOutcome = outcome
    controls.unlock()
    if (matchEndOverlay) matchEndOverlay.hidden = false
    if (matchEndTitle) {
      if (opts?.seriesFinal) {
        matchEndTitle.textContent = outcome === 'win' ? 'You win the set!' : 'You lose the set!'
      } else {
        matchEndTitle.textContent = outcome === 'win' ? 'You win!' : 'You lose!'
      }
    }
    if (matchEndSub) {
      if (opts?.seriesFinal) {
        matchEndSub.textContent = `Best of 3 · ${seriesWinsSelf} – ${seriesWinsOpp}`
      } else {
        matchEndSub.textContent =
          outcome === 'win'
            ? 'Opponent got launched out of bounds.'
            : 'You were launched out of bounds.'
      }
    }
    if (isOnline && lobby.mode === 'online') {
      showMatchEndRematchControlsDefault()
    }
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
    return camera.position.y - eyeH()
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
        camera.position.y = bestFloorY + eyeH()
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
      camera.position.y = deckTop + eyeH()
      vy = Math.min(vy, 0)
      grounded = true
    }
  }

  function tryJump() {
    if (
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      multiplayerBlocksPlay() ||
      playerHurt !== 'none'
    )
      return
    const now = performance.now()
    if (now - lastJumpAt < gameConfig.jumpCooldownMs) return
    if (grounded) {
      vy = gameConfig.jumpForce
      grounded = false
      lastJumpAt = now
      return
    }
    /* Mid-air double jump: replace (not add to) vertical velocity for a clean second pop. */
    if (airJumpsLeft > 0) {
      vy = gameConfig.jumpForce
      airJumpsLeft -= 1
      lastJumpAt = now
    }
  }

  /** Slide direction matches WASD in camera-local space. */
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

  function trySlide(): void {
    if (
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      multiplayerBlocksPlay() ||
      dashCdMs > 0 ||
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      playerHurt !== 'none'
    )
      return
    const onDeck = grounded
    if (!onDeck && !airDashReady) return
    computeDashDirection(_knDir)
    const distance = Math.max(0, gameConfig.dashImpulse) * Math.max(0.1, gameConfig.dashVelocityMul)
    const decay = Math.max(0.5, gameConfig.dashDecay)
    const startSpeed = distance * decay
    dashVel.copy(_knDir).multiplyScalar(startSpeed)

    camera.getWorldDirection(_camFwd)
    _camFwd.y = 0
    if (_camFwd.lengthSq() < 1e-8) _camFwd.set(0, 0, -1)
    _camFwd.normalize()
    _camRight.crossVectors(_camFwd, _worldUp).normalize()
    const lateral = _camRight.dot(_knDir)
    dashTiltDeg = MathUtils.clamp(lateral * -7.8, -6.8, 6.8)
    gameRoot.classList.add('game-root--dash-tilt')
    slideAnimUntilMs = performance.now() + 320

    dashCdMs = gameConfig.dashCooldownMs
    if (!onDeck) airDashReady = false
  }

  function resolveCombat(delta: number): void {
    if (
      matchOutcome ||
      rematchSequenceActive ||
      voiceResumeCountdownActive ||
      multiplayerBlocksPlay() ||
      seriesTransitionActive
    )
      return

    if (winFinisher) {
      if (isBlastZone(camera.position)) {
        winFinisher = null
        hideWinGameSplash()
        void concludeRoundElimination(false)
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
        const shotT = arms.peekShotT()
        const hitAudio = arms.takeHitAudio()
        arms.markDealt()
        voice.playBuffer(hitAudio)
        knockDirFromFistImpact(_fp, _knDir)
        const gain = percentGainFromCharge(shotT)
        const prevEnemyPct = enemyPercent
        enemyPercent = Math.min(999, enemyPercent + gain)
        syncHud()
        if (isPvp()) {
          sendMp({ type: 'hitMelee', dx: _knDir.x, dz: _knDir.z })
          triggerHitImpactFx()
        } else {
          const crossed150 = prevEnemyPct < 150 && enemyPercent >= 150
          if (crossed150) {
            triggerLaunchPercent150Spectacle()
            bot.applyLaunchPercentCataclysm(_knDir)
          } else {
            const launchMul = launchKnockMulFromPercent(enemyPercent)
            bot.applyKnockback(_knDir, gameConfig.knockbackOnBot * launchMul, enemyPercent)
          }
          triggerHitImpactFx()
          bot.flashVictimInvuln(gameConfig.hitVictimWhiteFlashMs)
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
        bot.markHitDealt()
        if (victimClip) voice.playBufferSpatialAt(victimClip, _fp, camera)
        _knDir.subVectors(camera.position, _fp)
        _knDir.y = 0
        if (_knDir.lengthSq() < 1e-8) _knDir.set(0, 0, 1)
        _knDir.normalize()
        const prevPlPct = playerPercent
        const bg = Math.max(0, gameConfig.botFistPercentGain)
        playerPercent = Math.min(999, playerPercent + bg)
        syncHud()
        const crossed150 = prevPlPct < 150 && playerPercent >= 150
        if (crossed150) triggerLaunchPercent150Spectacle()
        applyPeerMeleeHit(_knDir.x, _knDir.z, {
          victimPercent: playerPercent,
          overkill150: crossed150,
        })
      }
    }

    if (!authPvp()) {
      const listenAuth = isOnline && lobby.mode === 'online' && isAuthoritativeListenServer()
      if (isBlastZone(camera.position)) {
        if (lobbyDummyPractice) {
          applyRoundReset()
          return
        }
        if (isPvp() && !listenAuth) sendMp({ type: 'youWin' })
        if (!listenAuth) void concludeRoundElimination(false)
      }
      if (isBlastZone(bot.root.position)) {
        if (lobbyDummyPractice) {
          applyRoundReset()
          return
        }
        if (isPvp() && !listenAuth) sendMp({ type: 'youLose' })
        if (!listenAuth) void concludeRoundElimination(true)
      }
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    /** 1 dummy · 2 smart · 3 toggle bot · R restart (also when match-end overlay is open). */
    const shortcutBlock =
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      rematchSequenceActive ||
      winFinisher ||
      multiplayerBlocksPlay() ||
      seriesTransitionActive
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

    onMovementKeyDown(e)

    if (
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      multiplayerBlocksPlay() ||
      seriesTransitionActive ||
      playerHurt !== 'none'
    )
      return
    switch (e.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        trySlide()
        break
      case 'ControlLeft':
      case 'ControlRight':
        break
      case 'Space':
        e.preventDefault()
        tryJump()
        break
      default:
        break
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    onMovementKeyUp(e)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clearMovementKeys)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearMovementKeys()
  })

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return
    const ammoCap = Math.round(gameConfig.voiceShotAmmoMax)
    if (ammoCap > 0 && voiceAmmoLeft <= 0) return
    if (
      voiceResumeCountdownActive ||
      multiplayerBlocksPlay() ||
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      seriesTransitionActive ||
      playerHurt !== 'none' ||
      arms.isProjectileActive()
    )
      return
    voice.resumeAudio()
    voice.startChargeRecording()
    if (!voiceInputBlocked) queueLocalAnimOneShot('recording')
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
    /* Online lobby / pre-live: freeze local player. Voice resume countdown still runs physics so grounded / jump stay consistent. */
    if (multiplayerBlocksPlay()) return

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
      if (playerHurt === 'air') {
        const p = Math.max(0, Math.min(100, playerPercent)) / 100
        const fadeAt = Math.max(21, Math.min(100, gameConfig.knockAirControlFadePct)) / 100
        const airControl = Math.max(0, 1 - p / fadeAt)
        if (airControl > 1e-4) {
          const iw = Number(keys.forward) - Number(keys.back)
          const ir = Number(keys.right) - Number(keys.left)
          if (Math.abs(iw) + Math.abs(ir) > 1e-6) {
            direction.set(ir, 0, -iw)
            direction.normalize()
            direction.applyQuaternion(camera.quaternion)
            direction.y = 0
            if (direction.lengthSq() > 1e-8) direction.normalize()
            const acc = Math.max(0, gameConfig.knockAirStrafeAccel) * airControl
            playerKnock.addScaledVector(direction, acc * delta)
          }
        }
      }
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

    if (!groundedBeforeResolve && grounded) {
      voiceDownBoostReady = true
      airDashReady = true
      airJumpsLeft = Math.max(0, Math.round(gameConfig.airJumpsMax))
    }

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
        mpDiagSnapshot.scoresYou = Math.round(playerPercent)
        mpDiagSnapshot.scoresOpp = Math.round(enemyPercent)
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
      const fy = camera.position.y - eyeH()
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
        const speedN = Math.min(
          1,
          Math.hypot(velocity.x, velocity.z) / Math.max(0.5, gameConfig.moveSpeed),
        )
        sendGameTraffic({
          type: 'pose',
          x: camera.position.x,
          z: camera.position.z,
          fy,
          ry: camera.rotation.y,
          recording: chargingLmb,
          animBase: deriveLocalAnimBase(),
          animOneShot: localAnimOneShot,
          animEpoch: localAnimEpoch,
          speedN,
        })
      }
    }

    if (multiplayerBlocksPlay() && chargingLmb) {
      chargingLmb = false
      voice.resetChargeMeter()
      voiceChargeSmoothed = 0
      void voice.finishChargeRecording()
      if (chargeBarFill) chargeBarFill.style.width = '0%'
      bot.setRecordingTelegraph(false)
    }

    if (!voiceInputBlocked && !voiceResumeCountdownActive && !multiplayerBlocksPlay()) {
      voiceChargeSmoothed = voice.tickChargeAccum(delta, chargingLmb)
    }
    if (chargeBarFill) {
      const pct = Math.min(150, voiceChargeSmoothed * 100)
      chargeBarFill.style.width = `${pct}%`
    }
    if (chargeBarWrap) {
      if (voiceChargeSmoothed >= gameConfig.voiceOverloadThreshold) {
        chargeBarWrap.classList.add('charge-bar-wrap--overload')
      } else {
        chargeBarWrap.classList.remove('charge-bar-wrap--overload')
      }
    }
    updateChargeStatusUi(voiceChargeSmoothed)

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

    if (!tweaksPanelOpen && !leaveMatchDialogOpen) {
      if (
        !matchOutcome &&
        !rematchSequenceActive &&
        !multiplayerBlocksPlay()
      ) {
        updateMovement(delta)
        resolveCombat(delta)
      } else if (matchOutcome) {
        arms.update(delta)
      }
    } else if (
      (tweaksPanelOpen || leaveMatchDialogOpen) &&
      (playerHurt !== 'none' || stunnedFxActive)
    ) {
      /* Tweaks / leave dialog open: still tick hurt + invuln so stun stars can clear. */
      updateMovement(delta)
    }

    syncStunnedFxOverlay()

    applyHitPresentation(delta)

    // Retro post-process can be tuned live from Tweaks.
    ;(pixelPass as unknown as { setPixelSize?: (v: number) => void }).setPixelSize?.(
      Math.max(1, gameConfig.retroPixelScale),
    )
    pixelPass.depthEdgeStrength = Math.max(0, gameConfig.retroEdgeStrength)
    pixelPass.normalEdgeStrength = Math.max(0, gameConfig.retroEdgeStrength * 0.65)

    /* Debug capsule visualization (red wireframe). Same radius/height/offset for player and foe. */
    {
      const capVisible = gameConfig.pcCollisionView >= 0.5
      const capRadius = Math.max(0.05, gameConfig.pcCapsuleRadius)
      const capHeight = Math.max(capRadius * 2 + 0.02, gameConfig.pcCapsuleHeight)
      syncCapsuleDebug(
        playerCapsuleDebug,
        capRadius,
        capHeight,
        camera.position.x,
        feetY() + gameConfig.pcCapsuleOffsetY + capHeight * 0.5,
        camera.position.z,
        capVisible,
      )
      const ecFeetY = bot.root.position.y - bot.getFootOffset()
      syncCapsuleDebug(
        enemyCapsuleDebug,
        capRadius,
        capHeight,
        bot.root.position.x,
        ecFeetY + gameConfig.pcCapsuleOffsetY + capHeight * 0.5,
        bot.root.position.z,
        capVisible,
      )
    }
    syncBlastBoundsLine()
    /* Debug Room toggle: detect transitions and teleport / restore. Reset suppression is wired via scheduleRoundResetAfterTweak. */
    updateDebugRoom()

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

    if (victimHitFlashEl) {
      const left = victimWhiteFlashUntil - performance.now()
      if (left > 0) {
        victimHitFlashEl.hidden = false
        victimHitFlashEl.style.opacity = String(Math.min(0.62, (left / gameConfig.hitVictimWhiteFlashMs) * 0.58))
      } else {
        victimHitFlashEl.style.opacity = '0'
        victimHitFlashEl.hidden = true
      }
    }

    composer.render()
  }

  renderer.setAnimationLoop(animate)

  function tryPointerLock(): void {
    if (
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      matchOutcome ||
      winFinisher ||
      rematchSequenceActive ||
      voiceInputBlocked ||
      voiceResumeCountdownActive ||
      multiplayerBlocksPlay() ||
      seriesTransitionActive
    )
      return
    void controls.lock()
  }

  function hideLeaveMatchDialog(): void {
    if (!leaveMatchOverlay) return
    leaveMatchDialogOpen = false
    leaveMatchOverlay.hidden = true
    tryPointerLock()
  }

  function showLeaveMatchDialog(): void {
    if (!leaveMatchOverlay) return
    leaveMatchDialogOpen = true
    clearMovementKeys()
    leaveMatchOverlay.hidden = false
    try {
      controls.unlock()
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => leaveMatchCancelBtn?.focus())
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
    if (opponentLabelEl) opponentLabelEl.textContent = opponentHudName()

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
        queueMicrotask(() => maybeStartPublicHostAnnounce())
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
    hideMatchEndAndRematchUiFully()
    void runRematchSequence()
  })
  matchRematchDeclineBtnEl?.addEventListener('click', () => {
    sendGameTraffic({ type: 'rematchDeclineToLobby' })
    pendingIncomingRematchId = null
    pendingOutgoingRematchId = null
    hideMatchEndAndRematchUiFully()
    returnToLobbyReload()
  })

  leaveMatchCancelBtn?.addEventListener('click', () => hideLeaveMatchDialog())
  leaveMatchConfirmBtn?.addEventListener('click', () => {
    hideLeaveMatchDialog()
    if (lobby.mode === 'online') dismissMatchEndOnline()
    if (lobby.mode === 'online') returnToLobbyReload(true)
    else returnToLobbyReload(false)
  })
  matchCancelledOkBtn?.addEventListener('click', () => {
    returnToLobbyReload(false)
  })
  leaveMatchOverlay?.addEventListener('click', (e) => {
    if (e.target === leaveMatchOverlay) hideLeaveMatchDialog()
  })

  /** Escape: always offer exit (capture + before tweaks so T panel still owns Escape when open). */
  function onEscapeLeaveMatch(e: KeyboardEvent): void {
    if (e.code !== 'Escape' || e.repeat) return
    const el = e.target as HTMLElement | null
    if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return
    if (tweaksPanelOpen) return
    if (gameRoot.hidden) return
    e.preventDefault()
    if (leaveMatchDialogOpen) {
      hideLeaveMatchDialog()
      return
    }
    showLeaveMatchDialog()
  }
  window.addEventListener('keydown', onEscapeLeaveMatch, true)
  window.addEventListener(
    'beforeunload',
    () => {
      /* no-op: local monkey mesh is intentionally disabled */
    },
    { once: true },
  )

  const tweaksHost = document.getElementById('tweaks-panel-host')
  if (tweaksHost) {
    mountTweaksPanel(tweaksHost, {
      controls,
      camera,
      ambient,
      sun,
      onToggle(open) {
        tweaksPanelOpen = open
        if (open) clearMovementKeys()
        if (!open) tryPointerLock()
      },
      onConfigChanged: scheduleRoundResetAfterTweak,
      onTriggerKnockbackDev: () => {
        if (multiplayerBlocksPlay()) return
        applyPeerMeleeHit(0.62, -0.74, { authoritative: true, victimPercent: playerPercent })
      },
      ...(isOnline && lobby.mode === 'online'
        ? { onPracticeWithDummy: beginLobbyDummyPractice }
        : {}),
    })
  }

  if (isOnline && lobby.mode === 'online' && lobby.role === 'host' && lobby.startWithDummyPractice) {
    void beginLobbyDummyPractice()
  }
}

runUsernameGate()
  .then(() => runLobbyGate(readStoredPlayerName()?.trim() || 'Angler'))
  .then((lobby) => {
    gameRoot.hidden = false
    initGame(lobby)
  })
