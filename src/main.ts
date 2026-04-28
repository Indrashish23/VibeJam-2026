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
  Euler,
  EdgesGeometry,
  Group,
  BufferGeometry,
  BufferAttribute,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { gameConfig } from './gameConfig'
import { bumpPlayerRecord } from './playerRecord'
import { isMapId, loadMap, type MapHandle, type MapId, type SpawnSlot } from './maps'
import { pickGroundedRespawnFoot } from './spawnRespawn'
import { BotFighter, type BotMode } from './boxing/bot'
import { PlayerArms } from './boxing/playerArms'
import { VoiceChargeManager, audioBufferSliceToWavBlob } from './audio/voiceCharge'
import { playLocalVoiceRecordReleaseSfx, playLocalVoiceRecordStartSfx } from './audio/voiceRecordUiSfx'
import {
  mountTweaksPanel,
  attachHudOverlayDrag,
  resetGameplayHudLayout,
  restoreHudElementPosition,
} from './tweaksPanel'
import {
  startTutorial,
  isTutorialPending,
  clearTutorialDone,
  TUTORIAL_ENABLED,
  type TutorialApi,
} from './tutorial'
import { runLobbyGate, randomRoomId, type LobbyResult, type MatchIntent } from './lobbyGate'
import {
  base64ToBlob,
  blobToBase64,
  decodeVoiceShotAudioFrame,
  encodeVoiceShotAudioFrame,
} from './net/blobCodec'
import {
  createMultiplayerSocket,
  type MultiplayerWire,
} from './net/multiplayerSocket'
import { createBrowserHostAuthority } from './net/browserHostAuthority'
import { isAuthoritativeListenServer } from './net/transportConfig'
import { simBananaThrowToLanding, feetOnPeel, isFeetInPickUpRange } from './net/bananaSim'
import { BananaWorld } from './powerups/bananaWorld'
import { MegaphoneFpProp } from './weapons/megaphoneProp'
import {
  createWebRtcGameChannel,
  type WebRtcGameApi,
} from './net/webrtcGame'
import { LowEndDitherShader } from './post/lowEndDitherShader'
import { CelOutlineShader } from './post/celOutlineShader'
import { readStoredPlayerName, savePlayerName } from './playerName'
import {
  loadUserSettings,
  getCameraShakeMul,
} from './userSettingsStorage'
import {
  initBackgroundMusic,
  setBackgroundMusicGameplaySuppressed,
  wireBackgroundMusicToFirstGesture,
} from './audio/backgroundMusic'
import { playFootstepOneShot } from './audio/footstepsSfx'
import { playTieredHitImpactOneShot } from './audio/combatSfx'
import { playBananaSlipOneShot, playJumpOneShot, playLandOneShot } from './audio/playerMoveSfx'
import { playEnemySfxSpatialAt, resumeEnemySfxAudio, type SfxKind } from './audio/enemySfx'
import { mountUserSettingsPanel, setUserSettingsPointerControls } from './userSettingsUI'
import { setPartyKitHostSession, getPartyKitHost } from './net/partyKitHost'
import { createProceduralSky } from './skyDome'
import { TerrainPhysics } from './physics/terrainPhysics'
import {
  bootstrapMpDebugUrl,
  isMpDebugMode,
  type MpDiagSnapshot,
} from './mpDebugReport'
import {
  HudSmokeLayer,
  launchPercentTextColor,
  PORTRAIT_HURT_URL,
  PORTRAIT_IDLE_URL,
  PORTRAIT_SCREAM_URL,
  PORTRAIT_STUNNED_URL,
  smokeIntensity01,
  triggerHudDamageShake,
} from './hud/localPlayerHud'
/** Stunned FX SVGs live in `public/ui/` so Vercel/production resolves them without bundling `../Assets/`. */
const stunnedEffectBgUrl = `${import.meta.env.BASE_URL}ui/StunnedEffectBg.svg`
const stunnedStarUrl = `${import.meta.env.BASE_URL}ui/StunnedStar.svg`
const chargeBarEmptyUrl = `${import.meta.env.BASE_URL}ui/ChargeBarEmpty.svg`
const chargeBarTopUrl = `${import.meta.env.BASE_URL}ui/ChargeBarTop.svg`
const chargeBarFillMaskUrl = `${import.meta.env.BASE_URL}ui/ChargeBarFillMask.svg`
/** Full chrome layer while voice charge is capped (swap back to {@link chargeBarTopUrl} on release). */
const chargeBarMaxUrl = `${import.meta.env.BASE_URL}ui/ui_chargebar_max.svg`
const chargeMicIconUrl = `${import.meta.env.BASE_URL}ui/mic_icon.svg`

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

const usernameOverlay = document.getElementById('username-overlay') as HTMLDivElement
const usernameForm = document.getElementById('username-form') as HTMLFormElement
const usernameInput = document.getElementById('username-input') as HTMLInputElement
const gameRoot = document.getElementById('game-root') as HTMLDivElement

const hudDamagePctEl = document.getElementById('hud-damage-pct') as HTMLSpanElement | null
const hudDisplayNameEl = document.getElementById('hud-display-name') as HTMLSpanElement | null
const hudPortraitImgEl = document.getElementById('hud-portrait-img') as HTMLImageElement | null
const hudPortraitWrapEl = document.getElementById('hud-portrait-wrap') as HTMLDivElement | null
const hudSmokeCanvasEl = document.getElementById('hud-smoke-canvas') as HTMLCanvasElement | null
const victimHitFlashEl = document.getElementById('victim-hit-flash') as HTMLDivElement | null
const stunnedOverlayEl = document.getElementById('stunned-overlay') as HTMLDivElement | null
const stunnedBgEl = document.getElementById('stunned-bg') as HTMLImageElement | null
const stunnedStarsEl = document.getElementById('stunned-stars') as HTMLDivElement | null

if (stunnedBgEl) stunnedBgEl.src = stunnedEffectBgUrl

const matchEndOverlay = document.getElementById('match-end-overlay') as HTMLDivElement | null
const matchEndTitle = document.getElementById('match-end-title')
const matchEndSub = document.getElementById('match-end-sub')
const matchEndCardEl =
  matchEndOverlay?.querySelector('.match-end-card') as HTMLDivElement | null
const matchEndLobbyBtnEl = document.getElementById('match-end-lobby-btn') as HTMLButtonElement | null
const matchEndSecondaryBtnEl = document.getElementById(
  'match-end-secondary-btn',
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
const winGameSplashTxtEl =
  winGameSplashEl?.querySelector('.win-game-splash__txt') as HTMLDivElement | null
const winGameSplashSubEl = document.getElementById('win-game-splash-sub') as HTMLSpanElement | null
const winReturnLobbyOverlayEl = document.getElementById(
  'win-return-lobby-overlay',
) as HTMLDivElement | null
const sessionReloadOverlayEl = document.getElementById('session-reload-overlay') as HTMLDivElement | null
const countdownOverlay = document.getElementById('countdown-overlay') as HTMLDivElement | null
const countdownNumEl = document.getElementById('countdown-num') as HTMLSpanElement | null
const dashScanEl = document.getElementById('dash-scanlines') as HTMLDivElement | null
const jumpVfxEl = document.getElementById('jump-vfx') as HTMLDivElement | null
const hudViewportEl = document.getElementById('hud-viewport') as HTMLDivElement | null
const percentHudEl = document.getElementById('percent-hud') as HTMLDivElement | null
const hudStockYouNumEl = document.getElementById('hud-stock-you-num') as HTMLSpanElement | null
const hudStockYouWrapEl = document.getElementById('hud-stock-you-wrap') as HTMLDivElement | null
const hudLeftStackEl = document.getElementById('hud-left-stack') as HTMLDivElement | null
const hudDamagePctShellEl = document.getElementById('hud-damage-pct-shell') as HTMLSpanElement | null
const hudPlayerCardEl = document.getElementById('hud-player-card') as HTMLDivElement | null
const hudPortraitColumnEl = document.getElementById('hud-portrait-column') as HTMLDivElement | null
const hudPortraitWrapShellEl = document.getElementById('hud-portrait-wrap-shell') as HTMLDivElement | null
const hudStockYouShellEl = document.getElementById('hud-stock-you-shell') as HTMLDivElement | null
const legacyHudStockFoeShellEl = document.getElementById('hud-stock-foe-shell') as HTMLDivElement | null
/* Safety net: remove any stale foe stock HUD shell from older local markup/builds. */
legacyHudStockFoeShellEl?.remove()
const koAnnounceOverlayEl = document.getElementById('ko-announce-overlay') as HTMLDivElement | null
const koAnnounceNameEl = document.getElementById('ko-announce-name') as HTMLParagraphElement | null
const koAnnounceStockRowEl = document.getElementById('ko-announce-stock-row') as HTMLDivElement | null
const koAnnounceStockNumEl = document.getElementById('ko-announce-stock-num') as HTMLSpanElement | null
const chargeBarWrap = document.getElementById('charge-bar-wrap') as HTMLDivElement | null
const chargeBarFill = document.getElementById('charge-bar-fill') as HTMLDivElement | null
const chargeBarMinMark = document.getElementById('charge-bar-min') as HTMLDivElement | null
const chargeBarStatus = document.getElementById('charge-bar-status') as HTMLDivElement | null
const chargeWedgeEl = document.getElementById('charge-wedge') as HTMLDivElement | null
const chargeHudMicEl = document.getElementById('charge-hud-mic') as HTMLDivElement | null
const chargeHudMicImg = document.querySelector(
  '.charge-hud-mic__img',
) as HTMLImageElement | null
const chargeBarPctEl = document.getElementById('charge-bar-pct') as HTMLSpanElement | null
const chargeWedgeEmptyImg = document.querySelector(
  '.charge-wedge__empty',
) as HTMLImageElement | null
const chargeWedgeTopImg = document.querySelector('.charge-wedge__top') as HTMLImageElement | null

/** Tracks `chargeWedgeTopImg.src` so we only swap chrome SVG when crossing max/release (avoid reload flicker). */
let chargeChromeShowsMaxArt = false

if (chargeWedgeEmptyImg) chargeWedgeEmptyImg.src = chargeBarEmptyUrl
if (chargeWedgeTopImg) chargeWedgeTopImg.src = chargeBarTopUrl
if (chargeHudMicImg) chargeHudMicImg.src = chargeMicIconUrl
if (chargeBarWrap) {
  chargeBarWrap.style.setProperty('--charge-fill-mask', `url('${chargeBarFillMaskUrl}')`)
  chargeBarWrap.style.setProperty('--charge-pct', '0%')
  syncChargeHudLayout()
}
restoreHudElementPosition(percentHudEl, 'percentHud')
restoreHudElementPosition(chargeBarWrap, 'chargeHud')

function setChargeBarDisplayPct(pct0to100: number): void {
  if (!chargeBarWrap) return
  const c = Math.max(0, Math.min(100, pct0to100))
  chargeBarWrap.style.setProperty('--charge-pct', `${c}%`)
}

function syncChargeHudLayout(): void {
  if (!chargeBarWrap) return
  const g = gameConfig
  chargeBarWrap.style.setProperty('--charge-hud-right', `${g.chargeHudRightRem}rem`)
  chargeBarWrap.style.setProperty('--charge-hud-bias', `${g.chargeHudVerticalBiasRem}rem`)
  chargeBarWrap.style.setProperty('--charge-hud-width', `${g.chargeHudWidthRem}rem`)
  chargeBarWrap.style.setProperty('--charge-hud-max-h', `${g.chargeHudMaxHeightVh}vh`)
  chargeBarWrap.style.setProperty('--charge-hud-scale', String(g.chargeHudScale))
  chargeBarWrap.style.setProperty('--charge-hud-pct-left', `${g.chargeHudPctLabelLeftPct}%`)
  chargeBarWrap.style.setProperty('--charge-hud-pct-top', `${g.chargeHudPctLabelTopPct}%`)
  chargeBarWrap.style.setProperty('--charge-hud-pistol-top', `${g.chargeHudPistolOverlayTopPct}%`)
  chargeBarWrap.style.setProperty('--charge-hud-pistol-w', `${g.chargeHudPistolOverlayWidthPct}%`)
  chargeBarWrap.style.setProperty('--charge-hud-ammo-gap', `${g.chargeHudAmmoPopGapRem}rem`)
  chargeBarWrap.style.setProperty('--charge-hud-ammo-y', `${g.chargeHudAmmoPopTopPct}%`)
  chargeBarWrap.style.setProperty('--charge-hud-min-left', `${g.chargeHudMinMarkLeftPct}%`)
  chargeBarWrap.style.setProperty('--charge-hud-min-right', `${g.chargeHudMinMarkRightPct}%`)
  chargeBarWrap.style.setProperty('--charge-hud-mic-gap', `${g.chargeHudMicGapRem}rem`)
  chargeBarWrap.style.setProperty('--charge-hud-mic-w', `${g.chargeHudMicWidthRem}rem`)
  chargeBarWrap.style.setProperty('--charge-hud-mic-y', `${g.chargeHudMicTopOffsetRem}rem`)
  chargeBarWrap.style.setProperty('--charge-hud-mic-pulse', String(g.chargeHudMicPulseScale))
  if (chargeHudMicEl) {
    chargeHudMicEl.classList.toggle('charge-hud-mic--off', g.chargeHudMicEnabled < 0.5)
  }
}

function setHudTransform(
  el: HTMLElement | null,
  oxRem: number,
  oyRem: number,
  ozPx: number,
  scale: number,
): void {
  if (!el) return
  el.style.transform = `translate3d(${oxRem}rem, ${oyRem}rem, ${ozPx}px) scale(${scale})`
}

function syncUiHudChrome(): void {
  const g = gameConfig
  hudViewportEl?.style.setProperty('--ui-hud-master', String(g.uiHudMasterScale))
  if (percentHudEl) {
    const anchorRight = g.percentHudAnchorRight >= 0.5
    const inset = 1.2 + g.percentHudOffsetXRem
    const bottom = 2.2 + g.percentHudOffsetYRem
    percentHudEl.style.setProperty('--percent-hud-scale', String(g.percentHudScale))
    percentHudEl.style.setProperty('--percent-hud-right', anchorRight ? `${inset}rem` : 'auto')
    percentHudEl.style.setProperty('--percent-hud-left', anchorRight ? 'auto' : `${inset}rem`)
    percentHudEl.style.setProperty('--percent-hud-bottom', `${bottom}rem`)
    percentHudEl.style.setProperty('--percent-hud-z', `${g.percentHudOffsetZPx}px`)
    percentHudEl.style.setProperty(
      '--percent-hud-origin',
      anchorRight ? 'bottom right' : 'bottom left',
    )
    percentHudEl.style.setProperty('--hud-damage-pct-scale', String(g.percentHudTextScale))
    percentHudEl.style.setProperty('--hud-damage-pct-ox', `${g.percentHudTextOffsetXRem}rem`)
    percentHudEl.style.setProperty('--hud-damage-pct-oy', `${g.percentHudTextOffsetYRem}rem`)
    percentHudEl.classList.toggle('percent-hud--anchor-left', !anchorRight)
  }

  hudDamagePctEl?.style.setProperty(
    '--hud-damage-pct-font-clamp-mul',
    String(g.hudDamagePctFontClampMul),
  )
  hudDisplayNameEl?.style.setProperty(
    '--hud-display-name-font-scale',
    String(g.hudDisplayNameFontScale),
  )
  setHudTransform(
    hudDisplayNameEl,
    g.hudDisplayNameOffsetXRem,
    g.hudDisplayNameOffsetYRem,
    g.hudDisplayNameOffsetZPx,
    g.hudDisplayNameScale,
  )

  setHudTransform(
    hudLeftStackEl,
    g.hudLeftStackOffsetXRem,
    g.hudLeftStackOffsetYRem,
    g.hudLeftStackOffsetZPx,
    g.hudLeftStackScale,
  )
  setHudTransform(
    hudSmokeCanvasEl,
    g.hudSmokeOffsetXRem,
    g.hudSmokeOffsetYRem,
    g.hudSmokeOffsetZPx,
    g.hudSmokeScale,
  )
  setHudTransform(
    hudDamagePctShellEl,
    g.hudDamagePctShellOffsetXRem,
    g.hudDamagePctShellOffsetYRem,
    g.hudDamagePctShellOffsetZPx,
    g.hudDamagePctShellScale,
  )
  setHudTransform(
    hudPlayerCardEl,
    g.hudPlayerCardOffsetXRem,
    g.hudPlayerCardOffsetYRem,
    g.hudPlayerCardOffsetZPx,
    g.hudPlayerCardScale,
  )

  if (hudPortraitColumnEl) {
    hudPortraitColumnEl.style.transform = `translate3d(${g.hudPortraitColumnOffsetXRem}rem, ${g.hudPortraitColumnOffsetYRem}rem, ${g.hudPortraitColumnOffsetZPx}px) scale(${g.percentHudPortraitScale})`
  }
  setHudTransform(
    hudPortraitWrapShellEl,
    g.hudPortraitWrapShellOffsetXRem,
    g.hudPortraitWrapShellOffsetYRem,
    g.hudPortraitWrapShellOffsetZPx,
    g.hudPortraitWrapShellScale,
  )
  setHudTransform(
    hudStockYouShellEl,
    g.hudStockYouShellOffsetXRem,
    g.hudStockYouShellOffsetYRem,
    g.hudStockYouShellOffsetZPx,
    g.hudStockYouShellScale,
  )
  hudStockYouShellEl?.style.setProperty('--hud-stock-you-font-scale', String(g.hudStockYouFontScale))
}

function syncTweaksPanelChrome(): void {
  document.getElementById('tweaks-panel-host')?.style.setProperty(
    '--tweaks-panel-scale',
    String(gameConfig.tweaksPanelUiScale),
  )
}

syncUiHudChrome()
syncTweaksPanelChrome()

const ammoCountEl = document.getElementById('ammo-count') as HTMLDivElement | null
const ammoFeedbackEl = document.getElementById('ammo-feedback') as HTMLDivElement | null
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
const textChatWrapEl = document.getElementById('text-chat-wrap') as HTMLDivElement | null
const textChatLogEl = document.getElementById('text-chat-log') as HTMLDivElement | null
const textChatInputEl = document.getElementById('text-chat-input') as HTMLInputElement | null

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
    debugMpLog('send voiceShot (trajectory)')
    return
  }
  if (ty === 'voiceShotAudio') {
    const ab = obj.audioB64
    const n = typeof ab === 'string' ? ab.length : 0
    debugMpLog(`send voiceShotAudio b64~${n}`)
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

const _knDir = new Vector3()
const _knFromShot = new Vector3()
const _tmpKnock = new Vector3()
const _fp = new Vector3()
const _camFwd = new Vector3()
const _camRight = new Vector3()
const _worldUp = new Vector3(0, 1, 0)
const _muzzleWorld = new Vector3()
const _aimDir = new Vector3()
const _moveStart = new Vector3()
const _moveDesired = new Vector3()

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Black full-screen gate before `location.reload` when returning to the main menu. */
const SESSION_RELOAD_GATE_MS = 3000

function runSessionReloadGateThen(reload: () => void): void {
  const el = sessionReloadOverlayEl
  if (el) {
    el.hidden = false
    el.setAttribute('aria-hidden', 'false')
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
  }
  window.setTimeout(reload, SESSION_RELOAD_GATE_MS)
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
        loadUserSettings()
        usernameOverlay.hidden = true
        gameRoot.hidden = true
        resolve()
      },
      { once: true },
    )
  })
}

/** Legacy sessionStorage key from older builds (rematch reload) — still read so stale keys clear. */
const ONLINE_REMATCH_RELOAD_KEY = 'vibejam_online_rematch_reload_lobby'
/** Set by the post-match popup so a `window.location.reload()` jumps straight back into the chosen flow. */
const REPLAY_INTENT_KEY = 'vibejam_replay_intent_on_load'

const VALID_INTENTS: ReadonlySet<MatchIntent> = new Set([
  'quickMatch',
  'private',
  'practice',
  'vsBot',
])

type StoredReplayIntent = {
  intent: MatchIntent
  mapId: MapId
}

function takeReplayIntentOnLoad(): StoredReplayIntent | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(REPLAY_INTENT_KEY)
    sessionStorage.removeItem(REPLAY_INTENT_KEY)
  } catch {
    raw = null
  }
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Partial<{ intent: string; mapId: string }>
    if (
      typeof data.intent === 'string' &&
      VALID_INTENTS.has(data.intent as MatchIntent) &&
      typeof data.mapId === 'string' &&
      isMapId(data.mapId)
    ) {
      return { intent: data.intent as MatchIntent, mapId: data.mapId }
    }
  } catch {
    /* ignore malformed replay intent */
  }
  return null
}

function buildLobbyFromIntent(intent: MatchIntent, mapId: MapId): LobbyResult | null {
  if (intent === 'quickMatch') {
    /* Quick match needs the queue room; can't be resolved synchronously here. */
    return null
  }
  const roomId = randomRoomId()
  const shortCode = roomId.replace(/^vj-/, '')
  if (intent === 'private') {
    return {
      mode: 'online',
      role: 'host',
      roomId,
      shortCode,
      mapId,
      intent: 'private',
    }
  }
  if (intent === 'practice') {
    return {
      mode: 'online',
      role: 'host',
      roomId,
      shortCode,
      mapId,
      intent: 'practice',
      startWithDummyPractice: true,
    }
  }
  if (intent === 'vsBot') {
    return {
      mode: 'online',
      role: 'host',
      roomId,
      shortCode,
      mapId,
      intent: 'vsBot',
      startWithSmartBot: true,
    }
  }
  return null
}

/** Clear the legacy rematch storage key without trusting its contents. */
function clearLegacyRematchKey(): void {
  try {
    sessionStorage.removeItem(ONLINE_REMATCH_RELOAD_KEY)
  } catch {
    /* ignore */
  }
}

async function initGame(lobby: LobbyResult): Promise<void> {
  gameRoot.classList.remove('game-root--lobby')
  gameRoot.classList.add('game-root--hud-suspended')
  gameRoot.hidden = false
  /* Defensive: if any lobby-backdrop canvas slipped past disposal, remove it before the
   * gameplay renderer prepends its own canvas. A stale GL canvas pinned to z-index 0 was
   * occasionally masking the new gameplay canvas on the second peer in quick match. */
  gameRoot.querySelectorAll('canvas.lobby-backdrop-canvas').forEach((node) => node.remove())

  if (DEBUG_MP)
    debugMpLog(
      `initGame role=${lobby.mode === 'online' ? lobby.role : 'offline'} mp=${lobby.mode} map=${lobby.mapId}`,
    )

  setBackgroundMusicGameplaySuppressed(true)

  let tweaksPanelOpen = false
  let leaveMatchDialogOpen = false

  function syncHudDragChrome(): void {
    gameRoot.classList.toggle(
      'game-root--hud-drag',
      tweaksPanelOpen && gameConfig.hudDragLayoutEnabled >= 0.5,
    )
  }

  const isOnline = lobby.mode === 'online'
  let mpPhase: 'waiting' | 'starting' | 'live' = isOnline ? 'waiting' : 'live'
  /** Online lobby only: Tweaks "Practice with Dummy" — move and fight vs dummy while still waiting for a peer. */
  let lobbyDummyPractice = false
  /** Online host: same as dummy practice but `recreateBot('smart')` (replicated to guest when WebRTC is up). */
  let lobbySmartBotActive = false

  function multiplayerBlocksPlay(): boolean {
    return isOnline && mpPhase !== 'live' && !lobbyDummyPractice && !lobbySmartBotActive
  }

  let mpSocket: MultiplayerWire | null = null
  /** When set, game JSON prefers WebRTC data channel; signaling stays on `mpSocket`. */
  let rtcGame: WebRtcGameApi | null = null

  function setLocalVoipRecordingBlocked(blocked: boolean): void {
    rtcGame?.setLocalVoipGameRecordingBlock(blocked)
  }
  /** Host-only authority when using browser P2P (no Node `pvp-host`). */
  let browserHost: ReturnType<typeof createBrowserHostAuthority> | null = null
  let mpPresenceCount = 0
  let mpOpponentName: string | null = null
  let peerSeenInRoom = false
  let opponentForfeitHandled = false
  let leavingToLobby = false
  const guestAwaitingHostHello = lobby.mode === 'online' && lobby.role === 'guest'
  let guestSawHostHello = !guestAwaitingHostHello

  /** Percent HUD foe line: peer hello name, falling back to a generic label until the hello arrives. */
  function opponentHudName(): string {
    if (lobbySmartBotActive && bot.mode === 'smart') return 'Bot'
    if (lobby.mode === 'online') {
      const n = mpOpponentName?.trim()
      if (n) return n
    }
    return 'Opponent'
  }

  let textChatOpen = false

  function appendTextChatLine(sender: string, message: string): void {
    if (!textChatLogEl) return
    if (textChatWrapEl) textChatWrapEl.hidden = false
    const line = document.createElement('p')
    line.className = 'text-chat-line'
    line.textContent = `${sender}: ${message}`
    textChatLogEl.appendChild(line)
    while (textChatLogEl.childElementCount > 18) {
      textChatLogEl.removeChild(textChatLogEl.firstElementChild!)
    }
    textChatLogEl.scrollTop = textChatLogEl.scrollHeight
  }

  function closeTextChat(restorePointerLock = true): void {
    textChatOpen = false
    if (textChatInputEl) {
      textChatInputEl.hidden = true
      textChatInputEl.blur()
      textChatInputEl.value = ''
    }
    if (textChatWrapEl && textChatLogEl) {
      textChatWrapEl.hidden = textChatLogEl.childElementCount <= 0
    }
    if (restorePointerLock) tryPointerLock()
  }

  function openTextChat(): void {
    if (!textChatWrapEl || !textChatInputEl) return
    if (!isOnline || lobby.mode !== 'online') return
    if (multiplayerBlocksPlay() || leaveMatchDialogOpen || tweaksPanelOpen) return
    textChatOpen = true
    textChatWrapEl.hidden = false
    textChatInputEl.hidden = false
    clearMovementKeys()
    try {
      controls.unlock()
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => textChatInputEl.focus())
  }

  function sendTextChatMessage(raw: string): void {
    if (lobby.mode !== 'online') return
    const msg = raw.trim().replace(/\s+/g, ' ').slice(0, 180)
    if (!msg) return
    appendTextChatLine(displayPlayerName(), msg)
    sendGameTraffic({
      type: 'textChat',
      fromRole: lobby.role,
      text: msg,
    })
  }

  let mpSeqStarted = false
  let mpBeginTimer: ReturnType<typeof setTimeout> | null = null
  let poseSendAcc = 0
  const seenVoiceShotIds = new Set<string>()
  /** Peer voice clips keyed by shotId — play when authoritative authDamage confirms a hit. */
  const pendingPeerShotAudioById = new Map<string, AudioBuffer>()
  /** Local aggressor: replay own shot clip on authoritative hit confirm. */
  const pendingAttackerShotAudioById = new Map<string, AudioBuffer>()
  /** authDamage can arrive before async decode finishes — play clip once buffer exists. */
  const pendingVictimVoiceShotIds = new Set<string>()
  const pendingVictimHitPosByShotId = new Map<string, Vector3>()

  const scene = new Scene()
  scene.background = new Color(
    gameConfig.skyboxColorR,
    gameConfig.skyboxColorG,
    gameConfig.skyboxColorB,
  )

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

  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const pixelPass = new RenderPixelatedPass(Math.max(1, gameConfig.retroPixelScale), scene, camera, {
    normalEdgeStrength: Math.max(0, gameConfig.retroEdgeStrength * 0.65),
    depthEdgeStrength: Math.max(0, gameConfig.retroEdgeStrength),
  })
  const celOutlinePass = new ShaderPass(CelOutlineShader)
  const celUniforms = celOutlinePass.uniforms as Record<string, { value: unknown }>
  celUniforms.resolution.value = [window.innerWidth, Math.max(window.innerHeight, 1)]
  function syncCelOutlineConfig(): void {
    celOutlinePass.enabled = gameConfig.celShadeEnabled >= 0.5
    if (!celOutlinePass.enabled) return
    celUniforms.levels.value = Math.max(2, Math.round(gameConfig.celShadeLevels))
    celUniforms.edgeThreshold.value = Math.max(0.001, gameConfig.celOutlineThreshold)
    celUniforms.edgeSoftness.value = Math.max(0.001, gameConfig.celOutlineSoftness)
    celUniforms.outlineStrength.value = Math.max(0, gameConfig.celOutlineStrength)
  }
  syncCelOutlineConfig()
  composer.addPass(pixelPass)
  composer.addPass(new OutputPass())
  composer.addPass(celOutlinePass)
  /* After color space / tone mapping: screen-space dither (strength from Tweaks). */
  const ditherPass = new ShaderPass(LowEndDitherShader)
  const ditherUniforms = ditherPass.uniforms as Record<string, { value: unknown }>
  composer.addPass(ditherPass)
  composer.setSize(window.innerWidth, Math.max(window.innerHeight, 1))

  const controls = new PointerLockControls(camera, renderer.domElement)
  setUserSettingsPointerControls(controls)
  controls.pointerSpeed = gameConfig.mouseSensitivity

  /**
   * FP camera presentation offsets that are applied at the *end* of a frame and stripped on
   * PointerLock `change` so mouse-look reads from the clean intended state. Camera spring-arm
   * lag (rotation slerp, Y position lerp) is handled separately in `cameraSpringArm` and only
   * swaps `camera.quaternion` / `camera.position.y` during the render call itself.
   */
  const fpPresentationState = {
    storedPitchBob: 0,
    storedRollTotal: 0,
    walkPhase: 0,
    /** Vertical camera bob applied at end of frame; stripped at start of movement for clean physics. */
    storedCamBobY: 0,
  }
  controls.addEventListener('change', () => {
    camera.position.y -= fpPresentationState.storedCamBobY
    fpPresentationState.storedCamBobY = 0
    fpPresentationState.storedPitchBob = 0
    fpPresentationState.storedRollTotal = 0
  })

  /**
   * Unreal-style spring-arm camera lag. The "intended" target each frame is whatever
   * physics + bob/walk-roll wrote into the camera; we lerp/slerp a separate `display*`
   * state toward it, swap to display only during `composer.render()`, then restore the
   * intended values so PointerLockControls continues reading from a drift-free state.
   */
  const cameraSpringArm = {
    /** Rendered camera rotation (slerps toward `camera.quaternion`). */
    displayQuat: new Quaternion(),
    /** Rendered camera Y position (lerps toward `camera.position.y`). */
    displayY: 0,
    /** Snapshot of the intended (target) quaternion captured before the swap. */
    intendedQuat: new Quaternion(),
    /** Snapshot of the intended camera Y captured before the swap. */
    intendedY: 0,
    initialized: false,
  }
  function resetCameraSpringArm(): void {
    cameraSpringArm.initialized = false
  }

  const ambient = new AmbientLight(0xffffff, gameConfig.ambientIntensity)
  scene.add(ambient)

  const sun = new DirectionalLight(0xffffff, gameConfig.sunIntensity)
  /* Low sun angle → longer, harsher shadows on the deck. */
  sun.position.set(gameConfig.sunPosX, gameConfig.sunPosY, gameConfig.sunPosZ)
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

  const litToUnlit = new WeakMap<Material, Material>()
  const unlitToLit = new WeakMap<Material, Material>()
  let lastUnlitMode = false
  let lastSelfModelUnlit = false
  let lastEnemyModelUnlit = false
  let unlitRescanTick = 0
  const SELF_AVATAR_ROOT_NAME = 'avatar:self'
  const ENEMY_AVATAR_ROOT_NAME = 'avatar:enemy'
  /** Imported GLB arenas stay PBR so sun shadows read; only other meshes swap to MeshBasic when unlit. */
  function isUnderLitGltfArenaMap(node: Object3D): boolean {
    let cur: Object3D | null = node
    while (cur) {
      if (cur.name === 'map:godotExport' || cur.name === 'map:floatingIslandStage') return true
      cur = cur.parent
    }
    return false
  }

  function isUnderNamedRoot(node: Object3D, rootName: string): boolean {
    let cur: Object3D | null = node
    while (cur) {
      if (cur.name === rootName) return true
      cur = cur.parent
    }
    return false
  }

  function mapMaterialForLightingMode(src: Material, unlit: boolean): Material {
    if (unlit) {
      const cached = litToUnlit.get(src)
      if (cached) return cached
      const shaderLike = src as unknown as { isShaderMaterial?: boolean }
      if (shaderLike.isShaderMaterial) return src
      const m = src as unknown as {
        map?: unknown
        color?: { clone?: () => unknown }
        vertexColors?: boolean
        wireframe?: boolean
        transparent?: boolean
        opacity?: number
        alphaTest?: number
        side?: number
        visible?: boolean
        depthTest?: boolean
        depthWrite?: boolean
        name?: string
      }
      const basic = new MeshBasicMaterial()
      const basicAs = basic as unknown as {
        map?: unknown
        color?: { copy?: (c: unknown) => void; set?: (v: unknown) => void }
        vertexColors?: boolean
        wireframe?: boolean
        transparent?: boolean
        opacity?: number
        alphaTest?: number
        side?: unknown
        visible?: boolean
        depthTest?: boolean
        depthWrite?: boolean
      }
      basicAs.map = m.map ?? null
      if (m.color && basicAs.color?.copy) basicAs.color.copy(m.color)
      else basicAs.color?.set?.(0xffffff)
      basicAs.vertexColors = !!m.vertexColors
      basicAs.wireframe = !!m.wireframe
      basicAs.transparent = !!m.transparent
      basicAs.opacity = m.opacity ?? 1
      basicAs.alphaTest = m.alphaTest ?? 0
      basicAs.side = m.side
      basicAs.visible = m.visible ?? true
      basicAs.depthTest = m.depthTest ?? true
      basicAs.depthWrite = m.depthWrite ?? true
      if (m.name) basic.name = `${m.name} (unlit)`
      litToUnlit.set(src, basic)
      unlitToLit.set(basic, src)
      return basic
    }
    return unlitToLit.get(src) ?? src
  }
  function applyLightingModeToScene(
    unlit: boolean,
    selfModelUnlit = gameConfig.lightingUnlitSelfModel >= 0.5,
    enemyModelUnlit = gameConfig.lightingUnlitEnemyModel >= 0.5,
  ): void {
    /* Keep sun + ambient so imported arena terrain (skipped below) still shades and receives shadows when unlit. */
    ambient.intensity = gameConfig.ambientIntensity
    sun.intensity = gameConfig.sunIntensity
    sun.position.set(gameConfig.sunPosX, gameConfig.sunPosY, gameConfig.sunPosZ)
    scene.traverse((node) => {
      const mesh = node as Mesh
      if (!mesh.isMesh) return
      const isMapMesh = isUnderLitGltfArenaMap(mesh)
      const isSelfAvatarMesh = isUnderNamedRoot(mesh, SELF_AVATAR_ROOT_NAME)
      const isEnemyAvatarMesh = isUnderNamedRoot(mesh, ENEMY_AVATAR_ROOT_NAME)

      let meshUnlit = unlit
      if (meshUnlit && isMapMesh) meshUnlit = false
      if (!meshUnlit && selfModelUnlit && isSelfAvatarMesh) meshUnlit = true
      if (!meshUnlit && enemyModelUnlit && isEnemyAvatarMesh) meshUnlit = true

      const matRef = (mesh as unknown as { material?: Material | Material[] }).material
      if (!matRef) return
      if (Array.isArray(matRef)) {
        ;(mesh as unknown as { material: Material[] }).material = matRef.map((m) =>
          mapMaterialForLightingMode(m, meshUnlit),
        )
      } else {
        ;(mesh as unknown as { material: Material }).material = mapMaterialForLightingMode(
          matRef,
          meshUnlit,
        )
      }
    })
    lastUnlitMode = unlit
    lastSelfModelUnlit = selfModelUnlit
    lastEnemyModelUnlit = enemyModelUnlit
  }

  const hubRoot = new Group()
  scene.add(hubRoot)
  const skyDome = createProceduralSky(scene)

  /** Map handle is mutable: PvP guests swap to the host's chosen map at `hello`. */
  const terrainPhysics = await TerrainPhysics.create()
  let map: MapHandle = await loadMap(lobby.mapId, scene, hubRoot)
  terrainPhysics.setTerrainMeshes(map.collisionMeshes, map.rapierCuboids)

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        gameRoot.classList.remove('game-root--hud-suspended')
        syncGameHudVisibility()
        resolve()
      })
    })
  })

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

  function isPvp(): boolean {
    return isOnline && mpPhase === 'live' && bot.mode === 'network'
  }

  const bananaWorld = new BananaWorld(scene)
  bananaWorld.attachHandToCamera(camera)
  bananaWorld.attachOpponentBananaToRoot(bot.root)
  const megaphoneFp = new MegaphoneFpProp()
  megaphoneFp.attachToCamera(camera)
  const _bLand = new Vector3()
  const _bFeet = new Vector3()
  let localHasBanana = false
  let pvpBananaInventory: { host: 0 | 1; guest: 0 | 1 } = { host: 0, guest: 0 }
  let playerBananaSlipUntil = 0
  let nextBananaPeelId = 1
  /**
   * Banana auth messages (init/pickup/throw/slip) are one-shot — losing one means
   * the round is desynced. Both peers run independent local countdowns, so the host's
   * `bananaInit` can land on the guest a tick before the guest sets `mpPhase = 'live'`.
   * We buffer any auth-banana payloads that arrive while we're not yet ready and replay
   * them as soon as `flushPendingBananaMsgs` is called (right after we go live).
   */
  const pendingBananaMsgs: Array<Record<string, unknown>> = []
  const _fpViewEuler = new Euler(0, 0, 0, 'YXZ')

  function startBananaSlipCamRoll(): void {
    if (gameConfig.bananaSlipCamRollEnabled < 0.5) return
    /* Banana slip uses a stronger hit-style shake only (no camera roll/pitch transform). */
    const sm = getCameraShakeMul()
    shakeIntensity = Math.max(shakeIntensity, gameConfig.hitScreenShake * sm * 2.7)
  }

  function resetBananaSlipCamRoll(): void {
    /* no-op: slip camera transform is intentionally disabled */
  }

  function computeBananaSlipRollRad(): number {
    /* Slip camera transform disabled; keep function for existing structure/call sites. */
    return 0
  }

  /** Advance walk phase once per frame; `moving` matches locomotion even if head bob is disabled. */
  function tickFpWalkPresentation(delta: number): { moving: boolean; spd01: number } {
    const slip = isPlayerBananaSlipNow()
    const canWalk = playerHurt === 'none' && !slip
    const moving =
      !!(canWalk && grounded && (keys.forward || keys.back || keys.left || keys.right))
    const spd = Math.hypot(velocity.x, velocity.z)
    const spd01 = Math.min(1, spd / Math.max(1e-4, gameConfig.moveSpeed))

    if (gameConfig.fpViewBobEnabled >= 0.5) {
      if (moving && grounded) {
        fpPresentationState.walkPhase +=
          delta * Math.PI * 2 * gameConfig.fpHeadbobHz * Math.max(0.28, spd01)
      } else {
        fpPresentationState.walkPhase *= Math.exp(-delta * 5.5)
      }
    } else {
      fpPresentationState.walkPhase *= Math.exp(-delta * 6)
    }
    return { moving, spd01 }
  }

  function applyFpCameraPresentation(
    _delta: number,
    fpWalk: { moving: boolean; spd01: number },
  ): void {
    _fpViewEuler.setFromQuaternion(camera.quaternion, 'YXZ')
    _fpViewEuler.x -= fpPresentationState.storedPitchBob
    _fpViewEuler.z -= fpPresentationState.storedRollTotal

    const slipPitch = computeBananaSlipRollRad()

    let bobRoll = 0
    let camBobY = 0
    if (gameConfig.fpViewBobEnabled >= 0.5) {
      const { moving } = fpWalk
      /*
       * Head bob is camera **position Y** only (hands follow camera — no dual bob vs idle sway).
       * Pitch euler bob removed so idle weapon sway never stacks with walk bob.
       */
      camBobY = moving
        ? Math.sin(fpPresentationState.walkPhase) * gameConfig.fpHeadbobCameraYMul
        : 0
      bobRoll = moving
        ? Math.cos(fpPresentationState.walkPhase * 2) *
          MathUtils.degToRad(gameConfig.fpHeadbobRollDeg)
        : 0
    }

    const totalRoll = bobRoll
    fpPresentationState.storedPitchBob = slipPitch
    fpPresentationState.storedRollTotal = totalRoll
    fpPresentationState.storedCamBobY = camBobY

    _fpViewEuler.x += fpPresentationState.storedPitchBob
    _fpViewEuler.z += fpPresentationState.storedRollTotal
    camera.quaternion.setFromEuler(_fpViewEuler)
    camera.position.y += fpPresentationState.storedCamBobY
  }

  /**
   * Unreal-style spring-arm camera lag.
   * Treats `camera.quaternion` / `camera.position.y` as the **target** (intended) state
   * and lerps a separate display state toward it each frame.
   * Y-only position lag — XZ stay locked to the player capsule.
   */
  function tickCameraSpringArm(delta: number): void {
    cameraSpringArm.intendedQuat.copy(camera.quaternion)
    cameraSpringArm.intendedY = camera.position.y

    if (!cameraSpringArm.initialized) {
      cameraSpringArm.displayQuat.copy(cameraSpringArm.intendedQuat)
      cameraSpringArm.displayY = cameraSpringArm.intendedY
      cameraSpringArm.initialized = true
      return
    }

    /* Rotation: `displayQuat.slerp(intendedQuat, rotationLagSpeed * delta)`. */
    if (gameConfig.fpCamRotLagEnabled >= 0.5) {
      const tRot = Math.min(1, Math.max(0, gameConfig.fpCamRotLagSpeed) * delta)
      cameraSpringArm.displayQuat.slerp(cameraSpringArm.intendedQuat, tRot)
    } else {
      cameraSpringArm.displayQuat.copy(cameraSpringArm.intendedQuat)
    }

    /* Y position: `displayY = lerp(displayY, intendedY, lagSpeed * delta)`, then clamp by maxLagDistance. */
    if (gameConfig.fpCamYLagEnabled >= 0.5) {
      const tPos = Math.min(1, Math.max(0, gameConfig.fpCamYLagSpeed) * delta)
      cameraSpringArm.displayY +=
        (cameraSpringArm.intendedY - cameraSpringArm.displayY) * tPos
      const maxLag = Math.max(0, gameConfig.fpCamYMaxLag)
      if (maxLag > 0) {
        const diff = cameraSpringArm.displayY - cameraSpringArm.intendedY
        if (Math.abs(diff) > maxLag) {
          cameraSpringArm.displayY = cameraSpringArm.intendedY + Math.sign(diff) * maxLag
        }
      }
    } else {
      cameraSpringArm.displayY = cameraSpringArm.intendedY
    }
  }

  /**
   * Render with the spring-arm display state applied, then restore intended state so
   * PointerLockControls (which mutates `camera.quaternion` between frames) reads from
   * a drift-free baseline.
   */
  const _camRenderBackupQuat = new Quaternion()
  function renderCameraWithSpringArm(): void {
    const yBackup = camera.position.y
    _camRenderBackupQuat.copy(camera.quaternion)

    camera.position.y = cameraSpringArm.displayY
    camera.quaternion.copy(cameraSpringArm.displayQuat)

    composer.render()

    camera.position.y = yBackup
    camera.quaternion.copy(_camRenderBackupQuat)
  }
  function pvpHostBroadcastAndApply(msg: Record<string, unknown>): void {
    if (rtcGame) rtcGame.sendGameJson(msg)
    else sendMp(msg)
    dispatchPeerGamePayload(msg)
  }

  /**
   * Send to the peer without re-applying locally — used when the host has already
   * mutated state synchronously (e.g. `bananaInit` after `respawnLocal` placed
   * the host's pickups; re-running `applyInitPickups` would needlessly clear+reload
   * the freshly-spawned visuals and dispose their shared GLB geometry).
   */
  function pvpHostBroadcastOnly(msg: Record<string, unknown>): void {
    if (rtcGame) rtcGame.sendGameJson(msg)
    else sendMp(msg)
  }

  function myPvpRole(): 'host' | 'guest' {
    if (lobby.mode === 'online') return lobby.role
    return 'host'
  }

  function isPlayerBananaSlipNow(t = performance.now()): boolean {
    return playerHurt === 'none' && t < playerBananaSlipUntil
  }

  function getMyBananaHeld(): boolean {
    if (!isPvp()) return localHasBanana
    return pvpBananaInventory[myPvpRole()] > 0
  }

  function syncBananaHandVis(): void {
    bananaWorld.handGroup.visible = getMyBananaHeld() && !isPlayerBananaSlipNow()
  }

  /** Peer monkey holds the banana mesh when their inventory has one (hidden during banana slip). */
  function syncOpponentBananaHandVis(): void {
    if (!isPvp() || mpPhase !== 'live' || bot.mode !== 'network') {
      bananaWorld.opponentBananaGroup.visible = false
      return
    }
    const opp = myPvpRole() === 'host' ? 'guest' : 'host'
    const theyHold = pvpBananaInventory[opp] > 0
    bananaWorld.opponentBananaGroup.visible = theyHold && !bot.isBananaSlipNow()
  }

  function rebindOpponentBananaAttachment(): void {
    bananaWorld.attachOpponentBananaToRoot(bot.root)
  }

  async function initBananaRound(): Promise<void> {
    const n = Math.max(0, Math.round(gameConfig.bananaPickupCount))
    playerBananaSlipUntil = 0
    resetBananaSlipCamRoll()
    fpPresentationState.storedPitchBob = 0
    fpPresentationState.storedRollTotal = 0
    fpPresentationState.walkPhase = 0
    fpPresentationState.storedCamBobY = 0
    resetCameraSpringArm()
    localHasBanana = false
    pvpBananaInventory = { host: 0, guest: 0 }
    nextBananaPeelId = 1
    bananaWorld.clear()
    bananaWorld.handGroup.visible = false
    bananaWorld.opponentBananaGroup.visible = false
    if (n <= 0) return
    if (!isPvp()) {
      await bananaWorld.respawnLocal(map, terrainPhysics, n)
      return
    }
    if (lobby.mode === 'online' && lobby.role === 'host') {
      const list = await bananaWorld.respawnLocal(map, terrainPhysics, n)
      pvpHostBroadcastOnly({ type: 'bananaInit', pickups: list })
    }
  }

  function applyBananaInit(pickups: { id: string; x: number; y: number; z: number }[]): void {
    void bananaWorld.applyInitPickups(pickups)
  }

  /**
   * Replay any banana auth messages that arrived before we transitioned to live.
   * Guests in particular can lose `bananaInit` if the host broadcasts it during
   * the gap where the guest's countdown hasn't ticked over yet.
   */
  function flushPendingBananaMsgs(): void {
    if (pendingBananaMsgs.length === 0) return
    if (!isPvp() || mpPhase !== 'live') return
    const queued = pendingBananaMsgs.splice(0, pendingBananaMsgs.length)
    for (const data of queued) {
      const ty = data.type as string | undefined
      if (ty === 'bananaInit' && Array.isArray(data.pickups)) {
        applyBananaInit(
          data.pickups as { id: string; x: number; y: number; z: number }[],
        )
      } else if (
        ty === 'bananaAuthPickup' &&
        (data.role === 'host' || data.role === 'guest') &&
        typeof data.pickupId === 'string'
      ) {
        applyBananaAuthPickup(data.role, data.pickupId)
      } else if (
        ty === 'bananaAuthThrowResult' &&
        (data.fromRole === 'host' || data.fromRole === 'guest') &&
        typeof data.peelId === 'string' &&
        typeof data.x === 'number' &&
        typeof data.y === 'number' &&
        typeof data.z === 'number'
      ) {
        applyBananaAuthThrowResult(data.fromRole, data.peelId, data.x, data.y, data.z)
      } else if (
        ty === 'bananaAuthSlip' &&
        (data.victimRole === 'host' || data.victimRole === 'guest') &&
        typeof data.ms === 'number' &&
        typeof data.peelId === 'string'
      ) {
        applyBananaAuthSlip(data.victimRole, data.ms, data.peelId)
      }
    }
  }

  function applyBananaAuthPickup(
    who: 'host' | 'guest',
    pickupId: string,
  ): void {
    pvpBananaInventory[who] = 1
    bananaWorld.removePickupById(pickupId)
    syncBananaHandVis()
    syncOpponentBananaHandVis()
  }

  function applyBananaAuthPeel(peelId: string, x: number, y: number, z: number): void {
    if (bananaWorld.peels.some((p) => p.id === peelId)) return
    bananaWorld.addPeelFromId(peelId, x, y, z)
  }

  function applyBananaAuthSlip(
    victimRole: 'host' | 'guest',
    durationMs: number,
    peelId: string,
  ): void {
    const isVictimMe = victimRole === myPvpRole()
    if (performance.now() < (isVictimMe ? respawnInvulnUntilYou : respawnInvulnUntilFoe)) return
    if (victimRole === myPvpRole()) {
      playerBananaSlipUntil = performance.now() + Math.max(0, durationMs)
      triggerStunnedHitOverlay()
      triggerHudDamageShake(hudDamagePctEl, hudPortraitWrapEl, playerPercent)
      playBananaSlipOneShot()
      startBananaSlipCamRoll()
    } else {
      bot.applyBananaSlipMs(durationMs)
    }
    bananaWorld.removePeelById(peelId)
    syncBananaHandVis()
    syncOpponentBananaHandVis()
  }

  function processHostBananaPickup(
    fromRole: 'host' | 'guest',
    pickupId: string,
    feet: Vector3,
  ): void {
    const pi = bananaWorld.pickups.find((p) => p.id === pickupId)
    if (!pi) return
    if (pvpBananaInventory[fromRole] > 0) return
    if (!isFeetInPickUpRange(feet, { x: pi.x, y: pi.y, z: pi.z }, gameConfig.bananaPickupRadius))
      return
    pvpHostBroadcastAndApply({ type: 'bananaAuthPickup', role: fromRole, pickupId })
  }

  function processHostBananaThrow(
    fromRole: 'host' | 'guest',
    ox: number,
    oy: number,
    oz: number,
    dirx: number,
    diry: number,
    dirz: number,
  ): void {
    if (pvpBananaInventory[fromRole] < 1) return
    _muzzleWorld.set(ox, oy, oz)
    const dir = new Vector3(dirx, diry, dirz)
    if (dir.lengthSq() < 1e-6) return
    const ok = simBananaThrowToLanding(
      _muzzleWorld,
      dir,
      gameConfig.bananaThrowSpeed,
      gameConfig.bananaThrowUpMul,
      gameConfig.gravity,
      gameConfig.bananaThrowMaxRange,
      (x, y, z) => terrainPhysics.raycastDown(x, y, z, 200),
      _bLand,
    )
    if (!ok) return
    if (map.isBlastZone(_bLand)) return
    const id = `b${nextBananaPeelId++}`
    pvpHostBroadcastAndApply({
      type: 'bananaAuthThrowResult',
      fromRole,
      peelId: id,
      x: _bLand.x,
      y: _bLand.y,
      z: _bLand.z,
    })
  }

  function applyBananaAuthThrowResult(
    fromRole: 'host' | 'guest',
    peelId: string,
    x: number,
    y: number,
    z: number,
  ): void {
    pvpBananaInventory[fromRole] = 0
    applyBananaAuthPeel(peelId, x, y, z)
    syncBananaHandVis()
    syncOpponentBananaHandVis()
  }

  function hostCheckBananaSlips(): void {
    if (!isPvp() || lobby.mode !== 'online' || lobby.role !== 'host' || mpPhase !== 'live') return
    if (bananaWorld.peels.length === 0) return
    const d = gameConfig.bananaSlipMs
    const pr = gameConfig.bananaPeelRadius
    const yt = gameConfig.bananaPeelYTolerance
    nextPeel: for (let i = bananaWorld.peels.length - 1; i >= 0; i--) {
      const peel = bananaWorld.peels[i]!
      for (const role of ['host', 'guest'] as const) {
        if (role === 'host') {
          if (browserHost) {
            const p = browserHost.getLastPose('host')
            if (p) {
              _bFeet.set(p.x, p.fy, p.z)
            } else {
              _bFeet.set(camera.position.x, feetY(), camera.position.z)
            }
          } else {
            _bFeet.set(camera.position.x, feetY(), camera.position.z)
          }
        } else {
          const fo = bot.getFootOffset()
          _bFeet.set(bot.root.position.x, bot.root.position.y - fo, bot.root.position.z)
        }
        if (!feetOnPeel(_bFeet, { x: peel.x, y: peel.y, z: peel.z, id: peel.id }, pr, yt)) continue
        const victimMe = role === myPvpRole()
        if (performance.now() < (victimMe ? respawnInvulnUntilYou : respawnInvulnUntilFoe)) continue
        pvpHostBroadcastAndApply({ type: 'bananaAuthSlip', victimRole: role, ms: d, peelId: peel.id })
        continue nextPeel
      }
    }
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

  /**
   * Voice-shot audio: prefer compact binary frames over the RTC data channel so we
   * avoid `JSON.stringify` + base64 on every shot. Falls back to a JSON+base64
   * `voiceShotAudio` payload when the RTC channel isn't open yet (signaling relay).
   *
   * `audioBlob` lifetime: caller can drop it after this returns; we read its bytes once.
   */
  async function sendVoiceShotAudio(
    shotId: string,
    mime: string,
    audioBlob: Blob,
  ): Promise<void> {
    if (rtcGame?.channel?.readyState === 'open') {
      try {
        const ab = await audioBlob.arrayBuffer()
        const frame = encodeVoiceShotAudioFrame(shotId, mime, new Uint8Array(ab))
        if (rtcGame.sendGameBinary(frame)) {
          if (DEBUG_MP) debugMpLog(`send voiceShotAudio bin=${frame.byteLength}b`)
          return
        }
      } catch {
        /* fall through to base64 */
      }
    }
    /* WS relay / data-channel send failure: keep legacy JSON+base64 path so the peer
     * still receives the clip even if RTC is briefly unhealthy. */
    try {
      const audioB64 = await blobToBase64(audioBlob)
      sendGameTraffic({ type: 'voiceShotAudio', shotId, mime, audioB64 })
    } catch {
      mpDiagCounters.voiceShotSendFail++
      debugMpLog('voiceShotAudio fallback (b64) encode failed')
    }
  }

  /**
   * Broadcast a peer-audible movement / weapon SFX event so the other player hears
   * footsteps / jumps / lands / shoot release at our avatar. Fire-and-forget — no host
   * authority involved (purely cosmetic), and the data channel does not echo to the
   * sender so we don't double-play locally.
   */
  function broadcastActorSfxIfPvp(kind: SfxKind): void {
    if (!isPvp()) return
    if (lobby.mode !== 'online') return
    sendGameTraffic({
      type: 'actorSfx',
      sfx: kind,
      fromRole: lobby.role,
    })
  }

  if (isOnline && lobby.mode === 'online' && !isAuthoritativeListenServer()) {
    rtcGame = createWebRtcGameChannel({
      role: lobby.role,
      signalSend: (o) => sendMp(o),
      includeProximityVoip: false,
      onGameJsonString: (raw) => {
        let data: Record<string, unknown>
        try {
          data = JSON.parse(raw) as Record<string, unknown>
        } catch {
          return
        }
        dispatchPeerGamePayload(data)
      },
      onGameBinary: (buf) => {
        const frame = decodeVoiceShotAudioFrame(buf)
        if (!frame) return
        if (DEBUG_MP) debugMpLog(`recv voiceShotAudio bin=${frame.bytes.byteLength}b`)
        /* Re-slice into a non-shared ArrayBuffer so `new Blob` accepts the bytes
         * across all supported browser type-slots (avoids SAB / view-of-view issues). */
        const audioBuf = frame.bytes.slice().buffer
        const blob = new Blob([audioBuf], { type: frame.mime })
        void handlePeerVoiceShotAudioBlob(frame.shotId, blob)
      },
      onChannelOpen: () => {
        debugMpLog('rtc dataChannel open')
        /* PvP just started: warm up the enemy-SFX context so peer footsteps play immediately. */
        resumeEnemySfxAudio()
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
  let seriesTransitionActive = false
  /** Per-fighter stocks (you = local role, foe = bot / opponent avatar). */
  let stocksYou = Math.max(1, Math.round(gameConfig.startStocks))
  let stocksFoe = Math.max(1, Math.round(gameConfig.startStocks))
  let respawnInvulnUntilYou = 0
  let respawnInvulnUntilFoe = 0
  /** Offline: ring-out victim is mid-KO pipeline (prevents duplicate KOs while still in blast). */
  let offlineBlastKoPending: null | 'you' | 'foe' = null
  const hostKoRespawnTimers = new Map<'host' | 'guest', ReturnType<typeof setTimeout>>()
  let victimWhiteFlashUntil = 0

  const playerKnock = new Vector3()
  const dashVel = new Vector3()
  let dashCdMs = 0

  const clock = new Clock()
  const velocity = new Vector3()
  const direction = new Vector3()
  const prevShake = new Vector3()
  let shakeIntensity = 0
  let flashIntensity = 0
  const dangerAuraOverlay = document.createElement('div')
  dangerAuraOverlay.style.position = 'absolute'
  dangerAuraOverlay.style.inset = '0'
  dangerAuraOverlay.style.pointerEvents = 'none'
  dangerAuraOverlay.style.zIndex = '40'
  dangerAuraOverlay.style.opacity = '0'
  dangerAuraOverlay.style.background =
    'radial-gradient(ellipse 95% 100% at 50% 48%, rgba(255,40,30,0.12) 0%, rgba(255,0,0,0.22) 42%, rgba(120,0,0,0.55) 100%)'
  gameRoot.appendChild(dangerAuraOverlay)

  /** First-person “body” stress read: red pulse over the 3D view (local high launch %). */
  const dangerLaunchTintEl = document.createElement('div')
  dangerLaunchTintEl.setAttribute('aria-hidden', 'true')
  dangerLaunchTintEl.style.position = 'absolute'
  dangerLaunchTintEl.style.inset = '0'
  dangerLaunchTintEl.style.pointerEvents = 'none'
  dangerLaunchTintEl.style.zIndex = '41'
  dangerLaunchTintEl.style.opacity = '0'
  dangerLaunchTintEl.style.mixBlendMode = 'overlay'
  dangerLaunchTintEl.style.background =
    'radial-gradient(ellipse 70% 85% at 50% 52%, rgba(255,85,70,0.72) 0%, rgba(200,30,25,0.35) 45%, transparent 70%)'
  gameRoot.appendChild(dangerLaunchTintEl)

  /** High-% foot smoke: only at the opponent’s world position (local player never sees it on self). */
  const opponentDangerSmokeCount = 16
  const opponentDangerSmokePos = new Float32Array(opponentDangerSmokeCount * 3)
  const opponentDangerSmokeGeom = new BufferGeometry()
  opponentDangerSmokeGeom.setAttribute('position', new BufferAttribute(opponentDangerSmokePos, 3))
  const opponentDangerSmokeMat = new PointsMaterial({
    color: new Color(0xa89898),
    size: 0.58,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: true,
  })
  const opponentDangerSmoke = new Points(opponentDangerSmokeGeom, opponentDangerSmokeMat)
  opponentDangerSmoke.frustumCulled = false
  opponentDangerSmoke.renderOrder = 50
  opponentDangerSmoke.visible = false
  scene.add(opponentDangerSmoke)

  let vy = 0
  let grounded = false
  let lastJumpAt = 0
  let jumpHeld = false
  let coyoteTimer = 0
  let jumpBufferTimer = 0
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

  /** Footstep: forward-hold and cadence (Tweaks → Sound). */
  let footstepHoldSec = 0
  let footstepLastMs = 0

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
    jumpHeld = false
    footstepHoldSec = 0
    footstepLastMs = 0
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

  /**
   * Bumps on (future) in-PvP match restarts so a slower async `concludeRoundElimination`
   * cannot call `endMatch` after a new round has already started.
   */
  let pvpMatchEpoch = 0

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
    const done =
      playerHurt === 'none' && now >= playerInvulnUntil && !isPlayerBananaSlipNow()
    if (done) hideStunnedFxOverlay()
  }

  function deriveLocalAnimBase(): NetAnimBase {
    if (playerHurt !== 'none') return 'hitreact'
    if (isPlayerBananaSlipNow()) return 'hitreact'
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
  /** 0–1 smoothed RMS activity for charge-HUD mic icon pulse. */
  let chargeHudMicAmpSmoothed = 0
  /** −1 = unlimited voice shots per round; otherwise shots left when capped. */
  let voiceAmmoLeft = -1
  /** Monotonic counters consumed by the tutorial controller (offline only). */
  let tutorialVoiceShotsFired = 0
  let tutorialBotRingouts = 0
  /** Gameplay frozen until mic works + optional countdown. */
  let voiceInputBlocked = true
  let voiceResumeCountdownActive = false

  /** Prior frame voice charge — used for “charge bar rising” portrait detection. */
  let hudPrevVoiceCharge = 0
  const hudSmokeLayer = hudSmokeCanvasEl ? new HudSmokeLayer(hudSmokeCanvasEl) : null
  let hudSmokeSized = false
  let hudPortraitResolvedUrl = ''

  /** Pistol mode (experimental): RMB hold = shout-charge a magazine; LMB click = fire snippet. */
  type PistolSlot = { offsetSec: number; durationSec: number }
  type PistolMagazine = { buf: AudioBuffer; slots: PistolSlot[] }
  let chargingRmb = false
  let pistolMag: PistolMagazine | null = null
  let pistolNextSlot = 0
  /**
   * Reload reveal animation state: after RMB release we build the full mag, but the player only
   * "sees" rounds load 1, 2, 3, … with a `+1` pop on each tick. Firing is gated on revealed slots
   * so spam clicks during reload still respect the visual ammo count.
   */
  let pistolReloadRevealed = 0
  let pistolReloadAccMs = 0
  function pistolModeOn(): boolean {
    return gameConfig.voicePistolModeEnabled >= 0.5
  }
  function pistolMagSize(): number {
    return Math.max(1, Math.min(99, Math.round(gameConfig.voiceMagazineSize)))
  }
  function pistolAmmoLeft(): number {
    if (!pistolMag) return 0
    const revealed = Math.min(pistolMag.slots.length, pistolReloadRevealed)
    return Math.max(0, revealed - pistolNextSlot)
  }
  function clearPistolState(): void {
    chargingRmb = false
    pistolMag = null
    pistolNextSlot = 0
    pistolReloadRevealed = 0
    pistolReloadAccMs = 0
  }
  /** Fire the +1 pop animation next to the ammo count by re-triggering its CSS keyframe. */
  function popAmmoFeedback(): void {
    if (!ammoFeedbackEl) return
    ammoFeedbackEl.textContent = '+1'
    ammoFeedbackEl.hidden = false
    ammoFeedbackEl.classList.remove('ammo-feedback--pop')
    void ammoFeedbackEl.offsetWidth
    ammoFeedbackEl.classList.add('ammo-feedback--pop')
  }

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
    /*
     * Offline dummy/smart + online lobby (non-live): tweaking should not respawn / voice-countdown.
     * Full restart stays on **R** via `applyRoundReset`. Live PvP matches still reset so map/spawn-dependent knobs stay coherent.
     */
    if (!isPvp()) return
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
        rebindOpponentBananaAttachment()
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
        rebindOpponentBananaAttachment()
      } else {
        bot.root.position.set(debugRoomSaved.botX, debugRoomSaved.botY, debugRoomSaved.botZ)
      }
      bot.resetRoundState()
    }
    debugRoomActiveLast = requested
  }

  async function resetRoundAfterTweakEdit(): Promise<void> {
    chargingLmb = false
    clearPistolState()
    voice.resetChargeMeter()
    voiceChargeSmoothed = 0
    chargeHudMicAmpSmoothed = 0
    setChargeBarDisplayPct(0)
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
    hideKoAnnouncementImmediate()
    hideWinGameSplash()
    resetMatchStockState()
    playerPercent = 0
    enemyPercent = 0
    hudPortraitResolvedUrl = ''
    hudPrevVoiceCharge = 0
    playerHurt = 'none'
    playerHurtRecoverLeft = 0
    playerInvulnUntil = 0
    if (matchEndOverlay) matchEndOverlay.hidden = true
    browserHost?.reset()
    pendingPeerShotAudioById.clear()
    pendingAttackerShotAudioById.clear()
    pendingVictimVoiceShotIds.clear()
    pendingVictimHitPosByShotId.clear()
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

  function pvpExpectedSpawn(): { cam: Vector3; camFeetY: number; opp: Vector3 } {
    const slots = spawnSlots()
    const cam = map.getPlayerSpawn(slots.player, eyeH())
    const opp = map.getBotSpawn(slots.opponent, bot.getFootOffset())
    return { cam, camFeetY: cam.y - eyeH(), opp }
  }

  /** Wait until local camera + replicated opponent capsule are near spawn (extends countdown). */
  async function waitForPvpSpawnSettled(maxWaitMs: number): Promise<void> {
    if (!isOnline || lobby.mode !== 'online' || bot.mode !== 'network') return
    const t0 = performance.now()
    const epsXZ = 2.6
    const epsY = 2.2
    const exp = pvpExpectedSpawn()
    while (performance.now() - t0 < maxWaitMs) {
      const camOk =
        Math.abs(camera.position.x - exp.cam.x) < epsXZ &&
        Math.abs(camera.position.z - exp.cam.z) < epsXZ &&
        Math.abs(feetY() - exp.camFeetY) < epsY
      const opp = bot.root.position
      const oppOk =
        Math.hypot(opp.x - exp.opp.x, opp.z - exp.opp.z) < epsXZ &&
        Math.abs(opp.y - exp.opp.y) < epsY
      if (camOk && oppOk) return
      await sleepMs(72)
    }
  }

  function triggerLocalVictimWhiteFlash(): void {
    victimWhiteFlashUntil = performance.now() + gameConfig.hitVictimWhiteFlashMs
    triggerStunnedHitOverlay()
    triggerHudDamageShake(hudDamagePctEl, hudPortraitWrapEl, playerPercent)
  }

  async function concludeRoundElimination(iWonRound: boolean): Promise<void> {
    if (opponentForfeitHandled) return
    if (seriesTransitionActive || matchOutcome) return
    hideKoAnnouncementImmediate()
    console.info('[matchEnd] concludeRoundElimination', {
      iWonRound,
      stocksYou,
      stocksFoe,
      lobbyMode: lobby.mode,
      role: lobby.mode === 'online' ? lobby.role : 'offline',
      stack: new Error().stack?.split('\n').slice(1, 6).join(' | '),
    })
    seriesTransitionActive = true
    const epochAtStart = pvpMatchEpoch
    try {
      if (iWonRound) tutorialBotRingouts += 1
      await playGameOutcomeSplashSequence(iWonRound ? 'win' : 'lose')
      if (epochAtStart !== pvpMatchEpoch) return
      if (opponentForfeitHandled) return
      if (iWonRound) {
        await sleepMs(2000)
        if (epochAtStart !== pvpMatchEpoch) return
        if (opponentForfeitHandled) return
      }
      endMatch(iWonRound ? 'win' : 'lose')
    } finally {
      seriesTransitionActive = false
    }
  }

  async function runPvpCountdown321(): Promise<void> {
    if (!countdownOverlay || !countdownNumEl) return
    hideKoAnnouncementImmediate()
    hideMatchEndOverlayFully()
    if (matchEndOverlay) matchEndOverlay.hidden = true
    countdownNumEl.classList.remove('countdown-num--go')
    countdownOverlay.classList.remove('countdown-overlay--go-phase')
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
    countdownNumEl.textContent = 'GO'
    countdownNumEl.classList.add('countdown-num--go')
    countdownOverlay.classList.add('countdown-overlay--go-phase')
    countdownOverlay.classList.remove('countdown-overlay--pulse')
    void countdownOverlay.offsetWidth
    countdownOverlay.classList.add('countdown-overlay--pulse')
    await sleepMs(620)

    countdownOverlay.hidden = true
    countdownOverlay.classList.remove(
      'countdown-overlay--pulse',
      'countdown-overlay--opaque',
      'countdown-overlay--go-phase',
    )
    countdownNumEl.classList.remove('countdown-num--go')
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
    lobbyDummyPractice = false
    lobbySmartBotActive = false
    mpSeqStarted = true
    resetMatchStockState()

    if (isOnline && lobby.mode === 'online') {
      spawnActors()
      const { opponent } = spawnSlots()
      bot.dispose(scene)
      botMode = 'network'
      bot = new BotFighter(scene, 'network', map.getBotSpawn(opponent, 0), {
        bodyColor: randomOpponentCapsuleColor(),
      })
      bot.root.position.copy(map.getBotSpawn(opponent, bot.getFootOffset()))
      bot.networkTargetPos.copy(bot.root.position)
      bot.alignFacingToward(camera.position)
      rebindOpponentBananaAttachment()
      warpRapierCapsulesToCurrentActors()
      syncHostSmartBotVoiceHandler()
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
    void initBananaRound()
    flushPendingBananaMsgs()
    tryPointerLock()
    window.setTimeout(() => {
      if (mpToast) mpToast.hidden = true
    }, 4200)
  }

  function scheduleMpBegin(): void {
    if (!isOnline || mpSeqStarted || mpPhase === 'live') return
    if (mpPresenceCount < 2) return
    if (guestAwaitingHostHello && !guestSawHostHello) return
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
      if (guestAwaitingHostHello && !guestSawHostHello) return
      if (!mpOpponentName) {
        mpOpponentName = 'Player'
      }
      void runMpBeginNow()
    }, 550)
  }

  function hideMatchEndOverlayFully(): void {
    if (matchEndOverlay) matchEndOverlay.hidden = true
    matchEndCardEl?.classList.remove('match-end-card--forfeit')
    if (matchEndLobbyBtnEl) matchEndLobbyBtnEl.hidden = true
    if (matchEndSecondaryBtnEl) matchEndSecondaryBtnEl.hidden = true
  }

  function showMatchEndLobbyControls(): void {
    if (!matchOutcome) return
    if (matchEndLobbyBtnEl) matchEndLobbyBtnEl.hidden = false
    if (matchEndSecondaryBtnEl) {
      const label = currentMatchSecondaryLabel()
      if (label) {
        matchEndSecondaryBtnEl.textContent = label
        matchEndSecondaryBtnEl.hidden = false
      } else {
        matchEndSecondaryBtnEl.hidden = true
      }
    }
  }

  function currentMatchIntent(): MatchIntent | null {
    if (lobby.mode !== 'online') return null
    return lobby.intent
  }

  function currentMatchSecondaryLabel(): string | null {
    const intent = currentMatchIntent()
    if (!intent) return null
    switch (intent) {
      case 'quickMatch':
        return 'Requeue'
      case 'private':
        return 'Rematch'
      case 'practice':
        return 'Practice Again'
      case 'vsBot':
        return 'Fight Bot Again'
      default:
        return null
    }
  }

  /** Hide HUD layers that fight with the single match-result / forfeit surface. */
  function squelchCompetingEndOfMatchUi(): void {
    if (matchCancelledOverlay) matchCancelledOverlay.hidden = true
    if (winReturnLobbyOverlayEl) {
      winReturnLobbyOverlayEl.hidden = true
    }
    hideWinGameSplash()
    hideKoAnnouncementImmediate()
    if (countdownOverlay) {
      countdownOverlay.hidden = true
      countdownOverlay.classList.remove('countdown-overlay--pulse', 'countdown-overlay--opaque')
    }
    hideLeaveMatchDialog()
    if (mpToast) {
      mpToast.hidden = true
      mpToast.classList.remove('mp-toast--bad')
    }
    if (stunnedOverlayEl) stunnedOverlayEl.hidden = true
  }

  function returnToLobbyReload(notifyOpponent: boolean = false): void {
    leavingToLobby = true
    squelchCompetingEndOfMatchUi()
    gameRoot.classList.add('game-root--hud-suspended')
    if (notifyOpponent && isOnline && lobby.mode === 'online' && (mpSocket?.readyState === 1 || rtcGame)) {
      try {
        sendGameTraffic({ type: 'matchCancelled' })
      } catch {
        /* ignore */
      }
    }
    try {
      rtcGame?.dispose()
    } catch {
      /* ignore */
    }
    try {
      mpSocket?.close()
    } catch {
      /* ignore */
    }
    runSessionReloadGateThen(() => {
      window.location.reload()
    })
  }

  function showOpponentForfeitAndReturn(): void {
    if (opponentForfeitHandled) return
    /* If the match has already ended, the post-match overlay (Requeue / Return-to-Lobby)
     * is up and each peer makes an independent decision. The opponent leaving — usually
     * because they hit Requeue and triggered a reload — must NOT clobber our match-end
     * UI or auto-return us to the lobby. */
    if (matchOutcome !== null) {
      opponentForfeitHandled = true
      return
    }
    opponentForfeitHandled = true
    squelchCompetingEndOfMatchUi()
    clearMovementKeys()
    hideWinGameSplash()
    winFinisher = null
    matchOutcome = null
    hideMatchEndOverlayFully()
    try {
      controls.unlock()
    } catch {
      /* ignore */
    }
    triggerHitImpactFx()
    voice.resumeAudio()
    voice.playFallbackHitSound()
    if (matchEndOverlay) matchEndOverlay.hidden = false
    matchEndCardEl?.classList.add('match-end-card--forfeit')
    if (matchEndTitle) matchEndTitle.textContent = 'Your opponent forfeited'
    if (matchEndSub) matchEndSub.textContent = 'GAME OVER'
    window.setTimeout(() => {
      returnToLobbyReload(false)
    }, 1450)
  }

  function dispatchPeerGamePayload(data: Record<string, unknown>): void {
    if (lobby.mode !== 'online') return
    const ty = data.type as string | undefined

    if (DEBUG_MP) {
      if (ty === 'voiceShot') {
        const n = typeof data.audioB64 === 'string' ? data.audioB64.length : 0
        debugMpLog(n ? `recv voiceShot b64~${n}` : 'recv voiceShot (trajectory)')
      } else if (ty === 'voiceShotAudio' && typeof data.audioB64 === 'string') {
        debugMpLog(`recv voiceShotAudio b64~${data.audioB64.length}`)
      } else if (ty === 'authDamage') {
        debugMpLog(
          `recv authDamage victim=${String(data.victimRole)} agg=${String(data.aggressorRole)}`,
        )
      } else if (ty && ty !== 'pose') {
        debugMpLog(`recv ${ty}`)
      }
    }

    if (ty === 'actorSfx' && typeof data.sfx === 'string') {
      const fromRole =
        data.fromRole === 'host' || data.fromRole === 'guest' ? data.fromRole : undefined
      /* Ignore our own echoes: WS relay can mirror sends; RTC channel does not, but this is cheap. */
      if (!fromRole || fromRole === lobby.role) return
      /* Only play during live PvP — silences spurious or pre-match SFX. */
      if (!isPvp() || mpPhase !== 'live') return
      if (data.sfx === 'footstep' || data.sfx === 'jump' || data.sfx === 'land' || data.sfx === 'shoot') {
        const kind = data.sfx as SfxKind
        playEnemySfxSpatialAt(kind, bot.bodyCenter, camera)
      }
      return
    }

    if (ty === 'textChat' && typeof data.text === 'string') {
      const fromRole =
        data.fromRole === 'host' || data.fromRole === 'guest' ? data.fromRole : undefined
      if (!fromRole || fromRole === lobby.role) return
      const msg = data.text.trim().replace(/\s+/g, ' ').slice(0, 180)
      if (!msg) return
      appendTextChatLine(opponentHudName(), msg)
      return
    }

    if (ty === 'presence' && typeof data.count === 'number') {
      mpPresenceCount = data.count
      if (mpPresenceCount >= 2) {
        peerSeenInRoom = true
      } else if (peerSeenInRoom && lobby.mode === 'online') {
        showOpponentForfeitAndReturn()
      }
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
        peerSeenInRoom = true
        if (lobby.mode === 'online' && lobby.role === 'guest' && data.role === 'host') {
          guestSawHostHello = true
        }
        mpOpponentName = data.displayName.trim() || 'Player'
        if (lobby.mode === 'online' && lobby.role === 'host') {
          sendGameTraffic({
            type: 'hello',
            displayName: displayPlayerName(),
            role: lobby.role,
            mapId: map.id,
          })
        }
        /* Host is authoritative on map: guest swaps to match the host's choice. */
        if (lobby.mode === 'online' && lobby.role === 'guest' && isMapId(data.mapId)) {
          void swapMap(data.mapId)
        }
        scheduleMpBegin()
      }
      return
    }

    if (ty === 'authStockKO' && lobby.mode === 'online') {
      const sh = data.stocksHost
      const sg = data.stocksGuest
      const beforeYou = stocksYou
      const beforeFoe = stocksFoe
      if (typeof sh === 'number' && typeof sg === 'number' && Number.isFinite(sh) && Number.isFinite(sg)) {
        applyNetworkStocksFromPayload(sh, sg)
      }
      const vr =
        data.victimRole === 'host' || data.victimRole === 'guest' ? data.victimRole : undefined
      console.info('[stockKO] authStockKO received', {
        victimRole: vr,
        stocksHost: sh,
        stocksGuest: sg,
        stocksYou,
        stocksFoe,
      })
      if (vr) {
        const isYouVictim = vr === lobby.role
        const before = isYouVictim ? beforeYou : beforeFoe
        const after = isYouVictim ? stocksYou : stocksFoe
        showKoAnnouncement(
          isYouVictim ? displayPlayerName() : opponentHudName(),
          before,
          after,
          isYouVictim ? 'you' : 'foe',
        )
        scheduleKoAnnouncementDismiss(gameConfig.koAnnounceHoldMs)
        if (lobby.role === 'host') {
          scheduleAuthRespawnHost(vr)
        }
      }
      return
    }

    if (ty === 'authRespawn' && lobby.mode === 'online') {
      applyAuthRespawnPayload(data)
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
        triggerAggressorHitConfirmFx(enemyPercent)
        const vr = data.victimRole === 'host' || data.victimRole === 'guest' ? data.victimRole : undefined
        if (vr && vr !== lobby.role) {
          bot.flashVictimInvuln(gameConfig.hitVictimWhiteFlashMs)
        }
        const sid = typeof data.shotId === 'string' ? data.shotId : null
        if (sid) {
          const attackerClip = pendingAttackerShotAudioById.get(sid)
          if (attackerClip) {
            voice.resumeAudio()
            voice.playBufferSpatialAt(attackerClip, bot.bodyCenter, camera)
            pendingAttackerShotAudioById.delete(sid)
          }
        }
      }
      if (
        data.victimRole === lobby.role &&
        typeof data.dx === 'number' &&
        typeof data.dz === 'number'
      ) {
        let knockFromWorld: Vector3 | undefined
        if (
          typeof data.hx === 'number' &&
          typeof data.hy === 'number' &&
          typeof data.hz === 'number'
        ) {
          _fp.set(data.hx, data.hy, data.hz)
          knockFromWorld = _fp
        }
        /* `playerPercent` was just set from auth payload — that is always the local player's launch %. */
        const tHit =
          typeof data.chargeT === 'number' && Number.isFinite(data.chargeT) ? data.chargeT : 0.5
        applyPeerMeleeHit(data.dx, data.dz, {
          authoritative: true,
          victimPercent: playerPercent,
          overkill150: crossedLaunch150,
          knockFromWorld,
          aggressorChargeT: tHit,
        })
        const sid = data.shotId
        if (typeof sid === 'string') {
          const clip = pendingPeerShotAudioById.get(sid)
          if (clip) {
            voice.resumeAudio()
            const hitPos = pendingVictimHitPosByShotId.get(sid) ?? knockFromWorld
            if (hitPos) voice.playBufferSpatialAt(clip, hitPos, camera, { victimHitReceive: true })
            else voice.playBuffer(clip)
            pendingPeerShotAudioById.delete(sid)
            pendingVictimVoiceShotIds.delete(sid)
            pendingVictimHitPosByShotId.delete(sid)
          } else {
            pendingVictimVoiceShotIds.add(sid)
            if (knockFromWorld) pendingVictimHitPosByShotId.set(sid, knockFromWorld.clone())
          }
        }
      }
      return
    }

    if (ty === 'authMatchEnd' && lobby.mode === 'online' && typeof data.winnerRole === 'string') {
      if (!opponentForfeitHandled && !matchOutcome && !seriesTransitionActive) {
        const wr =
          data.winnerRole === 'host' || data.winnerRole === 'guest' ? data.winnerRole : undefined
        if (wr) void concludeRoundElimination(wr === lobby.role)
      }
      return
    }

    /* Rematch wire types — shelved; ignore for protocol compatibility with older peers. */
    if (ty === 'rematchOffer' || ty === 'rematchAccept' || ty === 'rematchWithdraw') {
      return
    }
    if (ty === 'rematchDeclineToLobby') {
      returnToLobbyReload()
      return
    }

    if (ty === 'matchCancelled' && lobby.mode === 'online') {
      if (opponentForfeitHandled) return
      if (
        matchEndOverlay &&
        !matchEndOverlay.hidden &&
        matchEndCardEl?.classList.contains('match-end-card--forfeit')
      ) {
        return
      }
      if (matchCancelledOverlay && !matchOutcome && !seriesTransitionActive) {
        try {
          controls.unlock()
        } catch {
          /* ignore */
        }
        squelchCompetingEndOfMatchUi()
        matchCancelledOverlay.hidden = false
        requestAnimationFrame(() => matchCancelledOkBtn?.focus())
      } else {
        returnToLobbyReload(false)
      }
      return
    }

    if (ty === 'bananaInit' && Array.isArray(data.pickups)) {
      if (isPvp() && mpPhase === 'live') {
        applyBananaInit(
          data.pickups as { id: string; x: number; y: number; z: number }[],
        )
      } else {
        pendingBananaMsgs.push(data)
      }
      return
    }
    if (
      ty === 'bananaAuthPickup' &&
      (data.role === 'host' || data.role === 'guest') &&
      typeof data.pickupId === 'string'
    ) {
      if (isPvp() && mpPhase === 'live') {
        applyBananaAuthPickup(data.role, data.pickupId)
      } else {
        pendingBananaMsgs.push(data)
      }
      return
    }
    if (
      ty === 'bananaAuthThrowResult' &&
      (data.fromRole === 'host' || data.fromRole === 'guest') &&
      typeof data.peelId === 'string' &&
      typeof data.x === 'number' &&
      typeof data.y === 'number' &&
      typeof data.z === 'number'
    ) {
      if (isPvp() && mpPhase === 'live') {
        applyBananaAuthThrowResult(data.fromRole, data.peelId, data.x, data.y, data.z)
      } else {
        pendingBananaMsgs.push(data)
      }
      return
    }
    if (
      ty === 'bananaAuthSlip' &&
      (data.victimRole === 'host' || data.victimRole === 'guest') &&
      typeof data.ms === 'number' &&
      typeof data.peelId === 'string'
    ) {
      if (isPvp() && mpPhase === 'live') {
        applyBananaAuthSlip(data.victimRole, data.ms, data.peelId)
      } else {
        pendingBananaMsgs.push(data)
      }
      return
    }
    if (
      ty === 'bananaRequestPickup' &&
      lobby.role === 'host' &&
      (data.fromRole === 'host' || data.fromRole === 'guest') &&
      typeof data.pickupId === 'string' &&
      typeof data.fx === 'number' &&
      typeof data.fy === 'number' &&
      typeof data.fz === 'number' &&
      isPvp() &&
      mpPhase === 'live'
    ) {
      _bFeet.set(data.fx, data.fy, data.fz)
      processHostBananaPickup(data.fromRole, data.pickupId, _bFeet)
      return
    }
    if (
      ty === 'bananaRequestThrow' &&
      lobby.role === 'host' &&
      (data.fromRole === 'host' || data.fromRole === 'guest') &&
      typeof data.ox === 'number' &&
      typeof data.oy === 'number' &&
      typeof data.oz === 'number' &&
      typeof data.dirx === 'number' &&
      typeof data.diry === 'number' &&
      typeof data.dirz === 'number' &&
      isPvp() &&
      mpPhase === 'live'
    ) {
      processHostBananaThrow(
        data.fromRole,
        data.ox,
        data.oy,
        data.oz,
        data.dirx,
        data.diry,
        data.dirz,
      )
      return
    }

    if (
      ty === 'pose' &&
      data.fromRole === 'bot' &&
      typeof data.x === 'number' &&
      typeof data.z === 'number' &&
      typeof data.fy === 'number' &&
      typeof data.ry === 'number' &&
      !isPvp()
    ) {
      if (lobby.mode === 'online' && lobby.role === 'guest') {
        if (bot.mode !== 'network') {
          recreateBot('network')
        }
        bot.root.position.set(data.x, data.fy + bot.getFootOffset(), data.z)
        bot.root.rotation.y = data.ry
        bot.networkTargetPos.copy(bot.root.position)
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
      typeof data.vz === 'number'
    ) {
      mpDiagCounters.recvVoiceShotMsg++
      const fromRole =
        data.fromRole === 'host' || data.fromRole === 'guest' || data.fromRole === 'bot'
          ? data.fromRole
          : undefined
      if (lobby.role === 'host' && browserHost && fromRole && fromRole !== 'bot') {
        browserHost.processVoiceShot(fromRole, data)
      }
      if (fromRole && (fromRole === 'bot' || fromRole !== lobby.role)) {
        const b64 = typeof data.audioB64 === 'string' ? data.audioB64 : undefined
        void handlePeerVoiceShot({
          shotId: data.shotId,
          ox: data.ox,
          oy: data.oy,
          oz: data.oz,
          vx: data.vx,
          vy: data.vy,
          vz: data.vz,
          mime: typeof data.mime === 'string' ? data.mime : 'audio/webm',
          audioB64: b64,
          shotScale: typeof data.shotScale === 'number' ? data.shotScale : 1,
        })
      }
      return
    }

    if (
      ty === 'voiceShotAudio' &&
      typeof data.shotId === 'string' &&
      typeof data.audioB64 === 'string' &&
      typeof data.mime === 'string'
    ) {
      void handlePeerVoiceShotAudio(data.shotId, data.mime, data.audioB64)
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
    opts?: {
      authoritative?: boolean
      victimPercent?: number
      overkill150?: boolean
      /** When set, knock direction and lift use camera − shot (3D), then flatten for XZ slide. */
      knockFromWorld?: Vector3
      /**
       * Authoritative PvP: charge tick from the aggressor (0–1) scales base knock
       * between `knockVoiceMinMul` and `knockVoiceMaxMul` (like local shots vs bot).
       */
      aggressorChargeT?: number
    },
  ): void {
    playerBananaSlipUntil = 0
    let belowAim = 0
    if (opts?.knockFromWorld) {
      _knFromShot.subVectors(camera.position, opts.knockFromWorld)
      if (_knFromShot.lengthSq() < 1e-8) {
        _knDir.set(dx, 0, dz)
        if (_knDir.lengthSq() < 1e-8) _knDir.set(0, 0, 1)
        _knDir.normalize()
      } else {
        _knFromShot.normalize()
        belowAim = Math.max(0, _knFromShot.y)
        _knDir.copy(_knFromShot)
        _knDir.y = 0
        if (_knDir.lengthSq() < 1e-8) {
          _knDir.set(dx, 0, dz)
          if (_knDir.lengthSq() < 1e-8) _knDir.set(0, 0, 1)
        }
        _knDir.normalize()
      }
    } else {
      _knDir.set(dx, 0, dz)
      if (_knDir.lengthSq() < 1e-8) _knDir.set(0, 0, 1)
      _knDir.normalize()
    }
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
    const tAgg =
      typeof opts?.aggressorChargeT === 'number' && Number.isFinite(opts.aggressorChargeT)
        ? Math.max(0, Math.min(1, opts.aggressorChargeT))
        : null
    const chargeKnockScale =
      auth && tAgg !== null
        ? gameConfig.knockVoiceMinMul + tAgg * (gameConfig.knockVoiceMaxMul - gameConfig.knockVoiceMinMul)
        : 1
    const pctLift = Math.min(2.5, victimPct / 100)
    const vyMul = 1 + pctLift * 0.52
    const baseKnock =
      gameConfig.knockbackOnPlayer *
      gameConfig.playerHurtKnockMul *
      comboMul *
      chargeKnockScale *
      launchMul *
      impulseMul
    playerKnock.addScaledVector(_knDir, baseKnock)
    vy += gameConfig.playerHurtVyBoost * comboMul * vyMul
    vy += baseKnock * gameConfig.knockVictimLiftMul
    vy += baseKnock * gameConfig.knockVictimBelowAimMul * belowAim
    triggerHitImpactFx()
    triggerLocalVictimWhiteFlash()
  }

  function triggerAggressorHitConfirmFx(victimPercentAfterHit: number): void {
    playTieredHitImpactOneShot(victimPercentAfterHit)
    const sm = getCameraShakeMul()
    shakeIntensity = Math.max(shakeIntensity, gameConfig.pvpAggressorHitShake * sm)
    flashIntensity = Math.max(flashIntensity, gameConfig.pvpAggressorHitFlash)
  }

  /** Extra pose packet so the authority sees you where you are the frame you fire. */
  function flushPoseForNetwork(): void {
    if (!isPvp()) return
    const fy = camera.position.y - eyeH()
    sendGameTraffic({
      type: 'pose',
      x: camera.position.x,
      z: camera.position.z,
      fy,
      ry: camera.rotation.y,
      recording: chargingLmb || chargingRmb,
      animBase: deriveLocalAnimBase(),
      animOneShot: localAnimOneShot,
      animEpoch: localAnimEpoch,
      speedN: Math.min(
        1,
        Math.hypot(velocity.x, velocity.z) / Math.max(0.5, gameConfig.moveSpeed),
      ),
    })
    poseSendAcc = 0
  }

  function tryPlayVictimPendingShot(shotId: string, buf: AudioBuffer | null): void {
    if (!pendingVictimVoiceShotIds.has(shotId)) return
    const hitPos = pendingVictimHitPosByShotId.get(shotId)
    pendingVictimVoiceShotIds.delete(shotId)
    pendingPeerShotAudioById.delete(shotId)
    pendingVictimHitPosByShotId.delete(shotId)
    voice.resumeAudio()
    if (buf) {
      if (hitPos) voice.playBufferSpatialAt(buf, hitPos, camera, { victimHitReceive: true })
      else voice.playBuffer(buf)
    } else {
      voice.playFallbackHitSound()
    }
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
    audioB64?: string | undefined
    shotScale: number
  }): Promise<void> {
    if (seenVoiceShotIds.has(data.shotId)) return
    seenVoiceShotIds.add(data.shotId)
    if (seenVoiceShotIds.size > 200) seenVoiceShotIds.clear()

    const o = new Vector3(data.ox, data.oy, data.oz)
    const v = new Vector3(data.vx, data.vy, data.vz)
    const hasB64 = typeof data.audioB64 === 'string' && data.audioB64.length > 0
    let buf: AudioBuffer | null = null

    if (hasB64) {
      try {
        const blob = base64ToBlob(data.audioB64!, data.mime)
        buf = await voice.decodeRecording(blob)
        if (buf) {
          pendingPeerShotAudioById.set(data.shotId, buf)
          if (pendingPeerShotAudioById.size > 120) {
            const first = pendingPeerShotAudioById.keys().next().value as string | undefined
            if (first) pendingPeerShotAudioById.delete(first)
          }
        }
      } catch {
        debugMpLog('peer voiceShot decode/inject failed')
        bot.injectWorldProjectile(o, v, null, data.shotScale)
        tryPlayVictimPendingShot(data.shotId, null)
        return
      }
    }

    bot.injectWorldProjectile(o, v, buf, data.shotScale)
    if (hasB64) {
      if (buf) tryPlayVictimPendingShot(data.shotId, buf)
      else tryPlayVictimPendingShot(data.shotId, null)
    }
  }

  async function handlePeerVoiceShotAudio(
    shotId: string,
    mime: string,
    audioB64: string,
  ): Promise<void> {
    if (!seenVoiceShotIds.has(shotId)) return
    let blob: Blob
    try {
      blob = base64ToBlob(audioB64, mime)
    } catch {
      debugMpLog('peer voiceShotAudio b64 decode failed')
      tryPlayVictimPendingShot(shotId, null)
      return
    }
    return handlePeerVoiceShotAudioBlob(shotId, blob)
  }

  /**
   * Binary-frame path for peer voice clips: skips the per-shot
   * `JSON.stringify` + base64 encode/decode that would otherwise stall
   * the main thread when the opponent fires a fresh clip.
   */
  async function handlePeerVoiceShotAudioBlob(
    shotId: string,
    blob: Blob,
  ): Promise<void> {
    if (!seenVoiceShotIds.has(shotId)) return
    let buf: AudioBuffer | null = null
    try {
      buf = await voice.decodeRecording(blob)
      if (buf) {
        pendingPeerShotAudioById.set(shotId, buf)
        if (pendingPeerShotAudioById.size > 120) {
          const first = pendingPeerShotAudioById.keys().next().value as string | undefined
          if (first) pendingPeerShotAudioById.delete(first)
        }
      }
    } catch {
      debugMpLog('peer voiceShotAudio decode failed')
      tryPlayVictimPendingShot(shotId, null)
      return
    }
    bot.attachReplicatedProjectileAudio(buf)
    if (buf) tryPlayVictimPendingShot(shotId, buf)
    else tryPlayVictimPendingShot(shotId, null)
  }

  async function releaseVoiceShot(): Promise<void> {
    const blob = await voice.finishChargeRecording()
    setLocalVoipRecordingBlocked(false)
    queueLocalAnimOneShot('shooting')
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
    const projMode = Math.max(0, Math.min(2, Math.round(gameConfig.voiceProjectileMode)))
    /* Fire visual immediately with `null` audio — `decodeAudioData` can stall the main
     * thread for tens of ms on long clips. The decoded buf is attached below as soon
     * as it lands, so local hit playback (offline) and the `pendingAttackerShotAudioById`
     * confirm playback (PvP) still work without delaying the shot. */
    const fired =
      projMode === 1
        ? arms.tryHeadscanFire(speedMul, null, t, sizeMul, _muzzleWorld, _aimDir)
        : projMode === 2
          ? arms.tryHeadscanFire(speedMul, null, t, sizeMul, camera.position, _aimDir)
          : arms.tryFire(speedMul, null, t, sizeMul, _muzzleWorld, _aimDir)
    if (fired) {
      tutorialVoiceShotsFired += 1
      playLocalVoiceRecordReleaseSfx()
      broadcastActorSfxIfPvp('shoot')
      voice.stopVoiceClipPlayback()
      voice.resetChargeMeter()
      voiceChargeSmoothed = 0
      chargeHudMicAmpSmoothed = 0
      setChargeBarDisplayPct(0)
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

    if (!fired) return

    /* PvP path: send trajectory immediately so the host can validate and the peer
     * can render the projectile right away. The audio (binary frame) and the local
     * decoded `AudioBuffer` are produced in parallel below — neither is on the
     * critical input → fire path. */
    let pvpShotId: string | null = null
    let pvpMime: string | null = null
    if (
      isOnline &&
      mpPhase === 'live' &&
      lobby.mode === 'online' &&
      bot.mode === 'network'
    ) {
      pvpShotId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      pvpMime = blob.type || 'audio/webm'
      const o = new Vector3()
      const v = new Vector3()
      arms.copyLastShotWorld(o, v)
      try {
        flushPoseForNetwork()
        const payloadLead: Record<string, unknown> = {
          type: 'voiceShot',
          shotId: pvpShotId,
          ox: o.x,
          oy: o.y,
          oz: o.z,
          vx: v.x,
          vy: v.y,
          vz: v.z,
          chargeT: raw,
          shotScale: sizeMul,
          mime: pvpMime,
          fromRole: lobby.role,
        }
        sendGameTraffic(payloadLead)
        if (lobby.role === 'host' && browserHost) {
          browserHost.processVoiceShot('host', payloadLead)
        }
        void sendVoiceShotAudio(pvpShotId, pvpMime, blob)
      } catch {
        mpDiagCounters.voiceShotSendFail++
        debugMpLog('local voiceShot build/send failed (clip size?)')
      }
    }

    /* Local audio decode in the background — attach to the in-flight projectile and
     * the attacker pending map once it lands. */
    void voice
      .decodeRecording(blob)
      .then((buf) => {
        if (buf) arms.attachLastShotHitAudio(buf)
        if (buf && pvpShotId) {
          pendingAttackerShotAudioById.set(pvpShotId, buf)
          if (pendingAttackerShotAudioById.size > 240) {
            const first = pendingAttackerShotAudioById.keys().next().value as string | undefined
            if (first) pendingAttackerShotAudioById.delete(first)
          }
        }
      })
      .catch(() => {
        /* Decode failure is non-fatal: hit will still trigger via fallback SFX. */
      })
  }

  /** Pistol mode: build a fresh AudioBuffer holding just the snippet's samples (cheap, ≤1s usually). */
  function sliceBufferToBuffer(
    src: AudioBuffer,
    offsetSec: number,
    durationSec: number,
  ): AudioBuffer | null {
    const ctx = voice.getAudioContext()
    if (!ctx) return null
    const start = Math.max(0, Math.min(src.length, Math.floor(offsetSec * src.sampleRate)))
    const end = Math.max(
      start + 1,
      Math.min(src.length, start + Math.floor(durationSec * src.sampleRate)),
    )
    const frames = Math.max(1, end - start)
    const channels = Math.max(1, src.numberOfChannels)
    const out = ctx.createBuffer(channels, frames, src.sampleRate)
    for (let ch = 0; ch < channels; ch++) {
      const dst = out.getChannelData(ch)
      const inp = src.getChannelData(ch).subarray(start, start + frames)
      dst.set(inp)
    }
    return out
  }

  /** Pistol mode: RMB released — decode recording, slice equally into round(charge × magSize) snippets. */
  async function finishPistolReload(): Promise<void> {
    const blob = await voice.finishChargeRecording()
    setLocalVoipRecordingBlocked(false)
    /* Visual telegraph: keep charge frozen for the HUD to show ammo/cap fill from now on. */
    const cap = pistolMagSize()
    const liveCharge = voiceInputBlocked
      ? Math.max(0, Math.min(1, gameConfig.voiceDryFireT))
      : voiceChargeSmoothed
    let ammo = Math.max(0, Math.min(cap, Math.round(liveCharge * cap)))
    if (ammo <= 0) {
      voice.resetChargeMeter()
      voiceChargeSmoothed = 0
      chargeHudMicAmpSmoothed = 0
      setChargeBarDisplayPct(0)
      if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--ready')
      if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--overload')
      return
    }
    let buf: AudioBuffer | null = null
    try {
      buf = await voice.decodeRecording(blob)
    } catch {
      buf = null
    }
    if (!buf || buf.duration < 0.05) {
      /* Decode failed or clip too short — refund charge so the player can retry. */
      voice.resetChargeMeter()
      voiceChargeSmoothed = 0
      chargeHudMicAmpSmoothed = 0
      setChargeBarDisplayPct(0)
      return
    }
    const slotDur = buf.duration / ammo
    const slots: PistolSlot[] = []
    for (let i = 0; i < ammo; i++) {
      slots.push({ offsetSec: i * slotDur, durationSec: slotDur })
    }
    pistolMag = { buf, slots }
    pistolNextSlot = 0
    /* Reload reveal: start at 0 visible rounds; the per-frame tick increments at `pistolReloadStepMs`
       cadence, popping a `+1` next to the ammo counter for each round revealed. */
    pistolReloadRevealed = 0
    pistolReloadAccMs = 0
    /* Reset live charge so the bar redraws from ammo/cap on the next frame. */
    voice.resetChargeMeter()
    voiceChargeSmoothed = 0
    chargeHudMicAmpSmoothed = 0
    if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--overload')
    if (chargeBarWrap) chargeBarWrap.classList.remove('charge-bar-wrap--ready')
  }

  /** Per-frame: advance the reveal animation while a fresh mag is being loaded. */
  function tickPistolReloadAnim(deltaMs: number): void {
    if (!pistolMag) return
    if (pistolReloadRevealed >= pistolMag.slots.length) return
    const stepMs = Math.max(10, gameConfig.pistolReloadStepMs)
    pistolReloadAccMs += deltaMs
    let safety = 0
    while (
      pistolReloadAccMs >= stepMs &&
      pistolReloadRevealed < pistolMag.slots.length &&
      safety++ < 32
    ) {
      pistolReloadAccMs -= stepMs
      pistolReloadRevealed += 1
      popAmmoFeedback()
    }
  }

  /** Pistol mode: LMB click — fire the next snippet as a fresh shot (no charging, no record). */
  async function firePistolShot(): Promise<void> {
    if (!pistolMag) return
    /* Respect the reload reveal — clicking before a round is "loaded" should be a no-op. */
    if (pistolAmmoLeft() <= 0) return
    if (pistolNextSlot >= pistolMag.slots.length) return
    const slot = pistolMag.slots[pistolNextSlot]
    /* Build a self-contained AudioBuffer for this snippet so the existing hit-replay path works unchanged. */
    const snippetBuf = sliceBufferToBuffer(pistolMag.buf, slot.offsetSec, slot.durationSec)

    queueLocalAnimOneShot('shooting')

    /* Pistol shots use their own dedicated tweaks — independent from voice charge-and-release. */
    const t = 1
    const speedMul = Math.max(0.05, gameConfig.pistolShotSpeedMul)
    const sizeMul = Math.max(0.15, gameConfig.pistolShotSizeMul)
    const fireOpts = { pistolMode: true, bypassSpeedClamp: true }

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

    const projMode = Math.max(0, Math.min(2, Math.round(gameConfig.voiceProjectileMode)))
    const fired =
      projMode === 1
        ? arms.tryHeadscanFire(speedMul, snippetBuf, t, sizeMul, _muzzleWorld, _aimDir, fireOpts)
        : projMode === 2
          ? arms.tryHeadscanFire(speedMul, snippetBuf, t, sizeMul, camera.position, _aimDir, fireOpts)
          : arms.tryFire(speedMul, snippetBuf, t, sizeMul, _muzzleWorld, _aimDir, fireOpts)
    if (!fired) return

    playLocalVoiceRecordReleaseSfx()
    broadcastActorSfxIfPvp('shoot')

    /* Consume one round; clear the magazine when emptied so the HUD prompt swaps to "Hold RMB". */
    pistolNextSlot += 1
    if (pistolNextSlot >= pistolMag.slots.length) {
      pistolMag = null
      pistolNextSlot = 0
    }
    const ammoCap = Math.round(gameConfig.voiceShotAmmoMax)
    if (ammoCap > 0 && voiceAmmoLeft > 0) voiceAmmoLeft -= 1

    /* Look-down hop: keep the existing ergonomic boost identical to legacy fire path. */
    if (voiceDownBoostReady && camera.rotation.x <= -gameConfig.voiceLookdownPitchMin) {
      vy = Math.min(
        gameConfig.voiceLookdownBoostMaxVy,
        vy + Math.max(0, gameConfig.voiceLookdownBoostVy),
      )
      grounded = false
      voiceDownBoostReady = false
    }

    if (
      isOnline &&
      mpPhase === 'live' &&
      lobby.mode === 'online' &&
      bot.mode === 'network' &&
      snippetBuf
    ) {
      const shotId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const o = new Vector3()
      const v = new Vector3()
      arms.copyLastShotWorld(o, v)
      try {
        const wavBlob = audioBufferSliceToWavBlob(snippetBuf, 0, snippetBuf.duration)
        const mime = 'audio/wav'
        pendingAttackerShotAudioById.set(shotId, snippetBuf)
        if (pendingAttackerShotAudioById.size > 240) {
          const first = pendingAttackerShotAudioById.keys().next().value as string | undefined
          if (first) pendingAttackerShotAudioById.delete(first)
        }
        flushPoseForNetwork()
        const payloadLead: Record<string, unknown> = {
          type: 'voiceShot',
          shotId,
          ox: o.x,
          oy: o.y,
          oz: o.z,
          vx: v.x,
          vy: v.y,
          vz: v.z,
          chargeT: t,
          shotScale: sizeMul,
          mime,
          fromRole: lobby.role,
        }
        sendGameTraffic(payloadLead)
        if (lobby.role === 'host' && browserHost) {
          browserHost.processVoiceShot('host', payloadLead)
        }
        void sendVoiceShotAudio(shotId, mime, wavBlob)
      } catch {
        mpDiagCounters.voiceShotSendFail++
        debugMpLog('pistol voiceShot build/send failed (slice encode?)')
      }
    }
  }

  function tickLocalPlayerHud(deltaSec: number): void {
    if (hudSmokeLayer && !hudSmokeSized) {
      hudSmokeLayer.resize()
      hudSmokeSized = true
    }
    if (hudSmokeLayer) {
      hudSmokeLayer.tick(deltaSec, smokeIntensity01(Math.min(100, playerPercent)))
    }

    let nextPortrait = PORTRAIT_IDLE_URL
    if (stunnedFxActive) {
      nextPortrait = PORTRAIT_STUNNED_URL
    } else {
      const charging = chargingLmb || chargingRmb
      const micOn = chargeHudMicAmpSmoothed > 0.035
      const chargeRising = voiceChargeSmoothed > hudPrevVoiceCharge + 0.004
      const scream =
        charging && (micOn || chargeRising || voiceChargeSmoothed > 0.03)
      if (scream) nextPortrait = PORTRAIT_SCREAM_URL
      else if (playerPercent >= 70) nextPortrait = PORTRAIT_HURT_URL
    }
    if (hudPortraitImgEl && nextPortrait !== hudPortraitResolvedUrl) {
      hudPortraitResolvedUrl = nextPortrait
      hudPortraitImgEl.src = nextPortrait
    }

    hudPrevVoiceCharge = voiceChargeSmoothed
  }

  function syncHud(): void {
    if (hudDisplayNameEl) hudDisplayNameEl.textContent = displayPlayerName()
    if (hudDamagePctEl) {
      const v = Math.round(Math.min(999, Math.max(0, playerPercent)))
      hudDamagePctEl.textContent = `${v}%`
      hudDamagePctEl.style.color = launchPercentTextColor(Math.min(100, playerPercent))
    }
    if (chargeBarMinMark) {
      chargeBarMinMark.style.bottom = `${Math.max(0, Math.min(1, gameConfig.voiceMinChargeToFire)) * 100}%`
    }
    updateChargeStatusUi(voiceChargeSmoothed)
    syncStocksHud()
  }

  function resetMatchStockState(): void {
    const n = Math.max(1, Math.round(gameConfig.startStocks))
    stocksYou = n
    stocksFoe = n
    respawnInvulnUntilYou = 0
    respawnInvulnUntilFoe = 0
    offlineBlastKoPending = null
    for (const t of hostKoRespawnTimers.values()) window.clearTimeout(t)
    hostKoRespawnTimers.clear()
    syncStocksHud()
  }

  function applyNetworkStocksFromPayload(stocksHost: number, stocksGuest: number): void {
    if (lobby.mode !== 'online') return
    if (lobby.role === 'host') {
      stocksYou = stocksHost
      stocksFoe = stocksGuest
    } else {
      stocksYou = stocksGuest
      stocksFoe = stocksHost
    }
    /* Caller syncs HUD badges — may defer so KO padlock animation can show `before` → `after`. */
  }

  function syncStockBadgeNums(): void {
    if (hudStockYouNumEl) hudStockYouNumEl.textContent = String(Math.max(0, stocksYou))
  }

  function syncStocksHud(): void {
    syncStockBadgeNums()
  }

  function flashVictimStockBadge(who: 'you' | 'foe'): void {
    if (who !== 'you') return
    const el = hudStockYouWrapEl
    if (!el) return
    el.classList.remove('hud-stock-badge--flash')
    void el.offsetWidth
    el.classList.add('hud-stock-badge--flash')
  }

  function spawnSlotForRole(roleNet: 'host' | 'guest'): SpawnSlot {
    const slots = spawnSlots()
    if (lobby.mode !== 'online') return slots.player
    return roleNet === lobby.role ? slots.player : slots.opponent
  }

  let koAnnounceHoldTimer: ReturnType<typeof window.setTimeout> | null = null
  let koAnnounceFadeTimer: ReturnType<typeof window.setTimeout> | null = null
  let koPadlockTimer: ReturnType<typeof window.setTimeout> | null = null
  let koPadlockAborted = false

  function clearKoAnnouncementTimers(): void {
    koPadlockAborted = true
    if (koPadlockTimer !== null) {
      window.clearTimeout(koPadlockTimer)
      koPadlockTimer = null
    }
    if (koAnnounceHoldTimer !== null) {
      window.clearTimeout(koAnnounceHoldTimer)
      koAnnounceHoldTimer = null
    }
    if (koAnnounceFadeTimer !== null) {
      window.clearTimeout(koAnnounceFadeTimer)
      koAnnounceFadeTimer = null
    }
  }

  /** Clears KO overlay immediately — used before match-end / countdown / lobby so UI stacks correctly. */
  function hideKoAnnouncementImmediate(): void {
    clearKoAnnouncementTimers()
    if (!koAnnounceOverlayEl) return
    koAnnounceOverlayEl.classList.remove('ko-announce-overlay--visible')
    koAnnounceOverlayEl.hidden = true
  }

  function showKoAnnouncement(
    displayName: string,
    stocksBefore: number,
    stocksAfter: number,
    victim?: 'you' | 'foe',
  ): void {
    if (!koAnnounceOverlayEl || !koAnnounceNameEl) return
    clearKoAnnouncementTimers()
    koPadlockAborted = false

    const nm = displayName.trim().toUpperCase()
    koAnnounceNameEl.textContent = nm

    const loss =
      victim &&
      koAnnounceStockRowEl &&
      koAnnounceStockNumEl &&
      stocksBefore > stocksAfter

    if (loss) {
      koAnnounceStockRowEl.hidden = false

      const syncVictimBadge = (n: number): void => {
        if (victim === 'you' && hudStockYouNumEl) hudStockYouNumEl.textContent = String(n)
      }

      let n = stocksBefore
      koAnnounceStockNumEl.textContent = String(n)
      syncVictimBadge(n)

      const tickMs = 92
      const pulseTick = (): void => {
        if (!koAnnounceStockNumEl) return
        koAnnounceStockNumEl.classList.remove('hud-stock-num--tick')
        void koAnnounceStockNumEl.offsetWidth
        koAnnounceStockNumEl.classList.add('hud-stock-num--tick')
        const badgeNum = victim === 'you' ? hudStockYouNumEl : null
        badgeNum?.classList.remove('hud-stock-num--tick')
        void badgeNum?.offsetWidth
        badgeNum?.classList.add('hud-stock-num--tick')
      }

      const finishPadlock = (): void => {
        syncStocksHud()
        flashVictimStockBadge(victim!)
      }

      const step = (): void => {
        if (koPadlockAborted || !koAnnounceStockNumEl) return
        if (n <= stocksAfter) {
          finishPadlock()
          return
        }
        n -= 1
        koAnnounceStockNumEl.textContent = String(n)
        syncVictimBadge(n)
        pulseTick()
        if (n === stocksAfter) {
          finishPadlock()
          return
        }
        koPadlockTimer = window.setTimeout(step, tickMs)
      }

      if (n === stocksAfter) {
        finishPadlock()
      } else {
        koPadlockTimer = window.setTimeout(step, tickMs)
      }
    } else {
      if (koAnnounceStockRowEl) koAnnounceStockRowEl.hidden = true
      syncStocksHud()
    }

    koAnnounceOverlayEl.hidden = false
    koAnnounceOverlayEl.classList.remove('ko-announce-overlay--visible')
    void koAnnounceOverlayEl.offsetWidth
    koAnnounceOverlayEl.classList.add('ko-announce-overlay--visible')
  }

  /**
   * Fade and remove the stock-loss overlay after `delayMs` (aligns with `koAnnounceHoldMs`).
   * Optional callback runs when the fade begins (offline respawn applies here).
   */
  function scheduleKoAnnouncementDismiss(delayMs: number, onFadeBegin?: () => void): void {
    /* Do not clear padlock timers here — padlock runs in parallel after `showKoAnnouncement`. */
    if (koAnnounceHoldTimer !== null) {
      window.clearTimeout(koAnnounceHoldTimer)
      koAnnounceHoldTimer = null
    }
    if (koAnnounceFadeTimer !== null) {
      window.clearTimeout(koAnnounceFadeTimer)
      koAnnounceFadeTimer = null
    }
    koAnnounceHoldTimer = window.setTimeout(() => {
      koAnnounceHoldTimer = null
      if (!koAnnounceOverlayEl) return
      koAnnounceOverlayEl.classList.remove('ko-announce-overlay--visible')
      onFadeBegin?.()
      koAnnounceFadeTimer = window.setTimeout(() => {
        koAnnounceFadeTimer = null
        if (koAnnounceOverlayEl) koAnnounceOverlayEl.hidden = true
      }, 400)
    }, delayMs)
  }

  function scheduleAuthRespawnHost(victimRole: 'host' | 'guest'): void {
    const prev = hostKoRespawnTimers.get(victimRole)
    if (prev != null) window.clearTimeout(prev)
    const tid = window.setTimeout(() => {
      hostKoRespawnTimers.delete(victimRole)
      computeAndEmitAuthRespawn(victimRole)
    }, gameConfig.koAnnounceHoldMs)
    hostKoRespawnTimers.set(victimRole, tid)
  }

  function computeAndEmitAuthRespawn(victimRole: 'host' | 'guest'): void {
    if (lobby.mode !== 'online' || lobby.role !== 'host') return
    const slot = spawnSlotForRole(victimRole)
    const candidates = map.getRespawnFootCandidates(slot)
    let feet = pickGroundedRespawnFoot(terrainPhysics, map, candidates)
    if (!feet) {
      feet = new Vector3().copy(map.getPlayerSpawn(slot, 0))
    }
    const slots = spawnSlots()
    let ry: number
    const victimIsLocal = victimRole === lobby.role
    if (victimIsLocal) {
      const oppSpawn = map.getBotSpawn(slots.opponent, bot.getFootOffset())
      const camPt = new Vector3(feet.x, feet.y + eyeH(), feet.z)
      ry = yawFacing(camPt, oppSpawn)
    } else {
      const botPt = new Vector3(feet.x, feet.y + bot.getFootOffset(), feet.z)
      const camSpawn = map.getPlayerSpawn(slots.player, eyeH())
      ry = yawFacing(botPt, camSpawn)
    }
    const invulnMs = gameConfig.respawnInvulnMs
    const payload: Record<string, unknown> = {
      type: 'authRespawn',
      victimRole,
      x: feet.x,
      fy: feet.y,
      z: feet.z,
      ry,
      invulnMs,
    }
    sendGameTraffic(payload)
    dispatchPeerGamePayload(payload)
  }

  function applyAuthRespawnPayload(data: Record<string, unknown>): void {
    const vr = data.victimRole === 'host' || data.victimRole === 'guest' ? data.victimRole : undefined
    if (!vr || lobby.mode !== 'online') return
    hideKoAnnouncementImmediate()
    const x = typeof data.x === 'number' ? data.x : 0
    const fy = typeof data.fy === 'number' ? data.fy : 0
    const z = typeof data.z === 'number' ? data.z : 0
    const ry = typeof data.ry === 'number' ? data.ry : 0
    const invulnMs =
      typeof data.invulnMs === 'number' && Number.isFinite(data.invulnMs)
        ? Math.max(0, data.invulnMs)
        : gameConfig.respawnInvulnMs

    const victimIsYou = vr === lobby.role
    const until = performance.now() + invulnMs
    const untilAuth = Date.now() + invulnMs

    if (victimIsYou) {
      playerPercent = 0
      respawnInvulnUntilYou = until
      camera.position.set(x, fy + eyeH(), z)
      camera.rotation.reorder('YXZ')
      camera.rotation.set(0, ry, 0)
      vy = 0
      playerKnock.set(0, 0, 0)
      dashVel.set(0, 0, 0)
      playerHurt = 'none'
      playerHurtRecoverLeft = 0
      hideStunnedFxOverlay()
    } else {
      enemyPercent = 0
      respawnInvulnUntilFoe = until
      bot.resetRoundState()
      bot.root.position.set(x, fy + bot.getFootOffset(), z)
      bot.root.rotation.set(0, ry, 0)
      if (bot.mode === 'network') {
        bot.networkTargetPos.copy(bot.root.position)
      }
      bot.alignFacingToward(camera.position)
      bot.beginRespawnMeshFlash(invulnMs)
    }
    /* Set invuln window BEFORE clearing the ring-out latch so a stale incoming
     * pose can't double-deduct stocks between these two state mutations. */
    browserHost?.setRespawnInvulnUntil(vr, untilAuth)
    browserHost?.notifyRespawnApplied(vr)
    syncHud()
    warpRapierCapsulesToCurrentActors()
  }

  function triggerOfflineRingStockKo(victim: 'you' | 'foe'): void {
    if (seriesTransitionActive || matchOutcome || offlineBlastKoPending) {
      console.debug('[stockKO] skipped (already transitioning)', {
        victim,
        seriesTransitionActive,
        matchOutcome,
        offlineBlastKoPending,
      })
      return
    }

    const before = victim === 'you' ? stocksYou : stocksFoe
    if (victim === 'you') stocksYou = Math.max(0, stocksYou - 1)
    else stocksFoe = Math.max(0, stocksFoe - 1)
    const after = victim === 'you' ? stocksYou : stocksFoe

    console.info('[stockKO] offline KO', {
      victim,
      before,
      after,
      stocksYou,
      stocksFoe,
      startStocks: gameConfig.startStocks,
    })

    if (after <= 0) {
      syncStocksHud()
      console.info('[stockKO] last stock — match end', { victim })
      winFinisher = null
      hideWinGameSplash()
      void concludeRoundElimination(victim === 'foe')
      return
    }

    offlineBlastKoPending = victim
    showKoAnnouncement(
      victim === 'you' ? displayPlayerName() : opponentHudName(),
      before,
      after,
      victim,
    )

    scheduleKoAnnouncementDismiss(gameConfig.koAnnounceHoldMs, () => {
      applyOfflineRespawnFeet(victim)
      offlineBlastKoPending = null
    })
  }

  function applyOfflineRespawnFeet(victim: 'you' | 'foe'): void {
    const slots = spawnSlots()
    const slot = victim === 'you' ? slots.player : slots.opponent
    const candidates = map.getRespawnFootCandidates(slot)
    let feet = pickGroundedRespawnFoot(terrainPhysics, map, candidates)
    if (!feet) {
      feet = new Vector3().copy(map.getPlayerSpawn(slot, 0))
    }

    const invulnMs = gameConfig.respawnInvulnMs
    const until = performance.now() + invulnMs

    if (victim === 'you') {
      playerPercent = 0
      respawnInvulnUntilYou = until
      camera.position.set(feet.x, feet.y + eyeH(), feet.z)
      const oppSpawn = map.getBotSpawn(slots.opponent, bot.getFootOffset())
      const yaw = yawFacing(camera.position, oppSpawn)
      camera.rotation.reorder('YXZ')
      camera.rotation.set(0, yaw, 0)
      vy = 0
      playerKnock.set(0, 0, 0)
      dashVel.set(0, 0, 0)
      playerHurt = 'none'
      playerHurtRecoverLeft = 0
      hideStunnedFxOverlay()
    } else {
      enemyPercent = 0
      respawnInvulnUntilFoe = until
      bot.resetRoundState()
      bot.root.position.set(feet.x, feet.y + bot.getFootOffset(), feet.z)
      bot.alignFacingToward(camera.position)
      if (bot.mode === 'network') {
        bot.networkTargetPos.copy(bot.root.position)
      }
      bot.beginRespawnMeshFlash(invulnMs)
    }
    syncHud()
    warpRapierCapsulesToCurrentActors()
  }

  function updateChargeStatusUi(charge: number): void {
    if (!chargeBarWrap || !chargeWedgeEl) return
    if (chargeBarStatus) chargeBarStatus.textContent = ''
    if (pistolModeOn()) {
      const left = pistolAmmoLeft()
      const cap = pistolMagSize()
      const ready = left > 0 && !voiceInputBlocked && !multiplayerBlocksPlay() && !chargingRmb
      chargeBarWrap.classList.toggle('charge-bar-wrap--ready', ready)
      chargeBarWrap.classList.add('charge-bar-wrap--pistol')
      if (chargeBarMinMark) chargeBarMinMark.style.display = 'none'
      chargeWedgeEl.setAttribute(
        'aria-label',
        ready
          ? `Magazine, ${left} of ${cap} rounds, ready to fire`
          : `Magazine, ${left} of ${cap} rounds`,
      )
      return
    }
    chargeBarWrap.classList.remove('charge-bar-wrap--pistol')
    if (chargeBarMinMark) chargeBarMinMark.style.display = ''
    const min = Math.max(0.01, Math.min(1, gameConfig.voiceMinChargeToFire))
    const ready = charge >= min && !voiceInputBlocked && !multiplayerBlocksPlay()
    chargeBarWrap.classList.toggle('charge-bar-wrap--ready', ready)
    const pct = Math.round(Math.min(100, Math.max(0, charge * 100)))
    chargeWedgeEl.setAttribute(
      'aria-label',
      ready ? `Weapon charge ${pct} percent, ready to fire` : `Weapon charge ${pct} percent`,
    )
  }

  let dashTiltDeg = 0
  let slideAnimUntilMs = 0

  /** Effective eye height = base + live bias from PlayerCamera tweaks (clamped to a sane min). */
  function eyeH(): number {
    return Math.max(0.2, gameConfig.eyeHeight + gameConfig.pcCameraHeightBias)
  }

  /** Default/offline/host use spawn A; online guests use spawn B, facing the opposite slot. */
  function spawnSlots(): { player: SpawnSlot; opponent: SpawnSlot } {
    if (lobby.mode === 'online' && lobby.role === 'guest') {
      return { player: 'b', opponent: 'a' }
    }
    return { player: 'a', opponent: 'b' }
  }

  function yawFacing(from: Vector3, to: Vector3): number {
    return Math.atan2(-(to.x - from.x), -(to.z - from.z))
  }

  /**
   * PvP guests run this when the host advertises a different map in `hello`.
   * Disposes the active map, loads the new one, and respawns both fighters
   * before the countdown gates real play.
   */
  let swapMapInFlight: Promise<void> | null = null
  async function swapMap(newId: MapId): Promise<void> {
    if (newId === map.id) return
    if (swapMapInFlight) {
      await swapMapInFlight
      if (newId === map.id) return
    }
    const work = (async () => {
      const old = map
      try {
        const next = await loadMap(newId, scene, hubRoot)
        map = next
        terrainPhysics.setTerrainMeshes(next.collisionMeshes, next.rapierCuboids)
        old.dispose()
      } catch (err) {
        console.warn('[map] swap failed; keeping current map', err)
        return
      }
      spawnActors()
      applySunShadowFrustum()
      syncBlastBoundsLine()
      applyLightingModeToScene(
        gameConfig.lightingUnlitMode >= 0.5,
        gameConfig.lightingUnlitSelfModel >= 0.5,
        gameConfig.lightingUnlitEnemyModel >= 0.5,
      )
    })()
    swapMapInFlight = work
    try {
      await work
    } finally {
      if (swapMapInFlight === work) swapMapInFlight = null
    }
  }

  function warpRapierCapsulesToCurrentActors(): void {
    _moveStart.set(camera.position.x, feetY(), camera.position.z)
    terrainPhysics.warpCapsuleToFeet(
      'player',
      _moveStart,
      playerCapsuleRadius(),
      playerCapsuleHeight(),
    )
    const br = Math.max(0.05, gameConfig.botBodyRadius)
    const footOff = bot.getFootOffset()
    const bh = Math.max(br * 2 + 0.08, footOff * 2)
    _moveStart.set(
      bot.root.position.x,
      bot.root.position.y - footOff,
      bot.root.position.z,
    )
    terrainPhysics.warpCapsuleToFeet('bot', _moveStart, br, bh)
  }

  /** Immediately sync PvP pose so the peer’s puppet snaps to spawn after a round reset. */
  function flushPvpSpawnPose(): void {
    if (!isPvp()) return
    const fy = camera.position.y - eyeH()
    if (lobby.mode === 'online' && lobby.role === 'host' && browserHost) {
      browserHost.setPose('host', {
        x: camera.position.x,
        z: camera.position.z,
        fy,
        ry: camera.rotation.y,
      })
    }
    sendGameTraffic({
      type: 'pose',
      x: camera.position.x,
      z: camera.position.z,
      fy,
      ry: camera.rotation.y,
      recording: false,
      animBase: deriveLocalAnimBase(),
      animOneShot: null,
      animEpoch: localAnimEpoch,
      speedN: 0,
    })
    poseSendAcc = 0
  }

  function spawnActors(): void {
    const slots = spawnSlots()
    const playerSpawn = map.getPlayerSpawn(slots.player, eyeH())
    const botSpawn = map.getBotSpawn(slots.opponent, bot.getFootOffset())
    const yaw = yawFacing(playerSpawn, botSpawn)

    camera.position.copy(playerSpawn)
    camera.rotation.reorder('YXZ')
    camera.rotation.set(0, yaw, 0)

    bot.root.position.copy(botSpawn)
    bot.root.rotation.set(0, 0, 0)
    bot.resetRoundState()
    if (bot.mode === 'network') {
      bot.networkTargetPos.copy(bot.root.position)
    }
    bot.alignFacingToward(camera.position)

    dashTiltDeg = 0
    resetBananaSlipCamRoll()
    fpPresentationState.storedPitchBob = 0
    fpPresentationState.storedRollTotal = 0
    fpPresentationState.walkPhase = 0
    fpPresentationState.storedCamBobY = 0
    resetCameraSpringArm()
    slideAnimUntilMs = 0
    gameRoot.classList.remove('game-root--dash-tilt')
    gameRoot.style.transform = ''
    if (dashScanEl) dashScanEl.style.opacity = '0'
    if (jumpVfxEl) jumpVfxEl.style.opacity = '0'
    velocity.set(0, 0, 0)
    clearMovementKeys()
    playerKnock.set(0, 0, 0)
    dashVel.set(0, 0, 0)
    vy = 0
    shakeIntensity = 0
    flashIntensity = 0
    prevShake.set(0, 0, 0)
    if (hitFlashEl) hitFlashEl.style.opacity = '0'
    arms.resetAll()
    chargingLmb = false
    clearPistolState()
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
    coyoteTimer = 0
    jumpBufferTimer = 0
    jumpHeld = false
    warpRapierCapsulesToCurrentActors()
    flushPvpSpawnPose()
    applySunShadowFrustum()
    syncBlastBoundsLine()
    void initBananaRound()
  }

  type WinFinisherState =
    | { phase: 'launch'; started: number; sawAir: boolean }
    | { phase: 'flash'; started: number }

  let winFinisher: WinFinisherState | null = null

  function hideWinGameSplash(): void {
    if (!winGameSplashEl) return
    winGameSplashEl.classList.remove('win-game-splash--pulse')
    winGameSplashEl.hidden = true
    if (winGameSplashSubEl) winGameSplashSubEl.textContent = ''
  }

  function showWinGameSplash(): void {
    if (!winGameSplashEl) return
    winGameSplashEl.hidden = false
    winGameSplashEl.classList.remove('win-game-splash--pulse')
    void winGameSplashEl.offsetWidth
    winGameSplashEl.classList.add('win-game-splash--pulse')
  }

  async function playGameOutcomeSplashSequence(outcome: 'win' | 'lose'): Promise<void> {
    if (!winGameSplashEl) return
    if (winGameSplashSubEl) {
      winGameSplashSubEl.textContent = outcome === 'win' ? 'YOU WIN' : 'YOU LOSE'
    }
    showWinGameSplash()
    const minHoldMs = Math.max(250, gameConfig.winRingoutPresentDelayMs)
    const started = performance.now()
    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      const onEnd = () => {
        winGameSplashTxtEl?.removeEventListener('animationend', onEnd)
        finish()
      }
      winGameSplashTxtEl?.addEventListener('animationend', onEnd, { once: true })
      window.setTimeout(() => {
        winGameSplashTxtEl?.removeEventListener('animationend', onEnd)
        finish()
      }, minHoldMs)
    })
    const remaining = minHoldMs - (performance.now() - started)
    if (remaining > 0) await sleepMs(remaining)
    hideWinGameSplash()
  }

  function updateWinFinisher(_delta: number): void {
    if (!winFinisher || winFinisher.phase !== 'launch') return
    if (map.isBlastZone(bot.root.position)) {
      winFinisher = { phase: 'flash', started: performance.now() }
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
    }
  }

  function advanceWinFlashTimer(): void {
    if (!winFinisher || winFinisher.phase !== 'flash') return
    if (performance.now() - winFinisher.started <= 8) return
    winFinisher = null
    const before = stocksFoe
    stocksFoe = Math.max(0, stocksFoe - 1)
    if (stocksFoe <= 0) {
      syncStocksHud()
      void concludeRoundElimination(true)
      return
    }
    offlineBlastKoPending = 'foe'
    showKoAnnouncement(opponentHudName(), before, stocksFoe, 'foe')
    scheduleKoAnnouncementDismiss(gameConfig.koAnnounceHoldMs, () => {
      applyOfflineRespawnFeet('foe')
      offlineBlastKoPending = null
    })
  }

  /**
   * Push direction from fist impact → bot knock on XZ; returns normalized fist→body Y (for lift).
   */
  function knockDirFromFistImpact(fistWorld: Vector3, outXZ: Vector3): number {
    _knFromShot.subVectors(bot.bodyCenter, fistWorld)
    if (_knFromShot.lengthSq() < 1e-8) {
      _knFromShot.subVectors(bot.root.position, camera.position)
    }
    if (_knFromShot.lengthSq() < 1e-8) _knFromShot.set(0, 0, 1)
    _knFromShot.normalize()
    const aimY = _knFromShot.y
    outXZ.copy(_knFromShot)
    outXZ.y = 0
    if (outXZ.lengthSq() < 1e-8) {
      camera.getWorldDirection(_tmpKnock)
      outXZ.set(_tmpKnock.x, 0, _tmpKnock.z)
      if (outXZ.lengthSq() < 1e-8) outXZ.set(0, 0, 1)
    }
    outXZ.normalize()
    return aimY
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
    const sm = getCameraShakeMul()
    shakeIntensity = Math.max(shakeIntensity, 5.4 * sm)
    flashIntensity = Math.max(flashIntensity, 1)
  }

  /** In-round: instant round reset without match-end overlay (offline / dev). */
  function instantHudRematch(): void {
    if (isPvp()) return
    applyRoundReset()
    tryPointerLock()
  }

  function applyMatchEndCore(outcome: 'win' | 'lose'): boolean {
    if (matchOutcome) return false
    hideKoAnnouncementImmediate()
    clearMovementKeys()
    hideWinGameSplash()
    winFinisher = null
    matchOutcome = outcome
    bumpPlayerRecord(outcome)
    matchEndCardEl?.classList.remove('match-end-card--forfeit')
    triggerHitImpactFx()
    voice.resumeAudio()
    voice.playFallbackHitSound()
    controls.unlock()
    return true
  }

  function endMatch(outcome: 'win' | 'lose'): void {
    if (!applyMatchEndCore(outcome)) return
    squelchCompetingEndOfMatchUi()
    if (matchEndOverlay) matchEndOverlay.hidden = false
    if (matchEndTitle) {
      matchEndTitle.textContent = outcome === 'win' ? 'You win!' : 'You lose!'
    }
    const intent = currentMatchIntent()
    if (matchEndSub) {
      matchEndSub.textContent = matchEndSubCopy(outcome, intent)
    }
    showMatchEndLobbyControls()
  }

  function matchEndSubCopy(outcome: 'win' | 'lose', intent: MatchIntent | null): string {
    const wonStocks = outcome === 'win'
      ? 'The other fighter ran out of stocks.'
      : 'You ran out of stocks.'
    if (!intent) return wonStocks
    switch (intent) {
      case 'quickMatch':
        return outcome === 'win'
          ? `${wonStocks} Requeue for another match or head back to the lobby.`
          : `${wonStocks} Requeue for a rematch or head back to the lobby.`
      case 'private':
        return outcome === 'win'
          ? `${wonStocks} Start a new private game or head back to the lobby.`
          : `${wonStocks} Start a new private game or head back to the lobby.`
      case 'practice':
        return outcome === 'win'
          ? `${wonStocks} Run another practice round or head back to the lobby.`
          : `${wonStocks} Run another practice round or head back to the lobby.`
      case 'vsBot':
        return outcome === 'win'
          ? `${wonStocks} Fight the bot again or head back to the lobby.`
          : `${wonStocks} Take another shot at the bot or head back to the lobby.`
      default:
        return wonStocks
    }
  }

  function recreateBot(mode: BotMode): void {
    if (isPvp()) return
    bot.dispose(scene)
    botMode = mode
    bot = new BotFighter(scene, botMode, new Vector3(0, 1.45, -gameConfig.groundDepth / 2 + 12))
    rebindOpponentBananaAttachment()
    applyLightingModeToScene(
      gameConfig.lightingUnlitMode >= 0.5,
      gameConfig.lightingUnlitSelfModel >= 0.5,
      gameConfig.lightingUnlitEnemyModel >= 0.5,
    )
    instantHudRematch()
    syncHostSmartBotVoiceHandler()
  }

  function syncHostSmartBotVoiceHandler(): void {
    if (!isOnline || lobby.mode !== 'online' || lobby.role !== 'host') {
      bot.setHostAiVoiceShotHandler(null)
      return
    }
    if (!lobbySmartBotActive || bot.mode !== 'smart') {
      bot.setHostAiVoiceShotHandler(null)
      return
    }
    bot.setHostAiVoiceShotHandler((p) => {
      if (rtcGame?.channel?.readyState !== 'open') return
      const shotId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      sendGameTraffic({
        type: 'voiceShot',
        shotId,
        ox: p.ox,
        oy: p.oy,
        oz: p.oz,
        vx: p.vx,
        vy: p.vy,
        vz: p.vz,
        mime: 'audio/webm',
        audioB64: '',
        shotScale: p.shotScale,
        chargeT: 0.5,
        fromRole: 'bot',
      })
    })
  }

  async function beginLobbyDummyPractice(): Promise<void> {
    if (!isOnline || lobby.mode !== 'online') return
    if (mpSeqStarted || mpPhase === 'live') return

    lobbyDummyPractice = true
    lobbySmartBotActive = false
    if (mpWaitLayer) mpWaitLayer.hidden = true
    if (mpCodeHud) mpCodeHud.hidden = true
    updateMicBlockedUi()
    resetMatchStockState()

    if (botMode !== 'dummy') recreateBot('dummy')
    else applyRoundReset()

    /* Practice from the menu is a single-player session in an unlisted room; surprise
     * PvP joins are not possible (no public directory and the code isn't shared), but
     * the existing online-host plumbing still keeps the wire alive for parity. */
    if (mpToast && lobby.intent !== 'practice') {
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
    syncHostSmartBotVoiceHandler()
  }

  async function beginLobbySmartBot(): Promise<void> {
    if (!isOnline || lobby.mode !== 'online') return
    if (mpSeqStarted || mpPhase === 'live') return

    lobbyDummyPractice = false
    lobbySmartBotActive = true
    if (mpWaitLayer) mpWaitLayer.hidden = true
    if (mpCodeHud) mpCodeHud.hidden = true
    updateMicBlockedUi()
    resetMatchStockState()

    if (botMode !== 'smart') recreateBot('smart')
    else applyRoundReset()

    if (mpToast && lobby.intent !== 'vsBot' && lobby.intent !== 'quickMatch') {
      mpToast.textContent = 'Solo vs smart bot — a real match still starts when someone joins.'
      mpToast.hidden = false
      mpToast.classList.remove('mp-toast--bad')
      window.setTimeout(() => {
        if (
          mpToast &&
          mpToast.textContent === 'Solo vs smart bot — a real match still starts when someone joins.'
        ) {
          mpToast.hidden = true
        }
      }, 5200)
    }

    if (!voiceInputBlocked) await runMatchBeginCountdown()
    if (!lobbySmartBotActive) return
    tryPointerLock()
    syncHostSmartBotVoiceHandler()
  }

  spawnActors()
  syncHud()

  function feetY(): number {
    return camera.position.y - eyeH()
  }

  function playerCapsuleRadius(): number {
    return Math.max(0.05, gameConfig.playerRadius)
  }

  function playerCapsuleHeight(): number {
    const r = playerCapsuleRadius()
    return Math.max(r * 2 + 0.08, eyeH())
  }

  function resolvePlayerCollision(start: Vector3, deltaSeconds: number): void {
    _moveDesired.subVectors(camera.position, start)
    camera.position.copy(start)

    const result = terrainPhysics.moveCapsuleFromFeet(
      'player',
      new Vector3(start.x, start.y - eyeH(), start.z),
      _moveDesired,
      playerCapsuleRadius(),
      playerCapsuleHeight(),
      deltaSeconds,
    )

    camera.position.add(result.movement)
    grounded = result.grounded

    if (grounded && vy <= 0.55) {
      vy = 0
    } else if (
      _moveDesired.y > 0 &&
      result.movement.y < _moveDesired.y - 0.01 &&
      vy <= 0.55
    ) {
      /* Don't zero vy during jump ascent — controller often clips desired Δy while still overlapping floor. */
      vy = 0
    }
  }

  function tryJump() {
    if (
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      matchOutcome ||
      winFinisher ||
      multiplayerBlocksPlay() ||
      playerHurt !== 'none' ||
      isPlayerBananaSlipNow()
    )
      return
    const now = performance.now()
    if (now - lastJumpAt < gameConfig.jumpCooldownMs) return
    const canGroundJump = grounded || coyoteTimer > 0
    if (canGroundJump) {
      coyoteTimer = 0
      jumpBufferTimer = 0
      vy = gameConfig.jumpForce
      grounded = false
      lastJumpAt = now
      if (!multiplayerBlocksPlay()) {
        playJumpOneShot()
        broadcastActorSfxIfPvp('jump')
      }
      return
    }
    /* Mid-air double jump: replace (not add to) vertical velocity for a clean second pop. */
    if (airJumpsLeft > 0) {
      jumpBufferTimer = 0
      vy = gameConfig.jumpForce
      airJumpsLeft -= 1
      lastJumpAt = now
      if (!multiplayerBlocksPlay()) {
        playJumpOneShot()
        broadcastActorSfxIfPvp('jump')
      }
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
      multiplayerBlocksPlay() ||
      dashCdMs > 0 ||
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      playerHurt !== 'none' ||
      isPlayerBananaSlipNow()
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
      voiceResumeCountdownActive ||
      multiplayerBlocksPlay() ||
      seriesTransitionActive
    )
      return

    if (winFinisher) {
      if (map.isBlastZone(camera.position)) {
        winFinisher = null
        hideWinGameSplash()
        triggerOfflineRingStockKo('you')
        return
      }
      arms.update(delta)
      bot.setPlayerCharging(chargingLmb)
      bot.setIntentInputs(playerPercent, enemyPercent)
      bot.setAiSuppressed(true)
      bot.update(delta, camera.position, terrainPhysics, false, camera)
      updateWinFinisher(delta)
      advanceWinFlashTimer()
      return
    }

    arms.update(delta)

    const playerProjActive = arms.isProjectileActive()
    bot.setPlayerCharging(chargingLmb)
    bot.setIntentInputs(playerPercent, enemyPercent)
    bot.setAiSuppressed(false)
    bot.update(delta, camera.position, terrainPhysics, playerProjActive, camera)

    /* Player projectile vs bot — dedicated listen server validates shots when authPvp() */
    const localInvulnShoot = performance.now() >= respawnInvulnUntilYou
    if (arms.canDealHit() && localInvulnShoot && !authPvp()) {
      if (arms.isHeadscan()) {
        arms.getHeadscanContactPoint(bot.bodyCenter, _fp)
      } else {
        arms.getProjectileContactPoint(bot.bodyCenter, _fp)
      }
      const reach = arms.projectileRadius() + gameConfig.botBodyRadius * 0.88
      const dxHit = _fp.x - bot.bodyCenter.x
      const dyHit = _fp.y - bot.bodyCenter.y
      const dzHit = _fp.z - bot.bodyCenter.z
      if (Math.hypot(dxHit, dyHit * 0.75, dzHit) < reach) {
        const shotT = arms.peekShotT()
        const isPistolShot = arms.peekIsPistolShot()
        const hitAudio = arms.takeHitAudio()
        arms.markDealt()
        voice.playBufferSpatialAt(hitAudio, bot.bodyCenter, camera)
        const botAimY = knockDirFromFistImpact(_fp, _knDir)
        /* Pistol shots use dedicated multipliers so spam-clicks can't fling the bot off-stage. */
        const pistolPctMul = isPistolShot ? Math.max(0, gameConfig.pistolPercentMul) : 1
        const pistolKnockMul = isPistolShot ? Math.max(0, gameConfig.pistolKnockMul) : 1
        const gain = percentGainFromCharge(shotT) * pistolPctMul
        const prevEnemyPct = enemyPercent
        enemyPercent = Math.min(999, enemyPercent + gain)
        playTieredHitImpactOneShot(enemyPercent)
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
            const chargeKnockT =
              gameConfig.knockVoiceMinMul +
              shotT * (gameConfig.knockVoiceMaxMul - gameConfig.knockVoiceMinMul)
            bot.applyKnockback(
              _knDir,
              gameConfig.knockbackOnBot * launchMul * pistolKnockMul * chargeKnockT,
              enemyPercent,
              botAimY,
            )
          }
          triggerHitImpactFx()
          bot.flashVictimInvuln(gameConfig.hitVictimWhiteFlashMs)
        }
      } else if (arms.isHeadscan()) {
        arms.markDealt()
      }
    }

    /* Bot projectile vs player */
    const foeInvulnShoot = performance.now() >= respawnInvulnUntilFoe
    if (bot.canDealHit(camera.position) && foeInvulnShoot && !authPvp()) {
      const now = performance.now()
      if (
        now < respawnInvulnUntilYou ||
        now < playerInvulnUntil ||
        playerHurt === 'air' ||
        playerHurt === 'recover'
      ) {
        bot.markHitDealt()
      } else {
        const victimClip = bot.peekProjectileVoice()
        _fp.copy(bot.projPos)
        bot.markHitDealt()
        if (victimClip) voice.playBufferSpatialAt(victimClip, _fp, camera, { victimHitReceive: true })
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
          knockFromWorld: _fp,
        })
      }
    }

    {
      const bc = Math.round(gameConfig.bananaPickupCount)
      if (bc > 0) {
        bananaWorld.tickPickupsHover(performance.now() * 0.001)
        const pr = gameConfig.bananaPickupRadius
        if (!matchOutcome && isPvp() && mpPhase === 'live' && !seriesTransitionActive) {
          _bFeet.set(camera.position.x, feetY(), camera.position.z)
          for (const pick of bananaWorld.pickups) {
            if (!isFeetInPickUpRange(_bFeet, pick, pr)) continue
            const r = myPvpRole()
            if (r === 'host' && pvpBananaInventory.host < 1) {
              processHostBananaPickup('host', pick.id, _bFeet)
            } else if (r === 'guest' && pvpBananaInventory.guest < 1) {
              sendGameTraffic({
                type: 'bananaRequestPickup',
                fromRole: 'guest',
                pickupId: pick.id,
                fx: _bFeet.x,
                fy: _bFeet.y,
                fz: _bFeet.z,
              })
            }
            break
          }
        } else if (!isPvp() && !matchOutcome) {
          _bFeet.set(camera.position.x, feetY(), camera.position.z)
          for (let j = bananaWorld.pickups.length - 1; j >= 0; j--) {
            const pick = bananaWorld.pickups[j]!
            if (isFeetInPickUpRange(_bFeet, pick, pr)) {
              if (!localHasBanana) {
                localHasBanana = true
                bananaWorld.removePickupById(pick.id)
                syncBananaHandVis()
              }
              break
            }
          }
          for (let j = bananaWorld.peels.length - 1; j >= 0; j--) {
            const pl = bananaWorld.peels[j]!
            _bFeet.set(camera.position.x, feetY(), camera.position.z)
            const fo = bot.getFootOffset()
            const bf3 = new Vector3(
              bot.root.position.x,
              bot.root.position.y - fo,
              bot.root.position.z,
            )
            const prad = gameConfig.bananaPeelRadius
            const yt = gameConfig.bananaPeelYTolerance
            if (
              !isPlayerBananaSlipNow() &&
              feetOnPeel(
                _bFeet,
                { x: pl.x, y: pl.y, z: pl.z, id: pl.id },
                prad,
                yt,
              ) &&
              performance.now() >= respawnInvulnUntilYou
            ) {
              playerBananaSlipUntil = performance.now() + gameConfig.bananaSlipMs
              triggerStunnedHitOverlay()
              triggerHudDamageShake(hudDamagePctEl, hudPortraitWrapEl, playerPercent)
              playBananaSlipOneShot()
              startBananaSlipCamRoll()
              bananaWorld.removePeelById(pl.id)
            } else if (
              !bot.isBananaSlipNow() &&
              feetOnPeel(bf3, { x: pl.x, y: pl.y, z: pl.z, id: pl.id }, prad, yt) &&
              performance.now() >= respawnInvulnUntilFoe
            ) {
              bot.applyBananaSlipMs(gameConfig.bananaSlipMs)
              bananaWorld.removePeelById(pl.id)
            }
          }
          bananaWorld.tickFlying(
            delta,
            (x, y, z) => {
              const id = `b${nextBananaPeelId++}`
              bananaWorld.addPeel(x, y, z, id)
            },
            (x, y, z) => terrainPhysics.raycastDown(x, y, z, 200),
          )
        }
      }
    }

    if (!authPvp()) {
      const listenAuth = isOnline && lobby.mode === 'online' && isAuthoritativeListenServer()
      if (!listenAuth) {
        const nowMs = performance.now()
        if (map.isBlastZone(camera.position)) {
          if (offlineBlastKoPending === 'you') return
          if (nowMs < respawnInvulnUntilYou) return
          if (lobbyDummyPractice) {
            applyRoundReset()
            return
          }
          triggerOfflineRingStockKo('you')
          return
        }
        if (map.isBlastZone(bot.root.position)) {
          if (offlineBlastKoPending === 'foe') return
          if (nowMs < respawnInvulnUntilFoe) return
          if (lobbyDummyPractice) {
            applyRoundReset()
            return
          }
          triggerOfflineRingStockKo('foe')
        }
      }
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isOnline && lobby.mode === 'online') {
      if (e.code === 'Enter') {
        e.preventDefault()
        if (textChatOpen) {
          sendTextChatMessage(textChatInputEl?.value ?? '')
          closeTextChat(true)
        } else {
          openTextChat()
        }
        return
      }
      if ((e.code === 'KeyT' || e.key === 't' || e.key === 'T') && textChatOpen) {
        e.preventDefault()
        closeTextChat(true)
        return
      }
      if (textChatOpen) return
    }

    /** 1 dummy · 2 smart · 3 toggle bot · R = lobby reload after match end, else round reset (offline). */
    const shortcutBlock =
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
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
          if (matchOutcome) {
            returnToLobbyReload(isOnline && lobby.mode === 'online')
            return
          }
          instantHudRematch()
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
        if (e.repeat || jumpHeld) break
        jumpHeld = true
        jumpBufferTimer = Math.max(0, gameConfig.jumpBufferTime)
        tryJump()
        break
      default:
        break
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (textChatOpen) return
    onMovementKeyUp(e)
    if (e.code === 'Space') jumpHeld = false
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clearMovementKeys)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearMovementKeys()
  })

  function gameplayInputBlocked(): boolean {
    return (
      voiceResumeCountdownActive ||
      multiplayerBlocksPlay() ||
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      matchOutcome !== null ||
      winFinisher !== null ||
      seriesTransitionActive ||
      playerHurt !== 'none' ||
      isPlayerBananaSlipNow()
    )
  }

  function tryBananaRmb(): boolean {
    if (!getMyBananaHeld() || isPlayerBananaSlipNow()) return false
    if (matchOutcome || winFinisher) return false
    if (multiplayerBlocksPlay()) return false
    if (tweaksPanelOpen || leaveMatchDialogOpen) return false
    if (Math.round(gameConfig.bananaPickupCount) <= 0) return false
    camera.getWorldDirection(_aimDir)
    _muzzleWorld.copy(camera.position).addScaledVector(_aimDir, 0.52)
    if (!isPvp()) {
      localHasBanana = false
      syncBananaHandVis()
      bananaWorld.beginLocalThrow(_muzzleWorld, camera)
      return true
    }
    if (pvpBananaInventory[myPvpRole()] < 1) return false
    if (lobby.mode === 'online' && lobby.role === 'host') {
      processHostBananaThrow(
        'host',
        _muzzleWorld.x,
        _muzzleWorld.y,
        _muzzleWorld.z,
        _aimDir.x,
        _aimDir.y,
        _aimDir.z,
      )
    } else {
      sendGameTraffic({
        type: 'bananaRequestThrow',
        fromRole: 'guest',
        ox: _muzzleWorld.x,
        oy: _muzzleWorld.y,
        oz: _muzzleWorld.z,
        dirx: _aimDir.x,
        diry: _aimDir.y,
        dirz: _aimDir.z,
      })
    }
    return true
  }

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 2) return
    if (e.button === 2) {
      if (tryBananaRmb()) return
    }
    if (gameplayInputBlocked()) return
    /* Enemy SFX shares an AudioContext that needs the user-gesture chain to resume + decode. */
    resumeEnemySfxAudio()

    if (pistolModeOn()) {
      if (e.button === 0) {
        /* LMB: fire one snippet from the magazine. Blocked while RMB-charging. */
        if (chargingRmb) return
        if (pistolAmmoLeft() <= 0) return
        if (arms.isProjectileActive()) return
        const ammoCap = Math.round(gameConfig.voiceShotAmmoMax)
        if (ammoCap > 0 && voiceAmmoLeft <= 0) return
        voice.resumeAudio()
        void firePistolShot()
        return
      }
      /* RMB: only allow recharge when the magazine is empty. */
      if (e.button === 2) {
        if (chargingRmb || chargingLmb) return
        if (pistolAmmoLeft() > 0) return
        if (arms.isProjectileActive()) return
        voice.resumeAudio()
        voice.startChargeRecording()
        if (voice.isChargeRecordingNow()) {
          playLocalVoiceRecordStartSfx()
          setLocalVoipRecordingBlocked(true)
        }
        if (!voiceInputBlocked) queueLocalAnimOneShot('recording')
        chargingRmb = true
      }
      return
    }

    /* Legacy: LMB hold-charge-and-release. RMB does nothing. */
    if (e.button !== 0) return
    const ammoCap = Math.round(gameConfig.voiceShotAmmoMax)
    if (ammoCap > 0 && voiceAmmoLeft <= 0) return
    if (arms.isProjectileActive()) return
    voice.resumeAudio()
    voice.startChargeRecording()
    if (voice.isChargeRecordingNow()) {
      playLocalVoiceRecordStartSfx()
      setLocalVoipRecordingBlocked(true)
    }
    if (!voiceInputBlocked) queueLocalAnimOneShot('recording')
    chargingLmb = true
  }

  function onMouseUp(e: MouseEvent): void {
    if (e.button === 2 && chargingRmb) {
      chargingRmb = false
      void finishPistolReload()
      return
    }
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
    celUniforms.resolution.value = [w, h]
  }
  window.addEventListener('resize', onResize)

  function tickMovementFootstep(delta: number): void {
    if (multiplayerBlocksPlay()) return
    if (tweaksPanelOpen || leaveMatchDialogOpen || matchOutcome) return
    const moving =
      keys.forward || keys.back || keys.left || keys.right
    if (!moving) {
      footstepHoldSec = 0
      footstepLastMs = 0
      return
    }
    const slip = isPlayerBananaSlipNow()
    if (playerHurt !== 'none' || slip) return
    if (!grounded) return
    footstepHoldSec += delta
    if (footstepHoldSec < gameConfig.footstepMinHoldSec) return
    const intervalSec = gameConfig.footstepIntervalSec
    const now = performance.now()
    if (footstepLastMs <= 0) {
      playFootstepOneShot()
      broadcastActorSfxIfPvp('footstep')
      footstepLastMs = now
      return
    }
    if (now - footstepLastMs >= intervalSec * 1000) {
      playFootstepOneShot()
      broadcastActorSfxIfPvp('footstep')
      footstepLastMs = now
    }
  }

  function updateMovement(delta: number) {
    camera.position.y -= fpPresentationState.storedCamBobY

    /* Online lobby / pre-live: freeze local player. Voice resume countdown still runs physics so grounded / jump stay consistent. */
    if (multiplayerBlocksPlay()) return

    const groundedBeforeResolve = grounded
    _moveStart.copy(camera.position)

    vy -= (vy > 0 ? gameConfig.jumpGravity : gameConfig.fallGravity) * delta
    if (!jumpHeld && vy > 0) {
      vy *= Math.pow(Math.max(0, Math.min(1, gameConfig.jumpCutMultiplier)), delta * 60)
    }
    vy = Math.max(vy, gameConfig.maxFallSpeed)
    camera.position.y += vy * delta
    if (grounded) coyoteTimer = Math.max(0, gameConfig.coyoteTime)
    else coyoteTimer = Math.max(0, coyoteTimer - delta)
    jumpBufferTimer = Math.max(0, jumpBufferTimer - delta)

    const slip = isPlayerBananaSlipNow()
    const canWalk = playerHurt === 'none' && !slip

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

    if (slip) {
      playerKnock.set(0, 0, 0)
      dashVel.set(0, 0, 0)
    }

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

    resolvePlayerCollision(_moveStart, delta)

    if (!groundedBeforeResolve && grounded) {
      if (!multiplayerBlocksPlay() && !tweaksPanelOpen && !leaveMatchDialogOpen && !matchOutcome) {
        playLandOneShot()
        broadcastActorSfxIfPvp('land')
      }
      voiceDownBoostReady = true
      airDashReady = true
      airJumpsLeft = Math.max(0, Math.round(gameConfig.airJumpsMax))
      if (jumpBufferTimer > 0) {
        jumpBufferTimer = 0
        tryJump()
      }
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
    tickMovementFootstep(delta)
  }

  function triggerHitImpactFx(): void {
    const sm = getCameraShakeMul()
    shakeIntensity = Math.max(shakeIntensity, gameConfig.hitScreenShake * sm)
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

  function updateDangerAuraFx(nowSec: number): void {
    const start = Math.max(0, Math.min(500, gameConfig.dangerFxStartPercent))
    const over = Math.max(0, playerPercent - start)
    if (over <= 0.001) {
      dangerAuraOverlay.style.opacity = '0'
      dangerLaunchTintEl.style.opacity = '0'
      return
    }
    /* Full intensity by +100% past the start threshold (e.g. 50→150%). */
    const t = Math.min(1, over / 100)
    const pulse = 0.45 + 0.55 * Math.sin(nowSec * 9.2)
    const pulse2 = 0.5 + 0.5 * Math.sin(nowSec * 14.1)
    const aura = Math.min(0.55, 0.08 + t * 0.28 + pulse * t * 0.12)
    dangerAuraOverlay.style.opacity = aura.toFixed(3)

    const tint = Math.min(0.52, 0.06 + t * 0.32 + pulse2 * t * 0.14)
    dangerLaunchTintEl.style.opacity = tint.toFixed(3)
  }

  /** Foot smoke for the opponent when their launch % is high (they do not see this on their own screen). */
  function updateOpponentDangerSmoke(nowSec: number): void {
    const start = Math.max(0, Math.min(500, gameConfig.dangerFxStartPercent))
    const over = Math.max(0, enemyPercent - start)
    if (over <= 0.001) {
      opponentDangerSmoke.visible = false
      opponentDangerSmokeMat.opacity = 0
      return
    }
    const t = Math.min(1, over / 100)
    opponentDangerSmoke.visible = true
    opponentDangerSmokeMat.opacity = Math.min(0.55, 0.08 + t * 0.32)
    const fo = bot.getFootOffset()
    const cx = bot.root.position.x
    const cz = bot.root.position.z
    const footY = bot.root.position.y - fo
    for (let i = 0; i < opponentDangerSmokeCount; i++) {
      const k = i * 3
      const seed = i * 0.61803398875
      const ring = 0.24 + (i % 5) * 0.06 + 0.08 * Math.sin(nowSec * 0.9 + seed * 5)
      const ang = nowSec * (0.38 + t * 0.42) + seed * Math.PI * 2
      const rise = ((nowSec * (0.22 + t * 0.24) + seed * 2.7) % 1) * (0.75 + t * 0.55)
      opponentDangerSmokePos[k] = cx + Math.cos(ang) * ring
      opponentDangerSmokePos[k + 1] = footY + 0.18 + rise
      opponentDangerSmokePos[k + 2] = cz + Math.sin(ang) * ring
    }
    opponentDangerSmokeGeom.attributes.position.needsUpdate = true
  }

  let debugMpHb = 0
  function animate() {
    const delta = Math.min(clock.getDelta(), gameConfig.movementMaxDelta)
    const wantsUnlit = gameConfig.lightingUnlitMode >= 0.5
    const wantsSelfModelUnlit = gameConfig.lightingUnlitSelfModel >= 0.5
    const wantsEnemyModelUnlit = gameConfig.lightingUnlitEnemyModel >= 0.5
    if (
      wantsUnlit !== lastUnlitMode ||
      wantsSelfModelUnlit !== lastSelfModelUnlit ||
      wantsEnemyModelUnlit !== lastEnemyModelUnlit
    ) {
      applyLightingModeToScene(wantsUnlit, wantsSelfModelUnlit, wantsEnemyModelUnlit)
      unlitRescanTick = 0
    } else if (wantsUnlit || wantsSelfModelUnlit || wantsEnemyModelUnlit) {
      /* Catch meshes that appear later (async avatar/bot/map loads) while any unlit mode is active. */
      unlitRescanTick = (unlitRescanTick + 1) % 20
      if (unlitRescanTick === 0) {
        applyLightingModeToScene(wantsUnlit, wantsSelfModelUnlit, wantsEnemyModelUnlit)
      }
    }

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
      const poseIv = Math.max(1 / 120, gameConfig.pvpPoseSendIntervalSec)
      if (poseSendAcc >= poseIv) {
        poseSendAcc -= poseIv
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
          recording: chargingLmb || chargingRmb,
          animBase: deriveLocalAnimBase(),
          animOneShot: localAnimOneShot,
          animEpoch: localAnimEpoch,
          speedN,
        })
      }
    }

    const hostSideAi =
      isOnline &&
      lobby.mode === 'online' &&
      lobby.role === 'host' &&
      bot.mode === 'smart' &&
      lobbySmartBotActive &&
      rtcGame?.channel?.readyState === 'open'
    if (hostSideAi) {
      poseSendAcc += delta
      const poseIvBot = 0.05
      if (poseSendAcc >= poseIvBot) {
        poseSendAcc -= poseIvBot
        const fy = bot.root.position.y - bot.getFootOffset()
        const oneShot = bot.peekNetAnimOneShotForPose()
        sendGameTraffic({
          type: 'pose',
          fromRole: 'bot',
          x: bot.root.position.x,
          z: bot.root.position.z,
          fy,
          ry: bot.root.rotation.y,
          recording: bot.isWindingUp(),
          animBase: bot.deriveAnimBaseForNet(),
          animOneShot: oneShot,
          animEpoch: bot.getNetAnimEpoch(),
          speedN: bot.speedN,
        })
      }
    }

    if (multiplayerBlocksPlay() && (chargingLmb || chargingRmb)) {
      chargingLmb = false
      chargingRmb = false
      voice.resetChargeMeter()
      voiceChargeSmoothed = 0
      chargeHudMicAmpSmoothed = 0
      void voice.finishChargeRecording()
      setLocalVoipRecordingBlocked(false)
      setChargeBarDisplayPct(0)
      bot.setRecordingTelegraph(false)
    }

    if (!voiceInputBlocked && !voiceResumeCountdownActive && !multiplayerBlocksPlay()) {
      voiceChargeSmoothed = voice.tickChargeAccum(delta, chargingLmb || chargingRmb)
    }
    tickPistolReloadAnim(delta * 1000)
    const pistolOn = pistolModeOn()
    if (ammoCountEl) {
      if (pistolOn) {
        const cap = pistolMagSize()
        const left = pistolAmmoLeft()
        ammoCountEl.textContent = `${left}/${cap}`
        ammoCountEl.classList.toggle('ammo-count--empty', left <= 0 && !chargingRmb)
        ammoCountEl.classList.toggle('ammo-count--charging', chargingRmb)
        ammoCountEl.hidden = false
      } else {
        ammoCountEl.hidden = true
      }
    }
    {
      let pct = Math.min(150, voiceChargeSmoothed * 100)
      if (pistolOn && !chargingRmb) {
        const cap = pistolMagSize()
        const left = pistolAmmoLeft()
        pct = (left / cap) * 100
      }
      setChargeBarDisplayPct(pct)
      if (chargeBarFill) {
        const showMax = !pistolOn && voiceChargeSmoothed >= 1
        chargeBarFill.classList.toggle('charge-wedge__fill-inner--max', showMax)
      }
      const wantMaxChrome = !pistolOn && voiceChargeSmoothed >= 1
      if (chargeWedgeTopImg && wantMaxChrome !== chargeChromeShowsMaxArt) {
        chargeChromeShowsMaxArt = wantMaxChrome
        chargeWedgeTopImg.src = wantMaxChrome ? chargeBarMaxUrl : chargeBarTopUrl
      }
      if (chargeBarPctEl) {
        if (pistolOn) {
          const cap = pistolMagSize()
          const left = pistolAmmoLeft()
          chargeBarPctEl.textContent = `${left}/${cap}`
        } else {
          const v = Math.min(100, Math.round(voiceChargeSmoothed * 100))
          chargeBarPctEl.textContent = voiceChargeSmoothed >= 1 ? 'MAX' : `${v}%`
        }
      }
    }
    if (chargeBarWrap) {
      const overload = !pistolOn && voiceChargeSmoothed >= gameConfig.voiceOverloadThreshold
      if (overload) {
        chargeBarWrap.classList.add('charge-bar-wrap--overload')
      } else {
        chargeBarWrap.classList.remove('charge-bar-wrap--overload')
      }
    }
    updateChargeStatusUi(voiceChargeSmoothed)

    if (chargeBarWrap && chargeHudMicEl) {
      const canShowMic =
        gameConfig.chargeHudMicEnabled >= 0.5 && !chargeBarWrap.hidden && !voiceInputBlocked
      if (canShowMic) {
        const raw = voice.sampleRms()
        const noiseFloor =
          Math.max(1e-6, gameConfig.voiceSilenceRmsThreshold) *
          Math.max(0.05, gameConfig.chargeHudMicNoiseThresholdMul)
        const span = Math.max(1e-5, gameConfig.chargeHudMicRmsSpan)
        const target = Math.min(1, Math.max(0, (raw - noiseFloor) / span))
        const sm = Math.max(0.06, Math.min(1, gameConfig.chargeHudMicSmoothing))
        chargeHudMicAmpSmoothed += (target - chargeHudMicAmpSmoothed) * sm
        chargeBarWrap.style.setProperty('--charge-hud-mic-amp', String(chargeHudMicAmpSmoothed))
        chargeHudMicEl.classList.toggle('charge-hud-mic--active', chargeHudMicAmpSmoothed > 0.04)
      } else {
        chargeHudMicAmpSmoothed *= 0.78
        if (chargeHudMicAmpSmoothed < 0.012) chargeHudMicAmpSmoothed = 0
        chargeBarWrap.style.setProperty('--charge-hud-mic-amp', String(chargeHudMicAmpSmoothed))
        chargeHudMicEl.classList.remove('charge-hud-mic--active')
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

    if (!tweaksPanelOpen && !leaveMatchDialogOpen) {
      if (!matchOutcome && !multiplayerBlocksPlay()) {
        updateMovement(delta)
        resolveCombat(delta)
        if (isPvp() && lobby.mode === 'online' && lobby.role === 'host') {
          hostCheckBananaSlips()
        }
        syncBananaHandVis()
        syncOpponentBananaHandVis()
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
    tickLocalPlayerHud(delta)
    updateDangerAuraFx(performance.now() * 0.001)
    updateOpponentDangerSmoke(performance.now() * 0.001)

    applyHitPresentation(delta)

    // Retro post-process can be tuned live from Tweaks.
    ;(pixelPass as unknown as { setPixelSize?: (v: number) => void }).setPixelSize?.(
      Math.max(1, gameConfig.retroPixelScale),
    )
    pixelPass.depthEdgeStrength = Math.max(0, gameConfig.retroEdgeStrength)
    pixelPass.normalEdgeStrength = Math.max(0, gameConfig.retroEdgeStrength * 0.65)
    syncCelOutlineConfig()
    ditherPass.enabled = gameConfig.postDitherEnabled >= 0.5 && gameConfig.postDitherStrength > 1e-4
    if (ditherPass.enabled) {
      ditherUniforms.strength.value = Math.max(0, Math.min(1, gameConfig.postDitherStrength)) * 0.14
    }
    skyDome.update(delta, camera.position)

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

    /* After movement: walk phase for FP; weapon sway stays active so removed head-bob still has hand motion. */
    const fpWalk = tickFpWalkPresentation(delta)
    const idleWeaponSway = true

    const megaphoneCanCharge =
      !voiceInputBlocked && !voiceResumeCountdownActive && !multiplayerBlocksPlay()
    megaphoneFp.update(delta, {
      charging: megaphoneCanCharge && (chargingLmb || chargingRmb),
      charge01: voiceChargeSmoothed,
      idleWeaponSway,
      respawnFlashPulse: performance.now() < respawnInvulnUntilYou,
    })
    gameRoot.classList.toggle('game-root--respawn-invuln', performance.now() < respawnInvulnUntilYou)
    bananaWorld.syncHandPoseFromConfig()
    bananaWorld.syncOpponentBananaPoseFromConfig()
    bananaWorld.applyHandPresentationSway(idleWeaponSway)

    applyFpCameraPresentation(delta, fpWalk)
    tickCameraSpringArm(delta)
    renderCameraWithSpringArm()
  }

  renderer.setAnimationLoop(animate)

  function tryPointerLock(): void {
    if (
      textChatOpen ||
      tweaksPanelOpen ||
      leaveMatchDialogOpen ||
      matchOutcome ||
      winFinisher ||
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
    /* Practice / Vs Bot / Quick Match bot fallback auto-start against a bot — no waiting screen. */
    const isBotOnlySession =
      !!onlineLobby.startWithDummyPractice ||
      !!onlineLobby.startWithSmartBot
    const showWaitLayer = !isBotOnlySession
    if (mpWaitLayer) mpWaitLayer.hidden = !showWaitLayer
    if (mpWaitText) {
      mpWaitText.textContent =
        onlineLobby.intent === 'quickMatch' ? 'Connecting…' : 'Waiting for opponent…'
    }
    /* Only the private-host flow shares a code; quick-match pairs invisibly. */
    if (onlineLobby.role === 'host' && onlineLobby.intent === 'private') {
      if (mpCodeHud) mpCodeHud.hidden = false
      if (mpCodeValue) mpCodeValue.textContent = onlineLobby.shortCode
    } else {
      if (mpCodeHud) mpCodeHud.hidden = true
    }
    if (opponentLabelEl) opponentLabelEl.textContent = opponentHudName()

    try {
      mpSocket = createMultiplayerSocket(onlineLobby.roomId)
      let mpSocketOpenHandled = false
      const onMpSocketOpen = () => {
        if (mpSocketOpenHandled) return
        mpSocketOpenHandled = true
        debugMpLog('ws open')
        mpSocket?.send(
          JSON.stringify({
            type: 'hello',
            displayName: displayPlayerName(),
            role: onlineLobby.role,
            mapId: map.id,
          }),
        )
      }
      mpSocket.addEventListener('open', onMpSocketOpen)
      if (mpSocket.readyState === WebSocket.OPEN) {
        queueMicrotask(onMpSocketOpen)
      }
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
      mpSocket.addEventListener('close', () => {
        debugMpLog('ws close')
        if (leavingToLobby) return
        /* The match has already ended — both peers are on independent post-match UIs.
         * Don't auto-return either of them; the user will pick Requeue or Return-to-Lobby. */
        if (matchOutcome !== null) return
        if (peerSeenInRoom && lobby.mode === 'online') {
          showOpponentForfeitAndReturn()
          return
        }
        if (mpToast) {
          mpToast.textContent = 'Connection closed. Returning to lobby…'
          mpToast.hidden = false
          mpToast.classList.add('mp-toast--bad')
        }
        window.setTimeout(() => returnToLobbyReload(false), 900)
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

  matchEndLobbyBtnEl?.addEventListener('click', () => {
    returnToLobbyReload(isOnline && lobby.mode === 'online')
  })

  matchEndSecondaryBtnEl?.addEventListener('click', () => {
    const intent = currentMatchIntent()
    if (!intent) {
      returnToLobbyReload(isOnline && lobby.mode === 'online')
      return
    }
    try {
      const payload: StoredReplayIntent = { intent, mapId: lobby.mapId }
      sessionStorage.setItem(REPLAY_INTENT_KEY, JSON.stringify(payload))
    } catch {
      /* If storage is blocked, fall through to a normal lobby return. */
    }
    returnToLobbyReload(isOnline && lobby.mode === 'online')
  })

  leaveMatchCancelBtn?.addEventListener('click', () => hideLeaveMatchDialog())
  leaveMatchConfirmBtn?.addEventListener('click', () => {
    hideLeaveMatchDialog()
    returnToLobbyReload(lobby.mode === 'online')
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

  function syncGameHudVisibility(): void {
    gameRoot.classList.toggle('game-root--hide-hud', gameConfig.hideGameHud >= 0.5)
  }

  const tweaksHost = document.getElementById('tweaks-panel-host')
  if (tweaksHost) {
    tweaksHost.replaceChildren()
    mountTweaksPanel(tweaksHost, {
      controls,
      camera,
      ambient,
      sun,
      keysThatSkipRoundReset: [
        'hideGameHud',
        'hudDragLayoutEnabled',
        'uiHudMasterScale',
        'percentHudAnchorRight',
        'percentHudOffsetXRem',
        'percentHudOffsetYRem',
        'percentHudOffsetZPx',
        'percentHudScale',
        'percentHudTextScale',
        'percentHudTextOffsetXRem',
        'percentHudTextOffsetYRem',
        'percentHudPortraitScale',
        'tweaksPanelUiScale',
        'chargeHudRightRem',
        'chargeHudVerticalBiasRem',
        'chargeHudWidthRem',
        'chargeHudMaxHeightVh',
        'chargeHudScale',
        'chargeHudPctLabelLeftPct',
        'chargeHudPctLabelTopPct',
        'chargeHudPistolOverlayTopPct',
        'chargeHudPistolOverlayWidthPct',
        'chargeHudAmmoPopGapRem',
        'chargeHudAmmoPopTopPct',
        'chargeHudMinMarkLeftPct',
        'chargeHudMinMarkRightPct',
        'chargeHudMicEnabled',
        'chargeHudMicGapRem',
        'chargeHudMicWidthRem',
        'chargeHudMicTopOffsetRem',
        'chargeHudMicNoiseThresholdMul',
        'chargeHudMicRmsSpan',
        'chargeHudMicSmoothing',
        'chargeHudMicPulseScale',
        'lobbyMonkeyPosX',
        'lobbyMonkeyPosY',
        'lobbyMonkeyPosZ',
        'lobbyMonkeyPitchDeg',
        'lobbyMonkeyYawDeg',
        'lobbyMonkeyRollDeg',
        'lobbyMonkeyScale',
        'hideLobbyUi',
        'lobbyMonkeyFlatShading',
        'lobbyMonkeyTexPixelated',
        'lobbyMonkeyTexDownscale',
        'sunPosX',
        'sunPosY',
        'sunPosZ',
      ],
      syncVisualsFromConfig: () => {
        skyDome.syncFromConfig()
        applyLightingModeToScene(
          gameConfig.lightingUnlitMode >= 0.5,
          gameConfig.lightingUnlitSelfModel >= 0.5,
          gameConfig.lightingUnlitEnemyModel >= 0.5,
        )
        syncGameHudVisibility()
        syncUiHudChrome()
        syncTweaksPanelChrome()
        syncChargeHudLayout()
        syncHudDragChrome()
      },
      onToggle(open) {
        tweaksPanelOpen = open
        syncHudDragChrome()
        if (open) clearMovementKeys()
        if (!open) tryPointerLock()
      },
      onConfigChanged: scheduleRoundResetAfterTweak,
      onResetHudLayout: () => {
        resetGameplayHudLayout(percentHudEl, chargeBarWrap)
        syncChargeHudLayout()
        syncUiHudChrome()
      },
      onTriggerKnockbackDev: () => {
        if (multiplayerBlocksPlay()) return
        applyPeerMeleeHit(0.62, -0.74, { authoritative: true, victimPercent: playerPercent })
      },
      ...(TUTORIAL_ENABLED
        ? {
            onReplayTutorial: () => {
              if (multiplayerBlocksPlay() || isPvp()) return
              clearTutorialDone()
              void startTutorial(buildTutorialApi())
            },
          }
        : {}),
      ...(isOnline && lobby.mode === 'online'
        ? {
            onPracticeWithDummy: beginLobbyDummyPractice,
            onSoloVsBot: beginLobbySmartBot,
          }
        : {}),
    })
    attachHudOverlayDrag(percentHudEl, 'percentHud', {
      active: () => tweaksPanelOpen && gameConfig.hudDragLayoutEnabled >= 0.5,
    })
    attachHudOverlayDrag(chargeBarWrap, 'chargeHud', {
      active: () => tweaksPanelOpen && gameConfig.hudDragLayoutEnabled >= 0.5,
    })
    syncHudDragChrome()
    syncGameHudVisibility()
  }

  if (isOnline && lobby.mode === 'online' && lobby.role === 'host') {
    if (lobby.startWithSmartBot) void beginLobbySmartBot()
    else if (lobby.startWithDummyPractice) void beginLobbyDummyPractice()
  }

  /* === Tutorial bootstrap (offline only, per-tab via sessionStorage) ====== */

  function buildTutorialApi(): TutorialApi {
    return {
      getCharge: () => voiceChargeSmoothed,
      getMinChargeToFire: () => gameConfig.voiceMinChargeToFire,
      getVoiceShotsFired: () => tutorialVoiceShotsFired,
      getBotRingouts: () => tutorialBotRingouts,
      setEnemyPercent: (value: number) => {
        enemyPercent = Math.max(0, Math.min(999, value))
        syncHud()
      },
      unlockPointer: () => {
        try {
          controls.unlock()
        } catch {
          /* pointer lock not held; safe to ignore */
        }
      },
      lockPointer: () => {
        tryPointerLock()
      },
    }
  }

  ;(window as unknown as {
    vibejamStartTutorial?: () => void | Promise<void>
  }).vibejamStartTutorial = () => startTutorial(buildTutorialApi())

  if (
    !isOnline &&
    lobby.mode === 'offline' &&
    lobby.mapId === 'default' &&
    isTutorialPending()
  ) {
    /* Wait for the voice-resume countdown to clear so the welcome modal
     * doesn't fight the 3-2-1 overlay. */
    void (async () => {
      let guard = 0
      while (voiceResumeCountdownActive && guard < 200) {
        await sleepMs(120)
        guard += 1
      }
      await startTutorial(buildTutorialApi())
    })()
  }
}

loadUserSettings()
initBackgroundMusic()
wireBackgroundMusicToFirstGesture()
{
  const wrap = document.getElementById('user-settings-wrap')
  if (wrap) mountUserSettingsPanel({ root: wrap })
}

async function resolveLobbyAfterReload(): Promise<LobbyResult> {
  /* Drop any stale legacy rematch state from older builds. */
  clearLegacyRematchKey()

  const replay = takeReplayIntentOnLoad()
  if (replay) {
    const playerName = readStoredPlayerName()?.trim() || 'Angler'
    if (replay.intent === 'quickMatch') {
      /* Route requeue through the normal lobby gate with autoStart so the user sees
       * the same backdrop + queue overlay as if they had clicked Quick Match,
       * instead of staring at a black gameRoot for the full queue duration. */
      return runLobbyGate(playerName, {
        autoStart: { intent: 'quickMatch', mapId: replay.mapId },
      })
    }
    const lobby = buildLobbyFromIntent(replay.intent, replay.mapId)
    if (lobby) {
      gameRoot.classList.add('game-root--hud-suspended')
      gameRoot.hidden = false
      return lobby
    }
  }
  return runLobbyGate(readStoredPlayerName()?.trim() || 'Angler')
}

runUsernameGate()
  .then(() => resolveLobbyAfterReload())
  .then((lobby) => initGame(lobby))
  .catch((err) => {
    console.error('[vibejam] init failed', err)
  })
